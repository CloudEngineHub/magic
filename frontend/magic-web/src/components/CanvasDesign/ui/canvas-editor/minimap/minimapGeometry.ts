import type { Rect } from "../../../runtime/shared/ids"

export interface MinimapSize {
	width: number
	height: number
}

export interface MinimapTransform {
	scale: number
	offsetX: number
	offsetY: number
}

export interface MinimapPoint {
	x: number
	y: number
}

function isFiniteNumber(value: number): boolean {
	return Number.isFinite(value)
}

export function isDrawableMinimapRect(rect: Rect | null | undefined): rect is Rect {
	return Boolean(
		rect &&
		isFiniteNumber(rect.x) &&
		isFiniteNumber(rect.y) &&
		isFiniteNumber(rect.width) &&
		isFiniteNumber(rect.height) &&
		rect.width > 0 &&
		rect.height > 0,
	)
}

export function mergeMinimapRects(rects: readonly Rect[]): Rect | null {
	const drawableRects = rects.filter(isDrawableMinimapRect)
	if (drawableRects.length === 0) return null

	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity

	for (const rect of drawableRects) {
		minX = Math.min(minX, rect.x)
		minY = Math.min(minY, rect.y)
		maxX = Math.max(maxX, rect.x + rect.width)
		maxY = Math.max(maxY, rect.y + rect.height)
	}

	return {
		x: minX,
		y: minY,
		width: maxX - minX,
		height: maxY - minY,
	}
}

export function createMinimapTransform(
	worldBounds: Rect,
	panelSize: MinimapSize,
	padding: number,
): MinimapTransform | null {
	if (
		!isDrawableMinimapRect(worldBounds) ||
		!isFiniteNumber(panelSize.width) ||
		!isFiniteNumber(panelSize.height) ||
		panelSize.width <= 0 ||
		panelSize.height <= 0
	) {
		return null
	}

	const safePadding = Math.max(0, padding)
	const drawableWidth = Math.max(1, panelSize.width - safePadding * 2)
	const drawableHeight = Math.max(1, panelSize.height - safePadding * 2)
	const scale = Math.min(drawableWidth / worldBounds.width, drawableHeight / worldBounds.height)
	const renderedWidth = worldBounds.width * scale
	const renderedHeight = worldBounds.height * scale

	return {
		scale,
		offsetX: (panelSize.width - renderedWidth) / 2 - worldBounds.x * scale,
		offsetY: (panelSize.height - renderedHeight) / 2 - worldBounds.y * scale,
	}
}

export function projectMinimapRect(rect: Rect, transform: MinimapTransform, minimumSize = 0): Rect {
	let x = rect.x * transform.scale + transform.offsetX
	let y = rect.y * transform.scale + transform.offsetY
	let width = rect.width * transform.scale
	let height = rect.height * transform.scale

	if (minimumSize > 0 && width < minimumSize) {
		x -= (minimumSize - width) / 2
		width = minimumSize
	}
	if (minimumSize > 0 && height < minimumSize) {
		y -= (minimumSize - height) / 2
		height = minimumSize
	}

	return { x, y, width, height }
}

export function unprojectMinimapPoint(
	point: MinimapPoint,
	transform: MinimapTransform,
): MinimapPoint | null {
	if (!isFiniteNumber(transform.scale) || transform.scale <= 0) return null
	return {
		x: (point.x - transform.offsetX) / transform.scale,
		y: (point.y - transform.offsetY) / transform.scale,
	}
}

export function isPointInsideMinimapRect(point: MinimapPoint, rect: Rect): boolean {
	return (
		point.x >= rect.x &&
		point.x <= rect.x + rect.width &&
		point.y >= rect.y &&
		point.y <= rect.y + rect.height
	)
}
