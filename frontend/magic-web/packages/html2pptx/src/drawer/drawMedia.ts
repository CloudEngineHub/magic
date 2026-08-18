import type { PPTMediaNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { throwIfAborted } from "../sandbox/abort"

interface MediaOptions {
	x: number
	y: number
	w: number
	h: number
	type: "video" | "audio" | "online"
	source?: PPTMediaNode["source"]
	link?: string
	coverSource?: PPTMediaNode["coverSource"]
}

/**
 * Draw media onto the slide.
 * In the current export pipeline, media is materialized and written directly in this execution context.
 */
export async function drawMedia(
	slide: Slide,
	node: PPTMediaNode,
	signal?: AbortSignal,
): Promise<void> {
	throwIfAborted(signal)
	const { x, y, w, h, mediaType, source, link } = node
	const coverSource = node.coverSource

	const options: MediaOptions = {
		x,
		y,
		w,
		h,
		type: mediaType,
	}

	switch (mediaType) {
		case "online":
			if (!link) {
				log(LogLevel.L3, "Online video requires link")
				return
			}
			options.link = link
			slide.addMedia(options)
			break

		case "video":
		case "audio":
			if (!source) {
				throw new TypeError(`${mediaType} node must provide a source descriptor`)
			}
			if (mediaType === "video") {
				if (coverSource) options.coverSource = coverSource
			}
			options.source = source
			slide.addMedia(options)
			break

		default:
			log(LogLevel.L3, "Unknown media type", { mediaType })
	}
}
