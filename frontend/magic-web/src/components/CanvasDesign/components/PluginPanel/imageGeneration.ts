import { withHistoryManagerAsync } from "../../canvas/utils/elementUtils"
import type { Canvas } from "../../canvas/Canvas"
import { ImageElement as ImageElementClass } from "../../canvas/element/elements/ImageElement"
import type { GenerateImageRequest, ImageModelItem } from "../../types.magic"
import type { PluginGenerateAndPlaceParams } from "./runtime/v1"

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
	if (!methods?.generateImage) {
		throw new Error("generateImage method not available.")
	}
	if (!params.model_id || !params.prompt) {
		throw new Error("model_id and prompt are required.")
	}

	const count = Math.max(1, Math.min(4, params.count ?? 1))
	const [sizeWidth, sizeHeight] = params.size?.split("x").map(Number) ?? []
	const width = params.width ?? (Number.isFinite(sizeWidth) ? sizeWidth : undefined)
	const height = params.height ?? (Number.isFinite(sizeHeight) ? sizeHeight : undefined)
	const elementIds = await withHistoryManagerAsync(canvas.historyManager, async () => {
		const nextElementIds = canvas.toolManager
			.getImageGeneratorTool()
			.createImageElementsNearViewport(count, width, height)

		for (const elementId of nextElementIds) {
			const elementInstance = canvas.elementManager.getElementInstance(elementId)
			if (!(elementInstance instanceof ImageElementClass)) {
				throw new Error("Failed to create image element for plugin generation.")
			}

			const request: GenerateImageRequest = {
				model_id: params.model_id,
				prompt: params.prompt,
				size: params.size,
				resolution: params.resolution,
				reference_images: params.reference_images,
				reference_image_options: params.reference_image_options,
				image_generation_config: params.image_generation_config,
			}
			await elementInstance.generateImage(request)
		}

		return nextElementIds
	})

	if (params.select && elementIds.length > 0) {
		canvas.selectionManager.select(elementIds[elementIds.length - 1])
	}

	return { elementIds }
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
