import { makeAutoObservable } from "mobx"
import localstorage from "@/utils/localstorage"
import { platformKey } from "@/utils/storage"
import { userStore } from "@/models/user"
import type { PendingUserMessageEnvelope } from "./types"

const OPTIMISTIC_MESSAGE_STORAGE_ROOT = "super_magic/optimistic_messages"
const MAX_STORED_OPTIMISTIC_MESSAGE_COUNT = 50
const ACK_TIMEOUT_MS = 10 * 1000
const sendingTimeouts = new Map<string, ReturnType<typeof window.setTimeout>>()

interface StoredOptimisticMessages {
	topics?: OptimisticMessage.TopicOptimisticMap
}

interface StoredPendingMessages {
	topics?: Record<string, Record<string, PendingUserMessageEnvelope>>
}

export namespace OptimisticMessage {
	/** Optimistic send status; describes user message send lifecycle only, never written to the main message store. */
	export const Status = {
		Sending: "sending",
		Failed: "failed",
	} as const
	export type Status = (typeof Status)[keyof typeof Status]

	/** Sidecar status record; pending_message is only used for refresh recovery, not as a UI message source. */
	export interface StatusRecord {
		status: Status
		created_at?: number
		last_attempt_at?: number
		anchor_message_id?: string
		anchor_seq_id?: string
		pending_message?: PendingUserMessageEnvelope
	}

	/** Locates the same user message by topic and message id in the v2 main store. */
	export interface StatusPayload {
		chat_topic_id: string
		app_message_id: string
		created_at?: number
		last_attempt_at?: number
		anchor_message_id?: string
		anchor_seq_id?: string
		pending_message?: PendingUserMessageEnvelope
	}

	/** Identifies the User message that currently anchors revoke-edit mode for one topic. */
	export interface RevokedAnchorPayload {
		chat_topic_id: string
		seq_id: string
	}

	export interface RevokedAnchor {
		seq_id: string
	}

	/** In-memory structure of topicOptimisticMap: chat_topic_id -> app_message_id -> sidecar. */
	export type TopicOptimisticMap = Record<string, Record<string, StatusRecord>>
}

function getSendingTimeoutKey(chat_topic_id: string, app_message_id: string) {
	// ACK timeout is uniquely keyed by topic + app_message_id to prevent timer collisions across topics.
	return `${chat_topic_id}:${app_message_id}`
}

function clearSendingTimeout(chat_topic_id: string, app_message_id: string) {
	// Clears timer on server takeover, failure, or sidecar removal to prevent stale callbacks.
	const timeoutKey = getSendingTimeoutKey(chat_topic_id, app_message_id)
	const timeoutId = sendingTimeouts.get(timeoutKey)
	if (!timeoutId) return

	window.clearTimeout(timeoutId)
	sendingTimeouts.delete(timeoutKey)
}

function getAttemptAt(record: OptimisticMessage.StatusRecord) {
	// last_attempt_at represents the most recent send/retry time; created_at is only a fallback for legacy records.
	return record.last_attempt_at || record.created_at || 0
}

function isExpiredSending(record: OptimisticMessage.StatusRecord, now = Date.now()) {
	// On refresh recovery, only expire sending records beyond the ACK window to avoid premature failure.
	return (
		record.status === OptimisticMessage.Status.Sending &&
		Boolean(getAttemptAt(record)) &&
		now - getAttemptAt(record) >= ACK_TIMEOUT_MS
	)
}

function getStorageKey() {
	// Optimistic snapshots are isolated by user and org to prevent cross-account recovery.
	const userInfo = userStore.user.userInfo
	const userId = userInfo?.magic_id || userInfo?.user_id
	if (!userId) return undefined

	return platformKey(
		`${OPTIMISTIC_MESSAGE_STORAGE_ROOT}/${userId}/${userInfo?.organization_code || "unknown"}`,
	)
}

function getPendingMessageSessionStorageKey() {
	const storageKey = getStorageKey()
	if (!storageKey) return undefined
	return `${storageKey}/pending_messages`
}

function normalizeTopicOptimisticMap(
	topicOptimisticMap: OptimisticMessage.TopicOptimisticMap,
): OptimisticMessage.TopicOptimisticMap {
	// Trim local failed messages by global timeline to prevent localStorage bloat.
	const flattened = Object.entries(topicOptimisticMap).flatMap(([chat_topic_id, topicMessages]) =>
		Object.entries(topicMessages || {}).map(([app_message_id, record]) => ({
			chat_topic_id,
			app_message_id,
			record,
		})),
	)

	return flattened
		.sort((a, b) => (b.record.created_at || 0) - (a.record.created_at || 0))
		.slice(0, MAX_STORED_OPTIMISTIC_MESSAGE_COUNT)
		.reduce<OptimisticMessage.TopicOptimisticMap>((acc, item) => {
			acc[item.chat_topic_id] = {
				...(acc[item.chat_topic_id] || {}),
				[item.app_message_id]: item.record,
			}
			return acc
		}, {})
}

function loadStoredOptimisticMap(): OptimisticMessage.TopicOptimisticMap {
	const storageKey = getStorageKey()
	if (!storageKey) return {}

	const parsed = localstorage.get(storageKey, true) as StoredOptimisticMessages
	const topics = parsed?.topics || {}

	// On cold start, only converge sending records past the ACK window to failed; others keep waiting.
	const now = Date.now()
	return normalizeTopicOptimisticMap(
		Object.entries(topics).reduce<OptimisticMessage.TopicOptimisticMap>(
			(acc, [chat_topic_id, topicMessages]) => {
				acc[chat_topic_id] = Object.entries(topicMessages || {}).reduce<
					Record<string, OptimisticMessage.StatusRecord>
				>((topicAcc, [app_message_id, record]) => {
					topicAcc[app_message_id] = {
						...record,
						status: isExpiredSending(record, now)
							? OptimisticMessage.Status.Failed
							: record.status,
					}
					return topicAcc
				}, {})
				return acc
			},
			{},
		),
	)
}

function loadStoredPendingMessages(): Record<string, Record<string, PendingUserMessageEnvelope>> {
	const storageKey = getPendingMessageSessionStorageKey()
	if (!storageKey) return {}

	try {
		const parsed = JSON.parse(
			window.sessionStorage.getItem(storageKey) || "{}",
		) as StoredPendingMessages
		return parsed?.topics || {}
	} catch (error) {
		console.error("Failed to load optimistic pending messages from sessionStorage", error)
		return {}
	}
}

function saveStoredOptimisticMap(topicOptimisticMap: OptimisticMessage.TopicOptimisticMap) {
	const storageKey = getStorageKey()
	if (!storageKey) return
	const pendingStorageKey = getPendingMessageSessionStorageKey()

	const normalizedTopics = normalizeTopicOptimisticMap(topicOptimisticMap)
	if (Object.keys(normalizedTopics).length === 0) {
		localstorage.remove(storageKey)
		if (pendingStorageKey) window.sessionStorage.removeItem(pendingStorageKey)
		return
	}

	// localStorage only stores metadata needed for recovery ordering and status; message body is excluded.
	const safeTopics = Object.entries(
		normalizedTopics,
	).reduce<OptimisticMessage.TopicOptimisticMap>((acc, [chat_topic_id, topicMessages]) => {
		acc[chat_topic_id] = Object.entries(topicMessages || {}).reduce<
			Record<string, OptimisticMessage.StatusRecord>
		>((topicAcc, [app_message_id, record]) => {
			const safeRecord = { ...record }
			delete safeRecord.pending_message
			topicAcc[app_message_id] = safeRecord
			return topicAcc
		}, {})
		return acc
	}, {})

	localstorage.set(storageKey, {
		topics: safeTopics,
	})

	// pending_message is stored in sessionStorage only, ensuring same-tab refresh recovery
	// while avoiding long-term plaintext storage in localStorage.
	if (!pendingStorageKey) return

	const pendingTopics = Object.entries(normalizedTopics).reduce<
		Record<string, Record<string, PendingUserMessageEnvelope>>
	>((acc, [chat_topic_id, topicMessages]) => {
		const pendingMessages = Object.entries(topicMessages || {}).reduce<
			Record<string, PendingUserMessageEnvelope>
		>((topicAcc, [app_message_id, record]) => {
			if (record.pending_message) {
				topicAcc[app_message_id] = record.pending_message
			}
			return topicAcc
		}, {})

		if (Object.keys(pendingMessages).length > 0) {
			acc[chat_topic_id] = pendingMessages
		}
		return acc
	}, {})

	if (Object.keys(pendingTopics).length === 0) {
		window.sessionStorage.removeItem(pendingStorageKey)
		return
	}

	try {
		window.sessionStorage.setItem(
			pendingStorageKey,
			JSON.stringify({
				topics: pendingTopics,
			}),
		)
	} catch (error) {
		console.error("Failed to save optimistic pending messages to sessionStorage", error)
	}
}

export function createOptimisticMessageStore() {
	// Hidden failed optimistic messages during revoke-edit mode only affect current page display;
	// intentionally kept outside MobX observables to avoid extra message list recomputation on set/clear.
	const hiddenRevokedOptimisticMap: Record<string, string[]> = {}

	/** Optimistic store only drives send status; persisted snapshots are written back to SuperMagicStore on recovery. */
	const store = {
		topicOptimisticMap: {} as OptimisticMessage.TopicOptimisticMap,
		activeRevokedAnchorMap: {} as Record<string, OptimisticMessage.RevokedAnchor>,
		hydratedStorageKey: undefined as string | undefined,

		/** Reads local snapshot on first topic entry; only converges expired sending to failed. */
		hydrateFromStorage() {
			const storageKey = getStorageKey()
			if (!storageKey || store.hydratedStorageKey === storageKey) return

			if (store.hydratedStorageKey && store.hydratedStorageKey !== storageKey) {
				store.topicOptimisticMap = {}
			}

			const storedTopicOptimisticMap = loadStoredOptimisticMap()
			const storedPendingMessages = loadStoredPendingMessages()
			store.topicOptimisticMap = Object.entries(storedTopicOptimisticMap).reduce(
				(acc, [chat_topic_id, topicMessages]) => {
					acc[chat_topic_id] = Object.entries(topicMessages || {}).reduce<
						Record<string, OptimisticMessage.StatusRecord>
					>(
						(topicAcc, [app_message_id, record]) => {
							topicAcc[app_message_id] = {
								...record,
								pending_message:
									storedPendingMessages[chat_topic_id]?.[app_message_id] ||
									record.pending_message,
							}
							return topicAcc
						},
						{
							...(acc[chat_topic_id] || {}),
						},
					)
					return acc
				},
				{ ...store.topicOptimisticMap } as OptimisticMessage.TopicOptimisticMap,
			)
			store.hydratedStorageKey = storageKey
			store.scheduleSendingTimeouts()
			saveStoredOptimisticMap(store.topicOptimisticMap)
		},

		/** Schedules ACK timeouts for recovered sending messages; transitions to failed if not taken over by history. */
		scheduleSendingTimeouts() {
			Object.entries(store.topicOptimisticMap).forEach(([chat_topic_id, topicMessages]) => {
				Object.entries(topicMessages || {}).forEach(([app_message_id, record]) => {
					store.scheduleSendingTimeout(chat_topic_id, app_message_id, record)
				})
			})
		},

		/** ACK timeout scheduling for a single sending message; timer is proactively cleared on server takeover. */
		scheduleSendingTimeout(
			chat_topic_id: string,
			app_message_id: string,
			record: OptimisticMessage.StatusRecord,
		) {
			if (record.status !== OptimisticMessage.Status.Sending) {
				clearSendingTimeout(chat_topic_id, app_message_id)
				return
			}

			const attemptAt = getAttemptAt(record)
			if (!attemptAt) return

			const remainingMs = attemptAt + ACK_TIMEOUT_MS - Date.now()
			if (remainingMs <= 0) {
				store.markFailed({ chat_topic_id, app_message_id })
				return
			}

			clearSendingTimeout(chat_topic_id, app_message_id)
			const timeoutId = window.setTimeout(() => {
				store.markFailed({ chat_topic_id, app_message_id })
			}, remainingMs)
			sendingTimeouts.set(getSendingTimeoutKey(chat_topic_id, app_message_id), timeoutId)
		},

		/** After a direct message enters the v2 main store, attaches sending status to the same app_message_id. */
		markSending({
			chat_topic_id,
			app_message_id,
			created_at,
			last_attempt_at,
			anchor_message_id,
			anchor_seq_id,
			pending_message,
		}: OptimisticMessage.StatusPayload) {
			store.hydrateFromStorage()
			const attemptAt = last_attempt_at || created_at || Date.now()
			const nextRecord = {
				status: OptimisticMessage.Status.Sending,
				created_at: created_at || attemptAt,
				last_attempt_at: attemptAt,
				anchor_message_id,
				anchor_seq_id,
				pending_message,
			}
			store.topicOptimisticMap[chat_topic_id] = {
				...(store.topicOptimisticMap[chat_topic_id] || {}),
				[app_message_id]: nextRecord,
			}
			store.scheduleSendingTimeout(chat_topic_id, app_message_id, nextRecord)
			saveStoredOptimisticMap(store.topicOptimisticMap)
		},

		/** Updates the existing sidecar to failed when the send request was not dispatched or failed. */
		markFailed({ chat_topic_id, app_message_id }: OptimisticMessage.StatusPayload) {
			store.hydrateFromStorage()
			const currentRecord = store.topicOptimisticMap[chat_topic_id]?.[app_message_id]
			store.topicOptimisticMap[chat_topic_id] = {
				...(store.topicOptimisticMap[chat_topic_id] || {}),
				[app_message_id]: {
					...currentRecord,
					status: OptimisticMessage.Status.Failed,
				},
			}
			clearSendingTimeout(chat_topic_id, app_message_id)
			saveStoredOptimisticMap(store.topicOptimisticMap)
		},

		/** Removes the sidecar status for a specific message; called after main message deletion or server takeover. */
		remove({ chat_topic_id, app_message_id }: OptimisticMessage.StatusPayload) {
			store.hydrateFromStorage()
			const topicMessages = store.topicOptimisticMap[chat_topic_id]
			if (!topicMessages?.[app_message_id]) return

			const { [app_message_id]: removedMessage, ...nextTopicMessages } = topicMessages
			void removedMessage
			store.topicOptimisticMap[chat_topic_id] = nextTopicMessages
			clearSendingTimeout(chat_topic_id, app_message_id)
			saveStoredOptimisticMap(store.topicOptimisticMap)
		},

		/** Before removing a failed message, re-anchors dependent optimistic messages to the previous anchor point. */
		reanchorDependentsBeforeMessageRemoval({
			chat_topic_id,
			app_message_id,
		}: OptimisticMessage.StatusPayload) {
			store.hydrateFromStorage()
			const topicMessages = store.topicOptimisticMap[chat_topic_id]
			const removedRecord = topicMessages?.[app_message_id]
			if (!topicMessages || !removedRecord) return

			const nextTopicMessages = Object.entries(topicMessages).reduce<
				Record<string, OptimisticMessage.StatusRecord>
			>((acc, [messageId, record]) => {
				if (messageId === app_message_id) {
					acc[messageId] = record
					return acc
				}

				const isAnchoredToRemovedMessage =
					record.anchor_message_id === app_message_id ||
					(Boolean(removedRecord.anchor_seq_id) &&
						record.anchor_seq_id === removedRecord.anchor_seq_id)

				acc[messageId] = isAnchoredToRemovedMessage
					? {
							...record,
							anchor_message_id: removedRecord.anchor_message_id,
							anchor_seq_id: removedRecord.anchor_seq_id,
						}
					: record
				return acc
			}, {})

			store.topicOptimisticMap[chat_topic_id] = nextTopicMessages
			saveStoredOptimisticMap(store.topicOptimisticMap)
		},

		/** Removes the corresponding sidecar status after server takeover of a user message. */
		confirm(payload: OptimisticMessage.StatusPayload) {
			store.remove(payload)
		},

		/** UI queries sidecar status by topic and message id; does not read or persist message body. */
		getStatus(chat_topic_id?: string, app_message_id?: string) {
			if (!chat_topic_id || !app_message_id) return undefined
			return store.topicOptimisticMap[chat_topic_id]?.[app_message_id]?.status
		},

		/** Keeps the selected User boundary stable while HTTP message statuses are converging. */
		setActiveRevokedAnchor({ chat_topic_id, seq_id }: OptimisticMessage.RevokedAnchorPayload) {
			if (!chat_topic_id || !seq_id) return
			store.activeRevokedAnchorMap = {
				...store.activeRevokedAnchorMap,
				[chat_topic_id]: { seq_id },
			}
		},

		/** Returns the current revoke-edit User boundary without changing Canonical messages. */
		getActiveRevokedAnchor(chat_topic_id?: string) {
			if (!chat_topic_id) return undefined
			return store.activeRevokedAnchorMap[chat_topic_id]
		},

		/** Clears the UI-only boundary after restore, confirmation, or removal from the topic. */
		clearActiveRevokedAnchor(chat_topic_id?: string) {
			if (!chat_topic_id || !store.activeRevokedAnchorMap[chat_topic_id]) return
			const nextActiveRevokedAnchorMap = { ...store.activeRevokedAnchorMap }
			delete nextActiveRevokedAnchorMap[chat_topic_id]
			store.activeRevokedAnchorMap = nextActiveRevokedAnchorMap
		},

		/** Records failed optimistic messages to temporarily hide when entering revoke-edit mode. */
		setHiddenRevokedOptimisticMessageIds({
			chat_topic_id,
			app_message_ids,
		}: {
			chat_topic_id: string
			app_message_ids: string[]
		}) {
			if (!chat_topic_id) return
			hiddenRevokedOptimisticMap[chat_topic_id] = Array.from(
				new Set(app_message_ids.filter(Boolean)),
			)
		},

		/** MessageList reads the current topic hidden set, used to hide failed messages in revoke-edit mode. */
		getHiddenRevokedOptimisticMessageIds(chat_topic_id?: string) {
			if (!chat_topic_id) return []
			return hiddenRevokedOptimisticMap[chat_topic_id] || []
		},

		/** Clears the temporary hidden set for the current topic after cancel-revoke or successful send. */
		clearHiddenRevokedOptimisticMessageIds(chat_topic_id?: string) {
			if (!chat_topic_id) return
			delete hiddenRevokedOptimisticMap[chat_topic_id]
		},

		/** Returns restorable local user message snapshots for the current topic; caller is responsible for writing back to SuperMagicStore. */
		getRestorableMessages(chat_topic_id?: string) {
			if (!chat_topic_id) return []
			store.hydrateFromStorage()

			return Object.entries(store.topicOptimisticMap[chat_topic_id] || {})
				.filter(([, record]) => Boolean(record.pending_message))
				.sort(([, prevRecord], [, nextRecord]) => {
					return (prevRecord.created_at || 0) - (nextRecord.created_at || 0)
				})
				.map(([app_message_id, record]) => ({
					app_message_id,
					created_at: record.created_at,
					anchor_message_id: record.anchor_message_id,
					anchor_seq_id: record.anchor_seq_id,
					pending_message: record.pending_message as PendingUserMessageEnvelope,
				}))
		},
	}

	return makeAutoObservable(store, {}, { autoBind: true })
}

export const optimisticMessageStore = createOptimisticMessageStore()
