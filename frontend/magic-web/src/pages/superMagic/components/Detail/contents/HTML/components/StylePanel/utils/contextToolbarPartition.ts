export interface ContextToolGroup<T = unknown> {
	id: string
	estimatedWidth: number
	data?: T
}

/** The default maximum width before context tools split into two rows. */
export const CONTEXT_TOOLBAR_ROW_MAX_WIDTH = 520

/**
 * Split context toolbar groups into 1 or 2 rows.
 * When total width exceeds `maxRowWidth`, finds the split point that
 * minimizes max(row1Width, row2Width) so both rows have balanced length.
 */
export function partitionContextToolGroups<T>(
	groups: ContextToolGroup<T>[],
	maxRowWidth: number = CONTEXT_TOOLBAR_ROW_MAX_WIDTH,
): ContextToolGroup<T>[][] {
	if (groups.length <= 1) return [groups]

	const totalWidth = groups.reduce((sum, group) => sum + group.estimatedWidth, 0)
	if (totalWidth <= maxRowWidth) {
		return [groups]
	}

	let bestSplit = 1
	let minMax = Number.POSITIVE_INFINITY

	for (let i = 1; i < groups.length; i += 1) {
		const row1Width = groups.slice(0, i).reduce((sum, group) => sum + group.estimatedWidth, 0)
		const row2Width = groups.slice(i).reduce((sum, group) => sum + group.estimatedWidth, 0)
		const max = Math.max(row1Width, row2Width)
		if (max < minMax) {
			minMax = max
			bestSplit = i
		}
	}

	return [groups.slice(0, bestSplit), groups.slice(bestSplit)]
}
