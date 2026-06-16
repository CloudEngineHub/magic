import { getVideoPosterMaxEdge } from "./CanvasMediaViewingPolicy"
import type {
	LoadedVideoMetadata,
	LoadedVideoResource,
	VideoPosterSource,
} from "./VideoResourceManager"

export interface VideoPreviewMediaDiag {
	code: number | null
	message: string | null
}

export interface VideoPreviewLoaderOptions {
	concurrency: number
	timeoutMs: number
	isDestroyed: () => boolean
	onStaleRequestDrop: () => void
	onAbort: () => void
	onTimeout: () => void
}

interface PreviewLoadQueueItem {
	run: () => void
	reject: (error: Error) => void
}

export class VideoPreviewLoader {
	private activePreviewLoadCount = 0
	private previewLoadQueue: PreviewLoadQueueItem[] = []
	private readonly activePreviewDisposers = new Set<() => void>()

	constructor(private readonly options: VideoPreviewLoaderOptions) {}

	public get activeCount(): number {
		return this.activePreviewLoadCount
	}

	public get queuedCount(): number {
		return this.previewLoadQueue.length
	}

	public enqueue<T>(task: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			const run = () => {
				if (this.options.isDestroyed()) {
					this.options.onStaleRequestDrop()
					reject(new Error("VideoPreviewLoader destroyed"))
					return
				}
				this.activePreviewLoadCount += 1
				void task()
					.then(resolve, reject)
					.finally(() => {
						this.activePreviewLoadCount = Math.max(0, this.activePreviewLoadCount - 1)
						const nextTask = this.previewLoadQueue.shift()
						if (nextTask) {
							nextTask.run()
						}
					})
			}

			if (this.activePreviewLoadCount < this.options.concurrency) {
				run()
				return
			}

			this.previewLoadQueue.push({
				run,
				reject: (error) => reject(error),
			})
		})
	}

	public extractPreviewResource(
		ossSrc: string,
		mediaDiag?: VideoPreviewMediaDiag,
	): Promise<LoadedVideoResource | null> {
		if (this.options.isDestroyed()) {
			this.options.onStaleRequestDrop()
			return Promise.resolve(null)
		}
		return new Promise((resolve) => {
			const video = document.createElement("video")
			video.crossOrigin = "anonymous"
			video.preload = "auto"
			video.playsInline = true
			video.muted = true
			video.src = ossSrc

			let settled = false
			let metadata: LoadedVideoMetadata | null = null
			let abortPreview: (() => void) | null = null
			let timeoutId: ReturnType<typeof setTimeout> | null = null

			const cleanup = () => {
				video.removeEventListener("loadedmetadata", handleLoadedMetadata)
				video.removeEventListener("loadeddata", handleLoadedData)
				video.removeEventListener("error", handleError)
				video.removeEventListener("seeked", handleSeeked)
				if (timeoutId) {
					clearTimeout(timeoutId)
					timeoutId = null
				}
			}

			const dispose = () => {
				video.pause()
				video.removeAttribute("src")
				video.load()
			}

			const finish = (resource: LoadedVideoResource | null) => {
				if (settled) {
					return
				}
				settled = true
				cleanup()
				if (abortPreview) {
					this.activePreviewDisposers.delete(abortPreview)
				}
				dispose()
				resolve(resource)
			}

			abortPreview = () => {
				if (settled) return
				this.options.onAbort()
				if (mediaDiag) {
					mediaDiag.code = null
					mediaDiag.message = "aborted"
				}
				finish(null)
			}
			this.activePreviewDisposers.add(abortPreview)
			timeoutId = setTimeout(() => {
				if (settled) return
				this.options.onTimeout()
				if (mediaDiag) {
					mediaDiag.code = null
					mediaDiag.message = "timeout"
				}
				finish(null)
			}, this.options.timeoutMs)

			const buildResource = (): boolean => {
				if (this.options.isDestroyed()) {
					abortPreview?.()
					return false
				}
				const loadedMetadata = metadata ?? this.extractLoadedMetadata(video)
				const poster = this.createPosterFromVideoFrame(video, loadedMetadata, mediaDiag)
				if (!poster) {
					return false
				}

				finish({
					ossSrc,
					poster,
					metadata: loadedMetadata,
				})
				return true
			}

			const seekToPreviewFrame = () => {
				try {
					const targetTime = 0.001
					if (Math.abs(video.currentTime - targetTime) < 1e-9) {
						if (!buildResource()) {
							finish(null)
						}
						return
					}

					video.addEventListener("seeked", handleSeeked, { once: true })
					video.currentTime = targetTime
				} catch {
					if (!buildResource()) {
						finish(null)
					}
				}
			}

			const handleSeeked = () => {
				if (!buildResource()) {
					finish(null)
				}
			}

			const handleLoadedMetadata = () => {
				metadata = this.extractLoadedMetadata(video)
			}

			const handleLoadedData = () => {
				requestAnimationFrame(() => {
					if (settled) {
						return
					}
					if (!buildResource()) {
						seekToPreviewFrame()
					}
				})
			}

			const handleError = () => {
				if (mediaDiag && video.error) {
					mediaDiag.code = video.error.code
					mediaDiag.message = video.error.message || null
				}
				finish(null)
			}

			video.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true })
			video.addEventListener("loadeddata", handleLoadedData, { once: true })
			video.addEventListener("error", handleError, { once: true })
			video.load()

			if (this.options.isDestroyed()) {
				abortPreview()
				return
			}

			if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
				handleLoadedData()
			}
		})
	}

	public destroy(error = new Error("VideoPreviewLoader destroyed")): void {
		this.previewLoadQueue.forEach(({ reject }) => reject(error))
		this.previewLoadQueue = []
		this.activePreviewDisposers.forEach((disposePreview) => disposePreview())
		this.activePreviewDisposers.clear()
	}

	private extractLoadedMetadata(video: HTMLVideoElement): LoadedVideoMetadata {
		return {
			duration: Number.isFinite(video.duration) ? video.duration : 0,
			videoWidth: Math.max(1, video.videoWidth || 1),
			videoHeight: Math.max(1, video.videoHeight || 1),
		}
	}

	private createPosterFromVideoFrame(
		video: HTMLVideoElement,
		metadata: LoadedVideoMetadata,
		mediaDiag?: VideoPreviewMediaDiag,
	): VideoPosterSource | null {
		const { width, height } = this.getPosterCanvasSize(
			metadata.videoWidth,
			metadata.videoHeight,
		)
		const poster = document.createElement("canvas")
		poster.width = width
		poster.height = height
		const ctx = poster.getContext("2d")
		if (!ctx) {
			return null
		}

		try {
			ctx.drawImage(video, 0, 0, width, height)
			return poster
		} catch (drawErr) {
			if (mediaDiag) {
				mediaDiag.code = null
				mediaDiag.message = drawErr instanceof Error ? drawErr.message : String(drawErr)
			}
			return null
		}
	}

	private getPosterCanvasSize(
		videoWidth: number,
		videoHeight: number,
	): { width: number; height: number } {
		const longestEdge = Math.max(videoWidth, videoHeight)
		const maxPreviewEdge = getVideoPosterMaxEdge()
		if (longestEdge <= maxPreviewEdge) {
			return { width: videoWidth, height: videoHeight }
		}

		const scale = maxPreviewEdge / longestEdge
		return {
			width: Math.max(1, Math.round(videoWidth * scale)),
			height: Math.max(1, Math.round(videoHeight * scale)),
		}
	}
}
