import { useMemo } from "react"
import type React from "react"
import {
	measureVisibleIndexBuild,
	measureVisibleRowsBuild,
} from "../components/CustomTree/useCustomTreePerf"
import {
	buildVisibleNodeIndexByKey,
	flattenVisibleAttachmentTreeRows,
} from "../utils/visibleTreeRows"
import type { AttachmentItem } from "./types"

interface UseVisibleTreeRowsOptions {
	expandedKeys: React.Key[]
	attachmentTree: AttachmentItem[]
	renamingItemId?: string | null
}

export function useVisibleTreeRows({
	expandedKeys,
	attachmentTree,
	renamingItemId,
}: UseVisibleTreeRowsOptions) {
	// The parent computes visible rows; CustomTree only renders them.
	const expandedKeySet = useMemo(() => new Set(expandedKeys.map(String)), [expandedKeys])
	const visibleRows = useMemo(
		() =>
			measureVisibleRowsBuild(
				attachmentTree.length,
				expandedKeys.length,
				() =>
					flattenVisibleAttachmentTreeRows(attachmentTree, expandedKeySet, renamingItemId),
			),
		[attachmentTree, expandedKeySet, expandedKeys.length, renamingItemId],
	)
	const visibleNodes = useMemo(() => visibleRows.map((row) => row.node), [visibleRows])
	// scrollToKey needs O(1) row lookup for both node.key and file_id.
	const visibleNodeIndexByKey = useMemo(
		() =>
			measureVisibleIndexBuild(visibleNodes.length, () =>
				buildVisibleNodeIndexByKey(visibleNodes),
			),
		[visibleNodes],
	)

	return {
		expandedKeySet,
		visibleRows,
		visibleNodes,
		visibleNodeIndexByKey,
	}
}
