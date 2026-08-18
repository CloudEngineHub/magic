import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual"

/**
 * Keeps TanStack's default settled/downward anchoring while preventing iOS from batching
 * first-measure corrections during upward scrolling and replaying them after momentum ends.
 */
export function shouldAdjustVirtualMessageScrollPosition(
	item: VirtualItem,
	_delta: number,
	instance: Virtualizer<HTMLDivElement, HTMLDivElement>,
): boolean {
	if (instance.scrollDirection === "backward") return false

	// Use TanStack's public viewport offset because its internal adjustment field is private.
	const scrollOffset = instance.scrollOffset ?? 0
	const isFirstMeasurement = !instance.itemSizeCache.has(item.key)
	return isFirstMeasurement ? item.start < scrollOffset : item.end <= scrollOffset
}
