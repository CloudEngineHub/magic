import type { Canvas } from "../../core/Canvas"
import type { AttachmentSourceEnum, GetFileInfoResponse } from "../../../public/magic-types"
import { ElementTypeEnum } from "../../document/types"
import type { ResourceLoadFailureReason } from "../media-common/resourceLoadFailure"
import {
	buildVideoResourceSnapshot,
	createVideoResourceDiagnostics,
	type VideoResourceCurrentSnapshot,
	type VideoResourceFailureInfo,
	type VideoResourceSnapshot,
} from "../diagnostics/CanvasResourceDiagnostics"
import {
	MediaResourceUrlLifecycle,
	type MediaResourceUrlEntry,
} from "../offline-cache/MediaResourceUrlLifecycle"
import { VideoPreviewLoader, type VideoPreviewMediaDiag } from "./VideoPreviewLoader"

/** 视频解码后的元信息（时长与原始像素尺寸） */
export interface LoadedVideoMetadata {
	/** 时长（秒） */
	duration: number
	/** 视频轨像素宽度 */
	videoWidth: number
	/** 视频轨像素高度 */
	videoHeight: number
}

/** 海报位图来源：由 VideoResourceManager 绘制到 canvas，供 Konva.Image 使用 */
export type VideoPosterSource = HTMLCanvasElement

/** 已解析的可播放地址 + 首帧海报 + 元数据 */
export interface LoadedVideoResource {
	/** 带签名的可播放 URL（可能过期，需结合 ensureFreshOssSrc） */
	ossSrc: string
	poster: VideoPosterSource
	metadata: LoadedVideoMetadata
}

export interface ResolvedVideoOssInfo {
	ossSrc: string
	expiresAt: number | null
}

interface VideoResource {
	poster: VideoPosterSource
	metadata: LoadedVideoMetadata
}

interface ResourceEntry extends MediaResourceUrlEntry {
	ossSrc: string | null
	ossSrcFromCachedFallback: boolean
	sourceUrl: string | null
	expiresAt: number | null
	source?: AttachmentSourceEnum
	fileName?: string
	resourceVersion: string | null
	sourceUpdatedAt: string | null
	contentLength: number | null
	exchangePromise: Promise<string | null> | null
	loadingPromise: Promise<LoadedVideoResource | null> | null
	resource: VideoResource | null
	backgroundRefreshPromise: Promise<void> | null
	lastFailureReason: ResourceLoadFailureReason | null
}

const MAX_FAILED_RESOURCE_DEBUG_ITEMS = 20
const VIDEO_PREVIEW_LOAD_TIMEOUT_MS = 15_000
const VIDEO_PREVIEW_LOAD_CONCURRENCY = 3

/**
 * 按项目 path 缓存视频：换链、解码首帧海报、合并重复加载请求
 */
export class VideoResourceManager {
	private static instanceIdSeed = 0

	private canvas: Canvas
	private readonly managerInstanceId = ++VideoResourceManager.instanceIdSeed
	private destroyed = false
	private diagnostics = createVideoResourceDiagnostics()
	private entries: Map<string, ResourceEntry> = new Map()
	private urlLifecycle!: MediaResourceUrlLifecycle<ResourceEntry>
	private previewLoader!: VideoPreviewLoader
	private cleanupTimer: ReturnType<typeof setTimeout> | null = null
	private readonly CLEANUP_DEBOUNCE_DELAY = 100

	private readonly handleElementDeleted = () => {
		this.scheduleCleanup()
	}

	private readonly handleBatchDeleted = () => {
		void this.checkAndCleanupResources()
	}

	private readonly handleCanvasClear = () => {
		void this.checkAndCleanupResources()
	}

	private setFailureReason(entry: ResourceEntry, reason: ResourceLoadFailureReason | null): void {
		entry.lastFailureReason = reason
	}

	private markStaleRequestDrop(): void {
		this.diagnostics.increment("staleRequestDropCount")
	}

	private canonicalResourcePath(path: string): string {
		return this.urlLifecycle.canonicalResourcePath(path)
	}

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.urlLifecycle = new MediaResourceUrlLifecycle<ResourceEntry>({
			canvas: this.canvas,
			mediaType: "video",
			useImageProcess: false,
			isDestroyed: () => this.destroyed,
			onStaleRequestDrop: () => this.markStaleRequestDrop(),
			setFailureReason: (entry, reason) => this.setFailureReason(entry, reason),
			onResourceDeleted: (normalizedPath, entry) =>
				this.handleVideoResourceDeleted(normalizedPath, entry),
			refreshResource: (path) => this.refreshResource(path),
			incrementDiagnostic: (counter) => this.diagnostics.increment(counter),
		})
		this.previewLoader = new VideoPreviewLoader({
			concurrency: VIDEO_PREVIEW_LOAD_CONCURRENCY,
			timeoutMs: VIDEO_PREVIEW_LOAD_TIMEOUT_MS,
			isDestroyed: () => this.destroyed,
			onStaleRequestDrop: () => this.markStaleRequestDrop(),
			onAbort: () => this.diagnostics.increment("previewLoadAbortCount"),
			onTimeout: () => this.diagnostics.increment("previewLoadTimeoutCount"),
		})
		this.canvas.eventEmitter.on("element:deleted", this.handleElementDeleted)
		this.canvas.eventEmitter.on("element:batchdeleted", this.handleBatchDeleted)
		this.canvas.eventEmitter.on("canvas:clear", this.handleCanvasClear)
	}

	/** 触发后台加载（不等待完成），用于预热 */
	public loadResource(path: string): void {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return
		}
		this.loadVideoInternal(path).catch((error) => {
			void error
		})
	}

	/** 等待加载完成，返回可播放 URL 与海报（通用入口） */
	public async getResource(path: string): Promise<LoadedVideoResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		return this.loadVideoInternal(path)
	}

	/** 与 getResource 相同实现，语义上用于画布预览场景 */
	public async getPreviewResource(path: string): Promise<LoadedVideoResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		return this.loadVideoInternal(path)
	}

	public async ensureFreshOssInfo(
		path: string,
		options?: {
			forceRefresh?: boolean
			bypassVirtualResource?: boolean
			allowCachedFallback?: boolean
		},
	): Promise<ResolvedVideoOssInfo | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (this.canvas.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path)) {
			return null
		}
		const normalizedPath = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedPath)
		return this.urlLifecycle.ensureFreshOssInfo(path, entry, options)
	}

	/** 若缓存过期则重新换链，返回当前可用的 ossSrc */
	public async ensureFreshOssSrc(
		path: string,
		options?: {
			forceRefresh?: boolean
			bypassVirtualResource?: boolean
			allowCachedFallback?: boolean
		},
	): Promise<string | null> {
		return (await this.ensureFreshOssInfo(path, options))?.ossSrc ?? null
	}

	public getFailureReason(path: string): ResourceLoadFailureReason | null {
		const canonical = this.urlLifecycle.getCanonicalFromAlias(path)
		return this.entries.get(canonical)?.lastFailureReason ?? null
	}

	public getSnapshot(): VideoResourceSnapshot {
		let loaded = 0
		let loading = 0
		let exchanging = 0
		let failed = 0
		let posterCanvasBytes = 0
		const failureReasonCounts: Record<ResourceLoadFailureReason, number> = {
			"not-found": 0,
			"load-error": 0,
		}
		const failedResources: VideoResourceFailureInfo[] = []

		this.entries.forEach((entry, path) => {
			if (entry.resource) {
				loaded += 1
				posterCanvasBytes +=
					Math.max(0, entry.resource.poster.width) *
					Math.max(0, entry.resource.poster.height) *
					4
			}
			if (entry.loadingPromise) loading += 1
			if (entry.exchangePromise) exchanging += 1
			if (entry.lastFailureReason) {
				failed += 1
				failureReasonCounts[entry.lastFailureReason] += 1
				if (failedResources.length < MAX_FAILED_RESOURCE_DEBUG_ITEMS) {
					failedResources.push({
						path,
						reason: entry.lastFailureReason,
						source: entry.source,
						fileName: entry.fileName,
						resourceVersion: entry.resourceVersion,
						sourceUpdatedAt: entry.sourceUpdatedAt,
						contentLength: entry.contentLength,
						hasOssSrc: !!entry.ossSrc,
						hasSourceUrl: !!entry.sourceUrl,
					})
				}
			}
		})

		const current: VideoResourceCurrentSnapshot = {
			managerInstanceId: this.managerInstanceId,
			destroyed: this.destroyed,
			entries: this.entries.size,
			loaded,
			loading,
			exchanging,
			failed,
			failureReasonCounts,
			failedResources,
			failedResourcesTruncated: failed > failedResources.length,
			posterCanvasBytes,
			activePreviewLoadCount: this.previewLoader.activeCount,
			queuedPreviewLoadCount: this.previewLoader.queuedCount,
		}
		return buildVideoResourceSnapshot(current, this.diagnostics.snapshot())
	}

	public async refreshResource(path: string): Promise<boolean> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return false
		}
		this.diagnostics.increment("refreshResourceCount")
		const normalizedPath = this.canonicalResourcePath(path)
		if (!normalizedPath) return false

		const entry = this.getOrCreateEntry(normalizedPath)
		if (entry.loadingPromise) {
			await entry.loadingPromise.catch(() => null)
		}
		return this.refreshVideoResourceFromNetwork(path, normalizedPath, entry, {
			forceRefresh: true,
		})
	}

	/** 用上传/生成结果直接写入缓存，跳过首次网络解码路径 */
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
		const normalizedPath = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedPath)
		this.urlLifecycle.primeCache(path, entry, fileInfo)
	}

	/** 读取当前缓存中的视频元信息；不触发换链与解码，供快速布局使用 */
	public getCachedMetadata(path: string): LoadedVideoMetadata | null {
		const canonical = this.urlLifecycle.getCanonicalFromAlias(path)
		const entry = this.entries.get(canonical)
		return entry?.resource?.metadata ?? null
	}

	/** 释放缓存与事件监听 */
	public destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		if (this.cleanupTimer) {
			clearTimeout(this.cleanupTimer)
			this.cleanupTimer = null
		}

		const pendingError = new Error("VideoResourceManager destroyed")
		this.previewLoader.destroy(pendingError)
		this.entries.forEach((entry) => {
			this.releaseResource(entry.resource)
		})
		this.entries.clear()
		this.canvas.eventEmitter.off("element:deleted", this.handleElementDeleted)
		this.canvas.eventEmitter.off("element:batchdeleted", this.handleBatchDeleted)
		this.canvas.eventEmitter.off("canvas:clear", this.handleCanvasClear)
	}

	private buildLoadedResource(entry: ResourceEntry): LoadedVideoResource | null {
		if (!entry.ossSrc || !entry.resource) {
			return null
		}
		this.setFailureReason(entry, null)

		return {
			ossSrc: entry.ossSrc,
			poster: entry.resource.poster,
			metadata: entry.resource.metadata,
		}
	}

	private getOrCreateEntry(normalizedPath: string): ResourceEntry {
		let entry = this.entries.get(normalizedPath)
		if (!entry) {
			entry = {
				ossSrc: null,
				ossSrcFromCachedFallback: false,
				sourceUrl: null,
				expiresAt: null,
				resourceVersion: null,
				sourceUpdatedAt: null,
				contentLength: null,
				exchangePromise: null,
				loadingPromise: null,
				backgroundRefreshPromise: null,
				resource: null,
				lastFailureReason: null,
			}
			this.entries.set(normalizedPath, entry)
		}
		return entry
	}

	private async loadVideoInternal(path: string): Promise<LoadedVideoResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (this.canvas.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path)) {
			return null
		}
		const normalizedPath = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedPath)
		this.clearExpiredOssSrc(entry)
		this.applyVirtualResourceBypass(entry)

		if (entry.resource) {
			this.diagnostics.increment("memoryHitCount")
			this.setFailureReason(entry, null)
			return this.buildLoadedResource(entry)
		}

		if (entry.loadingPromise) {
			this.diagnostics.increment("loadingDedupedCount")
			return entry.loadingPromise
		}

		const promise = this.loadVideoResourcePipeline(path, normalizedPath, entry)
		entry.loadingPromise = promise

		try {
			return await promise
		} finally {
			if (entry.loadingPromise === promise) {
				entry.loadingPromise = null
			}
		}
	}

	private async loadVideoResourcePipeline(
		path: string,
		normalizedPath: string,
		entry: ResourceEntry,
	): Promise<LoadedVideoResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		const cachedResource = await this.loadCachedVideoResource(path, normalizedPath, entry)
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (cachedResource) {
			this.triggerBackgroundMetadataRefresh(path, normalizedPath, entry)
			return cachedResource
		}
		this.clearCachedFallbackOssSrc(entry)

		const getFileInfo = this.canvas.magicConfigManager.config?.methods?.getFileInfo
		if (!getFileInfo) {
			this.setFailureReason(entry, "load-error")
			return null
		}

		const ossSrc = await this.ensureFreshOssSrc(path)
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (!ossSrc) {
			return null
		}

		return this.previewLoader.enqueue(() =>
			this.loadVideoResource(path, normalizedPath, ossSrc, entry),
		)
	}

	private clearExpiredOssSrc(entry: ResourceEntry): void {
		this.urlLifecycle.clearExpiredOssSrc(entry)
	}

	private clearCachedFallbackOssSrc(entry: ResourceEntry): void {
		this.urlLifecycle.clearCachedFallbackOssSrc(entry)
	}

	private applyVirtualResourceBypass(entry: ResourceEntry): void {
		this.urlLifecycle.applyVirtualResourceBypass(entry)
	}

	private triggerBackgroundMetadataRefresh(
		path: string,
		normalizedPath: string,
		entry: ResourceEntry,
	): void {
		this.urlLifecycle.triggerBackgroundMetadataRefresh(path, normalizedPath, entry)
	}

	private handleVideoResourceDeleted(normalizedPath: string, entry: ResourceEntry): void {
		this.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
			path: normalizedPath,
			mediaType: "video",
		})
		if (entry.resource) {
			this.releaseResource(entry.resource)
			entry.resource = null
		}
		entry.ossSrc = null
		entry.ossSrcFromCachedFallback = false
		entry.sourceUrl = null
		entry.expiresAt = null
		entry.resourceVersion = null
		entry.sourceUpdatedAt = null
		entry.contentLength = null
		this.canvas.eventEmitter.emit({
			type: "resource:video:load-failed",
			data: { path: normalizedPath, reason: "not-found" },
		})
	}

	private async exchangeOssSrc(
		path: string,
		entry: ResourceEntry,
		options?: { forceRefresh?: boolean; bypassVirtualResource?: boolean },
	): Promise<string | null> {
		return this.urlLifecycle.exchangeOssSrc(path, entry, options)
	}

	private async loadCachedVideoResource(
		path: string,
		normalizedPath: string,
		entry: ResourceEntry,
	): Promise<LoadedVideoResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		const cached = await this.urlLifecycle.getCachedResource(path, entry)
		if (!cached?.url) return null
		if (entry.resource) {
			return this.buildLoadedResource(entry)
		}

		const result = await this.previewLoader.enqueue(() =>
			this.loadVideoResource(path, normalizedPath, cached.url, entry),
		)
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (
			!result &&
			this.canvas.mediaResourceOfflineCacheManager.isVirtualResourceUrl(entry.ossSrc)
		) {
			entry.ossSrc = null
			entry.ossSrcFromCachedFallback = false
		}
		return result
	}

	private async refreshVideoResourceFromNetwork(
		path: string,
		normalizedPath: string,
		entry: ResourceEntry,
		options?: { forceRefresh?: boolean },
	): Promise<boolean> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return false
		}
		const previousOssSrc = entry.ossSrc
		const previousExpiresAt = entry.expiresAt
		const previousOssSrcFromCachedFallback = entry.ossSrcFromCachedFallback
		const previousSourceUrl = entry.sourceUrl
		const previousSource = entry.source
		const previousFileName = entry.fileName
		const previousResourceVersion = entry.resourceVersion
		const previousSourceUpdatedAt = entry.sourceUpdatedAt
		const previousContentLength = entry.contentLength
		const restorePreviousResourceMetadata = () => {
			entry.ossSrc = previousOssSrc
			entry.expiresAt = previousExpiresAt
			entry.ossSrcFromCachedFallback = previousOssSrcFromCachedFallback
			entry.sourceUrl = previousSourceUrl
			entry.source = previousSource
			entry.fileName = previousFileName
			entry.resourceVersion = previousResourceVersion
			entry.sourceUpdatedAt = previousSourceUpdatedAt
			entry.contentLength = previousContentLength
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

		if (options?.forceRefresh) {
			this.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
				path: normalizedPath,
				mediaType: "video",
			})
		}

		const ossSrc = await this.exchangeOssSrc(path, entry, options)
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return false
		}
		if (!ossSrc) {
			const isNotFound = entry.lastFailureReason === "not-found"
			// 附件已删除：丢弃旧 URL 与解码缓存，避免画布仍显示已删视频
			if (isNotFound) {
				const hadSurface = !!entry.resource || !!previousOssSrc || !!options?.forceRefresh
				if (entry.resource) {
					this.releaseResource(entry.resource)
					entry.resource = null
				}
				entry.ossSrc = null
				entry.ossSrcFromCachedFallback = false
				entry.expiresAt = null
				clearDeletedResourceMetadata()
				// 首次加载失败由 loadPreviewFromPath 处理；此处通知已有预览的实例切换错误态
				if (hadSurface) {
					this.canvas.eventEmitter.emit({
						type: "resource:video:load-failed",
						data: { path: normalizedPath, reason: "not-found" },
					})
				}
			} else {
				restorePreviousResourceMetadata()
			}
			return false
		}

		const previousResource = entry.resource
		entry.resource = null
		const loaded = await this.loadVideoResource(path, normalizedPath, ossSrc, entry)
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return false
		}
		if (loaded) {
			this.releaseResource(previousResource)
			this.canvas.eventEmitter.emit({
				type: "resource:video:refreshed",
				data: { path: normalizedPath, resource: loaded },
			})
			return true
		}
		entry.resource = previousResource
		restorePreviousResourceMetadata()
		return false
	}

	private async loadVideoResource(
		path: string,
		normalizedPath: string,
		ossSrc: string,
		entry: ResourceEntry,
		retryCount = 0,
	): Promise<LoadedVideoResource | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		this.diagnostics.increment("previewLoadAttemptCount")
		if (retryCount > 0) this.diagnostics.increment("previewLoadRetryCount")
		const mediaDiag: VideoPreviewMediaDiag = { code: null, message: null }
		const loaded = await this.canvas.resourceScheduler.run(
			"video:preview",
			() => this.previewLoader.extractPreviewResource(ossSrc, mediaDiag),
			{
				source: "video-resource:preview",
				canvasId: this.canvas.id,
				managerInstanceId: this.managerInstanceId,
				path: normalizedPath,
				url: ossSrc,
				priority: retryCount > 0 ? "critical" : "visible",
			},
		)
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (!loaded && retryCount === 0) {
			const freshOssSrc =
				(await this.resolveVirtualResourceFallbackOssSrc(
					path,
					ossSrc,
					entry,
					retryCount,
				)) ?? (await this.exchangeOssSrc(path, entry))
			if (freshOssSrc) {
				return this.loadVideoResource(
					path,
					normalizedPath,
					freshOssSrc,
					entry,
					retryCount + 1,
				)
			}
		}

		if (!loaded) {
			this.diagnostics.increment("previewLoadFailedCount")
			this.setFailureReason(entry, entry.lastFailureReason ?? "load-error")
			this.canvas.eventEmitter.emit({
				type: "resource:video:load-failed",
				data: { path: normalizedPath, reason: entry.lastFailureReason ?? "load-error" },
			})
			return null
		}

		this.diagnostics.increment("previewLoadSuccessCount")
		entry.resource = {
			poster: loaded.poster,
			metadata: loaded.metadata,
		}
		this.setFailureReason(entry, null)
		this.canvas.mediaResourceOfflineCacheManager.recordVirtualResourceLoadSuccess(ossSrc)

		this.entries.set(normalizedPath, entry)
		return this.buildLoadedResource(entry)
	}

	public async resolveVirtualPlaybackFallbackOssInfo(
		path: string,
		ossSrc: string,
	): Promise<ResolvedVideoOssInfo | null> {
		if (this.destroyed) {
			this.markStaleRequestDrop()
			return null
		}
		if (!this.canvas.mediaResourceOfflineCacheManager.isVirtualResourceUrl(ossSrc)) {
			return null
		}

		const normalizedPath = this.canonicalResourcePath(path)
		const entry = this.getOrCreateEntry(normalizedPath)
		const fallbackOssSrc = await this.resolveVirtualResourceFallbackOssSrc(
			path,
			ossSrc,
			entry,
			0,
		)
		if (!fallbackOssSrc) return null
		return {
			ossSrc: fallbackOssSrc,
			expiresAt: entry.expiresAt,
		}
	}

	private async resolveVirtualResourceFallbackOssSrc(
		path: string,
		ossSrc: string,
		entry: ResourceEntry,
		retryCount: number,
	): Promise<string | null> {
		return this.urlLifecycle.resolveVirtualResourceFallbackOssSrc(
			path,
			ossSrc,
			entry,
			retryCount,
		)
	}

	private scheduleCleanup(): void {
		if (this.cleanupTimer) {
			clearTimeout(this.cleanupTimer)
		}

		this.cleanupTimer = setTimeout(() => {
			void this.checkAndCleanupResources()
			this.cleanupTimer = null
		}, this.CLEANUP_DEBOUNCE_DELAY)
	}

	private async checkAndCleanupResources(): Promise<void> {
		if (this.cleanupTimer) {
			clearTimeout(this.cleanupTimer)
			this.cleanupTimer = null
		}

		const usedPaths = new Set<string>()
		const elementsDict = this.canvas.elementManager.getElementsDict()
		for (const elementData of Object.values(elementsDict)) {
			if (elementData.type !== ElementTypeEnum.Video || !elementData.src) {
				continue
			}
			usedPaths.add(this.canonicalResourcePath(elementData.src))
		}

		this.entries.forEach((entry, path) => {
			if (usedPaths.has(path)) return

			if (entry.resource) {
				this.releaseResource(entry.resource)
				entry.resource = null
				this.canvas.eventEmitter.emit({
					type: "resource:released",
					data: { path },
				})
			}
			entry.ossSrc = null
			entry.ossSrcFromCachedFallback = false
			entry.expiresAt = null
			this.canvas.mediaResourceOfflineCacheManager.removeCachedResource({
				path,
				mediaType: "video",
			})
			if (!entry.exchangePromise && !entry.loadingPromise) {
				this.entries.delete(path)
			}
		})
	}

	private releaseResource(resource: VideoResource | null): void {
		if (!resource) {
			return
		}

		resource.poster.width = 0
		resource.poster.height = 0
	}
}
