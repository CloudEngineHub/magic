import type { PPTMediaNode, Slide } from "../ir/node"
import { log, LogLevel } from "../logger"
import { throwIfAborted, withAbort } from "../sandbox/abort"
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
 * 绘制媒体到幻灯片。
 * 新版导出链路中，媒体在当前执行上下文内直接物化并写入。
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
			// cover：HTML poster，或 materializeVideoCoverNodes 写入的首帧 data URL（可能由字节透传后在此转换）
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
							task: fetchAsDataUrl(path),
							signal,
						})
					} catch (error) {
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

async function fetchAsDataUrl(url: string): Promise<string> {
	const response = await fetch(url)
	if (!response.ok) throw new Error(`Failed to fetch media: ${url} (${response.status})`)

	const buffer = await response.arrayBuffer()
	const mimeType = response.headers.get("content-type") ?? "application/octet-stream"
	return bytesToDataUrl(buffer, mimeType)
}

/**
 * 解析视频封面：优先用透传的二进制字节（打包 worker 内转 data URL），
 * 否则回退到 `cover`（poster / 首帧截图 data URL）。
 */
function resolveCover(node: PPTMediaNode): string | undefined {
	const bytes = node.coverBytes
	if (bytes && bytes.data.byteLength > 0) {
		return bytesToDataUrl(bytes.data, bytes.mime)
	}
	return node.cover
}
