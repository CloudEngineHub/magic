import type { ReactNode } from "react"
import type { AttachmentItem } from "./hooks/types"
import type { TreeNodeData } from "./utils/treeDataConverter"

export interface TopicFileRowDecorationContext {
	item: AttachmentItem
	node: TreeNodeData
	isVirtual: boolean
}

export interface TopicFileRowDecoration {
	icon?: ReactNode
	tag?: ReactNode
	/** 行级样式类，用于扩展文件树节点的视觉状态。 */
	className?: string
}

export interface TopicFileRowDecorationResolver {
	(context: TopicFileRowDecorationContext): TopicFileRowDecoration | null | undefined
}
