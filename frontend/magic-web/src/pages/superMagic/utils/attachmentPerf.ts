import { estimateObjectSizeMb, manualPerfLogger } from "@/utils/manualPerfLogger"
import { collectFileTreeStats, type FileTreeLike } from "./fileTreePerf"

interface AttachmentResponseLike {
	tree?: FileTreeLike[]
	list?: unknown[]
	total?: number
	rawTotal?: number
	sourceVersion?: string
	strategy?: string
}

const LARGE_TREE_FEATURE_FLAG_STATE = "legacy_disabled"
const LARGE_TREE_MODE_DECIDED_BY = "pr1_empty_feature_flag"

export function recordLargeTreeFeatureFlagState(
	source: string,
	data: Record<string, unknown> = {},
) {
	if (!manualPerfLogger.isEnabled()) return

	const payload = {
		source,
		large_tree_mode: false,
		feature_flag_state: LARGE_TREE_FEATURE_FLAG_STATE,
		mode_decided_by: LARGE_TREE_MODE_DECIDED_BY,
		...data,
	}

	manualPerfLogger.recordMetric("large_tree_mode", 0, payload)
	manualPerfLogger.recordMetric("feature_flag_state", 0, payload)
}

export function recordAttachmentsStaleResponseDropped(
	source: string,
	data: Record<string, unknown> = {},
) {
	manualPerfLogger.count("stale_response_dropped", 1, {
		source,
		...data,
	})
}

export function recordAttachmentResponseMetrics(
	source: string,
	response: AttachmentResponseLike | null | undefined,
) {
	if (!manualPerfLogger.isEnabled()) return

	const tree = Array.isArray(response?.tree) ? response.tree : []
	const listCount = Array.isArray(response?.list) ? response.list.length : undefined
	const stats = collectFileTreeStats(tree)
	recordLargeTreeFeatureFlagState(source, {
		attachments_count: stats.attachments_count,
		api_total: response?.total,
		raw_total: response?.rawTotal,
		source_version: response?.sourceVersion,
		strategy: response?.strategy,
	})
	manualPerfLogger.ensureMarkStart("tree_first_interactive", {
		source,
		attachments_count: stats.attachments_count,
	})
	manualPerfLogger.recordStats(source, stats, {
		list_count: listCount,
		api_total: response?.total,
	})

	const responseSizeMb = estimateObjectSizeMb(response)
	if (responseSizeMb !== null) {
		manualPerfLogger.recordMetric("response_bytes_mb", responseSizeMb, { source })
	}
}

export async function measureAttachmentFetch<T extends AttachmentResponseLike>(
	source: string,
	fetcher: () => Promise<T>,
): Promise<T> {
	if (!manualPerfLogger.isEnabled()) return fetcher()

	manualPerfLogger.ensureSession({
		source,
	})
	const response = await manualPerfLogger.measureAsync("fetch_total_ms", fetcher, {
		source,
	})
	recordAttachmentResponseMetrics(source, response)
	return response
}
