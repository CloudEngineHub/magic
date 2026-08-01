import type { ResourceLoadError } from "../api/options"
import type { PPTImageNode, PPTNode } from "../ir/node"
import { log, LogLevel } from "../logger"
import {
	bytesMediaSourceDescriptor,
	normalizeMediaSourceDescriptor,
	withMediaSourceKey,
} from "../media/source-descriptor"

type ResourceErrorReporter = (error: ResourceLoadError) => void

export async function materializePptImageNodes(
	nodes: PPTNode[],
	signal?: AbortSignal,
	onResourceError?: ResourceErrorReporter,
): Promise<void> {
	const imageNodes = nodes.filter((n): n is PPTImageNode => n.type === "image")
	for (const node of imageNodes) {
		await materializePptImageNode(node, signal, onResourceError)
	}
	log(LogLevel.L2, `基础物化 ${imageNodes.length} 个图片节点完成`)
}

async function materializePptImageNode(
	node: PPTImageNode,
	signal?: AbortSignal,
	onResourceError?: ResourceErrorReporter,
): Promise<void> {
	const src = node.src
	if (node.source) {
		node.source = withMediaSourceKey(node.source, node.assetKey)
		node.captureElement = undefined
		return
	}
	if (node.srcBytes?.data.byteLength) {
		node.source = bytesMediaSourceDescriptor({
			data: node.srcBytes.data,
			contentType: node.srcBytes.mime,
			key: node.assetKey,
		})
		node.srcBytes = undefined
		node.src = ""
		node.captureElement = undefined
		return
	}
	if (!src?.trim()) {
		node.captureElement = undefined
		return
	}

	try {
		if (signal?.aborted) throw signal.reason
		node.source = await normalizeMediaSourceDescriptor(src, { key: node.assetKey })
		// The descriptor is now authoritative. Clearing `src` prevents retaining a
		// second (potentially base64) copy through render and package stages.
		node.src = ""
	} catch (error) {
		if (signal?.aborted) throw error
		log(LogLevel.L3, "image unreachable, dropping", {
			src: src.slice(0, 80),
			error: String(error),
		})
		onResourceError?.({
			url: src.slice(0, 200),
			kind: "image",
			reason: "load-error",
		})
		node.src = ""
	}

	node.captureElement = undefined
}
