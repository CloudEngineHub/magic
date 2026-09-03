import { captureElementToCanvas } from "@magic-web/html2image"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { processHtmlContent } from "@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor"
import {
	decodeHTMLEntities,
	getFullContent,
} from "@/pages/superMagic/components/Detail/contents/HTML/utils/full-content"
import { getFileContentById } from "@/pages/superMagic/utils/api"

const COVER_WIDTH = 1280
const COVER_HEIGHT = 800
const COVER_QUALITY = 0.82
const IFRAME_LOAD_TIMEOUT_MS = 10_000
const RESOURCE_WAIT_TIMEOUT_MS = 3_000

interface CaptureMicroAppCoverInput {
	entryFile: AttachmentItem
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
}

function waitForIframeLoad(iframe: HTMLIFrameElement): Promise<void> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => {
			cleanup()
			reject(new Error("Micro app cover render timed out"))
		}, IFRAME_LOAD_TIMEOUT_MS)

		function cleanup() {
			window.clearTimeout(timeout)
			iframe.removeEventListener("load", handleLoad)
			iframe.removeEventListener("error", handleError)
		}

		function handleLoad() {
			cleanup()
			resolve()
		}

		function handleError() {
			cleanup()
			reject(new Error("Micro app cover render failed"))
		}

		iframe.addEventListener("load", handleLoad)
		iframe.addEventListener("error", handleError)
	})
}

function waitForTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | undefined> {
	return new Promise((resolve, reject) => {
		const timeout = window.setTimeout(() => resolve(undefined), timeoutMs)
		promise.then(
			(value) => {
				window.clearTimeout(timeout)
				resolve(value)
			},
			(error) => {
				window.clearTimeout(timeout)
				reject(error)
			},
		)
	})
}

async function waitForImages(doc: Document): Promise<void> {
	const images = Array.from(doc.images)
	images.forEach((image) => {
		if (image.loading === "lazy") image.loading = "eager"
	})

	const pending = images.filter((image) => !image.complete)
	if (pending.length === 0) return

	await waitForTimeout(
		Promise.all(
			pending.map(
				(image) =>
					new Promise<void>((resolve) => {
						image.addEventListener("load", () => resolve(), { once: true })
						image.addEventListener("error", () => resolve(), { once: true })
					}),
			),
		).then(() => undefined),
		RESOURCE_WAIT_TIMEOUT_MS,
	)
}

async function waitForRenderingReady(doc: Document): Promise<void> {
	if (doc.fonts?.ready) {
		await waitForTimeout(
			doc.fonts.ready.then(() => undefined),
			RESOURCE_WAIT_TIMEOUT_MS,
		)
	}
	await waitForImages(doc)

	const win = doc.defaultView
	for (let index = 0; index < 2; index += 1) {
		await new Promise<void>((resolve) => {
			if (win?.requestAnimationFrame) {
				win.requestAnimationFrame(() => resolve())
				return
			}
			window.setTimeout(resolve, 16)
		})
	}
}

function prepareDocumentForCapture(doc: Document): void {
	const style = doc.createElement("style")
	style.dataset.microAppCoverCapture = "true"
	style.textContent = `
		html, body {
			width: ${COVER_WIDTH}px !important;
			height: ${COVER_HEIGHT}px !important;
			min-width: ${COVER_WIDTH}px !important;
			min-height: ${COVER_HEIGHT}px !important;
			overflow: hidden !important;
		}
		*, *::before, *::after {
			animation-play-state: paused !important;
			transition: none !important;
			caret-color: transparent !important;
		}
	`
	doc.head?.appendChild(style)

	doc.querySelectorAll<HTMLMediaElement>("video, audio").forEach((media) => {
		try {
			media.pause()
			media.currentTime = 0
		} catch {
			// 部分媒体资源未加载完成时无法重置，不影响静态截图。
		}
	})
}

function canvasToCoverBlob(source: HTMLCanvasElement): Promise<Blob> {
	if (source.width <= 0 || source.height <= 0) {
		throw new Error("Micro app cover screenshot is empty")
	}

	const output = document.createElement("canvas")
	output.width = COVER_WIDTH
	output.height = COVER_HEIGHT
	const context = output.getContext("2d")
	if (!context) throw new Error("Micro app cover canvas is not available")

	const sourceRatio = source.width / source.height
	const targetRatio = COVER_WIDTH / COVER_HEIGHT
	let sourceX = 0
	let sourceY = 0
	let sourceWidth = source.width
	let sourceHeight = source.height

	if (sourceRatio > targetRatio) {
		sourceWidth = source.height * targetRatio
		sourceX = (source.width - sourceWidth) / 2
	} else if (sourceRatio < targetRatio) {
		sourceHeight = source.width / targetRatio
		sourceY = (source.height - sourceHeight) / 2
	}

	context.drawImage(
		source,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		COVER_WIDTH,
		COVER_HEIGHT,
	)

	return new Promise((resolve, reject) => {
		output.toBlob(
			(blob) => {
				output.width = 0
				output.height = 0
				if (blob) resolve(blob)
				else reject(new Error("Micro app cover encoding failed"))
			},
			"image/webp",
			COVER_QUALITY,
		)
	})
}

export async function captureHtmlAsMicroAppCover(content: string): Promise<Blob> {
	const container = document.createElement("div")
	container.style.cssText = `
		position: fixed;
		left: -20000px;
		top: 0;
		width: ${COVER_WIDTH}px;
		height: ${COVER_HEIGHT}px;
		pointer-events: none;
		z-index: -1;
	`

	const iframe = document.createElement("iframe")
	iframe.style.cssText = "width: 100%; height: 100%; border: 0;"
	iframe.setAttribute("sandbox", "allow-scripts allow-same-origin")
	iframe.setAttribute("allow", "")
	container.appendChild(iframe)

	const loaded = waitForIframeLoad(iframe)
	iframe.srcdoc = content
	document.body.appendChild(container)

	let sourceCanvas: HTMLCanvasElement | null = null
	try {
		await loaded
		const iframeDoc = iframe.contentDocument
		if (!iframeDoc?.documentElement || !iframeDoc.body) {
			throw new Error("Micro app cover document is not available")
		}

		prepareDocumentForCapture(iframeDoc)
		await waitForRenderingReady(iframeDoc)
		sourceCanvas = await captureElementToCanvas({
			element: iframeDoc.documentElement,
			signal: new AbortController().signal,
		})
		return await canvasToCoverBlob(sourceCanvas)
	} finally {
		if (sourceCanvas) {
			sourceCanvas.width = 0
			sourceCanvas.height = 0
		}
		iframe.src = "about:blank"
		container.remove()
	}
}

export async function captureMicroAppCover({
	entryFile,
	attachments,
	attachmentList,
}: CaptureMicroAppCoverInput): Promise<Blob> {
	const content = await prepareMicroAppCoverHtml({ entryFile, attachments, attachmentList })
	return captureHtmlAsMicroAppCover(content)
}

export async function prepareMicroAppCoverHtml({
	entryFile,
	attachments,
	attachmentList,
}: CaptureMicroAppCoverInput): Promise<string> {
	if (!entryFile.file_id) throw new Error("Micro app index.html is not available")

	const content = await getFileContentById(entryFile.file_id, { responseType: "text" })
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("Micro app index.html content is empty")
	}

	const fileName =
		entryFile.display_filename || entryFile.file_name || entryFile.filename || "index.html"
	const processed = await processHtmlContent({
		content,
		attachments,
		fileId: entryFile.file_id,
		fileName,
		attachmentList,
	})

	return getFullContent(decodeHTMLEntities(processed.processedContent), entryFile.file_id, {
		disableParentClickBridge: true,
		dynamicInterception: { enable: false },
	})
}
