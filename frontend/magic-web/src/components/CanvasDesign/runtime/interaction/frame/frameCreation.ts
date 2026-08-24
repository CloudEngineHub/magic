import type { FrameElement, LayerElement } from "../../document/types"
import { FrameElement as FrameElementClass } from "../../elements/frame/FrameElement"

export const FRAME_CONTENT_PADDING_RATIO = 0.08
export const FRAME_CONTENT_VERTICAL_GAP = 50

export interface FrameContentLayout {
	padding: number
	width: number
	height: number
}

interface ContentFrameSize {
	width: number
	height: number
}

interface CreateContentFrameDataOptions extends ContentFrameSize {
	id: string
	x: number
	y: number
	zIndex: number
	name?: string
	children?: LayerElement[]
	padding?: number
}

/** 画框四周 padding 默认取内容短边的 8%。 */
export function resolveFrameContentLayout(
	size: ContentFrameSize,
	options: { padding?: number } = {},
): FrameContentLayout {
	const contentWidth = Math.max(0, size.width)
	const contentHeight = Math.max(0, size.height)
	const contentShortEdge = Math.min(contentWidth, contentHeight)
	const padding = Math.max(0, options.padding ?? contentShortEdge * FRAME_CONTENT_PADDING_RATIO)

	return {
		padding,
		width: contentWidth + padding * 2,
		height: contentHeight + padding * 2,
	}
}

/** 统一创建“包裹内容”的画框数据；调用方负责创建元素和处理事务。 */
export function createContentFrameData(options: CreateContentFrameDataOptions): {
	frameData: FrameElement
	layout: FrameContentLayout
} {
	const layout = resolveFrameContentLayout(options, { padding: options.padding })
	const frameData: FrameElement = {
		...FrameElementClass.createElementData(
			options.id,
			options.x,
			options.y,
			layout.width,
			layout.height,
			options.zIndex,
		),
		...(options.name ? { name: options.name } : {}),
		...(options.children ? { children: options.children } : {}),
	}

	return { frameData, layout }
}

/** 纵向堆叠子元素时，计算指定索引相对内容区顶部的偏移。 */
export function getVerticalFrameContentOffset(heights: number[], index: number): number {
	return heights
		.slice(0, index)
		.reduce((total, height) => total + height + FRAME_CONTENT_VERTICAL_GAP, 0)
}

/** 纵向堆叠子元素所需的内容区高度，不含 Frame padding。 */
export function getVerticalFrameContentHeight(heights: number[]): number {
	return (
		heights.reduce((total, height) => total + height, 0) +
		Math.max(0, heights.length - 1) * FRAME_CONTENT_VERTICAL_GAP
	)
}
