import type { PPTImageNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { bytesMediaSourceDescriptor } from "../media/source-descriptor"

export function drawImage(slide: Slide, node: PPTImageNode): void {
	const { x, y, w, h, sizing, intrinsicSize, transparency, rotate } = node
	const source = resolveImageSource(node)
	const src = node.src

	if (!source && !src) return

	const isDataUrl = src?.startsWith("data:")
	const isRemoteUrl = src?.startsWith("http://") || src?.startsWith("https://")

	if (!source && !isDataUrl && !isRemoteUrl) {
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

	if (
		(sizing === "cover" || sizing === "contain") &&
		intrinsicSize &&
		Number.isFinite(intrinsicSize.width) &&
		Number.isFinite(intrinsicSize.height) &&
		intrinsicSize.width > 0 &&
		intrinsicSize.height > 0
	) {
		// PptxGenJS derives the source aspect ratio from the image option's initial w/h,
		// then replaces them with the sizing box. Use a normalized intrinsic frame here;
		// otherwise target w/h are mistaken for the source ratio and cover/contain becomes stretch.
		const maxDimension = Math.max(intrinsicSize.width, intrinsicSize.height)
		options.w = intrinsicSize.width / maxDimension
		options.h = intrinsicSize.height / maxDimension
	}

	if (source) {
		options.source = source
	} else if (isDataUrl) {
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
function resolveImageSource(node: PPTImageNode) {
	if (node.source) return node.source
	const bytes = node.srcBytes
	if (!bytes?.data.byteLength) return undefined
	return bytesMediaSourceDescriptor({ data: bytes.data, contentType: bytes.mime })
}
