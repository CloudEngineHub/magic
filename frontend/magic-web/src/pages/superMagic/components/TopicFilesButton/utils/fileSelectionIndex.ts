import type { AttachmentItem } from "../hooks/types"
import type { AttachmentIndex, AttachmentIndexEntry } from "./attachmentIndex"

// Public selection state stores business IDs from getItemId; treeIndex uses node keys.
// Centralize conversion here to avoid repeated deep tree walks in selection hooks.
export type FileSelectionCheckState = "checked" | "unchecked" | "indeterminate"

export interface SelectedAncestorInfo {
	// Selected ancestor business IDs, used to remove them from selectedItems.
	selectedAncestorId: string
	// Ancestor keys in treeIndex, used for child and descendant lookups.
	selectedAncestorKey: string
	// Business ID of the ancestor child branch containing the current node.
	directChildId: string
	// Tree key of the ancestor child branch containing the current node.
	directChildKey: string
}

// Build selection IDs, including legacy folders with only relative_file_path/key.
export function getSelectionItemId(
	entry: AttachmentIndexEntry,
	getItemId: (item: AttachmentItem) => string,
) {
	return getItemId(entry.item) || entry.key
}

// Prefer O(1) treeIndex lookups; scan only for legacy getItemId/file_id/key mismatches.
export function getSelectionEntry(
	treeIndex: AttachmentIndex,
	itemId: string,
	getItemId?: (item: AttachmentItem) => string,
): AttachmentIndexEntry | undefined {
	const entry = treeIndex.getEntryById(itemId) || treeIndex.getEntryByKey(itemId)
	if (entry || !getItemId) return entry

	for (const key of treeIndex.allKeys) {
		const currentEntry = treeIndex.getEntryByKey(key)
		if (currentEntry && getSelectionItemId(currentEntry, getItemId) === itemId) {
			return currentEntry
		}
	}

	return undefined
}

// Check whether a node is selected through an ancestor.
export function hasSelectedAncestor(
	treeIndex: AttachmentIndex,
	itemId: string,
	selectedItems: ReadonlySet<string>,
	getItemId: (item: AttachmentItem) => string,
): boolean {
	const entry = getSelectionEntry(treeIndex, itemId, getItemId)
	if (!entry) return false
	return hasSelectedAncestorByEntry(treeIndex, entry, selectedItems, getItemId)
}

// Walk parentKey ancestors and compare business selection IDs.
function hasSelectedAncestorByEntry(
	treeIndex: AttachmentIndex,
	entry: AttachmentIndexEntry,
	selectedItems: ReadonlySet<string>,
	getItemId: (item: AttachmentItem) => string,
): boolean {
	let parentKey = entry.parentKey
	while (parentKey) {
		const ancestorEntry = treeIndex.getEntryByKey(parentKey)
		if (!ancestorEntry) break

		if (selectedItems.has(getSelectionItemId(ancestorEntry, getItemId))) {
			return true
		}
		parentKey = ancestorEntry.parentKey
	}

	return false
}

// Convert treeIndex keys into business IDs stored by selection state.
export function getSelectionIdsByKeys(
	treeIndex: AttachmentIndex,
	keys: readonly string[],
	getItemId: (item: AttachmentItem) => string,
): string[] {
	return keys
		.map((key) => treeIndex.getEntryByKey(key))
		.filter((entry): entry is AttachmentIndexEntry => Boolean(entry))
		.map((entry) => getSelectionItemId(entry, getItemId))
		.filter(Boolean)
}

// Get descendant business IDs for folder selection, deselection, and counts.
export function getSelectionDescendantIds(
	treeIndex: AttachmentIndex,
	itemId: string,
	getItemId: (item: AttachmentItem) => string,
): string[] {
	const entry = getSelectionEntry(treeIndex, itemId, getItemId)
	return entry
		? getSelectionIdsByKeys(treeIndex, treeIndex.getDescendantKeysByKey(entry.key), getItemId)
		: []
}

// Get direct child business IDs when deselecting a selected parent.
export function getSelectionChildIds(
	treeIndex: AttachmentIndex,
	itemId: string,
	getItemId: (item: AttachmentItem) => string,
): string[] {
	const entry = getSelectionEntry(treeIndex, itemId, getItemId)
	return entry
		? getSelectionIdsByKeys(treeIndex, treeIndex.getChildKeysByKey(entry.key), getItemId)
		: []
}

// For indirect selection, find the nearest selected ancestor and child branch.
export function getNearestSelectedAncestor(
	treeIndex: AttachmentIndex,
	itemId: string,
	selectedItems: ReadonlySet<string>,
	getItemId: (item: AttachmentItem) => string,
): SelectedAncestorInfo | null {
	const entry = getSelectionEntry(treeIndex, itemId, getItemId)
	if (!entry) return null

	let directChildKey = entry.key
	let parentKey = entry.parentKey
	while (parentKey) {
		const ancestorEntry = treeIndex.getEntryByKey(parentKey)
		if (!ancestorEntry) break

		const ancestorId = getSelectionItemId(ancestorEntry, getItemId)
		if (selectedItems.has(ancestorId)) {
			const directChildEntry = treeIndex.getEntryByKey(directChildKey)

			return {
				selectedAncestorId: ancestorId,
				selectedAncestorKey: ancestorEntry.key,
				directChildId: directChildEntry
					? getSelectionItemId(directChildEntry, getItemId)
					: directChildKey,
				directChildKey,
			}
		}
		directChildKey = ancestorEntry.key
		parentKey = ancestorEntry.parentKey
	}

	return null
}

// Reverse allKeys is postorder: resolve children before folder check states.
export function buildSelectionCheckStates(
	treeIndex: AttachmentIndex,
	selectedItems: ReadonlySet<string>,
	getItemId: (item: AttachmentItem) => string,
): Map<string, FileSelectionCheckState> {
	const states = new Map<string, FileSelectionCheckState>()

	function isSelected(entry: AttachmentIndexEntry, itemId: string): boolean {
		if (selectedItems.has(itemId)) return true
		return hasSelectedAncestorByEntry(treeIndex, entry, selectedItems, getItemId)
	}

	for (let index = treeIndex.allKeys.length - 1; index >= 0; index -= 1) {
		const entry = treeIndex.getEntryByKey(treeIndex.allKeys[index])
		if (!entry) continue

		const itemId = getSelectionItemId(entry, getItemId)
		const item = entry.item

		if (!item.is_directory) {
			states.set(itemId, isSelected(entry, itemId) ? "checked" : "unchecked")
			continue
		}

		const childEntries = treeIndex
			.getChildKeysByKey(entry.key)
			.map((childKey) => treeIndex.getEntryByKey(childKey))
			.filter((childEntry): childEntry is AttachmentIndexEntry => Boolean(childEntry))
			.filter((childEntry) => !childEntry.item.is_hidden)

		if (childEntries.length === 0) {
			states.set(itemId, isSelected(entry, itemId) ? "checked" : "unchecked")
			continue
		}

		if (selectedItems.has(itemId)) {
			states.set(itemId, "checked")
			continue
		}

		let checkedCount = 0
		let indeterminateFound = false

		for (const childEntry of childEntries) {
			const childId = getSelectionItemId(childEntry, getItemId)
			const childState = states.get(childId)
			if (childState === "checked") {
				checkedCount += 1
			} else if (childState === "indeterminate") {
				indeterminateFound = true
			}
		}

		if (indeterminateFound || (checkedCount > 0 && checkedCount < childEntries.length)) {
			states.set(itemId, "indeterminate")
		} else {
			states.set(itemId, checkedCount === childEntries.length ? "checked" : "unchecked")
		}
	}

	return states
}

// Count visible selections; folders expand to themselves and descendants.
export function countSelectedVisibleItems(
	treeIndex: AttachmentIndex,
	selectedItems: ReadonlySet<string>,
	getItemId: (item: AttachmentItem) => string,
): number {
	let count = 0
	const counted = new Set<string>()

	for (const selectedId of Array.from(selectedItems)) {
		const entry = getSelectionEntry(treeIndex, selectedId, getItemId)
		if (!entry) continue

		const entriesToCount = entry.item.is_directory
			? [
					entry,
					...treeIndex
						.getDescendantKeysByKey(entry.key)
						.map((key) => treeIndex.getEntryByKey(key))
						.filter((descendant): descendant is AttachmentIndexEntry =>
							Boolean(descendant),
						),
				]
			: [entry]

		for (const currentEntry of entriesToCount) {
			const itemId = getSelectionItemId(currentEntry, getItemId)
			if (counted.has(itemId)) continue

			const item = currentEntry.item
			if (!item || item.is_hidden) continue

			counted.add(itemId)
			count += 1
		}
	}

	return count
}

// When deselecting an indirect node, re-add sibling branches as explicit selections.
export function getBranchSelectionIds(
	treeIndex: AttachmentIndex,
	branchRootId: string,
	excludedIds: ReadonlySet<string>,
	getItemId: (item: AttachmentItem) => string,
): string[] {
	return getSelectionDescendantIds(treeIndex, branchRootId, getItemId).filter(
		(id) => !excludedIds.has(id),
	)
}
