import {
	createImageSourceFromBlob,
	closeImageSource,
	getImageSourceDimensions,
	type ImageSource,
} from "./imageSourceUtils"
import type { Canvas } from "../Canvas"
import { ImageElement } from "../element/elements/ImageElement"
import { ElementTypeEnum } from "../types"
import type { ImageElement as ImageElementData } from "../types"
import type {
	ImageResourceDecodeVariant,
	ImageResourceWorkerRequest,
	ImageResourceWorkerResponse,
} from "./imageResource.worker"
import type { AttachmentSourceEnum, GetFileInfoResponse } from "../../types.magic"
import {
	getFailureReasonFromStatusCode,
	type ResourceLoadFailureReason,
} from "./resourceLoadFailure"
import {
	acquireImageResourceWorkerClient,
	type ImageResourceWorkerClientLease,
} from "./ImageResourceWorkerClient"
import {
	MEDIA_DISPLAY_RESOURCE_VARIANTS,
	getImageResourceMaxEdge,
	type MediaDisplayResourceVariant,
} from "./CanvasMediaViewingPolicy"
import { parseImageDimensionsFromBlobHeader } from "./imageHeaderDimensions"
import {
	buildImageResourceSnapshot,
	createImageResourceDiagnostics,
	type ImageResourceSnapshot,
	type ImageResourceCurrentSnapshot,
} from "./CanvasResourceDiagnostics"
import { MediaResourceUrlLifecycle, type MediaResourceUrlEntry } from "./MediaResourceUrlLifecycle"
import {
	DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
	MediaDecodePixelBudgetGate,
	estimateScaledPixelCost,
	getFallbackDecodePixelCost,
	getMediaDecodePriorityRank,
	type MediaDecodePriority,
} from "./MediaDecodePixelBudget"
import {
	MediaResourceBodyCache,
	type MediaResourceBody,
	type MediaResourceBodyCacheEntry,
} from "./MediaResourceBodyCache"

export type { ImageSource }
export type ImageResourceVariant = ImageResourceDecodeVariant
type ImageDisplayResourceVariant = Extract<ImageResourceVariant, MediaDisplayResourceVariant>

/**
 * 图片信息接口
 */
export interface ImageInfo {
	naturalWidth: number
	naturalHeight: number
	fileSize: number
	mimeType: string
	filename: string
}

/** 缩略图级别 */
export type ThumbnailType = "small"

/** 缩略图数据（异步按需生成，不占用主进程） */
export interface ThumbnailData {
	/** 小图 */
	small: string
}

/**
 * 已加载的图片资源（getResource 的返回类型）
 */
export interface LoadedResource {
	/** OSS 地址，用于 fetch、复制等 */
	ossSrc: string
	/** 加载好的图片对象 */
	image: ImageSource
	/** 图片元信息 */
	imageInfo: ImageInfo
	/** 缩略图（与主图一并加载） */
	thumbnail: ThumbnailData
	/** 解码变体：preview 用于画布显示，full 用于导出/编辑等高质量场景 */
	variant: ImageResourceVariant
	/** 当前 image 对象的实际像素宽度 */
	sourceWidth: number
	/** 当前 image 对象的实际像素高度 */
	sourceHeight: number
	/** 当前 image 是否等同原图像素尺寸 */
	isFullSize: boolean
}

export interface AcquiredImageResource extends LoadedResource {
	release: () => void
}

export interface LoadedThumbnailResource {
	/** OSS 地址；缩略图命中内存但 URL 已过期时可能为空 */
	ossSrc: string | null
	/** 图片元信息，用于图层缩略图裁剪计算 */
	imageInfo: ImageInfo
	/** 缩略图数据 */
	thumbnail: ThumbnailData
}

export interface ImageResourceLoadOptions {
	refreshCached?: boolean
	variant?: ImageResourceVariant
	priority?: ImageResourceLoadPriority
	bypassQueue?: boolean
}

export interface ResolvedImageOssInfo {
	ossSrc: string
	expiresAt: number | null
}

/**
 * 图片资源接口
 */
interface ImageResource {
	/** 当前 decoded image 对应的 URL */
	ossSrc: string
	/** 加载好的图片对象（优先 ImageBitmap，降级 HTMLImageElement） */
	image: ImageSource
	/** 图片信息 */
	imageInfo: ImageInfo
	/** 缩略图（由 Worker 与主图一并返回） */
	thumbnailData: ThumbnailData
	/** 解码变体 */
	variant: ImageResourceVariant
	/** 当前 image 对象的实际像素宽度 */
	sourceWidth: number
	/** 当前 image 对象的实际像素高度 */
	sourceHeight: number
	/** 当前 image 是否等同原图像素尺寸 */
	isFullSize: boolean
	/** 当前仍被 Konva 显示节点持有的次数；从缓存槽摘除后也不能立即关闭 */
	displayRetainCount?: number
	/** ImageBitmap/HTMLImageElement 是否已经关闭，避免延迟释放路径重复 close */
	closed?: boolean
}

interface ImageDisplayResourceSlot {
	resource: ImageResource | null
	loadingPromise: Promise<LoadedResource | null> | null
	version: string | null
	lastAccessAt: number
}

type ImageDisplayResourceSlots = Record<ImageDisplayResourceVariant, ImageDisplayResourceSlot>

/**
 * 资源条目接口（统一管理 src(path) 相关的所有状态）
 */
export interface ImageResourceEntry extends MediaResourceUrlEntry, MediaResourceBodyCacheEntry {
	/** 换取到的 ossSrc（可能为 null，表示换取失败或还未换取） */
	ossSrc: string | null
	/** 当前 ossSrc 是否来自 CacheStorage/virtual URL 兜底 */
	ossSrcFromCachedFallback: boolean
	/** getFileInfo 返回的真实源地址；当 SW 虚拟 URL 失效时用于主线程兜底 */
	sourceUrl: string | null
	/** ossSrc 过期时间戳（毫秒），null 表示永不过期 */
	expiresAt: number | null
	/** 换链 getFileInfo 返回的附件来源（与 GetFileInfoResponse.source 一致） */
	source?: AttachmentSourceEnum
	/** 换链 getFileInfo 返回的文件名（与 GetFileInfoResponse.fileName 一致） */
	fileName?: string
	/** 当前已解码 body 对应的宿主资源版本 */
	resourceVersion: string | null
	/** 当前资源版本对应的宿主更新时间 */
	sourceUpdatedAt: string | null
	/** 当前资源版本对应的压缩资源长度或附件大小 */
	contentLength: number | null
	/** 正在换取 ossSrc 的 Promise（避免重复请求） */
	exchangePromise: Promise<string | null> | null
	/** 正在加载 full 图片的 Promise（避免重复请求） */
	fullLoadingPromise: Promise<LoadedResource | null> | null
	/** 正在获取压缩 body 的 Promise（跨 preview/full 复用，避免重复下载） */
	bodyPromise: Promise<MediaResourceBody | null> | null
	/** 当前 bodyPromise 对应的资源 key */
	bodyPromiseCacheKey: string | null
	/** 正在后台刷新的 Promise（避免重复刷新） */
	backgroundRefreshPromise: Promise<void> | null
	/** 画布显示资源槽，按查看等级承载 small / overview / preview */
	displaySlots: ImageDisplayResourceSlots
	/** 已加载的 full 资源（只在导出/编辑等场景按需加载） */
	fullResource: ImageResource | null
	/** full 资源作用域持有计数；为 0 时可释放 */
	fullRetainCount: number
	/** 已缓存的压缩 body；用于 preview/full 二次解码复用，不等同 decoded bitmap */
	bodyBlob: Blob | null
	/** 已缓存 body 对应的 OSS 地址 */
	bodyOssSrc: string | null
	/** 已缓存 body 对应的资源 key */
	bodyCacheKey: string | null
	/** 已缓存 body 字节数 */
	bodyByteSize: number
	/** body 最近访问时间，用于轻量 TTL/LRU */
	bodyLastAccessAt: number
	/** 最近一次加载失败原因 */
	lastFailureReason: ResourceLoadFailureReason | null
}

const DEFAULT_IMAGE_RESOURCE_VARIANT: ImageResourceVariant = "preview"
const EMPTY_THUMBNAIL_DATA: ThumbnailData = { small: "" }
const COMPRESSED_BODY_CACHE_TTL_MS = 2 * 60 * 1000
const COMPRESSED_BODY_CACHE_MAX_BYTES = 256 * 1024 * 1024
const PREVIEW_LOAD_PIPELINE_CONCURRENCY = 8
const PREVIEW_DECODED_RESOURCE_BUDGET_BYTES = 900 * 1024 * 1024
const PREVIEW_DECODED_RESOURCE_RELEASE_CHECK_INTERVAL_MS = 1000

export type ImageResourceLoadPriority = MediaDecodePriority
type ProtectedImageResourcePaths = ReadonlySet<string> | readonly string[]

interface PreviewLoadQueueItem {
	key: string
	path: string
	normalizedSrc: string
	entry: ImageResourceEntry
	shouldRefreshCached: boolean
	variant: ImageResourceVariant
	priority: ImageResourceLoadPriority
	queuedAt: number
	sequence: number
	resolve: (resource: LoadedResource | null) => void
	reject: (error: unknown) => void
}

/**
 * 图片资源管理器
 * 负责管理图片资源的完整生命周期：src(path) -> ossSrc -> ImageSource (ImageBitmap | HTMLImageElement)
 * 提供跨元素的资源共享和自动释放功能，优先 ImageBitmap 以降低内存占用
 * 每个 Canvas 实例拥有独立的 ImageResourceManager 实例（一对一关系）
 */
export class ImageResourceManager {
	private static instanceIdSeed = 0

	private canvas: Canvas
	private readonly managerInstanceId = ++ImageResourceManager.instanceIdSeed
	private destroyed = false
	private diagnostics = createImageResourceDiagnostics()

	private urlLifecycle!: MediaResourceUrlLifecycle<ImageResourceEntry>
	private bodyCache = new MediaResourceBodyCache<ImageResourceEntry>({
		ttlMs: COMPRESSED_BODY_CACHE_TTL_MS,
		maxBytes: COMPRESSED_BODY_CACHE_MAX_BYTES,
	})

	private canonicalResourcePath(path: string): string {
		return this.urlLifecycle.canonicalResourcePath(path)
	}

	private isAbortError(error: unknown): boolean {
		if (error instanceof Error && error.name === "AbortError") return true
		return (
			typeof error === "object" &&
			error !== null &&
			"name" in error &&
			(error as { name?: unknown }).name === "AbortError"
		)
	}

	private setFailureReason(
		entry: ImageResourceEntry,
		reason: ResourceLoadFailureReason | null,
	): void {
		entry.lastFailureReason = reason
	}

	private markStaleRequestDrop(): void {
		this.diagnostics.increment("staleRequestDropCount")
	}

	private clearCachedFallbackOssSrc(entry: ImageResourceEntry): void {
		this.urlLifecycle.clearCachedFallbackOssSrc(entry)
	}

	// src(path) -> ResourceEntry 的统一映射缓存
	private entries: Map<string, ImageResourceEntry> = new Map()

	private workerClient: ImageResourceWorkerClientLease | null = null

	private requestIdCounter = 0

	private workerWarmupPromise: Promise<void> | null = null

	private previewLoadQueue: PreviewLoadQueueItem[] = []

	private previewLoadQueueByKey = new Map<string, PreviewLoadQueueItem>()

	private activePreviewLoadPipelineCount = 0

	private previewLoadQueueSequence = 0

	private decodePixelBudgetGate = new MediaDecodePixelBudgetGate()

	private previewReleaseLastCheckAt = 0

	// 防抖定时器
	private cleanupTimer: ReturnType<typeof setTimeout> | null = null

	// 防抖延迟时间（毫秒）
	private readonly CLEANUP_DEBOUNCE_DELAY = 100

	// 事件监听器回调（保存引用以便销毁时移除）
	private readonly handleElementDeleted = () => {
		this.scheduleCleanup()
	}

	private readonly handleBatchDeleted = () => {
		void this.checkAndCleanupResources()
	}

	private readonly handleCanvasClear = () => {
		void this.checkAndCleanupResources()
	}

	private readonly handleReferenceImagesChanged = () => {
		this.scheduleCleanup()
	}

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.urlLifecycle = new MediaResourceUrlLifecycle<ImageResourceEntry>({
			canvas: this.canvas,
			mediaType: "image",
			useImageProcess: true,
			isDestroyed: () => this.destroyed,
			setFailureReason: (entry, reason) => this.setFailureReason(entry, reason),
			onResourceDeleted: (normalizedSrc, entry) =>
				this.handleImageResourceDeleted(normalizedSrc, entry),
			refreshResource: (path) => this.refreshResource(path),
			incrementDiagnostic: (counter) => this.diagnostics.increment(counter),
		})
		this.workerClient = acquireImageResourceWorkerClient({
			ownerId: `canvas:${this.canvas.id}:image-resource-manager:${this.managerInstanceId}`,
			canvasId: this.canvas.id,
			managerInstanceId: this.managerInstanceId,
		})
		// 监听单个元素删除事件，使用防抖避免频繁检查
		this.canvas.eventEmitter.on("element:deleted", this.handleElementDeleted)
		// 监听批量删除完成事件，立即检查（批量删除时不需要防抖）
		this.canvas.eventEmitter.on("element:batchdeleted", this.handleBatchDeleted)
		// 监听画布清空，回收所有不再被元素引用的资源
		this.canvas.eventEmitter.on("canvas:clear", this.handleCanvasClear)
		// 监听参考图增删（编辑器 delete @ 提及等），触发资源回收
		this.canvas.eventEmitter.on("referenceImages:changed", this.handleReferenceImagesChanged)
		void this.warmupWorker()
	}

	private createWorkerRequestId(prefix: string): string {
		return `${prefix}-${this.managerInstanceId}-${++this.requestIdCounter}-${Date.now()}`
	}

	/**
	 * 向 Worker 发送请求
	 */
	private sendToWorker(
		request: ImageResourceWorkerRequest,
	): Promise<ImageResourceWorkerResponse> {
		if (this.destroyed || !this.workerClient) {
			return Promise.reject(new Error("ImageResourceManager destroyed"))
		}
		return this.workerClient.send(request)
	}

	private warmupWorker(): Promise<void> {
		if (this.destroyed) return Promise.resolve()
		if (this.workerWarmupPromise) return this.workerWarmupPromise

		const requestId = this.createWorkerRequestId("img-warmup")

		const promise = this.sendToWorker({
			type: "warmup",
			requestId,
			variant: DEFAULT_IMAGE_RESOURCE_VARIANT,
		})
			.then(() => undefined)
			.catch(() => undefined)
			.finally(() => {
				if (this.workerWarmupPromise === promise) {
					this.workerWarmupPromise = null
				}
			})

		this.workerWarmupPromise = promise
		return promise
	}

	/**
	 * 从 entry 构建 LoadedResource
	 */
	private buildLoadedResource(
		entry: ImageResourceEntry,
		variant: ImageResourceVariant = DEFAULT_IMAGE_RESOURCE_VARIANT,
	): LoadedResource | null {
		const resource = this.getResourceForVariant(entry, variant)
		if (!resource?.ossSrc) return null
		if (variant !== "full" && resource === this.getDisplayResource(entry, variant)) {
			this.touchDisplayResource(entry, variant)
		}
		this.setFailureReason(entry, null)
		return {
			ossSrc: resource.ossSrc,
			image: resource.image,
			imageInfo: resource.imageInfo,
			thumbnail: resource.thumbnailData,
			variant: resource.variant,
			sourceWidth: resource.sourceWidth,
			sourceHeight: resource.sourceHeight,
			isFullSize: resource.isFullSize,
		}
	}

	private getFallbackThumbnailData(entry: ImageResourceEntry): ThumbnailData {
		return (
			this.getDisplayResource(entry, "preview")?.thumbnailData ??
			entry.fullResource?.thumbnailData ??
			this.getDisplayResource(entry, "overview")?.thumbnailData ??
			this.getDisplayResource(entry, "small")?.thumbnailData ??
			EMPTY_THUMBNAIL_DATA
		)
	}

	private getResourceForVariant(
		entry: ImageResourceEntry,
		variant: ImageResourceVariant,
	): ImageResource | null {
		if (variant === "full") {
			const previewResource = this.getDisplayResource(entry, "preview")
			return entry.fullResource ?? (previewResource?.isFullSize ? previewResource : null)
		}
		if (variant === "small") {
			return this.getDisplayResource(entry, "small")
		}
		if (variant === "overview") {
			return (
				this.getDisplayResource(entry, "overview") ??
				this.getDisplayResource(entry, "preview") ??
				entry.fullResource
			)
		}

		return this.getDisplayResource(entry, "preview") ?? entry.fullResource
	}

	private getLoadingPromiseForVariant(
		entry: ImageResourceEntry,
		variant: ImageResourceVariant,
	): Promise<LoadedResource | null> | null {
		if (variant === "full") return entry.fullLoadingPromise
		return this.getDisplayLoadingPromise(entry, variant)
	}

	private setLoadingPromiseForVariant(
		entry: ImageResourceEntry,
		variant: ImageResourceVariant,
		promise: Promise<LoadedResource | null> | null,
	): void {
		if (variant === "full") {
			entry.fullLoadingPromise = promise
		} else {
			this.setDisplayLoadingPromise(entry, variant, promise)
		}
	}

	private getPreviewQueueKey(normalizedSrc: string, variant: ImageResourceVariant): string {
		return `${normalizedSrc}::${variant}`
	}

	private getPriorityRank(priority: ImageResourceLoadPriority): number {
		return getMediaDecodePriorityRank(priority)
	}

	private normalizeLoadPriority(
		priority: ImageResourceLoadPriority | undefined,
		variant: ImageResourceVariant,
	): ImageResourceLoadPriority {
		if (priority) return priority
		return variant === "full" ? "critical" : "background"
	}

	private sortPreviewLoadQueue(): void {
		this.previewLoadQueue.sort((a, b) => {
			const priorityDiff = this.getPriorityRank(a.priority) - this.getPriorityRank(b.priority)
			if (priorityDiff !== 0) return priorityDiff
			return a.sequence - b.sequence
		})
	}

	private acquireImageDecodePermit(
		pixelCost: number,
		priority: ImageResourceLoadPriority,
	): Promise<() => void> {
		if (this.destroyed) return Promise.resolve(() => undefined)
		return this.decodePixelBudgetGate.acquire(pixelCost, priority)
	}

	private upgradeQueuedPreviewLoad(
		normalizedSrc: string,
		variant: ImageResourceVariant,
		priority: ImageResourceLoadPriority,
	): void {
		const key = this.getPreviewQueueKey(normalizedSrc, variant)
		const item = this.previewLoadQueueByKey.get(key)
		if (!item) return
		if (this.getPriorityRank(priority) >= this.getPriorityRank(item.priority)) return

		item.priority = priority
	}

	private runPreviewLoadPipelineQueued(
		path: string,
		normalizedSrc: string,
		entry: ImageResourceEntry,
		shouldRefreshCached: boolean,
		variant: ImageResourceVariant,
		priority: ImageResourceLoadPriority,
	): Promise<LoadedResource | null> {
		if (this.destroyed) {
			return Promise.resolve(null)
		}

		const key = this.getPreviewQueueKey(normalizedSrc, variant)
		return new Promise<LoadedResource | null>((resolve, reject) => {
			const item: PreviewLoadQueueItem = {
				key,
				path,
				normalizedSrc,
				entry,
				shouldRefreshCached,
				variant,
				priority,
				queuedAt: this.getNow(),
				sequence: ++this.previewLoadQueueSequence,
				resolve,
				reject,
			}
			this.previewLoadQueue.push(item)
			this.previewLoadQueueByKey.set(key, item)
			this.pumpPreviewLoadQueue()
		})
	}

	private pumpPreviewLoadQueue(): void {
		if (this.destroyed) return
		this.sortPreviewLoadQueue()
		while (
			this.activePreviewLoadPipelineCount < PREVIEW_LOAD_PIPELINE_CONCURRENCY &&
			this.previewLoadQueue.length > 0
		) {
			const item = this.previewLoadQueue.shift()
			if (!item) return
			this.previewLoadQueueByKey.delete(item.key)
			this.activePreviewLoadPipelineCount += 1

			void this.loadImageResourcePipeline(
				item.path,
				item.normalizedSrc,
				item.entry,
				item.shouldRefreshCached,
				item.variant,
				item.priority,
			)
				.then((resource) => {
					item.resolve(resource)
				})
				.catch((error) => {
					item.reject(error)
				})
				.finally(() => {
					this.activePreviewLoadPipelineCount = Math.max(
						0,
						this.activePreviewLoadPipelineCount - 1,
					)
					this.pumpPreviewLoadQueue()
				})
		}
	}

	private getDecodedBytes(resource: ImageResource | null): number {
		if (!resource) return 0
		return Math.max(1, resource.sourceWidth) * Math.max(1, resource.sourceHeight) * 4
	}

	private isFullSizeResource(
		imageInfo: ImageInfo,
		sourceWidth: number,
		sourceHeight: number,
	): boolean {
		return (
			Math.abs(sourceWidth - imageInfo.naturalWidth) <= 1 &&
			Math.abs(sourceHeight - imageInfo.naturalHeight) <= 1
		)
	}

	private closeResource(
		resource: ImageResource | null,
		options?: { path?: string; reason?: string },
	): void {
		if (!resource) return
		if (resource.closed) return
		resource.closed = true
		this.canvas.eventEmitter.emit({
			type: "resource:image:will-close",
			data: {
				path: options?.path,
				variant: resource.variant,
				image: resource.image,
				reason: options?.reason ?? "resource-close",
			},
		})
		closeImageSource(resource.image)
	}

	private closeResourceAfterConsumersSwap(
		resource: ImageResource | null,
		options?: { path?: string; reason?: string },
	): void {
		if (!resource) return

		const schedule =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback: FrameRequestCallback) =>
						globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number
		schedule(() => {
			schedule(() => {
				this.closeResource(resource, options)
			})
		})
	}

	private closeUniqueResources(resources: Array<ImageResource | null>): void {
		const closed = new Set<ImageResource>()
		resources.forEach((resource) => {
			if (!resource || closed.has(resource)) return
			closed.add(resource)
			this.closeResource(resource)
		})
	}

	private createDisplayResourceSlot(
		options?: Partial<ImageDisplayResourceSlot>,
	): ImageDisplayResourceSlot {
		return {
			resource: null,
			loadingPromise: null,
			version: null,
			lastAccessAt: 0,
			...options,
		}
	}

	private createDisplayResourceSlots(): ImageDisplayResourceSlots {
		return {
			small: this.createDisplayResourceSlot(),
			overview: this.createDisplayResourceSlot(),
			preview: this.createDisplayResourceSlot(),
		}
	}

	private getDisplayResourceSlot(
		entry: ImageResourceEntry,
		variant: ImageDisplayResourceVariant,
	): ImageDisplayResourceSlot {
		return entry.displaySlots[variant]
	}

	private getDisplayResource(
		entry: ImageResourceEntry,
		variant: ImageDisplayResourceVariant,
	): ImageResource | null {
		return this.getDisplayResourceSlot(entry, variant).resource
	}

	private touchDisplayResource(
		entry: ImageResourceEntry,
		variant: ImageDisplayResourceVariant,
	): void {
		this.getDisplayResourceSlot(entry, variant).lastAccessAt = this.getNow()
	}

	private setDisplayResource(
		entry: ImageResourceEntry,
		variant: ImageDisplayResourceVariant,
		resource: ImageResource | null,
		options?: { version?: string | null; touch?: boolean; closePrevious?: boolean },
	): ImageResource | null {
		const slot = this.getDisplayResourceSlot(entry, variant)
		const previousResource = slot.resource
		slot.resource = resource
		slot.version = options?.version ?? null
		slot.lastAccessAt = resource && options?.touch !== false ? this.getNow() : 0
		const shouldClosePrevious =
			options?.closePrevious !== false &&
			!!previousResource &&
			previousResource !== resource &&
			!this.isResourceStillReferenced(entry, previousResource)
		if (shouldClosePrevious) {
			this.closeResource(previousResource, { reason: "display-slot-replaced" })
		}
		return previousResource && previousResource !== resource ? previousResource : null
	}

	private getDisplayLoadingPromise(
		entry: ImageResourceEntry,
		variant: ImageDisplayResourceVariant,
	): Promise<LoadedResource | null> | null {
		return this.getDisplayResourceSlot(entry, variant).loadingPromise
	}

	private setDisplayLoadingPromise(
		entry: ImageResourceEntry,
		variant: ImageDisplayResourceVariant,
		promise: Promise<LoadedResource | null> | null,
	): void {
		this.getDisplayResourceSlot(entry, variant).loadingPromise = promise
	}

	private clearDisplayResources(entry: ImageResourceEntry): void {
		for (const variant of MEDIA_DISPLAY_RESOURCE_VARIANTS) {
			const slot = this.getDisplayResourceSlot(entry, variant)
			slot.resource = null
			slot.version = null
			slot.lastAccessAt = 0
		}
	}

	private cloneDisplayResourceSlots(entry: ImageResourceEntry): ImageDisplayResourceSlots {
		const slots = entry.displaySlots
		return {
			small: this.createDisplayResourceSlot({ ...slots.small }),
			overview: this.createDisplayResourceSlot({ ...slots.overview }),
			preview: this.createDisplayResourceSlot({ ...slots.preview }),
		}
	}

	private restoreDisplayResourceSlots(
		entry: ImageResourceEntry,
		slots: ImageDisplayResourceSlots,
	): void {
		entry.displaySlots = slots
	}

	private isResourceStillReferenced(entry: ImageResourceEntry, resource: ImageResource): boolean {
		const slots = entry.displaySlots
		return (
			(resource.displayRetainCount ?? 0) > 0 ||
			slots.small.resource === resource ||
			slots.overview.resource === resource ||
			slots.preview.resource === resource ||
			entry.fullResource === resource
		)
	}

	private findResourceByLoadedResource(
		entry: ImageResourceEntry,
		loadedResource: Pick<LoadedResource, "image" | "variant">,
	): ImageResource | null {
		const resources = [
			this.getDisplayResource(entry, "small"),
			this.getDisplayResource(entry, "overview"),
			this.getDisplayResource(entry, "preview"),
			entry.fullResource,
		]
		return (
			resources.find(
				(resource): resource is ImageResource =>
					!!resource &&
					resource.image === loadedResource.image &&
					resource.variant === loadedResource.variant,
			) ?? null
		)
	}

	private addCanonicalResourcePaths(
		target: Set<string>,
		paths: ProtectedImageResourcePaths | undefined,
	): void {
		if (!paths) return
		paths.forEach((path) => {
			target.add(this.canonicalResourcePath(path))
		})
	}

	private getNow(): number {
		return Date.now()
	}

	private getBodyCacheKey(path: string, ossSrc: string, entry: ImageResourceEntry): string {
		return this.bodyCache.getCacheKey(path, ossSrc, entry)
	}

	private clearEntryBody(entry: ImageResourceEntry): void {
		this.bodyCache.clearBody(entry)
	}

	private clearEntryBodyPromise(entry: ImageResourceEntry): void {
		this.bodyCache.clearBodyPromise(entry)
	}

	private getReusableBody(
		entry: ImageResourceEntry,
		ossSrc: string,
		cacheKey: string,
	): MediaResourceBody | null {
		return this.bodyCache.getReusableBody(entry, ossSrc, cacheKey)
	}

	private evictBodyCacheBudget(exemptEntry?: ImageResourceEntry): void {
		this.bodyCache.evictBudget(this.entries.values(), exemptEntry)
	}

	private closeEntryResources(entry: ImageResourceEntry): void {
		const smallResource = this.getDisplayResource(entry, "small")
		const overviewResource = this.getDisplayResource(entry, "overview")
		const previewResource = this.getDisplayResource(entry, "preview")
		const fullResource = entry.fullResource
		this.closeUniqueResources([smallResource, overviewResource, previewResource, fullResource])
		this.clearDisplayResources(entry)
		entry.fullResource = null
		entry.fullRetainCount = 0
		this.clearEntryBody(entry)
		this.clearEntryBodyPromise(entry)
	}

	private releaseDisplayResource(
		path: string,
		entry: ImageResourceEntry,
		variant: "small" | "overview" | "preview",
		resource: ImageResource | null,
		options: {
			reason: string
			remainingDecodedBytes: number
			decodedBudgetBytes: number
		},
	): number {
		if (!resource) return 0

		const releasedBytes = this.getDecodedBytes(resource)
		this.setDisplayResource(entry, variant, null, { closePrevious: false })
		this.diagnostics.increment("displayReleaseCount")
		this.diagnostics.increment("displayReleaseBytes", releasedBytes)

		this.canvas.eventEmitter.emit({
			type: "resource:image:released",
			data: {
				path,
				variant,
				reason: options.reason,
				releasedBytes,
			},
		})
		if (!this.isResourceStillReferenced(entry, resource)) {
			this.closeResource(resource, { path, reason: options.reason })
		}
		return releasedBytes
	}

	private releaseSmallResource(
		path: string,
		entry: ImageResourceEntry,
		options: {
			reason: string
			remainingDecodedBytes: number
			decodedBudgetBytes: number
		},
	): number {
		return this.releaseDisplayResource(
			path,
			entry,
			"small",
			this.getDisplayResource(entry, "small"),
			options,
		)
	}

	private releasePreviewResource(
		path: string,
		entry: ImageResourceEntry,
		options: {
			reason: string
			remainingDecodedBytes: number
			decodedBudgetBytes: number
		},
	): number {
		return this.releaseDisplayResource(
			path,
			entry,
			"preview",
			this.getDisplayResource(entry, "preview"),
			options,
		)
	}

	private releaseOverviewResource(
		path: string,
		entry: ImageResourceEntry,
		options: {
			reason: string
			remainingDecodedBytes: number
			decodedBudgetBytes: number
		},
	): number {
		return this.releaseDisplayResource(
			path,
			entry,
			"overview",
			this.getDisplayResource(entry, "overview"),
			options,
		)
	}

	public enforcePreviewDecodedBudget(options?: {
		protectedPaths?: ProtectedImageResourcePaths
		reason?: string
		budgetBytes?: number
		force?: boolean
	}): void {
		if (this.destroyed) return
		const now = this.getNow()
		if (
			!options?.force &&
			now - this.previewReleaseLastCheckAt <
				PREVIEW_DECODED_RESOURCE_RELEASE_CHECK_INTERVAL_MS
		) {
			return
		}
		this.previewReleaseLastCheckAt = now

		const budgetBytes = options?.budgetBytes ?? PREVIEW_DECODED_RESOURCE_BUDGET_BYTES
		const reason = options?.reason ?? "decoded-budget"
		const protectedPaths = new Set<string>()
		this.addCanonicalResourcePaths(protectedPaths, options?.protectedPaths)

		let totalPreviewDecodedBytes = 0
		const candidates: Array<{
			path: string
			entry: ImageResourceEntry
			decodedBytes: number
			lastAccessAt: number
		}> = []

		this.entries.forEach((entry, path) => {
			const previewResource = this.getDisplayResource(entry, "preview")
			if (!previewResource) return
			const decodedBytes = this.getDecodedBytes(previewResource)
			totalPreviewDecodedBytes += decodedBytes
			if (protectedPaths.has(path)) {
				return
			}
			if (entry.fullRetainCount > 0 || entry.fullResource === previewResource) {
				return
			}
			candidates.push({
				path,
				entry,
				decodedBytes,
				lastAccessAt: this.getDisplayResourceSlot(entry, "preview").lastAccessAt,
			})
		})

		if (totalPreviewDecodedBytes <= budgetBytes) return

		candidates.sort((a, b) => {
			const lastAccessDiff = a.lastAccessAt - b.lastAccessAt
			if (lastAccessDiff !== 0) return lastAccessDiff
			return b.decodedBytes - a.decodedBytes
		})

		let remainingDecodedBytes = totalPreviewDecodedBytes
		for (const candidate of candidates) {
			if (remainingDecodedBytes <= budgetBytes) break
			const bytes = this.releasePreviewResource(candidate.path, candidate.entry, {
				reason,
				remainingDecodedBytes: remainingDecodedBytes - candidate.decodedBytes,
				decodedBudgetBytes: budgetBytes,
			})
			if (bytes <= 0) continue
			remainingDecodedBytes -= bytes
		}
	}

	public enforceDisplayDecodedBudget(options?: {
		protectedSmallPaths?: ProtectedImageResourcePaths
		protectedOverviewPaths?: ProtectedImageResourcePaths
		protectedPreviewPaths?: ProtectedImageResourcePaths
		reason?: string
		force?: boolean
	}): void {
		if (this.destroyed) return
		const now = this.getNow()
		if (
			!options?.force &&
			now - this.previewReleaseLastCheckAt <
				PREVIEW_DECODED_RESOURCE_RELEASE_CHECK_INTERVAL_MS
		) {
			return
		}
		this.previewReleaseLastCheckAt = now

		const reason = options?.reason ?? "display-unprotected-release"
		const protectedSmallPaths = new Set<string>()
		const protectedOverviewPaths = new Set<string>()
		const protectedPreviewPaths = new Set<string>()
		this.addCanonicalResourcePaths(protectedSmallPaths, options?.protectedSmallPaths)
		this.addCanonicalResourcePaths(protectedOverviewPaths, options?.protectedOverviewPaths)
		this.addCanonicalResourcePaths(protectedPreviewPaths, options?.protectedPreviewPaths)

		const candidates: Array<{
			path: string
			entry: ImageResourceEntry
			variant: "small" | "overview" | "preview"
			decodedBytes: number
			lastAccessAt: number
		}> = []

		const protectedPathsByVariant: Record<ImageDisplayResourceVariant, Set<string>> = {
			small: protectedSmallPaths,
			overview: protectedOverviewPaths,
			preview: protectedPreviewPaths,
		}

		this.entries.forEach((entry, path) => {
			for (const variant of MEDIA_DISPLAY_RESOURCE_VARIANTS) {
				const slot = this.getDisplayResourceSlot(entry, variant)
				if (!slot.resource) continue
				const decodedBytes = this.getDecodedBytes(slot.resource)
				if (
					!protectedPathsByVariant[variant].has(path) &&
					entry.fullRetainCount <= 0 &&
					entry.fullResource !== slot.resource
				) {
					candidates.push({
						path,
						entry,
						variant,
						decodedBytes,
						lastAccessAt: slot.lastAccessAt,
					})
				}
			}
		})

		if (candidates.length === 0) return

		candidates.sort((a, b) => {
			if (a.variant !== b.variant) {
				const variantRank: Record<"small" | "overview" | "preview", number> = {
					preview: 0,
					overview: 1,
					small: 2,
				}
				return variantRank[a.variant] - variantRank[b.variant]
			}
			const lastAccessDiff = a.lastAccessAt - b.lastAccessAt
			if (lastAccessDiff !== 0) return lastAccessDiff
			return b.decodedBytes - a.decodedBytes
		})

		for (const candidate of candidates) {
			const bytes =
				candidate.variant === "preview"
					? this.releasePreviewResource(candidate.path, candidate.entry, {
							reason,
							remainingDecodedBytes: 0,
							decodedBudgetBytes: 0,
						})
					: candidate.variant === "overview"
						? this.releaseOverviewResource(candidate.path, candidate.entry, {
								reason,
								remainingDecodedBytes: 0,
								decodedBudgetBytes: 0,
							})
						: this.releaseSmallResource(candidate.path, candidate.entry, {
								reason,
								remainingDecodedBytes: 0,
								decodedBudgetBytes: 0,
							})
			void bytes
		}
	}

	/**
	 * 加载图片（内部方法）
	 * @param path 路径（path）
	 * @returns Promise<LoadedResource | null>
	 */
	private async loadImageInternal(
		path: string,
		options?: ImageResourceLoadOptions,
	): Promise<LoadedResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		const normalizedSrc = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedSrc)
		const shouldRefreshCached = options?.refreshCached !== false
		const variant = options?.variant ?? DEFAULT_IMAGE_RESOURCE_VARIANT
		const priority = this.normalizeLoadPriority(options?.priority, variant)

		// 检查 ossSrc 是否过期，过期则清除
		this.clearExpiredOssSrc(entry)
		this.applyVirtualResourceBypass(entry)

		// 检查缓存
		const cachedMemoryResource = this.getResourceForVariant(entry, variant)
		if (cachedMemoryResource) {
			this.diagnostics.increment("memoryHitCount")
			this.setFailureReason(entry, null)
			return this.buildLoadedResource(entry, variant)
		}

		// 检查是否正在加载中，避免重复请求
		const loadingPromise = this.getLoadingPromiseForVariant(entry, variant)
		if (loadingPromise) {
			this.diagnostics.increment("loadingDedupedCount")
			this.upgradeQueuedPreviewLoad(normalizedSrc, variant, priority)
			const result = await loadingPromise
			if (this.destroyed) return null
			if (!result) {
				if (variant === "preview") {
					this.canvas.eventEmitter.emit({
						type: "resource:image:load-failed",
						data: {
							path: normalizedSrc,
							reason: entry.lastFailureReason ?? "load-error",
						},
					})
				} else {
					this.emitVariantLoadFailed(
						normalizedSrc,
						variant,
						entry.lastFailureReason ?? "load-error",
					)
				}
			}
			return result
		}

		const promise =
			variant !== "full" && !options?.bypassQueue
				? this.runPreviewLoadPipelineQueued(
						path,
						normalizedSrc,
						entry,
						shouldRefreshCached,
						variant,
						priority,
					)
				: this.loadImageResourcePipeline(
						path,
						normalizedSrc,
						entry,
						shouldRefreshCached,
						variant,
						priority,
					)
		this.setLoadingPromiseForVariant(entry, variant, promise)

		try {
			const result = await promise
			if (this.destroyed) return null
			if (!result) {
				if (variant === "preview") {
					this.canvas.eventEmitter.emit({
						type: "resource:image:load-failed",
						data: {
							path: normalizedSrc,
							reason: entry.lastFailureReason ?? "load-error",
						},
					})
				} else {
					this.emitVariantLoadFailed(
						normalizedSrc,
						variant,
						entry.lastFailureReason ?? "load-error",
					)
				}
			}
			return result
		} finally {
			if (this.getLoadingPromiseForVariant(entry, variant) === promise) {
				this.setLoadingPromiseForVariant(entry, variant, null)
			}
		}
	}

	private emitVariantLoadFailed(
		normalizedSrc: string,
		variant: ImageResourceVariant,
		reason: ResourceLoadFailureReason,
	): void {
		this.canvas.eventEmitter.emit({
			type: "resource:image:variant-load-failed",
			data: {
				path: normalizedSrc,
				variant,
				reason,
			},
		})
	}

	private async loadImageResourcePipeline(
		path: string,
		normalizedSrc: string,
		entry: ImageResourceEntry,
		shouldRefreshCached: boolean,
		variant: ImageResourceVariant,
		priority?: ImageResourceLoadPriority,
	): Promise<LoadedResource | null> {
		if (variant === "overview") {
			return this.loadOverviewResourcePipeline(path, normalizedSrc, entry, priority)
		}

		const cachedResource = await this.loadCachedImageResource(
			path,
			normalizedSrc,
			entry,
			variant,
		)
		if (this.destroyed) return null
		if (cachedResource) {
			if (shouldRefreshCached) {
				this.triggerBackgroundMetadataRefresh(path, normalizedSrc, entry)
			}
			return cachedResource
		}
		this.clearCachedFallbackOssSrc(entry)

		const getFileInfo = this.canvas.magicConfigManager.config?.methods?.getFileInfo
		if (!getFileInfo) {
			this.setFailureReason(entry, "load-error")
			return null
		}

		// 换取 ossSrc
		let ossSrc: string | null = entry.ossSrc
		if (!ossSrc) {
			ossSrc = await this.exchangeOssSrc(path, entry)
			if (this.destroyed) return null
			if (!ossSrc) {
				if (variant === "preview") {
					this.canvas.eventEmitter.emit({
						type: "resource:image:load-failed",
						data: {
							path: normalizedSrc,
							reason: entry.lastFailureReason ?? "not-found",
						},
					})
				}
				return null
			}
		}

		return this.loadImageResource(normalizedSrc, ossSrc, entry, variant, priority)
	}

	private async loadOverviewResourcePipeline(
		path: string,
		normalizedSrc: string,
		entry: ImageResourceEntry,
		priority?: ImageResourceLoadPriority,
	): Promise<LoadedResource | null> {
		const cachedBodyOssSrc = this.bodyCache.getCachedOssSrc(entry)
		if (cachedBodyOssSrc) {
			return this.loadImageResource(
				normalizedSrc,
				cachedBodyOssSrc,
				entry,
				"overview",
				priority,
			)
		}

		let ossSrc = entry.ossSrc
		if (!ossSrc) {
			ossSrc = await this.exchangeOssSrc(path, entry)
			if (this.destroyed) return null
		}
		if (!ossSrc) {
			return null
		}

		return this.loadImageResource(normalizedSrc, ossSrc, entry, "overview", priority)
	}

	/**
	 * 触发资源加载（不等待，通过 resource:image:loaded 事件获取完成通知）
	 * @param path 路径（path）
	 */
	public loadResource(path: string, options?: ImageResourceLoadOptions): void {
		this.loadImageInternal(path, options).catch(() => {
			// 静默吞掉错误，调用方通过事件或 getResource 感知失败
		})
	}

	/**
	 * 获取资源（如未加载则触发加载并等待）
	 * @param path 路径（path）
	 * @returns Promise<LoadedResource | null>
	 */
	public async getResource(
		path: string,
		options?: ImageResourceLoadOptions,
	): Promise<LoadedResource | null> {
		return this.loadImageInternal(path, options)
	}

	public async acquireResource(
		path: string,
		options?: ImageResourceLoadOptions,
	): Promise<AcquiredImageResource | null> {
		const variant = options?.variant ?? DEFAULT_IMAGE_RESOURCE_VARIANT
		const resource = await this.loadImageInternal(path, options)
		if (!resource) return null

		const normalizedSrc = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedSrc)
		let released = false

		if (variant === "full" && entry.fullResource && resource.variant === "full") {
			entry.fullRetainCount += 1
			this.diagnostics.increment("fullAcquireCount")
		}

		return {
			...resource,
			release: () => {
				if (released) return
				released = true
				this.releaseResource(path, { variant })
			},
		}
	}

	public releaseResource(path: string, options?: { variant?: ImageResourceVariant }): void {
		const variant = options?.variant ?? DEFAULT_IMAGE_RESOURCE_VARIANT
		if (variant !== "full") return

		const normalizedSrc = this.canonicalResourcePath(path)
		const entry = this.entries.get(normalizedSrc)
		if (!entry?.fullResource) return

		entry.fullRetainCount = Math.max(0, entry.fullRetainCount - 1)
		this.diagnostics.increment("fullReleaseCount")
		if (entry.fullRetainCount > 0 || entry.fullLoadingPromise) return

		this.closeResource(entry.fullResource, { path: normalizedSrc, reason: "full-release" })
		entry.fullResource = null
		this.canvas.eventEmitter.emit({
			type: "resource:released",
			data: { path: normalizedSrc },
		})
	}

	/**
	 * 获取图片缩略图；缩略图与主图资源共用同一次加载链路。
	 * @param path 路径（path）
	 */
	public async getThumbnail(path: string): Promise<LoadedThumbnailResource | null> {
		const normalizedSrc = this.canonicalResourcePath(path)
		const entry = this.entries.get(normalizedSrc)
		const previewResource = entry ? this.getDisplayResource(entry, "preview") : null
		if (entry && previewResource) {
			this.setFailureReason(entry, null)
			return {
				ossSrc: previewResource.ossSrc,
				imageInfo: previewResource.imageInfo,
				thumbnail: previewResource.thumbnailData,
			}
		}
		const previewLoadingPromise = entry ? this.getDisplayLoadingPromise(entry, "preview") : null
		if (previewLoadingPromise) {
			const resource = await previewLoadingPromise
			if (!resource) return null
			return {
				ossSrc: resource.ossSrc,
				imageInfo: resource.imageInfo,
				thumbnail: resource.thumbnail,
			}
		}

		const resource = await this.loadImageInternal(path, {
			refreshCached: false,
			variant: "preview",
		})
		if (!resource) return null
		return {
			ossSrc: resource.ossSrc,
			imageInfo: resource.imageInfo,
			thumbnail: resource.thumbnail,
		}
	}

	/**
	 * 读取指定 path 对应的资源条目（无缓存则 undefined）
	 */
	public getEntry(path: string): Readonly<ImageResourceEntry> | undefined {
		const canonical = this.canonicalResourcePath(path)
		return this.entries.get(canonical)
	}

	public peekResource(
		path: string,
		options?: { variant?: ImageResourceVariant },
	): LoadedResource | null {
		const canonical = this.canonicalResourcePath(path)
		const entry = this.entries.get(canonical)
		if (!entry) return null
		return this.buildLoadedResource(entry, options?.variant ?? DEFAULT_IMAGE_RESOURCE_VARIANT)
	}

	public retainDisplayedResource(
		path: string,
		resource: Pick<LoadedResource, "image" | "variant">,
	): () => void {
		if (this.destroyed || resource.variant === "full") return () => undefined

		const canonical = this.canonicalResourcePath(path)
		const entry = this.entries.get(canonical)
		const retainedResource = entry ? this.findResourceByLoadedResource(entry, resource) : null
		if (!entry || !retainedResource || retainedResource.closed) return () => undefined

		retainedResource.displayRetainCount = (retainedResource.displayRetainCount ?? 0) + 1
		let released = false

		return () => {
			if (released) return
			released = true
			retainedResource.displayRetainCount = Math.max(
				0,
				(retainedResource.displayRetainCount ?? 0) - 1,
			)
			if (retainedResource.displayRetainCount > 0 || retainedResource.closed) return

			const currentEntry = this.entries.get(canonical)
			if (!currentEntry || this.isResourceStillReferenced(currentEntry, retainedResource)) {
				return
			}

			this.closeResource(retainedResource, {
				path: canonical,
				reason: "display-retain-release",
			})
		}
	}

	public getFailureReason(path: string): ResourceLoadFailureReason | null {
		const canonical = this.urlLifecycle.getCanonicalFromAlias(path)
		return this.entries.get(canonical)?.lastFailureReason ?? null
	}

	public getSnapshot(): ImageResourceSnapshot {
		let smallLoaded = 0
		let smallDecodedBytes = 0
		let overviewLoaded = 0
		let overviewDecodedBytes = 0
		let previewLoaded = 0
		let previewDecodedBytes = 0
		let fullLoaded = 0
		let fullDecodedBytes = 0
		let fullRetainCount = 0
		let loadingCount = 0
		let exchangingCount = 0
		let fullLoadingCount = 0

		this.entries.forEach((entry) => {
			for (const variant of MEDIA_DISPLAY_RESOURCE_VARIANTS) {
				const resource = this.getDisplayResource(entry, variant)
				if (!resource) continue
				const decodedBytes = this.getDecodedBytes(resource)
				switch (variant) {
					case "small":
						smallLoaded += 1
						smallDecodedBytes += decodedBytes
						break
					case "overview":
						overviewLoaded += 1
						overviewDecodedBytes += decodedBytes
						break
					case "preview":
						previewLoaded += 1
						previewDecodedBytes += decodedBytes
						break
				}
			}
			if (entry.fullResource) {
				fullLoaded += 1
				fullDecodedBytes += this.getDecodedBytes(entry.fullResource)
			}
			if (entry.exchangePromise) exchangingCount += 1
			for (const variant of MEDIA_DISPLAY_RESOURCE_VARIANTS) {
				if (this.getDisplayLoadingPromise(entry, variant)) loadingCount += 1
			}
			if (entry.fullLoadingPromise) fullLoadingCount += 1
			fullRetainCount += entry.fullRetainCount
		})
		const bodyCacheSnapshot = this.bodyCache.getSnapshot(this.entries.values())

		const current: ImageResourceCurrentSnapshot = {
			managerInstanceId: this.managerInstanceId,
			destroyed: this.destroyed,
			entries: this.entries.size,
			smallLoaded,
			smallDecodedBytes,
			overviewLoaded,
			overviewDecodedBytes,
			previewLoaded,
			previewDecodedBytes,
			fullLoaded,
			fullDecodedBytes,
			fullRetainCount,
			...bodyCacheSnapshot,
			activePreviewLoadPipelineCount: this.activePreviewLoadPipelineCount,
			queuedPreviewLoadCount: this.previewLoadQueue.length,
			activeDecodePixelCost: this.decodePixelBudgetGate.activePixelCost,
			queuedDecodePermitCount: this.decodePixelBudgetGate.queuedCount,
			loadingCount,
			exchangingCount,
			fullLoadingCount,
		}
		return buildImageResourceSnapshot(current, this.diagnostics.snapshot())
	}

	public async ensureFreshOssInfo(
		path: string,
		options?: {
			forceRefresh?: boolean
			allowCachedFallback?: boolean
		},
	): Promise<ResolvedImageOssInfo | null> {
		if (this.destroyed) {
			return null
		}
		const normalizedSrc = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedSrc)
		return this.urlLifecycle.ensureFreshOssInfo(path, entry, options)
	}

	public async ensureFreshOssSrc(
		path: string,
		options?: {
			forceRefresh?: boolean
			allowCachedFallback?: boolean
		},
	): Promise<string | null> {
		return (await this.ensureFreshOssInfo(path, options))?.ossSrc ?? null
	}

	public async refreshResource(path: string): Promise<boolean> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return false
		}
		this.diagnostics.increment("refreshResourceCount")
		const normalizedSrc = this.canonicalResourcePath(path)
		if (!normalizedSrc) return false

		const entry = this.getOrCreateEntry(normalizedSrc)
		for (const variant of MEDIA_DISPLAY_RESOURCE_VARIANTS) {
			await this.getDisplayLoadingPromise(entry, variant)?.catch(() => null)
		}
		if (entry.fullLoadingPromise) {
			await entry.fullLoadingPromise.catch(() => null)
		}
		const previousDisplaySlots = this.cloneDisplayResourceSlots(entry)
		const previousSmallResource = previousDisplaySlots.small.resource
		const previousOverviewResource = previousDisplaySlots.overview.resource
		const previousResource = previousDisplaySlots.preview.resource
		const previousFullResource = entry.fullResource
		const previousFullRetainCount = entry.fullRetainCount
		const previousOssSrc = entry.ossSrc
		const previousExpiresAt = entry.expiresAt
		const previousBodyState = this.bodyCache.captureState(entry)
		const previousOssSrcFromCachedFallback = entry.ossSrcFromCachedFallback
		const previousSourceUrl = entry.sourceUrl
		const previousSource = entry.source
		const previousFileName = entry.fileName
		const previousResourceVersion = entry.resourceVersion
		const previousSourceUpdatedAt = entry.sourceUpdatedAt
		const previousContentLength = entry.contentLength
		const restorePreviousResourceState = () => {
			entry.ossSrc = previousOssSrc
			entry.expiresAt = previousExpiresAt
			entry.ossSrcFromCachedFallback = previousOssSrcFromCachedFallback
			entry.sourceUrl = previousSourceUrl
			entry.source = previousSource
			entry.fileName = previousFileName
			entry.resourceVersion = previousResourceVersion
			entry.sourceUpdatedAt = previousSourceUpdatedAt
			entry.contentLength = previousContentLength
			this.restoreDisplayResourceSlots(entry, previousDisplaySlots)
			entry.fullResource = previousFullResource
			entry.fullRetainCount = previousFullRetainCount
			this.bodyCache.restoreState(entry, previousBodyState)
		}
		const clearDeletedResourceMetadata = () => {
			entry.sourceUrl = null
			entry.source = undefined
			entry.fileName = undefined
			entry.resourceVersion = null
			entry.sourceUpdatedAt = null
			entry.contentLength = null
		}
		entry.ossSrc = null
		entry.ossSrcFromCachedFallback = false
		entry.expiresAt = null
		this.clearDisplayResources(entry)
		entry.fullResource = null
		entry.fullRetainCount = 0
		this.clearEntryBody(entry)
		this.clearEntryBodyPromise(entry)

		this.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
			path: normalizedSrc,
			mediaType: "image",
		})

		const ossSrc = await this.exchangeOssSrc(path, entry, { forceRefresh: true })
		if (this.destroyed) return false
		if (!ossSrc) {
			const reason = entry.lastFailureReason ?? "not-found"
			// 附件已删除（同路径无文件）：禁止恢复旧位图，否则画布仍显示已删文件内容
			if (reason === "not-found") {
				this.closeResource(previousSmallResource, {
					path: normalizedSrc,
					reason: "refresh-deleted",
				})
				this.closeResource(previousOverviewResource, {
					path: normalizedSrc,
					reason: "refresh-deleted",
				})
				this.closeResource(previousResource, {
					path: normalizedSrc,
					reason: "refresh-deleted",
				})
				if (
					previousFullResource !== previousResource &&
					previousFullResource !== previousOverviewResource &&
					previousFullResource !== previousSmallResource
				) {
					this.closeResource(previousFullResource, {
						path: normalizedSrc,
						reason: "refresh-deleted",
					})
				}
				this.clearDisplayResources(entry)
				entry.fullResource = null
				clearDeletedResourceMetadata()
			} else {
				restorePreviousResourceState()
			}
			this.canvas.eventEmitter.emit({
				type: "resource:image:load-failed",
				data: {
					path: normalizedSrc,
					reason,
				},
			})
			return false
		}

		const loaded = await this.loadImageResource(
			normalizedSrc,
			ossSrc,
			entry,
			DEFAULT_IMAGE_RESOURCE_VARIANT,
		)
		if (loaded) {
			this.closeResource(previousSmallResource, {
				path: normalizedSrc,
				reason: "refresh-replaced",
			})
			this.closeResource(previousOverviewResource, {
				path: normalizedSrc,
				reason: "refresh-replaced",
			})
			this.closeResource(previousResource, {
				path: normalizedSrc,
				reason: "refresh-replaced",
			})
			if (
				previousFullResource !== previousResource &&
				previousFullResource !== previousOverviewResource &&
				previousFullResource !== previousSmallResource
			) {
				this.closeResource(previousFullResource, {
					path: normalizedSrc,
					reason: "refresh-replaced",
				})
			}
			return true
		}

		restorePreviousResourceState()
		this.canvas.eventEmitter.emit({
			type: "resource:image:load-failed",
			data: {
				path: normalizedSrc,
				reason: entry.lastFailureReason ?? "load-error",
			},
		})
		return false
	}

	private triggerBackgroundMetadataRefresh(
		path: string,
		normalizedSrc: string,
		entry: ImageResourceEntry,
	): void {
		this.urlLifecycle.triggerBackgroundMetadataRefresh(path, normalizedSrc, entry)
	}

	private handleImageResourceDeleted(normalizedSrc: string, entry: ImageResourceEntry): void {
		this.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
			path: normalizedSrc,
			mediaType: "image",
		})
		this.closeEntryResources(entry)
		entry.ossSrc = null
		entry.ossSrcFromCachedFallback = false
		entry.sourceUrl = null
		entry.expiresAt = null
		entry.resourceVersion = null
		entry.sourceUpdatedAt = null
		entry.contentLength = null
		this.canvas.eventEmitter.emit({
			type: "resource:image:load-failed",
			data: { path: normalizedSrc, reason: "not-found" },
		})
	}

	private async loadCachedImageResource(
		path: string,
		normalizedSrc: string,
		entry: ImageResourceEntry,
		variant: ImageResourceVariant,
	): Promise<LoadedResource | null> {
		if (this.destroyed) return null
		const cached = await this.urlLifecycle.getCachedResource(path, entry)
		if (!cached?.url) return null
		if (this.getResourceForVariant(entry, variant)) {
			return this.buildLoadedResource(entry, variant)
		}

		const result = await this.loadImageResource(normalizedSrc, cached.url, entry, variant)
		if (
			!result &&
			this.canvas.mediaResourceOfflineCacheManager.isVirtualResourceUrl(entry.ossSrc)
		) {
			entry.ossSrc = null
			entry.ossSrcFromCachedFallback = false
		}
		return result
	}

	/**
	 * 清除过期的 ossSrc（保留 resource，仅清除 URL 以便重新换取）
	 */
	private clearExpiredOssSrc(entry: ImageResourceEntry): void {
		this.urlLifecycle.clearExpiredOssSrc(entry)
	}

	private applyVirtualResourceBypass(entry: ImageResourceEntry): void {
		this.urlLifecycle.applyVirtualResourceBypass(entry)
	}

	/**
	 * 换取 ossSrc（内部方法）
	 * @param path 路径（path）
	 * @param entry 资源条目
	 * @returns Promise<string | null> ossSrc 或 null
	 */
	private async exchangeOssSrc(
		path: string,
		entry: ImageResourceEntry,
		options?: { forceRefresh?: boolean; bypassVirtualResource?: boolean },
	): Promise<string | null> {
		return this.urlLifecycle.exchangeOssSrc(path, entry, options)
	}

	private getMaxEdgeForVariant(variant: ImageResourceVariant): number | undefined {
		return getImageResourceMaxEdge(variant)
	}

	private getDecodePriorityForVariant(
		variant: ImageResourceVariant,
		priority?: ImageResourceLoadPriority,
	): ImageResourceLoadPriority {
		if (priority) return priority
		return variant === "full" ? "critical" : variant === "preview" ? "visible" : "background"
	}

	private getBodyFetchPriorityForVariant(
		variant: ImageResourceVariant,
		priority?: ImageResourceLoadPriority,
	): ImageResourceLoadPriority {
		if (priority) return priority
		return variant === "full" ? "critical" : variant === "preview" ? "visible" : "near"
	}

	private estimateTargetDecodePixels(
		width: number,
		height: number,
		variant: ImageResourceVariant,
	): number {
		return estimateScaledPixelCost(width, height, this.getMaxEdgeForVariant(variant))
	}

	private getFallbackDecodePixelCost(variant: ImageResourceVariant): number {
		return getFallbackDecodePixelCost(
			this.getMaxEdgeForVariant(variant),
			DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
		)
	}

	private async estimateImageDecodePixelCost(
		body: MediaResourceBody,
		variant: ImageResourceVariant,
	): Promise<number> {
		try {
			const dimensions = await parseImageDimensionsFromBlobHeader(body.blob)
			if (!dimensions) return this.getFallbackDecodePixelCost(variant)
			return this.estimateTargetDecodePixels(dimensions.width, dimensions.height, variant)
		} catch {
			return this.getFallbackDecodePixelCost(variant)
		}
	}

	private async loadImageBody(
		path: string,
		ossSrc: string,
		entry: ImageResourceEntry,
		variant: ImageResourceVariant,
		priority?: ImageResourceLoadPriority,
		retryCount = 0,
	): Promise<MediaResourceBody | null> {
		if (this.destroyed) {
			return null
		}
		const cacheKey = this.getBodyCacheKey(path, ossSrc, entry)
		const cachedBody = this.getReusableBody(entry, ossSrc, cacheKey)
		if (cachedBody) {
			this.diagnostics.increment("bodyCacheHitCount")
			return cachedBody
		}

		const inFlightBody = this.bodyCache.getInFlight(entry, cacheKey)
		if (inFlightBody) {
			this.diagnostics.increment("bodyFetchDedupedCount")
			return inFlightBody
		}

		const abortController = this.bodyCache.createAbortController()
		const bodyFetchPriority = this.getBodyFetchPriorityForVariant(variant, priority)
		const promise = this.canvas.resourceScheduler.run(
			"image:body-fetch",
			async (): Promise<MediaResourceBody | null> => {
				this.diagnostics.increment("bodyFetchAttemptCount")
				try {
					if (this.destroyed) {
						return null
					}
					const response = await fetch(ossSrc, {
						cache: "default",
						signal: abortController.signal,
					})
					if (this.destroyed) {
						return null
					}
					if (!response.ok) {
						const needsReExchange = response.status === 401 || response.status === 403
						if (needsReExchange) {
							this.setFailureReason(entry, "load-error")
							entry.ossSrc = null
							entry.ossSrcFromCachedFallback = false
							entry.expiresAt = null
							this.clearEntryBody(entry)
							const fallbackOssSrc = await this.resolveVirtualResourceFallbackOssSrc(
								path,
								ossSrc,
								entry,
								retryCount,
							)
							if (this.destroyed) return null
							const newOssSrc =
								fallbackOssSrc ??
								(retryCount === 0 ? await this.exchangeOssSrc(path, entry) : null)
							if (this.destroyed) return null
							if (newOssSrc) {
								return this.loadImageBody(
									path,
									newOssSrc,
									entry,
									variant,
									priority,
									retryCount + 1,
								)
							}
						} else {
							this.setFailureReason(
								entry,
								getFailureReasonFromStatusCode(response.status),
							)
						}
						this.diagnostics.increment("bodyFetchFailedCount")
						return null
					}

					const blob = await response.blob()
					if (this.destroyed) {
						return null
					}
					const body: MediaResourceBody = {
						blob,
						ossSrc,
						cacheKey,
						byteSize: blob.size,
					}
					this.bodyCache.storeBody(entry, body)
					this.setFailureReason(entry, null)
					this.canvas.mediaResourceOfflineCacheManager.recordVirtualResourceLoadSuccess(
						ossSrc,
					)
					this.evictBodyCacheBudget(entry)
					this.diagnostics.increment("bodyFetchSuccessCount")
					return body
				} catch (error) {
					if (this.isAbortError(error)) {
						return null
					}
					const fallbackOssSrc = await this.resolveVirtualResourceFallbackOssSrc(
						path,
						ossSrc,
						entry,
						retryCount,
					)
					if (this.destroyed) return null
					if (fallbackOssSrc) {
						return this.loadImageBody(
							path,
							fallbackOssSrc,
							entry,
							variant,
							priority,
							retryCount + 1,
						)
					}
					this.setFailureReason(entry, "load-error")
					this.diagnostics.increment("bodyFetchFailedCount")
					return null
				} finally {
					this.bodyCache.releaseAbortController(abortController)
				}
			},
			{
				source: "image-resource:body-fetch",
				canvasId: this.canvas.id,
				managerInstanceId: this.managerInstanceId,
				path,
				variant,
				cacheKey,
				url: ossSrc,
				priority: bodyFetchPriority,
			},
		)

		this.bodyCache.setInFlight(entry, cacheKey, promise)

		try {
			return await promise
		} finally {
			this.bodyCache.clearInFlightIfCurrent(entry, promise)
		}
	}

	/**
	 * 加载图片资源：压缩 body 在主线程 entry 级去重/缓存，worker 只负责按 variant 解码。
	 * - 优先：Worker 返回 ImageBitmap，通过 transferable 实现零拷贝传输
	 * - 降级：Worker 返回 Blob，主线程使用 createImageSourceFromBlob 创建 ImageSource
	 */
	private async loadImageResource(
		path: string,
		ossSrc: string,
		entry: ImageResourceEntry,
		variant: ImageResourceVariant,
		priority?: ImageResourceLoadPriority,
		retryCount = 0,
	): Promise<LoadedResource | null> {
		const body = await this.loadImageBody(path, ossSrc, entry, variant, priority, retryCount)
		if (!body) return null
		if (this.destroyed) {
			return null
		}

		const decodePixelCost = await this.estimateImageDecodePixelCost(body, variant)
		const decodePriority = this.getDecodePriorityForVariant(variant, priority)
		const releaseDecodePermit = await this.acquireImageDecodePermit(
			decodePixelCost,
			decodePriority,
		)
		if (this.destroyed) {
			releaseDecodePermit()
			return null
		}

		const requestId = this.createWorkerRequestId("img")
		try {
			this.diagnostics.increment("decodeAttemptCount")
			const result = await this.canvas.resourceScheduler.run(
				"image:decode",
				() =>
					this.sendToWorker({
						ossSrc: body.ossSrc,
						blob: body.blob,
						requestId,
						variant,
						maxEdge: this.getMaxEdgeForVariant(variant),
						includeThumbnail: variant === "preview",
					}),
				{
					source: "image-resource:decode",
					canvasId: this.canvas.id,
					managerInstanceId: this.managerInstanceId,
					path,
					variant,
					cacheKey: body.cacheKey,
					url: body.ossSrc,
					priority: decodePriority,
				},
			)
			if (this.destroyed) {
				if (result?.imageSource) closeImageSource(result.imageSource)
				return null
			}

			if (!result?.imageInfo) {
				this.setFailureReason(entry, getFailureReasonFromStatusCode(result?.statusCode))
				this.diagnostics.increment("decodeFailedCount")
				return null
			}

			let image: ImageSource | null = null

			if (result.imageSource) {
				// 优先：直接使用从 Worker 传递过来的 ImageBitmap（已通过 transferable 零拷贝传输）
				image = result.imageSource
			} else if (result.blob) {
				// 降级：Worker 不支持 ImageBitmap，返回了 Blob
				if (this.destroyed) {
					return null
				}
				image = await createImageSourceFromBlob(result.blob)
				if (!image) {
					this.setFailureReason(entry, "load-error")
					this.diagnostics.increment("decodeFailedCount")
					return null
				}
			} else {
				this.setFailureReason(entry, getFailureReasonFromStatusCode(result?.statusCode))
				this.diagnostics.increment("decodeFailedCount")
				return null
			}

			if (this.destroyed) {
				if (image) closeImageSource(image)
				return null
			}

			const { width: sourceWidth, height: sourceHeight } = getImageSourceDimensions(image)
			const resourceVariant = result.variant ?? variant
			const resource: ImageResource = {
				ossSrc: body.ossSrc,
				image,
				imageInfo: result.imageInfo,
				thumbnailData: result.thumbnails ?? this.getFallbackThumbnailData(entry),
				variant: resourceVariant,
				sourceWidth,
				sourceHeight,
				isFullSize: this.isFullSizeResource(result.imageInfo, sourceWidth, sourceHeight),
				displayRetainCount: 0,
				closed: false,
			}
			let previousResourceToClose: ImageResource | null = null
			if (variant === "full") {
				const previousFullResource = entry.fullResource
				entry.fullResource = resource
				previousResourceToClose =
					previousFullResource &&
					previousFullResource !== resource &&
					!this.isResourceStillReferenced(entry, previousFullResource)
						? previousFullResource
						: null
			} else if (variant === "small") {
				previousResourceToClose = this.setDisplayResource(entry, "small", resource, {
					closePrevious: false,
				})
			} else if (variant === "overview") {
				previousResourceToClose = this.setDisplayResource(entry, "overview", resource, {
					closePrevious: false,
				})
			} else {
				previousResourceToClose = this.setDisplayResource(entry, "preview", resource, {
					closePrevious: false,
				})
			}
			this.setFailureReason(entry, null)

			const loadedResource: LoadedResource = {
				ossSrc: body.ossSrc,
				image,
				imageInfo: result.imageInfo,
				thumbnail: resource.thumbnailData,
				variant: resource.variant,
				sourceWidth,
				sourceHeight,
				isFullSize: resource.isFullSize,
			}

			if (variant !== "full") {
				this.canvas.eventEmitter.emit({
					type: "resource:image:loaded",
					data: { path, resource: loadedResource },
				})
			}
			if (
				previousResourceToClose &&
				previousResourceToClose !== resource &&
				!this.isResourceStillReferenced(entry, previousResourceToClose)
			) {
				this.closeResourceAfterConsumersSwap(previousResourceToClose, {
					path,
					reason: "resource-replaced",
				})
			}

			this.diagnostics.increment("decodeSuccessCount")
			return loadedResource
		} catch (error) {
			if (this.destroyed) {
				return null
			}
			this.setFailureReason(entry, "load-error")
			this.diagnostics.increment("decodeFailedCount")
			return null
		} finally {
			releaseDecodePermit()
		}
	}

	private async resolveVirtualResourceFallbackOssSrc(
		path: string,
		ossSrc: string,
		entry: ImageResourceEntry,
		retryCount: number,
	): Promise<string | null> {
		return this.urlLifecycle.resolveVirtualResourceFallbackOssSrc(
			path,
			ossSrc,
			entry,
			retryCount,
		)
	}

	private createEntry(): ImageResourceEntry {
		return {
			ossSrc: null,
			ossSrcFromCachedFallback: false,
			sourceUrl: null,
			expiresAt: null,
			resourceVersion: null,
			sourceUpdatedAt: null,
			contentLength: null,
			exchangePromise: null,
			fullLoadingPromise: null,
			bodyPromise: null,
			bodyPromiseCacheKey: null,
			backgroundRefreshPromise: null,
			displaySlots: this.createDisplayResourceSlots(),
			fullResource: null,
			fullRetainCount: 0,
			bodyBlob: null,
			bodyOssSrc: null,
			bodyCacheKey: null,
			bodyByteSize: 0,
			bodyLastAccessAt: 0,
			lastFailureReason: null,
		}
	}

	private getOrCreateEntry(normalizedPath: string): ImageResourceEntry {
		let entry = this.entries.get(normalizedPath)
		if (!entry) {
			entry = this.createEntry()
			this.entries.set(normalizedPath, entry)
		}
		return entry
	}

	/**
	 * 预填充缓存（用于上传等已有 ossSrc 的场景，避免重复换取）
	 * @param path 路径（path）
	 * @param fileInfo 文件信息
	 */
	public primeCache(
		path: string,
		fileInfo: Pick<
			GetFileInfoResponse,
			| "src"
			| "expires_at"
			| "fileName"
			| "source"
			| "resource_version"
			| "updated_at"
			| "content_length"
		>,
	): void {
		const normalizedSrc = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedSrc)
		this.urlLifecycle.primeCache(path, entry, fileInfo)
		this.setFailureReason(entry, null)
	}

	/**
	 * 调度资源清理（防抖版本）
	 * 在短时间内多次调用时，只执行最后一次
	 */
	private scheduleCleanup(): void {
		// 清除之前的定时器
		if (this.cleanupTimer) {
			clearTimeout(this.cleanupTimer)
		}

		// 设置新的定时器
		this.cleanupTimer = setTimeout(() => {
			void this.checkAndCleanupResources()
			this.cleanupTimer = null
		}, this.CLEANUP_DEBOUNCE_DELAY)
	}

	/**
	 * 检查并清理未使用的资源
	 * 遍历所有元素，收集所有使用的图片路径，然后检查资源是否仍在使用
	 */
	private async checkAndCleanupResources(): Promise<void> {
		// 清除防抖定时器（如果存在）
		if (this.cleanupTimer) {
			clearTimeout(this.cleanupTimer)
			this.cleanupTimer = null
		}
		// 获取所有存在的元素
		const elementsDict = this.canvas.elementManager.getElementsDict()

		// 收集所有正在使用的图片路径（包括主图片和参考图）
		const usedPaths = new Set<string>()

		for (const elementData of Object.values(elementsDict)) {
			if (elementData.type === ElementTypeEnum.Image) {
				const imageElement = elementData as ImageElementData

				// 添加主图片路径
				if (imageElement.src) {
					usedPaths.add(this.canonicalResourcePath(imageElement.src))
				}

				// 添加参考图路径
				const elementInstance = this.canvas.elementManager.getElementInstance(
					elementData.id,
				)
				if (elementInstance && elementInstance instanceof ImageElement) {
					const referenceImageInfos = elementInstance.getReferenceImageInfos()
					for (const info of referenceImageInfos) {
						usedPaths.add(this.canonicalResourcePath(info.path))
					}
				}
			}
		}

		// 遍历所有资源条目，检查是否仍在使用
		this.entries.forEach((entry, src) => {
			if (usedPaths.has(src)) return

			if (
				this.getDisplayResource(entry, "small") ||
				this.getDisplayResource(entry, "overview") ||
				this.getDisplayResource(entry, "preview") ||
				entry.fullResource ||
				this.bodyCache.hasBody(entry)
			) {
				this.closeEntryResources(entry)
				this.canvas.eventEmitter.emit({
					type: "resource:released",
					data: { path: src },
				})
			}

			entry.ossSrc = null
			entry.ossSrcFromCachedFallback = false
			entry.expiresAt = null
			this.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
				path: src,
				mediaType: "image",
			})
			if (
				!entry.exchangePromise &&
				!this.getDisplayLoadingPromise(entry, "preview") &&
				!this.getDisplayLoadingPromise(entry, "small") &&
				!this.getDisplayLoadingPromise(entry, "overview") &&
				!entry.fullLoadingPromise
			) {
				this.entries.delete(src)
			}
		})
	}

	/**
	 * 销毁管理器
	 */
	public destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		const pendingError = new Error("ImageResourceManager destroyed")
		this.previewLoadQueue.forEach((item) => {
			item.resolve(null)
		})
		this.previewLoadQueue = []
		this.previewLoadQueueByKey.clear()
		this.decodePixelBudgetGate.destroy()
		if (this.cleanupTimer) {
			clearTimeout(this.cleanupTimer)
			this.cleanupTimer = null
		}
		this.bodyCache.abortAll()
		this.workerWarmupPromise = null
		this.workerClient?.release(pendingError)
		this.workerClient = null
		// 释放所有 ImageBitmap 资源
		this.entries.forEach((entry) => {
			this.closeEntryResources(entry)
		})
		this.entries.clear()
		this.canvas.eventEmitter.off("element:deleted", this.handleElementDeleted)
		this.canvas.eventEmitter.off("element:batchdeleted", this.handleBatchDeleted)
		this.canvas.eventEmitter.off("canvas:clear", this.handleCanvasClear)
		this.canvas.eventEmitter.off("referenceImages:changed", this.handleReferenceImagesChanged)
	}
}
