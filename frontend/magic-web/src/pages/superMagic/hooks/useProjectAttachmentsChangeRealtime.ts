import { useEffect, useRef } from "react"
import { useMemoizedFn } from "ahooks"
import type { SeqResponse } from "@/types/request"
import type {
	SuperMagicFileChangeItem,
	SuperMagicFileChangeMessage,
} from "@/types/chat/intermediate_message"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import projectFilesStoreDefault, { ProjectFilesStore } from "@/stores/projectFiles"
import { resolveAttachmentsRefreshWaitersForProject } from "../services/attachmentsTopicSync"
import { projectAttachmentsChangeLog } from "../utils/projectAttachments/changeLogReporter"
import { markProjectAttachmentsLastUpdated } from "../utils/projectAttachments/lastUpdatedCache"
import {
	DEFAULT_PROJECT_ATTACHMENTS_CHANGE_DEBOUNCE_MS,
	DEFAULT_PROJECT_ATTACHMENTS_PARENT_REFRESH_WINDOW_MS,
	collectFileChangeParentRefreshIds,
	loadProjectAttachmentsSingleflight,
	normalizeRefreshParentIds,
	resolveProjectAttachmentsChangeEvent,
} from "../utils/projectAttachments/changeRealtimeUtils"
import { resolveProjectAttachmentMutationWaiters } from "../utils/projectAttachments/attachmentMutationWaiter"
import {
	useProjectAttachmentsRefreshParentWindow,
	type ProjectAttachmentsChangeRealtimeData,
} from "./useProjectAttachmentsRefreshParentWindow"

interface UseProjectAttachmentsChangeRealtimeOptions {
	projectId?: string
	enabled?: boolean
	store?: ProjectFilesStore
	debounceMs?: number
	parentRefreshWindowMs?: number
	onAttachmentsChange?: (data: ProjectAttachmentsChangeRealtimeData) => void
	onFallbackError?: (error: unknown, projectId: string) => void
}

export function useProjectAttachmentsChangeRealtime({
	projectId,
	enabled = true,
	store = projectFilesStoreDefault,
	debounceMs = DEFAULT_PROJECT_ATTACHMENTS_CHANGE_DEBOUNCE_MS,
	parentRefreshWindowMs = DEFAULT_PROJECT_ATTACHMENTS_PARENT_REFRESH_WINDOW_MS,
	onAttachmentsChange,
	onFallbackError,
}: UseProjectAttachmentsChangeRealtimeOptions) {
	// Merge seqs within the debounce window, then apply once to reduce MobX commits.
	const pendingChangesRef = useRef<SuperMagicFileChangeItem[]>([])
	const pendingSeqKeysRef = useRef<string[]>([])
	const pendingRefreshParentIdsRef = useRef<string[]>([])
	const pendingTraceIdRef = useRef<string>("")
	const pendingLastUpdatedAtRef = useRef<string>("")
	const parentMissingRetryCountRef = useRef(0)
	const currentProjectIdRef = useRef(projectId)
	// Pause WS incremental apply while parent_missing waits for a full-refresh fallback.
	const fallbackRefreshInFlightRef = useRef(false)
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const onAttachmentsChangeRef = useRef(onAttachmentsChange)
	const onFallbackErrorRef = useRef(onFallbackError)

	useEffect(() => {
		currentProjectIdRef.current = projectId
	}, [projectId])

	useEffect(() => {
		onAttachmentsChangeRef.current = onAttachmentsChange
	}, [onAttachmentsChange])

	useEffect(() => {
		onFallbackErrorRef.current = onFallbackError
	}, [onFallbackError])

	const {
		scheduleRefreshParentIds,
		scheduleRefreshParentChildren,
		clearRefreshParentWindow,
		clearRefreshParentChildrenWindow,
		abortRefreshParentRequests,
	} = useProjectAttachmentsRefreshParentWindow({
		projectId,
		store,
		parentRefreshWindowMs,
		onAttachmentsChange,
	})

	const runFallbackRefresh = useMemoizedFn(
		async (context: {
			reason?: string
			traceId: string
			seqKeys: string[]
			lastUpdatedAt: string
			changes: SuperMagicFileChangeItem[]
		}) => {
			const fallbackProjectId = projectId
			if (!fallbackProjectId) {
				fallbackRefreshInFlightRef.current = false
				return
			}
			const { reason, traceId, lastUpdatedAt } = context
			fallbackRefreshInFlightRef.current = true
			projectAttachmentsChangeLog.fallbackStart(fallbackProjectId, context)

			try {
				// Fallback realigns the frontend tree with a full attachment load.
				const res = await loadProjectAttachmentsSingleflight(fallbackProjectId)
				if (currentProjectIdRef.current !== fallbackProjectId) {
					projectAttachmentsChangeLog.fallbackSkippedStaleProject(
						fallbackProjectId,
						currentProjectIdRef.current,
						context,
					)
					return
				}

				store.setWorkspaceFileTree(res.tree)
				markProjectAttachmentsLastUpdated(fallbackProjectId, lastUpdatedAt)
				projectAttachmentsChangeLog.fallbackSuccess(fallbackProjectId, context, {
					treeCount: res.tree.length,
					listCount: res.list.length,
				})
				resolveProjectAttachmentMutationWaiters({
					projectId: fallbackProjectId,
					store,
					changes: context.changes,
					source: "fallback",
				})
				onAttachmentsChangeRef.current?.({
					tree: res.tree,
					list: res.list,
					projectId: fallbackProjectId,
					source: "fallback",
					fallbackReason: reason,
				})
			} catch (error) {
				if (currentProjectIdRef.current !== fallbackProjectId) return
				projectAttachmentsChangeLog.fallbackError(fallbackProjectId, context, error)
				onFallbackErrorRef.current?.(error, fallbackProjectId)
			} finally {
				fallbackRefreshInFlightRef.current = false
				if (pendingTraceIdRef.current === traceId) {
					pendingTraceIdRef.current = ""
				}
				if (pendingLastUpdatedAtRef.current === lastUpdatedAt) {
					pendingLastUpdatedAtRef.current = ""
				}
				if (
					currentProjectIdRef.current === fallbackProjectId &&
					(pendingChangesRef.current.length || pendingRefreshParentIdsRef.current.length)
				) {
					scheduleFlush()
				}
			}
		},
	)

	const flushPendingChanges = useMemoizedFn(() => {
		if (!projectId) return
		if (fallbackRefreshInFlightRef.current) {
			projectAttachmentsChangeLog.applyDeferredDuringFallback({
				projectId,
				traceId: pendingTraceIdRef.current,
				pendingChangeCount: pendingChangesRef.current.length,
				pendingSeqKeys: pendingSeqKeysRef.current,
			})
			return
		}
		const changes = pendingChangesRef.current
		const seqKeys = pendingSeqKeysRef.current
		const refreshParentIds = pendingRefreshParentIdsRef.current
		const traceId = pendingTraceIdRef.current
		const lastUpdatedAt = pendingLastUpdatedAtRef.current
		pendingChangesRef.current = []
		pendingSeqKeysRef.current = []
		pendingRefreshParentIdsRef.current = []
		// Clear pending before apply/fallback; events during apply enter the next trace.
		pendingTraceIdRef.current = ""
		pendingLastUpdatedAtRef.current = ""
		if (changes.length === 0 && refreshParentIds.length === 0) {
			projectAttachmentsChangeLog.flushSkippedEmptyBatch(projectId, traceId)
			return
		}

		const batchLogContext = { projectId, traceId, seqKeys, lastUpdatedAt, changes }
		projectAttachmentsChangeLog.flushStart(batchLogContext)

		if (changes.length === 0) {
			scheduleRefreshParentIds({
				parentIds: refreshParentIds,
				traceId,
				seqKeys,
				lastUpdatedAt,
			})
			return
		}

		const workspaceFilesListBeforeApply = store.workspaceFilesList
		let result: ReturnType<typeof store.applyFileChanges>
		try {
			result = store.applyFileChanges(changes, {
				trace: {
					traceId,
					projectId,
					seqKeys,
					batchSize: changes.length,
				},
			})
		} catch (error) {
			projectAttachmentsChangeLog.applyError(batchLogContext, error)
			throw error
		}
		if (result.fallbackRequired) {
			// Parent/child events may arrive close together; retry once before full refresh.
			if (
				result.fallbackReason === "parent_missing" &&
				parentMissingRetryCountRef.current < 2
			) {
				parentMissingRetryCountRef.current += 1
				pendingChangesRef.current = [...changes, ...pendingChangesRef.current]
				pendingSeqKeysRef.current = [...seqKeys, ...pendingSeqKeysRef.current]
				pendingRefreshParentIdsRef.current = normalizeRefreshParentIds([
					...refreshParentIds,
					...pendingRefreshParentIdsRef.current,
				])
				pendingTraceIdRef.current = traceId
				pendingLastUpdatedAtRef.current = lastUpdatedAt
				scheduleFlush()
				return
			}

			parentMissingRetryCountRef.current = 0
			projectAttachmentsChangeLog.applyRequestedFallback(batchLogContext, result)
			fallbackRefreshInFlightRef.current = true
			clearRefreshParentWindow()
			clearRefreshParentChildrenWindow()
			// Fallback is async but uses this batch's fixed trace/seq/lastUpdated.
			void runFallbackRefresh({
				reason: result.fallbackReason,
				traceId,
				seqKeys,
				lastUpdatedAt,
				changes,
			})
			return
		}

		parentMissingRetryCountRef.current = 0
		markProjectAttachmentsLastUpdated(projectId, lastUpdatedAt)
		// Treat WS apply as refresh completion for legacy waiters.
		resolveAttachmentsRefreshWaitersForProject(projectId)
		resolveProjectAttachmentMutationWaiters({
			projectId,
			store,
			changes,
			source: "ws",
		})
		projectAttachmentsChangeLog.applySuccess(batchLogContext, result)
		onAttachmentsChangeRef.current?.({
			tree: result.tree,
			list: result.list,
			projectId,
			source: "ws",
		})
		// File changes reconcile the parent subtree; refresh_parent_ids only updates parent items.
		const childrenRefreshParentIds = collectFileChangeParentRefreshIds(
			changes,
			workspaceFilesListBeforeApply,
		)
		const itemOnlyRefreshParentIds = normalizeRefreshParentIds(refreshParentIds).filter(
			(parentId: string) => !childrenRefreshParentIds.includes(parentId),
		)
		scheduleRefreshParentIds({
			parentIds: itemOnlyRefreshParentIds,
			traceId,
			seqKeys,
			lastUpdatedAt,
		})
		scheduleRefreshParentChildren({
			parentIds: childrenRefreshParentIds,
			traceId,
			seqKeys,
			lastUpdatedAt,
		})
	})

	const scheduleFlush = useMemoizedFn(() => {
		if (timerRef.current) clearTimeout(timerRef.current)
		projectAttachmentsChangeLog.flushScheduled({
			projectId,
			debounceMs,
			pendingChangeCount: pendingChangesRef.current.length,
			pendingSeqKeys: pendingSeqKeysRef.current,
			traceId: pendingTraceIdRef.current,
		})
		// A short debounce balances realtime updates with render/sort cost.
		timerRef.current = setTimeout(() => {
			timerRef.current = null
			flushPendingChanges()
		}, debounceMs)
	})

	const handleFileChangeIntermediate = useMemoizedFn(
		(seq: SeqResponse<SuperMagicFileChangeMessage>) => {
			// Resolver handles logging, project match, empty changes, and duplicate seqs.
			const resolvedEvent = resolveProjectAttachmentsChangeEvent({
				seq,
				projectId,
				enabled,
				store,
				currentTraceId: pendingTraceIdRef.current,
			})
			if (!resolvedEvent) return

			const { messageData, dedupeKey, traceId, projectId: eventProjectId } = resolvedEvent
			const changes = Array.isArray(messageData.changes) ? messageData.changes : []

			pendingTraceIdRef.current = pendingTraceIdRef.current || traceId
			pendingChangesRef.current = [...pendingChangesRef.current, ...changes]
			pendingSeqKeysRef.current = [...pendingSeqKeysRef.current, dedupeKey]
			pendingRefreshParentIdsRef.current = normalizeRefreshParentIds([
				...pendingRefreshParentIdsRef.current,
				...normalizeRefreshParentIds(messageData.refresh_parent_ids),
			])
			pendingLastUpdatedAtRef.current =
				messageData.timestamp || pendingLastUpdatedAtRef.current
			projectAttachmentsChangeLog.wsQueued({
				projectId: eventProjectId,
				dedupeKey,
				changeCount: changes.length,
				pendingChangeCount: pendingChangesRef.current.length,
				pendingSeqKeys: pendingSeqKeysRef.current,
				lastUpdatedAt: pendingLastUpdatedAtRef.current,
				traceId: pendingTraceIdRef.current,
			})
			scheduleFlush()
		},
	)

	useEffect(() => {
		if (!enabled || !projectId) {
			projectAttachmentsChangeLog.subscriptionSkipped(projectId, enabled)
			return undefined
		}

		projectAttachmentsChangeLog.subscriptionStarted(projectId, enabled)

		pubsub.subscribe(
			PubSubEvents.Super_Magic_File_Change_Intermediate,
			handleFileChangeIntermediate,
		)

		return () => {
			projectAttachmentsChangeLog.subscriptionStopped(projectId)
			pubsub.unsubscribe(
				PubSubEvents.Super_Magic_File_Change_Intermediate,
				handleFileChangeIntermediate,
			)
			if (timerRef.current) {
				clearTimeout(timerRef.current)
				timerRef.current = null
			}
			abortRefreshParentRequests()
			// Drop unflushed batches on project switch or unmount.
			pendingChangesRef.current = []
			pendingSeqKeysRef.current = []
			pendingRefreshParentIdsRef.current = []
			pendingTraceIdRef.current = ""
			pendingLastUpdatedAtRef.current = ""
			parentMissingRetryCountRef.current = 0
			fallbackRefreshInFlightRef.current = false
		}
	}, [enabled, handleFileChangeIntermediate, projectId])
}
