import type { ElementNode } from "../ir/dom"

/**
 * Sort elements by paint order, simulating CSS stacking context rules
 *
 * Algorithm:
 * CSS stacking order is determined by the stacking context tree.
 * For each element, build a stacking-context path from the root to that element,
 * then compare paths lexicographically to determine paint order.
 *
 * Path construction rules:
 * - Record nodes only at stacking-context boundaries (ancestors with z-index !== 0) and at the element itself
 * - Record [zIndex, domOrder] for each node as the sort key
 * - Lexicographic comparison: compare zIndex first (larger is above), then domOrder (later is above)
 * - Longer paths (deeper descendants) are above
 *
 * After sorting, write the sorted index to each node's paintOrder property,
 * so calculateZOrder can read it directly later.
 */
export function sortByZOrder(nodes: ElementNode[]): ElementNode[] {
	// Cache each node's stacking path to avoid recalculating it during sorting
	const pathCache = new Map<string, number[]>()

	const sorted = [...nodes].sort((a, b) => {
		const pathA = getOrComputePath(a, pathCache)
		const pathB = getOrComputePath(b, pathCache)
		return comparePaths(pathA, pathB)
	})

	// Write the sorted index to nodes for calculateZOrder
	for (let i = 0; i < sorted.length; i++) {
		sorted[i].paintOrder = i
	}

	return sorted
}

/**
 * Calculate the element paint-order value for PPTNode.zOrder
 * Depends on paintOrder precomputed by sortByZOrder
 */
export function calculateZOrder(node: ElementNode): number {
	return node.paintOrder ?? 0
}

// ============================================================================
// Internal implementation
// ============================================================================

/**
 * Get or compute a node's stacking-context path with caching
 *
 * The path is a flattened number array: [z1, d1, z2, d2, ...]
 * Each (zIndex, domOrder) pair represents one key node in the path.
 *
 * The path contains only:
 * 1. Ancestor nodes that create a stacking context (zIndex !== 0)
 * 2. The element itself
 *
 * Intermediate ancestors that do not create stacking contexts are skipped,
 * so child elements can pass through regular ancestors and compare at the correct stacking-context level.
 */
function getOrComputePath(
	node: ElementNode,
	cache: Map<string, number[]>,
): number[] {
	const cached = cache.get(node.id)
	if (cached) return cached

	const path = buildStackingPath(node)
	cache.set(node.id, path)
	return path
}

/**
 * Build the stacking-context path from the root to the node
 */
function buildStackingPath(node: ElementNode): number[] {
	// Collect key ancestors upward from the node
	const entries: Array<{ zIndex: number; domOrder: number }> = []
	let current: ElementNode | null = node

	while (current) {
		// Record stacking-context roots (zIndex !== 0) or the target node itself
		if (current === node || current.zIndex !== 0) {
			entries.push({ zIndex: current.zIndex, domOrder: current.domOrder })
		}
		current = current.parent
	}

	// Reverse to root-to-node order, then flatten into [z1, d1, z2, d2, ...]
	entries.reverse()
	const path: number[] = []
	for (const entry of entries) {
		path.push(entry.zIndex, entry.domOrder)
	}
	return path
}

/**
 * Compare two paths lexicographically
 *
 * Comparison rules:
 * 1. Compare [zIndex, domOrder] pairs one by one
 * 2. Larger zIndex is above and painted later
 * 3. When zIndex is equal, larger domOrder is above
 * 4. When prefixes are identical, the longer path is above (child above parent)
 */
function comparePaths(a: number[], b: number[]): number {
	const len = Math.min(a.length, b.length)
	for (let i = 0; i < len; i++) {
		if (a[i] !== b[i]) return a[i] - b[i]
	}
	// Longer paths (deeper descendants) are above
	return a.length - b.length
}
