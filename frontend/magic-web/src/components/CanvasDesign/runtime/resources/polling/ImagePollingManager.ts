import type { Canvas } from "../../core/Canvas"
import type { ImageElement as ImageElementData, ImageElementVersion } from "../../document/types"
import {
	getImageVersionById,
	isImageElementV2,
	updateImageVersion,
} from "../../document/imageVersion"
import { GenerationStatus, type GetImageGenerationResultParams } from "../../../public/magic-types"
import { IMAGE_CONFIG } from "../../elements/image/ImageElement.config"
import {
	getCanvasHostResourceReferenceResolver,
	resolveCanvasStorageResourceReference,
	resolveCanvasGeneratedResourceStoragePath,
} from "../../shared/path/canvasResourcePath"
import { isBatchImageGenerationTaskMeta } from "../image/imageGenerationTaskMeta"
import {
	extractSmartNameFromFileName,
	getGenerationResultStatusPatch,
	isGenerationTaskNotFoundError,
	shouldContinueGenerationPolling,
} from "./generationPollingUtils"

const AGENT_IMAGE_RECOVERY_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const

interface PollingTarget {
	versionId?: string
	version: ImageElementVersion
	imageId: string
}

export interface PollingManagerConfig {
	elementId: string
	canvas: Canvas
	getElementData: () => ImageElementData
	onStatusUpdate?: (versionId?: string) => void
	/** 仅在成功结果写回的同一次文档更新中决定是否自动激活新版本。 */
	shouldAutoActivateVersion?: (versionId: string) => boolean
	onVersionSettled?: (versionId: string) => void
}

/** 图片轮询管理器：V1 轮询顶层任务，V2 同时轮询所有未完成版本。 */
export class ImagePollingManager {
	private config: PollingManagerConfig
	private isPolling = false
	private pollingTimer?: ReturnType<typeof setTimeout>
	private pollingRunId = 0
	private pollingRequestSequence = 0
	private inFlightPollingKeys = new Map<string, number>()
	private nextPollAtByKey = new Map<string, number>()
	private observedPollingKeyByIdentity = new Map<string, string>()
	private pausedPollingKeys = new Set<string>()
	private unsubscribeElementUpdated?: () => void

	constructor(config: PollingManagerConfig) {
		this.config = config
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

	public start(): void {
		this.syncWithElementData()
	}

	public stop(): void {
		this.isPolling = false
		this.pollingRunId += 1
		this.clearPollingTimer()
		this.inFlightPollingKeys.clear()
		this.nextPollAtByKey.clear()
	}

	public isActive(): boolean {
		return this.isPolling
	}

	public syncWithElementData(): void {
		this.reconcileObservedTargets()
		const targets = this.getPollingTargets()
		if (targets.length === 0) {
			this.clearPollingTimer()
			if (this.inFlightPollingKeys.size === 0 && this.isPolling) this.stop()
			return
		}
		if (!this.isPolling) {
			this.isPolling = true
			this.pollingRunId += 1
		}
		this.schedulePolling(this.pollingRunId)
	}

	/**
	 * 只启动当前尚未 in-flight 且已到期的目标。元素更新可以随时调用该方法：
	 * 相同目标会被去重，新追加的版本则无需等待其他版本完成即可开始轮询。
	 */
	private schedulePolling(pollingRunId: number): void {
		if (!this.isCurrentPollingRunId(pollingRunId)) return
		this.clearPollingTimer()
		const targets = this.getPollingTargets()
		if (targets.length === 0) {
			if (this.inFlightPollingKeys.size === 0) this.stopIfCurrentRun(pollingRunId)
			return
		}

		const now = Date.now()
		let nextPollAt = Number.POSITIVE_INFINITY
		for (const target of targets) {
			const pollingKey = this.getPollingKey(target)
			if (this.inFlightPollingKeys.has(pollingKey)) continue

			const targetNextPollAt = this.nextPollAtByKey.get(pollingKey)
			if (targetNextPollAt === undefined || targetNextPollAt <= now) {
				this.startPollingTarget(target, pollingRunId, pollingKey)
				continue
			}
			nextPollAt = Math.min(nextPollAt, targetNextPollAt)
		}

		if (Number.isFinite(nextPollAt)) {
			this.pollingTimer = setTimeout(
				() => {
					this.pollingTimer = undefined
					this.schedulePolling(pollingRunId)
				},
				Math.max(0, nextPollAt - Date.now()),
			)
		}
	}

	private startPollingTarget(
		target: PollingTarget,
		pollingRunId: number,
		pollingKey: string,
	): void {
		const requestSequence = ++this.pollingRequestSequence
		this.inFlightPollingKeys.set(pollingKey, requestSequence)
		this.nextPollAtByKey.delete(pollingKey)

		void this.pollTarget(target, pollingRunId).finally(() => {
			if (!this.isCurrentPollingRunId(pollingRunId)) return
			if (this.inFlightPollingKeys.get(pollingKey) !== requestSequence) return

			this.inFlightPollingKeys.delete(pollingKey)
			this.reconcileObservedTargets()
			const stillCurrent = this.getPollingTargets().some(
				(candidate) => this.getPollingKey(candidate) === pollingKey,
			)
			if (stillCurrent) {
				this.nextPollAtByKey.set(pollingKey, Date.now() + IMAGE_CONFIG.POLLING_INTERVAL)
			} else {
				this.nextPollAtByKey.delete(pollingKey)
			}
			this.schedulePolling(pollingRunId)
		})
	}

	private async pollTarget(target: PollingTarget, pollingRunId: number): Promise<void> {
		const imageIdSource = this.getImageIdSource(target)
		if (imageIdSource === "agent") {
			await this.recoverAgentGeneratedFile(target, pollingRunId)
			return
		}
		if (imageIdSource === "unknown") {
			this.pausedPollingKeys.add(this.getTargetIdentity(target))
			return
		}
		await this.pollGenerationResult(target, pollingRunId)
	}

	private getCandidateTargets(): PollingTarget[] {
		const element = this.config.getElementData()
		if (isImageElementV2(element)) {
			const targets: PollingTarget[] = []
			for (const version of element.versions) {
				const imageId = this.getVersionPollingImageId(version)
				if (!imageId || version.src) continue
				if (version.status && !shouldContinueGenerationPolling(version.status)) continue
				targets.push({ versionId: version.id, version, imageId })
			}
			return targets
		}

		const version: ImageElementVersion = {
			id: element.id,
			src: element.src,
			status: element.status,
			errorMessage: element.errorMessage,
			generateImageRequest: element.generateImageRequest,
			imageGenerationTaskMeta: element.imageGenerationTaskMeta,
			crop: element.crop,
		}
		const imageId = this.getVersionPollingImageId(version)
		if (!imageId || version.src) return []
		if (version.status && !shouldContinueGenerationPolling(version.status)) return []
		return [{ version, imageId }]
	}

	private getPollingTargets(): PollingTarget[] {
		return this.getCandidateTargets().filter(
			(target) => !this.pausedPollingKeys.has(this.getTargetIdentity(target)),
		)
	}

	/**
	 * paused 状态只属于具体的 versionId + imageId；普通几何更新不会解除暂停，
	 * 任务 ID 或来源真正变化时，会通过 observed key 变化解除旧暂停并重新调度。
	 */
	private reconcileObservedTargets(): void {
		const nextPollingKeyByIdentity = new Map<string, string>()
		for (const target of this.getCandidateTargets()) {
			nextPollingKeyByIdentity.set(this.getTargetIdentity(target), this.getPollingKey(target))
		}

		for (const identity of this.pausedPollingKeys) {
			if (
				this.observedPollingKeyByIdentity.get(identity) !==
				nextPollingKeyByIdentity.get(identity)
			) {
				this.pausedPollingKeys.delete(identity)
			}
		}

		const nextPollingKeys = new Set(nextPollingKeyByIdentity.values())
		for (const pollingKey of this.nextPollAtByKey.keys()) {
			if (!nextPollingKeys.has(pollingKey)) this.nextPollAtByKey.delete(pollingKey)
		}
		this.observedPollingKeyByIdentity = nextPollingKeyByIdentity
	}

	private getVersionPollingImageId(version: ImageElementVersion): string | undefined {
		if (version.generateImageRequest?.image_id) return version.generateImageRequest.image_id
		const taskMeta = version.imageGenerationTaskMeta
		if (isBatchImageGenerationTaskMeta(taskMeta)) return undefined
		return taskMeta?.image_id
	}

	private getPollingKey(target: PollingTarget): string {
		return `${target.versionId ?? "v1"}:${target.imageId}:${this.getImageIdSource(target)}`
	}

	private getTargetIdentity(target: PollingTarget): string {
		return `${target.versionId ?? "v1"}:${target.imageId}`
	}

	private getCurrentTarget(
		pollingRunId: number,
		target: PollingTarget,
	): PollingTarget | undefined {
		if (!this.isPolling || this.pollingRunId !== pollingRunId) return undefined
		return this.getPollingTargets().find(
			(candidate) => this.getPollingKey(candidate) === this.getPollingKey(target),
		)
	}

	private isCurrentPollingRun(pollingRunId: number, target?: PollingTarget): boolean {
		if (!this.isCurrentPollingRunId(pollingRunId)) return false
		return !target || Boolean(this.getCurrentTarget(pollingRunId, target))
	}

	/**
	 * 判断异步回调仍属于当前轮询生命周期。目标身份变化时，旧回调需要触发一次
	 * syncWithElementData()，而不能因为目标 key 已变化就把管理器永久留在 active 状态。
	 */
	private isCurrentPollingRunId(pollingRunId: number): boolean {
		return this.isPolling && this.pollingRunId === pollingRunId
	}

	private stopIfCurrentRun(pollingRunId: number): void {
		if (this.isCurrentPollingRunId(pollingRunId)) this.stop()
	}

	private clearPollingTimer(): void {
		if (this.pollingTimer === undefined) return
		clearTimeout(this.pollingTimer)
		this.pollingTimer = undefined
	}

	private hasPatchChanges(current: object, patch: object): boolean {
		const currentRecord = current as Record<string, unknown>
		return Object.entries(patch).some(([key, value]) => currentRecord[key] !== value)
	}

	private getImageIdSource(target: PollingTarget): "agent" | "user" | "inline" | "unknown" {
		if (target.version.imageGenerationTaskMeta?.image_id === target.imageId) return "inline"

		const runtimeManager = (
			this.config.canvas as Canvas & {
				elementDetailsRuntimeManager?: {
					getGenerateImageRequestImageIdSource: (
						elementId: string,
						imageId?: string,
						versionId?: string,
					) => "agent" | "user" | "inline" | "unknown"
				}
			}
		).elementDetailsRuntimeManager

		return (
			runtimeManager?.getGenerateImageRequestImageIdSource(
				this.config.elementId,
				target.imageId,
				target.versionId,
			) ?? "inline"
		)
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

	private async pollGenerationResult(target: PollingTarget, pollingRunId: number): Promise<void> {
		const getImageGenerationResult =
			this.config.canvas.magicConfigManager.config?.methods?.getImageGenerationResult
		if (!getImageGenerationResult) {
			this.stopIfCurrentRun(pollingRunId)
			return
		}

		try {
			const params: GetImageGenerationResultParams = { image_id: target.imageId }
			const result = await getImageGenerationResult(params)
			if (!this.isCurrentPollingRun(pollingRunId, target)) {
				this.syncWithElementData()
				return
			}

			const storagePath =
				result.file_dir && result.file_name
					? resolveCanvasGeneratedResourceStoragePath(
							this.config.canvas,
							result.file_dir,
							result.file_name,
						)
					: undefined
			const versionPatch = {
				...getGenerationResultStatusPatch(
					result.status,
					result.error_message,
					Boolean(storagePath),
				),
				...(storagePath ? { src: storagePath } : {}),
			}
			if (storagePath && result.file_name) {
				this.primeGeneratedImageResource(storagePath, result.file_url, result.file_name)
			}

			const currentElement = this.config.getElementData()
			let didUpdateElement = false
			if (isImageElementV2(currentElement) && target.versionId) {
				const currentVersion = getImageVersionById(currentElement, target.versionId)
				if (!currentVersion) return
				const shouldActivate =
					result.status === GenerationStatus.Completed &&
					Boolean(storagePath) &&
					this.config.shouldAutoActivateVersion?.(target.versionId)
				if (this.hasPatchChanges(currentVersion, versionPatch) || shouldActivate) {
					const nextElement = updateImageVersion(
						currentElement,
						target.versionId,
						versionPatch,
					)
					if (!isImageElementV2(nextElement)) return
					this.config.canvas.elementManager.update(
						this.config.elementId,
						{
							versions: nextElement.versions,
							...(shouldActivate ? { activeVersionId: target.versionId } : {}),
						},
						{ silent: false },
					)
					didUpdateElement = true
				}
			} else {
				const updateData = {
					...versionPatch,
					...(storagePath && result.file_name && !target.version.imageGenerationTaskMeta
						? { name: extractSmartNameFromFileName(result.file_name) }
						: {}),
				}
				if (this.hasPatchChanges(currentElement, updateData)) {
					this.config.canvas.elementManager.update(this.config.elementId, updateData, {
						silent: false,
					})
					didUpdateElement = true
				}
			}

			if (didUpdateElement) {
				this.config.canvas.eventEmitter.emit({
					type: "element:image:resultUpdated",
					data: { elementId: this.config.elementId },
				})
			}

			if (!shouldContinueGenerationPolling(versionPatch.status ?? result.status)) {
				if (target.versionId) this.config.onVersionSettled?.(target.versionId)
			}
		} catch (error) {
			if (!this.isCurrentPollingRun(pollingRunId, target)) {
				this.syncWithElementData()
				return
			}
			if (isGenerationTaskNotFoundError(error, target.imageId)) {
				this.recoverMissingTask(target, pollingRunId)
				return
			}
			// 单个版本查询失败不能终止同一图片元素的其他版本轮询。
			this.pausedPollingKeys.add(this.getTargetIdentity(target))
			this.config.onStatusUpdate?.(target.versionId)
		}
	}

	private canApplyAgentRecovery(pollingRunId: number, target: PollingTarget): boolean {
		if (target.versionId || !this.isCurrentPollingRun(pollingRunId, target)) return false
		const current = this.getPollingTargets().find(
			(candidate) => this.getPollingKey(candidate) === this.getPollingKey(target),
		)
		return Boolean(
			current && !current.version.src && this.getImageIdSource(current) === "agent",
		)
	}

	private async recoverAgentGeneratedFile(
		target: PollingTarget,
		pollingRunId: number,
	): Promise<void> {
		const getFileInfo = this.config.canvas.magicConfigManager.config?.methods?.getFileInfo
		const resolveResourceReference = getCanvasHostResourceReferenceResolver(this.config.canvas)
		if (!getFileInfo || !resolveResourceReference || target.versionId) {
			this.pausedPollingKeys.add(this.getTargetIdentity(target))
			return
		}

		for (const extension of AGENT_IMAGE_RECOVERY_EXTENSIONS) {
			if (!this.canApplyAgentRecovery(pollingRunId, target)) {
				this.syncWithElementData()
				return
			}
			const fileName = `${target.imageId}.${extension}`
			const candidatePath = `images/${fileName}`
			try {
				const result = await getFileInfo(candidatePath, {
					useImageProcess: false,
					forceRefresh: true,
					priority: "background",
				})
				if (!result?.src || !this.canApplyAgentRecovery(pollingRunId, target)) continue
				const resolution = resolveCanvasStorageResourceReference(
					candidatePath,
					resolveResourceReference,
					{ requireAttachment: true },
				)
				if (
					resolution.status !== "resolved" ||
					resolution.resourceKind !== "workspace-file"
				) {
					continue
				}
				const persistedPath = resolution.storagePath
				this.primeGeneratedImageResource(
					persistedPath,
					result.src,
					result.fileName || fileName,
				)
				this.config.canvas.elementManager.update(
					this.config.elementId,
					{
						src: persistedPath,
						status: GenerationStatus.Completed,
						errorMessage: undefined,
					},
					{ silent: false },
				)
				this.config.canvas.eventEmitter.emit({
					type: "element:image:resultUpdated",
					data: { elementId: this.config.elementId },
				})
				return
			} catch {
				// 继续检查其他后缀；找不到文件不代表 Agent 任务失败。
			}
		}
		this.pausedPollingKeys.add(this.getTargetIdentity(target))
	}

	private recoverMissingTask(target: PollingTarget, pollingRunId: number): void {
		if (!this.isCurrentPollingRun(pollingRunId, target)) return
		if (this.getImageIdSource(target) === "agent") return
		const element = this.config.getElementData()
		if (isImageElementV2(element) && target.versionId) {
			const targetVersion = getImageVersionById(element, target.versionId)
			if (!targetVersion) return
			const next = updateImageVersion(element, target.versionId, {
				status: GenerationStatus.Failed,
				errorMessage: undefined,
			})
			if (isImageElementV2(next)) {
				this.config.canvas.elementManager.update(
					this.config.elementId,
					{ versions: next.versions },
					{ silent: false },
				)
				this.config.onVersionSettled?.(target.versionId)
			}
		} else if (target.version.imageGenerationTaskMeta?.image_id === target.imageId) {
			this.config.canvas.elementManager.delete(this.config.elementId)
			return
		} else if (target.version.generateImageRequest?.image_id === target.imageId) {
			this.config.canvas.elementManager.update(
				this.config.elementId,
				{
					generateImageRequest: undefined,
					status: undefined,
					errorMessage: undefined,
				},
				{ silent: false },
			)
		}
		this.config.canvas.eventEmitter.emit({
			type: "element:image:generate-submit-failed",
			data: { elementId: this.config.elementId },
		})
	}

	public destroy(): void {
		this.stop()
		this.unsubscribeElementUpdated?.()
		this.unsubscribeElementUpdated = undefined
	}
}
