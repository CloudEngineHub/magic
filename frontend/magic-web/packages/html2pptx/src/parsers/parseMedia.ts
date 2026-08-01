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
	const cover = poster || undefined
	const extn = getFileExtension(src)
	const mediaBase = resolveVideoMediaBase(node, base, config, video)
	const assetKey = createMediaAssetKey(
		"video",
		getOriginalMediaPath(video) ??
			(sourceElement ? getOriginalMediaPath(sourceElement) : undefined),
	)
	const coverAssetKey = createMediaAssetKey("cover", getOriginalMediaCoverPath(video))

	return {
		...mediaBase,
		type: "media",
		mediaType: "video",
		path: src,
		assetKey,
		coverAssetKey,
		cover,
		coverCaptureElement: poster && poster.startsWith("data:") ? undefined : video,
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

	const extn = getFileExtension(src)

	return {
		...base,
		type: "media",
		mediaType: "audio",
		path: src,
		assetKey: createMediaAssetKey(
			"audio",
			getOriginalMediaPath(audio) ??
				(sourceElement ? getOriginalMediaPath(sourceElement) : undefined),
		),
		extn,
	}
}

/**
 * Get the file extension from a media URL.
 */
function getFileExtension(url: string): string | undefined {
	try {
		const pathname = new URL(url, "http://dummy").pathname
		const ext = pathname.split(".").pop()?.toLowerCase()
		if (ext && ext.length <= 5) {
			return ext
		}
	} catch {
		const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|#|$)/)
		if (match?.[1]) {
			return match[1].toLowerCase()
		}
	}
	return undefined
}
