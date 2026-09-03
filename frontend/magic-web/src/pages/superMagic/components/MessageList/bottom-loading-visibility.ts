import type { SuperMagicMessageItem } from "./type"
import type { StreamState } from "../../stores/types"
import { trimIncompleteCitationTag } from "../../utils/citations"

interface ProjectedMessageNode {
	reasoning_content?: unknown
	content?: unknown
	tool_calls?: unknown
}

/**
 * 判定"是否仍在推进"所需的接收侧流式快照子集。
 * Store 的 StreamState 结构天然满足该接口,测试可以只构造这几个字段。
 */
export interface BottomLoadingStreamSnapshot {
	stage: StreamState["stage"]
	content?: unknown
	reasoning_content?: unknown
	tool_calls?: unknown
	isFinalMessageReceived?: boolean
}

export interface ResolveBottomLoadingVisibilityParams {
	showLoading: boolean
	/** Topic 级任务状态为 running。覆盖"消息 N Final 与消息 N+1 首 chunk 之间"没有任何流身份的空档。 */
	isTopicTaskRunning: boolean
	activeStreamSuperMessageIds: readonly string[]
	visibleMessages: readonly SuperMagicMessageItem[]
	resolveMessageNode: (superMessageId: string) => ProjectedMessageNode | undefined
	resolveStreamState: (superMessageId: string) => BottomLoadingStreamSnapshot | undefined
}

export interface BottomLoadingVisibility {
	/** 冷启动兜底:任务已启动但活跃流尚未形成任何可见输出,立即显示,无需防抖。 */
	showImmediately: boolean
	/**
	 * 话题仍在生成,但所有可见输出都已停止推进(打字机追平接收缓冲、
	 * 又没有工具卡片承接进度指示)。chunk 间隙本来就有几百毫秒,
	 * 该信号必须经 UI 层防抖后才能转为可见 Loading。
	 */
	isGenerationStalled: boolean
}

function hasVisibleText(value: unknown): value is string {
	return typeof value === "string" && !/^\s*$/.test(value)
}

function isRenderableToolCall(toolCall: unknown): boolean {
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
}

function countRenderableToolCalls(toolCalls: unknown): number {
	if (!Array.isArray(toolCalls)) return 0
	return toolCalls.filter(isRenderableToolCall).length
}

function toTextLength(value: unknown): number {
	return typeof value === "string" ? value.length : 0
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

	return countRenderableToolCalls(node.tool_calls) > 0
}

/**
 * 一条活跃流是否仍在给用户产生"看得见的推进":
 * - 投影节点(messageMap)落后于接收缓冲(StreamState)时,打字机还有内容可播;
 * - 接收缓冲已出现可渲染 tool_call 且 Final 未到时,工具卡片自带运行状态,
 *   由它承接进度指示,底部兜底 Loading 不应叠加。
 * 两者都不成立(收到的都画完了、又没有工具卡片在场)即为 stalled 候选,
 * 对应"content 流式完成、等待下一个 chunk"的静止阶段。
 */
function isStreamVisuallyAdvancing(
	node: ProjectedMessageNode | undefined,
	streamSnapshot: BottomLoadingStreamSnapshot | undefined,
): boolean {
	if (!streamSnapshot) return false
	if (toTextLength(node?.reasoning_content) < toTextLength(streamSnapshot.reasoning_content))
		return true
	if (toTextLength(node?.content) < toTextLength(streamSnapshot.content)) return true

	const receivedToolCount = countRenderableToolCalls(streamSnapshot.tool_calls)
	if (countRenderableToolCalls(node?.tool_calls) < receivedToolCount) return true

	return receivedToolCount > 0 && !streamSnapshot.isFinalMessageReceived
}

export function resolveBottomLoadingVisibility({
	showLoading,
	isTopicTaskRunning,
	activeStreamSuperMessageIds,
	visibleMessages,
	resolveMessageNode,
	resolveStreamState,
}: ResolveBottomLoadingVisibilityParams): BottomLoadingVisibility {
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
				resolveStreamState(superMessageId)?.stage,
			),
	)

	const showImmediately = (showLoading || hasActiveStream) && !hasVisibleActiveStreamProgress

	const isTopicGenerating = showLoading || hasActiveStream || isTopicTaskRunning
	const hasAdvancingVisibleStream = activeStreamIds.some((superMessageId) =>
		isStreamVisuallyAdvancing(
			resolveMessageNode(superMessageId),
			resolveStreamState(superMessageId),
		),
	)
	// showImmediately 已覆盖"完全无可见输出"的场景,stalled 只负责
	// "已经有可见输出、但推进停住了"的空档,两个分支保持互斥。
	const isGenerationStalled = isTopicGenerating && !showImmediately && !hasAdvancingVisibleStream

	return { showImmediately, isGenerationStalled }
}
