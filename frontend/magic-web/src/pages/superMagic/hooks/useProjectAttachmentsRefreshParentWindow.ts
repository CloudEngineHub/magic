import { useEffect, useRef } from "react"
import { useMemoizedFn } from "ahooks"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import type { AttachmentItem } from "../components/TopicFilesButton/hooks"
import { resolveAttachmentsRefreshWaitersForProject } from "../services/attachmentsTopicSync"
import { projectAttachmentsChangeLog } from "../utils/projectAttachments/changeLogReporter"
import { markProjectAttachmentsLastUpdated } from "../utils/projectAttachments/lastUpdatedCache"
import {
	applyRefreshParentChildrenSubtree,
	applyRefreshParentFileItems,
	loadRefreshParentChildrenSubtreeFromV2,
	loadRefreshParentFileItemsFromV2,
	normalizeRefreshParentIds,
} from "../utils/projectAttachments/changeRealtimeUtils"

export interface ProjectAttachmentsChangeRealtimeData {
	tree: AttachmentItem[]
	list: AttachmentItem[]
	projectId: string
	source: "ws" | "fallback" | "refresh_parent_ids" | "parent_children_refresh"
	fallbackReason?: string
}

interface RefreshParentScheduleContext {
	parentIds: string[]
	traceId: string
	seqKeys: string[]
	lastUpdatedAt: string
}

interface UseProjectAttachmentsRefreshParentWindowOptions {
	projectId?: string
	store: ProjectFilesStore
	parentRefreshWindowMs: number
	onAttachmentsChange?: (data: ProjectAttachmentsChangeRealtimeData) => void
}

export function useProjectAttachmentsRefreshParentWindow({
	projectId,
	store,
	parentRefreshWindowMs,
	onAttachmentsChange,
}: UseProjectAttachmentsRefreshParentWindowOptions) {
	const currentProjectIdRef = useRef(projectId)
	const parentRefreshControllersRef = useRef<Set<AbortController>>(new Set())
	const parentRefreshWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const windowRefreshParentIdsRef = useRef<string[]>([])
	const windowRefreshSeqKeysRef = useRef<string[]>([])
	const windowRefreshTraceIdRef = useRef<string>("")
	const windowRefreshLastUpdatedAtRef = useRef<string>("")
	const parentChildrenRefreshWindowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const windowChildrenParentIdsRef = useRef<string[]>([])
	const windowChildrenSeqKeysRef = useRef<string[]>([])
	const windowChildrenTraceIdRef = useRef<string>("")
	const windowChildrenLastUpdatedAtRef = useRef<string>("")
	const onAttachmentsChangeRef = useRef(onAttachmentsChange)

	useEffect(() => {
		currentProjectIdRef.current = projectId
	}, [projectId])

	useEffect(() => {
		onAttachmentsChangeRef.current = onAttachmentsChange
	}, [onAttachmentsChange])

	// Clears the pending parent item refresh debounce window.
	const clearRefreshParentWindow = useMemoizedFn(() => {
		if (parentRefreshWindowTimerRef.current) {
			clearTimeout(parentRefreshWindowTimerRef.current)
			parentRefreshWindowTimerRef.current = null
		}
		windowRefreshParentIdsRef.current = []
		windowRefreshSeqKeysRef.current = []
		windowRefreshTraceIdRef.current = ""
		windowRefreshLastUpdatedAtRef.current = ""
	})

	// Clears the pending parent children reconcile debounce window.
	const clearRefreshParentChildrenWindow = useMemoizedFn(() => {
		if (parentChildrenRefreshWindowTimerRef.current) {
			clearTimeout(parentChildrenRefreshWindowTimerRef.current)
			parentChildrenRefreshWindowTimerRef.current = null
		}
		windowChildrenParentIdsRef.current = []
		windowChildrenSeqKeysRef.current = []
		windowChildrenTraceIdRef.current = ""
		windowChildrenLastUpdatedAtRef.current = ""
	})

	// Fetches and applies parent folder items only.
	const runRefreshParentItems = useMemoizedFn(async (context: RefreshParentScheduleContext) => {
		const refreshProjectId = projectId
		const parentIds = normalizeRefreshParentIds(context.parentIds)
		if (!refreshProjectId || parentIds.length === 0) return

		const controller = new AbortController()
		parentRefreshControllersRef.current.add(controller)
		try {
			const parentFileItems = await loadRefreshParentFileItemsFromV2({
				projectId: refreshProjectId,
				parentIds,
				signal: controller.signal,
				trace: {
					traceId: context.traceId,
					projectId: refreshProjectId,
					seqKeys: context.seqKeys,
					batchSize: parentIds.length,
				},
			})
			if (currentProjectIdRef.current !== refreshProjectId) {
				projectAttachmentsChangeLog.refreshParentIdsSkipped({
					projectId: refreshProjectId,
					parentIds,
					reason: "stale_project",
					traceId: context.traceId,
				})
				return
			}

			const result = applyRefreshParentFileItems({
				projectId: refreshProjectId,
				parentIds,
				parentFileItems,
				store,
				trace: {
					traceId: context.traceId,
					projectId: refreshProjectId,
					seqKeys: context.seqKeys,
					batchSize: parentIds.length,
				},
			})
			if (!result) return

			markProjectAttachmentsLastUpdated(refreshProjectId, context.lastUpdatedAt)
			resolveAttachmentsRefreshWaitersForProject(refreshProjectId)
			onAttachmentsChangeRef.current?.({
				tree: result.tree,
				list: result.list,
				projectId: refreshProjectId,
				source: "refresh_parent_ids",
			})
		} catch (error) {
			if (controller.signal.aborted) return
			if (currentProjectIdRef.current !== refreshProjectId) return
			projectAttachmentsChangeLog.refreshParentIdsError({
				projectId: refreshProjectId,
				parentIds,
				traceId: context.traceId,
				error,
			})
		} finally {
			parentRefreshControllersRef.current.delete(controller)
		}
	})

	// Fetches parent subtrees and reconciles missed child changes.
	const runRefreshParentChildren = useMemoizedFn(async (context: RefreshParentScheduleContext) => {
		const refreshProjectId = projectId
		const parentIds = normalizeRefreshParentIds(context.parentIds)
		if (!refreshProjectId || parentIds.length === 0) return

		const controller = new AbortController()
		parentRefreshControllersRef.current.add(controller)
		try {
			const serverItems = await loadRefreshParentChildrenSubtreeFromV2({
				projectId: refreshProjectId,
				parentIds,
				signal: controller.signal,
				trace: {
					traceId: context.traceId,
					projectId: refreshProjectId,
					seqKeys: context.seqKeys,
					batchSize: parentIds.length,
				},
			})
			if (currentProjectIdRef.current !== refreshProjectId) {
				projectAttachmentsChangeLog.refreshParentChildrenSkipped({
					projectId: refreshProjectId,
					parentIds,
					reason: "stale_project",
					traceId: context.traceId,
				})
				return
			}

			const result = applyRefreshParentChildrenSubtree({
				projectId: refreshProjectId,
				parentIds,
				serverItems,
				store,
				trace: {
					traceId: context.traceId,
					projectId: refreshProjectId,
					seqKeys: context.seqKeys,
					batchSize: parentIds.length,
				},
			})
			if (!result) return

			markProjectAttachmentsLastUpdated(refreshProjectId, context.lastUpdatedAt)
			resolveAttachmentsRefreshWaitersForProject(refreshProjectId)
			onAttachmentsChangeRef.current?.({
				tree: result.tree,
				list: result.list,
				projectId: refreshProjectId,
				source: "parent_children_refresh",
			})
		} catch (error) {
			if (controller.signal.aborted) return
			if (currentProjectIdRef.current !== refreshProjectId) return
			projectAttachmentsChangeLog.refreshParentChildrenError({
				projectId: refreshProjectId,
				parentIds,
				traceId: context.traceId,
				error,
			})
		} finally {
			parentRefreshControllersRef.current.delete(controller)
		}
	})

	// Schedules parent item refreshes inside the coalescing window.
	const scheduleRefreshParentIds = useMemoizedFn((context: RefreshParentScheduleContext) => {
		const parentIds = normalizeRefreshParentIds(context.parentIds)
		if (parentIds.length === 0) return

		// Coalesce parent item refreshes; refresh_parent_ids does not validate children.
		windowRefreshParentIdsRef.current = normalizeRefreshParentIds([
			...windowRefreshParentIdsRef.current,
			...parentIds,
		])
		windowRefreshSeqKeysRef.current = Array.from(
			new Set([...windowRefreshSeqKeysRef.current, ...context.seqKeys]),
		)
		windowRefreshTraceIdRef.current = windowRefreshTraceIdRef.current || context.traceId
		windowRefreshLastUpdatedAtRef.current =
			context.lastUpdatedAt || windowRefreshLastUpdatedAtRef.current

		if (parentRefreshWindowTimerRef.current) {
			clearTimeout(parentRefreshWindowTimerRef.current)
		}
		parentRefreshWindowTimerRef.current = setTimeout(() => {
			parentRefreshWindowTimerRef.current = null
			const pendingParentIds = windowRefreshParentIdsRef.current
			const pendingSeqKeys = windowRefreshSeqKeysRef.current
			const pendingTraceId = windowRefreshTraceIdRef.current
			const pendingLastUpdatedAt = windowRefreshLastUpdatedAtRef.current
			windowRefreshParentIdsRef.current = []
			windowRefreshSeqKeysRef.current = []
			windowRefreshTraceIdRef.current = ""
			windowRefreshLastUpdatedAtRef.current = ""

			void runRefreshParentItems({
				parentIds: pendingParentIds,
				traceId: pendingTraceId,
				seqKeys: pendingSeqKeys,
				lastUpdatedAt: pendingLastUpdatedAt,
			})
		}, parentRefreshWindowMs)
	})

	// Schedules parent children reconciles inside the coalescing window.
	const scheduleRefreshParentChildren = useMemoizedFn((context: RefreshParentScheduleContext) => {
		const parentIds = normalizeRefreshParentIds(context.parentIds)
		if (parentIds.length === 0) return

		// Coalesce subtree reconciles caused by file change bursts.
		windowChildrenParentIdsRef.current = normalizeRefreshParentIds([
			...windowChildrenParentIdsRef.current,
			...parentIds,
		])
		windowChildrenSeqKeysRef.current = Array.from(
			new Set([...windowChildrenSeqKeysRef.current, ...context.seqKeys]),
		)
		windowChildrenTraceIdRef.current = windowChildrenTraceIdRef.current || context.traceId
		windowChildrenLastUpdatedAtRef.current =
			context.lastUpdatedAt || windowChildrenLastUpdatedAtRef.current

		if (parentChildrenRefreshWindowTimerRef.current) {
			clearTimeout(parentChildrenRefreshWindowTimerRef.current)
		}
		parentChildrenRefreshWindowTimerRef.current = setTimeout(() => {
			parentChildrenRefreshWindowTimerRef.current = null
			const pendingParentIds = windowChildrenParentIdsRef.current
			const pendingSeqKeys = windowChildrenSeqKeysRef.current
			const pendingTraceId = windowChildrenTraceIdRef.current
			const pendingLastUpdatedAt = windowChildrenLastUpdatedAtRef.current
			windowChildrenParentIdsRef.current = []
			windowChildrenSeqKeysRef.current = []
			windowChildrenTraceIdRef.current = ""
			windowChildrenLastUpdatedAtRef.current = ""

			void runRefreshParentChildren({
				parentIds: pendingParentIds,
				traceId: pendingTraceId,
				seqKeys: pendingSeqKeys,
				lastUpdatedAt: pendingLastUpdatedAt,
			})
		}, parentRefreshWindowMs)
	})

	// Cancels pending windows and aborts in-flight parent refresh requests.
	const abortRefreshParentRequests = useMemoizedFn(() => {
		clearRefreshParentWindow()
		clearRefreshParentChildrenWindow()
		parentRefreshControllersRef.current.forEach((controller) => controller.abort())
		parentRefreshControllersRef.current.clear()
	})

	return {
		scheduleRefreshParentIds,
		scheduleRefreshParentChildren,
		clearRefreshParentWindow,
		clearRefreshParentChildrenWindow,
		abortRefreshParentRequests,
	}
}
