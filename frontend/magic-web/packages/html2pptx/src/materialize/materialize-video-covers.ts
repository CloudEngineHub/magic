import type { PPTNode } from "../ir/node"
import type { ResourceLoadError } from "../api/options"

export async function materializeVideoCoverNodes(
	_nodes: PPTNode[],
	_signal?: AbortSignal,
	_onResourceError?: (error: ResourceLoadError) => void,
): Promise<void> {
	// 默认实现不主动截取视频首帧，扩展实现可覆盖该逻辑。
}
