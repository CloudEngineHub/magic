import type { FrameElement, LayerElement } from "../../document/types"
import { FrameElement as FrameElementClass } from "../../elements/frame/FrameElement"

export const FRAME_CONTENT_PADDING_RATIO = 0.05

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

/**
 * 画框四周 padding 默认占最终画框长边的 5%。
 * 设内容长边为 L、padding 为 P，则 L + 2P 为画框长边，P = 5% * (L + 2P)，因此 P = L / 18。
 */
export function resolveFrameContentLayout(
	size: ContentFrameSize,
	options: { padding?: number } = {},
): FrameContentLayout {
	const contentWidth = Math.max(0, size.width)
	const contentHeight = Math.max(0, size.height)
	const contentLongEdge = Math.max(contentWidth, contentHeight)
	const padding = Math.max(
		0,
		options.padding ??
			(contentLongEdge * FRAME_CONTENT_PADDING_RATIO) / (1 - FRAME_CONTENT_PADDING_RATIO * 2),
	)

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
