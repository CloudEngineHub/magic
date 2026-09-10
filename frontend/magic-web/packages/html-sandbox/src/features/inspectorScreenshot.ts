import { snapdom } from "@zumer/snapdom"

export const CAPTURE_FRAME_WAIT_TIMEOUT_MS = 120
export const VIDEO_DATA_WAIT_TIMEOUT_MS = 3_000
export const FONT_READY_WAIT_TIMEOUT_MS = 1_000
export const IMAGE_ENCODE_TIMEOUT_MS = 2_000
export const MAX_SCREENSHOT_OUTPUT_EDGE = 4096
export const SCREENSHOT_WEBP_MIME_TYPE = "image/webp"
export const SCREENSHOT_WEBP_QUALITY = 0.95
/** Sync-style fallback is only safe for tiny canvases, never 4096². */
export const SYNC_PNG_ENCODE_MAX_PIXELS = 256 * 256
const PNG_ENCODE_RETRY_SCALE = 0.5

export interface ScreenshotRequest {
	requestId: string
	selection: { top: number; left: number; width: number; height: number }
	outputSize: { width: number; height: number }
}

export interface ScreenshotCaptureHooks {
	shouldAbort?: () => boolean
	onProgress?: () => void
}

export class ScreenshotCancelledError extends Error {
	constructor() {
		super("Iframe screenshot was cancelled")
		this.name = "ScreenshotCancelledError"
	}
}

function isFiniteRect(rect: ScreenshotRequest["selection"]): boolean {
	return Object.values(rect).every((value) => Number.isFinite(value) && value >= 0)
}

function isFiniteSize(size: ScreenshotRequest["outputSize"]): boolean {
	return Object.values(size).every((value) => Number.isFinite(value) && value > 0)
}

function throwIfAborted(shouldAbort?: () => boolean) {
	if (shouldAbort?.()) throw new ScreenshotCancelledError()
}

function getCanvasPixelCount(canvas: HTMLCanvasElement): number {
	return Math.max(0, canvas.width) * Math.max(0, canvas.height)
}

function waitForAnimationFrameWithTimeout(timeoutMs: number): Promise<boolean> {
	return new Promise((resolve) => {
		let settled = false
		const finish = (presented: boolean) => {
			if (settled) return
			settled = true
			window.clearTimeout(timeoutId)
			resolve(presented)
		}
		const timeoutId = window.setTimeout(() => finish(false), Math.max(timeoutMs, 0))
		try {
			requestAnimationFrame(() => finish(true))
		} catch {
			finish(false)
		}
	})
}

function raceWithTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
	let timeoutId = 0
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
		}),
	]).finally(() => window.clearTimeout(timeoutId))
}

function scaleCanvas(canvas: HTMLCanvasElement, scale: number): HTMLCanvasElement {
	const next = document.createElement("canvas")
	next.width = Math.max(1, Math.round(canvas.width * scale))
	next.height = Math.max(1, Math.round(canvas.height * scale))
	const context = next.getContext("2d")
	if (!context) throw new Error("Canvas 2D context is unavailable")
	context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, next.width, next.height)
	return next
}

function encodeCanvasWithToBlob(
	canvas: HTMLCanvasElement,
	timeoutMs: number,
	type: string,
	quality: number | undefined,
	shouldAbort?: () => boolean,
): Promise<Blob> {
	throwIfAborted(shouldAbort)
	return raceWithTimeout(
		new Promise<Blob>((resolve, reject) => {
			try {
				const callback = (blob: Blob | null) => {
					if (blob) resolve(blob)
					else reject(new Error("canvas.toBlob returned null"))
				}
				if (quality === undefined) canvas.toBlob(callback, type)
				else canvas.toBlob(callback, type, quality)
			} catch (error) {
				reject(error)
			}
		}),
		timeoutMs,
		"Timed out while encoding iframe screenshot",
	)
}

async function encodeCanvasWithWebp(
	canvas: HTMLCanvasElement,
	shouldAbort?: () => boolean,
): Promise<Blob | null> {
	throwIfAborted(shouldAbort)
	try {
		const blob = await encodeCanvasWithToBlob(
			canvas,
			IMAGE_ENCODE_TIMEOUT_MS,
			SCREENSHOT_WEBP_MIME_TYPE,
			SCREENSHOT_WEBP_QUALITY,
			shouldAbort,
		)
		throwIfAborted(shouldAbort)
		return blob.type === SCREENSHOT_WEBP_MIME_TYPE ? blob : null
	} catch (error) {
		rethrowIfCancelled(error)
		return null
	}
}

async function encodeCanvasWithOffscreen(
	canvas: HTMLCanvasElement,
	shouldAbort?: () => boolean,
): Promise<Blob | null> {
	throwIfAborted(shouldAbort)
	if (typeof OffscreenCanvas === "undefined") return null
	try {
		const offscreen = new OffscreenCanvas(canvas.width, canvas.height)
		const context = offscreen.getContext("2d")
		if (!context) return null
		context.drawImage(canvas, 0, 0)
		const blob = await raceWithTimeout(
			offscreen.convertToBlob({ type: "image/png" }),
			IMAGE_ENCODE_TIMEOUT_MS,
			"Timed out while encoding iframe screenshot",
		)
		throwIfAborted(shouldAbort)
		return blob
	} catch (error) {
		if (error instanceof ScreenshotCancelledError) throw error
		return null
	}
}

/** Small-canvas last resort: fetch(data URL) avoids a main-thread byte copy loop. */
async function encodeSmallCanvasFallback(
	canvas: HTMLCanvasElement,
	shouldAbort?: () => boolean,
): Promise<Blob> {
	throwIfAborted(shouldAbort)
	if (getCanvasPixelCount(canvas) > SYNC_PNG_ENCODE_MAX_PIXELS) {
		throw new Error("Failed to encode iframe screenshot")
	}
	const dataUrl = canvas.toDataURL("image/png")
	if (typeof fetch === "function") {
		try {
			const response = await fetch(dataUrl)
			if (response.ok) return await response.blob()
		} catch {
			// jsdom and some workers cannot fetch data: URLs.
		}
	}
	const separatorIndex = dataUrl.indexOf(",")
	if (separatorIndex < 0) throw new Error("Failed to encode iframe screenshot")
	const bytes = Uint8Array.from(atob(dataUrl.slice(separatorIndex + 1)), (char) =>
		char.charCodeAt(0),
	)
	return new Blob([bytes], { type: "image/png" })
}

function rethrowIfCancelled(error: unknown): void {
	if (error instanceof ScreenshotCancelledError) throw error
}

/** Encode PNG asynchronously; retry a smaller canvas if toBlob stalls. */
export async function encodeCanvasToPngBlob(
	canvas: HTMLCanvasElement,
	shouldAbort?: () => boolean,
): Promise<Blob> {
	throwIfAborted(shouldAbort)
	try {
		const blob = await encodeCanvasWithToBlob(
			canvas,
			IMAGE_ENCODE_TIMEOUT_MS,
			"image/png",
			undefined,
			shouldAbort,
		)
		throwIfAborted(shouldAbort)
		return blob
	} catch (error) {
		rethrowIfCancelled(error)
		// Chromium can delay toBlob after a missed compositor frame. Prefer
		// another async encoder before shrinking or touching toDataURL.
	}

	throwIfAborted(shouldAbort)
	const offscreenBlob = await encodeCanvasWithOffscreen(canvas, shouldAbort)
	throwIfAborted(shouldAbort)
	if (offscreenBlob) return offscreenBlob

	throwIfAborted(shouldAbort)
	if (getCanvasPixelCount(canvas) > SYNC_PNG_ENCODE_MAX_PIXELS) {
		const reduced = scaleCanvas(canvas, PNG_ENCODE_RETRY_SCALE)
		throwIfAborted(shouldAbort)
		try {
			const blob = await encodeCanvasWithToBlob(
				reduced,
				IMAGE_ENCODE_TIMEOUT_MS,
				"image/png",
				undefined,
				shouldAbort,
			)
			throwIfAborted(shouldAbort)
			return blob
		} catch (error) {
			rethrowIfCancelled(error)
			return encodeSmallCanvasFallback(reduced, shouldAbort)
		}
	}

	return encodeSmallCanvasFallback(canvas, shouldAbort)
}

/** Prefer high-quality WebP to reduce screenshot storage and upload size. */
export async function encodeCanvasToScreenshotBlob(
	canvas: HTMLCanvasElement,
	shouldAbort?: () => boolean,
): Promise<Blob> {
	const webpBlob = await encodeCanvasWithWebp(canvas, shouldAbort)
	if (webpBlob) return webpBlob
	return encodeCanvasToPngBlob(canvas, shouldAbort)
}

export function resolveCaptureRoot(selection: ScreenshotRequest["selection"]): HTMLElement {
	const explicitRoot = document.querySelector<HTMLElement>("[data-magic-capture-root]")
	if (explicitRoot) return explicitRoot

	const roots = Array.from(
		document.querySelectorAll<HTMLElement>(".slide-container, main.ft-canvas, main.slide"),
	)
	const centerX = selection.left + selection.width / 2
	const centerY = selection.top + selection.height / 2
	const containingRoot = roots
		.map((root) => ({ root, rect: root.getBoundingClientRect() }))
		.filter(
			({ rect }) =>
				centerX >= rect.left &&
				centerX <= rect.right &&
				centerY >= rect.top &&
				centerY <= rect.bottom,
		)
		.sort((a, b) => a.rect.width * a.rect.height - b.rect.width * b.rect.height)[0]

	return containingRoot?.root ?? document.body
}

interface CaptureClipRect {
	x: number
	y: number
	width: number
	height: number
}

type VideoFrameCallbackTarget = {
	requestVideoFrameCallback?: (callback: () => void) => number
}

function readViewportClip(root: HTMLElement, clip: CaptureClipRect) {
	const rootRect = root.getBoundingClientRect()
	return {
		left: rootRect.left + clip.x,
		top: rootRect.top + clip.y,
		right: rootRect.left + clip.x + clip.width,
		bottom: rootRect.top + clip.y + clip.height,
	}
}

function intersectsViewportClip(
	elementRect: DOMRect,
	clip: ReturnType<typeof readViewportClip>,
): boolean {
	return !(
		elementRect.right <= clip.left ||
		elementRect.left >= clip.right ||
		elementRect.bottom <= clip.top ||
		elementRect.top >= clip.bottom
	)
}

export function findVideosInCaptureClip(
	root: HTMLElement,
	clip: CaptureClipRect,
): HTMLVideoElement[] {
	const viewportClip = readViewportClip(root, clip)
	return Array.from(root.querySelectorAll("video")).filter((video) => {
		const rect = video.getBoundingClientRect()
		return rect.width > 0 && rect.height > 0 && intersectsViewportClip(rect, viewportClip)
	})
}

async function waitForVideoFramePresented(video: HTMLVideoElement): Promise<void> {
	const requestVideoFrameCallback = (video as HTMLVideoElement & VideoFrameCallbackTarget)
		.requestVideoFrameCallback
	if (typeof requestVideoFrameCallback === "function") {
		await new Promise<void>((resolve) => {
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				window.clearTimeout(timeoutId)
				resolve()
			}
			const timeoutId = window.setTimeout(finish, CAPTURE_FRAME_WAIT_TIMEOUT_MS)
			try {
				requestVideoFrameCallback.call(video, finish)
			} catch {
				finish()
			}
		})
		return
	}
	await waitForAnimationFrameWithTimeout(CAPTURE_FRAME_WAIT_TIMEOUT_MS)
}

function waitForVideoLoadedData(video: HTMLVideoElement): Promise<void> {
	return new Promise((resolve) => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			window.clearTimeout(timeoutId)
			video.removeEventListener("loadeddata", finish)
			video.removeEventListener("error", finish)
			resolve()
		}
		const timeoutId = window.setTimeout(finish, VIDEO_DATA_WAIT_TIMEOUT_MS)
		if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
			finish()
			return
		}
		video.addEventListener("loadeddata", finish, { once: true })
		video.addEventListener("error", finish, { once: true })
	})
}

function seekVideoForCaptureFrame(video: HTMLVideoElement): Promise<void> {
	return new Promise((resolve) => {
		let settled = false
		const finish = () => {
			if (settled) return
			settled = true
			window.clearTimeout(timeoutId)
			video.removeEventListener("seeked", finish)
			video.removeEventListener("error", finish)
			resolve()
		}
		const timeoutId = window.setTimeout(finish, VIDEO_DATA_WAIT_TIMEOUT_MS)
		if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
			finish()
			return
		}
		try {
			const targetTime = Math.min(0.001, Number.isFinite(video.duration) ? video.duration : 0.001)
			if (Math.abs(video.currentTime - targetTime) < 1e-6) {
				finish()
				return
			}
			video.addEventListener("seeked", finish, { once: true })
			video.addEventListener("error", finish, { once: true })
			video.currentTime = targetTime
		} catch {
			finish()
		}
	})
}

async function waitForVideoCaptureFrame(video: HTMLVideoElement): Promise<void> {
	video.muted = true
	if (video.networkState === HTMLMediaElement.NETWORK_EMPTY && video.currentSrc) {
		try {
			video.load()
		} catch {
			// Ignore invalid sources and continue with best-effort capture.
		}
	}

	await waitForVideoLoadedData(video)
	if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
		await seekVideoForCaptureFrame(video)
	}
	await waitForVideoFramePresented(video)
}

/** Wait for clip videos to decode a frame before DOM capture. */
export async function waitForCaptureVideosInClip(
	root: HTMLElement,
	clip: CaptureClipRect,
): Promise<void> {
	const videos = findVideosInCaptureClip(root, clip)
	if (videos.length === 0) return
	await Promise.all(videos.map((video) => waitForVideoCaptureFrame(video)))
	await waitForAnimationFrameWithTimeout(CAPTURE_FRAME_WAIT_TIMEOUT_MS)
}

function resolveVideoAlignedClip(
	root: HTMLElement,
	selection: ScreenshotRequest["selection"],
	clip: CaptureClipRect,
): CaptureClipRect {
	const centerX = selection.left + selection.width / 2
	const centerY = selection.top + selection.height / 2
	const target = document.elementFromPoint(centerX, centerY)
	const video = target?.closest("video")
	if (!(video instanceof HTMLVideoElement) || !root.contains(video)) return clip

	const rootRect = root.getBoundingClientRect()
	const videoRect = video.getBoundingClientRect()
	const selectionLeft = Math.max(0, videoRect.left - rootRect.left)
	const selectionTop = Math.max(0, videoRect.top - rootRect.top)
	const selectionRight = Math.min(rootRect.width, videoRect.right - rootRect.left)
	const selectionBottom = Math.min(rootRect.height, videoRect.bottom - rootRect.top)
	return {
		x: selectionLeft,
		y: selectionTop,
		width: Math.max(1, selectionRight - selectionLeft),
		height: Math.max(1, selectionBottom - selectionTop),
	}
}

async function waitForCaptureFrame(): Promise<void> {
	const fontsReady = document.fonts?.ready
	if (fontsReady) {
		await new Promise<void>((resolve) => {
			let settled = false
			const finish = () => {
				if (settled) return
				settled = true
				window.clearTimeout(timeoutId)
				resolve()
			}
			const timeoutId = window.setTimeout(finish, FONT_READY_WAIT_TIMEOUT_MS)
			fontsReady.then(finish, finish)
		})
	}
	let animationFramePresented = await waitForAnimationFrameWithTimeout(
		CAPTURE_FRAME_WAIT_TIMEOUT_MS,
	)
	if (!animationFramePresented) {
		// A freshly injected document can miss the first compositor tick.
		animationFramePresented = await waitForAnimationFrameWithTimeout(
			CAPTURE_FRAME_WAIT_TIMEOUT_MS,
		)
	}
}

export async function captureScreenshotBlob(
	request: ScreenshotRequest,
	hooks: ScreenshotCaptureHooks = {},
): Promise<Blob> {
	if (
		!request.requestId ||
		!isFiniteRect(request.selection) ||
		!isFiniteSize(request.outputSize)
	) {
		throw new Error("Invalid iframe screenshot request")
	}
	const outputWidth = Math.min(
		Math.max(Math.round(request.outputSize.width), 1),
		MAX_SCREENSHOT_OUTPUT_EDGE,
	)
	const outputHeight = Math.min(
		Math.max(Math.round(request.outputSize.height), 1),
		MAX_SCREENSHOT_OUTPUT_EDGE,
	)
	const root = resolveCaptureRoot(request.selection)
	const rootRect = root.getBoundingClientRect()
	if (rootRect.width <= 0 || rootRect.height <= 0) {
		throw new Error("Capture root has no size")
	}
	const selectionLeft = Math.max(0, request.selection.left - rootRect.left)
	const selectionTop = Math.max(0, request.selection.top - rootRect.top)
	const selectionRight = Math.min(
		rootRect.width,
		request.selection.left - rootRect.left + request.selection.width,
	)
	const selectionBottom = Math.min(
		rootRect.height,
		request.selection.top - rootRect.top + request.selection.height,
	)
	let clip: CaptureClipRect = {
		x: selectionLeft,
		y: selectionTop,
		width: Math.max(1, selectionRight - selectionLeft),
		height: Math.max(1, selectionBottom - selectionTop),
	}
	const style = document.createElement("style")
	style.setAttribute("data-magic-inspector-screenshot", "true")
	style.textContent = `
		*, *::before, *::after {
			animation: none !important;
			transition: none !important;
			caret-color: transparent !important;
			cursor: none !important;
		}
	`
	;(document.head ?? document.documentElement).appendChild(style)
	try {
		throwIfAborted(hooks.shouldAbort)
		await waitForCaptureFrame()
		throwIfAborted(hooks.shouldAbort)
		await waitForCaptureVideosInClip(root, clip)
		throwIfAborted(hooks.shouldAbort)
		clip = resolveVideoAlignedClip(root, request.selection, clip)
		throwIfAborted(hooks.shouldAbort)
		hooks.onProgress?.()
		const result = await snapdom(root, {
			width: clip.width,
			height: clip.height,
			dpr: Math.min(Math.max(window.devicePixelRatio || 1, 1), 3),
			backgroundColor: "#ffffff",
			clip,
		})
		throwIfAborted(hooks.shouldAbort)
		hooks.onProgress?.()
		const canvas = await result.toCanvas()
		throwIfAborted(hooks.shouldAbort)
		const outputCanvas = document.createElement("canvas")
		outputCanvas.width = outputWidth
		outputCanvas.height = outputHeight
		const context = outputCanvas.getContext("2d")
		if (!context) throw new Error("Canvas 2D context is unavailable")
		context.drawImage(
			canvas,
			0,
			0,
			canvas.width,
			canvas.height,
			0,
			0,
			outputWidth,
			outputHeight,
		)
		hooks.onProgress?.()
		throwIfAborted(hooks.shouldAbort)
		return await encodeCanvasToScreenshotBlob(outputCanvas, hooks.shouldAbort)
	} finally {
		style.remove()
	}
}
