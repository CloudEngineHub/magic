import type { ResourceLoadError } from "../api/options"
import type { PPTNode } from "../ir/node"

export async function resolveCaptures(
	_nodes: PPTNode[],
	_signal?: AbortSignal,
	_onResourceError?: (error: ResourceLoadError) => void,
): Promise<void> {
	return
}
