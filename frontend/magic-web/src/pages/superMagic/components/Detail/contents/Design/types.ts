import { CanvasDocument } from "@/components/CanvasDesign/runtime/document/types"

export interface DesignData {
	type: "design" | string
	/** 设计目录名 */
	name: string
	/**
	 * 信封 version，作为 magic.project.js 格式契约：
	 * - "1.0.0"（v1）：canvas 明文对象、重字段内联
	 * - "2.0.0"（v2）：canvas 压缩串、重字段拆到 element-details sidecar
	 * 保存时据此决定写 v1 还是 v2，保持「当前文件是什么版本就写什么版本」。
	 */
	version: string
	canvas?: CanvasDocument
}
