import type { VirtualItem } from "@tanstack/react-virtual"

export interface SlideGapTarget {
	/** Insertion boundary in the original list: 0 is before the first item, N is after the last. */
	gapIndex: number
	/** Absolute offset inside the virtual list content, used by the drop indicator. */
	offset: number
}

interface EdgeAutoScrollOptions {
	pointerPosition: number
	containerStart: number
	containerEnd: number
	edgeSize: number
	maxSpeed: number
}

interface IdentifiedIndexedItem {
	id: string
	index: number
}

/**
 * Resolve the insertion boundary nearest to the pointer.
 *
 * Virtual items are sufficient here because the pointer can only interact with the currently
 * visible range. As edge auto-scroll advances the viewport, newly visible rows replace them.
 */
export function resolveSlideGapTarget(
	virtualItems: VirtualItem[],
	pointerOffset: number,
	itemCount: number,
): SlideGapTarget | null {
	if (itemCount === 0) {
		return { gapIndex: 0, offset: 0 }
	}

	if (virtualItems.length === 0) return null

	// A dragged source can be pinned far outside the visible range. Choosing the closest midpoint
	// prevents that off-screen item from stealing the drop target from the visible rows.
	const closestItem = virtualItems.reduce((closest, candidate) => {
		const closestMidpoint = closest.start + closest.size / 2
		const candidateMidpoint = candidate.start + candidate.size / 2
		return Math.abs(pointerOffset - candidateMidpoint) <
			Math.abs(pointerOffset - closestMidpoint)
			? candidate
			: closest
	})
	const midpoint = closestItem.start + closestItem.size / 2

	if (pointerOffset < midpoint) {
		return {
			gapIndex: Math.max(0, Math.min(closestItem.index, itemCount)),
			offset: closestItem.start,
		}
	}

	return {
		gapIndex: Math.max(0, Math.min(closestItem.index + 1, itemCount)),
		offset: closestItem.end,
	}
}

/**
 * Move an item to an insertion boundary expressed against the pre-removal list.
 * Keeping this arithmetic in one place avoids the previous before/after index ambiguity.
 */
export function moveItemToGap<T extends IdentifiedIndexedItem>(
	items: T[],
	draggedId: string,
	gapIndex: number,
): T[] {
	const sourceIndex = items.findIndex((item) => item.id === draggedId)
	if (sourceIndex < 0) return items

	const boundedGapIndex = Math.max(0, Math.min(gapIndex, items.length))
	const insertionIndex = boundedGapIndex > sourceIndex ? boundedGapIndex - 1 : boundedGapIndex

	// The boundaries immediately before and after the source both represent a no-op.
	if (insertionIndex === sourceIndex) return items

	const nextItems = items.slice()
	const [draggedItem] = nextItems.splice(sourceIndex, 1)
	if (!draggedItem) return items

	nextItems.splice(insertionIndex, 0, draggedItem)
	return nextItems.map((item, index) => ({
		...item,
		index,
	}))
}

/**
 * Calculate an interruptible per-frame scroll delta near a viewport edge.
 * The quadratic ramp keeps the inner edge calm while still reaching distant slides quickly.
 */
export function getEdgeAutoScrollDelta({
	pointerPosition,
	containerStart,
	containerEnd,
	edgeSize,
	maxSpeed,
}: EdgeAutoScrollOptions): number {
	const distanceFromStart = pointerPosition - containerStart
	if (distanceFromStart >= 0 && distanceFromStart < edgeSize) {
		const intensity = 1 - distanceFromStart / edgeSize
		return -Math.max(1, Math.round(maxSpeed * intensity * intensity))
	}

	const distanceFromEnd = containerEnd - pointerPosition
	if (distanceFromEnd >= 0 && distanceFromEnd < edgeSize) {
		const intensity = 1 - distanceFromEnd / edgeSize
		return Math.max(1, Math.round(maxSpeed * intensity * intensity))
	}

	return 0
}
