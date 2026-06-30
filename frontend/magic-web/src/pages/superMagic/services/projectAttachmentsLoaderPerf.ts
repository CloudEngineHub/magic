import { manualPerfLogger } from "@/utils/manualPerfLogger"
import type { ProjectAttachmentsV2Diagnostics } from "../utils/projectAttachments/v2Adapter"
import type {
	ProjectAttachmentsBatchSnapshotPayload,
	ProjectAttachmentsFallbackReason,
	ProjectAttachmentsLoadResult,
	ProjectAttachmentsLoadStrategy,
} from "./projectAttachmentsLoader"

type BatchSnapshotMetricPayload = Pick<
	ProjectAttachmentsBatchSnapshotPayload,
	"phase" | "level" | "projectId"
> & {
	tree?: unknown[]
	list?: unknown[]
}

type BatchSnapshotCandidatePayload = Pick<BatchSnapshotMetricPayload, "level" | "projectId">

type ProjectAttachmentsRequestStage = "v1" | "v2" | "count"
type ProjectAttachmentsApiOverride = "force_v1" | "force_v2"

function getBatchSnapshotContext(payload: BatchSnapshotMetricPayload) {
	return {
		phase: payload.phase,
		level: payload.level,
		project_id: payload.projectId,
	}
}

export function getProjectAttachmentsPerfNow() {
	return manualPerfLogger.now()
}

export function recordBatchSnapshotSkipped(reason: string, payload: BatchSnapshotMetricPayload) {
	manualPerfLogger.count("batch_snapshot_skipped_count", 1, {
		reason,
		...getBatchSnapshotContext(payload),
	})
}

export function recordBatchSnapshotScheduleWait(
	payload: BatchSnapshotMetricPayload,
	waitMs: number,
) {
	manualPerfLogger.recordMetric("batch_snapshot_schedule_wait_ms", waitMs, {
		...getBatchSnapshotContext(payload),
	})
}

export function recordBatchSnapshotCommit(payload: BatchSnapshotMetricPayload) {
	manualPerfLogger.count("batch_snapshot_commit_count", 1, {
		...getBatchSnapshotContext(payload),
		tree_count: payload.tree?.length ?? 0,
		list_count: payload.list?.length ?? 0,
	})
}

export function recordBatchSnapshotCommitGap(payload: BatchSnapshotMetricPayload, gapMs: number) {
	manualPerfLogger.recordMetric("batch_snapshot_commit_gap_ms", gapMs, {
		...getBatchSnapshotContext(payload),
	})
}

export function recordBatchSnapshotCommitDuration(
	payload: BatchSnapshotMetricPayload,
	commitStartedAt: number,
) {
	const treeCount = payload.tree?.length ?? 0
	const listCount = payload.list?.length ?? 0
	manualPerfLogger.recordDuration("attachments_incremental_commit_ms", commitStartedAt, {
		phase: payload.phase,
		level: payload.level,
		tree_count: treeCount,
		list_count: listCount,
	})

	if (payload.phase === "first") {
		manualPerfLogger.recordDuration("attachments_v2_first_snapshot_commit_ms", commitStartedAt, {
			tree_count: treeCount,
			list_count: listCount,
		})
	}
}

export function recordBatchSnapshotScrollDeferred(payload: BatchSnapshotMetricPayload) {
	manualPerfLogger.count("batch_snapshot_scroll_deferred_count", 1, {
		...getBatchSnapshotContext(payload),
	})
}

export function recordBatchSnapshotIdleDeferred(payload: BatchSnapshotMetricPayload | null) {
	manualPerfLogger.count("batch_snapshot_idle_deferred_count", 1, {
		phase: payload?.phase,
		level: payload?.level,
		project_id: payload?.projectId,
	})
}

export function recordBatchSnapshotLatestWins(
	previousPayload: BatchSnapshotMetricPayload,
	nextPayload: BatchSnapshotCandidatePayload,
) {
	manualPerfLogger.count("batch_snapshot_latest_wins_count", 1, {
		replaced_level: previousPayload.level,
		next_level: nextPayload.level,
		project_id: nextPayload.projectId,
	})
	recordBatchSnapshotSkipped("latest_wins", previousPayload)
}

export function recordProjectAttachmentsRequestAbort(stage: ProjectAttachmentsRequestStage) {
	manualPerfLogger.count("attachments_request_abort_count", 1, { stage })
}

export function recordProjectAttachmentsV2PageFetch(
	fetchStartedAt: number,
	options: { pageIndex: number; pageSize: number },
) {
	manualPerfLogger.recordDuration("attachments_v2_page_fetch_ms", fetchStartedAt, {
		page_index: options.pageIndex,
		page_size: options.pageSize,
	})
}

export function recordProjectAttachmentsBfsEmptyNextParentIds() {
	manualPerfLogger.count("attachments_bfs_empty_next_parent_ids_with_has_more_count", 1)
}

export function recordProjectAttachmentsBfsRepeatedNextParentState() {
	manualPerfLogger.count("attachments_bfs_repeated_next_parent_state_count", 1)
}

export function recordProjectAttachmentsV2Diagnostics(options: {
	pageCount: number
	nextParentIdsCount: number
	strategy: ProjectAttachmentsLoadStrategy
	diagnostics: ProjectAttachmentsV2Diagnostics
}) {
	const { pageCount, nextParentIdsCount, strategy, diagnostics } = options
	const context = {
		strategy,
		page_count: pageCount,
	}

	manualPerfLogger.count("attachments_bfs_page_count", pageCount)
	manualPerfLogger.count("attachments_next_parent_ids_count", nextParentIdsCount)
	manualPerfLogger.recordMetric("attachments_v2_raw_rows", diagnostics.rawRows, context)
	manualPerfLogger.recordMetric("attachments_v2_normalized_rows", diagnostics.normalizedRows, context)
	manualPerfLogger.recordMetric(
		"attachments_v2_hidden_filtered_count",
		diagnostics.hiddenFilteredCount,
		context,
	)
	manualPerfLogger.recordMetric(
		"attachments_v2_dedup_file_id_count",
		diagnostics.dedupFileIdCount,
		context,
	)
	manualPerfLogger.recordMetric("attachments_v2_orphan_count", diagnostics.orphanCount, context)
}

export function recordProjectAttachmentsLoadTotal(
	loadStartedAt: number,
	result: ProjectAttachmentsLoadResult,
) {
	const context = {
		source_version: result.sourceVersion,
		strategy: result.strategy,
		fallback_reason: result.diagnostics.fallback_reason || "none",
		raw_total: result.rawTotal ?? -1,
		raw_rows: result.rawRows ?? -1,
		result_total: result.total,
	}
	manualPerfLogger.recordDuration("attachments_load_total_ms", loadStartedAt, context)

	if (result.sourceVersion === "v2" || result.strategy === "fallback_v1") {
		manualPerfLogger.recordDuration("attachments_v2_load_total_ms", loadStartedAt, context)
	}
}

export function recordProjectAttachmentsApiOverride(override: ProjectAttachmentsApiOverride) {
	manualPerfLogger.count("attachments_api_override", 1, { override })
}

export function recordProjectAttachmentsV2LoadFailure(isBfsAnomaly: boolean) {
	manualPerfLogger.count(
		isBfsAnomaly ? "attachments_bfs_anomaly_count" : "attachments_v2_fetch_error_count",
		1,
	)
}

export function recordProjectAttachmentsV2ForcedError() {
	manualPerfLogger.count("attachments_v2_forced_error_count", 1)
}

export function recordProjectAttachmentsV2Fallback(reason: ProjectAttachmentsFallbackReason) {
	manualPerfLogger.count("attachments_v2_fallback_count", 1, { reason })
}

export function recordProjectAttachmentsCountRaw(total: number) {
	manualPerfLogger.recordMetric("attachments_count_raw", total)
}