import { useMemo } from "react"
import type React from "react"
import type { AttachmentIndex } from "../utils/attachmentIndex"
import { resolveActiveTreeSelectionKey } from "../utils/activeTreeSelection"

interface UseActiveTreeSelectionOptions {
	activeFileId?: string | null
	treeIndex: AttachmentIndex
	expandedKeySet: ReadonlySet<string>
	selectedKeys: React.Key[]
}

/** Resolves the tree selection and row highlight for the active file. */
export function useActiveTreeSelection({
	activeFileId,
	treeIndex,
	expandedKeySet,
	selectedKeys,
}: UseActiveTreeSelectionOptions) {
	const activeTreeSelectionKey = useMemo(
		() => resolveActiveTreeSelectionKey(activeFileId, treeIndex, expandedKeySet),
		[activeFileId, expandedKeySet, treeIndex],
	)
	const effectiveSelectedKeys = useMemo(() => {
		if (!activeFileId) return selectedKeys
		return activeTreeSelectionKey ? [activeTreeSelectionKey] : []
	}, [activeFileId, activeTreeSelectionKey, selectedKeys])

	return { activeTreeSelectionKey, effectiveSelectedKeys }
}
