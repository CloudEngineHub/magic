import { extractTemplatePaletteFromPixels } from "./templateColorExtractionAlgorithm"
import type {
	TemplateColorExtractionRequest,
	TemplateColorExtractionResponse,
} from "./templateColorExtractionProtocol"
import { resolveTrustedTemplateColorUrl } from "./templateColorExtractionUrl"

const SAMPLE_SIZE = 48
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const FETCH_TIMEOUT_MS = 10_000

function assertWorkerCapabilities() {
	if (typeof OffscreenCanvas === "undefined") {
		throw new Error("OffscreenCanvas is not supported")
	}
	if (typeof createImageBitmap !== "function") {
		throw new Error("createImageBitmap is not supported")
	}
}

function resolveSafeImageUrl(imageUrl: string, allowedOrigins: string[]) {
	const url = resolveTrustedTemplateColorUrl({
		allowedOrigins,
		currentOrigin: self.location.origin,
		imageUrl,
	})
	if (!url) throw new Error("Template image URL origin is not allowed")
	return url.toString()
}

async function fetchImageBlob(imageUrl: string, allowedOrigins: string[]) {
	const abortController = new AbortController()
	const timeoutId = setTimeout(() => abortController.abort(), FETCH_TIMEOUT_MS)

	try {
		const response = await fetch(resolveSafeImageUrl(imageUrl, allowedOrigins), {
			cache: "force-cache",
			credentials: "same-origin",
			mode: "cors",
			referrerPolicy: "no-referrer",
			signal: abortController.signal,
		})
		if (!response.ok) throw new Error(`Image fetch failed: ${response.status}`)

		const contentLength = Number(response.headers.get("content-length") ?? 0)
		if (contentLength > MAX_IMAGE_BYTES) throw new Error("Image is too large")

		const blob = await response.blob()
		if (blob.type && !blob.type.startsWith("image/")) {
			throw new Error("Unsupported image content type")
		}
		if (blob.size > MAX_IMAGE_BYTES) throw new Error("Image is too large")
		return blob
	} finally {
		clearTimeout(timeoutId)
	}
}

async function extractTemplateColors(imageUrl: string, allowedOrigins: string[]) {
	assertWorkerCapabilities()
	const blob = await fetchImageBlob(imageUrl, allowedOrigins)
	const bitmap = await createImageBitmap(blob)

	try {
		// eslint-disable-next-line compat/compat -- 能力检测失败时直接返回，不在主线程降级计算。
		const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE)
		const context = canvas.getContext("2d", { willReadFrequently: true })
		if (!context) throw new Error("Canvas 2D context is not available")

		context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
		const imageData = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)
		return extractTemplatePaletteFromPixels(imageData.data)
	} finally {
		bitmap.close()
	}
}

self.onmessage = async (event: MessageEvent<TemplateColorExtractionRequest>) => {
	const { allowedOrigins, imageUrl, requestId } = event.data
	let response: TemplateColorExtractionResponse

	try {
		response = {
			colors: await extractTemplateColors(imageUrl, allowedOrigins),
			requestId,
		}
	} catch (error) {
		response = {
			colors: [],
			error: error instanceof Error ? error.message : "Template color extraction failed",
			requestId,
		}
	}

	self.postMessage(response)
}
