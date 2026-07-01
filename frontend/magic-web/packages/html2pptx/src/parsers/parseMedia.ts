/**
 * 媒体解析器
 * 将 HTML <video> 和 <audio> 转换为 PPT 媒体格式
 */

import type { ElementNode } from "../ir/dom"
import type { PPTMediaNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { pxToInch } from "../shared/unit"

/**
 * 解析媒体元素
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
 * 解析 video 元素
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
	const extn = getFileExtension(src)
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
 * 解析 audio 元素
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

	const extn = getFileExtension(src)

	return {
		...base,
		type: "media",
		mediaType: "audio",
		path: src,
		extn,
	}
}


/**
 * 获取文件扩展名
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
