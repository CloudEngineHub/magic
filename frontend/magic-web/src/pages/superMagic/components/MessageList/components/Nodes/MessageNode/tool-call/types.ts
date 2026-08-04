import type { MouseEvent, ReactNode } from "react"
import type { FileItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

export interface ToolDetail {
	type?: string
	data?: Record<string, unknown>
	[key: string]: unknown
}

export interface ToolCallItem {
	id: string
	type: "function"
	function: {
		name: string
		label: string
		arguments: string
	}
	tool?: {
		id?: string
		name?: string
		action?: string
		status?: string
		remark?: string
		detail?: ToolDetail
		attachments?: FileItem[] | null
		[key: string]: unknown
	}
}

export interface ToolCallViewModel {
	id?: string
	name?: string
	url?: string
	action?: string | ReactNode
	remark?: string
	status?: string
	attachments: FileItem[]
	rawArguments?: string
	detail?: ToolDetail
}

export interface ToolCallContainerProps {
	topicId: string
	correlationId: string
	/** 所属 Assistant 的逻辑身份，用于 RenderSession 完成前屏蔽 canonical Tool Response。 */
	ownerSuperMessageId?: string
	classNames?: string
	toolCall: ToolCallItem
	selectedTopic?: Topic | null
	isShare?: boolean
	onSelectDetail?: (detail: unknown) => void
	onMouseEnter?: (evt: MouseEvent) => void
	onMouseLeave?: (evt: MouseEvent) => void
}

export interface ToolCallRendererProps extends ToolCallContainerProps {
	toolData: ToolCallViewModel
	loading: boolean
	onClick: () => void
}

export function isRenderableToolCall(toolCall: unknown): toolCall is ToolCallItem {
	if (!toolCall || typeof toolCall !== "object") return false
	const candidate = toolCall as {
		id?: unknown
		function?: { name?: unknown }
	}
	return Boolean(
		typeof candidate.id === "string" &&
		candidate.id &&
		typeof candidate.function?.name === "string" &&
		candidate.function.name,
	)
}
