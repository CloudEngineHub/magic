import type {
	PPTBorderLineNode,
	PPTImageNode,
	PPTMediaNode,
	PPTNode,
	PPTShapeNode,
	PPTTableNode,
	PPTTextNode,
} from "./node"
import type { SlideConfig } from "../api/options"
import type { EmbedFontInput } from "../api/font"

/**
 * 序列化层：跨 Worker 边界的 PPT 节点形态 + 包装函数。
 * 主线程 → Worker 的 postMessage 必须使用 SerializablePPTNode（已剥离 DOM 引用）。
 */

export interface SerializablePPTImageNode
	extends Omit<
		PPTImageNode,
		"capture" | "captureElement" | "captureBackgroundOnly" | "captureExcludeSvgText"
	> {}

export interface SerializablePPTShapeNode extends PPTShapeNode {}

export interface SerializablePPTTextNode extends PPTTextNode {}

export interface SerializablePPTTableNode extends PPTTableNode {}

export interface SerializablePPTBorderLineNode extends PPTBorderLineNode {}

export interface SerializablePPTMediaNode extends Omit<PPTMediaNode, "coverCaptureElement"> {}

export type SerializablePPTNode =
	| SerializablePPTShapeNode
	| SerializablePPTImageNode
	| SerializablePPTTextNode
	| SerializablePPTTableNode
	| SerializablePPTBorderLineNode
	| SerializablePPTMediaNode

// ============================================================================
// Worker 消息契约
// ============================================================================

export interface PackagePresentationInput {
	config: SlideConfig
	fileName: string
	slides: SerializablePPTNode[][]
	/** 每页幻灯片的背景色 (hex without #)，长度与 slides 对齐 */
	slideBackgrounds?: (string | null)[]
	/** 需要嵌入的字体列表，由主线程提前下载好 ArrayBuffer 后传入 */
	embedFonts?: EmbedFontInput[]
}

export interface PackagePresentationWorkerRequest {
	type: "package"
	payload: PackagePresentationInput
}

export interface PackagePresentationWorkerSuccess {
	type: "success"
	buffer: ArrayBuffer
}

export interface PackagePresentationWorkerError {
	type: "error"
	error: string
}

export type PackagePresentationWorkerResponse =
	| PackagePresentationWorkerSuccess
	| PackagePresentationWorkerError

// ============================================================================
// 节点 → 可序列化节点
// ============================================================================

/**
 * 将 PPT 节点剥离 DOM 引用，使其可通过 postMessage 传给 Worker。
 */
export function serializePptNodes(nodes: PPTNode[]): SerializablePPTNode[] {
	return nodes.map((node) => {
		if (node.type === "image") {
			const {
				capture,
				captureElement,
				captureBackgroundOnly,
				captureExcludeSvgText,
				...serializableNode
			} = node
			void capture
			void captureElement
			void captureBackgroundOnly
			void captureExcludeSvgText
			return serializableNode as SerializablePPTNode
		}

		if (node.type === "media") {
			const { coverCaptureElement, ...serializableNode } = node
			void coverCaptureElement
			return serializableNode as SerializablePPTNode
		}

		return { ...node } as SerializablePPTNode
	})
}
