import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum } from "../../document/types"

interface TextSize {
	width: number
	height: number
}

export interface MediaLabelLayout {
	inverseScale: number
	nameWidth: number
	showSize: boolean
	showOperation: boolean
	hasSpace: boolean
}

export interface MediaLabelLayoutOptions {
	name: TextSize
	size: TextSize
	fontSize: number
	offsetTop: number
	gap: number
	operationScreenWidth: number
}

/** 缩略图至少容纳四个字高时维持标准字号；再缩小就让文字一起缩小。 */
const THUMBNAIL_FONT_HEIGHTS = 4

interface CachedLayout {
	key: string
	layout: MediaLabelLayout
}

const layoutsByCanvas = new WeakMap<Canvas, WeakMap<object, CachedLayout>>()

/** 几何、显示状态或层级改变时，邻图预算必须重新计算。 */
export function invalidateMediaLabelLayouts(canvas: Canvas): void {
	layoutsByCanvas.delete(canvas)
}

/**
 * 整行只从完整文本和当前几何计算，名称/尺寸管理器的调用顺序不会改变结果。
 * 标题先占宽度，只有两项能完整并排时才显示分辨率；隐藏不影响下次度量。
 */
export function getMediaLabelLayout(
	canvas: Canvas,
	elementId: string,
	options: MediaLabelLayoutOptions,
): MediaLabelLayout | null {
	const element = canvas.elementManager.getElementInstance(elementId)
	const type = element?.getData().type
	if (!element || (type !== ElementTypeEnum.Image && type !== ElementTypeEnum.Video)) return null
	const bounds = element.getBoundingRect()
	if (!bounds) return null
	const viewportScale = canvas.stage.scaleX()
	const scale = Number.isFinite(viewportScale) && viewportScale > 0 ? viewportScale : 1
	let layouts = layoutsByCanvas.get(canvas)
	if (!layouts) {
		layouts = new WeakMap()
		layoutsByCanvas.set(canvas, layouts)
	}
	const key = [
		canvas.geometryCacheManager.getRevision(),
		scale,
		bounds.x,
		bounds.y,
		bounds.width,
		bounds.height,
		options.name.width,
		options.name.height,
		options.size.width,
		options.size.height,
		options.fontSize,
		options.offsetTop,
		options.gap,
		options.operationScreenWidth,
	].join(":")
	const cached = layouts.get(element)
	if (cached?.key === key) return cached.layout
	const rowHeight = Math.max(options.name.height, options.size.height) + options.offsetTop
	const operationExtraHeight = Math.max(0, options.operationScreenWidth - options.name.height) / 2
	let availableHeight = (rowHeight + operationExtraHeight) / scale
	const parentId = canvas.elementManager.findParentIdForElement(elementId)
	const candidates = canvas.geometryCacheManager.queryElementIdsByExpandedRect(
		{
			x: bounds.x,
			y: bounds.y - availableHeight,
			width: bounds.width,
			height: availableHeight,
		},
		0,
	)
	for (const candidateId of candidates) {
		if (candidateId === elementId) continue
		const candidate = canvas.elementManager.getElementInstance(candidateId)
		const candidateType = candidate?.getData().type
		if (
			!candidate ||
			(candidateType !== ElementTypeEnum.Image && candidateType !== ElementTypeEnum.Video) ||
			canvas.elementManager.findParentIdForElement(candidateId) !== parentId
		)
			continue
		const node = candidate.getNode()
		if (!node?.isVisible() || node.getAbsoluteOpacity() === 0) continue
		const other = candidate.getBoundingRect()
		if (!other || other.x >= bounds.x + bounds.width || other.x + other.width <= bounds.x)
			continue
		const distance = bounds.y - (other.y + other.height)
		// 只约束本体不相交的上排媒体；真实叠放仍遵守原有 zIndex 遮挡规则。
		if (distance >= 0) availableHeight = Math.min(availableHeight, distance)
	}
	const screenRatio = Math.max(
		0,
		Math.min(
			1,
			(bounds.height * scale) / (options.fontSize * THUMBNAIL_FONT_HEIGHTS),
			(availableHeight * scale) / rowHeight,
		),
	)
	if (screenRatio <= 0 || bounds.width <= 0) {
		const layout = {
			inverseScale: 1 / scale,
			nameWidth: 0,
			showSize: false,
			showOperation: false,
			hasSpace: false,
		}
		layouts.set(element, { key, layout })
		return layout
	}
	const screenWidth = bounds.width * scale
	// 操作区保持可点击尺寸；连一个字都留不下时不强塞按钮，优先显示标题。
	const showOperation =
		options.operationScreenWidth > 0 &&
		screenRatio === 1 &&
		availableHeight * scale >= rowHeight + operationExtraHeight &&
		screenWidth >= options.operationScreenWidth + options.fontSize * screenRatio
	const operationWidth = showOperation ? options.operationScreenWidth : 0
	const localWidth = Math.max(0, (screenWidth - operationWidth) / screenRatio)
	const gap = options.name.width > 0 && options.size.width > 0 ? options.gap : 0
	const showSize =
		options.size.width > 0 && options.name.width + gap + options.size.width <= localWidth
	const layout = {
		inverseScale: screenRatio / scale,
		nameWidth: Math.min(
			options.name.width,
			localWidth - (showSize ? options.size.width + gap : 0),
		),
		showSize,
		showOperation,
		hasSpace: true,
	}
	layouts.set(element, { key, layout })
	return layout
}
