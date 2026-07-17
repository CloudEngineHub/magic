import { throwIfAborted, waitForTimeout } from "./abort"
import type { ResourceLoadError } from "../api/options"
import { CANVAS_DELAY_MS } from "../shared/constants"

export interface SandboxReadyControllerInput {
	iframeWindow: Window
	iframeDocument: Document
	nativeLoadWaitMs: number
	onResourceError?: (error: ResourceLoadError) => void
}

export class SandboxReadyController {
	private readonly iframeWindow: Window
	private readonly iframeDocument: Document
	private readonly nativeLoadWaitMs: number
	private readonly onResourceError?: (error: ResourceLoadError) => void

	constructor({
		iframeWindow,
		iframeDocument,
		nativeLoadWaitMs,
		onResourceError,
	}: SandboxReadyControllerInput) {
		this.iframeWindow = iframeWindow
		this.iframeDocument = iframeDocument
		this.nativeLoadWaitMs = nativeLoadWaitMs
		this.onResourceError = onResourceError
	}

	async waitForReady(options: { signal?: AbortSignal } = {}): Promise<void> {
		void this.onResourceError
		await waitForTimeout({ ms: this.nativeLoadWaitMs, signal: options.signal })
		this.iframeWindow.dispatchEvent(new Event("resize"))
		await waitForRenderResources({
			iframeDocument: this.iframeDocument,
			signal: options.signal,
		})
	}

	restore(): void {
		// The default implementation has no extra interceptors to restore; extensions can override this logic.
	}
}

function waitForImages(iframeDocument: Document, signal?: AbortSignal): Promise<void> {
	const images = iframeDocument.querySelectorAll("img")
	const promises = Array.from(images).map((img) => {
		if (img.complete) return Promise.resolve()
		return new Promise<void>((resolveImage) => {
			const cleanup = () => {
				img.removeEventListener("load", onLoad)
				img.removeEventListener("error", onError)
				if (signal) signal.removeEventListener("abort", onAbort)
			}
			const onLoad = () => {
				cleanup()
				resolveImage()
			}
			const onError = () => {
				cleanup()
				resolveImage()
			}
			const onAbort = () => {
				cleanup()
				resolveImage()
			}
			img.addEventListener("load", onLoad, { once: true })
			img.addEventListener("error", onError, { once: true })
			signal?.addEventListener("abort", onAbort, { once: true })
		})
	})
	return Promise.all(promises).then(() => {})
}

function waitForVideos(iframeDocument: Document, signal?: AbortSignal): Promise<void> {
	const videos = iframeDocument.querySelectorAll("video")
	const promises = Array.from(videos).map((video) => {
		if (video.readyState >= 1) return Promise.resolve()
		return new Promise<void>((resolveVideo) => {
			const cleanup = () => {
				video.removeEventListener("loadedmetadata", onLoadedMetadata)
				video.removeEventListener("error", onError)
				if (signal) signal.removeEventListener("abort", onAbort)
			}
			const onLoadedMetadata = () => {
				cleanup()
				resolveVideo()
			}
			const onError = () => {
				cleanup()
				resolveVideo()
			}
			const onAbort = () => {
				cleanup()
				resolveVideo()
			}
			video.addEventListener("loadedmetadata", onLoadedMetadata, { once: true })
			video.addEventListener("error", onError, { once: true })
			signal?.addEventListener("abort", onAbort, { once: true })
		})
	})
	return Promise.all(promises).then(() => {})
}

function waitForCanvasDelay(
	iframeDocument: Document,
	signal?: AbortSignal,
): Promise<void> {
	const hasCanvas = Boolean(iframeDocument.querySelector("canvas"))
	if (!hasCanvas) return Promise.resolve()
	return waitForTimeout({ ms: CANVAS_DELAY_MS, signal })
}

export async function waitForRenderResources({
	iframeDocument,
	signal,
}: {
	iframeDocument: Document
	signal?: AbortSignal
}): Promise<void> {
	throwIfAborted(signal)
	await waitForCanvasDelay(iframeDocument, signal)
	throwIfAborted(signal)
	await Promise.all([
		waitForImages(iframeDocument, signal),
		waitForVideos(iframeDocument, signal),
	])
	throwIfAborted(signal)
}
