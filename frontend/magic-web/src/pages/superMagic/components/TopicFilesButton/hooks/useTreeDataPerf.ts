import { manualPerfLogger } from "@/utils/manualPerfLogger"
import {
	collectTreeIndexStructureStats,
	type TreeIndex,
	type TreeIndexStructureStats,
} from "../utils/treeIndex"

interface DeferredTreeBuildPerfData {
	mergedFilesCount: number
	cacheIdentity: string
	stage: "tree_data" | "tree_index"
}

export function recordDeferredTreeBuild({
	mergedFilesCount,
	cacheIdentity,
	stage,
}: DeferredTreeBuildPerfData) {
	if (!manualPerfLogger.isEnabled()) return

	manualPerfLogger.count(
		stage === "tree_data"
			? "convertToTreeData_deferred_count"
			: "tree_index_build_deferred_count",
		1,
		{
			merged_files_count: mergedFilesCount,
			cache_identity: cacheIdentity,
		},
	)
}

export function recordTreeIndexStructureMetrics(
	treeIndex: TreeIndex,
	data: Record<string, unknown> = {},
): TreeIndexStructureStats {
	const stats = collectTreeIndexStructureStats(treeIndex)
	if (!manualPerfLogger.isEnabled()) return stats

	const payload = {
		...data,
		...stats,
	}

	manualPerfLogger.count("tree_index_entry_count", stats.tree_index_entry_count, payload)
	manualPerfLogger.count("tree_index_map_entry_count", stats.tree_index_map_entry_count, payload)
	manualPerfLogger.count(
		"tree_index_path_key_ref_count",
		stats.tree_index_path_key_ref_count,
		payload,
	)
	manualPerfLogger.count(
		"tree_index_child_key_ref_count",
		stats.tree_index_child_key_ref_count,
		payload,
	)
	manualPerfLogger.count("tree_index_max_path_depth", stats.tree_index_max_path_depth, payload)
	manualPerfLogger.count("tree_index_avg_path_depth", stats.tree_index_avg_path_depth, payload)

	return stats
}
