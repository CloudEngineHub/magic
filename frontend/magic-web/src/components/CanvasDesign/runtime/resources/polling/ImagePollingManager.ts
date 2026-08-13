import type { Canvas } from "../../core/Canvas"
import type { ImageElement as ImageElementData } from "../../document/types"
import { GenerationStatus, type GetImageGenerationResultParams } from "../../../public/magic-types"
import { IMAGE_CONFIG } from "../../elements/image/ImageElement.config"
import { toCanvasUploadStoragePath } from "../../shared/path/canvasResourcePath"
import {
	getImageGenerationTaskMeta,
	isBatchImageGenerationTaskMeta,
} from "../image/imageGenerationTaskMeta"
import {
	extractSmartNameFromFileName,
	isGenerationTaskNotFoundError,
	shouldContinueGenerationPolling,
} from "./generationPollingUtils"

const AGENT_IMAGE_RECOVERY_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const

/**
 * 轮询管理器配置
 */
export interface PollingManagerConfig {
	/** 元素 ID */
	elementId: string
	/** Canvas 实例 */
	canvas: Canvas
	/** 获取元素数据 */
	getElementData: () => ImageElementData
	/** 状态更新回调 */
	onStatusUpdate?: () => void
}

/**
 * 图片轮询管理器
 * 负责轮询检查图片生成结果
 */
export class ImagePollingManager {
	private config: PollingManagerConfig
	private isPolling: boolean = false
	private pollingTimer?: ReturnType<typeof setTimeout>
	private pollingRunId = 0
	private activePollingKey?: string
	private unsubscribeElementUpdated?: () => void

	constructor(config: PollingManagerConfig) {
		this.config = config

		// 远端 Agent 编辑会复用同一个 ImageElement 实例。监听元素提交更新，
		// 让 image_id/src 变化立即使旧的异步恢复失效，并按新任务重新开始轮询。
		const eventEmitter = config.canvas.eventEmitter as typeof config.canvas.eventEmitter & {
			on?: (
				event: "element:updated",
				listener: (event: { data: { elementId: string } }) => void,
			) => () => void
		}
		if (typeof eventEmitter.on === "function") {
			this.unsubscribeElementUpdated = eventEmitter.on("element:updated", (event) => {
				if (event.data?.elementId !== this.config.elementId) return
				this.syncWithElementData()
			})
		}
	}

	/**
	 * 启动轮询检查图片生成结果
	 */
	public start(): void {
		const imageId = this.getPollingImageId()
		if (!imageId || !this.shouldPollCurrentElement()) {
			this.stop()
			return
		}

		const pollingKey = this.getPollingKey(imageId)
		if (this.isPolling && this.activePollingKey === pollingKey) {
			return
		}

		this.stop()
		this.isPolling = true
		this.activePollingKey = pollingKey
		const pollingRunId = ++this.pollingRunId
		void this.poll(pollingRunId)
	}

	/**
	 * 停止轮询
	 */
	public stop(): void {
		this.isPolling = false
		this.activePollingKey = undefined
		this.pollingRunId += 1
		if (this.pollingTimer) {
			clearTimeout(this.pollingTimer)
			this.pollingTimer = undefined
		}
	}

	/**
	 * 检查是否正在轮询
	 */
	public isActive(): boolean {
		return this.isPolling
	}

	/**
	 * 元素数据由远端快照或其他运行时任务更新后，同步当前轮询身份。
	 * 同一任务继续复用现有轮询；image_id/source 变化时立即让旧轮询失效。
	 */
	public syncWithElementData(): void {
		const imageId = this.getPollingImageId()
		if (!imageId || !this.shouldPollCurrentElement()) {
			if (this.isPolling) this.stop()
			return
		}

		if (this.isPolling && this.activePollingKey === this.getPollingKey(imageId)) {
			return
		}

		this.start()
	}

	/**
	 * 轮询获取图片生成结果
	 */
	private async poll(pollingRunId: number): Promise<void> {
		if (!this.isCurrentPollingRun(pollingRunId)) {
			return
		}

		if (!this.shouldPollCurrentElement()) {
			this.stopIfCurrentRun(pollingRunId)
			return
		}

		const imageId = this.getPollingImageId()
		if (imageId) {
			const imageIdSource = this.getImageIdSource(imageId)
			if (imageIdSource === "agent") {
				await this.recoverAgentGeneratedFile(imageId, pollingRunId)
				return
			}
			if (imageIdSource === "unknown") {
				// 未能确认任务归属时不调用 Design result，避免把文件名/未知 ID 当成任务 ID。
				this.stopIfCurrentRun(pollingRunId)
				return
			}
			await this.pollGenerationResult(imageId, pollingRunId)
			return
		}

		// 没有生成请求，停止轮询
		this.stopIfCurrentRun(pollingRunId)
	}

	private getPollingKey(imageId: string): string {
		return `${imageId}:${this.getImageIdSource(imageId)}`
	}

	private isCurrentPollingRun(pollingRunId: number, imageId?: string): boolean {
		if (!this.isPolling || this.pollingRunId !== pollingRunId) return false
		return !imageId || this.getPollingImageId() === imageId
	}

	private stopIfCurrentRun(pollingRunId: number): void {
		if (this.isCurrentPollingRun(pollingRunId)) {
			this.stop()
		}
	}

	private syncIfCurrentRun(pollingRunId: number): void {
		if (this.isCurrentPollingRun(pollingRunId)) {
			this.syncWithElementData()
		}
	}

	private canApplyAgentRecovery(pollingRunId: number, imageId: string): boolean {
		if (!this.isCurrentPollingRun(pollingRunId, imageId)) return false

		const elementData = this.config.getElementData()
		return (
			!elementData.src &&
			elementData.generateImageRequest?.image_id === imageId &&
			(!elementData.status || shouldContinueGenerationPolling(elementData.status)) &&
			this.getImageIdSource(imageId) === "agent"
		)
	}

	private getPollingImageId(): string | undefined {
		const elementData = this.config.getElementData()
		if (elementData.generateImageRequest?.image_id) {
			return elementData.generateImageRequest.image_id
		}

		const taskMeta = getImageGenerationTaskMeta(elementData)
		if (isBatchImageGenerationTaskMeta(taskMeta)) {
			return undefined
		}

		return taskMeta?.image_id
	}

	private getImageIdSource(imageId: string): "agent" | "user" | "inline" | "unknown" {
		const generateImageRequestId = this.config.getElementData().generateImageRequest?.image_id
		if (generateImageRequestId !== imageId) {
			// imageGenerationTaskMeta（高清、去背景、橡皮、扩图）始终是前端 Design 任务，不走 sidecar 来源门禁。
			return "inline"
		}

		const runtimeManager = (
			this.config.canvas as Canvas & {
				elementDetailsRuntimeManager?: {
					getGenerateImageRequestImageIdSource: (
						elementId: string,
						imageId?: string,
					) => "agent" | "user" | "inline" | "unknown"
				}
			}
		).elementDetailsRuntimeManager

		// 旧的独立 Canvas 测试/嵌入方没有来源管理器时，按 inline 兼容原有轮询行为。
		return (
			runtimeManager?.getGenerateImageRequestImageIdSource(this.config.elementId, imageId) ??
			"inline"
		)
	}

	private shouldPollCurrentElement(): boolean {
		const elementData = this.config.getElementData()
		if (!this.getPollingImageId()) {
			return false
		}

		if (elementData.src) {
			return false
		}

		if (elementData.status && !shouldContinueGenerationPolling(elementData.status)) {
			return false
		}

		return true
	}

	private primeGeneratedImageResource(
		path: string,
		fileUrl: string | null | undefined,
		fileName: string,
	): void {
		if (!fileUrl) return

		this.config.canvas.imageResourceManager.primeCache(path, {
			src: fileUrl,
			fileName,
			resource_version: `generated:${fileName}`,
		})
	}

	/**
	 * 轮询图片生成结果
	 */
	private async pollGenerationResult(imageId: string, pollingRunId: number): Promise<void> {
		const getImageGenerationResult =
			this.config.canvas.magicConfigManager.config?.methods?.getImageGenerationResult
		if (!getImageGenerationResult) {
			this.stopIfCurrentRun(pollingRunId)
			return
		}

		try {
			const params: GetImageGenerationResultParams = {
				image_id: imageId,
			}

			const result = await getImageGenerationResult(params)
			if (!this.isCurrentPollingRun(pollingRunId, imageId)) {
				this.syncIfCurrentRun(pollingRunId)
				return
			}

			// 构建更新数据
			const updateData: Partial<ImageElementData> = {
				status: result.status,
				errorMessage: result.error_message ?? undefined,
			}

			if (result.file_dir && result.file_name) {
				updateData.src = toCanvasUploadStoragePath(result.file_dir, result.file_name)
				this.primeGeneratedImageResource(updateData.src, result.file_url, result.file_name)

				const elementData = this.config.getElementData()
				const imageGenerationTaskMeta = getImageGenerationTaskMeta(elementData)
				if (imageGenerationTaskMeta) {
					// 高清放大 / 去背景任务，保留创建时设置的名称
					// 不更新 name，保持创建时设置的值
				} else {
					// 普通生图请求，智能提取名称
					updateData.name = extractSmartNameFromFileName(result.file_name)
				}
			}

			// 更新元素数据
			this.config.canvas.elementManager.update(this.config.elementId, updateData, {
				silent: false,
			})

			// 发出图片结果更新事件
			this.config.canvas.eventEmitter.emit({
				type: "element:image:resultUpdated",
				data: {
					elementId: this.config.elementId,
				},
			})

			// 根据状态决定是否继续轮询
			if (shouldContinueGenerationPolling(result.status)) {
				// 5 秒后继续轮询
				this.pollingTimer = setTimeout(() => {
					this.pollingTimer = undefined
					void this.poll(pollingRunId)
				}, IMAGE_CONFIG.POLLING_INTERVAL)
			} else {
				// completed 或 failed，停止轮询
				this.stopIfCurrentRun(pollingRunId)
			}
		} catch (error) {
			if (!this.isCurrentPollingRun(pollingRunId, imageId)) {
				this.syncIfCurrentRun(pollingRunId)
				return
			}
			if (isGenerationTaskNotFoundError(error, imageId)) {
				this.recoverMissingTask(imageId, pollingRunId)
				return
			}
			// getImageGenerationResult 失败，停止轮询
			this.stopIfCurrentRun(pollingRunId)
			// 触发状态更新（进入错误状态）
			this.config.onStatusUpdate?.()
		}
	}

	/**
	 * Agent 记录中的 image_id 是落盘文件名 stem，不是 Design 任务 ID。
	 * 只通过宿主文件索引恢复已存在的文件，绝不请求 getImageGenerationResult。
	 */
	private async recoverAgentGeneratedFile(imageId: string, pollingRunId: number): Promise<void> {
		const getFileInfo = this.config.canvas.magicConfigManager.config?.methods?.getFileInfo
		if (!getFileInfo) {
			this.stopIfCurrentRun(pollingRunId)
			return
		}

		for (const extension of AGENT_IMAGE_RECOVERY_EXTENSIONS) {
			for (const prefix of ["images", "./images"]) {
				if (!this.canApplyAgentRecovery(pollingRunId, imageId)) {
					this.syncIfCurrentRun(pollingRunId)
					return
				}

				const fileName = `${imageId}.${extension}`
				const candidatePath = `${prefix}/${fileName}`
				try {
					const result = await getFileInfo(candidatePath, {
						useImageProcess: false,
						forceRefresh: true,
						priority: "background",
					})
					if (!result?.src) continue
					if (!this.canApplyAgentRecovery(pollingRunId, imageId)) {
						this.syncIfCurrentRun(pollingRunId)
						return
					}

					const resolvedFileName = result.fileName || fileName
					const persistedPath = toCanvasUploadStoragePath("images", resolvedFileName)
					this.primeGeneratedImageResource(persistedPath, result.src, resolvedFileName)
					try {
						this.config.canvas.elementManager.update(
							this.config.elementId,
							{
								src: persistedPath,
								status: GenerationStatus.Completed,
								errorMessage: undefined,
							},
							{ silent: false },
						)
					} catch {
						this.stopIfCurrentRun(pollingRunId)
						return
					}
					this.config.canvas.eventEmitter.emit({
						type: "element:image:resultUpdated",
						data: { elementId: this.config.elementId },
					})
					this.stop()
					return
				} catch {
					// 继续检查下一个扩展名/兼容路径；找不到文件不代表 Design 任务失败。
				}
			}
		}

		this.stopIfCurrentRun(pollingRunId)
	}

	private recoverMissingTask(imageId: string, pollingRunId: number): void {
		if (!this.isCurrentPollingRun(pollingRunId, imageId)) return
		this.stop()
		if (this.getImageIdSource(imageId) === "agent") return
		const elementData = this.config.getElementData()
		const taskMeta = getImageGenerationTaskMeta(elementData)

		if (taskMeta?.image_id === imageId) {
			// 高清、去背景、橡皮和扩图都是纯结果节点；任务不存在时节点本身也没有保留价值。
			this.config.canvas.elementManager.delete(this.config.elementId)
			return
		}

		if (elementData.generateImageRequest?.image_id !== imageId) return
		this.config.canvas.elementManager.update(
			this.config.elementId,
			{
				generateImageRequest: undefined,
				status: undefined,
				errorMessage: undefined,
			},
			{ silent: false },
		)
		this.config.canvas.eventEmitter.emit({
			type: "element:image:generate-submit-failed",
			data: { elementId: this.config.elementId },
		})
	}

	/**
	 * 销毁管理器
	 */
	public destroy(): void {
		this.stop()
		this.unsubscribeElementUpdated?.()
		this.unsubscribeElementUpdated = undefined
	}
}
