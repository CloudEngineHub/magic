import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { localeTextToDisplayString } from "@/pages/superMagic/components/MainInputContainer/panels/utils"
import { type TemplateCanvasDirection, type TemplateCanvasPoint } from "./canvasLayout"
import { getSlidesTemplateCardImageUrl } from "./slidesTemplateImages"

const EDGE_SIZE = 126
const MAX_SPEED = 8
const MIN_LOAD_MORE_THRESHOLD = 640
const MAX_LOAD_MORE_THRESHOLD = 960
const VIEWPORT_LOAD_MORE_THRESHOLD_RATIO = 0.8

export const LOAD_MORE_INTERVAL_MS = 450
export const CANVAS_END_PADDING = 96
export const EAGER_TEMPLATE_COVER_COUNT = 36

const CANVAS_DRAG_BLOCK_SELECTOR =
	'button, a, input, textarea, select, iframe, [data-slides-template-drag-block="true"]'

export const CANVAS_DRAG_START_THRESHOLD = 4

export type CanvasEdgeCursor =
	| "n-resize"
	| "ne-resize"
	| "e-resize"
	| "se-resize"
	| "s-resize"
	| "sw-resize"
	| "w-resize"
	| "nw-resize"

export interface CanvasDragState {
	hasMoved: boolean
	lastClientX: number
	lastClientY: number
	pointerId: number
	startClientX: number
	startClientY: number
}

export interface SlidesTemplateCanvasTile {
	id: string
	imageUrl?: string
	kind: "cover"
	template: OptionItem
}

export const SLIDES_TEMPLATE_CANVAS_FILLER_ID_MARKER = ":filler:"

export function isSlidesTemplateCanvasFiller(tile: SlidesTemplateCanvasTile) {
	return tile.id.includes(SLIDES_TEMPLATE_CANVAS_FILLER_ID_MARKER)
}

export interface SlidesTemplatePreviewFocus {
	anchorTileId: string
	tile: SlidesTemplateCanvasTile
}

export function getTemplateKey(template: OptionItem) {
	return localeTextToDisplayString(template.value)
}

export function getTemplateCoverUrl(template: OptionItem) {
	return getSlidesTemplateCardImageUrl(
		template.thumbnail_url ?? template.preview_image_urls?.[0] ?? template.collage_url,
	)
}

function dedupeUrls(urls: Array<string | null | undefined>) {
	const seenUrls = new Set<string>()
	return urls.filter((url): url is string => {
		if (!url || seenUrls.has(url)) return false
		seenUrls.add(url)
		return true
	})
}

export function getTemplatePreviewUrls(template: OptionItem | null | undefined) {
	if (!template) return []
	const previewImageUrls = dedupeUrls(template.preview_image_urls ?? [])
	if (previewImageUrls.length) return previewImageUrls
	if (template.thumbnail_url) return [template.thumbnail_url]
	return []
}

export function buildTemplateCanvasTiles(templates: OptionItem[]): SlidesTemplateCanvasTile[] {
	const occurrenceByStableKey = new Map<string, number>()

	return templates.map((template, index) => {
		const stableKey =
			getTemplateKey(template) ||
			getTemplateCoverUrl(template) ||
			localeTextToDisplayString(template.label) ||
			`template-${index}`
		const occurrence = occurrenceByStableKey.get(stableKey) ?? 0
		occurrenceByStableKey.set(stableKey, occurrence + 1)
		const duplicateSuffix = occurrence > 0 ? `:duplicate-${occurrence}` : ""
		return {
			// 唯一模板不使用数组下标，筛选插入新结果时 React 可以保留原卡片实例。
			id: `${stableKey}:cover${duplicateSuffix}`,
			imageUrl: getTemplateCoverUrl(template),
			kind: "cover",
			template,
		}
	})
}

export function getEdgeVelocity(rect: DOMRect, point: { clientX: number; clientY: number }) {
	const leftDistance = point.clientX - rect.left
	const rightDistance = rect.right - point.clientX
	const topDistance = point.clientY - rect.top
	const bottomDistance = rect.bottom - point.clientY
	const velocity = { x: 0, y: 0 }

	if (leftDistance < EDGE_SIZE) velocity.x += ((EDGE_SIZE - leftDistance) / EDGE_SIZE) * MAX_SPEED
	if (rightDistance < EDGE_SIZE)
		velocity.x -= ((EDGE_SIZE - rightDistance) / EDGE_SIZE) * MAX_SPEED
	if (topDistance < EDGE_SIZE) velocity.y += ((EDGE_SIZE - topDistance) / EDGE_SIZE) * MAX_SPEED
	if (bottomDistance < EDGE_SIZE)
		velocity.y -= ((EDGE_SIZE - bottomDistance) / EDGE_SIZE) * MAX_SPEED

	return velocity
}

export function getCanvasEdgeCursor(
	rect: DOMRect,
	point: { clientX: number; clientY: number },
): CanvasEdgeCursor | null {
	if (
		point.clientX < rect.left ||
		point.clientX > rect.right ||
		point.clientY < rect.top ||
		point.clientY > rect.bottom
	) {
		return null
	}

	const isNearLeft = point.clientX - rect.left < EDGE_SIZE
	const isNearRight = rect.right - point.clientX < EDGE_SIZE
	const isNearTop = point.clientY - rect.top < EDGE_SIZE
	const isNearBottom = rect.bottom - point.clientY < EDGE_SIZE

	if (isNearTop && isNearLeft) return "nw-resize"
	if (isNearTop && isNearRight) return "ne-resize"
	if (isNearBottom && isNearRight) return "se-resize"
	if (isNearBottom && isNearLeft) return "sw-resize"
	if (isNearTop) return "n-resize"
	if (isNearRight) return "e-resize"
	if (isNearBottom) return "s-resize"
	if (isNearLeft) return "w-resize"
	return null
}

export function getDirectionsFromVelocity(
	velocity: TemplateCanvasPoint,
): TemplateCanvasDirection[] {
	const directions: TemplateCanvasDirection[] = []
	if (velocity.x > 0.2) directions.push("left")
	if (velocity.x < -0.2) directions.push("right")
	if (velocity.y > 0.2) directions.push("up")
	if (velocity.y < -0.2) directions.push("down")
	return directions
}

export function getLoadMoreThreshold(viewportWidth: number, viewportHeight: number) {
	const viewportThreshold =
		Math.max(viewportWidth, viewportHeight) * VIEWPORT_LOAD_MORE_THRESHOLD_RATIO

	return Math.min(MAX_LOAD_MORE_THRESHOLD, Math.max(MIN_LOAD_MORE_THRESHOLD, viewportThreshold))
}

export function isSameCanvasPoint(a: TemplateCanvasPoint, b: TemplateCanvasPoint) {
	return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01
}

export function getPriorityWeightedRandomIndex(itemCount: number, randomValue = Math.random()) {
	if (itemCount <= 1) return 0

	// 排名越靠前权重越高，但使用平方根衰减，避免后排模板概率快速接近零。
	const weights = Array.from({ length: itemCount }, (_, index) => 1 / Math.sqrt(index + 1))
	const totalWeight = weights.reduce((total, weight) => total + weight, 0)
	const normalizedRandomValue = Math.min(Math.max(randomValue, 0), 1 - Number.EPSILON)
	let remainingWeight = normalizedRandomValue * totalWeight

	for (let index = 0; index < weights.length; index += 1) {
		remainingWeight -= weights[index] ?? 0
		if (remainingWeight < 0) return index
	}

	return itemCount - 1
}

export function isCanvasDragBlockedTarget(target: EventTarget | null) {
	return target instanceof Element && Boolean(target.closest(CANVAS_DRAG_BLOCK_SELECTOR))
}
