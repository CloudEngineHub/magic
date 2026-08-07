import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum, type LayerElement } from "../../document/types"
import { VideoEditElement } from "../../elements/video-edit/VideoEditElement"
import { generateElementId } from "../../shared/ids"
import type { ConnectionHandleSide } from "./ConnectionHandleRenderer"

export interface VideoEditConnectionOrigin {
	originElementId?: string
	originSide?: ConnectionHandleSide
}

export interface VideoEditInputs {
	videoSequence: string[]
	audioSequence: string[]
}

function getChildren(element: LayerElement | undefined): LayerElement[] {
	if (!element || !("children" in element) || !Array.isArray(element.children)) {
		return []
	}
	return element.children
}

/**
 * 收集 Frame 内按文档顺序排列的视频和音频输入。
 * Group/Frame 可以继续嵌套，子元素优先读取 ElementManager 中的最新数据。
 */
export function collectFrameVideoEditInputs(
	canvas: Canvas,
	frameElementId: string,
): VideoEditInputs {
	const videoSequence: string[] = []
	const audioSequence: string[] = []
	const visited = new Set<string>()

	const visit = (element: LayerElement): void => {
		if (visited.has(element.id)) return
		visited.add(element.id)

		const latestElement = canvas.elementManager.getElementData(element.id) ?? element
		if (latestElement.type === ElementTypeEnum.Video) {
			videoSequence.push(latestElement.id)
		} else if (latestElement.type === ElementTypeEnum.Audio) {
			audioSequence.push(latestElement.id)
		}

		getChildren(latestElement).forEach(visit)
	}

	const frame = canvas.elementManager.getElementData(frameElementId)
	if (frame?.type !== ElementTypeEnum.Frame) {
		return { videoSequence, audioSequence }
	}

	getChildren(frame).forEach(visit)
	return { videoSequence, audioSequence }
}

export function canCreateVideoEditFromFrameConnection(
	canvas: Canvas | null | undefined,
	context: VideoEditConnectionOrigin | null | undefined,
): boolean {
	if (!canvas || !context?.originElementId || context.originSide !== "right") {
		return false
	}

	const frame = canvas.elementManager.getElementData(context.originElementId)
	if (frame?.type !== ElementTypeEnum.Frame) return false

	return collectFrameVideoEditInputs(canvas, context.originElementId).videoSequence.length > 0
}

export function getVideoEditConnectionCreateSize(): { width: number; height: number } {
	const config = VideoEditElement.getDefaultConfig()
	return { width: config.width, height: config.height }
}

export interface CreateVideoEditFromFrameConnectionOptions extends VideoEditConnectionOrigin {
	x: number
	y: number
}

export function createVideoEditFromFrameConnection(
	canvas: Canvas,
	options: CreateVideoEditFromFrameConnectionOptions,
): string | null {
	if (!canCreateVideoEditFromFrameConnection(canvas, options)) return null

	const originElementId = options.originElementId
	if (!originElementId) return null

	const inputs = collectFrameVideoEditInputs(canvas, originElementId)
	const elementId = generateElementId()
	const element = VideoEditElement.createElementData({
		id: elementId,
		x: options.x,
		y: options.y,
		zIndex: canvas.elementManager.getNextZIndexInLevel(),
		videoSequence: inputs.videoSequence,
		audioSequence: inputs.audioSequence,
	})

	canvas.elementManager.create(element)
	const connection = canvas.connectionManager.connectElements({
		sourceElementId: originElementId,
		targetElementId: elementId,
	})
	if (connection.status !== "created") {
		canvas.elementManager.delete(elementId)
		return null
	}

	canvas.selectionManager.select(elementId)
	requestAnimationFrame(() => {
		if (!canvas.elementManager.hasElement(elementId)) return
		if (canvas.viewportController.isElementInViewport([elementId])) return
		canvas.viewportController.moveElementToViewport([elementId], {
			animated: true,
			padding: { top: 50, right: 50, bottom: 50, left: 100 },
		})
	})

	return elementId
}
