import type { ImageModelItem } from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum, type StoryboardGenerationConfig } from "../../document/types"
import { StoryboardElement } from "../../elements/storyboard/StoryboardElement"
import { generateElementId } from "../../shared/ids"
import type { ConnectionHandleSide } from "./ConnectionHandleRenderer"
import { collectConnectedFrameSourceElements } from "./connectedInputSources"

export interface StoryboardConnectionOrigin {
	originElementId?: string
	originSide?: ConnectionHandleSide
}

interface CreateStoryboardFromConnectionOptions extends StoryboardConnectionOrigin {
	x: number
	y: number
	imageModelList: ImageModelItem[]
}

function cloneStoredGenerationConfig(
	config: Partial<StoryboardGenerationConfig> | undefined,
): StoryboardGenerationConfig | undefined {
	if (!config) return undefined

	const result: StoryboardGenerationConfig = {}
	if (config.model_id !== undefined) result.model_id = config.model_id
	if (config.size !== undefined) result.size = config.size
	if (config.resolution !== undefined) result.resolution = config.resolution
	if (config.image_generation_config !== undefined) {
		result.image_generation_config = { ...config.image_generation_config }
	}

	return Object.keys(result).length > 0 ? result : undefined
}

function resolveModelDefaultImageGenerationConfig(
	model: ImageModelItem,
): StoryboardGenerationConfig["image_generation_config"] | undefined {
	const result: Record<string, string> = {}
	model.image_size_config?.image_settings?.forEach((setting) => {
		const prefix = "image_generation_config."
		if (!setting.key.startsWith(prefix)) return
		const key = setting.key.slice(prefix.length)
		if (!key) return
		result[key] = setting.default
	})
	return Object.keys(result).length > 0 ? result : undefined
}

export function canCreateStoryboardFromConnection(
	canvas: Canvas | null | undefined,
	context: StoryboardConnectionOrigin | null | undefined,
): boolean {
	if (!canvas || !context?.originElementId || context.originSide !== "right") {
		return false
	}

	const originElement = canvas.elementManager.getElementData(context.originElementId)
	if (originElement?.type === ElementTypeEnum.Image) return true
	if (originElement?.type !== ElementTypeEnum.Frame) return false

	return collectConnectedFrameSourceElements(originElement.id, originElement).some(
		({ element }) => element.type === ElementTypeEnum.Image,
	)
}

export function getStoryboardConnectionCreateSize(): { width: number; height: number } {
	const config = StoryboardElement.getDefaultConfig()
	return { width: config.width, height: config.height }
}

export function resolveStoryboardConnectionGenerationConfig(
	canvas: Canvas,
	imageModelList: ImageModelItem[],
): StoryboardGenerationConfig | undefined {
	const storedConfig = cloneStoredGenerationConfig(
		canvas.magicConfigManager.config?.methods?.getRootStorage?.()?.defaultGenerateImageConfig,
	)
	if (storedConfig) return storedConfig

	const model = imageModelList[0]
	if (!model) return undefined
	const size = model.image_size_config?.sizes?.[0]
	return {
		model_id: model.model_id,
		size: size?.value,
		resolution: size?.scale ?? model.image_size_config?.default_scale,
		image_generation_config: resolveModelDefaultImageGenerationConfig(model),
	}
}

export function createStoryboardFromConnection(
	canvas: Canvas,
	options: CreateStoryboardFromConnectionOptions,
): string | null {
	if (!canCreateStoryboardFromConnection(canvas, options)) return null
	const originElementId = options.originElementId
	if (!originElementId) return null

	const elementId = generateElementId()
	const element = StoryboardElement.createElementData({
		id: elementId,
		x: options.x,
		y: options.y,
		zIndex: canvas.elementManager.getNextZIndexInLevel(),
		generationConfig: resolveStoryboardConnectionGenerationConfig(
			canvas,
			options.imageModelList,
		),
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

/** @deprecated Use createStoryboardFromConnection. */
export const createStoryboardFromImageConnection = createStoryboardFromConnection
