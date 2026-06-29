import type { SeqResponse } from "@/types/request"
import type {
	SuperMagicFileChangeItem,
	SuperMagicFileChangeMessage,
} from "@/types/chat/intermediate_message"
import type { ApplyProjectAttachmentsChangesResult } from "./changeReducer"
import {
	projectAttachmentsChangeLogger,
	type ProjectAttachmentsChangeTraceContext,
} from "./changeLogger"
import { getProjectAttachmentsChangeEventLogData } from "./changeEventParser"

export type { ProjectAttachmentsChangeTraceContext }

// Reporter maps business stages to debugging log fields.
// Main logic only calls projectAttachmentsChangeLog.xxx to keep payloads out of flows.
interface ProjectAttachmentsChangeBatchLogContext {
	projectId: string
	traceId: string
	seqKeys: string[]
	lastUpdatedAt: string
	changes: SuperMagicFileChangeItem[]
}

interface ProjectAttachmentsChangeFallbackLogContext {
	reason?: string
	traceId: string
	seqKeys: string[]
	lastUpdatedAt: string
}

interface ProjectAttachmentsChangeStoreApplyContext {
	trace?: ProjectAttachmentsChangeTraceContext
	changeCount: number
	beforeTreeCount?: number
	beforeListCount?: number
	afterTreeCount?: number
	afterListCount?: number
	result?: ApplyProjectAttachmentsChangesResult
}

export const projectAttachmentsChangeLog = {
	createTraceId(projectId?: string, seed?: string) {
		return projectAttachmentsChangeLogger.createTraceId(projectId, seed)
	},

	// Intermediate layer: whether backend/WS messages reached frontend dispatch.
	intermediateReceived(seq: SeqResponse<SuperMagicFileChangeMessage>) {
		const seqData = getProjectAttachmentsChangeEventLogData(seq)
		projectAttachmentsChangeLogger.log("intermediate_file_change_received", {
			projectId: seqData.message_project_id,
			workspaceId: seqData.workspace_id,
			topicId: seqData.topic_id,
			seqId: seqData.seq_id,
			messageId: seqData.message_id,
			timestamp: seqData.timestamp,
			changeCount: seqData.change_count,
		})
	},

	intermediatePublished(seq: SeqResponse<SuperMagicFileChangeMessage>) {
		projectAttachmentsChangeLogger.log("intermediate_file_change_published", {
			projectId: seq?.message?.project_id,
			seqId: seq?.seq_id,
			messageId: seq?.message_id,
		})
	},

	// Subscription layer: whether the page has an active file-change subscription.
	subscriptionSkipped(projectId: string | undefined, enabled: boolean) {
		projectAttachmentsChangeLogger.log(
			"subscription_skipped",
			{ projectId, enabled, reason: !projectId ? "missing_project_id" : "disabled" },
			{ level: "warn" },
		)
	},

	subscriptionStarted(projectId: string, enabled: boolean) {
		projectAttachmentsChangeLogger.log("subscription_started", { projectId, enabled })
	},

	subscriptionStopped(projectId: string) {
		projectAttachmentsChangeLogger.log("subscription_stopped", { projectId })
	},

	// WS hook layer: received, ignored, deduped, or queued.
	wsReceived(params: {
		projectId?: string
		enabled: boolean
		seq: SeqResponse<SuperMagicFileChangeMessage>
		dedupeKey: string
		traceId: string
	}) {
		const { projectId, enabled, seq, dedupeKey, traceId } = params
		projectAttachmentsChangeLogger.log(
			"ws_event_received",
			{
				current_project_id: projectId,
				...getProjectAttachmentsChangeEventLogData(seq),
				dedupe_key: dedupeKey,
				enabled,
			},
			{ traceId },
		)
	},

	wsIgnored(
		reason: string,
		params: {
			projectId?: string
			enabled?: boolean
			seq?: SeqResponse<SuperMagicFileChangeMessage>
			dedupeKey?: string
			traceId: string
			level?: "debug" | "warn"
		},
	) {
		projectAttachmentsChangeLogger.log(
			"ws_event_ignored",
			{
				reason,
				current_project_id: params.projectId,
				...(params.seq ? getProjectAttachmentsChangeEventLogData(params.seq) : {}),
				dedupe_key: params.dedupeKey,
				enabled: params.enabled,
			},
			{ traceId: params.traceId, level: params.level || "warn" },
		)
	},

	wsQueued(params: {
		projectId: string
		dedupeKey: string
		changeCount: number
		pendingChangeCount: number
		pendingSeqKeys: string[]
		lastUpdatedAt: string
		traceId: string
	}) {
		projectAttachmentsChangeLogger.log(
			"ws_event_queued",
			{
				projectId: params.projectId,
				dedupe_key: params.dedupeKey,
				change_count: params.changeCount,
				pending_change_count: params.pendingChangeCount,
				pending_seq_keys: params.pendingSeqKeys,
				last_updated_at: params.lastUpdatedAt,
			},
			{ traceId: params.traceId },
		)
	},

	flushScheduled(params: {
		projectId?: string
		debounceMs: number
		pendingChangeCount: number
		pendingSeqKeys: string[]
		traceId: string
	}) {
		projectAttachmentsChangeLogger.log(
			"flush_scheduled",
			{
				projectId: params.projectId,
				debounce_ms: params.debounceMs,
				pending_change_count: params.pendingChangeCount,
				pending_seq_keys: params.pendingSeqKeys,
			},
			{ traceId: params.traceId, level: "debug" },
		)
	},

	flushSkippedEmptyBatch(projectId: string, traceId: string) {
		projectAttachmentsChangeLogger.log(
			"flush_skipped_empty_batch",
			{ projectId },
			{ traceId, level: "warn" },
		)
	},

	applyDeferredDuringFallback(params: {
		projectId: string
		traceId: string
		pendingChangeCount: number
		pendingSeqKeys: string[]
	}) {
		projectAttachmentsChangeLogger.log(
			"apply_deferred_during_fallback",
			{
				projectId: params.projectId,
				pending_change_count: params.pendingChangeCount,
				pending_seq_keys: params.pendingSeqKeys,
			},
			{ traceId: params.traceId, level: "debug" },
		)
	},

	// Apply layer: whether a batch committed to store or triggered fallback.
	flushStart(context: ProjectAttachmentsChangeBatchLogContext) {
		projectAttachmentsChangeLogger.log(
			"flush_start",
			{
				projectId: context.projectId,
				change_count: context.changes.length,
				seq_keys: context.seqKeys,
				last_updated_at: context.lastUpdatedAt,
			},
			{ traceId: context.traceId },
		)
	},

	applyError(context: ProjectAttachmentsChangeBatchLogContext, error: unknown) {
		projectAttachmentsChangeLogger.log(
			"apply_error",
			{
				projectId: context.projectId,
				change_count: context.changes.length,
				seq_keys: context.seqKeys,
			},
			{ traceId: context.traceId, level: "error", error },
		)
	},

	applyRequestedFallback(
		context: ProjectAttachmentsChangeBatchLogContext,
		result: ApplyProjectAttachmentsChangesResult,
	) {
		projectAttachmentsChangeLogger.log(
			"apply_requested_fallback",
			{
				projectId: context.projectId,
				fallback_reason: result.fallbackReason || "",
				applied_count: result.appliedCount,
				skipped_count: result.skippedCount,
				seq_keys: context.seqKeys,
			},
			{ traceId: context.traceId, level: "warn" },
		)
	},

	applySuccess(
		context: ProjectAttachmentsChangeBatchLogContext,
		result: ApplyProjectAttachmentsChangesResult,
	) {
		projectAttachmentsChangeLogger.log(
			"apply_success",
			{
				projectId: context.projectId,
				applied_count: result.appliedCount,
				skipped_count: result.skippedCount,
				tree_count: result.tree.length,
				list_count: result.list.length,
				last_updated_at: context.lastUpdatedAt,
			},
			{ traceId: context.traceId },
		)
	},

	fallbackStart(projectId: string, context: ProjectAttachmentsChangeFallbackLogContext) {
		projectAttachmentsChangeLogger.log(
			"fallback_refresh_start",
			{
				projectId,
				reason: context.reason || "",
				seq_keys: context.seqKeys,
			},
			{ traceId: context.traceId, level: "warn" },
		)
	},

	fallbackSuccess(
		projectId: string,
		context: ProjectAttachmentsChangeFallbackLogContext,
		counts: { treeCount: number; listCount: number },
	) {
		projectAttachmentsChangeLogger.log(
			"fallback_refresh_success",
			{
				projectId,
				reason: context.reason || "",
				tree_count: counts.treeCount,
				list_count: counts.listCount,
				last_updated_at: context.lastUpdatedAt,
			},
			{ traceId: context.traceId },
		)
	},

	fallbackSkippedStaleProject(
		projectId: string,
		currentProjectId: string | undefined,
		context: ProjectAttachmentsChangeFallbackLogContext,
	) {
		projectAttachmentsChangeLogger.log(
			"fallback_refresh_skipped_stale_project",
			{
				projectId,
				current_project_id: currentProjectId,
				reason: context.reason || "",
				seq_keys: context.seqKeys,
			},
			{ traceId: context.traceId, level: "debug" },
		)
	},

	fallbackError(
		projectId: string,
		context: ProjectAttachmentsChangeFallbackLogContext,
		error: unknown,
	) {
		projectAttachmentsChangeLogger.log(
			"fallback_refresh_error",
			{
				projectId,
				reason: context.reason || "",
			},
			{ traceId: context.traceId, level: "error", error },
		)
	},

	refreshParentIdsStart(params: {
		projectId: string
		parentIds: string[]
		traceId?: string
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_ids_start",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
			},
			{ traceId: params.traceId },
		)
	},

	refreshParentIdsSkipped(params: {
		projectId: string
		parentIds: string[]
		reason: string
		traceId?: string
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_ids_skipped",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
				reason: params.reason,
			},
			{ traceId: params.traceId, level: "debug" },
		)
	},

	refreshParentIdsSuccess(params: {
		projectId: string
		parentIds: string[]
		treeCount: number
		listCount: number
		traceId?: string
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_ids_success",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
				tree_count: params.treeCount,
				list_count: params.listCount,
			},
			{ traceId: params.traceId },
		)
	},

	refreshParentIdsError(params: {
		projectId: string
		parentIds: string[]
		traceId?: string
		error: unknown
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_ids_error",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
			},
			{ traceId: params.traceId, level: "error", error: params.error },
		)
	},

	refreshParentChildrenStart(params: {
		projectId: string
		parentIds: string[]
		traceId?: string
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_children_start",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
			},
			{ traceId: params.traceId },
		)
	},

	refreshParentChildrenSkipped(params: {
		projectId: string
		parentIds: string[]
		reason: string
		traceId?: string
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_children_skipped",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
				reason: params.reason,
			},
			{ traceId: params.traceId, level: "debug" },
		)
	},

	refreshParentChildrenSuccess(params: {
		projectId: string
		parentIds: string[]
		changeCount: number
		treeCount: number
		listCount: number
		traceId?: string
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_children_success",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
				change_count: params.changeCount,
				tree_count: params.treeCount,
				list_count: params.listCount,
			},
			{ traceId: params.traceId },
		)
	},

	refreshParentChildrenError(params: {
		projectId: string
		parentIds: string[]
		traceId?: string
		error: unknown
	}) {
		projectAttachmentsChangeLogger.log(
			"refresh_parent_children_error",
			{
				projectId: params.projectId,
				parent_ids: params.parentIds,
			},
			{ traceId: params.traceId, level: "error", error: params.error },
		)
	},

	// Store layer: reducer input size and final tree/list commit result.
	storeApplyStart(context: ProjectAttachmentsChangeStoreApplyContext) {
		projectAttachmentsChangeLogger.log(
			"store_apply_start",
			{
				projectId: context.trace?.projectId,
				change_count: context.changeCount,
				seq_keys: context.trace?.seqKeys,
				batch_size: context.trace?.batchSize,
				workspace_file_tree_count_before: context.beforeTreeCount,
				workspace_files_list_count_before: context.beforeListCount,
			},
			{ traceId: context.trace?.traceId },
		)
	},

	storeApplyFinish(context: ProjectAttachmentsChangeStoreApplyContext) {
		if (!context.result) return
		projectAttachmentsChangeLogger.log(
			"store_apply_finish",
			{
				projectId: context.trace?.projectId,
				change_count: context.changeCount,
				applied_count: context.result.appliedCount,
				skipped_count: context.result.skippedCount,
				fallback_required: context.result.fallbackRequired,
				fallback_reason: context.result.fallbackReason || "",
				operation_counts: context.result.operationCounts,
				workspace_file_tree_count_after: context.afterTreeCount,
				workspace_files_list_count_after: context.afterListCount,
			},
			{
				traceId: context.trace?.traceId,
				level: context.result.fallbackRequired ? "warn" : "info",
			},
		)
	},
}
