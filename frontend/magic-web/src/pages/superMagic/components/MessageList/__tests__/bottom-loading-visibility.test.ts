import { describe, expect, it } from "vitest"
import type { SuperMagicMessageItem } from "../type"
import { resolveBottomLoadingVisibility } from "../bottom-loading-visibility"

type ProjectedMessageNode = {
	reasoning_content?: unknown
	content?: unknown
	tool_calls?: unknown
}

function createVisibleMessage({
	superMessageId,
	appMessageId = "app-message",
	correlationId = "correlation-id",
}: {
	superMessageId?: string
	appMessageId?: string
	correlationId?: string
} = {}): SuperMagicMessageItem {
	return {
		type: "super_magic_message",
		role: "assistant",
		app_message_id: appMessageId,
		super_message_id: superMessageId,
		correlation_id: correlationId,
	} as unknown as SuperMagicMessageItem
}

function resolveVisibility({
	showLoading,
	activeStreamSuperMessageIds,
	visibleMessages,
	messageNodes = {},
	streamStages = {},
}: {
	showLoading: boolean
	activeStreamSuperMessageIds: string[]
	visibleMessages: SuperMagicMessageItem[]
	messageNodes?: Record<string, ProjectedMessageNode | undefined>
	streamStages?: Record<string, "reasoning_content" | "content" | "tool" | "done" | undefined>
}) {
	return resolveBottomLoadingVisibility({
		showLoading,
		activeStreamSuperMessageIds,
		visibleMessages,
		resolveMessageNode: (superMessageId) => messageNodes[superMessageId],
		resolveStreamStage: (superMessageId) => streamStages[superMessageId],
	})
}

describe("resolveBottomLoadingVisibility", () => {
	it.each([
		{
			label: "业务 Loading 开启且没有活跃流",
			showLoading: true,
			activeStreamSuperMessageIds: [],
			visibleMessages: [],
			expected: true,
		},
		{
			label: "业务 Loading 关闭且没有活跃流",
			showLoading: false,
			activeStreamSuperMessageIds: [],
			visibleMessages: [],
			expected: false,
		},
		{
			label: "业务 Loading 开启且活跃流尚不可见",
			showLoading: true,
			activeStreamSuperMessageIds: ["stream-a"],
			visibleMessages: [createVisibleMessage({ superMessageId: "message-b" })],
			expected: true,
		},
		{
			label: "业务 Loading 关闭但活跃流尚不可见",
			showLoading: false,
			activeStreamSuperMessageIds: ["stream-a"],
			visibleMessages: [createVisibleMessage({ superMessageId: "message-b" })],
			expected: true,
		},
		{
			label: "活跃流已经形成可见正文进度",
			showLoading: true,
			activeStreamSuperMessageIds: ["stream-a"],
			visibleMessages: [createVisibleMessage({ superMessageId: "stream-a" })],
			messageNodes: { "stream-a": { content: "正文" } },
			expected: false,
		},
		{
			label: "多个活跃流中至少一个已经形成可见进度",
			showLoading: false,
			activeStreamSuperMessageIds: ["stream-a", "stream-b"],
			visibleMessages: [createVisibleMessage({ superMessageId: "stream-b" })],
			messageNodes: { "stream-b": { reasoning_content: "思考" } },
			expected: false,
		},
	])(
		"$label",
		({ showLoading, activeStreamSuperMessageIds, visibleMessages, messageNodes, expected }) => {
			expect(
				resolveVisibility({
					showLoading,
					activeStreamSuperMessageIds,
					visibleMessages,
					messageNodes,
				}),
			).toBe(expected)
		},
	)

	it.each([
		{
			label: "空壳 projected node",
			node: { reasoning_content: "", content: "", tool_calls: [] },
			stage: "content" as const,
		},
		{
			label: "只有空白正文",
			node: { content: " \n\t " },
			stage: "content" as const,
		},
		{
			label: "正文只有尚未闭合的 citation 标签",
			node: { content: '<citation index="1"' },
			stage: "content" as const,
		},
		{
			label: "工具调用缺少稳定 id",
			node: { tool_calls: [{ function: { name: "read_file" } }] },
			stage: "tool" as const,
		},
		{
			label: "内部 run_sdk_snippet 工具不会形成可见卡片",
			node: {
				tool_calls: [{ id: "tool-internal", function: { name: "run_sdk_snippet" } }],
			},
			stage: "tool" as const,
		},
	])("消息行存在但$label时仍显示 Loading。", ({ node, stage }) => {
		expect(
			resolveVisibility({
				showLoading: false,
				activeStreamSuperMessageIds: ["stream-a"],
				visibleMessages: [createVisibleMessage({ superMessageId: "stream-a" })],
				messageNodes: { "stream-a": node },
				streamStages: { "stream-a": stage },
			}),
		).toBe(true)
	})

	it.each([
		{
			label: "reasoning 内容",
			node: { reasoning_content: "正在分析" },
			stage: "reasoning_content" as const,
		},
		{
			label: "经过流式安全裁剪后仍可见的正文",
			node: { content: '已有正文<citation index="1"' },
			stage: "content" as const,
		},
		{
			label: "具有稳定 id 和名称的工具调用",
			node: { tool_calls: [{ id: "tool-visible", function: { name: "read_file" } }] },
			stage: "tool" as const,
		},
	])("消息行已经形成$label时隐藏 Loading。", ({ node, stage }) => {
		expect(
			resolveVisibility({
				showLoading: true,
				activeStreamSuperMessageIds: ["stream-a"],
				visibleMessages: [createVisibleMessage({ superMessageId: "stream-a" })],
				messageNodes: { "stream-a": node },
				streamStages: { "stream-a": stage },
			}),
		).toBe(false)
	})

	it("空 super_message_id 不参与活跃流匹配。", () => {
		expect(
			resolveVisibility({
				showLoading: false,
				activeStreamSuperMessageIds: ["stream-a"],
				visibleMessages: [
					createVisibleMessage({ superMessageId: "" }),
					createVisibleMessage(),
				],
			}),
		).toBe(true)
	})

	it("不得通过 app_message_id 或 correlation_id 误匹配活跃流。", () => {
		expect(
			resolveVisibility({
				showLoading: false,
				activeStreamSuperMessageIds: ["stream-a"],
				visibleMessages: [
					createVisibleMessage({
						superMessageId: "different-super-message",
						appMessageId: "stream-a",
						correlationId: "stream-a",
					}),
				],
			}),
		).toBe(true)
	})
})
