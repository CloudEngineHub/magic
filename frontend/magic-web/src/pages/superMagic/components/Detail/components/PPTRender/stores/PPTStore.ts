import { makeAutoObservable, reaction, runInAction } from "mobx"
import {
	SlideLoaderService,
	SlideProcessorService,
	getScreenshotService,
	createPPTLogger,
	PPTPathMappingService,
	PPTIncrementalUpdateService,
	PPTSlideContentScheduler,
} from "../services"
import type {
	SlideProcessorConfig,
	PPTLoggerConfig,
	IncrementalUpdateContext,
	PPTSlideContentPriority,
} from "../services"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type { SlideItem } from "../PPTSidebar/types"
import { PPTSlideManager } from "./PPTSlideManager"
import { PPTLoadingManager } from "./PPTLoadingManager"
import { PPTViewStateManager } from "./PPTViewStateManager"
import { PPTScreenshotManager } from "./PPTScreenshotManager"
import { PPTActiveIndexCacheManager } from "./PPTActiveIndexCacheManager"
import type { AttachmentItem } from "../../../../TopicFilesButton/hooks"

/**
 * Configuration for PPTStore
 */
export interface PPTStoreConfig {
	attachments?: any[]
	attachmentList?: any[]
	mainFileId?: string
	mainFileName?: string
	displayConfig?: any
	/**
	 * Whether to automatically load slides and generate screenshots
	 * when slides are initialized
	 * @default true
	 */
	autoLoadAndGenerate?: boolean
	/**
	 * Maximum number of slide HTML download/processing tasks allowed at once.
	 * @default 4
	 */
	contentLoadConcurrency?: number
	/**
	 * Preferred initial slide before the first HTML request is scheduled.
	 * Cached restoration may still override it after initialization.
	 */
	initialActiveIndex?: number
	/**
	 * Logger configuration
	 */
	logger?: PPTLoggerConfig
	/**
	 * Cache configuration for activeIndex persistence
	 * 缓存配置，用于持久化 activeIndex
	 */
	organizationCode?: string
	selectedProjectId?: string
	/**
	 * Whether to enable activeIndex caching
	 * @default true
	 */
	enableCache?: boolean
}

export interface PPTExportConfig extends PPTStoreConfig {}

interface SlideLoadTarget {
	url: string
	indexHint?: number
	path?: string
	fileId?: string
}

interface SlideContentLoadOptions {
	signal?: AbortSignal
	generation?: number
}

interface InitializeSlidesOptions {
	configUpdateVersion?: number
}

/**
 * PPTStore - Main store that coordinates all managers
 * Provides a unified API for PPT operations
 */
export class PPTStore {
	// ==================== Manager Instances ====================
	private slideManager: PPTSlideManager
	private loadingManager: PPTLoadingManager
	private viewStateManager: PPTViewStateManager
	private screenshotManager: PPTScreenshotManager
	private cacheManager: PPTActiveIndexCacheManager

	// ==================== Service Instances ====================
	private config: PPTStoreConfig
	private loaderService: SlideLoaderService
	private processorService: SlideProcessorService
	private logger: ReturnType<typeof createPPTLogger>
	/** Path mapping service - public for optimistic updates */
	pathMappingService: PPTPathMappingService
	private incrementalUpdateService: PPTIncrementalUpdateService
	private attachmentListSnapshot: AttachmentItem[] | undefined

	// ==================== Optimization Fields ====================
	private initializingPromise: Promise<void> | null = null
	private initializingKey: string | null = null
	private contentScheduler: PPTSlideContentScheduler
	private contentGeneration = 0
	private contentGenerationController = new AbortController()
	private configUpdateVersion = 0
	private readonly contentLoadConcurrency: number
	private visiblePreviewKeys: Set<string> = new Set()
	private activeIndexAutoSaveDisposer: (() => void) | null = null
	private disposed = false
	/**
	 * Render window size - number of slides to render before/after active slide
	 * 渲染窗口大小 - 在当前幻灯片前后渲染的幻灯片数量
	 */
	private renderWindowSize = 2
	/**
	 * Track manually saved slides by fileId to skip loading indicator
	 * 追踪手动保存的幻灯片（通过 fileId），用于跳过加载指示器
	 */
	private manuallySavedSlides: Set<string> = new Set()
	/**
	 * Screenshot window size - number of slides to preload screenshots before/after active slide
	 * 截图窗口大小 - 在当前幻灯片前后预加载截图的幻灯片数量
	 */
	private screenshotWindowSize = 3
	/** Only the closest slides fetch HTML proactively; the sidebar owns wider preview demand. */
	private adjacentContentWindowSize = 1
	/**
	 * Track slides that have screenshot generation in progress
	 * 追踪正在生成截图的幻灯片索引
	 */
	private generatingScreenshots: Set<string> = new Set()
	/**
	 * Track slide editing states by fileId
	 * 追踪每个幻灯片的编辑状态（通过 fileId）
	 */
	private slideEditingStates: Map<string, boolean> = new Map()
	/**
	 * Track server updated content by fileId
	 * 追踪每个幻灯片的服务端更新内容（通过 fileId）
	 */
	private slideServerUpdates: Map<string, string> = new Map()
	/**
	 * Whether to show button text in toolbar (based on container width)
	 * 是否在工具栏中显示按钮文字（基于容器宽度）
	 */
	shouldShowButtonText: boolean = true

	constructor(config: PPTStoreConfig) {
		this.config = config
		this.attachmentListSnapshot = this.snapshotAttachmentList(config.attachmentList)
		this.contentLoadConcurrency = Math.max(1, Math.floor(config.contentLoadConcurrency ?? 4))
		this.contentScheduler = new PPTSlideContentScheduler(this.contentLoadConcurrency)

		// Initialize services
		this.loaderService = new SlideLoaderService()
		this.processorService = new SlideProcessorService({
			attachments: config.attachments,
			attachmentList: config.attachmentList,
			mainFileId: config.mainFileId,
			mainFileName: config.mainFileName,
			displayConfig: config.displayConfig,
		})
		const screenshotService = getScreenshotService()
		this.logger = createPPTLogger(config.logger)
		this.pathMappingService = new PPTPathMappingService(config, this.logger)
		this.incrementalUpdateService = new PPTIncrementalUpdateService(
			this.pathMappingService,
			screenshotService,
			this.logger,
		)

		// Initialize managers
		this.slideManager = new PPTSlideManager(
			this.logger,
			this.pathMappingService,
			screenshotService,
			config.autoLoadAndGenerate !== false,
		)
		this.loadingManager = new PPTLoadingManager(this.logger)
		this.viewStateManager = new PPTViewStateManager(this.logger)
		this.screenshotManager = new PPTScreenshotManager(this.logger, screenshotService)
		this.cacheManager = new PPTActiveIndexCacheManager(this.logger, {
			organizationCode: config.organizationCode,
			selectedProjectId: config.selectedProjectId,
			mainFileId: config.mainFileId,
		})

		this.logger.info("PPTStore 已初始化", {
			operation: "constructor",
			metadata: {
				autoLoadAndGenerate: config.autoLoadAndGenerate,
				hasAttachments: !!config.attachments,
				hasAttachmentList: !!config.attachmentList,
				mainFileId: config.mainFileId,
				enableCache: config.enableCache !== false,
			},
		})

		// @ts-ignore
		window.pptStore = this

		makeAutoObservable(
			this,
			{
				config: false,
				attachmentListSnapshot: false,
				initializingPromise: false,
				initializingKey: false,
				contentScheduler: false,
				contentGeneration: false,
				contentGenerationController: false,
				configUpdateVersion: false,
				contentLoadConcurrency: false,
				visiblePreviewKeys: false,
				activeIndexAutoSaveDisposer: false,
				disposed: false,
			} as Record<string, false>,
			{ autoBind: true },
		)

		// Setup auto-save for activeIndex when cache is enabled
		if (config.enableCache !== false) {
			this.setupAutoSave()
		}
	}

	private snapshotAttachmentList(
		attachmentList: any[] | undefined,
	): AttachmentItem[] | undefined {
		if (!Array.isArray(attachmentList)) return undefined
		return attachmentList.map((item) => {
			const snapshot = { ...item }
			if (Array.isArray(item?.children)) {
				snapshot.children = this.snapshotAttachmentList(item.children)
			}
			return snapshot
		})
	}

	private findAttachmentByFileId(fileId: string, list: any[] | undefined): any | undefined {
		if (!Array.isArray(list)) return undefined
		for (const item of list) {
			if (item?.file_id === fileId) return item
			const child = this.findAttachmentByFileId(fileId, item?.children)
			if (child) return child
		}
		return undefined
	}

	private hasAttachmentFileId(fileId: string, list: any[] | undefined): boolean {
		const pptFolderPath = this.pathMappingService.getPPTFolderPath()
		if (!pptFolderPath) return Boolean(this.findAttachmentByFileId(fileId, list))
		return Boolean(this.findAttachmentByFileIdInFolder(fileId, list, pptFolderPath))
	}

	private findAttachmentByFileIdInFolder(
		fileId: string,
		list: any[] | undefined,
		folderPath: string,
	): any | undefined {
		if (!Array.isArray(list)) return undefined
		for (const item of list) {
			if (
				item?.file_id === fileId &&
				typeof item?.relative_file_path === "string" &&
				item.relative_file_path.startsWith(folderPath)
			) {
				return item
			}
			const child = this.findAttachmentByFileIdInFolder(fileId, item?.children, folderPath)
			if (child) return child
		}
		return undefined
	}

	private getRelativeFilePathByFileId(fileId?: string): string | undefined {
		return this.pathMappingService.getRelativeFilePathByFileId(fileId)
	}

	private getSlideFileId(slide: SlideItem | undefined): string | undefined {
		if (!slide) return undefined
		return (
			this.pathMappingService.getFileIdByPath(slide.path) ||
			this.pathMappingService.extractFileIdFromPath(slide.path)
		)
	}

	private getSlideStableKey(slide: SlideItem | undefined, fallbackIndex?: number): string {
		if (!slide) return `missing-${fallbackIndex ?? "unknown"}`
		return this.getSlideFileId(slide) || slide.path || slide.url || `slide-${fallbackIndex}`
	}

	private findSlideIndexByLoadTarget(target: Omit<SlideLoadTarget, "url">): number {
		if (target.fileId) {
			const index = this.slides.findIndex(
				(slide) => this.getSlideFileId(slide) === target.fileId,
			)
			if (index !== -1) return index
		}

		if (target.path) {
			const index = this.slides.findIndex((slide) => slide.path === target.path)
			if (index !== -1) return index
		}

		if (target.indexHint !== undefined) {
			const slide = this.slides[target.indexHint]
			if (!slide) return -1
			const matchesFileId = target.fileId && this.getSlideFileId(slide) === target.fileId
			const matchesPath = target.path && slide.path === target.path
			if (!target.fileId && !target.path) return target.indexHint
			if (matchesFileId || matchesPath) return target.indexHint
		}

		return -1
	}

	/**
	 * Replace the queue when a deck is replaced so old, non-cooperative processing cannot
	 * occupy slots needed by the new active slide. The generation guard also prevents late writes.
	 */
	private beginContentGeneration(): number {
		this.contentGeneration++
		this.contentGenerationController.abort()
		this.contentGenerationController = new AbortController()
		this.contentScheduler.dispose()
		this.contentScheduler = new PPTSlideContentScheduler(this.contentLoadConcurrency)
		this.visiblePreviewKeys.clear()
		return this.contentGeneration
	}

	private isContentLoadCurrent(options: SlideContentLoadOptions): boolean {
		return (
			!this.disposed &&
			!options.signal?.aborted &&
			(options.generation === undefined || options.generation === this.contentGeneration)
		)
	}

	private isConfigUpdateCurrent(version: number): boolean {
		return !this.disposed && version === this.configUpdateVersion
	}

	private isInitializationCurrent(
		generation: number,
		configUpdateVersion: number | undefined,
	): boolean {
		return (
			this.isContentLoadCurrent({ generation }) &&
			(configUpdateVersion === undefined || this.isConfigUpdateCurrent(configUpdateVersion))
		)
	}

	private async settlePendingInitialization(configUpdateVersion: number): Promise<void> {
		if (
			!this.loadingManager.isInitializing ||
			!this.isConfigUpdateCurrent(configUpdateVersion)
		) {
			return
		}

		const generation = this.contentGeneration
		const activeIndex = this.activeIndex
		const activeSlide = this.slides[activeIndex]
		const activeSlideSettled =
			activeSlide?.loadingState === "loaded" || activeSlide?.loadingState === "error"

		// A newer same-deck config update adopts readiness from the stale initializer. Wait for the
		// current active page to settle so the loading overlay cannot remain stuck or close too early.
		if (this.config.autoLoadAndGenerate !== false && activeSlide && !activeSlideSettled) {
			await this.ensureSlideContent(activeIndex, "active")
		}

		if (
			this.isContentLoadCurrent({ generation }) &&
			this.isConfigUpdateCurrent(configUpdateVersion) &&
			this.loadingManager.isInitializing
		) {
			this.loadingManager.setInitializing(false)
		}
	}

	private createIncrementalUpdateContext(version: number): IncrementalUpdateContext {
		const isCurrent = () => this.isConfigUpdateCurrent(version)

		return {
			slides: this.slides,
			activeIndex: this.activeIndex,
			autoLoadAndGenerate: this.config.autoLoadAndGenerate !== false,
			loadSlideContent: (url, index) =>
				isCurrent() ? this.loadSlideContent(url, index) : Promise.resolve(""),
			loadSlideContentByFileId: (fileId, options) =>
				isCurrent() ? this.loadSlideContentByFileId(fileId, options) : Promise.resolve(""),
			loadSlideContentSilently: (url, index) =>
				isCurrent() ? this.loadSlideContentSilently(url, index) : Promise.resolve(""),
			generateSlideScreenshot: (index, targetContent) =>
				isCurrent()
					? this.generateSlideScreenshot(index, targetContent)
					: Promise.resolve(),
			ensureSlideScreenshot: (index) =>
				isCurrent() ? this.ensureSlideScreenshot(index) : Promise.resolve(),
			setSlides: (slides) => {
				if (isCurrent()) this.slideManager.setSlides(slides, true)
			},
			setActiveIndex: (index) => {
				if (isCurrent()) this.setActiveIndex(index)
			},
			isSlideManuallySaved: (fileId) => isCurrent() && this.isSlideManuallySaved(fileId),
			clearManualSaveMark: (fileId) => {
				if (isCurrent()) this.clearManualSaveMark(fileId)
			},
			getSlideEditingState: (fileId) => isCurrent() && this.getSlideEditingState(fileId),
			notifyServerUpdate: (fileId, content) => {
				if (isCurrent()) this.notifyServerUpdate(fileId, content)
			},
			isCurrent,
		}
	}

	private isAbortError(error: unknown): boolean {
		return (
			(error instanceof DOMException && error.name === "AbortError") ||
			(error instanceof Error && error.name === "AbortError")
		)
	}

	private findSlideIndexByStableKey(key: string): number {
		return this.slides.findIndex((slide, index) => this.getSlideStableKey(slide, index) === key)
	}

	private getInitialActiveIndex(slideCount: number): number {
		const configuredIndex = this.config.initialActiveIndex
		if (
			typeof configuredIndex === "number" &&
			configuredIndex >= 0 &&
			configuredIndex < slideCount
		) {
			return configuredIndex
		}
		return 0
	}

	// ==================== Computed Values (Delegated to Managers) ====================
	get slides() {
		return this.slideManager.slides
	}

	get activeIndex() {
		return this.slideManager.activeIndex
	}

	get isTransitioning() {
		return this.slideManager.isTransitioning
	}

	get isInitializing() {
		return this.loadingManager.isInitializing
	}

	get isReady() {
		return this.loadingManager.isReady
	}

	get loadingProgress() {
		return this.loadingManager.loadingProgress
	}

	get scaleRatio() {
		return this.viewStateManager.scaleRatio
	}

	get verticalOffset() {
		return this.viewStateManager.verticalOffset
	}

	get horizontalOffset() {
		return this.viewStateManager.horizontalOffset
	}

	get isFullscreen() {
		return this.viewStateManager.isFullscreen
	}

	get slidesFileVersions() {
		return this.loadingManager.slidesFileVersions
	}

	get slideUrls(): string[] {
		return this.slideManager.slideUrls
	}

	get slidePaths(): string[] {
		return this.slideManager.slidePaths
	}

	get slideTitles(): string[] {
		return this.slideManager.slideTitles
	}

	get currentSlide(): SlideItem | undefined {
		return this.slideManager.currentSlide
	}

	get currentSlideUrl(): string {
		return this.slideManager.currentSlideUrl
	}

	get currentSlidePath(): string {
		return this.slideManager.currentSlidePath
	}

	get currentSlideTitle(): string {
		return this.slideManager.currentSlideTitle
	}

	get currentSlideContent(): string {
		return this.slideManager.currentSlideContent
	}

	get currentFileId(): string {
		return this.slideManager.currentFileId
	}

	get canGoPrev(): boolean {
		return this.slideManager.canGoPrev
	}

	get canGoNext(): boolean {
		return this.slideManager.canGoNext
	}

	get loadingPercentage(): number {
		return this.slideManager.loadingPercentage
	}

	get totalSlides(): number {
		return this.slideManager.totalSlides
	}

	getConfigForExport(): PPTExportConfig {
		return { ...this.config }
	}

	/** Get sync manager for unified state synchronization */
	get syncManager() {
		return this.slideManager.syncManager
	}

	// ==================== Sync Control Methods ====================
	/**
	 * Mark to skip the next external sync from parent prop changes
	 * Delegates to slideManager to prevent circular updates
	 */
	markSkipNextExternalSync(): void {
		this.slideManager.markSkipNextExternalSync()
	}

	/**
	 * Check and consume the skip flag
	 * Returns true if should skip, and automatically resets the flag
	 * Delegates to slideManager
	 */
	shouldSkipExternalSync(): boolean {
		return this.slideManager.shouldSkipExternalSync()
	}

	/**
	 * Get visible slides for rendering
	 * 获取需要渲染的可见幻灯片
	 * - Fullscreen: render window around current slide for smooth transitions (prerendering)
	 * - Non-fullscreen: current only (1 slide)
	 * - 全屏：渲染当前幻灯片周围的窗口以实现流畅切换（预渲染）
	 * - 非全屏：仅当前页（1 页）
	 */
	get visibleSlides(): Array<{ slide: SlideItem; index: number }> {
		// Non-fullscreen: only render current slide
		if (!this.isFullscreen) {
			return this.slides[this.activeIndex]
				? [{ slide: this.slides[this.activeIndex], index: this.activeIndex }]
				: []
		}

		// Fullscreen: render only slides within the window (prerendering for smooth transitions)
		// This significantly improves performance when there are many slides
		const startIndex = Math.max(0, this.activeIndex - this.renderWindowSize)
		const endIndex = Math.min(this.slides.length - 1, this.activeIndex + this.renderWindowSize)

		const result: Array<{ slide: SlideItem; index: number }> = []
		for (let i = startIndex; i <= endIndex; i++) {
			result.push({ slide: this.slides[i], index: i })
		}
		return result
	}

	// ==================== Slide Initialization & Loading ====================
	/**
	 * Initialize slides from original paths
	 */
	async initializeSlides(
		slidePaths: string[],
		options: InitializeSlidesOptions = {},
	): Promise<void> {
		const normalizedPaths = slidePaths || []
		const initializingKey = `${this.config.mainFileId || ""}:${normalizedPaths.join(
			"\u0000",
		)}:${options.configUpdateVersion ?? "direct"}`

		// Only identical concurrent initialization can share work. A deck switch must supersede it.
		if (this.initializingPromise && this.initializingKey === initializingKey) {
			this.logger.warn("initializeSlides already in progress, returning existing promise")
			return this.initializingPromise
		}
		const generation = this.beginContentGeneration()

		this.logger.logOperationStart("initializeSlides", {
			metadata: { slideCount: normalizedPaths.length },
		})

		this.loadingManager.resetLoadingState()

		if (normalizedPaths.length === 0) {
			this.logger.warn("未提供幻灯片路径，初始化为空幻灯片")
			this.slideManager.initializeSlides([])
			this.initializingPromise = null
			this.initializingKey = null
			return
		}

		this.loadingManager.setInitializing(true)

		const initializePromise = Promise.resolve().then(async () => {
			try {
				// 1. Extract file IDs from paths
				const fileIds: string[] = []
				const pathByFileId = new Map<string, string>()
				const slideItems: SlideItem[] = normalizedPaths.map((path, index) => {
					const fileId = this.pathMappingService.extractFileIdFromPath(path)
					if (fileId) {
						fileIds.push(fileId)
						pathByFileId.set(fileId, path)
						this.pathMappingService.setPathFileIdMapping(path, fileId)
					} else {
						this.logger.warn("无法从路径提取文件 ID", {
							operation: "initializeSlides",
							slideIndex: index,
							metadata: { path },
						})
					}
					return {
						id: `slide-${index}`,
						path,
						url: "", // Will be filled after fetching URLs
						index,
						loadingState: "idle",
					}
				})

				// 2. Fetch temporary download URLs in batch
				if (fileIds.length > 0) {
					try {
						const response = await getTemporaryDownloadUrl({
							file_ids: fileIds,
						})
						if (!this.isInitializationCurrent(generation, options.configUpdateVersion))
							return

						response?.forEach((item: any) => {
							if (item.file_id && item.url) {
								const path = pathByFileId.get(item.file_id)
								if (path) {
									this.pathMappingService.setPathUrlMapping(path, item.url)
								}
							}
						})

						// 3. Fill URLs into slide items
						slideItems.forEach((slide) => {
							slide.url = this.pathMappingService.getUrlByPath(slide.path) || ""
						})

						this.logger.info("临时 URL 获取成功", {
							operation: "initializeSlides",
							metadata: {
								urlCount: this.pathMappingService.getAllUrlMappings().size,
								slideCount: slideItems.length,
							},
						})
					} catch (error) {
						if (!this.isInitializationCurrent(generation, options.configUpdateVersion))
							return
						this.logger.error("获取临时 URL 失败", error, {
							operation: "initializeSlides",
							metadata: { fileIdCount: fileIds.length },
						})
					}
				}
				if (!this.isInitializationCurrent(generation, options.configUpdateVersion)) return

				// Resolve the initial index before the first HTML request to avoid always loading page 1.
				this.slideManager.initializeSlides(slideItems)
				const initialActiveIndex = this.getInitialActiveIndex(slideItems.length)
				this.slideManager.setActiveIndex(initialActiveIndex)

				if (this.config.autoLoadAndGenerate !== false) {
					await this.ensureSlideContent(initialActiveIndex, "active")
				}
				if (!this.isInitializationCurrent(generation, options.configUpdateVersion)) return

				// Ready means metadata plus the initial active page are settled, not all pages.
				this.loadingManager.setInitializing(false)

				this.logger.logOperationSuccess("initializeSlides", {
					metadata: {
						slideCount: this.slides.length,
						initialActiveIndex,
						autoLoadAndGenerate: this.config.autoLoadAndGenerate,
					},
				})

				// Keep only a small navigation window warm. Sidebar previews are scheduled separately.
				if (this.config.autoLoadAndGenerate !== false) {
					void this.ensureVisibleScreenshots()
				}
			} catch (error) {
				if (this.isInitializationCurrent(generation, options.configUpdateVersion)) {
					this.logger.logOperationError("initializeSlides", error, {
						metadata: { slidePathCount: normalizedPaths.length },
					})
					this.loadingManager.setInitializing(false)
					throw error
				}
			} finally {
				if (this.initializingPromise === initializePromise) {
					this.initializingPromise = null
					this.initializingKey = null
				}
			}
		})
		this.initializingPromise = initializePromise
		this.initializingKey = initializingKey

		return initializePromise
	}

	/**
	 * Get file ID by original path
	 */
	getFileIdByPath(path: string): string | undefined {
		return this.pathMappingService.getFileIdByPath(path)
	}

	/**
	 * Get full workspace-relative path from a PPT-folder-relative path
	 */
	getFullRelativePath(path: string): string | undefined {
		return this.pathMappingService.getFullRelativePath(path)
	}

	/**
	 * Try to extract fileId from path and establish mapping.
	 * Useful when attachmentList has been updated and a previously unknown file is now available.
	 */
	tryExtractAndMapFileId(path: string): string | undefined {
		const existing = this.pathMappingService.getFileIdByPath(path)
		if (existing) return existing

		const fileId = this.pathMappingService.extractFileIdFromPath(path)
		if (fileId) {
			this.pathMappingService.setPathFileIdMapping(path, fileId)
		}
		return fileId
	}

	private async fetchLatestSlideUrl(
		target: Omit<SlideLoadTarget, "url">,
		options: SlideContentLoadOptions,
	): Promise<string> {
		if (!target.fileId || !this.isContentLoadCurrent(options)) return ""

		const urlMap = await this.pathMappingService.fetchUrlsForFileIds([target.fileId], {
			shouldCommit: () => this.isContentLoadCurrent(options),
		})
		if (!this.isContentLoadCurrent(options)) return ""
		const latestUrl = urlMap.get(target.fileId)
		if (!latestUrl) return ""

		runInAction(() => {
			const currentIndex = this.findSlideIndexByLoadTarget(target)
			const currentSlide = currentIndex === -1 ? undefined : this.slides[currentIndex]
			if (!currentSlide) return
			currentSlide.url = latestUrl
			this.pathMappingService.setPathUrlMapping(currentSlide.path, latestUrl)
		})

		return latestUrl
	}

	private markSlideLoadError(
		target: Omit<SlideLoadTarget, "url">,
		error: Error,
		options: SlideContentLoadOptions,
	): void {
		if (!this.isContentLoadCurrent(options)) return
		runInAction(() => {
			const currentIndex = this.findSlideIndexByLoadTarget(target)
			const currentSlide = currentIndex === -1 ? undefined : this.slides[currentIndex]
			if (!currentSlide) return
			currentSlide.loadingState = "error"
			currentSlide.loadingError = error
		})
	}

	/**
	 * Load one slide through the shared priority queue. Active navigation, sidebar previews and
	 * adjacent prefetching all converge here, so the same slide has one in-flight pipeline.
	 */
	async ensureSlideContent(
		index: number,
		priority: PPTSlideContentPriority = "preview",
	): Promise<boolean> {
		const slide = this.slides[index]
		if (!slide || this.disposed) return false
		if (slide.loadingState === "loaded") return true

		const key = this.getSlideStableKey(slide, index)
		const generation = this.contentGeneration
		const target = {
			indexHint: index,
			path: slide.path,
			fileId: this.getSlideFileId(slide),
		}

		return this.contentScheduler.schedule(key, priority, async (signal) => {
			const options = { signal, generation }
			if (!this.isContentLoadCurrent(options)) return false

			const currentIndex = this.findSlideIndexByLoadTarget(target)
			const currentSlide = currentIndex === -1 ? undefined : this.slides[currentIndex]
			if (!currentSlide) return false
			if (currentSlide.loadingState === "loaded") return true

			let url = currentSlide.url || this.pathMappingService.getUrlByPath(currentSlide.path)
			if (!url) {
				url = await this.fetchLatestSlideUrl(target, options)
			}

			if (!url) {
				this.markSlideLoadError(target, new Error("No URL available for slide"), options)
				return false
			}

			let content = await this.loadSlideContentForTarget({ ...target, url }, options)
			if (content || !this.isContentLoadCurrent(options)) return Boolean(content)

			// A temporary URL can expire while the deck stays open. Refresh once before surfacing error.
			const refreshedUrl = await this.fetchLatestSlideUrl(target, options)
			if (!refreshedUrl || refreshedUrl === url || !this.isContentLoadCurrent(options)) {
				return false
			}

			content = await this.loadSlideContentForTarget(
				{ ...target, url: refreshedUrl },
				options,
			)
			return Boolean(content)
		})
	}

	/** Load content first, then generate its thumbnail using the slide's stable identity. */
	async ensureSlidePreview(
		index: number,
		priority: PPTSlideContentPriority = "preview",
	): Promise<boolean> {
		const slide = this.slides[index]
		if (!slide) return false
		const key = this.getSlideStableKey(slide, index)
		const loaded = await this.ensureSlideContent(index, priority)
		if (!loaded) return false

		const currentIndex = this.findSlideIndexByStableKey(key)
		if (currentIndex === -1) return false
		await this.ensureSlideScreenshot(currentIndex)
		return true
	}

	/**
	 * Synchronize sidebar demand with the virtual range. Queued previews that have already scrolled
	 * away are dropped, while active/adjacent work is preserved even if it shares the same key.
	 */
	updateVisibleSlidePreviews(indices: number[]): void {
		const nextPreviewKeys = new Set<string>()
		const uniqueIndices: number[] = []

		indices.forEach((index) => {
			const slide = this.slides[index]
			if (!slide) return
			const key = this.getSlideStableKey(slide, index)
			if (nextPreviewKeys.has(key)) return
			nextPreviewKeys.add(key)
			uniqueIndices.push(index)
		})

		this.visiblePreviewKeys = nextPreviewKeys
		this.contentScheduler.cancelQueued(
			({ key, priority }) => priority === "preview" && !nextPreviewKeys.has(key),
		)

		uniqueIndices.forEach((index) => {
			void this.ensureSlidePreview(index, "preview")
		})
	}

	getContentLoadStats() {
		return this.contentScheduler.getStats()
	}

	/**
	 * Load all slides in parallel
	 */
	async loadAllSlides(): Promise<void> {
		this.logger.logOperationStart("loadAllSlides", {
			metadata: { slideCount: this.slides.length },
		})

		if (this.slides.length === 0) {
			this.logger.warn("没有需要加载的幻灯片")
			return
		}

		runInAction(() => {
			this.loadingManager.resetLoadingState()
			// Reset all slides' loading state
			this.slides.forEach((slide) => {
				slide.loadingState = "idle"
				slide.rawContent = undefined
				slide.content = undefined
				slide.loadingError = undefined
			})
		})

		try {
			// Phase 1: Load raw content and collect file IDs
			const allFileIds = new Set<string>()
			const slideRawData: Array<{
				url: string
				index: number
				path: string
				fileId?: string
				content: string
				relativeFilePath?: string
			}> = []

			await Promise.all(
				this.slides.map(async (slide, index) => {
					const target = {
						indexHint: index,
						path: slide.path,
						fileId: this.getSlideFileId(slide),
					}
					try {
						const url = slide.url || ""
						if (!url) {
							this.logger.warn("幻灯片没有可用的 URL", {
								operation: "loadAllSlides",
								slideIndex: index,
							})

							runInAction(() => {
								const currentIndex = this.findSlideIndexByLoadTarget(target)
								if (currentIndex !== -1 && this.slides[currentIndex]) {
									this.slides[currentIndex].loadingState = "error"
									this.slides[currentIndex].loadingError = new Error(
										"No URL available for slide",
									)
								}
							})
							return
						}

						const rawContent = await this.loaderService.loadSlide(url)

						const currentIndex = this.findSlideIndexByLoadTarget(target)
						if (currentIndex === -1) {
							this.logger.warn("幻灯片在原始内容加载后已不存在，丢弃结果", {
								operation: "loadAllSlides",
								slideIndex: index,
								metadata: { path: target.path, fileId: target.fileId },
							})
							return
						}

						const currentSlide = this.slides[currentIndex]
						const fileId = target.fileId || this.getSlideFileId(currentSlide)
						const relativeFilePath = this.getRelativeFilePathByFileId(fileId)

						slideRawData.push({
							url,
							index: currentIndex,
							path: target.path,
							fileId,
							content: rawContent,
							relativeFilePath,
						})

						const fileIds = this.processorService.collectFileIds(
							rawContent,
							currentIndex,
							relativeFilePath,
						)
						fileIds.forEach((id) => allFileIds.add(id))
					} catch (error) {
						this.logger.error("加载原始内容失败", error, {
							operation: "loadAllSlides",
							slideIndex: index,
						})

						runInAction(() => {
							const currentIndex = this.findSlideIndexByLoadTarget(target)
							if (currentIndex !== -1 && this.slides[currentIndex]) {
								this.slides[currentIndex].loadingState = "error"
								this.slides[currentIndex].loadingError = error as Error
							}
						})
					}
				}),
			)

			// Phase 2: Fetch resource URLs in batch
			const urlMapping: Map<string, string> = new Map()
			if (allFileIds.size > 0) {
				try {
					const response = await getTemporaryDownloadUrl({
						file_ids: Array.from(allFileIds),
					})
					response?.forEach((item: any) => {
						if (item.file_id && item.url) {
							urlMapping.set(item.file_id, item.url)
						}
					})
				} catch (error) {
					this.logger.error("获取临时下载 URL 失败", error, {
						operation: "loadAllSlides",
						metadata: { fileIdCount: allFileIds.size },
					})
				}
			}

			// Phase 3: Process slides with URL mapping
			const currentIndex = this.activeIndex
			const prioritizedSlideData = [...slideRawData].sort((a, b) => {
				const aIndex = this.findSlideIndexByLoadTarget({
					indexHint: a.index,
					path: a.path,
					fileId: a.fileId,
				})
				const bIndex = this.findSlideIndexByLoadTarget({
					indexHint: b.index,
					path: b.path,
					fileId: b.fileId,
				})
				const aDistance =
					aIndex === -1 ? Number.MAX_SAFE_INTEGER : Math.abs(aIndex - currentIndex)
				const bDistance =
					bIndex === -1 ? Number.MAX_SAFE_INTEGER : Math.abs(bIndex - currentIndex)
				return aDistance - bDistance
			})

			const processingPromises: Promise<void>[] = []

			for (const slideData of prioritizedSlideData) {
				const { index, path, fileId, content, relativeFilePath } = slideData
				const target = { indexHint: index, path, fileId }

				const promise = (async () => {
					try {
						runInAction(() => {
							const currentIndex = this.findSlideIndexByLoadTarget(target)
							if (currentIndex !== -1 && this.slides[currentIndex]) {
								this.slides[currentIndex].loadingState = "loading"
							}
						})

						const processIndex = this.findSlideIndexByLoadTarget(target)
						if (processIndex === -1) {
							this.logger.warn("幻灯片在内容处理前已不存在，丢弃结果", {
								operation: "loadAllSlides",
								slideIndex: index,
								metadata: { path, fileId },
							})
							return
						}

						const processedContent =
							await this.processorService.processSlideWithUrlMapping(
								content,
								processIndex,
								relativeFilePath,
								urlMapping,
							)

						runInAction(() => {
							const currentIndex = this.findSlideIndexByLoadTarget(target)
							if (currentIndex !== -1 && this.slides[currentIndex]) {
								this.slides[currentIndex].rawContent = content
								this.slides[currentIndex].content = processedContent
								this.slides[currentIndex].loadingState = "loaded"
								this.slides[currentIndex].lastLoadedAt = Date.now()
							}
						})

						// Update progress
						this.loadingManager.updateProgress(this.slides)
					} catch (error) {
						this.logger.error("处理幻灯片失败", error, {
							operation: "loadAllSlides",
							slideIndex: index,
						})

						runInAction(() => {
							const currentIndex = this.findSlideIndexByLoadTarget(target)
							if (currentIndex !== -1 && this.slides[currentIndex]) {
								this.slides[currentIndex].loadingState = "error"
								this.slides[currentIndex].loadingError = error as Error
							}
						})
					}
				})()

				processingPromises.push(promise)
			}

			// Track completion
			Promise.allSettled(processingPromises).then(() => {
				this.loadingManager.setInitializing(false)

				this.logger.logOperationSuccess("loadAllSlides", {
					metadata: {
						totalSlides: this.slides.length,
					},
				})

				// Generate screenshots for visible slides only (lazy loading)
				if (this.config.autoLoadAndGenerate !== false) {
					this.ensureVisibleScreenshots()
				}
			})
		} catch (error) {
			this.logger.logOperationError("loadAllSlides", error, {
				metadata: { slideCount: this.slides.length },
			})

			this.loadingManager.setInitializing(false)
		}
	}

	/**
	 * Load single slide content
	 */
	async loadSlideContent(
		url: string,
		index: number,
		options: SlideContentLoadOptions = {},
	): Promise<string> {
		const slide = this.slides[index]
		const fileId = this.getSlideFileId(slide)
		return this.loadSlideContentForTarget(
			{
				url,
				indexHint: index,
				path: slide?.path,
				fileId,
			},
			{
				...options,
				signal: options.signal ?? this.contentGenerationController.signal,
				generation: options.generation ?? this.contentGeneration,
			},
		)
	}

	async loadSlideContentByFileId(
		fileId: string,
		options: {
			path?: string
			url?: string
			indexHint?: number
			signal?: AbortSignal
			generation?: number
		} = {},
	): Promise<string> {
		if (!fileId) return ""
		const loadOptions = {
			signal: options.signal ?? this.contentGenerationController.signal,
			generation: options.generation ?? this.contentGeneration,
		}
		if (!this.isContentLoadCurrent(loadOptions)) return ""

		const path =
			options.path || this.slides.find((slide) => this.getSlideFileId(slide) === fileId)?.path
		let url = options.url || (path ? this.pathMappingService.getUrlByPath(path) : undefined)

		if (!url) {
			const urlMap = await this.pathMappingService.fetchUrlsForFileIds([fileId], {
				shouldCommit: () => this.isContentLoadCurrent(loadOptions),
			})
			if (!this.isContentLoadCurrent(loadOptions)) return ""
			url = urlMap.get(fileId)
			if (path && url) {
				this.pathMappingService.setPathUrlMapping(path, url)
			}
		}

		if (!url) {
			this.logger.warn("未能获取幻灯片 URL", {
				operation: "loadSlideContentByFileId",
				metadata: { fileId, path },
			})
			return ""
		}

		return this.loadSlideContentForTarget(
			{
				url,
				indexHint: options.indexHint,
				path,
				fileId,
			},
			loadOptions,
		)
	}

	private async loadSlideContentForTarget(
		target: SlideLoadTarget,
		options: SlideContentLoadOptions = {},
	): Promise<string> {
		this.logger.logOperationStart("loadSlideContent", {
			slideIndex: target.indexHint,
			metadata: { url: target.url, path: target.path, fileId: target.fileId },
		})

		const initialIndex = this.findSlideIndexByLoadTarget(target)
		if (!target.url || initialIndex === -1 || !this.isContentLoadCurrent(options)) {
			this.logger.warn("无效的 URL 或幻灯片索引", {
				operation: "loadSlideContent",
				slideIndex: target.indexHint,
				metadata: {
					hasUrl: !!target.url,
					hasSlide: initialIndex !== -1,
					path: target.path,
					fileId: target.fileId,
				},
			})
			return ""
		}

		try {
			runInAction(() => {
				if (!this.isContentLoadCurrent(options)) return
				const currentIndex = this.findSlideIndexByLoadTarget(target)
				if (currentIndex !== -1 && this.slides[currentIndex]) {
					this.slides[currentIndex].loadingState = "loading"
					this.slides[currentIndex].loadingError = undefined
				}
			})

			const rawContent = await this.loaderService.loadSlide(target.url, {
				signal: options.signal,
			})
			if (!this.isContentLoadCurrent(options)) return ""

			const processIndex = this.findSlideIndexByLoadTarget(target)
			if (processIndex === -1) {
				this.logger.warn("幻灯片在内容加载后已不存在，丢弃结果", {
					operation: "loadSlideContent",
					metadata: { path: target.path, fileId: target.fileId },
				})
				return ""
			}

			const currentSlide = this.slides[processIndex]
			const currentFileId = target.fileId || this.getSlideFileId(currentSlide)
			const relativeFilePath = this.getRelativeFilePathByFileId(currentFileId)
			const processedContent = await this.processorService.processSlide(
				rawContent,
				processIndex,
				relativeFilePath,
			)
			if (!this.isContentLoadCurrent(options)) return ""

			runInAction(() => {
				if (!this.isContentLoadCurrent(options)) return
				const currentIndex = this.findSlideIndexByLoadTarget(target)
				if (currentIndex === -1 || !this.slides[currentIndex]) {
					this.logger.warn("幻灯片在内容处理后已不存在，丢弃结果", {
						operation: "loadSlideContent",
						metadata: { path: target.path, fileId: target.fileId },
					})
					return
				}

				this.slides[currentIndex].rawContent = rawContent
				this.slides[currentIndex].content = processedContent
				this.slides[currentIndex].loadingState = "loaded"
				this.slides[currentIndex].lastLoadedAt = Date.now()
			})

			this.loadingManager.updateProgress(this.slides)

			this.logger.logOperationSuccess("loadSlideContent", {
				slideIndex: this.findSlideIndexByLoadTarget(target),
			})

			return processedContent
		} catch (error) {
			if (this.isAbortError(error) || !this.isContentLoadCurrent(options)) {
				this.logger.debug("幻灯片内容加载已取消，丢弃结果", {
					operation: "loadSlideContent",
					slideIndex: this.findSlideIndexByLoadTarget(target),
				})
				return ""
			}

			this.logger.logOperationError("loadSlideContent", error, {
				slideIndex: this.findSlideIndexByLoadTarget(target),
			})

			runInAction(() => {
				const currentIndex = this.findSlideIndexByLoadTarget(target)
				if (currentIndex !== -1 && this.slides[currentIndex]) {
					this.slides[currentIndex].loadingState = "error"
					this.slides[currentIndex].loadingError = error as Error
				}
			})
			return ""
		}
	}

	/**
	 * Refresh slide content by file ID
	 * Fetches latest URL from server and reloads content
	 * 通过 file_id 刷新幻灯片内容
	 * 从服务器获取最新 URL 并重新加载内容
	 */
	async refreshSlideByFileId(fileId: string): Promise<void> {
		const generation = this.contentGeneration
		this.logger.logOperationStart("refreshSlideByFileId", {
			metadata: { fileId },
		})

		try {
			// Find slide index by fileId
			const slideIndex = this.slides.findIndex((slide) => {
				const slideFileId = this.pathMappingService.getFileIdByPath(slide.path)
				return slideFileId === fileId
			})

			if (slideIndex === -1) {
				this.logger.warn("未找到对应的幻灯片", {
					operation: "refreshSlideByFileId",
					metadata: { fileId },
				})
				return
			}

			const slide = this.slides[slideIndex]
			if (!slide) {
				this.logger.warn("幻灯片不存在", {
					operation: "refreshSlideByFileId",
					metadata: { fileId, slideIndex },
				})
				return
			}
			this.contentScheduler.cancel(this.getSlideStableKey(slide, slideIndex))

			// Fetch latest URL from server
			const urlMap = await this.pathMappingService.fetchUrlsForFileIds([fileId], {
				shouldCommit: () => this.isContentLoadCurrent({ generation }),
			})
			if (!this.isContentLoadCurrent({ generation })) return
			const latestUrl = urlMap.get(fileId)

			if (!latestUrl) {
				this.logger.warn("未能获取最新 URL", {
					operation: "refreshSlideByFileId",
					metadata: { fileId, slideIndex },
				})
				return
			}

			// Update URL mapping
			const slidePath = slide.path
			this.pathMappingService.setPathUrlMapping(slidePath, latestUrl)

			// Update slide URL if different
			runInAction(() => {
				const currentIndex = this.slides.findIndex(
					(candidate) => this.getSlideFileId(candidate) === fileId,
				)
				const currentSlide = currentIndex === -1 ? undefined : this.slides[currentIndex]
				if (currentSlide) {
					if (currentSlide.url !== latestUrl) {
						currentSlide.url = latestUrl
					}
					this.pathMappingService.setPathUrlMapping(currentSlide.path, latestUrl)
				}
			})

			// Reload slide content with latest URL, anchored by fileId to avoid index drift.
			await this.loadSlideContentByFileId(fileId, {
				path: slidePath,
				url: latestUrl,
				indexHint: slideIndex,
				generation,
			})
			if (!this.isContentLoadCurrent({ generation })) return

			// Regenerate screenshot after content refresh. Resolve by fileId again because
			// a slide insertion/removal may have shifted indices while content was loading.
			const refreshedSlideIndex = this.slides.findIndex(
				(candidate) => this.getSlideFileId(candidate) === fileId,
			)
			const refreshedSlide = this.slides[refreshedSlideIndex]
			if (this.config.autoLoadAndGenerate !== false && refreshedSlide?.content) {
				await this.generateSlideScreenshot(refreshedSlideIndex, refreshedSlide.content)
			}

			this.logger.logOperationSuccess("refreshSlideByFileId", {
				metadata: {
					fileId,
					slideIndex,
					latestUrl,
					screenshotRegenerated:
						this.config.autoLoadAndGenerate !== false &&
						Boolean(refreshedSlide?.content),
				},
			})
		} catch (error) {
			this.logger.logOperationError("refreshSlideByFileId", error, {
				metadata: { fileId },
			})
			throw error
		}
	}

	/**
	 * Load slide content silently without updating UI state
	 * Used when loading server updates for slides that are currently being edited
	 * 静默加载幻灯片内容，不更新 UI 状态
	 * 用于加载正在编辑的幻灯片的服务端更新
	 */
	async loadSlideContentSilently(url: string, index: number): Promise<string> {
		const generation = this.contentGeneration
		const signal = this.contentGenerationController.signal
		this.logger.logOperationStart("loadSlideContentSilently", {
			slideIndex: index,
			metadata: { url },
		})

		if (!url || !this.slides[index]) {
			this.logger.warn("无效的 URL 或幻灯片索引", {
				operation: "loadSlideContentSilently",
				slideIndex: index,
				metadata: { hasUrl: !!url, hasSlide: !!this.slides[index] },
			})
			return ""
		}

		try {
			// Load raw content without modifying slide state
			const rawContent = await this.loaderService.loadSlide(url, { signal })
			if (!this.isContentLoadCurrent({ generation, signal })) return ""

			const slidePath = this.slides[index]?.path
			const fileId = this.pathMappingService.getFileIdByPath(slidePath)
			const relativeFilePath = this.getRelativeFilePathByFileId(fileId)

			// Process content without modifying slide state
			const processedContent = await this.processorService.processSlide(
				rawContent,
				index,
				relativeFilePath,
			)
			if (!this.isContentLoadCurrent({ generation, signal })) return ""

			this.logger.logOperationSuccess("loadSlideContentSilently", {
				slideIndex: index,
			})

			return processedContent
		} catch (error) {
			if (this.isAbortError(error) || !this.isContentLoadCurrent({ generation, signal })) {
				return ""
			}
			this.logger.logOperationError("loadSlideContentSilently", error, {
				slideIndex: index,
			})
			return ""
		}
	}

	// ==================== Slide Management (Delegated to SlideManager) ====================
	/**
	 * Check if slide content is expired and refresh if needed
	 */
	async checkAndRefreshExpiredSlide(index: number): Promise<void> {
		const slide = this.slides[index]
		if (!slide || !slide.lastLoadedAt) return

		const EXPIRATION_TIME = 60 * 60 * 1000 // 1 hour
		const isExpired = Date.now() - slide.lastLoadedAt > EXPIRATION_TIME

		// 如果内容过期或者当前没有在加载，则刷新
		if (isExpired) {
			this.logger.info("Slide content expired, auto refreshing", {
				slideIndex: index,
				metadata: {
					lastLoadedAt: slide.lastLoadedAt,
				},
			})

			const fileId = this.pathMappingService.getFileIdByPath(slide.path)
			if (fileId) {
				await this.refreshSlideByFileId(fileId)
			}
		}
	}

	private scheduleActiveSlideWindow(): void {
		const activeIndex = this.activeIndex
		const slide = this.slides[activeIndex]
		if (!slide) return

		if (slide.loadingState === "loaded") {
			void this.checkAndRefreshExpiredSlide(activeIndex)
		} else {
			void this.ensureSlideContent(activeIndex, "active")
		}

		if (this.config.autoLoadAndGenerate !== false) {
			void this.ensureVisibleScreenshots()
		}
	}

	setActiveIndex(index: number): void {
		this.slideManager.setActiveIndex(index)
		if (this.activeIndex === index) this.scheduleActiveSlideWindow()
	}

	nextSlide(): void {
		const previousIndex = this.activeIndex
		this.slideManager.nextSlide()
		if (this.activeIndex !== previousIndex) this.scheduleActiveSlideWindow()
	}

	prevSlide(): void {
		const previousIndex = this.activeIndex
		this.slideManager.prevSlide()
		if (this.activeIndex !== previousIndex) this.scheduleActiveSlideWindow()
	}

	goToFirstSlide(): void {
		const previousIndex = this.activeIndex
		this.slideManager.goToFirstSlide()
		if (this.activeIndex !== previousIndex) this.scheduleActiveSlideWindow()
	}

	setIsTransitioning(isTransitioning: boolean): void {
		this.slideManager.setIsTransitioning(isTransitioning)
	}

	setSlides(newSlides: SlideItem[] | string[], skipSync: boolean = false): void {
		this.slideManager.setSlides(newSlides, skipSync)
	}

	/**
	 * Sync slides with external slide paths (incremental update)
	 * Handles URL fetching, content loading, and screenshot generation for new slides
	 * @param newSlidePaths - New slide paths array
	 * @returns true if slides were updated, false if no changes
	 */
	async syncSlides(newSlidePaths: string[]): Promise<boolean> {
		const result = this.slideManager.syncSlides(newSlidePaths)
		if (!result.hasChanges) {
			return false
		}

		// Handle new slides insertion
		if (
			result.changeType === "insert" &&
			result.affectedIndices &&
			result.affectedIndices.length > 0
		) {
			await this.handleNewSlideInsertion(result.affectedIndices)
		}

		// A full replacement starts a new generation and only awaits its initial active page.
		if (result.changeType === "replace") {
			await this.initializeSlides(newSlidePaths)
		}

		return true
	}

	/**
	 * Handle new slide insertion: fetch URLs, load content, and generate screenshots
	 * @param insertedIndices - Array of inserted slide indices
	 */
	private async handleNewSlideInsertion(insertedIndices: number[]): Promise<void> {
		this.logger.logOperationStart("handleNewSlideInsertion", {
			metadata: { insertedCount: insertedIndices.length, indices: insertedIndices },
		})

		try {
			// 1. Extract file IDs and fetch URLs for new slides
			const fileIds: string[] = []
			const slidePathsToFetch: Array<{ index: number; path: string; fileId?: string }> = []

			for (const index of insertedIndices) {
				const slide = this.slides[index]
				if (!slide) continue

				const fileId = this.pathMappingService.extractFileIdFromPath(slide.path)
				if (fileId) {
					fileIds.push(fileId)
					this.pathMappingService.setPathFileIdMapping(slide.path, fileId)
					slidePathsToFetch.push({ index, path: slide.path, fileId })
				} else {
					this.logger.warn("无法从路径提取文件 ID", {
						operation: "handleNewSlideInsertion",
						slideIndex: index,
						metadata: { path: slide.path },
					})
				}
			}
			// 2. Fetch temporary download URLs in batch
			if (fileIds.length > 0) {
				try {
					const response = await getTemporaryDownloadUrl({
						file_ids: fileIds,
					})

					response?.forEach((item: any) => {
						if (item.file_id && item.url) {
							const pathInfo = slidePathsToFetch.find(
								(p) => p.fileId === item.file_id,
							)
							if (pathInfo) {
								this.pathMappingService.setPathUrlMapping(pathInfo.path, item.url)
								// Update slide URL
								runInAction(() => {
									// Use path to find slide, as indices might have shifted
									const currentSlideIndex = this.slides.findIndex(
										(s) => s.path === pathInfo.path,
									)
									if (
										currentSlideIndex !== -1 &&
										this.slides[currentSlideIndex]
									) {
										this.slides[currentSlideIndex].url = item.url
									} else {
										this.logger.warn("Could not find slide to update URL", {
											operation: "handleNewSlideInsertion",
											metadata: { path: pathInfo.path },
										})
									}
								})
							}
						}
					})

					this.logger.info("新幻灯片临时 URL 获取成功", {
						operation: "handleNewSlideInsertion",
						metadata: { urlCount: response?.length || 0 },
					})
				} catch (error) {
					this.logger.error("获取新幻灯片临时 URL 失败", error, {
						operation: "handleNewSlideInsertion",
						metadata: { fileIdCount: fileIds.length },
					})
				}
			}

			// 3. Keep inserted slides idle. Active navigation and the virtual sidebar now own demand.
			if (this.config.autoLoadAndGenerate !== false) {
				this.scheduleActiveSlideWindow()
			}

			this.logger.logOperationSuccess("handleNewSlideInsertion", {
				metadata: { processedCount: insertedIndices.length },
			})
		} catch (error) {
			this.logger.logOperationError("handleNewSlideInsertion", error, {
				metadata: { insertedIndices },
			})
		}
	}

	/**
	 * @deprecated Use setSlides() instead
	 */
	setSlideUrls(newUrls: string[]): void {
		this.setSlides(newUrls)
	}

	async updateSlideContent(index: number, content: string): Promise<string> {
		const processedContent = await this.processorService.processSlide(content, index)
		// Save both raw and processed content
		this.slideManager.updateSlideItem(index, {
			rawContent: content,
			content: processedContent,
			loadingState: "loaded",
			lastLoadedAt: Date.now(),
		})
		return processedContent
	}

	updateSlideContents(updates: Map<number, string>): void {
		this.slideManager.updateSlideContents(updates)
	}

	updateSlideItem(index: number, updates: Partial<Omit<SlideItem, "index">>): void {
		this.slideManager.updateSlideItem(index, updates)
	}

	updateSlideTitle(index: number, title: string): void {
		this.slideManager.updateSlideTitle(index, title)
	}

	updateSlideTitles(titles: string[]): void {
		this.slideManager.updateSlideTitles(titles)
	}

	/**
	 * Insert a new slide
	 */
	async insertSlide(
		index: number,
		direction: "before" | "after",
		newSlideData: {
			path: string
			url: string
			fileId: string
		},
	): Promise<number> {
		const newIndex = await this.slideManager.insertSlide(
			index,
			direction,
			newSlideData,
			async (url: string, index: number) => {
				// Load slide content only
				await this.loadSlideContentByFileId(newSlideData.fileId, {
					path: newSlideData.path,
					url,
					indexHint: index,
				})
			},
		)

		// Generate screenshots for visible slides (lazy loading)
		if (this.config.autoLoadAndGenerate !== false) {
			await this.ensureVisibleScreenshots()
		}

		return newIndex
	}

	/**
	 * Delete a slide
	 */
	deleteSlide(index: number, adjustActiveIndex: boolean = true): number | undefined {
		return this.slideManager.deleteSlide(index, adjustActiveIndex)
	}

	/**
	 * Sort/reorder slides
	 * @param newSlides - New slides array in the desired order
	 */
	sortSlides(newSlides: SlideItem[]): void {
		this.slideManager.sortSlides(newSlides)
	}

	/**
	 * Rename a slide
	 */
	renameSlide(index: number, newPath: string): void {
		this.slideManager.renameSlide(index, newPath)
	}

	// ==================== View State (Delegated to ViewStateManager) ====================
	setScaleRatio(ratio: number): void {
		this.viewStateManager.setScaleRatio(ratio)
	}

	setVerticalOffset(offset: number): void {
		this.viewStateManager.setVerticalOffset(offset)
	}

	setHorizontalOffset(offset: number): void {
		this.viewStateManager.setHorizontalOffset(offset)
	}

	setFullscreen(isFullscreen: boolean): void {
		this.viewStateManager.setFullscreen(isFullscreen)
	}

	// ==================== File Version (Delegated to LoadingManager) ====================
	setSlideFileVersion(fileId: string, version: number | undefined): void {
		this.loadingManager.setSlideFileVersion(fileId, version)
	}

	setSlidesFileVersions(versions: Record<string, number | undefined>): void {
		this.loadingManager.setSlidesFileVersions(versions)
	}

	// ==================== Screenshot Management (Delegated to ScreenshotManager) ====================
	async generateSlideScreenshot(index: number, targetContent?: string): Promise<void> {
		const slide = this.slides[index]
		if (!slide) return
		const generationKey = this.getSlideStableKey(slide, index)
		await this.screenshotManager.generateSlideScreenshot(
			slide,
			index,
			this.slides,
			targetContent,
			() =>
				this.slides.find(
					(candidate, candidateIndex) =>
						this.getSlideStableKey(candidate, candidateIndex) === generationKey,
				),
		)
	}

	async generateAllScreenshots(): Promise<void> {
		await this.screenshotManager.generateAllScreenshots(this.slides, (slide, originalIndex) => {
			const generationKey = this.getSlideStableKey(slide, originalIndex)
			return this.slides.find(
				(candidate, candidateIndex) =>
					this.getSlideStableKey(candidate, candidateIndex) === generationKey,
			)
		})
	}

	/**
	 * Ensure screenshot is generated for a specific slide (lazy loading)
	 * 确保为特定幻灯片生成截图（懒加载）
	 * - Skips if screenshot already exists or is being generated
	 * - 如果截图已存在或正在生成则跳过
	 */
	async ensureSlideScreenshot(index: number): Promise<void> {
		const slide = this.slides[index]
		if (!slide) return
		const generationKey = this.getSlideStableKey(slide, index)

		// Skip if screenshot already exists
		if (slide.thumbnailUrl) {
			this.logger.debug("截图已存在，跳过生成", {
				operation: "ensureSlideScreenshot",
				slideIndex: index,
			})
			return
		}

		// Skip if already generating (check both tracking set and slide state)
		if (this.generatingScreenshots.has(generationKey) || slide.thumbnailLoading) {
			this.logger.debug("截图正在生成中，跳过", {
				operation: "ensureSlideScreenshot",
				slideIndex: index,
				metadata: {
					generationKey,
					inTrackingSet: this.generatingScreenshots.has(generationKey),
					thumbnailLoading: slide.thumbnailLoading,
				},
			})
			return
		}

		// Skip if slide content is not loaded yet
		if (slide.loadingState !== "loaded") {
			this.logger.debug("幻灯片内容未加载，跳过截图生成", {
				operation: "ensureSlideScreenshot",
				slideIndex: index,
				metadata: { loadingState: slide.loadingState },
			})
			return
		}

		try {
			this.generatingScreenshots.add(generationKey)
			this.logger.debug("开始懒加载截图", {
				operation: "ensureSlideScreenshot",
				slideIndex: index,
				metadata: { generationKey },
			})
			await this.generateSlideScreenshot(index)
		} finally {
			this.generatingScreenshots.delete(generationKey)
		}
	}

	/**
	 * Ensure screenshots are generated for visible slides (lazy loading)
	 * 确保为可见幻灯片生成截图（懒加载）
	 * - Generates screenshots for current slide and nearby slides within window
	 * - 为当前幻灯片及窗口范围内的相邻幻灯片生成截图
	 */
	async ensureVisibleScreenshots(): Promise<void> {
		if (this.slides.length === 0) return

		const currentIndex = this.activeIndex
		const startIndex = Math.max(0, currentIndex - this.screenshotWindowSize)
		const endIndex = Math.min(this.slides.length - 1, currentIndex + this.screenshotWindowSize)

		this.logger.debug("开始懒加载可见截图", {
			operation: "ensureVisibleScreenshots",
			metadata: {
				currentIndex,
				startIndex,
				endIndex,
				windowSize: this.screenshotWindowSize,
			},
		})

		// Generate screenshots in priority order: current, then neighbors
		const indices: number[] = []
		indices.push(currentIndex)
		for (let i = 1; i <= this.screenshotWindowSize; i++) {
			if (currentIndex - i >= startIndex) indices.push(currentIndex - i)
			if (currentIndex + i <= endIndex) indices.push(currentIndex + i)
		}

		await Promise.all(
			indices.map((index) => {
				const distance = Math.abs(index - currentIndex)
				if (distance <= this.adjacentContentWindowSize) {
					return this.ensureSlidePreview(
						index,
						index === currentIndex ? "active" : "adjacent",
					)
				}
				return this.ensureSlideScreenshot(index)
			}),
		)
	}

	clearSlideScreenshot(index: number): void {
		const slide = this.slides[index]
		if (!slide) return
		this.screenshotManager.clearSlideScreenshot(slide, index, this.slides)
	}

	clearAllScreenshots(): void {
		this.screenshotManager.clearAllScreenshots(this.slides)
	}

	getScreenshotCacheStats() {
		return this.screenshotManager.getCacheStats()
	}

	// ==================== Configuration Updates ====================
	async updateConfig(config: Partial<PPTStoreConfig>): Promise<void> {
		if (this.disposed) return
		const configUpdateVersion = ++this.configUpdateVersion
		this.logger.debug("更新配置", {
			operation: "updateConfig",
			metadata: { configKeys: Object.keys(config) },
		})

		const previousAttachmentList = this.attachmentListSnapshot
		const previousMainFileId = this.config.mainFileId
		const mainFileChanged =
			config.mainFileId !== undefined && config.mainFileId !== previousMainFileId
		if (mainFileChanged) {
			this.beginContentGeneration()
			this.pathMappingService.clear()
		}

		this.config = { ...this.config, ...config }

		// Update processor service config
		const processorConfig: Partial<SlideProcessorConfig> = {}
		if (config.attachments !== undefined) processorConfig.attachments = config.attachments
		if (config.attachmentList !== undefined)
			processorConfig.attachmentList = config.attachmentList
		if (config.mainFileId !== undefined) processorConfig.mainFileId = config.mainFileId
		if (config.mainFileName !== undefined) processorConfig.mainFileName = config.mainFileName
		if (config.displayConfig !== undefined) processorConfig.displayConfig = config.displayConfig

		if (Object.keys(processorConfig).length > 0) {
			this.processorService.updateConfig(processorConfig)
		}

		// Update path mapping service config
		this.pathMappingService.updateConfig(config)

		// Update logger config if provided
		if (config.logger !== undefined) {
			this.logger.updateConfig(config.logger)
		}

		// Check if slides data needs incremental update
		await this.handleIncrementalUpdate(
			config,
			previousAttachmentList,
			mainFileChanged,
			configUpdateVersion,
		)
		if (!this.isConfigUpdateCurrent(configUpdateVersion)) return
		if (config.attachmentList !== undefined) {
			this.attachmentListSnapshot = this.snapshotAttachmentList(config.attachmentList)
		}

		// Update cache manager config if cache-related fields changed
		if (
			config.organizationCode !== undefined ||
			config.selectedProjectId !== undefined ||
			config.mainFileId !== undefined
		) {
			this.cacheManager.updateConfig({
				organizationCode: config.organizationCode ?? this.config.organizationCode,
				selectedProjectId: config.selectedProjectId ?? this.config.selectedProjectId,
				mainFileId: config.mainFileId ?? this.config.mainFileId,
			})
		}

		await this.settlePendingInitialization(configUpdateVersion)
		if (!this.isConfigUpdateCurrent(configUpdateVersion)) return

		this.logger.info("配置更新成功", {
			operation: "updateConfig",
		})
	}

	/**
	 * Handle incremental update of slides
	 * This is the single source of truth for slide sync (single-channel design).
	 * Handles initialization, incremental updates, and file content updates.
	 */
	private async handleIncrementalUpdate(
		config: Partial<PPTStoreConfig>,
		previousAttachmentList: AttachmentItem[] | undefined,
		mainFileChanged: boolean,
		configUpdateVersion: number,
	): Promise<void> {
		if (!this.isConfigUpdateCurrent(configUpdateVersion)) return
		if (!config.displayConfig && !config.attachmentList && !mainFileChanged) {
			return
		}

		const newSlidePaths = this.extractSlidePathsFromDisplayConfig(
			config.displayConfig ?? this.config.displayConfig,
		)
		if (mainFileChanged) {
			await this.initializeSlides(newSlidePaths, { configUpdateVersion })
			return
		}
		const currentSlidePaths = this.slidePaths
		const updatedFiles = this.incrementalUpdateService.detectUpdatedFiles(
			previousAttachmentList,
			config.attachmentList,
		)
		const existingUpdatedFiles = new Set<string>()
		updatedFiles.forEach((fileId) => {
			if (this.hasAttachmentFileId(fileId, previousAttachmentList)) {
				existingUpdatedFiles.add(fileId)
			}
		})
		if (!this.isConfigUpdateCurrent(configUpdateVersion)) return
		if (existingUpdatedFiles.size > 0) {
			this.beginContentGeneration()
		}

		// Initialization: store has no slides yet, but config provides paths
		if (this.slides.length === 0 && newSlidePaths.length > 0) {
			await this.initializeSlides(newSlidePaths, { configUpdateVersion })
			return
		}

		// CRITICAL FIX: Check if current state already matches newSlidePaths
		// This means optimistic update has already been applied, skip to prevent double operation
		const areCurrentAndNewEqual =
			currentSlidePaths.length === newSlidePaths.length &&
			currentSlidePaths.every((path, idx) => path === newSlidePaths[idx])

		// If slide paths haven't changed, run recovery for pending/error slides.
		// This handles: new files appearing in attachmentList, files becoming available after error, etc.
		if (areCurrentAndNewEqual) {
			await this.recoverPendingSlidesAfterAttachmentUpdate(configUpdateVersion)
			if (!this.isConfigUpdateCurrent(configUpdateVersion)) return

			// If there are also updated files (content changes to existing files),
			// handle them through the incremental update path
			if (existingUpdatedFiles.size > 0) {
				const context = this.createIncrementalUpdateContext(configUpdateVersion)

				// Only process truly updated files (not new files that were already recovered)
				const loadedExistingUpdatedFiles = new Set<string>()
				existingUpdatedFiles.forEach((fileId) => {
					const slide = this.slides.find((s) => {
						const sFileId = this.pathMappingService.getFileIdByPath(s.path)
						return sFileId === fileId
					})
					if (slide && slide.content) {
						loadedExistingUpdatedFiles.add(fileId)
					}
				})

				if (loadedExistingUpdatedFiles.size > 0) {
					const noChanges = {
						hasChanges: false,
						added: [] as Array<{ path: string; index: number }>,
						removed: [] as number[],
						reordered: false,
					}
					await this.incrementalUpdateService.applyIncrementalUpdates(
						noChanges,
						loadedExistingUpdatedFiles,
						currentSlidePaths,
						context,
					)
					if (!this.isConfigUpdateCurrent(configUpdateVersion)) return
				}
			}
			if (this.isConfigUpdateCurrent(configUpdateVersion)) this.scheduleActiveSlideWindow()

			return
		}

		const changes = this.incrementalUpdateService.detectSlideChanges(
			currentSlidePaths,
			newSlidePaths,
		)

		if (changes.hasChanges || existingUpdatedFiles.size > 0) {
			const context = this.createIncrementalUpdateContext(configUpdateVersion)

			await this.incrementalUpdateService.applyIncrementalUpdates(
				changes,
				existingUpdatedFiles,
				newSlidePaths,
				context,
			)
			if (this.isConfigUpdateCurrent(configUpdateVersion)) this.scheduleActiveSlideWindow()
		}
	}

	private async recoverPendingSlidesAfterAttachmentUpdate(
		configUpdateVersion: number,
	): Promise<number> {
		if (this.slides.length === 0 || !this.isConfigUpdateCurrent(configUpdateVersion)) {
			return 0
		}

		// Phase 1: Recover slides missing fileId or URL
		const pendingSlides = this.slides
			.map((slide, index) => ({
				index,
				path: slide.path,
				url: slide.url,
				fileId: this.pathMappingService.getFileIdByPath(slide.path),
				loadingState: slide.loadingState,
				hasContent: Boolean(slide.content),
			}))
			.filter((slide) => !slide.fileId || !slide.url)

		let recoveredCount = 0

		if (pendingSlides.length > 0) {
			const fileIdsToFetch: string[] = []
			pendingSlides.forEach((slide) => {
				const fileId =
					slide.fileId || this.pathMappingService.extractFileIdFromPath(slide.path)
				if (!fileId) return
				this.pathMappingService.setPathFileIdMapping(slide.path, fileId)
				fileIdsToFetch.push(fileId)
			})

			if (fileIdsToFetch.length > 0) {
				const urlMap = await this.pathMappingService.fetchUrlsForFileIds(fileIdsToFetch, {
					shouldCommit: () => this.isConfigUpdateCurrent(configUpdateVersion),
				})
				if (!this.isConfigUpdateCurrent(configUpdateVersion)) return recoveredCount
				const recoveredIndices: number[] = []

				runInAction(() => {
					if (!this.isConfigUpdateCurrent(configUpdateVersion)) return
					pendingSlides.forEach((pending) => {
						const fileId =
							this.pathMappingService.getFileIdByPath(pending.path) ||
							this.pathMappingService.extractFileIdFromPath(pending.path)
						if (!fileId) return
						const recoveredUrl = urlMap.get(fileId)
						if (!recoveredUrl) return
						const targetIndex = this.slides.findIndex(
							(slide) =>
								this.getSlideFileId(slide) === fileId ||
								slide.path === pending.path,
						)
						const target = targetIndex === -1 ? undefined : this.slides[targetIndex]
						if (!target || target.path !== pending.path) return
						target.url = recoveredUrl
						recoveredIndices.push(targetIndex)
					})
				})

				recoveredCount += recoveredIndices.length
			}
		}

		// URL recovery is metadata-only; content retries remain demand-driven.
		if (this.isConfigUpdateCurrent(configUpdateVersion)) this.scheduleActiveSlideWindow()

		return recoveredCount
	}

	/**
	 * Extract slide paths from display_config
	 */
	private extractSlidePathsFromDisplayConfig(displayConfig: { slides: string[] }): string[] {
		if (!displayConfig || !displayConfig.slides || !Array.isArray(displayConfig.slides)) {
			return []
		}
		return displayConfig.slides
	}

	// ==================== Manual Save Tracking ====================
	/**
	 * Mark a slide as manually saved by fileId
	 * 通过 fileId 标记幻灯片为手动保存
	 */
	markSlideAsManuallySaved(fileId: string): void {
		this.manuallySavedSlides.add(fileId)
		this.logger.debug("标记幻灯片为手动保存", {
			operation: "markSlideAsManuallySaved",
			metadata: { fileId },
		})
	}

	/**
	 * Check if a slide was manually saved by fileId
	 * 通过 fileId 检查幻灯片是否为手动保存
	 */
	isSlideManuallySaved(fileId: string): boolean {
		return this.manuallySavedSlides.has(fileId)
	}

	/**
	 * Clear manual save mark for a slide by fileId
	 * 通过 fileId 清除幻灯片的手动保存标记
	 */
	clearManualSaveMark(fileId: string): void {
		this.manuallySavedSlides.delete(fileId)
		this.logger.debug("清除幻灯片手动保存标记", {
			operation: "clearManualSaveMark",
			metadata: { fileId },
		})
	}

	/**
	 * Clear all manual save marks
	 * 清除所有手动保存标记
	 */
	clearAllManualSaveMarks(): void {
		this.manuallySavedSlides.clear()
		this.logger.debug("清除所有手动保存标记", {
			operation: "clearAllManualSaveMarks",
		})
	}

	// ==================== Slide Editing State Management ====================
	/**
	 * Set slide editing state by fileId
	 * 设置幻灯片的编辑状态（通过 fileId）
	 */
	setSlideEditingState(fileId: string, isEditing: boolean): void {
		this.slideEditingStates.set(fileId, isEditing)
		this.logger.debug("设置幻灯片编辑状态", {
			operation: "setSlideEditingState",
			metadata: { fileId, isEditing },
		})
	}

	/**
	 * Get slide editing state by fileId
	 * 获取幻灯片的编辑状态（通过 fileId）
	 */
	getSlideEditingState(fileId: string): boolean {
		return this.slideEditingStates.get(fileId) || false
	}

	/**
	 * Notify slide of server update
	 * 通知幻灯片有服务端更新
	 */
	notifyServerUpdate(fileId: string, content: string): void {
		this.slideServerUpdates.set(fileId, content)
		this.logger.info("通知幻灯片服务端更新", {
			operation: "notifyServerUpdate",
			metadata: { fileId },
		})
	}

	/**
	 * Get server updated content by fileId
	 * 获取幻灯片的服务端更新内容（通过 fileId）
	 */
	getSlideServerUpdate(fileId: string): string | undefined {
		return this.slideServerUpdates.get(fileId)
	}

	/**
	 * Clear server update for a slide
	 * 清除幻灯片的服务端更新标记
	 */
	clearSlideServerUpdate(fileId: string): void {
		this.slideServerUpdates.delete(fileId)
		this.logger.debug("清除幻灯片服务端更新标记", {
			operation: "clearSlideServerUpdate",
			metadata: { fileId },
		})
	}

	/**
	 * Set whether to show button text in toolbar
	 * 设置是否在工具栏中显示按钮文字
	 */
	setShouldShowButtonText(show: boolean): void {
		this.shouldShowButtonText = show
	}

	// ==================== ActiveIndex Cache Management ====================
	/**
	 * Setup auto-save for activeIndex changes
	 * 设置 activeIndex 变化时的自动保存
	 */
	private setupAutoSave(): void {
		this.activeIndexAutoSaveDisposer = reaction(
			() => this.activeIndex,
			(activeIndex) => {
				this.cacheManager.saveActiveIndexDebounced(activeIndex)
			},
		)

		this.logger.debug("ActiveIndex auto-save enabled", {
			operation: "setupAutoSave",
		})
	}

	/**
	 * Restore cached activeIndex from storage
	 * 从存储中恢复缓存的 activeIndex
	 */
	async restoreCachedActiveIndex(): Promise<void> {
		try {
			const cachedIndex = await this.cacheManager.restoreActiveIndex()
			if (cachedIndex !== null && cachedIndex >= 0 && cachedIndex < this.slides.length) {
				this.logger.debug("Restoring cached activeIndex", {
					operation: "restoreCachedActiveIndex",
					metadata: { cachedIndex, currentIndex: this.activeIndex },
				})
				this.setActiveIndex(cachedIndex)
			}
		} catch (error) {
			this.logger.error("Failed to restore cached activeIndex", {
				operation: "restoreCachedActiveIndex",
				error,
			})
		}
	}

	/**
	 * Update cache configuration (for organizationCode/projectId changes)
	 * 更新缓存配置（用于 organizationCode/projectId 变化）
	 */
	updateCacheConfig(config: { organizationCode?: string; selectedProjectId?: string }): void {
		this.cacheManager.updateConfig({
			...config,
			mainFileId: this.config.mainFileId,
		})

		this.logger.debug("Cache config updated", {
			operation: "updateCacheConfig",
			metadata: config,
		})
	}

	/**
	 * Reset store to initial state
	 */
	reset(): void {
		this.logger.info("重置 Store 到初始状态", {
			operation: "reset",
		})

		this.beginContentGeneration()
		this.configUpdateVersion++
		this.initializingPromise = null
		this.initializingKey = null
		this.slideManager.reset()
		this.loadingManager.reset()
		this.viewStateManager.reset()
		this.pathMappingService.clear()
		this.manuallySavedSlides.clear()
		this.generatingScreenshots.clear()
		this.slideEditingStates.clear()
		this.slideServerUpdates.clear()
		this.cacheManager.dispose()
		this.logger.clearTimings()
	}

	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		this.configUpdateVersion++
		this.contentGeneration++
		this.contentGenerationController.abort()
		this.contentScheduler.dispose()
		this.visiblePreviewKeys.clear()
		this.activeIndexAutoSaveDisposer?.()
		this.activeIndexAutoSaveDisposer = null
		this.cacheManager.dispose()
		this.logger.clearTimings()
	}
}

/**
 * Factory function to create a new PPTStore instance
 */
export function createPPTStore(config: PPTStoreConfig): PPTStore {
	return new PPTStore(config)
}
