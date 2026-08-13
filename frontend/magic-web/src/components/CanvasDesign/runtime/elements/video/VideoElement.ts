import Konva from "konva"
import type {
	VideoElement as VideoElementData,
	VideoElementContent,
	LayerElement,
} from "../../document/types"
import { ElementTypeEnum } from "../../document/types"
import { GenerationStatus } from "../../../public/magic-types"
import {
	appendContent,
	createContentId,
	deleteActiveContent as deleteContentFromData,
	getActiveContent,
	getContentById,
	getPendingVideoGenerationContent,
	hasPendingVideoGenerationContent,
} from "../../document/elementContent"
import type {
	GenerateVideoRequest,
	StoredVideoModeDraftsMap,
	UploadFileResponse,
} from "../../../public/magic-types"
import { BaseElement } from "../core/BaseElement"
import { RenderUtils } from "../../shared/render/RenderUtils"
import { generateUUID, type Rect } from "../../shared/ids"
import { BorderDecorator } from "../decorators/BorderDecorator"
import {
	ElementCornerActionsDecorator,
	type ElementCornerActionConfig,
} from "../decorators/ElementCornerActionsDecorator"
import { TransformBehavior } from "../../interaction/transform/TransformManager"
import type { TransformContext } from "../core/BaseElement"
import {
	appendReferenceImageInfos,
	removeReferenceImageInfosByPath,
	replaceReferenceImageInfos,
} from "../core/referenceImageInfos"
import { VideoRenderer } from "./VideoRenderer"
import { VideoPollingManager } from "../../resources/polling/VideoPollingManager"
import { areCanvasHostResourceReferencesSame } from "../../shared/path/canvasResourcePath"
import {
	buildFullscreenVideoPlaybackConsumerId,
	buildInlineVideoPlaybackConsumerId,
} from "../../resources/video/videoPlaybackConsumerIds"
import { VIDEO_CONFIG } from "./VideoElement.config"
import type { Canvas } from "../../core/Canvas"
import type { VideoPlaybackConsumerState } from "../../resources/video/VideoPlaybackManager"
import type {
	LoadedVideoResource,
	VideoResourceLoadOptions,
} from "../../resources/video/VideoResourceManager"
import type { ResourceLoadFailureReason } from "../../resources/media-common/resourceLoadFailure"
import { hasVideoGenerationRequestSubmitIntent } from "../../shared/videoGenerationRequestIntent"
import { resolveGenerationErrorMessage } from "../../resources/polling/generationPollingUtils"

type VideoRenderStage = "empty" | "uploading" | "generating" | "loading" | "ready" | "error"

interface VideoRenderState {
	stage: VideoRenderStage
	text?: string
	placeholderMode?: "empty" | "loading" | "error"
}

/**
 * 画布视频元素实例：发起生成、轮询结果、Konva 占位与预览、与全屏层交接同一 HTMLVideoElement
 */
export class VideoElement extends BaseElement<VideoElementData> {
	private static pendingPreviewRefreshes = new Set<VideoElement>()
	private static previewRefreshRafId: number | null = null

	private renderer = new VideoRenderer()
	private pollingManager: VideoPollingManager
	private borderDecorator?: BorderDecorator
	private cornerActionsDecorator?: ElementCornerActionsDecorator
	public isGenerating = false
	private isLoadingState = false
	private isInlinePlaybackPending = false
	private isInlinePlaybackRefreshing = false
	private isErrorState = false
	private contentUpdateHandler?: () => void
	private tempGenerateVideoRequest?: Partial<GenerateVideoRequest>
	private modeInputDrafts?: StoredVideoModeDraftsMap
	private referenceImageInfos: UploadFileResponse[] = []
	private previewLoadToken = 0
	private previewLoadInFlightPath?: string
	private inlinePlaybackRequestToken = 0
	private inlinePlaybackPromise?: Promise<boolean>
	private inlinePlaybackStateUnsubscribe?: () => void
	private isDestroyed = false
	public uploadResult?: UploadFileResponse
	private selectionChangeHandler?: (event: { data: { elementIds: string[] } }) => void
	private deselectHandler?: (event: { data: { elementIds?: string[] } | undefined }) => void
	private videoResourceRefreshedHandler?: (event: {
		data: { path: string; resource: LoadedVideoResource }
	}) => void
	private videoResourceLoadFailedHandler?: (event: {
		data: {
			path: string
			reason?: ResourceLoadFailureReason
			preservePreview?: boolean
		}
	}) => void
	private isRetryEditing = false
	private generationRuntimeUnsubscribe?: () => void
	private mediaReplaceStateUnsubscribe?: () => void

	constructor(data: VideoElementData, canvas: Canvas) {
		super(data, canvas)
		this.setupRetryEditingListeners()
		this.setupVideoResourceRefreshedListener()
		this.setupVideoResourceLoadFailedListener()
		this.generationRuntimeUnsubscribe = this.canvas.generationRuntimeManager.subscribeElement(
			this.data.id,
			() => {
				this.rerenderWhenTransformIdle()
			},
		)
		this.mediaReplaceStateUnsubscribe = this.canvas.eventEmitter.on(
			"element:media:replaceStateChanged",
			({ data: eventData }) => {
				if (eventData.elementId !== this.data.id) return
				this.rerenderWhenTransformIdle()
			},
		)

		const pollingContent = getPendingVideoGenerationContent(this.data) ?? this.getVideoContent()
		this.pollingManager = new VideoPollingManager({
			elementId: this.data.id,
			canvas: this.canvas,
			contentId: pollingContent?.contentId,
			getElementData: () => this.data,
			onPollingIssue: (contentId) => {
				if (contentId && contentId !== this.getVideoContent()?.contentId) return
				this.handlePollingIssue()
			},
		})

		const tempConfig = VideoElement.getTempConfigFromStorage(this.canvas, this.data.id)
		this.modeInputDrafts = VideoElement.getModeInputDraftsFromStorage(this.canvas, this.data.id)
		if (tempConfig) {
			this.tempGenerateVideoRequest = tempConfig
		} else {
			const generateVideoRequest = this.getVideoContent()?.generateVideoRequest
			if (generateVideoRequest) {
				// 无本地临时草稿时，从元素已保存的请求恢复可继续编辑的字段子集
				const { model_id, input_mode, task, generation, inputs, video_id } =
					generateVideoRequest
				this.tempGenerateVideoRequest = {
					...(model_id && { model_id }),
					...(input_mode && { input_mode }),
					...(task && { task }),
					...(generation ? { generation } : {}),
					...(inputs ? { inputs } : {}),
					...(video_id ? { video_id } : {}),
				}
			}
		}

		if (!pollingContent?.src && pollingContent?.generateVideoRequest?.video_id) {
			this.pollingManager.start()
		}
	}

	override destroy(): void {
		this.isDestroyed = true
		this.canvas.visibilityManager.unregisterVideoElement(this.data.id)
		this.cancelScheduledPreviewRefresh()
		this.inlinePlaybackRequestToken += 1
		this.previewLoadInFlightPath = undefined
		this.inlinePlaybackPromise = undefined
		this.isInlinePlaybackPending = false
		this.isInlinePlaybackRefreshing = false
		this.clearInlinePlaybackStateSubscription()
		this.releasePlaybackConsumers()
		this.pollingManager.destroy()
		this.renderer.destroy()
		this.borderDecorator?.destroy()
		this.cornerActionsDecorator?.destroy()
		this.removeContentUpdateListener()
		this.removeRetryEditingListeners()
		this.removeVideoResourceRefreshedListener()
		this.removeVideoResourceLoadFailedListener()
		this.generationRuntimeUnsubscribe?.()
		this.generationRuntimeUnsubscribe = undefined
		this.mediaReplaceStateUnsubscribe?.()
		this.mediaReplaceStateUnsubscribe = undefined
		super.destroy()
	}

	override rerender(): Konva.Node | null {
		this.removeContentUpdateListener()
		this.renderer.resetTransientContent()
		this.borderDecorator?.destroy()
		this.borderDecorator = undefined
		this.cornerActionsDecorator?.destroy()
		this.cornerActionsDecorator = undefined
		return super.rerender()
	}

	/** 调用宿主 generateVideo，写入 generateVideoRequest 并启动轮询 */
	public async generateVideo(request: GenerateVideoRequest): Promise<boolean> {
		const generateVideo = this.canvas.magicConfigManager.config?.methods?.generateVideo
		if (
			!generateVideo ||
			this.hasPendingVideoGeneration() ||
			!request.model_id ||
			!hasVideoGenerationRequestSubmitIntent(request)
		) {
			this.canvas.eventEmitter.emit({
				type: "element:video:generate-submit-failed",
				data: { elementId: this.data.id },
			})
			return false
		}

		const requestWithId: GenerateVideoRequest = {
			...request,
			// 复用已有 video_id，避免同一次编辑链路上被当成新任务
			video_id:
				request.video_id ||
				this.getVideoRequest()?.video_id ||
				this.tempGenerateVideoRequest?.video_id ||
				generateUUID(),
		}
		const contentId =
			this.getVideoContent()?.contentId ?? this.data.activeContentId ?? undefined
		this.isGenerating = true
		this.isErrorState = false
		this.isRetryEditing = false
		const isGenerationPlaceholder =
			this.canvas.elementManager.getTemporaryElementMetadata?.(this.data.id)?.kind ===
			"generation-result"
		const attemptId = this.canvas.generationRuntimeManager.beginAttempt({
			operation: "video-generate",
			originElementId: this.data.id,
			targets: [
				{
					elementId: this.data.id,
					...(contentId ? { contentId } : {}),
					generateVideoRequest: requestWithId,
				},
			],
			failurePolicy: isGenerationPlaceholder ? "promote-empty" : "restore-existing",
		})
		this.rerender()
		this.canvas.eventEmitter.emit({
			type: "element:video:generate-submit-started",
			data: { elementId: this.data.id },
		})

		try {
			await generateVideo(requestWithId)
			if (
				!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id, contentId)
			) {
				this.isGenerating = false
				return false
			}
			this.isGenerating = false

			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					...(contentId ? { contentId } : {}),
					persistedPatch: {
						contents: this.data.contents.map((content) =>
							content.contentId === contentId
								? {
										...content,
										generateVideoRequest: requestWithId,
										videoGenerationResultMeta: undefined,
										status: undefined,
										errorMessage: undefined,
										src: undefined,
									}
								: content,
						),
						activeContentId: this.data.activeContentId,
						mainContentId: this.data.mainContentId,
					},
				},
			])
			if (!confirmed) return false

			this.isErrorState = false
			this.clearTempGenerateVideoRequest()
			this.pollingManager.start()
			this.rerender()
			return true
		} catch (error) {
			if (
				!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id, contentId)
			) {
				this.isGenerating = false
				return false
			}
			this.isGenerating = false
			this.canvas.eventEmitter.emit({
				type: "element:video:generate-submit-failed",
				data: { elementId: this.data.id },
			})
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	/**
	 * 在当前视频元素内追加一次生成 Content，供结果态的重新编辑/再次生成使用。
	 * 生成请求确认前只登记运行时 attempt，避免失败时把空任务写入 DSL。
	 */
	public async submitContentGeneration(request: GenerateVideoRequest): Promise<boolean> {
		const generateVideo = this.canvas.magicConfigManager.config?.methods?.generateVideo
		if (
			!generateVideo ||
			this.hasPendingVideoGeneration() ||
			!request.model_id ||
			!hasVideoGenerationRequestSubmitIntent(request)
		) {
			this.canvas.eventEmitter.emit({
				type: "element:video:generate-submit-failed",
				data: { elementId: this.data.id },
			})
			return false
		}

		const contentId = createContentId("content")
		const requestWithId: GenerateVideoRequest = {
			...request,
			prompt: request.prompt?.trim(),
			// 追加 Content 必须对应全新的服务端任务，不能复用旧版本的 video_id。
			video_id: generateUUID(),
		}
		this.isGenerating = true
		this.isErrorState = false
		this.isRetryEditing = false
		const attemptId = this.canvas.generationRuntimeManager.beginAttempt({
			operation: "video-generate",
			originElementId: this.data.id,
			targets: [
				{
					elementId: this.data.id,
					contentId,
					generateVideoRequest: requestWithId,
				},
			],
			failurePolicy: "restore-existing",
		})
		this.rerender()
		this.canvas.eventEmitter.emit({
			type: "element:video:generate-submit-started",
			data: { elementId: this.data.id },
		})

		try {
			await generateVideo(requestWithId)
			if (
				!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id, contentId)
			) {
				this.isGenerating = false
				return false
			}

			const current = this.canvas.elementManager.getElementData(this.data.id)
			if (!current || current.type !== ElementTypeEnum.Video) {
				this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
				this.isGenerating = false
				return false
			}

			const next = appendContent<VideoElementData>(current, {
				contentId,
				generateVideoRequest: requestWithId,
			})
			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					contentId,
					persistedPatch: {
						contents: next.contents,
						activeContentId: contentId,
						mainContentId: next.mainContentId,
					},
				},
			])
			if (!confirmed) {
				this.isGenerating = false
				return false
			}

			this.isGenerating = false
			this.isErrorState = false
			this.clearTempGenerateVideoRequest()
			this.pollingManager.setContentId(contentId)
			this.pollingManager.start()
			this.rerender()
			return true
		} catch {
			if (
				!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id, contentId)
			) {
				this.isGenerating = false
				return false
			}
			this.isGenerating = false
			this.canvas.eventEmitter.emit({
				type: "element:video:generate-submit-failed",
				data: { elementId: this.data.id },
			})
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	public switchActiveContent(contentId: string): boolean {
		if (!getContentById(this.data, contentId)) return false
		if (this.data.activeContentId === contentId) return true
		this.canvas.elementManager.update(
			this.data.id,
			{ activeContentId: contentId },
			{ silent: false },
		)
		return true
	}

	public setMainContent(contentId: string): boolean {
		const target = getContentById(this.data, contentId)
		if (!target?.src || target.status !== GenerationStatus.Completed) return false
		if (this.data.mainContentId === contentId) return true
		this.canvas.elementManager.update(
			this.data.id,
			{ mainContentId: contentId },
			{ silent: false },
		)
		return true
	}

	public deleteActiveContent(): boolean {
		const activeContent = getActiveContent<VideoElementContent>(this.data)
		if (
			activeContent?.status === GenerationStatus.Pending ||
			activeContent?.status === GenerationStatus.Processing ||
			this.isGenerating
		) {
			return false
		}

		const result = deleteContentFromData(
			this.data,
			(content) => Boolean(content.src) && content.status === GenerationStatus.Completed,
		)
		if (!result) return false
		this.canvas.elementManager.update(
			this.data.id,
			{
				contents: result.element.contents,
				activeContentId: result.element.activeContentId,
				mainContentId: result.element.mainContentId,
			},
			{ silent: false },
		)
		return true
	}

	private async loadPreviewFromPath(
		path: string,
		options?: VideoResourceLoadOptions,
	): Promise<void> {
		const loadToken = ++this.previewLoadToken
		this.previewLoadInFlightPath = path
		this.isLoadingState = true
		this.isErrorState = false

		try {
			const loaded = await this.canvas.videoResourceManager.getPreviewResource(path, options)
			if (!loaded) {
				if (loadToken !== this.previewLoadToken || this.getVideoSrc() !== path) {
					return
				}
				if (options?.signal?.aborted) {
					this.isLoadingState = false
					this.schedulePreviewRefresh()
					return
				}
				if (
					this.renderer.hasPreview() &&
					this.canvas.videoResourceManager.needsResourceReload(path)
				) {
					this.isLoadingState = false
					this.isErrorState = false
					this.schedulePreviewRefresh()
					return
				}
				this.isLoadingState = false
				this.isErrorState = true
				this.schedulePreviewRefresh()
				return
			}

			if (loadToken !== this.previewLoadToken || this.getVideoSrc() !== path) {
				return
			}

			this.renderer.loadPoster(loaded.poster, loaded.metadata)
			this.syncPlaybackAttachment({ rerender: false })
			this.isLoadingState = false
			this.isErrorState = false
			this.schedulePreviewRefresh()
		} catch (error) {
			if (loadToken !== this.previewLoadToken || this.getVideoSrc() !== path) {
				return
			}
			this.isLoadingState = false
			this.isErrorState = true
			this.schedulePreviewRefresh()
		} finally {
			if (this.previewLoadInFlightPath === path) {
				this.previewLoadInFlightPath = undefined
			}
		}
	}

	public requestPreviewLoad(options?: VideoResourceLoadOptions & { force?: boolean }): void {
		const path = this.getVideoSrc()
		if (!path || this.isDestroyed) return
		if (!options?.force) {
			if (
				this.renderer.hasPreview() &&
				!this.canvas.videoResourceManager.needsResourceReload(path)
			) {
				return
			}
			if (this.previewLoadInFlightPath && this.previewLoadInFlightPath === path) return
		}
		void this.loadPreviewFromPath(path, options)
	}

	private handlePollingIssue(): void {
		this.isErrorState = true
		this.rerenderWhenTransformIdle()
	}

	private schedulePreviewRefresh(): void {
		if (this.isDestroyed) {
			return
		}

		VideoElement.pendingPreviewRefreshes.add(this)
		if (VideoElement.previewRefreshRafId !== null) {
			return
		}

		VideoElement.previewRefreshRafId = requestAnimationFrame(() => {
			const pendingElements = Array.from(VideoElement.pendingPreviewRefreshes)
			VideoElement.pendingPreviewRefreshes.clear()
			VideoElement.previewRefreshRafId = null
			pendingElements.forEach((element) => {
				element.flushScheduledPreviewRefresh()
			})
		})
	}

	private flushScheduledPreviewRefresh(): void {
		if (this.isDestroyed || !this.node) {
			return
		}

		this.rerenderWhenTransformIdle()
	}

	private cancelScheduledPreviewRefresh(): void {
		VideoElement.pendingPreviewRefreshes.delete(this)
		if (
			VideoElement.pendingPreviewRefreshes.size === 0 &&
			VideoElement.previewRefreshRafId !== null
		) {
			cancelAnimationFrame(VideoElement.previewRefreshRafId)
			VideoElement.previewRefreshRafId = null
		}
	}

	private releasePlaybackConsumers(): void {
		this.canvas.videoPlaybackManager.release(this.getInlinePlaybackConsumerId())
		this.canvas.videoPlaybackManager.release(this.getFullscreenPlaybackConsumerId())
	}

	private setupVideoResourceRefreshedListener(): void {
		this.videoResourceRefreshedHandler = ({ data }) => {
			const currentPath = this.getVideoSrc()
			if (!currentPath) return
			if (!areCanvasHostResourceReferencesSame(this.canvas, data.path, currentPath)) {
				return
			}

			this.inlinePlaybackRequestToken += 1
			this.inlinePlaybackPromise = undefined
			this.isInlinePlaybackPending = false
			this.isInlinePlaybackRefreshing = false
			this.releasePlaybackConsumers()
			this.renderer.detachPlayback()
			this.renderer.loadPoster(data.resource.poster, data.resource.metadata)
			this.isLoadingState = false
			this.isErrorState = false
			this.rerenderWhenTransformIdle()
		}
		this.canvas.eventEmitter.on("resource:video:refreshed", this.videoResourceRefreshedHandler)
	}

	private removeVideoResourceRefreshedListener(): void {
		if (!this.videoResourceRefreshedHandler) return

		this.canvas.eventEmitter.off("resource:video:refreshed", this.videoResourceRefreshedHandler)
		this.videoResourceRefreshedHandler = undefined
	}

	private setupVideoResourceLoadFailedListener(): void {
		this.videoResourceLoadFailedHandler = ({ data }) => {
			const currentPath = this.getVideoSrc()
			if (!currentPath) return
			if (!areCanvasHostResourceReferencesSame(this.canvas, data.path, currentPath)) {
				return
			}

			this.inlinePlaybackRequestToken += 1
			this.inlinePlaybackPromise = undefined
			this.isInlinePlaybackPending = false
			this.isInlinePlaybackRefreshing = false
			this.releasePlaybackConsumers()
			this.renderer.detachPlayback()
			if (data.preservePreview && this.renderer.hasPreview()) {
				this.isLoadingState = false
				this.isErrorState = false
				this.schedulePreviewRefresh()
				return
			}

			this.renderer.resetPreview()
			this.isLoadingState = false
			this.isErrorState = true
			this.schedulePreviewRefresh()
		}
		this.canvas.eventEmitter.on(
			"resource:video:load-failed",
			this.videoResourceLoadFailedHandler,
		)
	}

	private removeVideoResourceLoadFailedListener(): void {
		if (!this.videoResourceLoadFailedHandler) return

		this.canvas.eventEmitter.off(
			"resource:video:load-failed",
			this.videoResourceLoadFailedHandler,
		)
		this.videoResourceLoadFailedHandler = undefined
	}

	private getInlinePlaybackConsumerId(): string {
		return buildInlineVideoPlaybackConsumerId(this.data.id)
	}

	private getFullscreenPlaybackConsumerId(): string {
		return buildFullscreenVideoPlaybackConsumerId(this.data.id)
	}

	/** 将当前内联会话的 video 绑定到 Konva 渲染器（或解绑） */
	public syncPlaybackAttachment(options?: { rerender?: boolean }): void {
		const inlineVideo = this.canvas.videoPlaybackManager.getVideoElement(
			this.getInlinePlaybackConsumerId(),
		)
		if (inlineVideo) {
			this.isInlinePlaybackPending = false
			this.syncInlinePlaybackStateSubscription()
			this.renderer.attachPlayback(inlineVideo)
		} else {
			this.clearInlinePlaybackStateSubscription()
			this.isInlinePlaybackRefreshing = false
			this.renderer.detachPlayback()
		}

		if (options?.rerender !== false) {
			this.rerenderWhenTransformIdle()
		}
	}

	private async ensureInlinePlayback(autoPlay: boolean): Promise<boolean> {
		const path = this.getVideoSrc()
		if (!path) {
			return false
		}

		const consumerId = this.getInlinePlaybackConsumerId()
		if (autoPlay) {
			this.canvas.mediaPlaybackCoordinator.preparePlayback(this.data.id)
		}

		if (this.renderer.hasAttachedPlayback()) {
			if (autoPlay) {
				const session = await this.canvas.videoPlaybackManager.acquire(path, consumerId, {
					autoPlay: true,
				})
				if (!session) {
					this.isErrorState = true
					this.rerenderWhenTransformIdle()
					return false
				}
				this.syncPlaybackAttachment({ rerender: false })
			}
			return true
		}

		if (this.inlinePlaybackPromise) {
			return this.inlinePlaybackPromise
		}

		const requestToken = ++this.inlinePlaybackRequestToken
		this.isErrorState = false
		this.isInlinePlaybackPending = true
		this.rerenderWhenTransformIdle()

		const playbackPromise = (async () => {
			try {
				const session = await this.canvas.videoPlaybackManager.acquire(path, consumerId, {
					autoPlay,
				})
				if (
					requestToken !== this.inlinePlaybackRequestToken ||
					this.getVideoSrc() !== path
				) {
					if (session) {
						this.canvas.videoPlaybackManager.release(consumerId)
					}
					return false
				}

				this.isInlinePlaybackPending = false
				if (!session) {
					this.isErrorState = true
					this.rerenderWhenTransformIdle()
					return false
				}

				this.renderer.attachPlayback(session.video)
				this.isErrorState = false
				this.rerenderWhenTransformIdle()
				return true
			} catch {
				if (
					requestToken !== this.inlinePlaybackRequestToken ||
					this.getVideoSrc() !== path
				) {
					return false
				}
				this.isInlinePlaybackPending = false
				this.isErrorState = true
				this.rerenderWhenTransformIdle()
				return false
			}
		})()

		const trackedPromise = playbackPromise.finally(() => {
			if (this.inlinePlaybackPromise === trackedPromise) {
				this.inlinePlaybackPromise = undefined
			}
		})
		this.inlinePlaybackPromise = trackedPromise
		return trackedPromise
	}

	/** 内联 consumer 将会话移交给全屏 consumer，用于进入全屏层 */
	public handoffPlaybackToFullscreen(): HTMLVideoElement | null {
		this.canvas.mediaPlaybackCoordinator.preparePlayback(this.data.id)
		const session = this.canvas.videoPlaybackManager.handoff(
			this.getInlinePlaybackConsumerId(),
			this.getFullscreenPlaybackConsumerId(),
		)
		this.syncPlaybackAttachment()
		return session?.video ?? null
	}

	/** 全屏关闭时收回会话到内联预览 */
	public handoffPlaybackFromFullscreen(): HTMLVideoElement | null {
		const session = this.canvas.videoPlaybackManager.handoff(
			this.getFullscreenPlaybackConsumerId(),
			this.getInlinePlaybackConsumerId(),
		)
		this.syncPlaybackAttachment()
		return session?.video ?? null
	}

	/** 为全屏层申请独立 consumer 的 video（自动播放），不经过内联 handoff 时使用 */
	public async acquireFullscreenPlayback(): Promise<HTMLVideoElement | null> {
		const path = this.getVideoSrc()
		if (!path) {
			return null
		}

		this.canvas.mediaPlaybackCoordinator.preparePlayback(this.data.id)
		const session = await this.canvas.videoPlaybackManager.acquire(
			path,
			this.getFullscreenPlaybackConsumerId(),
			{ autoPlay: true },
		)
		if (!session) {
			return null
		}

		this.syncPlaybackAttachment()
		return session.video
	}

	/** 释放全屏 consumer 并刷新内联绑定 */
	public releaseFullscreenPlayback(): void {
		this.canvas.videoPlaybackManager.release(this.getFullscreenPlaybackConsumerId())
		this.syncPlaybackAttachment()
	}

	private isVideoGenerationPending(): boolean {
		if (this.isGenerating) return true

		const hasActiveGenerationTask = this.hasActiveVideoGenerationTask()
		const hasSrc = !!this.getVideoSrc()
		const status = this.getVideoStatus()

		if (hasActiveGenerationTask && !hasSrc) return true
		if (
			hasSrc &&
			(status === GenerationStatus.Pending || status === GenerationStatus.Processing)
		) {
			return true
		}
		if (hasSrc && !this.renderer.hasPreview()) {
			return true
		}

		return false
	}

	render(): Konva.Group | null {
		if (!this.data.width || !this.data.height) {
			throw new Error("Video element must have width and height")
		}

		const width = this.data.width
		const height = this.data.height
		const group = this.createRenderGroup(width, height)
		const renderState = this.resolveRenderState()

		switch (renderState.stage) {
			case "ready":
				this.renderPreview(group, width, height)
				break
			case "loading":
			case "generating":
			case "uploading":
			case "empty":
			case "error":
				this.renderPlaceholder(group, width, height, {
					mode: renderState.placeholderMode ?? "empty",
					text: renderState.text ?? "",
					stage: renderState.stage,
				})
				break
			default:
				this.renderPlaceholder(group, width, height, {
					mode: "empty",
					text: this.getText("video.empty", "请发送生成视频的指令"),
					stage: "empty",
				})
		}

		this.finalizeNode(group)
		return group
	}

	override onMounted(): void {
		super.onMounted()
		if (!(this.node instanceof Konva.Group) || !this.data.width || !this.data.height) {
			return
		}

		this.syncRenderLayout(this.data.width, this.data.height)
		const src = this.getVideoSrc()
		if (src) {
			this.canvas.visibilityManager.registerVideoElement(this.data.id, src)
		}
	}

	update(newData: VideoElementData): boolean {
		const currentActiveContentId = this.data.activeContentId
		const previousContent = this.getVideoContent()
		const nextContent = getActiveContent<VideoElementContent>(newData)
		const srcChanged = previousContent?.src !== nextContent?.src
		const newStatus = nextContent?.status
		const generationSettled =
			!!nextContent?.src ||
			newStatus === GenerationStatus.Completed ||
			newStatus === GenerationStatus.Failed
		const contentControlsChanged =
			this.data.contents.length !== newData.contents.length ||
			this.data.mainContentId !== newData.mainContentId
		const needsRerender =
			contentControlsChanged ||
			currentActiveContentId !== newData.activeContentId ||
			previousContent?.generateVideoRequest?.video_id !==
				nextContent?.generateVideoRequest?.video_id ||
			previousContent?.src !== nextContent?.src ||
			previousContent?.status !== nextContent?.status ||
			previousContent?.errorMessage !== nextContent?.errorMessage

		this.data = newData

		if (generationSettled) {
			this.isGenerating = false
		}

		if (srcChanged) {
			this.cancelScheduledPreviewRefresh()
			this.previewLoadToken += 1
			this.previewLoadInFlightPath = undefined
			this.inlinePlaybackRequestToken += 1
			this.inlinePlaybackPromise = undefined
			this.isLoadingState = false
			this.isInlinePlaybackPending = false
			this.isErrorState = false
			this.releasePlaybackConsumers()
			this.renderer.resetPreview()
			if (nextContent?.src) {
				this.canvas.visibilityManager.updateVideoElement(this.data.id, nextContent.src)
			} else {
				this.canvas.visibilityManager.unregisterVideoElement(this.data.id)
			}
		}

		if (needsRerender) {
			return true
		}

		if (this.node instanceof Konva.Group) {
			this.updateBaseProps(this.node, newData)
			if (newData.width !== undefined && newData.height !== undefined) {
				this.syncRenderLayout(newData.width, newData.height)
			}
		}

		return false
	}

	private renderPreview(group: Konva.Group, width: number, height: number): void {
		this.isLoadingState = false
		this.isErrorState = false

		const playerGroup = this.renderer.createPlayerNode(width, height, this.canvas, {
			showLoadingOverlay: this.isInlinePlaybackPending || this.isInlinePlaybackRefreshing,
			onPlayButtonClick: () => {
				this.canvas.videoPlaybackInteractionManager.toggleElementPlayback(
					this.data.id,
					"button",
				)
			},
			onContentDoubleClick: () => {
				this.canvas.videoPlaybackInteractionManager.toggleElementPlayback(
					this.data.id,
					"doubleClick",
				)
			},
		})
		if (playerGroup) {
			group.add(playerGroup)
		}

		this.createBorder(group, width, height, false)
		this.createCornerActions(group, width, height, { fullscreen: true })
		this.setupContentUpdateListener(group)
	}

	private renderPlaceholder(
		group: Konva.Group,
		width: number,
		height: number,
		options: {
			mode: "empty" | "loading" | "error"
			text: string
			stage: VideoRenderStage
		},
	): void {
		const isGeneratingStage = options.stage === "generating" || options.stage === "uploading"
		const status = this.getVideoStatus()
		const request = this.getVideoRequest()
		const shouldShowRetryButton =
			options.mode === "error" &&
			status === GenerationStatus.Failed &&
			!!request &&
			!this.isVideoResourceErrorText(options.text) &&
			!this.isRetryEditing
		this.isLoadingState = options.stage === "loading"
		this.isErrorState = options.mode === "error"

		this.renderer.createPlaceholderNode(group, width, height, {
			...options,
			showRetryButton: shouldShowRetryButton,
			onRetry: shouldShowRetryButton
				? () => {
						if (this.canvas.mediaReplaceController?.isReplacing?.(this.data.id)) return
						this.isRetryEditing = true
						this.canvas.selectionManager.select(this.data.id, false, false)
						this.rerender()
						this.canvas.eventEmitter.emit({
							type: "element:video:retryClick",
							data: { elementId: this.data.id },
						})
					}
				: undefined,
			canvas: this.canvas,
			onBackgroundReady: (backgroundNode) => {
				// loading 占位使用专用底图，选中时不替换为 image-background-selected
				if (options.mode === "loading") {
					this.createBorder(
						group,
						width,
						height,
						isGeneratingStage || this.isLoadingState,
					)
				} else {
					this.createBorder(
						group,
						width,
						height,
						isGeneratingStage || this.isLoadingState,
						backgroundNode,
					)
				}

				this.createCornerActions(group, width, height)
			},
		})
		this.setupContentUpdateListener(group)
	}

	private createBorder(
		group: Konva.Group,
		width: number,
		height: number,
		isAnimated: boolean,
		backgroundNode?: Konva.Image,
	): void {
		this.borderDecorator = new BorderDecorator(group, width, height, {
			isAnimated,
			elementId: this.data.id,
			canvas: this.canvas,
		})
		this.borderDecorator.create(backgroundNode)
	}

	private setupRetryEditingListeners(): void {
		this.selectionChangeHandler = ({ data }) => {
			if (!this.isRetryEditing) return
			if (!data.elementIds.includes(this.data.id)) {
				this.isRetryEditing = false
				this.rerender()
			}
		}
		this.deselectHandler = ({ data }) => {
			if (!this.isRetryEditing) return
			if (!data?.elementIds || data.elementIds.includes(this.data.id)) {
				this.isRetryEditing = false
				this.rerender()
			}
		}
		this.canvas.eventEmitter.on("element:select", this.selectionChangeHandler)
		this.canvas.eventEmitter.on("element:deselect", this.deselectHandler)
	}

	private removeRetryEditingListeners(): void {
		if (this.selectionChangeHandler) {
			this.canvas.eventEmitter.off("element:select", this.selectionChangeHandler)
			this.selectionChangeHandler = undefined
		}
		if (this.deselectHandler) {
			this.canvas.eventEmitter.off("element:deselect", this.deselectHandler)
			this.deselectHandler = undefined
		}
	}

	private createCornerActions(
		group: Konva.Group,
		width: number,
		height: number,
		options?: { fullscreen?: boolean },
	): void {
		const actions: ElementCornerActionConfig[] = []
		if (this.shouldShowInfoButton()) {
			actions.push({
				key: "info",
				placement: "top-right",
				icon: "info",
				onClick: () => {
					this.canvas.eventEmitter.emit({
						type: "element:video:infoButtonClick",
						data: { elementId: this.data.id },
					})
				},
			})
		}
		if (options?.fullscreen && this.shouldShowFullscreenButton()) {
			actions.push({
				key: "fullscreen",
				placement: "bottom-right",
				icon: "fullscreen",
				onClick: () => {
					this.canvas.eventEmitter.emit({
						type: "element:video:fullscreenClick",
						data: { elementId: this.data.id },
					})
				},
			})
		}
		if (!actions.length) return

		this.cornerActionsDecorator = new ElementCornerActionsDecorator(group, {
			elementId: this.data.id,
			canvas: this.canvas,
			width,
			height,
			actions,
		})
		this.cornerActionsDecorator.create()
	}

	private createRenderGroup(width: number, height: number): Konva.Group {
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (ctx) => {
				ctx.rect(0, 0, width, height)
			},
		})

		RenderUtils.createHitNode(group, width, height, {
			cornerRadius: VIDEO_CONFIG.CORNER_RADIUS,
		})
		return group
	}

	private getVideoLoadErrorText(): string {
		const src = this.getVideoSrc()
		const failureReason = src ? this.canvas.videoResourceManager.getFailureReason(src) : null

		if (failureReason === "not-found") {
			return this.getText("video.fileMissing", "视频文件不存在")
		}

		return this.getText("video.loadError", "视频加载失败")
	}

	private isVideoResourceErrorText(text: string): boolean {
		return (
			text === this.getText("video.loadError", "视频加载失败") ||
			text === this.getText("video.fileMissing", "视频文件不存在")
		)
	}

	private resolveRenderState(): VideoRenderState {
		const replacementState = this.canvas.mediaReplaceController?.getReplacementState?.(
			this.data.id,
		)
		if (
			replacementState?.source === "local-upload" &&
			replacementState.phase === "uploading" &&
			replacementState.contentId === this.getVideoContent()?.contentId
		) {
			return {
				stage: "uploading",
				placeholderMode: "loading",
				text: this.getText("video.uploading", "正在上传中..."),
			}
		}

		const src = this.getVideoSrc()
		const hasSrc = !!src
		const status = this.getVideoStatus()

		if (hasSrc || status === GenerationStatus.Completed) {
			if (this.isErrorState) {
				return {
					stage: "error",
					placeholderMode: "error",
					text: this.getVideoErrorMessage() || this.getVideoLoadErrorText(),
				}
			}

			if (this.renderer.hasPreview()) {
				return { stage: "ready" }
			}

			return {
				stage: "loading",
				placeholderMode: "loading",
				text: this.getText("video.loading", "正在加载中..."),
			}
		}

		if (status === GenerationStatus.Failed) {
			return {
				stage: "error",
				placeholderMode: "error",
				text: this.isRetryEditing
					? this.getText("video.retryEditing", "请重新编辑视频生成需求")
					: resolveGenerationErrorMessage(
							this.getVideoErrorMessage(),
							this.getText("video.generateFailed", "视频生成失败"),
						),
			}
		}

		if (
			status === GenerationStatus.Pending ||
			status === GenerationStatus.Processing ||
			this.isVideoGenerationPending()
		) {
			if (this.canvas.videoCompositionManager?.isComposingResult?.(this.data.id)) {
				return {
					stage: "generating",
					placeholderMode: "loading",
					text: this.getText("video.merging", "正在合并中..."),
				}
			}
			const isGenerating = this.isActiveGenerationPlaceholder()

			return {
				stage: isGenerating ? "generating" : "uploading",
				placeholderMode: "loading",
				text: isGenerating
					? this.getText("video.generating", "正在生成中...")
					: this.getText("video.uploading", "正在上传中..."),
			}
		}

		return {
			stage: "empty",
			placeholderMode: "empty",
			text: this.getText("video.empty", "请发送生成视频的指令"),
		}
	}

	private hasActiveVideoGenerationTask(): boolean {
		return !!this.getActiveGenerateVideoRequest()?.video_id
	}

	private isActiveGenerationPlaceholder(): boolean {
		if (this.hasActiveVideoGenerationTask() || this.isGenerating) {
			return true
		}

		return (
			this.getVideoStatus() === GenerationStatus.Processing &&
			!this.canvas.elementManager.isTemporary(this.data.id)
		)
	}

	private syncInlinePlaybackStateSubscription(): void {
		this.clearInlinePlaybackStateSubscription()
		const consumerId = this.getInlinePlaybackConsumerId()
		const applyState = (state: VideoPlaybackConsumerState) => {
			if (this.isDestroyed || this.isInlinePlaybackRefreshing === state.isRefreshing) {
				return
			}
			this.isInlinePlaybackRefreshing = state.isRefreshing
			this.schedulePreviewRefresh()
		}

		this.inlinePlaybackStateUnsubscribe =
			this.canvas.videoPlaybackManager.subscribeConsumerState(consumerId, applyState)
	}

	private clearInlinePlaybackStateSubscription(): void {
		this.inlinePlaybackStateUnsubscribe?.()
		this.inlinePlaybackStateUnsubscribe = undefined
	}

	private shouldShowInfoButton(): boolean {
		return !!this.getActiveGenerateVideoRequest()
	}

	/** 返回当前用于运行时展示的请求；未确认请求不会进入 DSL。 */
	public getActiveGenerateVideoRequest(): GenerateVideoRequest | undefined {
		return (
			this.canvas?.generationRuntimeManager?.getTargetState(this.data.id)
				?.generateVideoRequest || this.getVideoRequest()
		)
	}

	private shouldShowFullscreenButton(): boolean {
		return !!this.getVideoSrc()
	}

	private setupContentUpdateListener(group: Konva.Group): void {
		if (this.contentUpdateHandler) {
			return
		}

		this.contentUpdateHandler = () => {
			const width = this.data.width || 0
			const height = this.data.height || 0
			this.renderer.updatePlaceholderContentLayout(group, width, height)
			this.renderer.updatePlayerLayout(group, width, height)
			group.getLayer()?.batchDraw()
		}

		this.canvas.eventEmitter.on("viewport:scale", this.contentUpdateHandler)
		group.on("transform", this.contentUpdateHandler)
	}

	private removeContentUpdateListener(): void {
		if (this.contentUpdateHandler) {
			this.canvas.eventEmitter.off("viewport:scale", this.contentUpdateHandler)
		}

		if (this.node instanceof Konva.Group && this.contentUpdateHandler) {
			this.node.off("transform", this.contentUpdateHandler)
		}

		this.contentUpdateHandler = undefined
	}

	private syncRenderLayout(width: number, height: number): void {
		if (!(this.node instanceof Konva.Group)) {
			return
		}

		this.node.children?.forEach((child) => {
			if (child instanceof Konva.Rect && child.name() === "hit-area") {
				child.width(width)
				child.height(height)
				child.cornerRadius(VIDEO_CONFIG.CORNER_RADIUS)
			}

			if (child instanceof Konva.Image) {
				if (child.name() === "background") {
					RenderUtils.updateBackgroundImageLayout(child, width, height)
				} else if (!child.name()) {
					child.width(width)
					child.height(height)
				}
			}
		})

		this.node.clipFunc((ctx) => {
			ctx.rect(0, 0, width, height)
		})

		this.renderer.updatePlaceholderContentLayout(this.node, width, height)
		this.renderer.updatePlayerLayout(this.node, width, height)
		this.borderDecorator?.updateSize(width, height)
		this.cornerActionsDecorator?.updateConfig({ width, height })
		this.node.getLayer()?.batchDraw()
	}

	public override onTransformResize(width: number, height: number): void {
		this.syncRenderLayout(width, height)
	}

	/** 新建元素时的默认宽高（可被工具传入的预览尺寸覆盖） */
	static getDefaultConfig(width?: number, height?: number) {
		return {
			width: width ?? VIDEO_CONFIG.DEFAULT_WIDTH,
			height: height ?? VIDEO_CONFIG.DEFAULT_HEIGHT,
		}
	}

	/** 从宿主 storage 读取未发送的草稿请求 */
	static getTempConfigFromStorage(
		canvas: BaseElement["canvas"],
		elementId: string,
	): Partial<GenerateVideoRequest> | undefined {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage) return undefined
		const storage = methods.getStorage()
		return storage?.tempVideoConfigs?.[elementId]
	}

	/** 持久化草稿请求（提示词、模型、参考图等） */
	static saveTempConfigToStorage(
		canvas: BaseElement["canvas"],
		elementId: string,
		config: Partial<GenerateVideoRequest>,
	): void {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage || !methods?.saveStorage) return

		const storage = methods.getStorage() || {}
		const tempVideoConfigs = storage.tempVideoConfigs || {}
		tempVideoConfigs[elementId] = config

		methods.saveStorage({
			...storage,
			tempVideoConfigs,
		})
	}

	/** 删除该元素在 storage 中的草稿 */
	static clearTempConfigFromStorage(canvas: BaseElement["canvas"], elementId: string): void {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage || !methods?.saveStorage) return

		const storage = methods.getStorage()
		if (!storage?.tempVideoConfigs) return

		const tempVideoConfigs = { ...storage.tempVideoConfigs }
		delete tempVideoConfigs[elementId]

		methods.saveStorage({
			...storage,
			tempVideoConfigs,
		})
	}

	static getModeInputDraftsFromStorage(
		canvas: BaseElement["canvas"],
		elementId: string,
	): StoredVideoModeDraftsMap | undefined {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage) return undefined
		const storage = methods.getStorage()
		return storage?.tempVideoModeDrafts?.[elementId]
	}

	static saveModeInputDraftsToStorage(
		canvas: BaseElement["canvas"],
		elementId: string,
		drafts: StoredVideoModeDraftsMap,
	): void {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage || !methods?.saveStorage) return

		const storage = methods.getStorage() || {}
		const tempVideoModeDrafts = { ...(storage.tempVideoModeDrafts || {}) }
		const hasAnyDraft = Object.keys(drafts).length > 0
		if (hasAnyDraft) {
			tempVideoModeDrafts[elementId] = drafts
		} else {
			delete tempVideoModeDrafts[elementId]
		}

		methods.saveStorage({
			...storage,
			tempVideoModeDrafts,
		})
	}

	static clearModeInputDraftsFromStorage(canvas: BaseElement["canvas"], elementId: string): void {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage || !methods?.saveStorage) return

		const storage = methods.getStorage()
		if (!storage?.tempVideoModeDrafts) return

		const tempVideoModeDrafts = { ...storage.tempVideoModeDrafts }
		delete tempVideoModeDrafts[elementId]

		methods.saveStorage({
			...storage,
			tempVideoModeDrafts,
		})
	}

	public getRenderName(): string {
		return this.getText("video.defaultName", "视频生成器")
	}

	private getVideoContent(): VideoElementContent | undefined {
		return this.getActiveContent<VideoElementContent>()
	}

	private hasPendingVideoGeneration(): boolean {
		return (
			this.isGenerating ||
			Boolean(this.canvas.generationRuntimeManager.getTargetState(this.data.id)) ||
			hasPendingVideoGenerationContent(this.data)
		)
	}

	private getVideoSrc(): string | undefined {
		return this.getVideoContent()?.src
	}

	private getVideoStatus(): VideoElementContent["status"] {
		return this.getVideoContent()?.status
	}

	private getVideoErrorMessage(): string | undefined {
		return this.getVideoContent()?.errorMessage
	}

	private getVideoRequest(): GenerateVideoRequest | undefined {
		return this.getVideoContent()?.generateVideoRequest
	}

	/** 内联预览播放（必要时先 acquire 会话） */
	public playPreview(): void {
		if (this.isInlinePlaybackPending) {
			return
		}

		if (this.renderer.hasAttachedPlayback()) {
			this.canvas.mediaPlaybackCoordinator.preparePlayback(this.data.id)
			this.renderer.play()
			return
		}

		void this.ensureInlinePlayback(true)
	}

	/** 暂停当前内联预览 */
	public pausePreview(): void {
		if (!this.renderer.hasAttachedPlayback()) {
			return
		}

		this.renderer.pause()
	}

	/** 替换开始时暂停内联与全屏 consumer，但不销毁现有资源。 */
	public pauseForReplacement(): void {
		this.pausePreview()
		this.canvas.videoPlaybackManager
			.getVideoElement(this.getInlinePlaybackConsumerId())
			?.pause()
		this.canvas.videoPlaybackManager
			.getVideoElement(this.getFullscreenPlaybackConsumerId())
			?.pause()
	}

	/** 播放/暂停切换（受 canTogglePlayback 约束） */
	public togglePreview(): void {
		if (!this.canTogglePlayback()) {
			return
		}

		if (this.renderer.hasAttachedPlayback()) {
			if (this.renderer.isPaused()) {
				this.canvas.mediaPlaybackCoordinator.preparePlayback(this.data.id)
			}
			this.renderer.toggle()
			return
		}

		void this.ensureInlinePlayback(true)
	}

	/** 已有成片且解码出预览后可交互播放 */
	public canTogglePlayback(): boolean {
		return !!this.getVideoSrc() && this.renderer.hasPreview() && !this.isInlinePlaybackPending
	}

	/** 更新内存与 storage 中的草稿请求 */
	public saveTempGenerateVideoRequest(request: Partial<GenerateVideoRequest>): void {
		this.tempGenerateVideoRequest = request
		VideoElement.saveTempConfigToStorage(this.canvas, this.data.id, request)
	}

	/** 当前草稿请求（未发送生成前） */
	public getTempGenerateVideoRequest(): Partial<GenerateVideoRequest> | undefined {
		return this.tempGenerateVideoRequest
	}

	/** 各互斥 input_mode 下的参考/首尾帧暂存（刷新或重挂载后恢复） */
	public getModeInputDrafts(): StoredVideoModeDraftsMap | undefined {
		return this.modeInputDrafts
	}

	public saveModeInputDrafts(drafts: StoredVideoModeDraftsMap): void {
		this.modeInputDrafts = Object.keys(drafts).length > 0 ? drafts : undefined
		VideoElement.saveModeInputDraftsToStorage(this.canvas, this.data.id, drafts)
	}

	/** 清除草稿（内存 + storage） */
	public clearTempGenerateVideoRequest(): void {
		this.tempGenerateVideoRequest = undefined
		this.modeInputDrafts = undefined
		VideoElement.clearTempConfigFromStorage(this.canvas, this.data.id)
		VideoElement.clearModeInputDraftsFromStorage(this.canvas, this.data.id)
	}

	/** 生成成功后去掉草稿中的 prompt，保留模型等字段 */
	public clearTempGenerateVideoRequestPrompt(): void {
		if (this.tempGenerateVideoRequest) {
			const { prompt, ...rest } = this.tempGenerateVideoRequest
			void prompt
			this.tempGenerateVideoRequest = rest
			VideoElement.saveTempConfigToStorage(this.canvas, this.data.id, rest)
		}
	}

	/** 追加一张参考图/帧（去重 path），并预热图片缓存 */
	public saveReferenceImageInfo(fileInfo: UploadFileResponse): void {
		this.referenceImageInfos = appendReferenceImageInfos(
			this.canvas,
			this.referenceImageInfos,
			[fileInfo],
		)
	}

	/** 批量追加参考图信息（去重） */
	public saveReferenceImageInfos(fileInfos: UploadFileResponse[]): void {
		this.referenceImageInfos = appendReferenceImageInfos(
			this.canvas,
			this.referenceImageInfos,
			fileInfos,
		)
	}

	/** 覆盖参考图列表并广播 referenceImages:changed */
	public setReferenceImageInfos(fileInfos: UploadFileResponse[]): void {
		this.referenceImageInfos = replaceReferenceImageInfos(this.canvas, fileInfos)
		this.canvas.eventEmitter.emit({
			type: "referenceImages:changed",
			data: { elementId: this.data.id },
		})
	}

	/** 当前已关联的参考图/帧上传结果副本 */
	public getReferenceImageInfos(): UploadFileResponse[] {
		return [...this.referenceImageInfos]
	}

	/** 按 path 移除一项并广播变更 */
	public removeReferenceImageInfo(path: string): void {
		this.referenceImageInfos = removeReferenceImageInfosByPath(
			this.canvas,
			this.referenceImageInfos,
			path,
		)
		this.canvas.eventEmitter.emit({
			type: "referenceImages:changed",
			data: { elementId: this.data.id },
		})
	}

	/** 清空参考图并广播变更 */
	public clearReferenceImageInfos(): void {
		this.referenceImageInfos = []
		this.canvas.eventEmitter.emit({
			type: "referenceImages:changed",
			data: { elementId: this.data.id },
		})
	}

	/**
	 * 与 Image 一致：Transformer 以元素 width/height 为准。
	 * 默认实现会合并所有子节点包围盒，播放器控件（播放钮、进度条等）会超出画幅，导致选框偏大。
	 */
	protected override setupCustomBoundingRect(node: Konva.Group): void {
		if (!(node instanceof Konva.Group)) {
			return
		}

		node.getClientRect = (config?: Parameters<Konva.Node["getClientRect"]>[0]) => {
			const hitRect = node.findOne(".hit-area") as Konva.Rect | undefined
			if (hitRect) {
				return hitRect.getClientRect(config)
			}

			const width = node.width()
			const height = node.height()
			const scaleX = node.scaleX()
			const scaleY = node.scaleY()
			const position = config?.relativeTo ? node.getPosition() : node.getAbsolutePosition()

			return {
				x: position.x,
				y: position.y,
				width: width * scaleX,
				height: height * scaleY,
			}
		}
	}

	/** 与 setupCustomBoundingRect 一致，避免吸附、聚焦等使用到偏大的 bounds */
	public override getBoundingRect(): Rect | null {
		if (!this.node) return null

		const layer = this.node.getLayer()
		if (!layer) return null

		let width = this.data.width || 0
		let height = this.data.height || 0

		if (this.node instanceof Konva.Group) {
			const hitRect = this.node.findOne(".hit-area") as Konva.Rect | undefined
			if (hitRect) {
				const clientRect = hitRect.getClientRect({
					relativeTo: layer,
				})

				return {
					x: clientRect.x,
					y: clientRect.y,
					width: clientRect.width,
					height: clientRect.height,
				}
			}

			const groupWidth = this.node.width()
			const groupHeight = this.node.height()
			const scaleX = this.node.scaleX()
			const scaleY = this.node.scaleY()

			if (groupWidth !== undefined && groupHeight !== undefined) {
				width = groupWidth * scaleX
				height = groupHeight * scaleY
			}
			const position = this.node.getAbsolutePosition(layer)

			return {
				x: position.x,
				y: position.y,
				width,
				height,
			}
		}

		const clientRect = this.node.getClientRect({
			relativeTo: layer,
		})

		return {
			x: clientRect.x,
			y: clientRect.y,
			width,
			height,
		}
	}

	public override getTransformBehavior(): TransformBehavior {
		return TransformBehavior.APPLY_TO_SIZE
	}

	public override applyTransform(
		updates: LayerElement,
		context: TransformContext,
	): Partial<LayerElement> {
		if ((context.isRealtime && context.isScaling) || !context.isRealtime) {
			const scaleX = updates.scaleX ?? 1
			const scaleY = updates.scaleY ?? 1

			if (scaleX !== 1 || scaleY !== 1) {
				const newSize = this.applyScaleToSize(updates, context)
				return {
					x: updates.x,
					y: updates.y,
					width: newSize.width,
					height: newSize.height,
					scaleX: 1,
					scaleY: 1,
				}
			}
		}

		return {
			x: updates.x,
			y: updates.y,
		}
	}

	public override async renderToCanvas(
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
		options?: { shouldDrawBorder?: boolean; width?: number; height?: number },
	): Promise<boolean> {
		const source = this.renderer.getPreviewSource()
		if (!source) return false

		const width = options?.width ?? (this.data.width || 0) * (this.data.scaleX ?? 1)
		const height = options?.height ?? (this.data.height || 0) * (this.data.scaleY ?? 1)
		if (width <= 0 || height <= 0) return false

		ctx.drawImage(source, offsetX, offsetY, width, height)
		return true
	}
}
