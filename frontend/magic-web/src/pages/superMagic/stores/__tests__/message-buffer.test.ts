import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	MessageCommittedEvent,
	TopicExecutionEndedEvent,
} from "@/pages/superMagic/stores/events"
import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
	type SuperMagicNode,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_A = "topic-buffer-a"
const TOPIC_B = "topic-buffer-b"
const RENDER_SETTLE_MS = 3_000

interface ProjectedNode {
	app_message_id?: string
	super_message_id?: string
	role?: string
	status?: string
	content?: string | null
	correlation_id?: string
	tool_call_id?: string
	tool?: {
		id?: string
		status?: string
	}
}

interface EnvelopeOptions {
	topicId?: string
	appMessageId: string
	correlationId: string
	superMessageId?: string
	seqId: string
	content?: string
	role?: "assistant" | "tool" | "user"
	status?: string
	outerStatus?: ConversationMessageStatus
	event?: string
	toolCallId?: string
}

interface MutableEnvelope {
	type?: unknown
	seq: Record<string, unknown>
}

function createEnvelope({
	topicId = TOPIC_A,
	appMessageId,
	correlationId,
	superMessageId = `super-${appMessageId}`,
	seqId,
	content = "message",
	role = "assistant",
	status = "finished",
	outerStatus = ConversationMessageStatus.Read,
	event,
	toolCallId = "tool-1",
}: EnvelopeOptions): RawSuperMagicMessageEnvelope {
	const resolvedSuperMessageId = role === "user" ? appMessageId : superMessageId
	const node: SuperMagicNode = {
		role,
		topic_id: topicId,
		message_id: `node-${appMessageId}`,
		super_message_id: resolvedSuperMessageId,
		correlation_id: correlationId,
		content,
		reasoning_content: "",
		status,
		event,
		send_timestamp: Number(seqId.replace(/\D/g, "")) || 1,
	}
	if (role === "tool") {
		node.tool_call_id = toolCallId
		node.tool = {
			id: toolCallId,
			name: "read_file",
			status: "finished",
			detail: { type: "json", data: { ok: true } },
			attachments: [],
		}
	}

	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-1",
			seq_id: seqId,
			message_id: `server-${seqId}-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: role === "tool" ? "tool-runner" : "assistant-1",
				send_time: Number(seqId.replace(/\D/g, "")) || 1,
				status: outerStatus,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function cloneEnvelope(envelope: RawSuperMagicMessageEnvelope): RawSuperMagicMessageEnvelope {
	return JSON.parse(JSON.stringify(envelope)) as RawSuperMagicMessageEnvelope
}

function mutateEnvelope(
	envelope: RawSuperMagicMessageEnvelope,
	mutate: (draft: MutableEnvelope) => void,
): RawSuperMagicMessageEnvelope {
	const draft = cloneEnvelope(envelope) as unknown as MutableEnvelope
	mutate(draft)
	return draft as unknown as RawSuperMagicMessageEnvelope
}

function createStore(activeTopicId = TOPIC_A): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(activeTopicId)
	return store
}

function settleRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function getNode(store: SuperMagicStore, superMessageId: string): ProjectedNode | undefined {
	const directNode = store.getMessageNode(superMessageId)
	const projectedBySuperMessageId = Array.from(store.messages.values())
		.flatMap((messages) => Array.from(messages))
		.find((message) => message.super_message_id === superMessageId)
	const node = directNode ?? projectedBySuperMessageId
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function collectArrivals(
	store: SuperMagicStore,
	topicId = TOPIC_A,
): {
	events: MessageCommittedEvent[]
	unsubscribe: () => void
} {
	const events: MessageCommittedEvent[] = []
	const unsubscribe = store.subscribe("message.committed", (event) => events.push(event), {
		scope: { topicId },
	})
	return { events, unsubscribe }
}

function collectDomainEvents(store: SuperMagicStore): {
	events: TopicExecutionEndedEvent[]
	unsubscribe: () => void
} {
	const events: TopicExecutionEndedEvent[] = []
	const unsubscribe = store.subscribe("topic.execution.ended", (event) => events.push(event))
	return { events, unsubscribe }
}

function createFinalOnlyAssistant({
	topicId = TOPIC_A,
	appMessageId = "blocking-assistant",
	correlationId = "blocking-correlation",
	superMessageId = "blocking-super-message",
	seqId = "1",
}: {
	topicId?: string
	appMessageId?: string
	correlationId?: string
	superMessageId?: string
	seqId?: string
} = {}): RawSuperMagicMessageEnvelope {
	return createEnvelope({
		topicId,
		appMessageId,
		correlationId,
		superMessageId,
		seqId,
		content: "x".repeat(50_000),
		status: "finished",
	})
}

function startBlockingAssistantStream(
	store: SuperMagicStore,
	{
		topicId = TOPIC_A,
		appMessageId = "blocking-assistant",
		correlationId = "blocking-correlation",
		superMessageId = "blocking-super-message",
		seqId = "1",
		event,
	}: {
		topicId?: string
		appMessageId?: string
		correlationId?: string
		superMessageId?: string
		seqId?: string
		event?: string
	} = {},
): void {
	const content = "x".repeat(50_000)
	const createBlockingChunk = (
		chunkCorrelationId: string,
		chunkSuperMessageId: string,
	): SuperMagicChunkMessage => ({
		magic_message_id: `magic-chunk-${chunkCorrelationId}`,
		app_message_id: `app-chunk-${chunkCorrelationId}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: topicId,
		chat_topic_id: topicId,
		message_id: `completion-${chunkCorrelationId}`,
		super_magic_chunk: {
			super_message_id: chunkSuperMessageId,
			task_id: `task-${chunkCorrelationId}`,
			i: 0,
			usage: null,
			correlation_id: chunkCorrelationId,
			choices: [
				{
					...({ index: 0 } as const),
					finish_reason: null,
					delta: {
						content,
						role: "assistant",
						tool_calls: [],
						reasoning_content: "",
						index: 0,
					},
				},
			],
		},
	})

	// 第一个真实流持有 topic timer；第二个真实流因 timer 已存在而只建立 StreamState，
	// 它的 Final 才会真实进入 buffer 等待，避免用旧版 Final-only 伪流式制造假阻塞。
	store.receiveChunk(
		createBlockingChunk(`${correlationId}-timer-owner`, `${superMessageId}-timer-owner`),
	)
	store.receiveChunk(createBlockingChunk(correlationId, superMessageId))
	store.enqueueMessage(
		topicId,
		createEnvelope({
			topicId,
			appMessageId,
			correlationId,
			superMessageId,
			seqId,
			content,
			status: "finished",
			event,
		}),
	)
}

function arrivalSeqIds(
	events: MessageCommittedEvent[],
	ignoredAppMessageIds: string[] = [],
): string[] {
	return events
		.filter((event) => !ignoredAppMessageIds.includes(event.payload.message.appMessageId || ""))
		.map((event) => event.payload.message.seqId || "")
}

describe("SuperMagicStore / Message Buffer", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("buffer 中同一 super_message_id 的同一协议消息重复入队。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const envelope = createEnvelope({
			appMessageId: "duplicate-app",
			correlationId: "duplicate-correlation",
			seqId: "100",
			content: "canonical",
		})

		store.enqueueMessage(TOPIC_A, envelope)
		store.enqueueMessage(TOPIC_A, cloneEnvelope(envelope))
		settleRendering()

		expect(
			arrivals.events.filter(
				(event) => event.payload.message.appMessageId === "duplicate-app",
			),
		).toHaveLength(1)
		expect(getNode(store, "super-duplicate-app")?.content).toBe("canonical")
		arrivals.unsubscribe()
	})

	it("buffer 中同一个 super_message_id 的不同 appMessageId 按高 seq 收敛。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "app-old",
				superMessageId: "shared-super-message",
				correlationId: "old-correlation",
				seqId: "100",
				content: "old",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "app-new",
				superMessageId: "shared-super-message",
				correlationId: "new-correlation",
				seqId: "101",
				content: "new",
			}),
		)
		settleRendering()

		expect(getNode(store, "shared-super-message")).toMatchObject({
			app_message_id: "app-new",
			super_message_id: "shared-super-message",
			correlation_id: "new-correlation",
			content: "new",
		})
		expect(
			(store.messages.get(TOPIC_A) || []).filter(
				(message) =>
					message.role === "assistant" &&
					message.super_message_id === "shared-super-message",
			),
		).toEqual([
			expect.objectContaining({
				app_message_id: "app-new",
			}),
		])
	})

	it("`isProcessing=true` 后异常返回，未恢复为 false。", () => {
		const store = createStore()
		const throwingEnvelope = createEnvelope({
			appMessageId: "throwing-message",
			correlationId: "throwing-correlation",
			seqId: "100",
		})
		const message = (throwingEnvelope as unknown as MutableEnvelope).seq.message
		if (!message || typeof message !== "object") throw new Error("invalid fixture")
		Object.defineProperty(message, "super_magic_message", {
			configurable: true,
			get() {
				throw new Error("fixture processing failure")
			},
		})

		try {
			store.enqueueMessage(TOPIC_A, throwingEnvelope)
		} catch (error) {
			expect(error).toBeInstanceOf(Error)
		}

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "after-error",
				correlationId: "after-error-correlation",
				seqId: "101",
				content: "still processed",
			}),
		)
		settleRendering()

		expect(getNode(store, "super-after-error")?.content).toBe("still processed")
	})

	it("Final-only 不创建 timer，也不进入 streaming。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const finalOnly = createFinalOnlyAssistant()

		store.enqueueMessage(TOPIC_A, finalOnly)

		expect(getNode(store, "blocking-super-message")?.content).toBe("x".repeat(50_000))
		expect(store.getStreamState(TOPIC_A, "blocking-correlation")).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
		settleRendering(500)

		expect(
			arrivals.events.filter(
				(event) => event.payload.message.appMessageId === "blocking-assistant",
			),
		).toHaveLength(1)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		arrivals.unsubscribe()
	})

	it("队头 assistant 永不完成，后续消息永久阻塞。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)

		startBlockingAssistantStream(store)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "message-after-blocker",
				correlationId: "correlation-after-blocker",
				seqId: "2",
				content: "must not starve",
			}),
		)
		settleRendering(32)

		expect(getNode(store, "super-message-after-blocker")?.content).toBe("must not starve")
		expect(
			store.messages
				.get(TOPIC_A)
				?.some((message) => message.app_message_id === "message-after-blocker"),
		).toBe(true)
		expect(store.messageMap.get("super-message-after-blocker")).toBeDefined()
		expect(
			arrivals.events.filter(
				(event) => event.payload.message.appMessageId === "message-after-blocker",
			),
		).toHaveLength(1)
		arrivals.unsubscribe()
	})

	it("tool response 被排在永不完成的 assistant 后面。", () => {
		const store = createStore()

		startBlockingAssistantStream(store)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "tool-after-blocker",
				correlationId: "blocking-correlation",
				seqId: "2",
				role: "tool",
				toolCallId: "tool-after-blocker",
			}),
		)
		settleRendering(32)

		expect(getNode(store, "super-tool-after-blocker")?.tool).toMatchObject({
			id: "tool-after-blocker",
			status: "finished",
		})
	})

	it("tool response 已写入 toolResponseMap，但消息列表迟迟没有该 tool message。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)

		startBlockingAssistantStream(store)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "visible-tool-message",
				correlationId: "blocking-correlation",
				seqId: "2",
				role: "tool",
				toolCallId: "visible-tool",
			}),
		)
		settleRendering(32)

		expect(getNode(store, "super-visible-tool-message")?.role).toBe("tool")
		expect(
			arrivals.events.some(
				(event) => event.payload.message.appMessageId === "visible-tool-message",
			),
		).toBe(true)
		arrivals.unsubscribe()
	})

	it("buffer 中消息顺序与 seqId 顺序不一致。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		startBlockingAssistantStream(store)

		for (const seqId of ["30", "10", "20"]) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `message-${seqId}`,
					correlationId: `correlation-${seqId}`,
					seqId,
					role: "tool",
					toolCallId: `tool-${seqId}`,
				}),
			)
		}
		settleRendering(100)

		// Topic listeners observe raw canonical arrival order. UI/Store projection is
		// independently sorted by seq_id after each message is committed.
		expect(arrivalSeqIds(arrivals.events, ["blocking-assistant"])).toEqual(["30", "10", "20"])
		expect(
			(store.messages.get(TOPIC_A) || [])
				.filter((message) => message.role === "tool")
				.map((message) => message.seq_id),
		).toEqual(["10", "20", "30"])
		arrivals.unsubscribe()
	})

	it("buffer 到达顺序正确，但 `sortMessages()` 重排错误。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		startBlockingAssistantStream(store)

		for (const seqId of ["2", "10", "11"]) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `sorted-${seqId}`,
					correlationId: `sorted-correlation-${seqId}`,
					seqId,
					role: "tool",
					toolCallId: `sorted-tool-${seqId}`,
				}),
			)
		}
		settleRendering(100)

		expect(arrivalSeqIds(arrivals.events, ["blocking-assistant"])).toEqual(["2", "10", "11"])
		expect(
			(store.messages.get(TOPIC_A) || [])
				.filter((message) => message.role === "tool")
				.map((message) => message.seq_id),
		).toEqual(["2", "10", "11"])
		arrivals.unsubscribe()
	})

	it.each([
		{
			label: "历史撤回后存在普通消息",
			statuses: [ConversationMessageStatus.Revoked, ConversationMessageStatus.Read],
		},
		{
			label: "末尾存在连续撤回段",
			statuses: [
				ConversationMessageStatus.Read,
				ConversationMessageStatus.Revoked,
				ConversationMessageStatus.Revoked,
			],
		},
		{
			label: "历史撤回和当前撤回段同时存在",
			statuses: [
				ConversationMessageStatus.Revoked,
				ConversationMessageStatus.Read,
				ConversationMessageStatus.Revoked,
			],
		},
	])("Canonical replace 在$label时保留全部消息事实。", ({ statuses }) => {
		const store = createStore()
		const envelopes = statuses.map((outerStatus, index) =>
			createEnvelope({
				appMessageId: `revoked-canonical-${index}`,
				correlationId: `revoked-canonical-correlation-${index}`,
				seqId: String(index + 1),
				role: "user",
				outerStatus,
			}),
		)

		store.initializeMessages(TOPIC_A, envelopes, { mode: "replace" })
		settleRendering()

		expect((store.messages.get(TOPIC_A) || []).map((message) => message.status)).toEqual(
			statuses,
		)
	})

	it("批量 replace 与逐条 merge 对同一组撤回状态产生相同 Canonical 成员。", () => {
		const createInitialMessages = () =>
			["1", "2", "3"].map((seqId) =>
				createEnvelope({
					appMessageId: `revoked-equivalence-${seqId}`,
					correlationId: `revoked-equivalence-correlation-${seqId}`,
					seqId,
					role: "user",
				}),
			)
		const createRevokedRevision = (seqId: string) =>
			createEnvelope({
				appMessageId: `revoked-equivalence-${seqId}`,
				correlationId: `revoked-equivalence-correlation-${seqId}`,
				seqId,
				role: "user",
				outerStatus: ConversationMessageStatus.Revoked,
			})
		const initialMessages = createInitialMessages()
		const expectedSnapshot = [
			initialMessages[0],
			createRevokedRevision("2"),
			createRevokedRevision("3"),
		]

		const batchStore = createStore()
		batchStore.initializeMessages(TOPIC_A, expectedSnapshot, { mode: "replace" })
		settleRendering()

		const incrementalStore = createStore()
		incrementalStore.initializeMessages(TOPIC_A, createInitialMessages(), { mode: "replace" })
		incrementalStore.initializeMessages(TOPIC_A, [createRevokedRevision("2")], {
			mode: "merge",
		})
		incrementalStore.initializeMessages(TOPIC_A, [createRevokedRevision("3")], {
			mode: "merge",
		})
		settleRendering()

		const projectMembership = (store: SuperMagicStore) =>
			(store.messages.get(TOPIC_A) || []).map((message) => ({
				appMessageId: message.app_message_id,
				status: message.status,
			}))

		expect(projectMembership(incrementalStore)).toEqual(projectMembership(batchStore))
		expect(projectMembership(batchStore)).toEqual([
			{ appMessageId: "revoked-equivalence-1", status: ConversationMessageStatus.Read },
			{ appMessageId: "revoked-equivalence-2", status: ConversationMessageStatus.Revoked },
			{ appMessageId: "revoked-equivalence-3", status: ConversationMessageStatus.Revoked },
		])
	})

	it("seqId 缺失。", () => {
		const store = createStore()
		const missingSeq = mutateEnvelope(
			createEnvelope({
				appMessageId: "missing-seq",
				correlationId: "missing-seq-correlation",
				seqId: "100",
			}),
			(draft) => {
				delete draft.seq.seq_id
			},
		)

		expect(() => store.enqueueMessage(TOPIC_A, missingSeq)).not.toThrow()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "valid-after-missing-seq",
				correlationId: "valid-after-missing-seq-correlation",
				seqId: "101",
				content: "valid",
			}),
		)
		settleRendering()

		expect(getNode(store, "super-valid-after-missing-seq")?.content).toBe("valid")
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("101")
	})

	it("seqId 重复。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "same-seq-a",
				correlationId: "same-seq-correlation-a",
				seqId: "100",
				content: "A",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "same-seq-b",
				correlationId: "same-seq-correlation-b",
				seqId: "100",
				content: "B",
			}),
		)
		settleRendering()

		expect(getNode(store, "super-same-seq-a")?.content).toBe("A")
		expect(getNode(store, "super-same-seq-b")?.content).toBe("B")
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
	})

	it("seqId 是超大数字字符串。", () => {
		const store = createStore()
		const hugeSeqId = "900719925474099312345678901234567890"

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "huge-seq",
				correlationId: "huge-seq-correlation",
				seqId: hugeSeqId,
			}),
		)
		settleRendering()

		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe(hugeSeqId)
		expect(getNode(store, "super-huge-seq")).toBeDefined()
	})

	it("seqId 带本地后缀，例如 `_timestamp`。", () => {
		const store = createStore()
		const localSeqId = "101_1700000000000"

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "server-seq",
				correlationId: "server-seq-correlation",
				seqId: "100",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "local-seq",
				correlationId: "local-seq-correlation",
				seqId: localSeqId,
			}),
		)
		settleRendering()

		expect(getNode(store, "super-local-seq")).toBeDefined()
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe(localSeqId)
	})

	it("使用字符串 `localeCompare()` 导致数字顺序异常。", () => {
		const store = createStore()

		for (const seqId of ["2", "10", "9"]) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `numeric-${seqId}`,
					correlationId: `numeric-correlation-${seqId}`,
					seqId,
				}),
			)
		}
		settleRendering()

		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("10")
	})

	it("finalized assistant 的 buffer 副本未被丢弃。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const finalEnvelope = createEnvelope({
			appMessageId: "finalized-app",
			correlationId: "finalized-correlation",
			seqId: "100",
			content: "canonical final",
		})

		store.enqueueMessage(TOPIC_A, finalEnvelope)
		store.enqueueMessage(TOPIC_A, cloneEnvelope(finalEnvelope))
		store.enqueueMessage(TOPIC_A, cloneEnvelope(finalEnvelope))
		settleRendering()

		expect(
			arrivals.events.filter(
				(event) => event.payload.message.correlationId === "finalized-correlation",
			),
		).toHaveLength(1)
		expect(getNode(store, "super-finalized-app")?.content).toBe("canonical final")
		arrivals.unsubscribe()
	})

	it("同一 super_message_id 的高 seq Assistant revision 不得被旧 correlation 终态误丢弃。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "first-final",
				superMessageId: "reused-final-super-message",
				correlationId: "first-final-correlation",
				seqId: "100",
				content: "first final",
			}),
		)
		settleRendering()
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "corrected-final",
				superMessageId: "reused-final-super-message",
				correlationId: "corrected-final-correlation",
				seqId: "101",
				content: "corrected authoritative final",
			}),
		)
		settleRendering()

		expect(getNode(store, "reused-final-super-message")?.content).toBe(
			"corrected authoritative final",
		)
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("101")
	})

	it("processMessageBuffer 递归处理大量消息造成长任务。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		const messageCount = 300

		expect(() => {
			for (let index = 1; index <= messageCount; index += 1) {
				store.enqueueMessage(
					TOPIC_A,
					createEnvelope({
						appMessageId: `bulk-tool-${index}`,
						correlationId: "bulk-correlation",
						seqId: String(index),
						role: "tool",
						toolCallId: `bulk-tool-${index}`,
					}),
				)
			}
		}).not.toThrow()
		settleRendering(1_000)

		expect(arrivals.events).toHaveLength(messageCount)
		expect(getNode(store, `super-bulk-tool-${messageCount}`)).toBeDefined()
		arrivals.unsubscribe()
	})

	it("buffer 长期增长而没有清理。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)

		for (let index = 1; index <= 100; index += 1) {
			store.enqueueMessage(
				TOPIC_A,
				createEnvelope({
					appMessageId: `cleanup-${index}`,
					correlationId: "cleanup-correlation",
					seqId: String(index),
					role: "tool",
					toolCallId: `cleanup-tool-${index}`,
				}),
			)
		}
		settleRendering(1_000)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "cleanup-sentinel",
				correlationId: "cleanup-sentinel-correlation",
				seqId: "101",
				content: "sentinel",
			}),
		)
		settleRendering()

		expect(arrivals.events).toHaveLength(101)
		expect(getNode(store, "super-cleanup-sentinel")?.content).toBe("sentinel")
		arrivals.unsubscribe()
	})

	it("topic 被删除后 buffer 仍保留。", () => {
		const store = createStore()
		const arrivals = collectArrivals(store)
		startBlockingAssistantStream(store)
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "",
			}),
		).toBe(true)
		store.setActiveTopicId(null)
		settleRendering()

		expect(getNode(store, "blocking-super-message")).toBeUndefined()
		expect(arrivals.events).toHaveLength(0)
		arrivals.unsubscribe()
	})

	it("切换 topic 时旧 buffer 继续产生领域事件。", () => {
		const store = createStore()
		const domainEvents = collectDomainEvents(store)

		startBlockingAssistantStream(store, {
			appMessageId: "old-topic-task",
			correlationId: "old-topic-correlation",
			seqId: "100",
			event: "task_finished",
		})
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(
			TOPIC_B,
			createEnvelope({
				topicId: TOPIC_B,
				appMessageId: "active-topic-message",
				correlationId: "active-topic-correlation",
				seqId: "101",
				content: "active",
			}),
		)
		settleRendering()

		expect(domainEvents.events.some((event) => event.meta.topicId === TOPIC_A)).toBe(true)
		expect(domainEvents.events.some((event) => event.meta.topicId === TOPIC_B)).toBe(true)
		expect(getNode(store, "super-active-topic-message")?.content).toBe("active")
		domainEvents.unsubscribe()
	})
})
