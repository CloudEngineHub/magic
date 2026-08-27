/**
 * Media parser.
 * Converts HTML <video> and <audio> elements into PPT media nodes.
 */

import type { ElementNode } from "../ir/dom"
import type { PPTMediaNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { pxToInch } from "../shared/unit"

/**
 * Parse a media element.
 */
export function parseMedia(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	_iWindow: Window,
): PPTMediaNode | null {
	const { element, tagName } = node

	if (tagName === "VIDEO") {
		return parseVideoElement(node, base, config)
	}

	if (tagName === "AUDIO") {
		return parseAudioElement(element as HTMLAudioElement, base)
	}

	return null
}

/**
 * Parse a video element.
 */
function parseVideoElement(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
): PPTMediaNode | null {
	const video = node.element as HTMLVideoElement
	const src = video.src || video.querySelector("source")?.src

	if (!src) {
		log(LogLevel.L3, "Video element has no src")
		return null
	}

	const poster = video.poster?.trim()
	const cover = poster || undefined
	const extn = getFileExtension(src) ?? "mp4"
	const mediaBase = resolveVideoMediaBase(node, base, config, video)

	return {
		...mediaBase,
		type: "media",
		mediaType: "video",
		path: src,
		cover,
		coverCaptureElement:
			poster && poster.startsWith("data:")
				? undefined
				: video,
		extn,
	}
}

function resolveVideoMediaBase(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	video: HTMLVideoElement,
): PPTNodeBase {
	const parentRect = node.parent?.rect
	if (parentRect && parentRect.w > 0 && parentRect.h > 0 && (node.rect.w <= 0 || node.rect.h <= 0)) {
		return {
			...base,
			x: pxToInch(parentRect.x, config),
			y: pxToInch(parentRect.y, config),
			w: pxToInch(parentRect.w, config),
			h: pxToInch(parentRect.h, config),
		}
	}

	if (node.rect.w > 0 && node.rect.h <= 0 && video.videoWidth > 0 && video.videoHeight > 0) {
		return {
			...base,
			h: pxToInch((node.rect.w * video.videoHeight) / video.videoWidth, config),
		}
	}

	if (node.rect.h > 0 && node.rect.w <= 0 && video.videoWidth > 0 && video.videoHeight > 0) {
		return {
			...base,
			w: pxToInch((node.rect.h * video.videoWidth) / video.videoHeight, config),
		}
	}

	return base
}

/**
 * Parse an audio element.
 */
function parseAudioElement(
	audio: HTMLAudioElement,
	base: PPTNodeBase,
): PPTMediaNode | null {
	const src = audio.src || audio.querySelector("source")?.src

	if (!src) {
		log(LogLevel.L3, "Audio element has no src")
		return null
	}

	const extn = getFileExtension(src) ?? "mp3"

	return {
		...base,
		type: "media",
		mediaType: "audio",
		path: src,
		extn,
	}
}


/**
 * Get the file extension from a media URL.
 */
const MEDIA_EXTENSIONS = new Set([
	"mp4",
	"mov",
	"m4v",
	"webm",
	"avi",
	"wmv",
	"mpeg",
	"mpg",
	"mp3",
	"wav",
	"m4a",
	"aac",
	"ogg",
	"oga",
	"flac",
	"wma",
])

const MIME_EXTENSIONS: Record<string, string> = {
	"video/mp4": "mp4",
	"video/quicktime": "mov",
	"video/x-m4v": "m4v",
	"video/webm": "webm",
	"video/mpeg": "mpeg",
	"audio/mpeg": "mp3",
	"audio/wav": "wav",
	"audio/x-wav": "wav",
	"audio/mp4": "m4a",
	"audio/x-m4a": "m4a",
	"audio/aac": "aac",
	"audio/ogg": "ogg",
	"audio/flac": "flac",
}

/**
 * Get a safe media extension from a URL or a signed URL's response metadata.
 * Object-storage URLs often have no extension in pathname and put the filename
 * or MIME type in query parameters instead.
 */
export function getFileExtension(url: string): string | undefined {
	const normalizeExtension = (value: string | undefined): string | undefined => {
		const extension = value?.trim().replace(/^\.+/, "").toLowerCase()
		return extension && MEDIA_EXTENSIONS.has(extension) ? extension : undefined
	}

	const extensionFromMime = (value: string | null): string | undefined => {
		if (!value) return undefined
		return MIME_EXTENSIONS[value.split(";", 1)[0].trim().toLowerCase()]
	}

	const extensionFromDisposition = (value: string | null): string | undefined => {
		if (!value) return undefined
		const match = value.match(/filename\*?\s*=\s*(?:UTF-8''|["']?)([^"';]+)/i)
		if (!match?.[1]) return undefined
		try {
			return normalizeExtension(match[1].split("/").pop()?.split("?")[0].split("#")[0].split(".").pop())
		} catch {
			return undefined
		}
	}

	try {
		const parsed = new URL(url, "http://dummy")
		const pathMatch = parsed.pathname.match(/\.([a-z0-9]{1,5})$/i)
		const pathExtension = normalizeExtension(pathMatch?.[1])
		if (pathExtension) return pathExtension

		const dispositionExtension = extensionFromDisposition(
			parsed.searchParams.get("response-content-disposition") ??
				parsed.searchParams.get("content-disposition"),
		)
		if (dispositionExtension) return dispositionExtension

		const mimeExtension = extensionFromMime(
			parsed.searchParams.get("response-content-type") ??
				parsed.searchParams.get("content-type"),
		)
		if (mimeExtension) return mimeExtension
	} catch {
		const match = url.match(/\.([a-zA-Z0-9]{1,5})(?:\?|#|$)/)
		return normalizeExtension(match?.[1])
	}
	return undefined
}
