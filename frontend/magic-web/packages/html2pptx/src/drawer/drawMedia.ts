import type { PPTMediaNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { throwIfAborted, withAbort } from "../sandbox/abort"
import { fetchArrayBufferWithLimit } from "../shared/fetch"
import { bytesToDataUrl } from "./data-url"

interface MediaOptions {
	x: number
	y: number
	w: number
	h: number
	type: "video" | "audio" | "online"
	path?: string
	data?: string
	link?: string
	cover?: string
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
	const { x, y, w, h, mediaType, path, data, link, extn } = node
	const cover = resolveCover(node)

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
			// cover: HTML poster, or the first-frame data URL written by materializeVideoCoverNodes (possibly converted here from transferred bytes)
			if (cover && mediaType === "video" && cover.startsWith("data:")) options.cover = cover
			if (extn) options.extn = extn

			if (data) {
				options.data = data
				slide.addMedia(options)
			} else if (path) {
				if (path.startsWith("data:")) {
					options.data = path
					slide.addMedia(options)
				} else {
					try {
						options.data = await withAbort({
							task: fetchAsDataUrl(path, signal),
							signal,
						})
					} catch (error) {
						throwIfAborted(signal)
						log(LogLevel.L3, "Failed to convert media to data URL, fallback to path", {
							error: String(error),
						})
						options.path = path
					}
					slide.addMedia(options)
				}
			} else {
				log(LogLevel.L3, "Media requires path or data")
			}
			break

		default:
			log(LogLevel.L3, "Unknown media type", { mediaType })
	}
}

async function fetchAsDataUrl(url: string, signal?: AbortSignal): Promise<string> {
	const { response, buffer } = await fetchArrayBufferWithLimit(url, signal)
	if (!response.ok) throw new Error(`Failed to fetch media: ${url} (${response.status})`)

	const mimeType = response.headers.get("content-type") ?? "application/octet-stream"
	return bytesToDataUrl(buffer, mimeType)
}

/**
 * Resolve the video cover: prefer transferred binary bytes converted to a data URL inside the packaging worker,
 * otherwise fall back to `cover` (poster / first-frame screenshot data URL).
 */
function resolveCover(node: PPTMediaNode): string | undefined {
	const bytes = node.coverBytes
	if (bytes && bytes.data.byteLength > 0) {
		return bytesToDataUrl(bytes.data, bytes.mime)
	}
	return node.cover
}
