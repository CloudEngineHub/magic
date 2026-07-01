import type { PPTImageNode } from "../ir/node"

export async function capturePptImageSnapdomToDataUrl(
	_node: PPTImageNode,
): Promise<string | null> {
	return null
}

export const captureImageNode = capturePptImageSnapdomToDataUrl
