import { withHistoryManagerAsync } from "../../canvas/utils/elementUtils"
import type { Canvas } from "../../canvas/Canvas"
import { ImageBatchPollingManager } from "../../canvas/utils/ImageBatchPollingManager"
import { createBatchImageTaskMeta } from "../../canvas/utils/imageGenerationTaskMeta"
import { generateUUID } from "../../canvas/utils/utils"
import type { GenerateImageRequest, GenerateImagesRequest, ImageModelItem } from "../../types.magic"
import type { PluginGenerateAndPlaceParams } from "./runtime/v1"

const DEFAULT_MAX_OUTPUT_IMAGES = 4

export async function getPluginImageModels(canvas: Canvas) {
	const getImageModelList = canvas.magicConfigManager.config?.methods?.getImageModelList
	if (!getImageModelList) {
		throw new Error("getImageModelList method not available.")
	}
	const models = await getImageModelList()
	return models.map(sanitizePluginImageModel)
}

export async function generatePluginImages(canvas: Canvas, params: PluginGenerateAndPlaceParams) {
	if (canvas.readonly) {
		throw new Error("Canvas is readonly.")
	}
	const methods = canvas.magicConfigManager.config?.methods
	if (!methods?.generateImages || !methods?.getImageGenerationResults) {
		throw new Error("generateImages or getImageGenerationResults method not available.")
	}
	const generateImages = methods.generateImages
	if (!params.model_id || !params.prompt) {
		throw new Error("model_id and prompt are required.")
	}

	const maxOutputImages = await getPluginMaxOutputImages(canvas, params.model_id)
	const count = resolvePluginGenerateCount(params, maxOutputImages)
	const [sizeWidth, sizeHeight] = params.size?.split("x").map(Number) ?? []
	const width = params.width ?? (Number.isFinite(sizeWidth) ? sizeWidth : undefined)
	const height = params.height ?? (Number.isFinite(sizeHeight) ? sizeHeight : undefined)
	const batchImageId = generateUUID()
	const request: GenerateImagesRequest = {
		image_id: batchImageId,
		model_id: params.model_id,
		prompt: params.prompt,
		size: params.size,
		resolution: params.resolution,
		reference_images: params.reference_images,
		reference_image_options: params.reference_image_options,
		image_generation_config: params.image_generation_config,
		generate_num: count,
	}
	const { image_id, generate_num, ...generateImageRequest } = request

	const elementIds = await withHistoryManagerAsync(canvas.historyManager, async () => {
		const nextElementIds = canvas.toolManager
			.getImageGeneratorTool()
			.createImageElementsNearViewport(count, width, height)

		nextElementIds.forEach((elementId) => {
			canvas.eventEmitter.emit({
				type: "element:image:generate-submit-started",
				data: { elementId },
			})
		})

		nextElementIds.forEach((elementId, index) => {
			canvas.elementManager.update(
				elementId,
				{
					status: "processing",
					errorMessage: undefined,
					generateImageRequest: generateImageRequest,
					imageGenerationTaskMeta: createBatchImageTaskMeta({
						imageId: batchImageId,
						outputIndex: index + 1,
						outputCount: count,
					}),
				},
				{ silent: false },
			)
		})

		await generateImages(request)
		const batchPollingManager = new ImageBatchPollingManager({
			canvas,
			imageId: batchImageId,
			elementIds: nextElementIds,
			registry: canvas.imageBatchPollingRegistry,
		})
		void batchPollingManager.start()

		return nextElementIds
	})

	if (params.select && elementIds.length > 0) {
		const selectedElementId = elementIds[elementIds.length - 1]
		canvas.selectionManager.select(selectedElementId)
		const scheduleFocus =
			typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout
		scheduleFocus(() => {
			canvas.viewportController.focusOnElements([selectedElementId], {
				animated: true,
				panOnly: true,
				selectElement: [selectedElementId],
				ensureFullyVisible: true,
			})
		})
	}

	return { elementIds }
}

async function getPluginMaxOutputImages(canvas: Canvas, modelId: string) {
	const getImageModelList = canvas.magicConfigManager.config?.methods?.getImageModelList
	if (!getImageModelList) {
		return DEFAULT_MAX_OUTPUT_IMAGES
	}
	const models = await getImageModelList()
	const selectedModel = models.find((model) => model.model_id === modelId)
	const maxOutputImages = Number(selectedModel?.image_size_config?.max_output_images)
	if (!Number.isFinite(maxOutputImages) || maxOutputImages <= 0) {
		return DEFAULT_MAX_OUTPUT_IMAGES
	}
	return Math.max(1, Math.floor(maxOutputImages))
}

function resolvePluginGenerateCount(params: PluginGenerateAndPlaceParams, maxOutputImages: number) {
	const preferredCount = params.count ?? 1
	return clampGenerationValue(preferredCount, maxOutputImages)
}

function clampGenerationValue(value: number, maxOutputImages: number) {
	const parsedValue = Number(value)
	if (!Number.isFinite(parsedValue)) {
		return 1
	}
	return Math.max(1, Math.min(Math.floor(parsedValue), maxOutputImages))
}

function sanitizePluginImageModel(model: ImageModelItem) {
	return {
		model_id: model.model_id,
		model_name: model.model_name,
		model_icon: model.model_icon,
		model_description: model.model_description,
		image_size_config: model.image_size_config
			? {
					default_scale: model.image_size_config.default_scale,
					max_reference_images: model.image_size_config.max_reference_images,
					max_output_images: model.image_size_config.max_output_images,
					sizes: (model.image_size_config.sizes ?? []).map((size) => ({
						label: size.label,
						value: size.value,
						scale: size.scale,
					})),
					image_settings: (model.image_size_config.image_settings ?? []).map(
						(setting) => ({
							key: setting.key,
							label: setting.label,
							description: setting.description,
							component: setting.component,
							variant: setting.variant,
							default: setting.default,
							options: (setting.options ?? []).map((option) => ({
								label: option.label,
								value: option.value,
							})),
						}),
					),
				}
			: undefined,
	}
}
