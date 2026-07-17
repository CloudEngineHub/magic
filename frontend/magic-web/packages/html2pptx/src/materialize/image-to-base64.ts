import { fetchBlobWithLimit } from "../shared/fetch"
import { resolveImageMime, shouldConvertImageToWebp } from "./image-format"

export { isGifSource, isSvgSource } from "./image-format"

export interface ImageRoundingParams {
	radiusPx: number
	widthPx: number
	heightPx: number
	sizing: "contain" | "cover" | "crop" | "stretch"
}

export function computeTargetMaxPx(w: number, h: number): number {
	return Math.max(1, Math.round(Math.max(w, h) * 96))
}

export async function materializeImage(
	src: string,
	targetMaxPx?: number,
	rounding?: ImageRoundingParams,
	signal?: AbortSignal,
): Promise<{ dataUrl: string }> {
	const dataUrl = await imageToBase64(src, signal)
	const mime = resolveImageMime(getImageMime(dataUrl), src)
	const typedDataUrl = rewriteDataUrlMime(dataUrl, mime)
	if (!shouldConvertImageToWebp(mime, src)) {
		return { dataUrl: typedDataUrl }
	}

	return { dataUrl: await convertDataUrlToWebp(typedDataUrl, targetMaxPx, rounding, signal) }
}

export async function imageToBase64(src: string, signal?: AbortSignal): Promise<string> {
	if (src.startsWith("data:")) return src
	const { response, blob } = await fetchBlobWithLimit(src, signal)
	if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`)
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader()
		reader.onloadend = () => {
			if (typeof reader.result === "string") resolve(reader.result)
			else reject(new Error("FileReader did not return a string"))
		}
		reader.onerror = () => reject(new Error("FileReader failed"))
		reader.readAsDataURL(blob)
	})
}

function getImageMime(dataUrl: string): string {
	return dataUrl.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase() ?? ""
}

function rewriteDataUrlMime(dataUrl: string, mime: string): string {
	if (!mime.startsWith("image/") || !dataUrl.startsWith("data:")) return dataUrl
	const commaIndex = dataUrl.indexOf(",")
	if (commaIndex < 0) return dataUrl
	return `data:${mime};base64,${dataUrl.slice(commaIndex + 1)}`
}

function convertDataUrlToWebp(
	src: string,
	targetMaxPx: number | undefined,
	rounding: ImageRoundingParams | undefined,
	signal?: AbortSignal,
): Promise<string> {
	return new Promise((resolve, reject) => {
		if (signal?.aborted) {
			reject(new DOMException("Export aborted", "AbortError"))
			return
		}

		const image = new Image()
		const objectUrl = URL.createObjectURL(dataUrlToBlob(src))
		const cleanup = () => {
			URL.revokeObjectURL(objectUrl)
			image.onload = null
			image.onerror = null
			signal?.removeEventListener("abort", onAbort)
		}
		const onAbort = () => {
			cleanup()
			image.src = ""
			reject(new DOMException("Export aborted", "AbortError"))
		}

		signal?.addEventListener("abort", onAbort, { once: true })
		image.onload = () => {
			try {
				const width =
					rounding?.widthPx ??
					resizeWidth(
						image.naturalWidth || image.width,
						image.naturalHeight || image.height,
						targetMaxPx,
					).width
				const height =
					rounding?.heightPx ??
					resizeWidth(
						image.naturalWidth || image.width,
						image.naturalHeight || image.height,
						targetMaxPx,
					).height
				const canvas = document.createElement("canvas")
				canvas.width = Math.max(1, width)
				canvas.height = Math.max(1, height)
				const ctx = canvas.getContext("2d")
				if (!ctx) throw new Error("Canvas 2D context unavailable")

				if (rounding) {
					const radius = Math.max(0, rounding.radiusPx)
					ctx.beginPath()
					ctx.moveTo(radius, 0)
					ctx.arcTo(width, 0, width, height, radius)
					ctx.arcTo(width, height, 0, height, radius)
					ctx.arcTo(0, height, 0, 0, radius)
					ctx.arcTo(0, 0, width, 0, radius)
					ctx.closePath()
					ctx.clip()
				}

				ctx.drawImage(image, 0, 0, width, height)
				const output = canvas.toDataURL("image/webp", 0.85)
				if (!output.startsWith("data:image/webp"))
					throw new Error("WebP encoding is unavailable")
				cleanup()
				resolve(output)
			} catch (error) {
				cleanup()
				reject(error)
			}
		}
		image.onerror = () => {
			cleanup()
			reject(new Error("Failed to decode image for WebP conversion"))
		}
		image.src = objectUrl
	})
}

function resizeWidth(
	width: number,
	height: number,
	maxEdge?: number,
): { width: number; height: number } {
	if (!maxEdge || maxEdge <= 0 || Math.max(width, height) <= maxEdge) return { width, height }
	const scale = maxEdge / Math.max(width, height)
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	}
}

function dataUrlToBlob(dataUrl: string): Blob {
	const [header, payload] = dataUrl.split(",", 2)
	const mime = header.match(/^data:([^;]+)/i)?.[1] || "application/octet-stream"
	const binary = atob(payload || "")
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return new Blob([bytes], { type: mime })
}
