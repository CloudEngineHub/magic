import Konva from "konva"
import type { ImageElement as ImageElementData, LayerElement } from "../../document/types"
import { ElementTypeEnum } from "../../document/types"
import { BaseElement } from "../core/BaseElement"
import imageIcon from "../../../assets/image/image-icon.png"
import imageIconError from "../../../assets/image/image-icon-error.png"
import imageBackgroundUnselected from "../../../assets/image/image-background-unselected.jpg"
import imageBackgroundLoading from "../../../assets/image/image-background-loading.jpg"
import type {
	EraserRequest,
	GenerateExtendedImageRequest,
	GenerateImageRequest,
	GenerateHightImageRequest,
	ImageGenerationTaskMeta,
	RemoveBackgroundRequest,
	UploadFileResponse,
} from "../../../public/magic-types"
import { GenerationStatus, ImageGenerationTaskTypeMap } from "../../../public/magic-types"
import { generateUUID, collectElementsByType, type Rect } from "../../shared/ids"
import { toCanonicalCanvasResourcePath } from "../../shared/path/canvasResourcePath"
import type { ResourceLoadFailureReason } from "../../resources/media-common/resourceLoadFailure"
import { TransformBehavior } from "../../interaction/transform/TransformManager"
import type { Canvas } from "../../core/Canvas"
import type {
	GenerationAttemptTarget,
	GenerationOperation,
} from "../../generation/GenerationRuntimeManager"
import type {
	ImageSource,
	ImageInfo,
	LoadedResource,
	ImageResourceVariant,
	ImageResourceWillCloseHandler,
	ImageResourceLoadFailedHandler,
} from "../../resources/image/ImageResourceManager"
import { getPersistedSourceCrop } from "../../resources/image/imageCropUtils"
import { getImageSourceDimensions } from "../../resources/image/imageSourceUtils"
import { IMAGE_CONFIG, COLORS } from "./ImageElement.config"
import { ImageStaticLoader } from "../../resources/image/ImageStaticLoader"
import { RenderUtils } from "../../shared/render/RenderUtils"
import { BorderDecorator } from "../decorators/BorderDecorator"
import {
	ElementCornerActionsDecorator,
	type ElementCornerActionConfig,
} from "../decorators/ElementCornerActionsDecorator"
import { ImagePollingManager } from "../../resources/polling/ImagePollingManager"
import { DECORATOR_COLORS, DECORATOR_CONFIG } from "../decorators/DecoratorConfig"
import type { TransformContext } from "../core/BaseElement"
import {
	createExpandImageTaskMeta,
	createEraserTaskMeta,
	createHighImageTaskMeta,
	createRemoveBackgroundTaskMeta,
	getImageGenerationTaskMeta,
	isBatchImageGenerationTaskMeta,
} from "../../resources/image/imageGenerationTaskMeta"

const IMAGE_CONTENT_NODE_NAME = "image-content"

type ImageResourceStructureReason =
	"missing-image-node" | "cleared-image-node" | "error-to-image" | "resource-failed"

type ImageResourceMetadataReason = "non-fullsize-full" | "view-priority-blocked"

type ImageResourceReconcileResult =
	| { type: "patched-content" }
	| { type: "structure-required"; reason: ImageResourceStructureReason }
	| { type: "metadata-only"; reason: ImageResourceMetadataReason }

/**
 * 图片元素类
 */
export class ImageElement extends BaseElement<ImageElementData> {
	// 管理器和装饰器
	private imageLoader = new ImageStaticLoader()
	private pollingManager: ImagePollingManager
	private borderDecorator?: BorderDecorator
	private cornerActionsDecorator?: ElementCornerActionsDecorator

	// 生成相关
	private isGenerating: boolean = false

	// 渲染相关
	private isLoadingState: boolean = false // 加载中状态（图片已生成，等待 ossSrc）
	private isErrorState: boolean = false
	private contentGroup?: Konva.Group
	private contentUpdateHandler?: () => void

	// 缓存已加载的图片对象（ImageBitmap | HTMLImageElement，由 ImageResourceManager 统一管理）
	private loadedImage?: ImageSource
	private loadedImageVariant?: ImageResourceVariant
	private loadedImageSourceWidth?: number
	private loadedImageSourceHeight?: number
	/** 当前视口调度希望这个元素显示的资源等级；用于允许缩小时主动降级 */
	private targetDisplayResourceVariant?: ImageResourceVariant
	/** 从 resource:image:loaded 事件获取的 ossSrc */
	private storedOssSrc: string | null = null
	/** 从 resource:image:loaded 事件获取的 imageInfo */
	private storedImageInfo?: ImageInfo
	/** 已调用 loadResource 且尚未收到加载完成/失败事件 */
	private isResourceLoading = false

	// ossSrc 异步等待机制（生成/上传流程）
	private ossSrcPromise?: Promise<string>
	private ossSrcResolve?: (ossSrc: string) => void
	private ossSrcReject?: (reason?: Error) => void

	// 资源失败与 decoded surface 释放必须同步处理；成功资源由画布级呈现调度器提交。
	private resourceWillCloseHandler?: ImageResourceWillCloseHandler
	private resourceLoadFailedHandler?: ImageResourceLoadFailedHandler
	private resourceSubscriptionCleanups: Array<() => void> = []
	/** 最后一次加载失败原因（与 resource:image:load-failed 同步） */
	private imageLoadFailureReason: ResourceLoadFailureReason | null = null
	/** 最近一次已应用到视图的资源失败签名（用于去重，避免重复 rerender） */
	private lastAppliedLoadFailureSignature: string | null = null

	// 临时生成图片请求数据（用于弹窗关闭后恢复）
	private tempGenerateImageRequest?: Partial<GenerateImageRequest>
	// 参考图信息列表（保存上传的参考图完整信息）
	private referenceImageInfos: UploadFileResponse[] = []
	// 上传结果（由全局上传管理器设置）
	public uploadResult?: UploadFileResponse

	// 裁剪相关（仅监听 enter/exit 用于 rerender，绘制由 CropRenderer 负责）
	private cropEnterHandler?: (event: { data: { elementId: string } }) => void
	private cropExitHandler?: (event: { data: { elementId: string; restored: boolean } }) => void
	private selectionChangeHandler?: (event: { data: { elementIds: string[] } }) => void
	private deselectHandler?: (event: { data: { elementIds?: string[] } | undefined }) => void
	private isRetryEditing = false
	private generationRuntimeUnsubscribe?: () => void

	constructor(data: ImageElementData, canvas: Canvas) {
		super(data, canvas)

		// 设置裁剪事件监听
		this.setupCropEventListeners()
		this.setupRetryEditingListeners()
		this.generationRuntimeUnsubscribe = this.canvas.generationRuntimeManager.subscribeElement(
			this.data.id,
			() => {
				this.rerenderWhenTransformIdle()
			},
		)

		// 初始化轮询管理器（仅用于生成状态轮询）
		this.pollingManager = new ImagePollingManager({
			elementId: this.data.id,
			canvas: this.canvas,
			getElementData: () => this.data,
			onStatusUpdate: () => {
				this.isErrorState = true
				// reject ossSrc Promise（生成失败）
				if (this.ossSrcReject) {
					this.ossSrcReject(new Error("Image generation failed"))
					this.ossSrcResolve = undefined
					this.ossSrcReject = undefined
					this.ossSrcPromise = undefined
				}
				this.rerender()
			},
		})

		// 从 storage 恢复 tempGenerateImageRequest
		const tempConfig = ImageElement.getTempConfigFromStorage(this.canvas, this.data.id)

		// 如果有临时配置，恢复临时配置
		if (tempConfig) {
			this.tempGenerateImageRequest = tempConfig
		}
		// 如果没有临时配置，从 generateImageRequest 恢复临时配置
		else if (this.data.generateImageRequest && !this.tempGenerateImageRequest) {
			const { model_id, resolution, size, image_generation_config } =
				this.data.generateImageRequest || {}
			this.tempGenerateImageRequest = {
				...(model_id && { model_id }),
				...(resolution && { resolution }),
				...(size && { size }),
				...(image_generation_config && { image_generation_config }),
			}
		}

		// 有 src：先监听资源事件，实际加载交给 CanvasVisibilityManager 调度
		if (this.data.src) {
			this.setupResourceLoadedListener()
		}
		// 没有 src 但有 generateImageRequest：启动轮询检查生成结果
		else if (this.data.generateImageRequest?.image_id) {
			this.createOssSrcPromise()
			this.pollingManager.start()
		} else {
			const imageGenerationTaskMeta = this.getImageGenerationTaskMeta()
			if (
				imageGenerationTaskMeta?.image_id &&
				!isBatchImageGenerationTaskMeta(imageGenerationTaskMeta)
			) {
				this.createOssSrcPromise()
				this.pollingManager.start()
			}
		}
	}

	/**
	 * 重新渲染节点（重写以清理监听器）
	 */
	override rerender(): Konva.Node | null {
		// 在重新渲染前清理监听器和装饰器
		this.removeContentUpdateListener()
		this.borderDecorator?.destroy()
		this.borderDecorator = undefined
		this.cornerActionsDecorator?.destroy()
		this.cornerActionsDecorator = undefined

		// 调用父类的 rerender
		return super.rerender()
	}

	/**
	 * 销毁元素时清理资源
	 */
	override destroy(): void {
		this.canvas.visibilityManager.unregisterImageElement(this.data.id)
		this.removeResourceLoadedListener()
		this.removeCropEventListeners()
		this.removeRetryEditingListeners()
		this.generationRuntimeUnsubscribe?.()
		this.generationRuntimeUnsubscribe = undefined
		this.pollingManager.destroy()
		this.borderDecorator?.destroy()
		this.cornerActionsDecorator?.destroy()
		this.removeContentUpdateListener()
		// 清理缓存的图片对象
		this.clearLoadedImageReference()
		// 清理 ossSrc Promise
		this.ossSrcPromise = undefined
		this.ossSrcResolve = undefined
		this.ossSrcReject = undefined
		super.destroy()
	}

	private clearLoadedImageReference(): void {
		this.loadedImage = undefined
		this.loadedImageVariant = undefined
		this.loadedImageSourceWidth = undefined
		this.loadedImageSourceHeight = undefined
	}

	private applyResourceMetadata(resource: LoadedResource): void {
		this.storedOssSrc = resource.ossSrc
		this.storedImageInfo = resource.imageInfo
		this.isResourceLoading = false
	}

	private applyResourceToView(resource: LoadedResource): void {
		this.loadedImage = resource.image
		this.loadedImageVariant = resource.variant
		this.loadedImageSourceWidth = resource.sourceWidth
		this.loadedImageSourceHeight = resource.sourceHeight
		this.applyResourceMetadata(resource)
	}

	private getMountedImageContentNode(): Konva.Image | null {
		if (!(this.node instanceof Konva.Group)) return null

		const namedNode = this.node.findOne(`.${IMAGE_CONTENT_NODE_NAME}`)
		if (namedNode instanceof Konva.Image) {
			return namedNode
		}

		return (
			this.node.children?.find((child): child is Konva.Image => {
				if (!(child instanceof Konva.Image)) return false
				const name = child.name()
				return !name || name === IMAGE_CONTENT_NODE_NAME
			}) ?? null
		)
	}

	private patchMountedImageContentNodeWithLoadedResource(): ImageResourceReconcileResult {
		const imageNode = this.getMountedImageContentNode()
		if (!imageNode) {
			return { type: "structure-required", reason: "missing-image-node" }
		}

		if (!this.loadedImage) {
			imageNode.destroy()
			return { type: "structure-required", reason: "cleared-image-node" }
		}

		imageNode.image(this.loadedImage)
		imageNode.width(this.data.width ?? imageNode.width())
		imageNode.height(this.data.height ?? imageNode.height())
		imageNode.crop(
			this.canvas.cropManager.getCroppingElementId() === this.data.id
				? undefined
				: this.getSourceCrop(this.loadedImage),
		)
		return { type: "patched-content" }
	}

	private commitImageResourceReconcile(result: ImageResourceReconcileResult): void {
		if (result.type !== "structure-required") return
		this.rerenderWhenTransformIdle()
	}

	private requireImageResourceStructure(
		reason: ImageResourceStructureReason,
	): ImageResourceReconcileResult {
		return { type: "structure-required", reason }
	}

	private getVariantViewRank(variant: ImageResourceVariant | undefined): number {
		if (variant === "full") return 2
		if (variant === "preview") return 1
		if (variant === "low") return 0
		return 0
	}

	private shouldApplyResourceToView(resource: LoadedResource): boolean {
		if (!this.loadedImage) return true
		if (this.loadedImageVariant === "full" && resource.variant !== "full") return false
		const targetVariant = this.targetDisplayResourceVariant
		if (targetVariant) {
			const resourceRank = this.getVariantViewRank(resource.variant)
			const targetRank = this.getVariantViewRank(targetVariant)
			if (resource.variant === targetVariant) return true
			if (resourceRank > targetRank) return false
		}
		return (
			this.getVariantViewRank(resource.variant) >=
			this.getVariantViewRank(this.loadedImageVariant)
		)
	}

	public getDisplayResourceVariant(): ImageResourceVariant | undefined {
		return this.loadedImageVariant
	}

	private getDisplayTargetFallbackVariants(
		targetVariant: ImageResourceVariant,
	): ImageResourceVariant[] {
		if (targetVariant === "low") return ["low", "preview"]
		if (targetVariant === "preview") return ["preview", "low"]
		return ["preview", "low"]
	}

	private peekExactResourceVariant(variant: ImageResourceVariant): LoadedResource | null {
		const src = this.data.src
		if (!src) return null
		const resource = this.canvas.imageResourceManager.peekResource(src, { variant })
		return resource?.variant === variant ? resource : null
	}

	override onMounted(): void {
		super.onMounted()
		if (this.data.src) {
			this.canvas.visibilityManager.registerImageElement(this.data.id, this.data.src)
		}
	}

	/**
	 * 发起图片生成请求
	 * @param request 请求参数
	 * @returns 请求是否成功发起
	 */
	async generateImage(request: GenerateImageRequest): Promise<boolean> {
		if (!this.canvas.magicConfigManager.config?.methods?.generateImage) {
			return false
		}

		if (this.isGenerating) {
			return false
		}

		// 检查必要参数
		if (!request.model_id || !request.prompt) {
			return false
		}

		// 生成新的 image_id 并添加到请求中
		const requestWithId: GenerateImageRequest = {
			...request,
			image_id: generateUUID(),
		}
		this.isGenerating = true
		this.isErrorState = false
		this.isRetryEditing = false
		const attemptId = this.beginOrReuseGenerationAttempt("image-generate", {
			elementId: this.data.id,
			generateImageRequest: requestWithId,
		})
		this.rerender()
		this.canvas.eventEmitter.emit({
			type: "element:image:generate-submit-started",
			data: { elementId: this.data.id },
		})

		try {
			// 发起图片生成请求
			await this.canvas.magicConfigManager.config?.methods?.generateImage(requestWithId)

			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}

			// 请求成功，确认元素仍存在并原子写入正式任务状态。
			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					persistedPatch: {
						generateImageRequest: requestWithId,
						status: undefined,
						errorMessage: undefined,
					},
				},
			])
			if (!confirmed) return false

			// 重置错误状态标记
			this.isErrorState = false

			// 检查画布中的所有 Image 元素并设置名称
			this.updateImageElementNames()

			// 创建 ossSrc Promise
			this.createOssSrcPromise()

			// 启动轮询检查结果
			this.pollingManager.start()

			// 清除临时生成图片请求数据中的 prompt（保留其他配置，以便二次编辑时复用）
			this.clearTempGenerateImageRequestPrompt()

			// 触发重新渲染以清除错误状态显示
			this.rerender()

			return true
		} catch (error) {
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}
			this.isGenerating = false
			this.canvas.eventEmitter.emit({
				type: "element:image:generate-submit-failed",
				data: { elementId: this.data.id },
			})
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	/**
	 * 发起高清图片生成请求
	 * @param request 请求参数
	 * @returns 请求是否成功发起
	 */
	async generateHightImage(request: GenerateHightImageRequest): Promise<boolean> {
		if (!this.canvas.magicConfigManager.config?.methods?.generateHightImage) {
			return false
		}

		if (this.isGenerating) {
			return false
		}

		// 检查必要参数
		if (!request.file_path || !request.size) {
			return false
		}

		// 生成新的 image_id 并添加到请求中
		const requestWithId: GenerateHightImageRequest = {
			...request,
			image_id: request.image_id || generateUUID(),
		}

		this.isGenerating = true
		const attemptId = this.beginOrReuseGenerationAttempt("image-high", {
			elementId: this.data.id,
			imageGenerationTaskMeta: createHighImageTaskMeta(requestWithId),
		})

		try {
			// 发起高清图片生成请求
			await this.canvas.magicConfigManager.config?.methods?.generateHightImage(requestWithId)
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}

			// 请求成功，保存请求参数到元素，并清除错误状态
			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					persistedPatch: {
						imageGenerationTaskMeta: createHighImageTaskMeta(requestWithId),
						status: undefined,
						errorMessage: undefined,
					},
				},
			])
			if (!confirmed) return false

			// 重置错误状态标记
			this.isErrorState = false

			// 创建 ossSrc Promise
			this.createOssSrcPromise()

			// 启动轮询检查结果
			this.pollingManager.start()

			// 触发重新渲染以清除错误状态显示
			this.rerender()

			return true
		} catch (error) {
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}
			this.isGenerating = false
			this.canvas.eventEmitter.emit({
				type: "element:image:generate-submit-failed",
				data: { elementId: this.data.id },
			})
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	/**
	 * 发起去背景请求
	 * @param request 请求参数
	 * @returns 请求是否成功发起
	 */
	async removeBackground(request: RemoveBackgroundRequest): Promise<boolean> {
		if (!this.canvas.magicConfigManager.config?.methods?.removeBackground) {
			return false
		}

		if (this.isGenerating) {
			return false
		}

		if (!request.file_path) {
			return false
		}

		const requestWithId: RemoveBackgroundRequest = {
			...request,
			image_id: request.image_id || generateUUID(),
		}

		this.isGenerating = true
		this.isErrorState = false
		const attemptId = this.beginOrReuseGenerationAttempt("image-remove-background", {
			elementId: this.data.id,
			imageGenerationTaskMeta: createRemoveBackgroundTaskMeta(requestWithId),
		})
		this.rerender()

		try {
			await this.canvas.magicConfigManager.config?.methods?.removeBackground(requestWithId)
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}

			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					persistedPatch: {
						imageGenerationTaskMeta: createRemoveBackgroundTaskMeta(requestWithId),
						status: undefined,
						errorMessage: undefined,
					},
				},
			])
			if (!confirmed) return false

			this.isErrorState = false
			this.createOssSrcPromise()
			this.pollingManager.start()
			this.rerender()

			return true
		} catch (error) {
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}
			this.isGenerating = false
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	/**
	 * 发起橡皮擦除请求
	 * @param request 请求参数
	 * @returns 请求是否成功发起
	 */
	async eraser(request: EraserRequest): Promise<boolean> {
		if (!this.canvas.magicConfigManager.config?.methods?.eraser) {
			return false
		}

		if (this.isGenerating) {
			return false
		}

		if (!request.file_path || !request.mark_path) {
			return false
		}

		const requestWithId: EraserRequest = {
			...request,
			image_id: request.image_id || generateUUID(),
		}

		this.isGenerating = true
		this.isErrorState = false
		const attemptId = this.beginOrReuseGenerationAttempt("image-eraser", {
			elementId: this.data.id,
			imageGenerationTaskMeta: createEraserTaskMeta(requestWithId),
		})
		this.rerender()

		try {
			await this.canvas.magicConfigManager.config?.methods?.eraser(requestWithId)
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}

			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					persistedPatch: {
						imageGenerationTaskMeta: createEraserTaskMeta(requestWithId),
						status: undefined,
						errorMessage: undefined,
					},
				},
			])
			if (!confirmed) return false

			this.isErrorState = false
			this.createOssSrcPromise()
			this.pollingManager.start()
			this.rerender()

			return true
		} catch (error) {
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}
			this.isGenerating = false
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	/**
	 * 发起扩图请求
	 * @param request 请求参数
	 * @returns 请求是否成功发起
	 */
	async expandImage(request: GenerateExtendedImageRequest): Promise<boolean> {
		if (!this.canvas.magicConfigManager.config?.methods?.expandImage) {
			return false
		}

		if (this.isGenerating) {
			return false
		}

		if (!request.file_path || !request.canvas_path || !request.mask_path || !request.size) {
			return false
		}

		const requestWithId: GenerateExtendedImageRequest = {
			...request,
			image_id: request.image_id || generateUUID(),
		}

		this.isGenerating = true
		this.isErrorState = false
		const attemptId = this.beginOrReuseGenerationAttempt("image-extend", {
			elementId: this.data.id,
			imageGenerationTaskMeta: createExpandImageTaskMeta(requestWithId),
		})
		this.rerender()

		try {
			await this.canvas.magicConfigManager.config?.methods?.expandImage(requestWithId)
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}

			const confirmed = this.canvas.generationAttemptCoordinator.confirmAttempt(attemptId, [
				{
					elementId: this.data.id,
					persistedPatch: {
						imageGenerationTaskMeta: createExpandImageTaskMeta(requestWithId),
						status: undefined,
						errorMessage: undefined,
					},
				},
			])
			if (!confirmed) return false

			this.isErrorState = false
			this.createOssSrcPromise()
			this.pollingManager.start()
			this.rerender()

			return true
		} catch (error) {
			if (!this.canvas.generationRuntimeManager.isCurrent(attemptId, this.data.id)) {
				return false
			}
			this.isGenerating = false
			this.canvas.generationAttemptCoordinator.rejectAttempt(attemptId)
			return false
		}
	}

	private getImageGenerationTaskMeta(): ImageGenerationTaskMeta | undefined {
		return getImageGenerationTaskMeta(this.data)
	}

	private getActiveImageGenerationTaskMeta(): ImageGenerationTaskMeta | undefined {
		return (
			this.canvas?.generationRuntimeManager?.getTargetState(this.data.id)
				?.imageGenerationTaskMeta || this.getImageGenerationTaskMeta()
		)
	}

	private beginOrReuseGenerationAttempt(
		operation: GenerationOperation,
		target: GenerationAttemptTarget,
	): string {
		const runtimeManager = this.canvas.generationRuntimeManager
		const current = runtimeManager.getTargetState(this.data.id)
		if (current?.operation === operation) {
			runtimeManager.updateAttemptPhase(current.attemptId, "submitting")
			return current.attemptId
		}

		const isGenerationPlaceholder =
			this.canvas.elementManager.getTemporaryElementMetadata(this.data.id)?.kind ===
			"generation-result"
		const failurePolicy = isGenerationPlaceholder
			? operation === "image-generate"
				? "promote-empty"
				: "remove-placeholder"
			: "restore-existing"

		return runtimeManager.beginAttempt({
			operation,
			originElementId: this.data.id,
			targets: [target],
			phase: "submitting",
			failurePolicy,
		})
	}

	/**
	 * 获取图片生成状态
	 */
	isImageGenerating(): boolean {
		return (
			this.isGenerating ||
			Boolean(this.canvas?.generationRuntimeManager?.getTargetState(this.data.id))
		)
	}

	/** 返回当前用于运行时展示的请求；未确认请求不会进入 DSL。 */
	public getActiveGenerateImageRequest(): GenerateImageRequest | undefined {
		return (
			this.canvas?.generationRuntimeManager?.getTargetState(this.data.id)
				?.generateImageRequest || this.data.generateImageRequest
		)
	}

	/**
	 * 创建 ossSrc Promise（用于等待 ossSrc 换取完成）
	 */
	public createOssSrcPromise(): void {
		// 如果已经有 Promise，不重复创建
		if (this.ossSrcPromise) {
			return
		}

		this.ossSrcPromise = new Promise<string>((resolve, reject) => {
			this.ossSrcResolve = resolve
			this.ossSrcReject = reject
		})
	}

	/**
	 * 设置 ossSrc（公开方法，供外部调用）
	 * 会触发 ossSrcResolve 并启动预加载
	 */
	public setOssSrc(ossSrc: string): void {
		this.storedOssSrc = ossSrc
		this.imageLoadFailureReason = null
		this.isErrorState = false
		this.lastAppliedLoadFailureSignature = null

		// resolve ossSrc Promise
		if (this.ossSrcResolve) {
			this.ossSrcResolve(ossSrc)
			this.ossSrcResolve = undefined
			this.ossSrcReject = undefined
			this.ossSrcPromise = undefined
		}
		// ossSrc 已获取，如果 src 存在则预加载图片
		if (this.data.src) {
			this.preloadImageInternal()
		}

		// 触发 ossSrcReady 事件
		this.canvas.eventEmitter.emit({
			type: "element:image:ossSrcReady",
			data: { elementId: this.data.id },
		})
		this.rerenderWhenTransformIdle()
	}

	/**
	 * 从 resource:image:loaded 事件应用资源
	 */
	public applyPresentedResource(
		resource: LoadedResource,
		targetVariant: ImageResourceVariant,
	): boolean {
		this.targetDisplayResourceVariant = targetVariant
		if (resource.variant === "full" && !resource.isFullSize) {
			this.applyResourceMetadata(resource)
			this.commitImageResourceReconcile({
				type: "metadata-only",
				reason: "non-fullsize-full",
			})
			return false
		}

		const shouldApply = this.shouldApplyResourceToView(resource)
		if (!shouldApply) {
			this.applyResourceMetadata(resource)
			this.commitImageResourceReconcile({
				type: "metadata-only",
				reason: "view-priority-blocked",
			})
			return false
		}
		if (this.loadedImage === resource.image && this.loadedImageVariant === resource.variant) {
			this.applyResourceMetadata(resource)
			return false
		}

		const wasErrorState = this.isErrorState
		this.applyResourceToView(resource)
		this.imageLoadFailureReason = null
		this.isErrorState = false
		this.lastAppliedLoadFailureSignature = null
		const patchResult = this.patchMountedImageContentNodeWithLoadedResource()

		if ((resource.variant === "preview" || resource.variant === "full") && this.ossSrcResolve) {
			this.ossSrcResolve(resource.ossSrc)
			this.ossSrcResolve = undefined
			this.ossSrcReject = undefined
			this.ossSrcPromise = undefined
		}

		if (resource.variant === "preview" || resource.variant === "full") {
			this.canvas.eventEmitter.emit({
				type: "element:image:ossSrcReady",
				data: { elementId: this.data.id },
			})
		}

		const reconcileResult = wasErrorState
			? this.requireImageResourceStructure("error-to-image")
			: patchResult
		this.commitImageResourceReconcile(reconcileResult)
		return (
			reconcileResult.type === "patched-content" ||
			reconcileResult.type === "structure-required"
		)
	}

	/**
	 * 处理图片加载失败的逻辑
	 */
	private handleImageLoadFailure(): void {
		const currentFailureSignature = `${this.data.src || ""}:${
			this.imageLoadFailureReason || "load-error"
		}`
		const isSameFailureAsLastApplied =
			this.lastAppliedLoadFailureSignature === currentFailureSignature
		const isStableErrorState = this.isErrorState && !this.isResourceLoading

		this.clearLoadedImageReference()
		this.isResourceLoading = false
		this.isErrorState = true
		this.lastAppliedLoadFailureSignature = currentFailureSignature
		this.patchMountedImageContentNodeWithLoadedResource()

		if (isSameFailureAsLastApplied && isStableErrorState) {
			return
		}

		this.commitImageResourceReconcile(this.requireImageResourceStructure("resource-failed"))
	}

	private getResourceReplacementBeforeClose(
		closingImage: ImageSource,
		closingVariant: ImageResourceVariant,
	): LoadedResource | null {
		if (!this.data.src) return null

		const targetVariant =
			this.targetDisplayResourceVariant ??
			(closingVariant === "full" ? "preview" : closingVariant)
		const candidates = [
			targetVariant,
			closingVariant,
			...this.getDisplayTargetFallbackVariants(targetVariant),
			"preview",
			"low",
		] satisfies ImageResourceVariant[]
		const visited = new Set<ImageResourceVariant>()

		for (const variant of candidates) {
			if (variant === "full" || visited.has(variant)) continue
			visited.add(variant)
			const resource = this.peekExactResourceVariant(variant)
			if (resource && resource.image !== closingImage) {
				return resource
			}
		}

		return null
	}

	private handleImageSourceWillClose(
		closingImage: ImageSource,
		closingVariant: ImageResourceVariant,
	): void {
		if (this.loadedImage !== closingImage) return

		const wasErrorState = this.isErrorState
		const replacementResource = this.getResourceReplacementBeforeClose(
			closingImage,
			closingVariant,
		)
		if (replacementResource) {
			this.applyResourceToView(replacementResource)
		} else {
			this.clearLoadedImageReference()
		}

		this.isResourceLoading = false
		this.isErrorState = false
		const patchResult = this.patchMountedImageContentNodeWithLoadedResource()
		this.commitImageResourceReconcile(
			!replacementResource || wasErrorState
				? this.requireImageResourceStructure(
						wasErrorState ? "error-to-image" : "cleared-image-node",
					)
				: patchResult,
		)
		if (patchResult.type === "patched-content") {
			this.canvas.runtimeScheduler.requestLayerDraw("content", {
				source: "ImageElement",
				reason: "resource-will-close",
			})
		}
	}

	private getImageLoadErrorText(): string {
		const failureReason =
			this.imageLoadFailureReason ??
			(this.data.src
				? this.canvas.imageResourceManager.getFailureReason(this.data.src)
				: null)

		if (failureReason === "not-found") {
			return this.getText("image.fileMissing", "图片文件不存在")
		}

		return this.getText("image.loadError", "图片加载失败")
	}

	/** 监听必须同步处理的资源失败与 decoded surface 释放事件。 */
	private setupResourceLoadedListener(): void {
		this.removeResourceLoadedListener()
		if (!this.data.src) return

		const path = this.data.src
		const resolveAbs = this.canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
		const canonicalPath = toCanonicalCanvasResourcePath(path, resolveAbs)
		const isCurrentResourcePath = (resourcePath: string): boolean =>
			resourcePath === path ||
			toCanonicalCanvasResourcePath(resourcePath, resolveAbs) === canonicalPath

		this.resourceLoadFailedHandler = ({ data }) => {
			if (isCurrentResourcePath(data.path)) {
				this.imageLoadFailureReason = data.reason ?? "load-error"
				if (data.preservePreview && this.loadedImage) {
					this.isResourceLoading = false
					this.isErrorState = false
					this.canvas.visibilityManager.invalidateImageLoadRequest(
						data.path,
						undefined,
						"refresh-failed",
						{ scheduleRefresh: false },
					)
					return
				}
				this.handleImageLoadFailure()
			}
		}
		this.resourceWillCloseHandler = ({ data }) => {
			this.handleImageSourceWillClose(data.image, data.variant)
		}
		this.resourceSubscriptionCleanups = [
			this.canvas.imageResourceManager.onImageResourceWillClose(
				path,
				this.resourceWillCloseHandler,
			),
			this.canvas.imageResourceManager.onImageResourceLoadFailed(
				path,
				this.resourceLoadFailedHandler,
			),
		]
	}

	/**
	 * 移除资源失败与 decoded surface 释放监听
	 */
	private removeResourceLoadedListener(): void {
		this.resourceSubscriptionCleanups.forEach((cleanup) => cleanup())
		this.resourceSubscriptionCleanups = []
		this.resourceLoadFailedHandler = undefined
		this.resourceWillCloseHandler = undefined
	}

	/**
	 * 获取图片信息（公开方法，供外部调用）
	 * @returns 图片信息，如果图片未加载则返回 undefined
	 */
	public getImageInfo(): ImageInfo | undefined {
		return this.storedImageInfo
	}

	/** 图片是否已加载完成 */
	public isImageLoaded(): boolean {
		return !!this.loadedImage
	}

	/**
	 * 预加载图片
	 * 当获取到 ossSrc 时调用，预先加载图片并在加载完成后触发重新渲染
	 * 使用 ImageResourceManager 统一管理资源，确保 render 和剪贴板使用同一个 Image 对象
	 */
	private preloadImageInternal(): void {
		if (!this.data.src) {
			return
		}

		// 如果已加载完成，不重复加载
		if (this.loadedImage) {
			return
		}

		// 使用 ImageResourceManager 加载图片（通过 resource:image:loaded 事件获取完成通知）
		this.isResourceLoading = true
		this.canvas.imageResourceManager.loadResource(this.data.src, {
			variant: "preview",
			priority: "visible",
		})
	}

	/**
	 * 更新当前 Image 元素的名称（Image 1, Image 2, ...）
	 */
	private updateImageElementNames(): void {
		const currentElement = this.canvas.elementManager.getElementData(this.data.id)

		if (!currentElement || !!currentElement.name) return

		// 获取所有顶层元素
		const allElements = this.canvas.elementManager.getAllElements()

		// 收集所有 Image 类型的元素（包括子元素）
		const imageElements = collectElementsByType(allElements, ElementTypeEnum.Image)

		// 按照 zIndex 降序排序（zIndex 大的在前面）
		imageElements.sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))

		// 找到当前元素在列表中的索引
		const currentIndex = imageElements.findIndex((element) => element.id === this.data.id)

		if (currentIndex !== -1) {
			// 只为当前元素设置名称
			const newName = this.canvas.t
				? this.canvas.t("image.nameWithIndex", {
						defaultValue: "Image {{index}}",
						index: currentIndex + 1,
					})
				: `Image ${currentIndex + 1}`

			if (currentElement.name !== newName) {
				this.canvas.elementManager.update(
					this.data.id,
					{
						name: newName,
					},
					{ silent: false },
				)
			}
		}
	}

	/**
	 * 预加载图片（公开方法，供外部调用）
	 */
	public preloadImage(): void {
		this.preloadImageInternal()
	}

	private isLoadedImageFullSize(): boolean {
		if (!this.loadedImage || !this.storedImageInfo) return false
		const sourceWidth = this.loadedImageSourceWidth
		const sourceHeight = this.loadedImageSourceHeight
		if (!sourceWidth || !sourceHeight) return false
		return (
			Math.abs(sourceWidth - this.storedImageInfo.naturalWidth) <= 1 &&
			Math.abs(sourceHeight - this.storedImageInfo.naturalHeight) <= 1
		)
	}

	private canUseLoadedImageForVariant(variant: ImageResourceVariant): boolean {
		if (!this.loadedImage) return false
		if (variant === "low") return true
		if (variant === "preview") {
			return (
				this.loadedImageVariant === "preview" ||
				this.loadedImageVariant === "full" ||
				this.isLoadedImageFullSize()
			)
		}
		return this.loadedImageVariant === "full" || this.isLoadedImageFullSize()
	}

	/**
	 * 检查图片是否满足生成条件（正在生成中或等待生成结果）
	 */
	private isImageGenerationPending(): boolean {
		if (this.isGenerating) {
			return true
		}

		// 只有仍带任务 id 的请求才代表当前有生成轮询；无 id 的请求仅用于信息展示。
		const hasActiveGenerationTask = this.hasActiveImageGenerationTask()
		const hasSrc = !!this.data.src
		const status = this.data.status

		// 情况1: 有生成任务但还没有 src
		if ((hasActiveGenerationTask || this.isActiveGenerationPlaceholder()) && !hasSrc) {
			return true
		}

		// 情况2: 有 src 但状态是 pending 或 processing
		if (
			hasSrc &&
			(status === GenerationStatus.Pending || status === GenerationStatus.Processing)
		) {
			return true
		}

		// 情况3: 有 src 但还没有 ossSrc（正在换取中）
		if (hasSrc && this.data.src && !this.storedOssSrc) {
			return true
		}

		return false
	}

	/**
	 * 获取可绘制图片源（ImageBitmap | HTMLImageElement）
	 * 该方法使用 ImageResourceManager 管理资源，避免重复加载
	 * 如果图片正在生成中，会等待生成完成 + ossSrc 换取完成 + 图片加载完成
	 * @returns Promise<ImageSource | null> - 成功返回图片对象，失败返回 null
	 */
	public async getHTMLImageElement(options?: {
		variant?: ImageResourceVariant
		applyToView?: boolean
	}): Promise<ImageSource | null> {
		const variant = options?.variant ?? "full"
		const applyToView = options?.applyToView ?? variant !== "full"

		// 如果 loadedImage 已加载，直接返回
		if (this.canUseLoadedImageForVariant(variant) && this.loadedImage) {
			return this.loadedImage
		}

		// 检查图片是否正在生成中或等待结果
		if (this.isImageGenerationPending()) {
			// 如果还没有 ossSrcPromise，创建一个
			if (!this.ossSrcPromise) {
				this.createOssSrcPromise()
			}

			// 等待 ossSrc 就绪（包括生成完成 + 换取完成）
			try {
				await this.ossSrcPromise
				// 如果图片已经加载完成
				if (this.canUseLoadedImageForVariant(variant) && this.loadedImage) {
					return this.loadedImage
				}
			} catch (error) {
				// 生成失败，返回 null
				return null
			}
		}

		// 使用 getResource 加载并获取图片
		const src = this.data.src
		if (!src) return null

		try {
			const resource = await this.canvas.imageResourceManager.getResource(src, { variant })
			if (resource) {
				if (applyToView) {
					this.applyResourceToView(resource)
				} else {
					this.applyResourceMetadata(resource)
				}
				return resource.image
			}
			return null
		} catch (error) {
			return null
		}
	}

	public async getFullHTMLImageElement(options?: {
		variant?: ImageResourceVariant
		applyToView?: boolean
	}): Promise<{ image: ImageSource } | null> {
		const variant = options?.variant ?? "full"
		const applyToView = options?.applyToView ?? variant !== "full"

		if (variant !== "full") {
			const image = await this.getHTMLImageElement({ variant, applyToView })
			return image ? { image } : null
		}

		if (this.canUseLoadedImageForVariant(variant) && this.loadedImage) {
			return { image: this.loadedImage }
		}

		if (this.isImageGenerationPending()) {
			if (!this.ossSrcPromise) {
				this.createOssSrcPromise()
			}

			try {
				await this.ossSrcPromise
				if (this.canUseLoadedImageForVariant(variant) && this.loadedImage) {
					return { image: this.loadedImage }
				}
			} catch (error) {
				return null
			}
		}

		const src = this.data.src
		if (!src) return null

		try {
			const resource = await this.canvas.imageResourceManager.getResource(src, { variant })
			if (!resource) return null

			if (applyToView) {
				this.applyResourceToView(resource)
			} else {
				this.applyResourceMetadata(resource)
			}

			return {
				image: resource.image,
			}
		} catch (error) {
			return null
		}
	}

	/**
	 * 获取图片源的尺寸
	 * @param image - 图片源
	 * @returns 图片源的尺寸
	 */
	private getSourceDimensions(image?: ImageSource): { width: number; height: number } {
		if (this.storedImageInfo?.naturalWidth && this.storedImageInfo?.naturalHeight) {
			return {
				width: this.storedImageInfo.naturalWidth,
				height: this.storedImageInfo.naturalHeight,
			}
		}

		if (image) {
			return getImageSourceDimensions(image)
		}

		return {
			width: this.data.width ?? 0,
			height: this.data.height ?? 0,
		}
	}

	/**
	 * 获取图片源的裁剪区域
	 * @param image - 图片源
	 * @returns 图片源的裁剪区域
	 */
	private getSourceCrop(image?: ImageSource) {
		const sourceDimensions = this.getSourceDimensions(image)
		const crop = getPersistedSourceCrop(this.data.crop, sourceDimensions)
		if (crop.width <= 0 || crop.height <= 0) {
			return undefined
		}

		if (!image) {
			return crop
		}

		const actualDimensions = getImageSourceDimensions(image)
		if (
			sourceDimensions.width <= 0 ||
			sourceDimensions.height <= 0 ||
			actualDimensions.width <= 0 ||
			actualDimensions.height <= 0
		) {
			return crop
		}

		const scaleX = actualDimensions.width / sourceDimensions.width
		const scaleY = actualDimensions.height / sourceDimensions.height
		if (Math.abs(scaleX - 1) <= 0.001 && Math.abs(scaleY - 1) <= 0.001) {
			return crop
		}

		return {
			x: crop.x * scaleX,
			y: crop.y * scaleY,
			width: crop.width * scaleX,
			height: crop.height * scaleY,
		}
	}

	/** 比较持久化 crop 是否一致（用于判断是否需要整节点重渲染） */
	private isPersistedCropConfigEqual(
		a: ImageElementData["crop"],
		b: ImageElementData["crop"],
	): boolean {
		if (a === b) return true
		if (a === undefined || b === undefined) return false
		return (
			a.x === b.x &&
			a.y === b.y &&
			a.width === b.width &&
			a.height === b.height &&
			a.displayWidth === b.displayWidth &&
			a.displayHeight === b.displayHeight
		)
	}

	/**
	 * 将元素渲染到Canvas上下文
	 * @param ctx - Canvas 2D渲染上下文
	 * @param offsetX - 元素在Canvas中的X偏移量
	 * @param offsetY - 元素在Canvas中的Y偏移量
	 * @param options - 可选参数
	 * @param options.shouldDrawBorder - 是否绘制边框（默认 false）
	 * @param options.width - 可选的渲染宽度，如果提供则使用此宽度而非元素实际宽度
	 * @param options.height - 可选的渲染高度，如果提供则使用此高度而非元素实际高度
	 * @returns Promise<boolean> - 渲染是否成功
	 */
	public override async renderToCanvas(
		ctx: CanvasRenderingContext2D,
		offsetX: number,
		offsetY: number,
		options?: { shouldDrawBorder?: boolean; width?: number; height?: number },
	): Promise<boolean> {
		try {
			// 获取图片元素
			const fullImage = await this.getFullHTMLImageElement({ variant: "full" })
			const img = fullImage?.image
			if (!img) {
				return false
			}

			// 计算元素的实际尺寸（考虑 scaleX/scaleY）
			const width = this.data.width || 0
			const height = this.data.height || 0
			const scaleX = this.data.scaleX ?? 1
			const scaleY = this.data.scaleY ?? 1

			const actualWidth = width * scaleX
			const actualHeight = height * scaleY

			// 如果提供了可选的宽高，则使用提供的宽高
			const renderWidth = options?.width ?? actualWidth
			const renderHeight = options?.height ?? actualHeight

			if (renderWidth <= 0 || renderHeight <= 0) {
				return false
			}

			const crop = this.getSourceCrop(img)

			if (crop) {
				ctx.drawImage(
					img,
					crop.x,
					crop.y,
					crop.width,
					crop.height,
					offsetX,
					offsetY,
					renderWidth,
					renderHeight,
				)
			} else {
				ctx.drawImage(img, offsetX, offsetY, renderWidth, renderHeight)
			}

			// 如果需要绘制边框
			if (options?.shouldDrawBorder) {
				ctx.save()
				ctx.strokeStyle = DECORATOR_COLORS.BORDER_DEFAULT
				ctx.lineWidth = DECORATOR_CONFIG.BORDER_WIDTH
				ctx.strokeRect(offsetX, offsetY, renderWidth, renderHeight)
				ctx.restore()
			}

			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * 获取图片默认配置
	 * @param width 可选的宽度，如果不提供则使用默认值
	 * @param height 可选的高度，如果不提供则使用默认值
	 */
	static getDefaultConfig(width?: number, height?: number) {
		return {
			width: width ?? IMAGE_CONFIG.DEFAULT_WIDTH,
			height: height ?? IMAGE_CONFIG.DEFAULT_HEIGHT,
		}
	}

	/**
	 * 从 storage 中获取临时配置
	 */
	static getTempConfigFromStorage(
		canvas: Canvas,
		elementId: string,
	): Partial<GenerateImageRequest> | undefined {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage) return undefined

		const storage = methods.getStorage()
		return storage?.tempImageConfigs?.[elementId]
	}

	/**
	 * 保存临时配置到 storage
	 */
	static saveTempConfigToStorage(
		canvas: Canvas,
		elementId: string,
		config: Partial<GenerateImageRequest>,
	): void {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage || !methods?.saveStorage) {
			return
		}

		const storage = methods.getStorage() || {}
		const tempImageConfigs = storage.tempImageConfigs || {}

		tempImageConfigs[elementId] = config

		const newStorage = {
			...storage,
			tempImageConfigs,
		}

		methods.saveStorage(newStorage)
	}

	/**
	 * 从 storage 中清除临时配置
	 */
	static clearTempConfigFromStorage(canvas: Canvas, elementId: string): void {
		const methods = canvas.magicConfigManager.config?.methods
		if (!methods?.getStorage || !methods?.saveStorage) return

		const storage = methods.getStorage()
		if (!storage?.tempImageConfigs) return

		const tempImageConfigs = { ...storage.tempImageConfigs }
		delete tempImageConfigs[elementId]

		methods.saveStorage({
			...storage,
			tempImageConfigs,
		})
	}

	/**
	 * 获取渲染名称（用于显示的默认名称，支持多语言）
	 */
	public getRenderName(): string {
		return this.getText("image.defaultName", "图片生成器")
	}

	/**
	 * 获取名称标签文本（根据状态添加后缀）
	 */
	public override getNameLabelText(): string {
		const baseName = this.data.name || this.getRenderName()

		// 如果是错误状态（图片加载失败），直接返回原始名称
		if (this.isErrorState) {
			return baseName
		}

		const hasRequest =
			!!this.getActiveGenerateImageRequest() || !!this.getActiveImageGenerationTaskMeta()
		const status = this.data.status

		if (this.isGenerating) {
			const suffix = this.getGeneratingNameSuffix()
			return `${baseName}${suffix}`
		}

		// 有结果且失败，添加"(失败)"后缀
		if (status === GenerationStatus.Failed) {
			const suffix = this.getText("image.nameSuffix.failed", "(失败)")
			return `${baseName}${suffix}`
		}

		// 有结果且状态是 pending 或 processing
		if (status === GenerationStatus.Pending || status === GenerationStatus.Processing) {
			// 区分上传中和生成中：历史请求信息不等同于当前任务。
			if (this.isActiveGenerationPlaceholder()) {
				const suffix = this.getGeneratingNameSuffix()
				return `${baseName}${suffix}`
			}

			const suffix = this.getText("image.nameSuffix.uploading", "(上传中)")
			return `${baseName}${suffix}`
		}

		// 检查是否正在加载图片（ossSrc 存在但图片还在异步加载）
		if (this.isLoadingState) {
			const suffix = this.getText("image.nameSuffix.loading", "(加载中)")
			return `${baseName}${suffix}`
		}

		// 优先检查：有 src 说明已经生成成功，检查 ossSrc 是否为空
		if (this.data.src) {
			// 有 src 但 ossSrc 为空，添加"(加载中)"后缀
			if (!this.storedOssSrc) {
				const suffix = this.getText("image.nameSuffix.loading", "(加载中)")
				return `${baseName}${suffix}`
			}
			// 有 src 且 ossSrc 不为空，返回原始名称（已加载完成）
			return baseName
		}

		// 没有 src，但有请求且没有状态，添加"(生成中)"后缀
		if (hasRequest && !status) {
			const suffix = this.getGeneratingNameSuffix()
			return `${baseName}${suffix}`
		}

		// 其他情况返回原始名称
		return baseName
	}

	/**
	 * 重写边界计算方法（用于 Transformer）
	 * Image 元素应该使用固定的 width/height，而不是计算子节点边界
	 */
	protected override setupCustomBoundingRect(node: Konva.Group): void {
		if (!(node instanceof Konva.Group)) {
			return
		}

		// Image 元素使用固定尺寸，基于 Group 的 width/height
		node.getClientRect = (config?: Parameters<Konva.Node["getClientRect"]>[0]) => {
			const width = node.width()
			const height = node.height()
			const scaleX = node.scaleX()
			const scaleY = node.scaleY()

			// 创建一个临时的矩形节点来计算位置
			const tempRect = new Konva.Rect({
				x: 0,
				y: 0,
				width: width || 0,
				height: height || 0,
			})

			// 将临时矩形添加到 Group 中（临时）
			node.add(tempRect)
			const tempRectClientRect = tempRect.getClientRect(config)
			tempRect.destroy()

			return {
				x: tempRectClientRect.x,
				y: tempRectClientRect.y,
				width: width * scaleX,
				height: height * scaleY,
			}
		}
	}

	/**
	 * 重写边界计算，排除 info 按钮的影响
	 * 直接返回图片的实际尺寸，不考虑装饰性按钮
	 */
	public override getBoundingRect(): Rect | null {
		if (!this.node) return null

		// 获取相对于 layer 的位置
		const layer = this.node.getLayer()
		if (!layer) return null

		// 优先使用节点的实际尺寸
		let width = this.data.width || 0
		let height = this.data.height || 0

		if (this.node instanceof Konva.Group) {
			const groupWidth = this.node.width()
			const groupHeight = this.node.height()
			const scaleX = this.node.scaleX()
			const scaleY = this.node.scaleY()

			if (groupWidth !== undefined && groupHeight !== undefined) {
				width = groupWidth * scaleX
				height = groupHeight * scaleY
			}

			// 创建临时矩形来计算位置
			const tempRect = new Konva.Rect({
				x: 0,
				y: 0,
				width: groupWidth || this.data.width || width,
				height: groupHeight || this.data.height || height,
			})

			this.node.add(tempRect)
			const tempRectClientRect = tempRect.getClientRect({
				relativeTo: layer,
			})
			tempRect.destroy()

			return {
				x: tempRectClientRect.x,
				y: tempRectClientRect.y,
				width,
				height,
			}
		}

		// 如果不是 Group，使用默认方法
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

	/**
	 * 获取图片加载状态（基于事件更新的本地状态）
	 */
	private getImageLoadState(): {
		ossSrc: string | null
		imageLoaded: boolean
		isLoading: boolean
	} {
		if (!this.data.src) {
			return {
				ossSrc: null,
				imageLoaded: false,
				isLoading: false,
			}
		}

		return {
			ossSrc: this.storedOssSrc,
			imageLoaded: !!this.loadedImage,
			isLoading: this.isResourceLoading,
		}
	}

	render(): Konva.Group | null {
		// 检查是否有生成请求（生图或高清图）
		const hasRequest =
			!!this.getActiveGenerateImageRequest() || !!this.getActiveImageGenerationTaskMeta()
		const status = this.data.status

		// 有 src：视为 completed 状态，直接渲染图片或加载状态
		if (!!this.data.src || status === GenerationStatus.Completed) {
			// 如果图片加载失败，渲染错误状态
			if (this.isErrorState) {
				return this.renderError(this.getImageLoadErrorText())
			}

			// 从 ImageResourceManager 实时查询状态
			const loadState = this.getImageLoadState()

			// 主图已加载，直接渲染主图。缩放切档期间会继续显示已有图，
			// 此时即使 oss 元数据暂时不在当前 slot 上，也不能回退到 loading 占位。
			if (loadState.imageLoaded && this.data.src) {
				return this.renderImage()
			}
			return this.renderLoadingPlaceholder()
		}

		// 失败重试期间保留已落库的失败状态，但运行时应优先展示本次提交态。
		if (this.isGenerating) {
			return this.renderGeneratingPlaceholder()
		}

		// 有结果且失败，渲染错误信息
		if (status === GenerationStatus.Failed) {
			const errorMessage =
				this.data.errorMessage || this.getText("image.generateFailed", "图片生成失败")
			return this.renderError(errorMessage)
		}

		// 有结果且状态是 pending 或 processing，渲染生成中状态
		if (status === GenerationStatus.Pending || status === GenerationStatus.Processing) {
			return this.renderGeneratingPlaceholder()
		}

		// 有请求但没有结果，渲染生成中状态
		if (hasRequest && !status) {
			return this.renderGeneratingPlaceholder()
		}

		// 没有请求，渲染无状态占位符
		return this.renderEmptyPlaceholder()
	}

	update(newData: ImageElementData): boolean {
		// 判断是否需要重新渲染
		const currentTaskMeta = this.getImageGenerationTaskMeta()
		const nextTaskMeta = getImageGenerationTaskMeta(newData)
		const needsRerender =
			this.data.generateImageRequest?.image_id !== newData.generateImageRequest?.image_id ||
			currentTaskMeta?.image_id !== nextTaskMeta?.image_id ||
			currentTaskMeta?.type !== nextTaskMeta?.type ||
			this.data.src !== newData.src ||
			this.data.status !== newData.status ||
			!this.isPersistedCropConfigEqual(this.data.crop, newData.crop)

		// 检查 src 是否变化
		const srcChanged = this.data.src !== newData.src

		// 检查状态是否变为 failed
		const oldStatus = this.data.status
		const newStatus = newData.status
		const statusChangedToFailed =
			oldStatus !== GenerationStatus.Failed && newStatus === GenerationStatus.Failed
		const generationSettled =
			!!newData.src ||
			newStatus === GenerationStatus.Completed ||
			newStatus === GenerationStatus.Failed

		this.data = newData

		if (generationSettled) {
			this.isGenerating = false
		}

		// 如果 src 变化，重新加载图片并设置/移除监听
		if (srcChanged) {
			this.clearLoadedImageReference()
			this.storedOssSrc = null
			this.storedImageInfo = undefined
			this.isResourceLoading = false
			this.lastAppliedLoadFailureSignature = null
			if (newData.src) {
				this.setupResourceLoadedListener()
				this.canvas.visibilityManager.updateImageElement(this.data.id, newData.src)
			} else {
				this.removeResourceLoadedListener()
				this.canvas.visibilityManager.unregisterImageElement(this.data.id)
			}
		}

		// 如果状态变为 failed，reject ossSrcPromise
		if (statusChangedToFailed && this.ossSrcReject) {
			this.ossSrcReject(new Error(newData.errorMessage || "Image generation failed"))
			this.ossSrcResolve = undefined
			this.ossSrcReject = undefined
			this.ossSrcPromise = undefined
		}

		if (needsRerender) {
			return true
		}

		// 更新基础属性
		if (this.node instanceof Konva.Group) {
			this.updateBaseProps(this.node, newData)

			// 更新内部节点的尺寸
			if (newData.width !== undefined && newData.height !== undefined) {
				this.syncImageLayout(newData.width, newData.height)
			}
		}

		return false
	}

	/**
	 * 渲染无状态占位符
	 */
	private renderEmptyPlaceholder(): Konva.Group {
		if (!this.data.width || !this.data.height) {
			throw new Error("Image element must have width and height")
		}

		const width = this.data.width
		const height = this.data.height

		// 重置状态标记
		this.isLoadingState = false
		this.isErrorState = false

		// 创建 Group 容器
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (ctx) => {
				ctx.rect(0, 0, width, height)
			},
		})

		// 创建事件代理 hit 节点
		RenderUtils.createHitNode(group, width, height)

		// 异步加载背景和内容
		this.imageLoader.loadImage(imageBackgroundUnselected).then((backgroundImage) => {
			// 创建背景图片节点
			const backgroundNode = RenderUtils.createBackgroundImage(
				group,
				width,
				height,
				backgroundImage,
			)

			// 创建居中的图标和文本
			RenderUtils.createCenteredIconText(group, width, height, {
				text: this.getText("image.empty", "请发送生成图像的指令"),
				textColor: COLORS.EMPTY_TEXT,
				iconSrc: imageIcon,
				withBackground: false,
				t: this.canvas.t,
			}).then((contentGroup) => {
				this.contentGroup = contentGroup
				this.setupContentUpdateListener(group)
			})

			// 创建边框
			this.createBorder(group, width, height, false, backgroundNode)
			this.createCornerActions(group, width, height)
		})

		this.finalizeNode(group)
		return group
	}

	/**
	 * 渲染生成中状态占位符
	 */
	private renderGeneratingPlaceholder(): Konva.Group {
		if (!this.data.width || !this.data.height) {
			throw new Error("Image element must have width and height")
		}

		const width = this.data.width
		const height = this.data.height

		// 标记为生成中状态
		this.isLoadingState = false
		this.isErrorState = false

		// 创建 Group 容器
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (ctx) => {
				ctx.rect(0, 0, width, height)
			},
		})

		// 创建事件代理 hit 节点
		RenderUtils.createHitNode(group, width, height)

		// 区分上传中和不同任务类型的生成中：历史请求信息不等同于当前任务。
		const isGenerating = this.isActiveGenerationPlaceholder()
		const displayText = isGenerating
			? this.getGeneratingPlaceholderText()
			: this.getText("image.uploading", "正在上传中...")

		// 异步加载背景和内容
		this.imageLoader.loadImage(imageBackgroundLoading).then((backgroundImage) => {
			// 创建背景图片节点
			RenderUtils.createBackgroundImage(group, width, height, backgroundImage)

			// 创建居中的图标和文本
			RenderUtils.createCenteredIconText(group, width, height, {
				text: displayText,
				textColor: COLORS.LOADING_TEXT,
				iconSrc: imageIcon,
				withBackground: true,
				t: this.canvas.t,
			}).then((contentGroup) => {
				this.contentGroup = contentGroup
				this.setupContentUpdateListener(group)
			})

			this.createBorder(group, width, height, true)
			this.createCornerActions(group, width, height)
		})

		this.finalizeNode(group)
		return group
	}

	private hasActiveImageGenerationTask(): boolean {
		return (
			!!this.getActiveGenerateImageRequest()?.image_id ||
			!!this.getActiveImageGenerationTaskMeta()?.image_id
		)
	}

	private isActiveGenerationPlaceholder(): boolean {
		if (this.hasActiveImageGenerationTask() || this.isGenerating) {
			return true
		}

		return (
			this.data.status === GenerationStatus.Processing &&
			!this.canvas.elementManager.isTemporary(this.data.id)
		)
	}

	private getGeneratingPlaceholderText(): string {
		const taskMeta = this.getActiveImageGenerationTaskMeta()
		if (taskMeta?.type === ImageGenerationTaskTypeMap.Expand) {
			return this.getText("image.expanding", "正在扩展中...")
		}
		if (taskMeta?.type === ImageGenerationTaskTypeMap.Eraser) {
			return this.getText("image.erasing", "正在擦除中...")
		}
		if (taskMeta?.type === ImageGenerationTaskTypeMap.RemoveBackground) {
			return this.getText("image.removingBackground", "正在去除背景...")
		}
		return this.getText("image.generating", "正在生成中...")
	}

	private getGeneratingNameSuffix(): string {
		const taskMeta = this.getActiveImageGenerationTaskMeta()
		if (taskMeta?.type === ImageGenerationTaskTypeMap.Expand) {
			return this.getText("image.nameSuffix.expanding", "(扩展中)")
		}
		if (taskMeta?.type === ImageGenerationTaskTypeMap.Eraser) {
			return this.getText("image.nameSuffix.erasing", "(擦除中)")
		}
		if (taskMeta?.type === ImageGenerationTaskTypeMap.RemoveBackground) {
			return this.getText("image.nameSuffix.removingBackground", "(去背景中)")
		}
		return this.getText("image.nameSuffix.generating", "(生成中)")
	}

	private getRetryEditingPlaceholderText(): string {
		const taskMeta = this.getImageGenerationTaskMeta()
		if (taskMeta?.type === ImageGenerationTaskTypeMap.Expand) {
			return this.getText("image.retryEditingExpand", "请重新编辑扩展需求")
		}
		if (taskMeta?.type === ImageGenerationTaskTypeMap.Eraser) {
			return this.getText("image.retryEditingEraser", "请重新编辑擦除需求")
		}
		if (taskMeta?.type === ImageGenerationTaskTypeMap.RemoveBackground) {
			return this.getText("image.retryEditingRemoveBackground", "请重新编辑去背景需求")
		}
		return this.getText("image.retryEditing", "请重新编辑图片生成需求")
	}

	/**
	 * 渲染加载中状态占位符
	 */
	private renderLoadingPlaceholder(): Konva.Group {
		if (!this.data.width || !this.data.height) {
			throw new Error("Image element must have width and height")
		}

		const width = this.data.width
		const height = this.data.height

		// 标记为加载中状态
		this.isLoadingState = true
		this.isErrorState = false

		// 创建 Group 容器
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (ctx) => {
				ctx.rect(0, 0, width, height)
			},
		})

		// 创建事件代理 hit 节点
		RenderUtils.createHitNode(group, width, height)

		// 异步加载背景和内容
		this.imageLoader.loadImage(imageBackgroundLoading).then((backgroundImage) => {
			// 创建背景图片节点
			RenderUtils.createBackgroundImage(group, width, height, backgroundImage)

			// 创建居中的图标和文本
			RenderUtils.createCenteredIconText(group, width, height, {
				text: this.getText("image.loading", "正在加载中..."),
				textColor: COLORS.LOADING_TEXT,
				iconSrc: imageIcon,
				withBackground: true,
				t: this.canvas.t,
			}).then((contentGroup) => {
				this.contentGroup = contentGroup
				this.setupContentUpdateListener(group)
			})

			this.createBorder(group, width, height, true)
			this.createCornerActions(group, width, height)
		})

		this.finalizeNode(group)
		return group
	}

	/**
	 * 渲染实际图片
	 */
	private renderImage(): Konva.Group {
		if (!this.data.width || !this.data.height) {
			throw new Error("Image element must have width and height")
		}

		const width = this.data.width
		const height = this.data.height

		// 重置状态标记
		this.isLoadingState = false
		this.isErrorState = false

		// 创建 Group 容器
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (ctx) => {
				ctx.rect(0, 0, width, height)
			},
		})

		// 创建事件代理 hit 节点
		RenderUtils.createHitNode(group, width, height)

		// 使用预加载好的图片对象
		if (!this.loadedImage) {
			this.finalizeNode(group)
			return group
		}

		const crop = this.getSourceCrop(this.loadedImage)
		const isCropping = this.canvas.cropManager.getCroppingElementId() === this.data.id

		// 创建图片节点
		const imageNode = new Konva.Image({
			image: this.loadedImage,
			width: width,
			height: height,
			x: 0,
			y: 0,
			name: IMAGE_CONTENT_NODE_NAME,
			listening: false,
			crop: isCropping ? undefined : crop,
		})

		group.add(imageNode)

		// 创建边框
		this.createBorder(group, width, height, false)

		this.createCornerActions(group, width, height, { fullscreen: true })

		this.finalizeNode(group)
		return group
	}

	/**
	 * 渲染错误信息
	 */
	private renderError(errorMessage: string): Konva.Group {
		if (!this.data.width || !this.data.height) {
			throw new Error("Image element must have width and height")
		}

		const width = this.data.width
		const height = this.data.height

		// 标记为错误状态
		this.isLoadingState = false
		this.isErrorState = true

		// 创建 Group 容器
		const group = new Konva.Group({
			width,
			height,
			clipFunc: (ctx) => {
				ctx.rect(0, 0, width, height)
			},
		})

		// 创建事件代理 hit 节点
		RenderUtils.createHitNode(group, width, height)

		// 异步加载背景和内容
		this.imageLoader.loadImage(imageBackgroundUnselected).then((backgroundImage) => {
			// 创建背景图片节点
			const backgroundNode = RenderUtils.createBackgroundImage(
				group,
				width,
				height,
				backgroundImage,
			)

			// 创建居中的图标和错误文本
			RenderUtils.createCenteredIconText(group, width, height, {
				text: this.isRetryEditing ? this.getRetryEditingPlaceholderText() : errorMessage,
				textColor: COLORS.ERROR_TEXT,
				iconSrc: imageIconError,
				withBackground: false,
				isErrorState: true,
				t: this.canvas.t,
				onRetry: () => {
					this.isRetryEditing = true
					this.canvas.selectionManager.select(this.data.id, false, false)
					this.rerender()
					this.canvas.eventEmitter.emit({
						type: "element:image:retryClick",
						data: { elementId: this.data.id },
					})
				},
				// 仅文生图失败态展示“重新生成”；去背景/扩展/橡皮/高清放大轮询失败只保留错误提示。
				hasGenerateImageRequest: !this.isRetryEditing && !!this.data.generateImageRequest,
				canvas: this.canvas,
			}).then((contentGroup) => {
				this.contentGroup = contentGroup
				this.setupContentUpdateListener(group)
			})

			// 创建边框
			this.createBorder(group, width, height, false, backgroundNode)
			this.createCornerActions(group, width, height)
		})

		this.finalizeNode(group)
		return group
	}

	/**
	 * 创建边框
	 */
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
						type: "element:image:infoButtonClick",
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
						type: "element:image:fullscreenClick",
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

	private shouldShowInfoButton(): boolean {
		return !!this.getActiveGenerateImageRequest()
	}

	private shouldShowFullscreenButton(): boolean {
		return !!this.data.src
	}

	/**
	 * 更新内容的反向缩放
	 */
	private updateContentScale(width = this.data.width || 0, height = this.data.height || 0): void {
		if (!this.contentGroup || !(this.node instanceof Konva.Group)) {
			return
		}

		RenderUtils.updateContentScale(this.contentGroup, this.node, width, height)
	}

	private syncImageLayout(width: number, height: number): void {
		if (!(this.node instanceof Konva.Group)) return

		this.node.children?.forEach((child) => {
			const childName = child.name()

			if (child instanceof Konva.Image) {
				if (childName === "background") {
					RenderUtils.updateBackgroundImageLayout(child, width, height)
				} else if (!childName || childName === IMAGE_CONTENT_NODE_NAME) {
					child.width(width)
					child.height(height)
				}
			} else if (child instanceof Konva.Rect) {
				if (
					childName === "hit-area" ||
					childName === "background" ||
					childName === "decorator-border"
				) {
					child.width(width)
					child.height(height)
				}
			}
		})

		this.updateContentScale(width, height)
		this.borderDecorator?.updateSize(width, height)
		this.cornerActionsDecorator?.updateConfig({ width, height })
		this.updateClipRegion(width, height)
		this.node.getLayer()?.batchDraw()
	}

	/**
	 * 设置内容更新事件监听
	 */
	private setupContentUpdateListener(group: Konva.Group): void {
		if (this.contentUpdateHandler) {
			return
		}

		this.contentUpdateHandler = () => {
			this.updateContentScale()
		}

		// 监听 viewport 缩放事件
		this.canvas.eventEmitter.on("viewport:scale", this.contentUpdateHandler)

		// 监听 Group 的 transform 事件
		group.on("transform", this.contentUpdateHandler)
	}

	/**
	 * 移除内容更新事件监听
	 */
	private removeContentUpdateListener(): void {
		if (this.contentUpdateHandler) {
			this.canvas.eventEmitter.off("viewport:scale", this.contentUpdateHandler)
		}

		if (this.node instanceof Konva.Group && this.contentUpdateHandler) {
			this.node.off("transform", this.contentUpdateHandler)
		}

		this.contentUpdateHandler = undefined
		this.contentGroup = undefined
	}

	/**
	 * 设置裁剪事件监听
	 */
	private setupCropEventListeners(): void {
		// 监听进入裁剪模式事件
		this.cropEnterHandler = ({ data }) => {
			if (data.elementId === this.data.id) {
				this.rerender()
			}
		}
		this.canvas.eventEmitter.on("crop:enter", this.cropEnterHandler)

		// 监听退出裁剪模式事件
		this.cropExitHandler = ({ data }) => {
			if (data.elementId === this.data.id) {
				this.rerender()
			}
		}
		this.canvas.eventEmitter.on("crop:exit", this.cropExitHandler)
	}

	/**
	 * 移除裁剪事件监听
	 */
	private removeCropEventListeners(): void {
		if (this.cropEnterHandler) {
			this.canvas.eventEmitter.off("crop:enter", this.cropEnterHandler)
			this.cropEnterHandler = undefined
		}
		if (this.cropExitHandler) {
			this.canvas.eventEmitter.off("crop:exit", this.cropExitHandler)
			this.cropExitHandler = undefined
		}
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

	/**
	 * 保存临时生成图片请求数据
	 */
	saveTempGenerateImageRequest(request: Partial<GenerateImageRequest>): void {
		this.tempGenerateImageRequest = request
		ImageElement.saveTempConfigToStorage(this.canvas, this.data.id, request)
	}

	/**
	 * 获取临时生成图片请求数据
	 */
	getTempGenerateImageRequest(): Partial<GenerateImageRequest> | undefined {
		return this.tempGenerateImageRequest
	}

	/**
	 * 清除临时生成图片请求数据
	 */
	clearTempGenerateImageRequest(): void {
		this.tempGenerateImageRequest = undefined
		ImageElement.clearTempConfigFromStorage(this.canvas, this.data.id)
	}

	/**
	 * 清除临时生成图片请求数据中的 prompt（保留其他配置）
	 */
	clearTempGenerateImageRequestPrompt(): void {
		if (this.tempGenerateImageRequest) {
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { prompt, ...rest } = this.tempGenerateImageRequest
			this.tempGenerateImageRequest = rest
			ImageElement.saveTempConfigToStorage(this.canvas, this.data.id, rest)
		}
	}

	/**
	 * 保存参考图信息（单个）
	 * 与 saveReferenceImageInfos 一致：对新项预加载资源，供 Popover 预览立即展示
	 */
	saveReferenceImageInfo(fileInfo: UploadFileResponse): void {
		const exists = this.referenceImageInfos.some((info) => info.path === fileInfo.path)
		if (!exists) {
			this.canvas.imageResourceManager.loadResource(fileInfo.path)
			this.referenceImageInfos.push(fileInfo)
		}
	}

	/**
	 * 批量保存参考图信息（追加模式，性能优化版本）
	 */
	saveReferenceImageInfos(fileInfos: UploadFileResponse[]): void {
		// 构建现有 path 的 Set，用于快速查重
		const existingPaths = new Set(this.referenceImageInfos.map((info) => info.path))

		// 过滤出不重复的新信息
		const newInfos = fileInfos.filter((info) => !existingPaths.has(info.path))

		// 为新的参考图加载资源
		newInfos.forEach((info) => {
			this.canvas.imageResourceManager.loadResource(info.path)
		})

		// 批量添加
		this.referenceImageInfos.push(...newInfos)
	}

	/**
	 * 完全替换参考图信息列表（用于重新排序或批量更新）
	 */
	setReferenceImageInfos(fileInfos: UploadFileResponse[]): void {
		// 为新的参考图加载资源
		fileInfos.forEach((info) => {
			this.canvas.imageResourceManager.loadResource(info.path)
		})

		// 完全替换
		this.referenceImageInfos = fileInfos

		// 触发资源回收事件
		this.canvas.eventEmitter.emit({
			type: "referenceImages:changed",
			data: { elementId: this.data.id },
		})
	}

	/**
	 * 获取参考图信息列表
	 */
	getReferenceImageInfos(): UploadFileResponse[] {
		return [...this.referenceImageInfos]
	}

	/**
	 * 移除参考图信息
	 * 触发资源回收：ImageResourceManager 会检查 usedPaths，释放不再被引用的资源
	 */
	removeReferenceImageInfo(path: string): void {
		this.referenceImageInfos = this.referenceImageInfos.filter((info) => info.path !== path)
		this.canvas.eventEmitter.emit({
			type: "referenceImages:changed",
			data: { elementId: this.data.id },
		})
	}

	/**
	 * 清除所有参考图信息
	 * 触发资源回收（与 removeReferenceImageInfo 一致）
	 */
	clearReferenceImageInfos(): void {
		this.referenceImageInfos = []
		this.canvas.eventEmitter.emit({
			type: "referenceImages:changed",
			data: { elementId: this.data.id },
		})
	}

	/**
	 * Image 在 transformend 时将 scale 应用到尺寸
	 */
	public override getTransformBehavior(): TransformBehavior {
		return TransformBehavior.APPLY_TO_SIZE
	}

	/**
	 * 应用变换到图片元素
	 * APPLY_TO_SIZE 行为：在实时缩放和 transformend 时将 scale 应用到 width/height
	 */
	public override applyTransform(
		updates: LayerElement,
		context: TransformContext,
	): Partial<LayerElement> {
		// 在实时缩放时应用到尺寸
		if (context.isRealtime && context.isScaling) {
			const scaleX = updates.scaleX ?? 1
			const scaleY = updates.scaleY ?? 1

			if (scaleX !== 1 || scaleY !== 1) {
				const newSize = this.applyScaleToSize(updates, context)

				// 更新裁剪区域
				this.updateClipRegion(newSize.width, newSize.height)

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

		// transformend 时应用到尺寸
		if (!context.isRealtime) {
			const scaleX = updates.scaleX ?? 1
			const scaleY = updates.scaleY ?? 1

			if (scaleX !== 1 || scaleY !== 1) {
				const newSize = this.applyScaleToSize(updates, context)

				// 更新裁剪区域
				this.updateClipRegion(newSize.width, newSize.height)

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

		// 其他情况（纯拖拽）
		return {
			x: updates.x,
			y: updates.y,
		}
	}

	/**
	 * 更新裁剪区域
	 */
	private updateClipRegion(width: number, height: number): void {
		if (this.node instanceof Konva.Group) {
			this.node.clipFunc((ctx) => {
				ctx.rect(0, 0, width, height)
			})
		}
	}

	/**
	 * 在 transform 过程中更新裁剪区域
	 * @deprecated 使用 applyTransform 替代
	 */
	public override onTransformResize(width: number, height: number): void {
		this.syncImageLayout(width, height)
	}
}
