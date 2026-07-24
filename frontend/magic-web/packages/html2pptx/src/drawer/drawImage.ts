import type { PPTImageNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { bytesToDataUrl } from "./data-url"


export function drawImage(slide: Slide, node: PPTImageNode): void {
	const { x, y, w, h, sizing, transparency, rotate } = node
	const src = resolveImageSrc(node)

	if (!src) return

	const isDataUrl = src.startsWith("data:")
	const isRemoteUrl = src.startsWith("http://") || src.startsWith("https://")

	if (!isDataUrl && !isRemoteUrl) {
		log(LogLevel.L3, "skip image: unsupported src format", {
			preview: src.slice(0, 80),
		})
		return
	}

	const options: Record<string, unknown> = {
		x,
		y,
		w,
		h,
	}

	if (isDataUrl) {
		options.data = src
	} else {
		options.path = src
	}

	if (rotate !== undefined) options.rotate = rotate

	if (transparency !== undefined) options.transparency = transparency

	if (sizing === "cover" || sizing === "contain") {
		options.sizing = {
			type: sizing,
			w,
			h,
		}
	} else if (sizing === "crop") {
		options.sizing = {
			type: "crop",
			w,
			h,
			x: 0,
			y: 0,
		}
	}

	try {
		slide.addImage(options)
	} catch (error) {
		log(LogLevel.L3, "Failed to add image", {
			src: String(src).slice(0, 80),
			error: String(error),
		})
		throw error
	}
}

/**
 * Resolve the image source: prefer transferred binary bytes, converted to a base64 data URL inside the packaging worker,
 * so the main thread does not keep large base64 strings; otherwise fall back to `src` (remote URL / data URL / fallback).
 */
function resolveImageSrc(node: PPTImageNode): string {
	const bytes = node.srcBytes
	if (bytes && bytes.data.byteLength > 0) {
		return bytesToDataUrl(bytes.data, bytes.mime)
	}
	return node.src
}
