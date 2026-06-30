import React, { useLayoutEffect, useMemo, useRef } from "react"
import { manualPerfLogger } from "@/utils/manualPerfLogger"
import type { VisibleTreeScrollAnchor } from "../../utils/visibleTreeRows"
import type { TreeNodeData } from "../../utils/treeDataConverter"

interface UseCustomTreePerfMetricsOptions {
	rootNodeCount: number
	expandedKeys: React.Key[]
	selectedKeys: React.Key[]
	visibleNodeCount?: number
	mountedNodeCount?: number
	virtualized?: boolean
}

export function useCustomTreePerfMetrics({
	rootNodeCount,
	expandedKeys,
	selectedKeys,
	visibleNodeCount,
	mountedNodeCount,
	virtualized = false,
}: UseCustomTreePerfMetricsOptions) {
	const renderStartedAtRef = useRef<number | null>(null)
	if (manualPerfLogger.isEnabled()) {
		renderStartedAtRef.current = manualPerfLogger.now()
	}

	const visibleTreeNodes = useMemo(() => {
		if (!manualPerfLogger.isEnabled()) return 0
		if (typeof visibleNodeCount === "number") return visibleNodeCount
		return 0
	}, [visibleNodeCount])
	const mountedTreeNodes = mountedNodeCount ?? visibleTreeNodes

	useLayoutEffect(() => {
		const startedAt = renderStartedAtRef.current
		if (!manualPerfLogger.isEnabled() || startedAt === null) return

		manualPerfLogger.recordDuration("CustomTree_render_ms", startedAt, {
			tree_root_count: rootNodeCount,
			expanded_keys_count: expandedKeys.length,
			selected_keys_count: selectedKeys.length,
			tree_visible_nodes_count: visibleTreeNodes,
			tree_mounted_nodes_count: mountedTreeNodes,
			rendered_dom_nodes: mountedTreeNodes,
			tree_virtualized: virtualized,
		})
		manualPerfLogger.count("rendered_dom_nodes", mountedTreeNodes, {
			expanded_keys_count: expandedKeys.length,
			tree_virtualized: virtualized,
		})
		manualPerfLogger.count("tree_visible_nodes_count", visibleTreeNodes, {
			expanded_keys_count: expandedKeys.length,
			tree_virtualized: virtualized,
		})
		manualPerfLogger.count("tree_mounted_nodes_count", mountedTreeNodes, {
			expanded_keys_count: expandedKeys.length,
			tree_virtualized: virtualized,
		})
		manualPerfLogger.markEnd("tree_first_interactive", {
			tree_visible_nodes_count: visibleTreeNodes,
			tree_mounted_nodes_count: mountedTreeNodes,
			rendered_dom_nodes: mountedTreeNodes,
			expanded_keys_count: expandedKeys.length,
			tree_virtualized: virtualized,
		})
		manualPerfLogger.markEnd("search_input_to_visible", {
			tree_visible_nodes_count: visibleTreeNodes,
			tree_mounted_nodes_count: mountedTreeNodes,
			rendered_dom_nodes: mountedTreeNodes,
			expanded_keys_count: expandedKeys.length,
			tree_virtualized: virtualized,
		})
	})
}

export function measureTreeExpand(
	nextExpanded: boolean,
	newExpandedKeys: React.Key[],
	node: TreeNodeData,
	callback: () => void,
) {
	manualPerfLogger.measure(nextExpanded ? "expand_folder_ms" : "collapse_folder_ms", callback, {
		expanded_keys_count: newExpandedKeys.length,
		has_children: Boolean(node.children?.length),
	})
}

export function measureTreeSelect(
	newSelectedKeys: React.Key[],
	node: TreeNodeData,
	callback: () => void,
) {
	manualPerfLogger.measure("tree_select_ms", callback, {
		selected_keys_count: newSelectedKeys.length,
		is_directory: Boolean(node.item?.is_directory),
	})
}

export function measureVisibleRowsBuild<T extends { length: number }>(
	treeDataRootCount: number,
	expandedKeysCount: number,
	callback: () => T,
): T {
	if (!manualPerfLogger.isEnabled()) return callback()

	const startedAt = manualPerfLogger.now()
	const result = callback()
	const data = {
		tree_data_root_count: treeDataRootCount,
		expanded_keys_count: expandedKeysCount,
		visible_rows_count: result.length,
	}
	manualPerfLogger.recordDuration("visible_rows_build_ms", startedAt, data)
	manualPerfLogger.count("visible_rows_count", result.length, data)
	manualPerfLogger.count("expanded_keys_count", expandedKeysCount, data)
	return result
}

export function measureVisibleIndexBuild<T extends Map<string, number>>(
	visibleRowsCount: number,
	callback: () => T,
): T {
	if (!manualPerfLogger.isEnabled()) return callback()

	const startedAt = manualPerfLogger.now()
	const result = callback()
	const aliasCount = Math.max(0, result.size - visibleRowsCount)
	const data = {
		visible_rows_count: visibleRowsCount,
		visible_index_key_count: result.size,
		visible_index_key_alias_count: aliasCount,
	}
	manualPerfLogger.recordDuration("visible_index_build_ms", startedAt, data)
	manualPerfLogger.count("visible_index_key_alias_count", aliasCount, data)
	return result
}

interface TreeScrollAnchorRestoreOptions {
	anchor: VisibleTreeScrollAnchor
	nextIndex?: number
	deltaPx: number
	restoreMode: "virtualizer" | "scroll_element"
	visibleNodesCount: number
}

export function recordTreeScrollAnchorRestore({
	anchor,
	nextIndex,
	deltaPx,
	restoreMode,
	visibleNodesCount,
}: TreeScrollAnchorRestoreOptions) {
	if (!manualPerfLogger.isEnabled()) return

	manualPerfLogger.count("tree_scroll_anchor_restore_count", 1, {
		anchor_key: anchor.key,
		previous_index: anchor.index,
		next_index: nextIndex,
		delta_px: deltaPx,
		restore_mode: restoreMode,
		visible_nodes_count: visibleNodesCount,
	})
}

export function recordTreeScrollAnchorMissing(
	anchor: VisibleTreeScrollAnchor,
	visibleNodesCount: number,
) {
	if (!manualPerfLogger.isEnabled()) return

	manualPerfLogger.count("tree_scroll_anchor_missing_count", 1, {
		anchor_key: anchor.key,
		previous_index: anchor.index,
		visible_nodes_count: visibleNodesCount,
	})
}
