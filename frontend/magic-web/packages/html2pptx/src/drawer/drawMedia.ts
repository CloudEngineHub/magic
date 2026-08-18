import type { PPTMediaNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { throwIfAborted } from "../sandbox/abort"

interface MediaOptions {
	x: number
	y: number
	w: number
	h: number
	type: "video" | "audio" | "online"
	path?: string
	data?: string
	source?: PPTMediaNode["source"]
	link?: string
	cover?: string
	coverSource?: PPTMediaNode["coverSource"]
	extn?: string
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
	const { x, y, w, h, mediaType, path, data, source, link, extn } = node
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
			if (mediaType === "video") {
				if (coverSource) options.coverSource = coverSource
				else if (node.cover?.startsWith("data:")) options.cover = node.cover
			}
			if (extn) options.extn = extn

			if (source) {
				options.source = source
				slide.addMedia(options)
			} else if (data) {
				options.data = data
				slide.addMedia(options)
			} else if (path) {
				if (path.startsWith("data:")) {
					options.data = path
				} else {
					options.path = path
				}
				slide.addMedia(options)
			} else {
				log(LogLevel.L3, "Media requires path or data")
			}
			break

		default:
			log(LogLevel.L3, "Unknown media type", { mediaType })
	}
}
