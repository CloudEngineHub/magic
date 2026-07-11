import type { TemplateCanvasPoint } from "./canvasLayout"

export const SLIDES_TEMPLATE_CANVAS_MIN_SCALE = 0.85
export const SLIDES_TEMPLATE_CANVAS_MAX_SCALE = 1.8

const WHEEL_ZOOM_INTENSITY = 0.0018
const TRACKPAD_PAN_DELTA_LIMIT = 48
const LINE_DELTA_PX = 16
const PAGE_DELTA_PX = 640
const DOM_DELTA_PIXEL = 0
const DOM_DELTA_LINE = 1
const DOM_DELTA_PAGE = 2

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max)
}

export function clampTemplateCanvasScale(scale: number) {
	return clamp(scale, SLIDES_TEMPLATE_CANVAS_MIN_SCALE, SLIDES_TEMPLATE_CANVAS_MAX_SCALE)
}

export function getNextTemplateCanvasScale(currentScale: number, deltaY: number) {
	return clampTemplateCanvasScale(currentScale * Math.exp(-deltaY * WHEEL_ZOOM_INTENSITY))
}

export function getZoomedTemplateCanvasOffset({
	clientX,
	clientY,
	currentOffset,
	currentScale,
	nextScale,
	viewportRect,
}: {
	clientX: number
	clientY: number
	currentOffset: TemplateCanvasPoint
	currentScale: number
	nextScale: number
	viewportRect: DOMRect
}): TemplateCanvasPoint {
	const focalPoint = {
		x: clientX - viewportRect.left - viewportRect.width / 2,
		y: clientY - viewportRect.top - viewportRect.height / 2,
	}
	const worldPoint = {
		x: (focalPoint.x - currentOffset.x) / currentScale,
		y: (focalPoint.y - currentOffset.y) / currentScale,
	}

	return {
		x: focalPoint.x - worldPoint.x * nextScale,
		y: focalPoint.y - worldPoint.y * nextScale,
	}
}

export function normalizeWheelDelta(delta: number, deltaMode: number) {
	if (deltaMode === DOM_DELTA_LINE) return delta * LINE_DELTA_PX
	if (deltaMode === DOM_DELTA_PAGE) return delta * PAGE_DELTA_PX
	return delta
}

export function isTrackpadPanWheel(event: WheelEvent, hasActivePanGesture = false) {
	if (event.ctrlKey || event.metaKey) return false
	if (event.deltaMode !== DOM_DELTA_PIXEL) return false

	return (
		hasActivePanGesture ||
		Math.abs(event.deltaX) > 0 ||
		Math.abs(event.deltaY) <= TRACKPAD_PAN_DELTA_LIMIT
	)
}
