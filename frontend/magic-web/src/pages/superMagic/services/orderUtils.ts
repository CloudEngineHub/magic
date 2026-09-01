/** Resolves the local insertion index from optional predecessor/successor anchors. */
export function getInsertIndexByAnchors(
	orderedIds: string[],
	predecessorId?: string | null,
	successorId?: string | null,
): number {
	if (predecessorId != null) {
		const predecessorIndex = orderedIds.indexOf(predecessorId)
		if (predecessorIndex !== -1) return predecessorIndex + 1
	}

	if (successorId != null) {
		const successorIndex = orderedIds.indexOf(successorId)
		if (successorIndex !== -1) return successorIndex
	}

	return orderedIds.length
}
