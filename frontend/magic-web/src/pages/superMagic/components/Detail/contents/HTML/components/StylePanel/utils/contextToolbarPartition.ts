import { getMetricControlWidth } from "../controls/metricControlWidth"

export interface ContextToolItem<T = unknown> {
	id: string
	estimatedWidth: number
	data?: T
}

export interface ContextToolGroup<T = unknown> {
	id: string
	estimatedWidth: number
	items?: ContextToolItem<T>[]
	data?: T
}

/** The default maximum width before context tools split into two rows. */
export const CONTEXT_TOOLBAR_ROW_MAX_WIDTH = 520
/** Vertical separator plus flex gap between toolbar groups. */
export const CONTEXT_TOOLBAR_GROUP_GAP = 16
/** gap-1 between controls inside a typography group. */
export const CONTEXT_TOOLBAR_ITEM_GAP = 4
export const CONTEXT_TOOLBAR_FONT_ADJUSTER_WIDTH = 56
/** p-1.5 on the floating panel, subtracted from canvas max width. */
export const CONTEXT_TOOLBAR_PANEL_PADDING = 12
/** Six h-7 action buttons plus their gaps. */
export const CONTEXT_TOOLBAR_ACTIONS_WIDTH = 192
/** Four format toggles (B/I/U/S) plus gaps. */
export const CONTEXT_TOOLBAR_FORMATTING_WIDTH = 124
/** Ellipsis plus the More Styles label. */
export const CONTEXT_TOOLBAR_MORE_WIDTH = 96

/** Cap row width to the canvas when a sidebar shrinks the editor. */
export function getContextToolbarRowMaxWidth(availableWidth?: number): number {
	if (availableWidth == null || !Number.isFinite(availableWidth) || availableWidth <= 0) {
		return CONTEXT_TOOLBAR_ROW_MAX_WIDTH
	}
	return Math.max(1, Math.min(CONTEXT_TOOLBAR_ROW_MAX_WIDTH, availableWidth))
}

export function getContextToolbarItemList<T>(group: ContextToolGroup<T>): ContextToolItem<T>[] {
	if (group.items && group.items.length > 0) return group.items
	return [
		{
			id: group.id,
			estimatedWidth: group.estimatedWidth,
			data: group.data,
		},
	]
}

export function getContextToolbarGroupWidth(group: ContextToolGroup): number {
	const items = getContextToolbarItemList(group)
	if (items.length === 0) return 0
	const contentWidth = items.reduce((sum, item) => sum + item.estimatedWidth, 0)
	return contentWidth + CONTEXT_TOOLBAR_ITEM_GAP * (items.length - 1)
}

export function getContextToolbarRowWidth(groups: ContextToolGroup[]): number {
	if (groups.length === 0) return 0
	const contentWidth = groups.reduce((sum, group) => sum + getContextToolbarGroupWidth(group), 0)
	return contentWidth + CONTEXT_TOOLBAR_GROUP_GAP * (groups.length - 1)
}

export interface ContextToolbarTypographyOptions {
	fontSize?: string
	lineHeight?: string
	showAdjuster?: boolean
}

/** Keep font size and A↑A↓ as one unit so they never wrap onto their own row. */
export function getContextToolbarTypographyUnits(
	options: ContextToolbarTypographyOptions,
): { id: string; estimatedWidth: number }[] {
	const units: { id: string; estimatedWidth: number }[] = []
	let fontSizeWidth = 0
	if (options.fontSize != null) fontSizeWidth += getMetricControlWidth(options.fontSize)
	if (options.showAdjuster) {
		if (fontSizeWidth > 0) fontSizeWidth += CONTEXT_TOOLBAR_ITEM_GAP
		fontSizeWidth += CONTEXT_TOOLBAR_FONT_ADJUSTER_WIDTH
	}
	if (fontSizeWidth > 0) units.push({ id: "fontSize", estimatedWidth: fontSizeWidth })
	if (options.lineHeight != null) {
		units.push({
			id: "lineHeight",
			estimatedWidth: getMetricControlWidth(options.lineHeight),
		})
	}
	return units
}

/** Measure typography controls from their live values, not a fixed 88px guess. */
export function getContextToolbarTypographyWidth(options: ContextToolbarTypographyOptions): number {
	const units = getContextToolbarTypographyUnits(options)
	if (units.length === 0) return 0
	return (
		units.reduce((sum, unit) => sum + unit.estimatedWidth, 0) +
		CONTEXT_TOOLBAR_ITEM_GAP * (units.length - 1)
	)
}

function createGroupSegment<T>(
	group: ContextToolGroup<T>,
	items: ContextToolItem<T>[],
): ContextToolGroup<T> {
	const estimatedWidth =
		items.reduce((sum, item) => sum + item.estimatedWidth, 0) +
		CONTEXT_TOOLBAR_ITEM_GAP * Math.max(0, items.length - 1)
	const isFullGroup = items.length === getContextToolbarItemList(group).length
	return {
		id: group.id,
		estimatedWidth,
		items: group.items ? items : undefined,
		data: isFullGroup ? group.data : undefined,
	}
}

function wrapContextToolGroups<T>(
	groups: ContextToolGroup<T>[],
	maxRowWidth: number,
): ContextToolGroup<T>[][] {
	const rows: ContextToolGroup<T>[][] = []
	let current: ContextToolGroup<T>[] = []

	const flush = () => {
		if (current.length === 0) return
		rows.push(current)
		current = []
	}

	for (const group of groups) {
		let pending = getContextToolbarItemList(group)

		while (pending.length > 0) {
			let take = 0
			for (let count = 1; count <= pending.length; count += 1) {
				const segment = createGroupSegment(group, pending.slice(0, count))
				const nextRow = [...current, segment]
				const fits = getContextToolbarRowWidth(nextRow) <= maxRowWidth
				if (current.length === 0 && count === 1) {
					take = 1
					if (!fits) break
					continue
				}
				if (fits) {
					take = count
					continue
				}
				break
			}

			if (take === 0) {
				flush()
				continue
			}

			current.push(createGroupSegment(group, pending.slice(0, take)))
			pending = pending.slice(take)
			if (pending.length > 0) flush()
		}
	}

	flush()
	return rebalanceOrphanToolbarRows(rows.length > 0 ? rows : [[]], maxRowWidth)
}

/** Pull a trailing group down so a short last row is not left alone. */
export function rebalanceOrphanToolbarRows<T>(
	rows: ContextToolGroup<T>[][],
	maxRowWidth: number,
): ContextToolGroup<T>[][] {
	if (rows.length < 2) return rows
	const next = rows.map((row) => [...row])

	for (let index = next.length - 1; index > 0; index -= 1) {
		const last = next[index]
		const previous = next[index - 1]
		if (!last || !previous || last.length !== 1 || previous.length < 2) continue

		while (previous.length > 1) {
			const candidate = previous[previous.length - 1]
			if (!candidate) break
			const trial = [candidate, ...last]
			if (getContextToolbarRowWidth(trial) > maxRowWidth) break
			previous.pop()
			last.unshift(candidate)
			if (last.length >= 2) break
		}
	}

	return next.filter((row) => row.length > 0)
}

/**
 * Split context toolbar groups so each row fits `maxRowWidth`.
 * Prefer a balanced two-row split when both rows still fit.
 * Otherwise wrap and split group items to fill leftover space.
 */
export function partitionContextToolGroups<T>(
	groups: ContextToolGroup<T>[],
	maxRowWidth: number = CONTEXT_TOOLBAR_ROW_MAX_WIDTH,
): ContextToolGroup<T>[][] {
	if (groups.length <= 1) return [groups]
	if (getContextToolbarRowWidth(groups) <= maxRowWidth) return [groups]

	let bestSplit = 1
	let minMax = Number.POSITIVE_INFINITY

	for (let i = 1; i < groups.length; i += 1) {
		const row1Width = getContextToolbarRowWidth(groups.slice(0, i))
		const row2Width = getContextToolbarRowWidth(groups.slice(i))
		const max = Math.max(row1Width, row2Width)
		if (max < minMax) {
			minMax = max
			bestSplit = i
		}
	}

	const balanced = [groups.slice(0, bestSplit), groups.slice(bestSplit)]
	if (balanced.every((row) => getContextToolbarRowWidth(row) <= maxRowWidth)) {
		return balanced
	}

	return wrapContextToolGroups(groups, maxRowWidth)
}
