import {
	getCanvasCenter,
	getResolvedMediaPlacementConfig,
	getViewportCanvasRect,
	withHistoryManagerAsync,
} from "../../../../runtime/shared/placement/elementUtils"
import type { Canvas } from "../../../../runtime/core/Canvas"
import { ImageBatchPollingManager } from "../../../../runtime/resources/polling/ImageBatchPollingManager"
import { createBatchImageTaskMeta } from "../../../../runtime/resources/image/imageGenerationTaskMeta"
import { generateUUID } from "../../../../runtime/shared/ids"
import type {
	GenerateImageRequest,
	GenerateImagesRequest,
	ImageModelItem,
} from "../../../../public/magic-types"
import type { PluginGenerateAndPlaceParams } from "../runtime-protocol/v1/index"
import {
	collectObstacleRects,
	findGeneratedMediaGridPositions,
	layerElementToObstacleRect,
} from "../../../../runtime/shared/placement/findNonOverlappingPlacement"
import {
	ElementTypeEnum,
	type ImageElement,
	type LayerElement,
} from "../../../../runtime/document/types"
import {
	toWeakCanvasResourcePath,
	areCanvasResourcePathsSame,
	stripCurrentDirectoryPrefix,
} from "../../../../runtime/shared/path/canvasResourcePath"
import type { Rect } from "../../../../runtime/shared/ids"
import {
	resolvePluginSourceElementId,
	type PluginSourceElementMap,
} from "../window/pluginSourceElements"

const DEFAULT_MAX_OUTPUT_IMAGES = 4
const PLUGIN_GENERATED_GRID_MAX_COLUMNS = 4

export async function getPluginImageModels(canvas: Canvas) {
	const getImageModelList = canvas.magicConfigManager.config?.methods?.getImageModelList
	if (!getImageModelList) {
		throw new Error("getImageModelList method not available.")
	}
	const models = await getImageModelList()
	return models.map(sanitizePluginImageModel)
}

/**
 * 生成插件图片，并在宿主侧统一创建占位元素、绑定批量轮询任务与处理落点。
 *
 * @param canvas - 画布实例
 * @param params - 插件生成和放置参数
 * @param options - 插件生成和放置选项
 * 	sourceElementByAssetKey - 插件参考图(path/id/url/src) -> 画布元素id映射
 * @returns 插件生成和放置结果
 */
export async function generatePluginImages(
	canvas: Canvas,
	params: PluginGenerateAndPlaceParams,
	options: {
		sourceElementByAssetKey?: PluginSourceElementMap
	} = {},
) {
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
		const imageGeneratorTool = canvas.toolManager.getImageGeneratorTool()
		const imageSize = imageGeneratorTool.resolveImageElementSize(width, height)
		const mediaPlacementConfig = getResolvedMediaPlacementConfig(canvas)
		const allElements = canvas.elementManager.getAllElements()
		// 只把可见画布元素作为障碍物，隐藏元素不阻塞插件生成结果的落点。
		const obstacles = collectObstacleRects(allElements, (el) => {
			return canvas.permissionManager.isVisible(el)
		})
		// 落点策略由宿主统一处理：插件只传引用图，宿主推断来源元素并把结果放在它附近。
		const sourceElement = resolvePluginSourceElement(
			canvas,
			params,
			options.sourceElementByAssetKey,
		)
		// 来源元素的障碍矩形
		const sourceRect = sourceElement ? layerElementToObstacleRect(sourceElement) : null
		// 没有来源图时，尝试接在同一生成请求的已有输出网格后面，保证多次点击生成能连续排列。
		const existingGridRects = sourceRect
			? []
			: collectMatchingGeneratedGridRects(canvas, allElements, generateImageRequest)
		const positions = findGeneratedMediaGridPositions(obstacles, {
			count,
			elementWidth: imageSize.width,
			elementHeight: imageSize.height,
			viewportRect: getViewportCanvasRect(canvas),
			sourceRect,
			existingGridRects,
			anchor: getCanvasCenter(canvas),
			spacing: mediaPlacementConfig.spacing,
			maxColumns: PLUGIN_GENERATED_GRID_MAX_COLUMNS,
			maxSearchRings: mediaPlacementConfig.maxSearchRings,
		})
		const nextElementIds = canvas.toolManager
			.getImageGeneratorTool()
			.createImageElementsAtPositions(positions, imageSize.width, imageSize.height)

		// 先创建全部占位元素，再批量绑定同一个 image_id，轮询回填时才能按 outputIndex 对应结果。
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

	if (elementIds.length > 0) {
		const selectedElementId = elementIds[elementIds.length - 1]
		canvas.selectionManager.select(selectedElementId)
		const scheduleFocus =
			typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout
		scheduleFocus(() => {
			// 聚焦整批结果，避免多图生成时只把最后一张带入视口。
			canvas.viewportController.focusOnElements(elementIds, {
				animated: true,
				panOnly: true,
				// 插件生成完成后始终选中最后一张，保证属性面板和后续操作落在最新结果上。
				selectElement: [selectedElementId],
				ensureFullyVisible: true,
			})
		})
	}

	return { elementIds }
}

/** 展平图层树，确保画框内的图片也能参与来源匹配和已有网格续排。 */
function flattenLayerElements(elements: LayerElement[]): LayerElement[] {
	const result: LayerElement[] = []
	for (const element of elements) {
		result.push(element)
		if ("children" in element && Array.isArray(element.children)) {
			result.push(...flattenLayerElements(element.children))
		}
	}
	return result
}

/** 来源匹配只考虑当前对用户可见的画布元素。 */
function isVisibleCanvasElement(canvas: Canvas, element: LayerElement): boolean {
	return canvas.permissionManager.isVisible(element)
}

/** 获取画布里可作为引用来源的可见图片元素。 */
function getImageElements(canvas: Canvas): ImageElement[] {
	return flattenLayerElements(canvas.elementManager.getAllElements()).filter(
		(element): element is ImageElement =>
			element.type === ElementTypeEnum.Image &&
			Boolean(element.src) &&
			isVisibleCanvasElement(canvas, element),
	)
}

/** 按 id 获取可见图片元素，过滤掉非图片、隐藏元素和无 src 图片。 */
function getImageElementById(canvas: Canvas, elementId: string | undefined): ImageElement | null {
	if (!elementId) return null
	const element = canvas.elementManager.getElementData(elementId)
	if (
		!element ||
		element.type !== ElementTypeEnum.Image ||
		!isVisibleCanvasElement(canvas, element)
	) {
		return null
	}
	const imageElement = element as ImageElement
	if (!imageElement.src) return null
	return imageElement
}

/** 用路径/URL 反查画布图片，覆盖插件只回传 reference 字符串的场景。 */
function resolveImageElementByReference(canvas: Canvas, reference: string): ImageElement | null {
	const resolveAbsolutePath = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
	return (
		getImageElements(canvas).find((element) => {
			if (!element.src) return false
			return areCanvasResourcePathsSame(element.src, reference, resolveAbsolutePath)
		}) ?? null
	)
}

/** 判断图片是否是生成任务产物；这类元素不能作为下一次生成的来源兜底。 */
function isGeneratedImageElement(element: ImageElement): boolean {
	return Boolean(
		element.generateImageRequest ||
		element.imageGenerationTaskMeta ||
		element.generateHightImageRequest,
	)
}

/** 当插件没有带来源映射时，用当前选中的非生成图片作为最后兜底来源。 */
function getSelectedSourceImageElement(canvas: Canvas): ImageElement | null {
	const selectedImageId = canvas.selectionManager.getSelectedIds().find((elementId) => {
		const element = getImageElementById(canvas, elementId)
		return element && !isGeneratedImageElement(element)
	})
	return getImageElementById(canvas, selectedImageId)
}

/** 汇总插件请求里所有可能指向引用图的 key。 */
function getPluginReferenceKeys(params: PluginGenerateAndPlaceParams): string[] {
	const referenceImages = (params.reference_images ?? []).filter(
		(reference): reference is string =>
			typeof reference === "string" && Boolean(reference.trim()),
	)
	const referenceOptionPaths = (params.reference_image_options ?? []).flatMap((option) =>
		typeof option?.path === "string" && option.path.trim() ? [option.path] : [],
	)
	return [...referenceImages, ...referenceOptionPaths]
}

/** 归一化引用 key，避免 "./foo.png" 与 "foo.png" 被识别成两组生成结果。 */
function normalizePluginReferenceKey(reference: string): string {
	return stripCurrentDirectoryPrefix(toWeakCanvasResourcePath(reference.trim()))
}

/** 去重并排序后的引用 key 用于生成稳定的落点分组 key。 */
function getNormalizedPluginReferenceKeys(params: PluginGenerateAndPlaceParams): string[] {
	return Array.from(
		new Set(getPluginReferenceKeys(params).map(normalizePluginReferenceKey).filter(Boolean)),
	).sort()
}

/** 稳定序列化请求参数，避免对象 key 顺序变化导致同一请求无法续排。 */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(",")}]`
	}
	if (value && typeof value === "object") {
		return `{${Object.keys(value)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${stableStringify(
						(value as Record<string, unknown>)[key],
					)}`,
			)
			.join(",")}}`
	}
	return JSON.stringify(value) ?? "undefined"
}

/** 提取影响落点续排的生成参数，作为“同一组生成结果”的判断依据。 */
function getGenerationPlacementKey(request: PluginGenerateAndPlaceParams): string {
	return stableStringify({
		model_id: request.model_id,
		prompt: request.prompt,
		size: request.size,
		resolution: request.resolution,
		references: getNormalizedPluginReferenceKeys(request),
		image_generation_config: request.image_generation_config ?? {},
	})
}

/** 收集同一生成请求已创建的结果矩形，供无来源图的再次生成接着原网格摆放。 */
function collectMatchingGeneratedGridRects(
	canvas: Canvas,
	elements: LayerElement[],
	request: GenerateImageRequest,
): Rect[] {
	const targetPlacementKey = getGenerationPlacementKey(request)
	return flattenLayerElements(elements).flatMap((element) => {
		if (element.type !== ElementTypeEnum.Image || !isVisibleCanvasElement(canvas, element)) {
			return []
		}
		const imageElement = element as ImageElement
		if (!imageElement.generateImageRequest || !isGeneratedImageElement(imageElement)) {
			return []
		}
		if (getGenerationPlacementKey(imageElement.generateImageRequest) !== targetPlacementKey) {
			return []
		}
		const rect = layerElementToObstacleRect(imageElement)
		return rect ? [rect] : []
	})
}

/**
 * 解析插件来源元素。
 *
 * @param canvas - 画布实例
 * @param params - 插件生成和放置参数
 * @param sourceElementByAssetKey - 插件来源元素映射
 * @returns 插件来源元素
 */
function resolvePluginSourceElement(
	canvas: Canvas,
	params: PluginGenerateAndPlaceParams,
	sourceElementByAssetKey?: PluginSourceElementMap,
): ImageElement | null {
	const references = getPluginReferenceKeys(params)
	const sourceElementId = resolvePluginSourceElementId(sourceElementByAssetKey, references)
	const sourceElement = getImageElementById(canvas, sourceElementId)
	if (sourceElement) return sourceElement

	// 插件可能只回传文件路径/URL，先尝试和画布图片 src 做归一化匹配。
	for (const reference of references) {
		const element = resolveImageElementByReference(canvas, reference)
		if (element) return element
	}

	// 最后才用选中项兜底，并排除生成任务图，避免上一次输出成为下一次的锚点。
	return getSelectedSourceImageElement(canvas)
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
