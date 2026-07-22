import type { ResourceLoadError } from "../api/options"
import type { PPTImageNode, PPTNode } from "../ir/node"
import { log, LogLevel } from "../logger"
import { withAbort } from "../sandbox/abort"
import { imageToBase64 } from "./image-to-base64"

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
	if (!src?.trim() || src.startsWith("data:")) {
		node.captureElement = undefined
		return
	}

	try {
		node.src = await withAbort({
			task: imageToBase64(src, signal),
			signal,
		})
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
