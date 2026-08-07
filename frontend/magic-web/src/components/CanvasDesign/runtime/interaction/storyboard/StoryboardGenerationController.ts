import { toast } from "sonner"
import type { GenerateImageRequest, ImageModelItem } from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import {
	ElementTypeEnum,
	type CropConfig,
	type FrameElement,
	type ImageElement as ImageElementData,
	type StoryboardElement,
	type StoryboardGenerationConfig,
	type StoryboardShot,
} from "../../document/types"
import { BASE_ELEMENT_DEFAULTS } from "../../elements/core/BaseElement"
import { ImageElement } from "../../elements/image/ImageElement"
import { IMAGE_CONFIG } from "../../elements/image/ImageElement.config"
import { FrameElement as FrameElementClass } from "../../elements/frame/FrameElement"
import { buildReferenceImageOptions } from "../../resources/image/imageCropUtils"
import { mergeLinkedMediaReferences } from "../../shared/linkedMedia"
import {
	buildDefaultImageGenerationConfig,
	getDefaultResolutionForModel,
	getImageGenerationSettings,
	normalizeImageSizeValue,
	resolveImageSizeOptionFromRequest,
} from "../../shared/imageGenerationConfig"
import { generateElementId } from "../../shared/ids"
import { resolveConnectionCreateGapForElement } from "../../shared/placement/connectionCreateGap"

const FRAME_PADDING = 100
const FRAME_GAP = 50

interface StoryboardReferenceImage {
	path: string
	crop?: CropConfig
	sourceVersionId?: string
}

interface OutputLayout {
	width: number
	heights: number[]
}

interface EnsureOutputsResult {
	imageElementIds: string[]
	frameId?: string
}

/**
 * 分镜批量生成控制器。
 *
 * Frame 只承担视觉容器职责，镜头与输出图片的唯一业务映射保存在 shot 上；
 * 这样解除 Frame 后仍能复用已有图片，删除 Frame 后也能按缺失映射重建。
 */
export class StoryboardGenerationController {
	constructor(
		private readonly canvas: Canvas,
		private readonly loadImageModels?: () => Promise<ImageModelItem[]>,
	) {}

	public async generateAll(elementId: string): Promise<void> {
		const storyboard = this.getStoryboard(elementId)
		if (!storyboard) return

		const shots = storyboard.shots ?? []
		if (shots.length === 0) {
			toast.error(
				this.canvas.t?.("storyboard.empty", "暂无可生成的分镜") ?? "暂无可生成的分镜",
			)
			return
		}

		const emptyShotIndex = shots.findIndex((shot) => !shot.description.trim())
		if (emptyShotIndex >= 0) {
			const message =
				this.canvas.t?.(
					"storyboard.emptyDescription",
					"请先填写分镜 {{index}} 的画面描述",
				) ?? "请先填写分镜 {{index}} 的画面描述"
			toast.error(message.replace("{{index}}", String(emptyShotIndex + 1)))
			return
		}

		const models = await this.getImageModels()
		const model = this.resolveModel(storyboard.generationConfig, models)
		const modelId = storyboard.generationConfig?.model_id ?? model?.model_id
		if (!modelId) {
			toast.error(
				this.canvas.t?.("storyboard.modelUnavailable", "当前没有可用的图片模型") ??
					"当前没有可用的图片模型",
			)
			return
		}

		const references = this.collectReferenceImages(elementId)
		const maxReferences = model?.image_size_config?.max_reference_images
		if (maxReferences !== undefined && references.length > maxReferences) {
			const message =
				this.canvas.t?.(
					"storyboard.referenceLimit",
					"当前模型最多支持 {{count}} 张参考图，请减少左侧连接图片",
				) ?? "当前模型最多支持 {{count}} 张参考图，请减少左侧连接图片"
			toast.error(message.replace("{{count}}", String(maxReferences)))
			return
		}

		const outputs = this.ensureOutputStructure(storyboard, shots)
		const requests = shots.map((shot) =>
			this.buildRequest(shot, storyboard.generationConfig, modelId, model, references),
		)

		await Promise.allSettled(
			outputs.imageElementIds.map(async (imageElementId, index) => {
				const imageElement = this.canvas.elementManager.getElementInstance(imageElementId)
				if (!(imageElement instanceof ImageElement)) return false
				return imageElement.submitGeneration(requests[index])
			}),
		)

		this.canvas.contentLayer.batchDraw()
	}

	public destroy(): void {
		// 当前控制器没有持久化状态订阅，保留销毁入口以维持 Canvas 生命周期契约。
	}

	private getStoryboard(elementId: string): StoryboardElement | undefined {
		const element = this.canvas.elementManager.getElementData(elementId)
		return element?.type === ElementTypeEnum.Storyboard ? element : undefined
	}

	private async getImageModels(): Promise<ImageModelItem[]> {
		if (this.loadImageModels) return this.loadImageModels()
		const getImageModelList = this.canvas.magicConfigManager.config?.methods?.getImageModelList
		if (!getImageModelList) return []
		try {
			return (await getImageModelList()).filter(
				(model) => model.model_status === "normal" && Boolean(model.model_id),
			)
		} catch {
			return []
		}
	}

	private resolveModel(
		config: StoryboardGenerationConfig | undefined,
		models: ImageModelItem[],
	): ImageModelItem | undefined {
		return models.find((model) => model.model_id === config?.model_id) ?? models[0]
	}

	private collectReferenceImages(targetElementId: string): StoryboardReferenceImage[] {
		const resolver = this.canvas.magicConfigManager.config?.methods?.resolveResourceReference
		const references = this.canvas.connectionManager
			.getUpstreamConnections(targetElementId)
			.map((connection) =>
				this.canvas.elementManager.getElementInstance(connection.sourceElementId),
			)
			.filter((element): element is ImageElement => element instanceof ImageElement)
			.map((element) => {
				const associatedVersion = element.getAssociatedVersionData()
				return associatedVersion.src
					? {
							path: associatedVersion.src,
							crop: associatedVersion.crop,
							sourceVersionId: associatedVersion.id,
						}
					: undefined
			})
			.filter((reference): reference is StoryboardReferenceImage => Boolean(reference))

		const merged = mergeLinkedMediaReferences(
			[],
			references.map((reference) => ({
				kind: "image" as const,
				path: reference.path,
				sourceCrop: reference.crop,
				sourceVersionId: reference.sourceVersionId,
			})),
			resolver,
		)

		return merged.map((reference) => ({
			path: reference.path,
			crop: reference.sourceCrop,
			sourceVersionId: reference.sourceVersionId,
		}))
	}

	private buildRequest(
		shot: StoryboardShot,
		config: StoryboardGenerationConfig | undefined,
		modelId: string,
		model: ImageModelItem | undefined,
		references: StoryboardReferenceImage[],
	): GenerateImageRequest {
		const configuredSize = normalizeImageSizeValue(config?.size)
		const defaultResolution = getDefaultResolutionForModel(model, config?.resolution)
		const sizeSelection = resolveImageSizeOptionFromRequest({
			sizes: model?.image_size_config?.sizes ?? [],
			request: config ? { ...config, size: configuredSize } : undefined,
			preferredResolution: defaultResolution,
			currentLabel: config?.image_generation_config?.aspect_ratio,
		})
		const imageGenerationConfig = {
			...buildDefaultImageGenerationConfig(getImageGenerationSettings(model)),
			...(config?.image_generation_config ?? {}),
		}
		if (sizeSelection?.size.label && !imageGenerationConfig.aspect_ratio) {
			imageGenerationConfig.aspect_ratio = sizeSelection.size.label
		}
		const hasImageGenerationConfig = Object.keys(imageGenerationConfig).length > 0
		const referenceImageOptions = references.flatMap(
			(reference) =>
				buildReferenceImageOptions({ filePath: reference.path, crop: reference.crop }) ??
				[],
		)
		return {
			model_id: modelId,
			prompt: shot.description.trim(),
			...(configuredSize || sizeSelection?.size.value
				? { size: configuredSize ?? sizeSelection?.size.value }
				: {}),
			...(config?.resolution || sizeSelection?.resolution || defaultResolution
				? {
						resolution:
							config?.resolution ?? sizeSelection?.resolution ?? defaultResolution,
					}
				: {}),
			...(hasImageGenerationConfig ? { image_generation_config: imageGenerationConfig } : {}),
			...(references.length > 0
				? {
						reference_images: references.map((reference) => reference.path),
						...(referenceImageOptions.length > 0
							? { reference_image_options: referenceImageOptions }
							: {}),
					}
				: {}),
		}
	}

	private ensureOutputStructure(
		storyboard: StoryboardElement,
		shots: StoryboardShot[],
	): EnsureOutputsResult {
		const resolvedImageIds = shots.map((shot) =>
			shot.outputImageElementId &&
			this.canvas.elementManager.getElementData(shot.outputImageElementId)?.type ===
				ElementTypeEnum.Image
				? shot.outputImageElementId
				: undefined,
		)
		const existingOutputIds = resolvedImageIds.filter((id): id is string => Boolean(id))
		const existingFrame = this.findOutputFrame(existingOutputIds)
		const layout = this.resolveOutputLayout(storyboard.generationConfig, shots.length)
		const frameOffsetX = resolveConnectionCreateGapForElement(storyboard, "right")
		const frameHeight = this.getFrameHeight(layout.heights)
		const frameOrigin = this.resolveOutputFrameOrigin(storyboard, frameOffsetX, frameHeight)
		const missingIndexes = resolvedImageIds.flatMap((id, index) => (id ? [] : [index]))
		const needsConnectionMutation = existingOutputIds.some(
			(imageId) =>
				!this.canvas.connectionManager
					.getDownstreamConnections(storyboard.id)
					.some(
						(connection) =>
							connection.targetElementId === imageId && connection.locked === true,
					),
		)
		const needsMutation = missingIndexes.length > 0 || needsConnectionMutation
		const history = this.canvas.historyManager
		if (needsMutation) history?.disable()

		try {
			if (!existingFrame && existingOutputIds.length === 0) {
				const imageChildren = shots.map((_shot, index) =>
					this.createImageData(
						generateElementId(),
						storyboard.x ?? 0,
						storyboard.y ?? 0,
						layout.width,
						layout.heights[index],
						index,
					),
				)
				imageChildren.forEach((child, index) => {
					resolvedImageIds[index] = child.id
				})
				const frameId = generateElementId()
				const frameChildren = imageChildren.map((child, index) => ({
					...child,
					x: FRAME_PADDING,
					y: FRAME_PADDING + this.getChildrenOffset(layout.heights, index),
					zIndex: imageChildren.length - index,
				}))
				const frameData: FrameElement = {
					...FrameElementClass.createElementData(
						frameId,
						frameOrigin.x,
						frameOrigin.y,
						layout.width + FRAME_PADDING * 2,
						frameHeight,
						this.canvas.elementManager.getNextZIndexInLevel(),
					),
					children: frameChildren,
				}
				this.canvas.elementManager.create(frameData, { silent: true })
				const imageElementIds = resolvedImageIds.filter((id): id is string => Boolean(id))
				this.ensureConnections(storyboard.id, imageElementIds)
				this.commitShotOutputIds(storyboard, shots, imageElementIds)
				return { imageElementIds, frameId }
			}

			const missingImageData = missingIndexes.map((shotIndex) => {
				const frameOrigin = existingFrame
					? {
							x: existingFrame.x ?? 0,
							y: existingFrame.y ?? 0,
						}
					: {
							x: frameOrigin.x,
							y: frameOrigin.y,
						}
				const data = this.createImageData(
					generateElementId(),
					frameOrigin.x + FRAME_PADDING,
					frameOrigin.y +
						FRAME_PADDING +
						this.getChildrenOffset(layout.heights, shotIndex),
					layout.width,
					layout.heights[shotIndex],
					shotIndex,
				)
				resolvedImageIds[shotIndex] = data.id
				return data
			})
			missingImageData.forEach((data) =>
				this.canvas.elementManager.create(data, { silent: true }),
			)
			if (existingFrame && missingImageData.length > 0) {
				missingImageData.forEach((data) => {
					this.canvas.elementManager.reparentElements({
						targetParentId: existingFrame.id,
						elements: [
							{
								elementId: data.id,
								positionInContent: { x: data.x ?? 0, y: data.y ?? 0 },
							},
						],
						silent: true,
					})
				})

				this.layoutFrameChildren(existingFrame.id, resolvedImageIds, layout, shots.length)
			}
			const imageElementIds = resolvedImageIds.filter((id): id is string => Boolean(id))
			this.ensureConnections(storyboard.id, imageElementIds)
			this.commitShotOutputIds(storyboard, shots, imageElementIds)
			return { imageElementIds, frameId: existingFrame?.id }
		} finally {
			if (needsMutation) {
				history?.enable()
				history?.recordHistoryImmediate()
			}
		}
	}

	private createImageData(
		id: string,
		x: number,
		y: number,
		width: number,
		height: number,
		index: number,
	): ImageElementData {
		return {
			...BASE_ELEMENT_DEFAULTS,
			id,
			type: ElementTypeEnum.Image,
			x,
			y,
			width,
			height,
			zIndex: this.canvas.elementManager.getNextZIndexInLevel() + index,
		}
	}

	private resolveOutputFrameOrigin(
		storyboard: StoryboardElement,
		horizontalGap: number,
		frameHeight: number,
	): { x: number; y: number } {
		return {
			x: (storyboard.x ?? 0) + (storyboard.width ?? 0) + horizontalGap,
			y: (storyboard.y ?? 0) + (storyboard.height ?? 0) / 2 - frameHeight / 2,
		}
	}

	private ensureConnections(storyboardId: string, imageIds: string[]): void {
		imageIds.forEach((imageId) => {
			this.canvas.connectionManager.ensureLockedConnection(storyboardId, imageId)
		})
	}

	private layoutFrameChildren(
		frameId: string,
		imageIds: string[],
		layout: OutputLayout,
		shotCount: number,
	): void {
		imageIds.forEach((imageId, index) => {
			if (this.canvas.elementManager.findParentIdForElement(imageId) !== frameId) return
			const image = this.canvas.elementManager.getElementData(imageId)
			if (image?.type !== ElementTypeEnum.Image) return
			this.canvas.elementManager.update(
				imageId,
				{
					x: FRAME_PADDING,
					y: FRAME_PADDING + this.getChildrenOffset(layout.heights, index),
					width: layout.width,
					height: layout.heights[index],
					zIndex: shotCount - index,
				},
				{ silent: true },
			)
		})
		this.canvas.elementManager.update(
			frameId,
			{
				width: layout.width + FRAME_PADDING * 2,
				height: this.getFrameHeight(layout.heights),
			},
			{ silent: true },
		)
	}

	private commitShotOutputIds(
		storyboard: StoryboardElement,
		shots: StoryboardShot[],
		imageIds: string[],
	): void {
		const nextShots = shots.map((shot, index) => ({
			...shot,
			outputImageElementId: imageIds[index],
		}))
		if (JSON.stringify(storyboard.shots ?? []) === JSON.stringify(nextShots)) return
		this.canvas.elementManager.update(storyboard.id, { shots: nextShots }, { silent: false })
	}

	private findOutputFrame(imageIds: string[]): FrameElement | undefined {
		for (const imageId of imageIds) {
			const parentId = this.canvas.elementManager.findParentIdForElement(imageId)
			const parent = parentId
				? this.canvas.elementManager.getElementData(parentId)
				: undefined
			if (parent?.type === ElementTypeEnum.Frame) return parent
		}
		return undefined
	}

	private resolveOutputLayout(
		config: StoryboardGenerationConfig | undefined,
		count: number,
	): OutputLayout {
		const match = normalizeImageSizeValue(config?.size)?.match(/^(\d+)x(\d+)$/i)
		const ratio = match ? Number(match[2]) / Number(match[1]) : 1
		const width = IMAGE_CONFIG.DEFAULT_WIDTH
		return {
			width,
			heights: Array.from({ length: count }, () => Math.max(1, Math.round(width * ratio))),
		}
	}

	private getChildrenOffset(heights: number[], index: number): number {
		return heights.slice(0, index).reduce((total, height) => total + height + FRAME_GAP, 0)
	}

	private getFrameHeight(heights: number[]): number {
		return (
			FRAME_PADDING * 2 +
			heights.reduce((total, height) => total + height, 0) +
			Math.max(0, heights.length - 1) * FRAME_GAP
		)
	}
}
