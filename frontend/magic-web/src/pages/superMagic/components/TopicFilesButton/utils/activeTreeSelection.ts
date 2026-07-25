import type { AttachmentIndex } from "./attachmentIndex"

/**
 * Resolves the visible tree node that represents the active file.
 *
 * A collapsed folder hides every descendant below it, so it is the closest
 * visible representation of an active file in that branch. Once every parent
 * is expanded, the active file itself becomes the selected node.
 */
export function resolveActiveTreeSelectionKey(
	activeFileId: string | null | undefined,
	treeIndex: AttachmentIndex,
	expandedKeySet: ReadonlySet<string>,
): string | null {
	if (!activeFileId) return null

	const activeEntry = treeIndex.getEntryById(activeFileId)
	if (!activeEntry) return null

	const pathKeys = treeIndex.getPathKeys(activeEntry.key)
	const firstCollapsedAncestorKey = pathKeys.slice(0, -1).find((key) => !expandedKeySet.has(key))

	return firstCollapsedAncestorKey || activeEntry.key
}
