import {
	SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT,
	SLIDES_TEMPLATE_CANVAS_CARD_WIDTH,
	SLIDES_TEMPLATE_CANVAS_STEP_X,
	SLIDES_TEMPLATE_CANVAS_STEP_Y,
	type TemplateCanvasItem,
	type TemplateCanvasPoint,
} from "./canvasLayout"

const VISIBLE_OVERSCAN_X = SLIDES_TEMPLATE_CANVAS_CARD_WIDTH
const VISIBLE_OVERSCAN_Y = SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT * 2
const MIN_VISIBLE_TEMPLATE_CANVAS_ITEMS = 72
export const MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS = 112

interface TemplateCanvasViewportWindowInput {
	offset: TemplateCanvasPoint
	overscanX?: number
	overscanY?: number
	scale?: number
	viewportHeight: number
	viewportWidth: number
}

interface TemplateCanvasVisibleItemInput<T> extends TemplateCanvasViewportWindowInput {
	getItemRenderPriority?: (item: TemplateCanvasItem<T>) => number
	items: Array<TemplateCanvasItem<T>>
	maxItems?: number
}

export interface TemplateCanvasViewportWindow {
	bottom: number
	left: number
	right: number
	top: number
}

export function getTemplateCanvasViewportWindow({
	offset,
	overscanX = VISIBLE_OVERSCAN_X,
	overscanY = VISIBLE_OVERSCAN_Y,
	scale = 1,
	viewportHeight,
	viewportWidth,
}: TemplateCanvasViewportWindowInput): TemplateCanvasViewportWindow {
	const halfWidth = viewportWidth / 2
	const halfHeight = viewportHeight / 2
	const normalizedScale = Math.max(scale, 0.01)

	return {
		left: (-offset.x - halfWidth - overscanX) / normalizedScale,
		right: (-offset.x + halfWidth + overscanX) / normalizedScale,
		top: (-offset.y - halfHeight - overscanY) / normalizedScale,
		bottom: (-offset.y + halfHeight + overscanY) / normalizedScale,
	}
}

export function isTemplateCanvasItemInWindow<T>(
	item: TemplateCanvasItem<T>,
	windowBounds: TemplateCanvasViewportWindow,
) {
	const halfWidth = item.size.width / 2
	const halfHeight = item.size.height / 2
	const itemLeft = item.position.x - halfWidth
	const itemRight = item.position.x + halfWidth
	const itemTop = item.position.y - halfHeight
	const itemBottom = item.position.y + halfHeight

	return (
		itemRight >= windowBounds.left &&
		itemLeft <= windowBounds.right &&
		itemBottom >= windowBounds.top &&
		itemTop <= windowBounds.bottom
	)
}

function clampVisibleItemLimit(limit: number) {
	return Math.min(
		Math.max(limit, MIN_VISIBLE_TEMPLATE_CANVAS_ITEMS),
		MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS,
	)
}

export function getTemplateCanvasVisibleItemLimit({
	overscanX = VISIBLE_OVERSCAN_X,
	overscanY = VISIBLE_OVERSCAN_Y,
	scale = 1,
	viewportHeight,
	viewportWidth,
}: Omit<TemplateCanvasViewportWindowInput, "offset">) {
	const normalizedScale = Math.max(scale, 0.01)
	const worldWidth = (viewportWidth + overscanX * 2) / normalizedScale
	const worldHeight = (viewportHeight + overscanY * 2) / normalizedScale
	const columnCount = Math.ceil(worldWidth / SLIDES_TEMPLATE_CANVAS_STEP_X) + 2
	const rowCount = Math.ceil(worldHeight / SLIDES_TEMPLATE_CANVAS_STEP_Y) + 2

	return clampVisibleItemLimit(columnCount * rowCount)
}

export function getVisibleTemplateCanvasItems<T>({
	getItemRenderPriority,
	items,
	maxItems,
	offset,
	overscanX,
	overscanY,
	scale,
	viewportHeight,
	viewportWidth,
}: TemplateCanvasVisibleItemInput<T>) {
	const windowBounds = getTemplateCanvasViewportWindow({
		offset,
		overscanX,
		overscanY,
		scale,
		viewportHeight,
		viewportWidth,
	})

	const visibleItemLimit =
		maxItems ??
		getTemplateCanvasVisibleItemLimit({
			overscanX,
			overscanY,
			scale,
			viewportHeight,
			viewportWidth,
		})
	const visibleItems = items.filter((item) => isTemplateCanvasItemInWindow(item, windowBounds))
	if (visibleItems.length <= visibleItemLimit) return visibleItems

	const centerX = (windowBounds.left + windowBounds.right) / 2
	const centerY = (windowBounds.top + windowBounds.bottom) / 2

	return visibleItems
		.map((item, order) => ({ item, order }))
		.sort((a, b) => {
			const priorityA = getItemRenderPriority?.(a.item) ?? 0
			const priorityB = getItemRenderPriority?.(b.item) ?? 0
			if (priorityA !== priorityB) return priorityA - priorityB

			const distanceA =
				Math.pow(a.item.position.x - centerX, 2) + Math.pow(a.item.position.y - centerY, 2)
			const distanceB =
				Math.pow(b.item.position.x - centerX, 2) + Math.pow(b.item.position.y - centerY, 2)
			if (distanceA !== distanceB) return distanceA - distanceB

			return a.order - b.order
		})
		.slice(0, visibleItemLimit)
		.map(({ item }) => item)
}
