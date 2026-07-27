import type { Canvas } from "../../../../runtime/core/Canvas"
import { VideoElement as VideoElementClass } from "../../../../runtime/elements/video/VideoElement"
import { ElementTypeEnum, type VideoElement } from "../../../../runtime/document/types"
import { calculateNewElementPosition, generateElementId } from "../../../../runtime/shared/ids"
import type { GenerateVideoRequest } from "../../../../public/magic-types"
import { calculateCanvasSizeFromAspectRatio } from "../generation/video-editor-config.generation"
import { hasVideoGenerationRequestSubmitIntent } from "../../../../runtime/shared/videoGenerationRequestIntent"

interface CreateAndSubmitVideoGenerationOptions {
	canvas: Canvas | null | undefined
	sourceVideoElement: VideoElement
	request: GenerateVideoRequest
	newElementSize?: { width: number; height: number } | null
}

export async function createAndSubmitVideoGeneration(
	options: CreateAndSubmitVideoGenerationOptions,
): Promise<boolean> {
	const { canvas, sourceVideoElement, request, newElementSize } = options
	if (!canvas || !request.model_id || !hasVideoGenerationRequestSubmitIntent(request)) {
		return false
	}

	const sourceElementInstance = canvas.elementManager.getElementInstance(sourceVideoElement.id)
	if (!(sourceElementInstance instanceof VideoElementClass)) {
		return false
	}

	const newPosition = calculateNewElementPosition(
		sourceVideoElement,
		sourceElementInstance,
		canvas.elementManager,
	)
	if (!newPosition) {
		return false
	}

	const newElementId = generateElementId()
	const newZIndex = canvas.elementManager.getNextZIndexInLevel()
	const resolvedNewElementSize =
		normalizeVideoElementSize(newElementSize) ??
		calculateCanvasSizeFromAspectRatio(request.generation?.aspect_ratio) ??
		normalizeVideoElementSize(sourceVideoElement)
	const size = VideoElementClass.getDefaultConfig(
		resolvedNewElementSize?.width,
		resolvedNewElementSize?.height,
	)

	const newVideoElement: VideoElement = {
		id: newElementId,
		type: ElementTypeEnum.Video,
		x: newPosition.x,
		y: newPosition.y,
		...size,
		zIndex: newZIndex,
	}

	canvas.elementManager.create(newVideoElement)
	canvas.selectionManager.select(newElementId)

	const newElementInstance = canvas.elementManager.getElementInstance(newElementId)
	if (!(newElementInstance instanceof VideoElementClass)) {
		return false
	}

	const requestToSubmit: GenerateVideoRequest = {
		...request,
		prompt: request.prompt?.trim() || undefined,
	}
	newElementInstance.saveTempGenerateVideoRequest(requestToSubmit)

	return newElementInstance.generateVideo(requestToSubmit)
}

function normalizeVideoElementSize(
	size?: { width?: number; height?: number } | null,
): { width: number; height: number } | null {
	if (!size) return null
	const { width, height } = size
	if (!Number.isFinite(width) || !Number.isFinite(height)) return null
	if (!width || !height || width <= 0 || height <= 0) return null
	return {
		width,
		height,
	}
}
