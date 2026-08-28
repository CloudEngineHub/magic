import type { SuperMagicMessageItem } from "./type"
import type { StreamState } from "../../stores/types"
import { trimIncompleteCitationTag } from "../../utils/citations"

interface ProjectedMessageNode {
	reasoning_content?: unknown
	content?: unknown
	tool_calls?: unknown
}

export interface ResolveBottomLoadingVisibilityParams {
	showLoading: boolean
	activeStreamSuperMessageIds: readonly string[]
	visibleMessages: readonly SuperMagicMessageItem[]
	resolveMessageNode: (superMessageId: string) => ProjectedMessageNode | undefined
	resolveStreamStage: (superMessageId: string) => StreamState["stage"] | undefined
}

function hasVisibleText(value: unknown): value is string {
	return typeof value === "string" && !/^\s*$/.test(value)
}

function hasRenderableToolCall(toolCalls: unknown): boolean {
	if (!Array.isArray(toolCalls)) return false

	return toolCalls.some((toolCall) => {
		if (!toolCall || typeof toolCall !== "object") return false
		const candidate = toolCall as {
			id?: unknown
			function?: { name?: unknown }
		}
		const toolId = typeof candidate.id === "string" ? candidate.id.trim() : ""
		const toolName =
			typeof candidate.function?.name === "string" ? candidate.function.name.trim() : ""

		// MessageNode explicitly suppresses this internal tool, so it cannot replace the
		// bottom fallback even though its transport identity is otherwise complete.
		return Boolean(toolId && toolName && toolName !== "run_sdk_snippet")
	})
}

function hasVisibleStreamProgress(
	node: ProjectedMessageNode | undefined,
	streamStage: StreamState["stage"] | undefined,
): boolean {
	if (!node) return false
	if (hasVisibleText(node.reasoning_content)) return true

	const rawContent = typeof node.content === "string" ? node.content : ""
	// Match MessageNode's streaming display boundary: an incomplete citation marker may
	// exist in messageMap while the safe Markdown projection is still visually empty.
	const displayContent =
		streamStage === "content" ? trimIncompleteCitationTag(rawContent) : rawContent
	if (hasVisibleText(displayContent)) return true

	return hasRenderableToolCall(node.tool_calls)
}

export function resolveBottomLoadingVisibility({
	showLoading,
	activeStreamSuperMessageIds,
	visibleMessages,
	resolveMessageNode,
	resolveStreamStage,
}: ResolveBottomLoadingVisibilityParams): boolean {
	const activeStreamIds = activeStreamSuperMessageIds.filter(
		(superMessageId) => typeof superMessageId === "string" && superMessageId.trim().length > 0,
	)
	const visibleMessageIds = new Set(
		visibleMessages
			.map((message) => message?.super_message_id)
			.filter(
				(superMessageId): superMessageId is string =>
					typeof superMessageId === "string" && superMessageId.trim().length > 0,
			),
	)
	const hasActiveStream = activeStreamIds.length > 0
	const hasVisibleActiveStreamProgress = activeStreamIds.some(
		(superMessageId) =>
			visibleMessageIds.has(superMessageId) &&
			hasVisibleStreamProgress(
				resolveMessageNode(superMessageId),
				resolveStreamStage(superMessageId),
			),
	)

	return (showLoading || hasActiveStream) && !hasVisibleActiveStreamProgress
}
