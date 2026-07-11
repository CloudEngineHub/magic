import { SLIDES_TEMPLATE_CANVAS_STEP_Y, type TemplateCanvasItem } from "./canvasLayout"
import type { SlidesTemplateCanvasTile } from "./canvasInteraction"

const MIN_LOOP_COLUMN_ITEM_COUNT = 3
const BASE_LOOP_SPEED_PX_PER_SECOND = 10

export interface SlidesTemplateCanvasIdleLoop {
	column: number
	delay: number
	distance: number
	direction: -1 | 1
	duration: number
}

interface ResolveSlidesTemplateCanvasLoopItemsInput {
	allItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	currentY: number
	loopEndY: number
	visibleItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
}

export function resolveSlidesTemplateCanvasLoopItems({
	allItems,
	currentY,
	loopEndY,
	visibleItems,
}: ResolveSlidesTemplateCanvasLoopItemsInput) {
	if (visibleItems.length === 0) return []

	const visibleTop = Math.min(
		...visibleItems.map(({ position, size }) => position.y - size.height / 2),
	)
	const visibleBottom = Math.max(
		...visibleItems.map(({ position, size }) => position.y + size.height / 2),
	)
	const renderTop = visibleTop - SLIDES_TEMPLATE_CANVAS_STEP_Y
	const renderBottom = visibleBottom + SLIDES_TEMPLATE_CANVAS_STEP_Y
	const duplicateY = currentY - loopEndY

	return allItems.filter(({ position, size }) => {
		const halfHeight = size.height / 2
		return [currentY, duplicateY].some((offsetY) => {
			const itemTop = position.y + offsetY - halfHeight
			const itemBottom = position.y + offsetY + halfHeight
			return itemBottom >= renderTop && itemTop <= renderBottom
		})
	})
}

export function resolveSlidesTemplateCanvasIdleLoops(
	items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>,
): SlidesTemplateCanvasIdleLoop[] {
	const blockedColumns = new Set<number>()
	items.forEach(({ grid, span }) => {
		if (span.columns <= 1) return
		for (let column = grid.x; column < grid.x + span.columns; column += 1) {
			blockedColumns.add(column)
		}
	})

	const columnItems = new Map<number, Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>>()
	items.forEach((item) => {
		if (item.span.columns !== 1 || blockedColumns.has(item.grid.x)) return
		const currentItems = columnItems.get(item.grid.x) ?? []
		currentItems.push(item)
		columnItems.set(item.grid.x, currentItems)
	})

	return Array.from(columnItems.entries())
		.map(([column, currentItems]) => ({
			column,
			items: currentItems.sort((left, right) => left.grid.y - right.grid.y),
		}))
		.filter(({ items: currentItems }) => {
			if (currentItems.length < MIN_LOOP_COLUMN_ITEM_COUNT) return false

			return currentItems.every(
				(item, index) => index === 0 || item.grid.y === currentItems[index - 1].grid.y + 1,
			)
		})
		.sort((left, right) => left.column - right.column)
		.map(({ column, items: currentItems }) => {
			const distance = currentItems.length * SLIDES_TEMPLATE_CANVAS_STEP_Y
			const phase = Math.abs(column) % 3
			return {
				column,
				delay: phase * 0.65,
				distance,
				direction: (Math.abs(column) % 2 === 0 ? -1 : 1) as -1 | 1,
				duration: distance / (BASE_LOOP_SPEED_PX_PER_SECOND + phase * 1.5),
			}
		})
}
