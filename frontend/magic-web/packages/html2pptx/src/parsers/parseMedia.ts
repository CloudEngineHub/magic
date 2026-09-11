/**
 * Media parser.
 * Converts HTML <video> and <audio> elements into PPT media nodes.
 */

import type { ElementNode } from "../ir/dom"
import type { PPTMediaNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { pxToInch } from "../shared/unit"
import {
	createMediaAssetKey,
	getOriginalMediaCoverPath,
	getOriginalMediaPath,
} from "../media/asset-identity"
import { createMediaSourceDescriptor } from "../media/source-descriptor"

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
	const sourceElement = video.querySelector("source")
	const src = video.src || sourceElement?.src

	if (!src) {
		log(LogLevel.L3, "Video element has no src")
		return null
	}

	const poster = video.poster?.trim()
	const mediaBase = resolveVideoMediaBase(node, base, config, video)
	const assetKey = createMediaAssetKey(
		"video",
		getOriginalMediaPath(video) ??
			(sourceElement ? getOriginalMediaPath(sourceElement) : undefined),
	)
	const coverAssetKey = createMediaAssetKey("cover", getOriginalMediaCoverPath(video))
	const source = createMediaSourceDescriptor(src, { key: assetKey })
	const coverSource = poster
		? createMediaSourceDescriptor(poster, { key: coverAssetKey })
		: undefined

	return {
		...mediaBase,
		type: "media",
		mediaType: "video",
		assetKey,
		coverAssetKey,
		source,
		coverSource,
		coverCaptureElement: poster ? undefined : video,
	}
}

function resolveVideoMediaBase(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	video: HTMLVideoElement,
): PPTNodeBase {
	const parentRect = node.parent?.rect
	if (
		parentRect &&
		parentRect.w > 0 &&
		parentRect.h > 0 &&
		(node.rect.w <= 0 || node.rect.h <= 0)
	) {
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
function parseAudioElement(audio: HTMLAudioElement, base: PPTNodeBase): PPTMediaNode | null {
	const sourceElement = audio.querySelector("source")
	const src = audio.src || sourceElement?.src

	if (!src) {
		log(LogLevel.L3, "Audio element has no src")
		return null
	}
	const assetKey = createMediaAssetKey(
		"audio",
		getOriginalMediaPath(audio) ??
			(sourceElement ? getOriginalMediaPath(sourceElement) : undefined),
	)

	return {
		...base,
		type: "media",
		mediaType: "audio",
		assetKey,
		 source: createMediaSourceDescriptor(src, { key: assetKey }),
	}
}

/**
 * Resolve a media extension from a pathname or signed object-storage metadata.
 * Kept as a public compatibility helper for callers that used the pre-descriptor API.
 */
const MEDIA_EXTENSIONS = new Set([
	"mp4", "mov", "m4v", "webm", "avi", "wmv", "mpeg", "mpg",
	"mp3", "wav", "m4a", "aac", "ogg", "oga", "flac", "wma",
])

const MIME_EXTENSIONS: Record<string, string> = {
	"video/mp4": "mp4", "video/quicktime": "mov", "video/x-m4v": "m4v",
	"video/webm": "webm", "video/mpeg": "mpeg", "audio/mpeg": "mp3",
	"audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a",
	"audio/x-m4a": "m4a", "audio/aac": "aac", "audio/ogg": "ogg",
	"audio/flac": "flac",
}

export function getFileExtension(url: string): string | undefined {
	const normalize = (value?: string) => {
		const extension = value?.trim().replace(/^\.+/, "").toLowerCase()
		return extension && MEDIA_EXTENSIONS.has(extension) ? extension : undefined
	}
	const fromDisposition = (value: string | null) => {
		const match = value?.match(/filename\*?\s*=\s*(?:UTF-8''|["']?)([^"';]+)/i)
		return normalize(match?.[1]?.split("/").pop()?.split("?")[0].split("#")[0].split(".").pop())
	}
	try {
		const parsed = new URL(url, "http://dummy")
		const pathExtension = normalize(parsed.pathname.match(/\.([a-z0-9]{1,5})$/i)?.[1])
		if (pathExtension) return pathExtension
		const disposition = fromDisposition(
			parsed.searchParams.get("response-content-disposition") ??
				parsed.searchParams.get("content-disposition"),
		)
		if (disposition) return disposition
		const mime = parsed.searchParams.get("response-content-type") ?? parsed.searchParams.get("content-type")
		return mime ? MIME_EXTENSIONS[mime.split(";", 1)[0].trim().toLowerCase()] : undefined
	} catch {
		return normalize(url.match(/\.([a-zA-Z0-9]{1,5})(?:\?|#|$)/)?.[1])
	}
}
