import type { PPTNode } from "../ir/node"
import type { ResourceLoadError } from "../api/options"

export async function materializeVideoCoverNodes(
	_nodes: PPTNode[],
	_signal?: AbortSignal,
	_onResourceError?: (error: ResourceLoadError) => void,
): Promise<void> {
	// The default implementation does not actively capture the first video frame; extensions can override this logic.
}
