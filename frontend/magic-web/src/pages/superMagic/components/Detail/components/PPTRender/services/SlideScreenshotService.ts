import { snapdom, type SnapdomPlugin } from "@zumer/snapdom"
import {
	decodeHTMLEntities,
	fallbackImageBase64,
	getFullContent,
} from "../../../contents/HTML/utils/full-content"
import {
	resolvePptScaleContentDimensions,
	type CanonicalContentDimensions,
} from "../../../contents/HTML/utils/slide-dimensions"
import { stabilizeSingleLineTextForSnapdom } from "./snapdomTextStabilizer"

const THUMBNAIL_SCALE = 4
const MAX_CONCURRENT_SCREENSHOT_GENERATIONS = 2
const MAX_PRIORITY_GENERATION_BURST = 3
const SCREENSHOT_PREPARATION_IDLE_TIMEOUT = 32

interface ScheduledScreenshotGeneration<T> {
	promise: Promise<T>
	cancel: (reason: unknown) => boolean
	hasStarted: () => boolean
}

type HoldScreenshotGenerationSlot = (operation: PromiseLike<unknown>) => void

interface PendingScreenshotGeneration {
	hasStarted: boolean
	hasCancelled: boolean
	hasSettled: boolean
	hasReleasedSlot: boolean
	start: () => void
}

interface LatestScreenshotRequest {
	requestId: number
	content: string
	requestKind: SlideScreenshotRequestKind
	contentHash?: string
	dimensions?: CanonicalContentDimensions
}

interface InFlightScreenshotGeneration {
	url: string
	content: string
	contentHash: string
	dimensions: CanonicalContentDimensions
	epoch: number
	hasRequiredConsumer: boolean
	scheduledGeneration: ScheduledScreenshotGeneration<string>
}

export type SlideScreenshotRequestKind = "preview" | "required"

/**
 * Limits the expensive DOM/iframe screenshot work across all service instances.
 * Queued work is freshness-biased so newly visible slides start promptly. A
 * bounded LIFO burst periodically falls back to the oldest task for fairness.
 */
class ScreenshotGenerationScheduler {
	private activeCount = 0
	private latestGenerationStreak = 0
	private readonly pendingGenerations: PendingScreenshotGeneration[] = []

	constructor(private readonly concurrency: number) {}

	schedule<T>(
		task: (signal: AbortSignal, holdSlotUntil: HoldScreenshotGenerationSlot) => Promise<T>,
	): ScheduledScreenshotGeneration<T> {
		let resolveGeneration: (value: T | PromiseLike<T>) => void = () => undefined
		let rejectGeneration: (reason?: unknown) => void = () => undefined
		const promise = new Promise<T>((resolve, reject) => {
			resolveGeneration = resolve
			rejectGeneration = reject
		})
		const abortController = new AbortController()
		const slotHolders: Promise<void>[] = []
		const holdSlotUntil: HoldScreenshotGenerationSlot = (operation) => {
			// Observe failures immediately so a rejected third-party operation cannot
			// produce an unhandled rejection while the scheduler is still awaiting it.
			slotHolders.push(
				Promise.resolve(operation).then(
					() => undefined,
					() => undefined,
				),
			)
		}
		let releaseActiveSlot = () => undefined
		const pendingGeneration: PendingScreenshotGeneration = {
			hasStarted: false,
			hasCancelled: false,
			hasSettled: false,
			hasReleasedSlot: false,
			start: () => {
				if (pendingGeneration.hasStarted || pendingGeneration.hasCancelled) return
				pendingGeneration.hasStarted = true
				this.activeCount += 1

				void (async () => {
					try {
						const value = await task(abortController.signal, holdSlotUntil)
						if (!pendingGeneration.hasCancelled) {
							pendingGeneration.hasSettled = true
							resolveGeneration(value)
						}
					} catch (error) {
						if (!pendingGeneration.hasCancelled) {
							pendingGeneration.hasSettled = true
							rejectGeneration(error)
						}
					} finally {
						// Cancellation settles the caller immediately, but third-party screenshot
						// work may be non-abortable. Keep the physical slot until every registered
						// operation has actually settled so real concurrency never exceeds the cap.
						// A non-settling operation intentionally blocks its slot; releasing it on a
						// timer would allow cancelled CPU/memory-heavy work to accumulate again.
						await Promise.all(slotHolders)
						releaseActiveSlot()
					}
				})()
			},
		}
		releaseActiveSlot = () => {
			if (!pendingGeneration.hasStarted || pendingGeneration.hasReleasedSlot) return
			pendingGeneration.hasReleasedSlot = true
			this.activeCount -= 1
			this.drain()
		}

		if (this.activeCount < this.concurrency) {
			pendingGeneration.start()
		} else {
			this.pendingGenerations.push(pendingGeneration)
		}

		return {
			promise,
			hasStarted: () => pendingGeneration.hasStarted,
			cancel: (reason: unknown) => {
				if (pendingGeneration.hasCancelled || pendingGeneration.hasSettled) return false
				pendingGeneration.hasCancelled = true
				pendingGeneration.hasSettled = true
				abortController.abort(reason)
				const pendingIndex = this.pendingGenerations.indexOf(pendingGeneration)
				if (pendingIndex >= 0) this.pendingGenerations.splice(pendingIndex, 1)
				rejectGeneration(reason)
				return true
			},
		}
	}

	private drain(): void {
		while (this.activeCount < this.concurrency) {
			const nextGeneration = this.takeNextGeneration()
			if (!nextGeneration) {
				this.latestGenerationStreak = 0
				return
			}
			nextGeneration.start()
		}
	}

	private takeNextGeneration(): PendingScreenshotGeneration | undefined {
		if (this.pendingGenerations.length === 0) return undefined

		if (this.latestGenerationStreak < MAX_PRIORITY_GENERATION_BURST) {
			this.latestGenerationStreak += 1
			return this.pendingGenerations.pop()
		}

		this.latestGenerationStreak = 0
		return this.pendingGenerations.shift()
	}
}

const screenshotGenerationScheduler = new ScreenshotGenerationScheduler(
	MAX_CONCURRENT_SCREENSHOT_GENERATIONS,
)

/**
 * Cache entry for slide screenshot
 */
interface ScreenshotCacheEntry {
	thumbnailUrl: string
	timestamp: number
	contentHash: string
	content: string
	dimensions: CanonicalContentDimensions
}

class ScreenshotGenerationCancelledError extends Error {
	constructor() {
		super("Screenshot generation cancelled")
		this.name = "AbortError"
	}
}

/**
 * SlideScreenshotService - Manages screenshot generation with caching
 * Generates thumbnails from HTML content using snapDOM
 */
export class SlideScreenshotService {
	private cache: Map<string, ScreenshotCacheEntry> = new Map()
	private inFlightGenerations: Map<string, InFlightScreenshotGeneration[]> = new Map()
	private latestRequestsByUrl: Map<string, LatestScreenshotRequest> = new Map()
	private nextRequestId = 0
	private generationEpoch = 0
	private previewGenerationEpoch = 0
	private disposed = false

	/**
	 * Generate simple hash from content string
	 */
	private hashContent(content: string): string {
		let hash = 0
		for (let i = 0; i < content.length; i++) {
			const char = content.charCodeAt(i)
			hash = (hash << 5) - hash + char
			hash = hash & hash // Convert to 32-bit integer
		}
		return hash.toString(36)
	}

	private getContentHash(content: string, dimensions?: CanonicalContentDimensions): string {
		const resolvedDimensions = dimensions ?? resolvePptScaleContentDimensions(content)
		return this.hashContent(
			`${content}:${resolvedDimensions.width}x${resolvedDimensions.height}`,
		)
	}

	/**
	 * Generate screenshot for HTML content with caching
	 * @param url - Slide URL (used as cache key)
	 * @param content - HTML content to render
	 * @returns Object URL of the generated thumbnail
	 */
	async generateScreenshot(
		url: string,
		content: string,
		requestKind: SlideScreenshotRequestKind = "required",
	): Promise<string> {
		if (this.disposed) {
			throw new ScreenshotGenerationCancelledError()
		}
		if (!content) {
			throw new Error("Content is required")
		}

		const requestEpoch = this.generationEpoch
		const requestPreviewEpoch = this.previewGenerationEpoch
		const requestId = ++this.nextRequestId
		this.latestRequestsByUrl.set(url, { requestId, content, requestKind })

		await this.yieldForPreparation()
		this.throwIfGenerationCancelled(requestEpoch)
		if (requestKind === "preview" && requestPreviewEpoch !== this.previewGenerationEpoch) {
			throw new ScreenshotGenerationCancelledError()
		}

		const dimensions = resolvePptScaleContentDimensions(content)
		const contentHash = this.getContentHash(content, dimensions)
		const generationKey = `${url}\u0000${contentHash}`
		if (this.latestRequestsByUrl.get(url)?.requestId === requestId) {
			this.latestRequestsByUrl.set(url, {
				requestId,
				content,
				requestKind,
				contentHash,
				dimensions,
			})
		}

		// Check cache first
		const cached = this.cache.get(url)
		if (cached && this.matchesPreparedContent(cached, content, contentHash, dimensions)) {
			return cached.thumbnailUrl
		}

		// Share the exact same request instead of creating duplicate iframes.
		const inFlightGeneration = this.inFlightGenerations
			.get(generationKey)
			?.find((generation) =>
				this.matchesPreparedContent(generation, content, contentHash, dimensions),
			)
		if (inFlightGeneration) {
			if (requestKind === "required") inFlightGeneration.hasRequiredConsumer = true
			return this.waitForGeneration(
				inFlightGeneration.scheduledGeneration.promise,
				requestEpoch,
			)
		}

		const scheduledGeneration = screenshotGenerationScheduler.schedule(
			async (signal, holdSlotUntil) => {
				let thumbnailUrl: string
				try {
					const generation = this.doGenerateScreenshot(
						content,
						dimensions,
						signal,
						holdSlotUntil,
					)
					holdSlotUntil(generation)
					thumbnailUrl = await this.waitForAbortableOperation(
						generation,
						signal,
						(lateThumbnailUrl) => this.releaseScreenshot(lateThumbnailUrl),
					)
				} catch (error) {
					this.throwIfGenerationCancelled(requestEpoch)
					throw error
				}

				if (this.generationEpoch !== requestEpoch) {
					this.releaseScreenshot(thumbnailUrl)
					throw new ScreenshotGenerationCancelledError()
				}

				// Different revisions of the same slide may overlap. Only the most recently
				// requested revision should become the URL-level cache entry.
				if (this.isLatestRequestedContent(url, content, contentHash, dimensions)) {
					this.setCachedScreenshot(url, {
						thumbnailUrl,
						timestamp: Date.now(),
						contentHash,
						content,
						dimensions,
					})
				}

				return thumbnailUrl
			},
		)

		const inFlightEntry: InFlightScreenshotGeneration = {
			url,
			content,
			contentHash,
			dimensions,
			epoch: requestEpoch,
			hasRequiredConsumer: requestKind === "required",
			scheduledGeneration,
		}
		const generationBucket = this.inFlightGenerations.get(generationKey) ?? []
		generationBucket.push(inFlightEntry)
		this.inFlightGenerations.set(generationKey, generationBucket)
		void scheduledGeneration.promise.then(
			() => this.clearInFlightGeneration(generationKey, inFlightEntry),
			() => this.clearInFlightGeneration(generationKey, inFlightEntry),
		)

		return this.waitForGeneration(scheduledGeneration.promise, requestEpoch)
	}

	/**
	 * Cancel only automatic sidebar screenshots when fullscreen takes over. Required work such as
	 * editor saves or manual refreshes remains protected, and existing cached thumbnails stay valid.
	 */
	cancelPreviewGenerations(): void {
		if (this.disposed) return
		this.previewGenerationEpoch += 1
		const cancellationError = new ScreenshotGenerationCancelledError()
		const queuedGenerations: Array<{
			key: string
			entry: InFlightScreenshotGeneration
		}> = []
		const activeGenerations: Array<{
			key: string
			entry: InFlightScreenshotGeneration
		}> = []

		this.inFlightGenerations.forEach((generationBucket, key) => {
			generationBucket.forEach((entry) => {
				const latestRequest = this.latestRequestsByUrl.get(entry.url)
				if (
					latestRequest?.requestKind === "required" &&
					latestRequest.content === entry.content
				) {
					entry.hasRequiredConsumer = true
				}
				if (entry.hasRequiredConsumer) return

				const target = entry.scheduledGeneration.hasStarted()
					? activeGenerations
					: queuedGenerations
				target.push({ key, entry })
			})
		})

		const cancelGeneration = ({ key, entry }: (typeof queuedGenerations)[number]) => {
			entry.scheduledGeneration.cancel(cancellationError)
			// Remove synchronously so a required request cannot reuse the rejected promise.
			this.clearInFlightGeneration(key, entry)
		}
		// Remove queued work first so an active generation that happens to finish during
		// cancellation cannot start another preview from this service.
		queuedGenerations.forEach(cancelGeneration)
		activeGenerations.forEach(cancelGeneration)

		this.latestRequestsByUrl.forEach((request, url) => {
			if (request.requestKind === "preview") this.latestRequestsByUrl.delete(url)
		})
	}

	private yieldForPreparation(): Promise<void> {
		return new Promise((resolve) => {
			if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
				window.requestIdleCallback(() => resolve(), {
					timeout: SCREENSHOT_PREPARATION_IDLE_TIMEOUT,
				})
				return
			}

			setTimeout(resolve, 0)
		})
	}

	private throwIfGenerationCancelled(epoch: number): void {
		if (this.generationEpoch !== epoch) {
			throw new ScreenshotGenerationCancelledError()
		}
	}

	private getAbortReason(signal: AbortSignal): unknown {
		return signal.reason ?? new ScreenshotGenerationCancelledError()
	}

	private throwIfAborted(signal: AbortSignal): void {
		if (signal.aborted) throw this.getAbortReason(signal)
	}

	/**
	 * Races non-abortable browser/third-party work against the task signal. The
	 * underlying promise is still observed so a late Blob URL can be reclaimed.
	 * The scheduler separately retains the physical slot for registered work until
	 * the original operation settles.
	 */
	private waitForAbortableOperation<T>(
		operation: Promise<T>,
		signal: AbortSignal,
		onLateResolve?: (value: T) => void,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			let settled = false
			const removeAbortListener = () => signal.removeEventListener("abort", handleAbort)
			const handleAbort = () => {
				if (settled) return
				settled = true
				removeAbortListener()
				reject(this.getAbortReason(signal))
			}

			if (signal.aborted) {
				handleAbort()
			} else {
				signal.addEventListener("abort", handleAbort, { once: true })
			}

			void operation.then(
				(value) => {
					if (settled) {
						try {
							onLateResolve?.(value)
						} catch {
							// Cleanup failures must not create an unhandled rejection.
						}
						return
					}
					settled = true
					removeAbortListener()
					resolve(value)
				},
				(error) => {
					if (settled) return
					settled = true
					removeAbortListener()
					reject(error)
				},
			)
		})
	}

	private waitForAbortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(this.getAbortReason(signal))
				return
			}

			const handleAbort = () => {
				clearTimeout(timeout)
				signal.removeEventListener("abort", handleAbort)
				reject(this.getAbortReason(signal))
			}
			const timeout = setTimeout(() => {
				signal.removeEventListener("abort", handleAbort)
				resolve()
			}, delayMs)
			signal.addEventListener("abort", handleAbort, { once: true })
		})
	}

	private createSnapdomAbortPlugin(signal: AbortSignal): SnapdomPlugin {
		const throwIfAborted = () => this.throwIfAborted(signal)
		return {
			name: "magic-screenshot-abort",
			beforeSnap: throwIfAborted,
			beforeClone: throwIfAborted,
			afterClone: throwIfAborted,
			beforeRender: throwIfAborted,
			afterRender: throwIfAborted,
			beforeExport: throwIfAborted,
		}
	}

	private async waitForGeneration(generation: Promise<string>, epoch: number): Promise<string> {
		try {
			const thumbnailUrl = await generation
			if (this.generationEpoch !== epoch) {
				this.releaseScreenshot(thumbnailUrl)
				throw new ScreenshotGenerationCancelledError()
			}
			return thumbnailUrl
		} catch (error) {
			this.throwIfGenerationCancelled(epoch)
			throw error
		}
	}

	private matchesPreparedContent(
		candidate: Pick<ScreenshotCacheEntry, "content" | "contentHash" | "dimensions">,
		content: string,
		contentHash: string,
		dimensions: CanonicalContentDimensions,
	): boolean {
		return (
			candidate.contentHash === contentHash &&
			candidate.dimensions.width === dimensions.width &&
			candidate.dimensions.height === dimensions.height &&
			candidate.content === content
		)
	}

	private isLatestRequestedContent(
		url: string,
		content: string,
		contentHash: string,
		dimensions: CanonicalContentDimensions,
	): boolean {
		const latestRequest = this.latestRequestsByUrl.get(url)
		if (!latestRequest) return false
		if (latestRequest.content !== content) return false
		if (latestRequest.contentHash && latestRequest.contentHash !== contentHash) return false
		if (
			latestRequest.dimensions &&
			(latestRequest.dimensions.width !== dimensions.width ||
				latestRequest.dimensions.height !== dimensions.height)
		) {
			return false
		}
		return true
	}

	private setCachedScreenshot(url: string, entry: ScreenshotCacheEntry): void {
		const previousEntry = this.cache.get(url)
		if (previousEntry && previousEntry.thumbnailUrl !== entry.thumbnailUrl) {
			this.revokeThumbnailUrl(previousEntry.thumbnailUrl)
		}
		this.cache.set(url, entry)
	}

	private clearInFlightGeneration(key: string, generation: InFlightScreenshotGeneration): void {
		const generationBucket = this.inFlightGenerations.get(key)
		if (!generationBucket) return
		const generationIndex = generationBucket.indexOf(generation)
		if (generationIndex >= 0) generationBucket.splice(generationIndex, 1)
		if (generationBucket.length === 0) this.inFlightGenerations.delete(key)
	}

	/**
	 * Perform actual screenshot generation
	 */
	private async doGenerateScreenshot(
		content: string,
		{ width, height }: CanonicalContentDimensions,
		signal: AbortSignal,
		holdSlotUntil: HoldScreenshotGenerationSlot,
	): Promise<string> {
		this.throwIfAborted(signal)
		// 创建临时容器用于渲染
		const container = document.createElement("div")
		container.style.cssText = `
			position: fixed;
			top: -9999px;
			left: -9999px;
				width: ${width}px;
				height: ${height}px;
			visibility: hidden;
			pointer-events: none;
			z-index: -1;
		`
		document.body.appendChild(container)

		let iframe: HTMLIFrameElement | null = null
		let thumbnailUrl: { src: string } | null = null
		let resourcesCleaned = false
		const cleanupResources = () => {
			if (resourcesCleaned) return
			resourcesCleaned = true
			this.cleanupScreenshotResources(iframe, container)
		}
		// Abort removes the iframe synchronously, even if snapDOM itself is still
		// resolving a non-abortable export promise in the background.
		signal.addEventListener("abort", cleanupResources, { once: true })

		try {
			// 创建 iframe 用于隔离渲染
			iframe = document.createElement("iframe")
			iframe.style.cssText = "width: 100%; height: 100%; border: none;"
			// 禁用所有可能导致媒体播放的权限
			iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
			iframe.setAttribute("allow", "")
			container.appendChild(iframe)

			await this.setupScreenshotIframe({ iframe, content, signal })
			this.throwIfAborted(signal)

			// 使用 snapDOM 截图
			const iframeDoc = iframe.contentDocument
			if (!iframeDoc) {
				throw new Error("Iframe document not found")
			}

			const screenshotTarget = this.getScreenshotTarget(iframeDoc)
			if (!screenshotTarget) {
				throw new Error("Iframe screenshot target not found")
			}

			await this.waitForRenderingReady(iframeDoc, signal)

			const restoreTextStyles = stabilizeSingleLineTextForSnapdom(screenshotTarget)
			try {
				const snapdomGeneration = snapdom(screenshotTarget, {
					width,
					height,
					backgroundColor: "#ffffff",
					embedFonts: true,
					fallbackURL: fallbackImageBase64,
					plugins: [this.createSnapdomAbortPlugin(signal)],
				})
				holdSlotUntil(snapdomGeneration)
				const result = await this.waitForAbortableOperation(snapdomGeneration, signal)
				this.throwIfAborted(signal)

				const webpGeneration = result.toWebp({
					width: width / THUMBNAIL_SCALE,
					height: height / THUMBNAIL_SCALE,
					quality: 0.8,
				})
				holdSlotUntil(webpGeneration)
				thumbnailUrl = await this.waitForAbortableOperation(
					webpGeneration,
					signal,
					(lateThumbnail) => {
						this.releaseScreenshot(lateThumbnail.src)
						lateThumbnail.src = ""
					},
				)
			} finally {
				restoreTextStyles()
			}
			if (!thumbnailUrl) {
				throw new Error("Screenshot generation failed")
			}

			// 延迟清理以确保 blob 已完全处理并与 iframe 上下文分离
			// 使用 Promise 而不是 setTimeout，确保清理逻辑可控
			await this.waitForAbortableDelay(100, signal)
			cleanupResources()

			return thumbnailUrl.src
		} catch (error) {
			if (thumbnailUrl) {
				const discardedThumbnailSrc = thumbnailUrl.src
				thumbnailUrl.src = ""
				this.releaseScreenshot(discardedThumbnailSrc)
			}
			// 出错时立即清理
			cleanupResources()
			throw error
		} finally {
			signal.removeEventListener("abort", cleanupResources)
		}
	}

	/**
	 * Cleanup screenshot resources including iframe and container
	 */
	private cleanupScreenshotResources(
		iframe: HTMLIFrameElement | null,
		container: HTMLElement,
	): void {
		try {
			if (iframe) {
				const iframeDoc = iframe.contentDocument

				// Step 1: 先暂停所有媒体元素（在卸载前立即停止）
				if (iframeDoc) {
					try {
						// 停止所有视频元素
						const videos = iframeDoc.querySelectorAll("video")
						videos.forEach((video) => {
							try {
								video.pause()
								video.currentTime = 0
								// 移除所有 source 元素
								const sources = video.querySelectorAll("source")
								sources.forEach((source) => source.remove())
								video.src = ""
								video.load()
							} catch (e) {
								// 忽略单个元素清理错误
							}
						})

						// 停止所有音频元素
						const audios = iframeDoc.querySelectorAll("audio")
						audios.forEach((audio) => {
							try {
								audio.pause()
								audio.currentTime = 0
								// 移除所有 source 元素
								const sources = audio.querySelectorAll("source")
								sources.forEach((source) => source.remove())
								audio.src = ""
								audio.load()
							} catch (e) {
								// 忽略单个元素清理错误
							}
						})

						// 停止所有嵌套 iframe
						const iframes = iframeDoc.querySelectorAll("iframe")
						iframes.forEach((nestedIframe) => {
							try {
								nestedIframe.src = "about:blank"
							} catch (e) {
								// 忽略错误
							}
						})
					} catch (e) {
						console.warn("Failed to stop media elements:", e)
					}
				}

				// Step 2: 设置 iframe 为 about:blank（触发完整卸载）
				try {
					iframe.src = "about:blank"
				} catch (e) {
					console.warn("Failed to set iframe src:", e)
				}
			}

			// Step 3: 立即移除容器（DOM 移除会触发所有资源释放）
			if (container.parentNode) {
				container.parentNode.removeChild(container)
			}
		} catch (error) {
			console.warn("Failed to cleanup screenshot resources:", error)
		}
	}

	private async setupScreenshotIframe({
		iframe,
		content,
		signal,
	}: {
		iframe: HTMLIFrameElement
		content: string
		signal: AbortSignal
	}): Promise<void> {
		const IFRAME_LOAD_TIMEOUT = 10000
		const RENDER_WAIT_TIME = 1200
		const FALLBACK_WAIT_TIME = 2000

		// 用于清理所有监听器和定时器
		const cleanupFunctions: Array<() => void> = []

		try {
			// 直接初始化 iframe 内容（截图场景不需要 messenger 模式）
			await this.waitForAbortableOperation(
				new Promise<void>((resolve, reject) => {
					const timeout = setTimeout(() => {
						reject(new Error("Iframe load timeout"))
					}, IFRAME_LOAD_TIMEOUT)

					cleanupFunctions.push(() => clearTimeout(timeout))

					let resolved = false
					const handleResolve = () => {
						if (resolved) return
						resolved = true
						resolve()
					}

					// 策略1: 使用 iframe onload 事件
					const loadHandler = () => handleResolve()
					iframe.addEventListener("load", loadHandler)
					cleanupFunctions.push(() => iframe.removeEventListener("load", loadHandler))

					// 在绑定监听器后写入内容
					if (!iframe.contentDocument) {
						reject(new Error("Failed to access iframe contentDocument"))
						return
					}

					const decodedContent = decodeHTMLEntities(content)
					let fullContent = getFullContent(decodedContent, undefined, {
						dynamicInterception: {
							enable: false,
						},
					})

					// 注入早期媒体暂停脚本（在 HTML 内容中）
					const earlyPauseScript = `
					<script data-screenshot-pause>
					(function() {
						// 立即暂停所有媒体元素
						function pauseMedia(element) {
							try {
								if (element.pause) element.pause();
								element.currentTime = 0;
								element.autoplay = false;
								element.muted = true;
								element.addEventListener('play', function(e) {
									e.preventDefault();
									e.stopPropagation();
									this.pause();
								}, true);
								element.addEventListener('loadeddata', function() {
									this.pause();
								}, true);
							} catch (e) {}
						}
						
						// 重写 HTMLMediaElement.prototype.play
						if (window.HTMLMediaElement) {
							const originalPlay = HTMLMediaElement.prototype.play;
							HTMLMediaElement.prototype.play = function() {
								return Promise.reject(new Error('Media playback disabled for screenshot'));
							};
						}
						
						// 监听所有媒体元素
						document.addEventListener('DOMContentLoaded', function() {
							document.querySelectorAll('video, audio').forEach(pauseMedia);
						});
						
						// 持续监听新添加的元素
						new MutationObserver(function(mutations) {
							mutations.forEach(function(mutation) {
								mutation.addedNodes.forEach(function(node) {
									if (node.nodeType === 1) {
										if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
											pauseMedia(node);
										}
										if (node.querySelectorAll) {
											node.querySelectorAll('video, audio').forEach(pauseMedia);
										}
									}
								});
							});
						}).observe(document.documentElement, { childList: true, subtree: true });
					})();
					</script>
				`

					// 将脚本注入到 <head> 标签的最前面
					fullContent = fullContent.replace(/<head>/i, "<head>" + earlyPauseScript)

					iframe.contentDocument.open()
					iframe.contentDocument.write(fullContent)
					iframe.contentDocument.close()

					const doc = iframe.contentDocument

					// 策略2: 监听文档就绪状态变化
					if (doc) {
						const checkReadyState = () => {
							if (doc.readyState === "complete") {
								handleResolve()
							}
						}
						doc.addEventListener("readystatechange", checkReadyState)
						cleanupFunctions.push(() =>
							doc.removeEventListener("readystatechange", checkReadyState),
						)

						// 立即检查当前状态
						checkReadyState()

						// 策略3: DOMContentLoaded 作为备用
						const domContentLoadedHandler = () => handleResolve()
						doc.addEventListener("DOMContentLoaded", domContentLoadedHandler)
						cleanupFunctions.push(() =>
							doc.removeEventListener("DOMContentLoaded", domContentLoadedHandler),
						)
					}

					// 策略4: 最终备用方案 - 等待合理的时间
					const fallbackTimer = setTimeout(() => {
						if (!resolved && iframe.contentDocument?.body) {
							handleResolve()
						}
					}, FALLBACK_WAIT_TIME)
					cleanupFunctions.push(() => clearTimeout(fallbackTimer))
				}),
				signal,
			)

			// 等待内容加载后注入暂停脚本
			await this.injectPauseScript(iframe, signal)

			// 等待渲染完成
			await this.waitForAbortableDelay(RENDER_WAIT_TIME, signal)

			const doc = iframe.contentDocument
			const win = iframe.contentWindow

			if (!doc || !win) {
				throw new Error("Iframe文档未就绪")
			}
		} finally {
			// 确保所有监听器和定时器都被清理
			cleanupFunctions.forEach((cleanup) => {
				try {
					cleanup()
				} catch (e) {
					console.warn("Failed to cleanup listener", e)
				}
			})
		}
	}

	/**
	 * Inject script to pause animations and media playback
	 */
	private async injectPauseScript(iframe: HTMLIFrameElement, signal: AbortSignal): Promise<void> {
		const win = iframe.contentWindow
		const doc = iframe.contentDocument

		if (!win || !doc) return

		// 等待 head 元素就绪
		let observer: MutationObserver | null = null
		let headTimeout: ReturnType<typeof setTimeout> | undefined
		try {
			await this.waitForAbortableOperation(
				new Promise<void>((resolve) => {
					if (doc.head) {
						resolve()
						return
					}

					observer = new MutationObserver(() => {
						if (doc.head) resolve()
					})

					observer.observe(doc.documentElement, {
						childList: true,
						subtree: true,
					})

					// 超时保护
					headTimeout = setTimeout(resolve, 1000)
				}),
				signal,
			)
		} finally {
			observer?.disconnect()
			if (headTimeout !== undefined) clearTimeout(headTimeout)
		}
		this.throwIfAborted(signal)

		try {
			const pauseScript = doc.createElement("script")
			pauseScript.textContent = `
				(function() {
					// 暂停 CSS 动画
					var style = document.createElement('style');
					style.id = 'magic-animation-pause';
					style.textContent = '*{animation:none!important}*::before,*::after{animation:none!important}';
					if (document.head) {
						document.head.appendChild(style);
					}
					
					// 暂停媒体元素的函数
					function pauseMediaElement(element) {
						try {
							// 暂停播放
							if (element.pause) {
								element.pause();
							}
							// 重置到开始
							element.currentTime = 0;
							// 禁用自动播放
							element.autoplay = false;
							element.muted = true;
							// 阻止播放事件
							element.addEventListener('play', function(e) {
								e.preventDefault();
								e.stopPropagation();
								element.pause();
							}, true);
						} catch (e) {
							// 忽略错误
						}
					}
					
					// 暂停所有现有的视频和音频
					function pauseAllMedia() {
						try {
							var videos = document.querySelectorAll('video');
							var audios = document.querySelectorAll('audio');
							
							videos.forEach(pauseMediaElement);
							audios.forEach(pauseMediaElement);
						} catch (e) {
							console.warn('Failed to pause media:', e);
						}
					}
					
					// 立即暂停现有媒体
					pauseAllMedia();
					
					// 监听 DOM 变化，暂停新添加的媒体元素
					var observer = new MutationObserver(function(mutations) {
						mutations.forEach(function(mutation) {
							mutation.addedNodes.forEach(function(node) {
								if (node.nodeType === 1) { // ELEMENT_NODE
									if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
										pauseMediaElement(node);
									}
									// 检查子元素
									if (node.querySelectorAll) {
										var videos = node.querySelectorAll('video');
										var audios = node.querySelectorAll('audio');
										videos.forEach(pauseMediaElement);
										audios.forEach(pauseMediaElement);
									}
								}
							});
						});
					});
					
					// 开始观察
					observer.observe(document.documentElement, {
						childList: true,
						subtree: true
					});
					
					// 定期检查（防止某些动态加载的媒体被遗漏）
					setInterval(pauseAllMedia, 200);
				})();
			`
			doc.head?.appendChild(pauseScript)
		} catch (e) {
			console.warn("Failed to inject animation pause script", e)
		}
	}

	private getScreenshotTarget(doc: Document): HTMLElement | null {
		return doc.querySelector<HTMLElement>(".slide-container") || doc.body
	}

	private async waitForRenderingReady(doc: Document, signal: AbortSignal): Promise<void> {
		await Promise.all([this.waitForFonts(doc, signal), this.waitForImages(doc, signal)])
		await this.waitForAnimationFrames(doc, 2, signal)
	}

	private async waitForFonts(doc: Document, signal: AbortSignal): Promise<void> {
		const fonts = doc.fonts
		if (!fonts?.ready) return

		let timeout: ReturnType<typeof setTimeout> | undefined
		try {
			await this.waitForAbortableOperation(
				Promise.race([
					fonts.ready.catch(() => undefined),
					new Promise<void>((resolve) => {
						timeout = setTimeout(resolve, 3000)
					}),
				]),
				signal,
			)
		} finally {
			if (timeout !== undefined) clearTimeout(timeout)
		}
	}

	private async waitForAnimationFrames(
		doc: Document,
		frameCount: number,
		signal: AbortSignal,
	): Promise<void> {
		const win = doc.defaultView
		for (let i = 0; i < frameCount; i += 1) {
			if (!win?.requestAnimationFrame) {
				await this.waitForAbortableDelay(16, signal)
				continue
			}

			let frameId: number | undefined
			try {
				await this.waitForAbortableOperation(
					new Promise<void>((resolve) => {
						frameId = win.requestAnimationFrame(() => resolve())
					}),
					signal,
				)
			} finally {
				if (frameId !== undefined) win.cancelAnimationFrame(frameId)
			}
		}
	}

	private async waitForImages(doc: Document, signal: AbortSignal): Promise<void> {
		const MAX_ATTEMPTS = 3
		const BASE_TIMEOUT = 400
		const BACKOFF_DELAYS = [100, 150]

		for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
			this.throwIfAborted(signal)
			const images = Array.from(doc.images)
			if (images.length === 0) return

			images.forEach((img) => {
				if (img.loading === "lazy") img.loading = "eager"
			})

			const pendingImages = images.filter(
				(img) => img.naturalWidth === 0 || img.naturalHeight === 0,
			)

			if (pendingImages.length === 0) return

			await this.waitForImagesOnce(pendingImages, BASE_TIMEOUT + attempt * 150, signal)

			const remainingImages = Array.from(doc.images).filter(
				(img) => img.naturalWidth === 0 || img.naturalHeight === 0,
			)

			if (remainingImages.length === 0) return

			const backoffDelay = BACKOFF_DELAYS[attempt]
			if (backoffDelay) {
				await this.waitForAbortableDelay(backoffDelay, signal)
			}
		}
	}

	private async waitForImagesOnce(
		pendingImages: HTMLImageElement[],
		timeoutMs: number,
		signal: AbortSignal,
	): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			if (signal.aborted) {
				reject(this.getAbortReason(signal))
				return
			}

			let remaining = pendingImages.length
			let finished = false

			const finalize = (error?: unknown) => {
				if (finished) return
				finished = true
				pendingImages.forEach((img) => {
					img.removeEventListener("load", handleDone)
					img.removeEventListener("error", handleError)
				})
				clearTimeout(timeout)
				signal.removeEventListener("abort", handleAbort)
				if (error) {
					reject(error)
				} else {
					resolve()
				}
			}

			const handleDone = () => {
				remaining -= 1
				if (remaining <= 0) finalize()
			}

			const handleError = () => {
				remaining -= 1
				if (remaining <= 0) finalize()
			}

			const handleAbort = () => finalize(this.getAbortReason(signal))
			const timeout = setTimeout(() => {
				finalize()
			}, timeoutMs)

			signal.addEventListener("abort", handleAbort, { once: true })
			pendingImages.forEach((img) => {
				img.addEventListener("load", handleDone, { once: true })
				img.addEventListener("error", handleError, { once: true })
			})
		})
	}

	/**
	 * Get cached screenshot if available
	 */
	getCachedScreenshot(url: string): string | null {
		const cached = this.cache.get(url)
		return cached ? cached.thumbnailUrl : null
	}

	/**
	 * Check if screenshot is cached
	 */
	hasCachedScreenshot(url: string, content?: string): boolean {
		const cached = this.cache.get(url)
		if (!cached) return false

		// If content is provided, verify it matches
		if (content) {
			const dimensions = resolvePptScaleContentDimensions(content)
			const contentHash = this.getContentHash(content, dimensions)
			return this.matchesPreparedContent(cached, content, contentHash, dimensions)
		}

		return true
	}

	/**
	 * Release a generated thumbnail that no consumer accepted. Cached thumbnails
	 * remain owned by this service and are released through the cache lifecycle.
	 */
	releaseScreenshot(thumbnailUrl: string): void {
		const isCached = Array.from(this.cache.values()).some(
			(entry) => entry.thumbnailUrl === thumbnailUrl,
		)
		if (!isCached) this.revokeThumbnailUrl(thumbnailUrl)
	}

	private revokeThumbnailUrl(thumbnailUrl: string): void {
		if (thumbnailUrl.startsWith("blob:")) {
			URL.revokeObjectURL(thumbnailUrl)
		}
	}

	/**
	 * Clear cache for specific URL
	 */
	clearCache(url: string): void {
		const cached = this.cache.get(url)
		if (cached) {
			this.revokeThumbnailUrl(cached.thumbnailUrl)
			this.cache.delete(url)
		}
		this.latestRequestsByUrl.delete(url)
	}

	/**
	 * Clear all cached screenshots
	 */
	clearAllCache(): void {
		this.cache.forEach((entry) => {
			this.revokeThumbnailUrl(entry.thumbnailUrl)
		})
		this.cache.clear()
		this.latestRequestsByUrl.clear()
	}

	/**
	 * Clear old cached screenshots (older than maxAge milliseconds)
	 */
	clearOldCache(maxAge: number = 300000): void {
		// Default: 5 minutes
		const now = Date.now()
		const toDelete: string[] = []

		this.cache.forEach((entry, url) => {
			if (now - entry.timestamp > maxAge) {
				this.revokeThumbnailUrl(entry.thumbnailUrl)
				if (
					this.isLatestRequestedContent(
						url,
						entry.content,
						entry.contentHash,
						entry.dimensions,
					)
				) {
					this.latestRequestsByUrl.delete(url)
				}
				toDelete.push(url)
			}
		})

		toDelete.forEach((url) => this.cache.delete(url))
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return {
			size: this.cache.size,
			urls: Array.from(this.cache.keys()),
		}
	}

	/**
	 * Cancel this deck's queued and active work, then release all cached Blob URLs.
	 * Unlike dispose, reset keeps the service available for the next deck in the same Store.
	 */
	reset(): void {
		if (this.disposed) return
		this.releaseAllResources()
	}

	/** Permanently cleanup all resources owned by this service instance. */
	dispose(): void {
		if (this.disposed) return
		this.disposed = true
		this.releaseAllResources()
	}

	private releaseAllResources(): void {
		this.generationEpoch += 1
		this.previewGenerationEpoch += 1
		const cancellationError = new ScreenshotGenerationCancelledError()
		const queuedGenerations: ScheduledScreenshotGeneration<string>[] = []
		const activeGenerations: ScheduledScreenshotGeneration<string>[] = []
		this.inFlightGenerations.forEach((generationBucket) => {
			generationBucket.forEach((generation) => {
				const target = generation.scheduledGeneration.hasStarted()
					? activeGenerations
					: queuedGenerations
				target.push(generation.scheduledGeneration)
			})
		})
		// Remove this service's queued work first so an active generation that happens
		// to finish during cleanup cannot start work that this same pass is cancelling.
		queuedGenerations.forEach((generation) => generation.cancel(cancellationError))
		activeGenerations.forEach((generation) => generation.cancel(cancellationError))
		this.clearAllCache()
		this.inFlightGenerations.clear()
		this.latestRequestsByUrl.clear()
	}
}

// Singleton instance for global use
let globalScreenshotService: SlideScreenshotService | null = null

/**
 * Get or create global screenshot service instance
 */
export function getScreenshotService(): SlideScreenshotService {
	if (!globalScreenshotService) {
		globalScreenshotService = new SlideScreenshotService()
	}
	return globalScreenshotService
}

/**
 * Factory function to create a new instance
 */
export function createScreenshotService(): SlideScreenshotService {
	return new SlideScreenshotService()
}
