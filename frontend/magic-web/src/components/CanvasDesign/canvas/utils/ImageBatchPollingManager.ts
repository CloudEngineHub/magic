import type { Canvas } from "../Canvas"
import type { ImageElement as ImageElementData } from "../types"
import type {
	GeneratedImageResultItem,
	GetImageGenerationResultsParams,
	ImageGenerationResultsResponse,
} from "../../types.magic"
import { IMAGE_CONFIG } from "../element/elements/ImageElement.config"
import type { ImageBatchPollingRegistry } from "./ImageBatchPollingRegistry"
import {
	extractSmartNameFromFileName,
	shouldContinueGenerationPolling,
} from "./generationPollingUtils"
import { joinUploadStoragePath } from "./pathUtils"

export interface ImageBatchPollingManagerConfig {
	canvas: Canvas
	imageId: string
	elementIds: string[]
	registry: ImageBatchPollingRegistry
}

export class ImageBatchPollingManager {
	private readonly canvas: Canvas
	private readonly imageId: string
	private readonly elementIds: string[]
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
		this.elementIds = config.elementIds
		this.registry = config.registry
		this.aliveElementIds = new Set(config.elementIds)
		this.unsubscribeElementDeleted = this.canvas.eventEmitter.on("element:deleted", (event) => {
			this.handleDeletedElementIds([event.data.elementId])
		})
		this.unsubscribeBatchDeleted = this.canvas.eventEmitter.on("element:batchdeleted", (event) => {
			this.handleDeletedElementIds(event.data.elementIds)
		})
	}

	/**
	 * 启动批量生成结果轮询
	 */
	public async start(): Promise<void> {
		if (this.isPolling) return
		this.isPolling = true
		this.registry.track(this)

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
			// getImageGenerationResult 失败，停止轮询
			this.stop()
		} finally {
			this.registry.untrack(this)
			this.cleanupTimer()
			this.cleanupSubscriptions()
		}
	}

	/**
	 * 停止批量生成结果轮询
	 */
	public stop(): void {
		this.isPolling = false
		this.cleanupTimer()
		this.cleanupSubscriptions()
	}

	public destroy(): void {
		this.stop()
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
				outputIndex > this.elementIds.length
			) {
				continue
			}
			if (this.syncedIndexes.has(outputIndex)) continue

			const elementId = this.elementIds[outputIndex - 1]
			if (!this.shouldSyncElement(elementId)) continue
			const updateData = this.buildCompletedElementUpdate(result, image)
			// 更新元素数据
			this.canvas.elementManager.update(elementId, updateData, { silent: false })
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
				if (this.syncedIndexes.has(index + 1)) return
				if (!this.shouldSyncElement(elementId)) return
				this.canvas.elementManager.update(
					elementId,
					{
						status: "failed",
						errorMessage: result.error_message ?? undefined,
					} satisfies Partial<ImageElementData>,
					{ silent: false },
				)
			})
			this.elementIds.forEach((elementId, index) => {
				if (this.syncedIndexes.has(index + 1)) return
				if (!this.shouldSyncElement(elementId)) return
				this.canvas.eventEmitter.emit({
					type: "element:image:generate-submit-failed",
					data: { elementId },
				})
			})
			return
		}

		if (result.status === "completed") {
			this.elementIds.forEach((elementId, index) => {
				if (this.syncedIndexes.has(index + 1)) return
				if (!this.shouldSyncElement(elementId)) return
				this.canvas.elementManager.update(
					elementId,
					{
						status: "completed",
						errorMessage: undefined,
					} satisfies Partial<ImageElementData>,
					{ silent: false },
				)
			})
		}
	}

	/**
	 * 构建完成元素更新数据
	 */
	private buildCompletedElementUpdate(
		result: ImageGenerationResultsResponse,
		image: GeneratedImageResultItem,
	): Partial<ImageElementData> {
		const updateData: Partial<ImageElementData> = {
			status: "completed",
			errorMessage: undefined,
		}

		if (result.file_dir && image.file_name) {
			updateData.src = joinUploadStoragePath(result.file_dir, image.file_name)
			updateData.name = extractSmartNameFromFileName(image.file_name)
		}

		return updateData
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

	private shouldSyncElement(elementId: string): boolean {
		return this.aliveElementIds.has(elementId) && this.canvas.elementManager.hasElement(elementId)
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
