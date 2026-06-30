import { manualPerfLogger } from "@/utils/manualPerfLogger"
import {
	collectAttachmentIndexStructureStats,
	type AttachmentIndex,
	type AttachmentIndexStructureStats,
} from "../utils/attachmentIndex"

export function recordAttachmentIndexStructureMetrics(
	attachmentIndex: AttachmentIndex,
	data: Record<string, unknown> = {},
): AttachmentIndexStructureStats {
	const stats = collectAttachmentIndexStructureStats(attachmentIndex)
	if (!manualPerfLogger.isEnabled()) return stats

	const payload = {
		...data,
		...stats,
	}

	manualPerfLogger.count(
		"attachment_index_entry_count",
		stats.attachment_index_entry_count,
		payload,
	)
	manualPerfLogger.count(
		"attachment_index_map_entry_count",
		stats.attachment_index_map_entry_count,
		payload,
	)
	manualPerfLogger.count(
		"attachment_index_path_key_ref_count",
		stats.attachment_index_path_key_ref_count,
		payload,
	)
	manualPerfLogger.count(
		"attachment_index_child_key_ref_count",
		stats.attachment_index_child_key_ref_count,
		payload,
	)
	manualPerfLogger.count(
		"attachment_index_max_path_depth",
		stats.attachment_index_max_path_depth,
		payload,
	)
	manualPerfLogger.count(
		"attachment_index_avg_path_depth",
		stats.attachment_index_avg_path_depth,
		payload,
	)

	return stats
}
