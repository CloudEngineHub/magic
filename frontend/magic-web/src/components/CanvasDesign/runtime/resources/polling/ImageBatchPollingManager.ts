import type { Canvas } from "../../core/Canvas"
import {
	ElementTypeEnum,
	type ImageElement as ImageElementData,
	type ImageElementVersion,
	type LayerElement,
} from "../../document/types"
import type {
	GeneratedImageResultItem,
	GetImageGenerationResultsParams,
	ImageGenerationResultsResponse,
} from "../../../public/magic-types"
import { IMAGE_CONFIG } from "../../elements/image/ImageElement.config"
import type { ImageBatchPollingRegistry } from "./ImageBatchPollingRegistry"
import {
	extractSmartNameFromFileName,
	getGenerationResultStatusPatch,
	isGenerationTaskNotFoundError,
	shouldContinueGenerationPolling,
} from "./generationPollingUtils"
import { resolveCanvasGeneratedResourceStoragePath } from "../../shared/path/canvasResourcePath"
import {
	getImageGenerationTaskMeta,
	isBatchImageGenerationTaskMeta,
} from "../image/imageGenerationTaskMeta"
import { isImageElementV2, updateImageVersion } from "../../document/imageVersion"

interface BatchElementUpdate {
	patch: Partial<LayerElement>
	resourcePath?: string
}

interface BuildImageVersionUpdateOptions {
	versionId?: string
	extra?: Partial<LayerElement>
}

export interface ImageBatchPollingManagerConfig {
	canvas: Canvas
	imageId: string
	elementIds: string[]
	outputIndexes?: number[]
	/** V2 版本目标；V1 元素对应项保持 undefined 以兼容旧调用方。 */
	versionIds?: Array<string | undefined>
	registry: ImageBatchPollingRegistry
}

export class ImageBatchPollingManager {
	private readonly canvas: Canvas
	private readonly imageId: string
	private elementIds: string[]
	private elementOutputIndexes: number[]
	private elementVersionIds: Array<string | undefined>
	private outputIndexToElementId = new Map<number, string>()
	private outputIndexToVersionId = new Map<number, string | undefined>()
	private readonly registry: ImageBatchPollingRegistry
	private readonly aliveElementIds: Set<string>
	private readonly syncedIndexes = new Set<number>()
	private isPolling = false
	private pollingTimer?: ReturnType<typeof setTimeout>
	private waitResolve?: () => void
	private unsubscribeElementDeleted?: () => void
	private unsubscribeBatchDeleted?: () => void

	constructor(config: ImageBatchPollingManagerConfig) {
		this.canvas = config.canvas
		this.imageId = config.imageId
		this.registry = config.registry
		this.elementIds = []
		this.elementOutputIndexes = []
		this.elementVersionIds = []
		this.aliveElementIds = new Set()
		this.syncElementIds(config.elementIds, config.outputIndexes, config.versionIds)
	}

	/**
	 * 启动批量生成结果轮询
	 */
	public async start(): Promise<void> {
		if (this.isPolling) return
		this.isPolling = true
		this.registry.track(this)
		this.handleBindSubscriptions()

		try {
			while (this.isPolling) {
				const result = await this.getImageGenerationResults()
				if (!this.isPolling) return
				if (!result) {
					this.stop()
					return
				}

				this.applyBatchResult(result)
				if (!this.isPolling || !shouldContinueGenerationPolling(result.status)) {
					this.stop()
					return
				}

				await this.wait(IMAGE_CONFIG.POLLING_INTERVAL)
			}
		} catch (error) {
			if (isGenerationTaskNotFoundError(error, this.imageId)) {
				this.deleteMissingTaskElements()
			}
			// getImageGenerationResult 失败，停止轮询
			this.stop()
		} finally {
			this.registry.untrack(this)
			this.cleanupTimer()
			this.cleanupSubscriptions()
		}
	}

	private deleteMissingTaskElements(): void {
		const ownedElementIds = new Set<string>()
		this.elementIds.forEach((elementId, index) => {
			const outputIndex = this.elementOutputIndexes[index]
			const versionId = this.elementVersionIds[index]
			if (!this.shouldSyncElement(elementId, outputIndex, versionId)) return

			const element = this.canvas.elementManager.getElementData(elementId)
			if (element?.type !== ElementTypeEnum.Image) return
			if (isImageElementV2(element)) {
				// A V2 output may already contain an older completed image; fail only the
				// missing batch version instead of deleting the stable output element.
				const next = updateImageVersion(element, versionId ?? element.activeVersionId, {
					status: "failed",
					errorMessage: undefined,
					imageGenerationTaskMeta: undefined,
				})
				if (isImageElementV2(next)) {
					this.canvas.elementManager.update(
						elementId,
						{ versions: next.versions },
						{ silent: false },
					)
					this.canvas.eventEmitter.emit({
						type: "element:image:generate-submit-failed",
						data: { elementId },
					})
				}
				return
			}

			ownedElementIds.add(elementId)
		})
		if (ownedElementIds.size > 0) {
			this.canvas.elementManager.batchDelete([...ownedElementIds])
		}
	}

	/**
	 * 停止批量生成结果轮询
	 */
	public stop(): void {
		this.isPolling = false
		this.registry.untrack(this)
		this.cleanupTimer()
		this.cleanupSubscriptions()
	}

	public destroy(): void {
		this.stop()
	}

	public getImageId(): string {
		return this.imageId
	}

	public syncElementIds(
		elementIds: string[],
		outputIndexes?: number[],
		versionIds?: Array<string | undefined>,
	): void {
		this.elementIds = elementIds
		this.elementOutputIndexes = outputIndexes ?? elementIds.map((_, index) => index + 1)
		this.elementVersionIds = versionIds ?? elementIds.map(() => undefined)
		this.outputIndexToElementId = new Map<number, string>()
		this.outputIndexToVersionId = new Map<number, string | undefined>()
		this.aliveElementIds.clear()
		elementIds.forEach((elementId, index) => {
			if (!elementId) return
			const outputIndex = this.elementOutputIndexes[index]
			if (!Number.isFinite(outputIndex) || outputIndex < 1) return
			this.aliveElementIds.add(elementId)
			this.outputIndexToElementId.set(outputIndex, elementId)
			this.outputIndexToVersionId.set(outputIndex, this.elementVersionIds[index])
			this.syncedIndexes.delete(outputIndex)
		})
	}

	/**
	 * 获取图片生成结果
	 */
	private async getImageGenerationResults(): Promise<ImageGenerationResultsResponse | null> {
		const getImageGenerationResults =
			this.canvas.magicConfigManager.config?.methods?.getImageGenerationResults
		if (!getImageGenerationResults) {
			return null
		}

		const params: GetImageGenerationResultsParams = {
			project_id: "",
			image_id: this.imageId,
		}

		return (await getImageGenerationResults(params)) as ImageGenerationResultsResponse
	}

	/**
	 * 应用批量生成结果
	 */
	private applyBatchResult(result: ImageGenerationResultsResponse) {
		for (const image of result.images ?? []) {
			const outputIndex = Number(image.index)
			if (
				!Number.isFinite(outputIndex) ||
				outputIndex < 1 ||
				!this.outputIndexToElementId.has(outputIndex)
			) {
				continue
			}
			if (this.syncedIndexes.has(outputIndex)) continue

			const elementId = this.outputIndexToElementId.get(outputIndex)
			if (!elementId) continue
			const versionId = this.outputIndexToVersionId.get(outputIndex)
			if (!this.shouldSyncElement(elementId, outputIndex, versionId)) continue
			const element = this.canvas.elementManager.getElementData(elementId)
			if (element?.type !== ElementTypeEnum.Image) continue
			const updateData = this.buildCompletedElementUpdate(element, result, image, versionId)
			// 更新元素数据
			this.canvas.elementManager.update(elementId, updateData.patch, { silent: false })
			if (updateData.resourcePath && image.file_url) {
				this.canvas.imageResourceManager.loadResource(updateData.resourcePath, {
					variant: "preview",
					priority: "critical",
				})
			}
			// 发出图片结果更新事件
			this.canvas.eventEmitter.emit({
				type: "element:image:resultUpdated",
				data: { elementId },
			})
			// 添加已同步索引
			this.syncedIndexes.add(outputIndex)
		}

		if (result.status === "failed") {
			this.elementIds.forEach((elementId, index) => {
				const outputIndex = this.elementOutputIndexes[index]
				const versionId = this.elementVersionIds[index]
				if (this.syncedIndexes.has(outputIndex)) return
				if (!this.shouldSyncElement(elementId, outputIndex, versionId)) return
				const element = this.canvas.elementManager.getElementData(elementId)
				if (element?.type !== ElementTypeEnum.Image) return
				this.canvas.elementManager.update(
					elementId,
					this.buildImageVersionUpdate(
						element,
						{
							status: "failed",
							errorMessage: result.error_message ?? undefined,
							imageGenerationTaskMeta: undefined,
						},
						{ versionId },
					),
					{ silent: false },
				)
				this.canvas.eventEmitter.emit({
					type: "element:image:generate-submit-failed",
					data: { elementId },
				})
			})
			return
		}

		if (result.status === "completed") {
			const missingResourcePatch = getGenerationResultStatusPatch(
				"completed",
				result.error_message,
				false,
			)
			this.elementIds.forEach((elementId, index) => {
				const outputIndex = this.elementOutputIndexes[index]
				const versionId = this.elementVersionIds[index]
				if (this.syncedIndexes.has(outputIndex)) return
				if (!this.shouldSyncElement(elementId, outputIndex, versionId)) return
				const element = this.canvas.elementManager.getElementData(elementId)
				if (element?.type !== ElementTypeEnum.Image) return
				this.canvas.elementManager.update(
					elementId,
					this.buildImageVersionUpdate(
						element,
						{
							...missingResourcePatch,
							imageGenerationTaskMeta: undefined,
						},
						{ versionId },
					),
					{ silent: false },
				)
			})
		}
	}

	/**
	 * 构建完成元素更新数据
	 */
	private buildCompletedElementUpdate(
		element: ImageElementData,
		result: ImageGenerationResultsResponse,
		image: GeneratedImageResultItem,
		versionId?: string,
	): BatchElementUpdate {
		const storagePath =
			result.file_dir && image.file_name
				? resolveCanvasGeneratedResourceStoragePath(
						this.canvas,
						result.file_dir,
						image.file_name,
					)
				: undefined
		if (!storagePath || !image.file_name) {
			return {
				patch: this.buildImageVersionUpdate(
					element,
					{
						...getGenerationResultStatusPatch("completed", result.error_message, false),
						imageGenerationTaskMeta: undefined,
					},
					{ versionId },
				),
			}
		}

		this.primeGeneratedImageResource(storagePath, image.file_url, image.file_name)
		return {
			patch: this.buildImageVersionUpdate(
				element,
				{
					status: "completed",
					errorMessage: undefined,
					imageGenerationTaskMeta: undefined,
					src: storagePath,
				},
				{
					versionId,
					extra: { name: extractSmartNameFromFileName(image.file_name) },
				},
			),
			resourcePath: storagePath,
		}
	}

	private buildImageVersionUpdate(
		element: ImageElementData,
		patch: Partial<ImageElementVersion>,
		options?: BuildImageVersionUpdateOptions,
	): Partial<LayerElement> {
		const extra = options?.extra
		if (!isImageElementV2(element)) return { ...patch, ...extra }
		const next = updateImageVersion(
			element,
			options?.versionId ?? element.activeVersionId,
			patch,
		)
		if (!isImageElementV2(next)) return extra ?? {}
		return { ...extra, versions: next.versions }
	}

	private primeGeneratedImageResource(
		path: string,
		fileUrl: string | null | undefined,
		fileName: string,
	): void {
		if (!fileUrl) return

		this.canvas.imageResourceManager.primeCache(path, {
			src: fileUrl,
			fileName,
		})
	}

	/**
	 * 等待指定时间
	 */
	private wait(ms: number) {
		return new Promise<void>((resolve) => {
			this.waitResolve = () => {
				this.waitResolve = undefined
				resolve()
			}
			this.pollingTimer = setTimeout(() => {
				this.pollingTimer = undefined
				this.waitResolve?.()
			}, ms)
		})
	}

	private shouldSyncElement(elementId: string, outputIndex: number, versionId?: string): boolean {
		if (!this.aliveElementIds.has(elementId)) return false
		const elementData = this.canvas.elementManager.getElementData(elementId)
		if (elementData?.type !== ElementTypeEnum.Image) return false

		const taskMeta =
			versionId && isImageElementV2(elementData)
				? elementData.versions.find((version) => version.id === versionId)
						?.imageGenerationTaskMeta
				: getImageGenerationTaskMeta(elementData)
		return (
			isBatchImageGenerationTaskMeta(taskMeta) &&
			taskMeta.image_id === this.imageId &&
			taskMeta.output_index === outputIndex
		)
	}

	private handleDeletedElementIds(elementIds: string[]) {
		let hasChanges = false
		elementIds.forEach((elementId) => {
			if (this.aliveElementIds.delete(elementId)) {
				hasChanges = true
			}
		})
		if (hasChanges && this.aliveElementIds.size === 0) {
			this.stop()
		}
	}

	private handleBindSubscriptions() {
		this.unsubscribeElementDeleted = this.canvas.eventEmitter.on("element:deleted", (event) => {
			this.handleDeletedElementIds([event.data.elementId])
		})
		this.unsubscribeBatchDeleted = this.canvas.eventEmitter.on(
			"element:batchdeleted",
			(event) => {
				this.handleDeletedElementIds(event.data.elementIds)
			},
		)
	}

	private cleanupTimer() {
		if (this.pollingTimer) {
			clearTimeout(this.pollingTimer)
			this.pollingTimer = undefined
		}
		this.waitResolve?.()
	}

	private cleanupSubscriptions() {
		this.unsubscribeElementDeleted?.()
		this.unsubscribeElementDeleted = undefined
		this.unsubscribeBatchDeleted?.()
		this.unsubscribeBatchDeleted = undefined
	}
}
