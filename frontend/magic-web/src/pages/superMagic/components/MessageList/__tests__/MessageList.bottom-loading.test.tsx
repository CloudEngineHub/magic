import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageStatus, TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import MessageList from "../index"
import type { SuperMagicMessageItem } from "../type"

const storeState = vi.hoisted(() => ({
	activeStreamsByTopic: new Map<string, string[]>(),
	messageNodesById: new Map<string, Record<string, unknown>>(),
	streamStagesByTopicAndId: new Map<string, string>(),
}))

vi.mock("mobx-react-lite", () => ({
	observer: <T,>(component: T) => component,
}))

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => true,
}))

vi.mock("@/components/base-mobile/ScrollEdgeFade", () => ({
	ScrollEdgeFadeOverlays: () => null,
	useScrollEdgeFadeMask: () => ({
		scrollRef: { current: null },
		showTopMask: false,
		showBottomMask: false,
	}),
}))

vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
}))

vi.mock("@/components/shadcn-ui/spinner", () => ({
	Spinner: () => <div data-testid="initial-spinner" />,
}))

vi.mock("@/pages/superMagic/components/MessageList/hooks/useAutoScroll", () => ({
	useAutoScroll: () => ({
		showBackToLatest: false,
		scrollToBottom: vi.fn(),
		notifyPullMoreStarted: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageList/hooks/useVirtualMessageScroll", () => ({
	useVirtualMessageScroll: () => ({
		showBackToLatest: false,
		scrollToBottom: vi.fn(),
		notifyPullMoreStarted: vi.fn(),
		onVirtualizerChange: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Nodes", () => ({
	Node: ({ node }: { node: SuperMagicMessageItem }) => (
		<div data-testid={`message-${node.super_message_id}`}>{node.content}</div>
	),
}))

vi.mock("@/pages/superMagic/components/MessageList/MessageTurnGroupList", () => ({
	USER_MESSAGE_ROW_CLASS: "user-message-row",
	USER_MESSAGE_STICKY_OVERLAY_CLASS: "user-message-sticky-overlay",
	getUserMessageStickyTopClass: () => "user-message-sticky-top",
	MessageTurnGroupList: ({
		groups,
		renderNode,
	}: {
		groups: Array<{
			key: string
			items: Array<{ node: SuperMagicMessageItem; index: number }>
		}>
		renderNode: (item: { node: SuperMagicMessageItem; index: number }) => ReactNode
	}) => (
		<div data-testid="normal-message-stream">
			{groups.flatMap((group) =>
				group.items.map((item) => (
					<div key={`${group.key}-${item.index}`}>{renderNode(item)}</div>
				)),
			)}
		</div>
	),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/VirtualMessageList", () => ({
	VirtualMessageList: ({
		items,
		renderNode,
	}: {
		items: Array<{ key: string }>
		renderNode: (args: { item: any }) => ReactNode
	}) => (
		<div data-testid="virtual-message-stream">
			{items.map((item) => (
				<div key={item.key}>{renderNode({ item })}</div>
			))}
		</div>
	),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/RevokedEditableUserMessage", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/BackToLatestButton", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/LoadingMessage", () => ({
	default: ({ showLoading }: { showLoading?: boolean }) =>
		showLoading ? <div data-testid="super-magic-message-list-loading" /> : null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageListFallback", () => ({
	default: () => <div data-testid="message-list-fallback" />,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Empty", () => ({
	default: () => <div data-testid="message-list-empty" />,
}))

vi.mock("@/pages/superMagic/components/MessageList/hooks/useExportSelection", () => ({
	MAX_EXPORT_COUNT: 50,
	getSelectableTurnKeys: () => [],
	useExportSelectionStore: () => ({
		exportMode: false,
		selectedKeys: new Set<string>(),
		count: 0,
		previewOpen: false,
		includeToolCall: false,
		enter: vi.fn(),
		exit: vi.fn(),
		toggle: vi.fn(),
		openPreview: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/ExportToolbar", () => ({
	ExportToolbar: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/ExportPreviewModal", () => ({
	ExportPreviewModal: () => null,
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		isTopicStreaming: (topicId: string) =>
			(storeState.activeStreamsByTopic.get(topicId)?.length || 0) > 0,
		getActiveStreamSuperMessageIds: (topicId: string) => [
			...(storeState.activeStreamsByTopic.get(topicId) || []),
		],
		getMessageNode: (superMessageId?: string) =>
			storeState.messageNodesById.has(superMessageId || "")
				? storeState.messageNodesById.get(superMessageId || "")
				: { status: "finished", content: "visible" },
		getStreamState: (topicId: string, superMessageId: string) => {
			const stage = storeState.streamStagesByTopicAndId.get(
				`${topicId}\u0000${superMessageId}`,
			)
			return stage ? { stage } : undefined
		},
	},
}))

vi.mock("@/pages/superMagic/stores/optimisticMessageStore", () => ({
	optimisticMessageStore: {
		getHiddenRevokedOptimisticMessageIds: () => [],
		getActiveRevokedAnchor: () => undefined,
		clearHiddenRevokedOptimisticMessageIds: vi.fn(),
		clearActiveRevokedAnchor: vi.fn(),
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: { cancelUndoMessage: vi.fn() },
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
		publish: vi.fn(),
	},
	PubSubEvents: {
		Hide_Revoked_Messages: "Hide_Revoked_Messages",
		Show_Revoked_Messages: "Show_Revoked_Messages",
		Refresh_Topic_Messages: "Refresh_Topic_Messages",
	},
}))

const topicA = {
	id: "topic-a",
	chat_topic_id: "chat-topic-a",
	topic_name: "Topic A",
} as Topic

const topicB = {
	id: "topic-b",
	chat_topic_id: "chat-topic-b",
	topic_name: "Topic B",
} as Topic

function createMessage({
	appMessageId,
	superMessageId = appMessageId,
	role = "user",
	status = "read",
	correlationId = "",
}: {
	appMessageId: string
	superMessageId?: string
	role?: "user" | "assistant" | "tool"
	status?: string
	correlationId?: string
}): SuperMagicMessageItem {
	return {
		type: role === "user" ? "rich_text" : "super_magic_message",
		role,
		app_message_id: appMessageId,
		super_message_id: superMessageId,
		message_id: appMessageId,
		content: appMessageId,
		status,
		correlation_id: correlationId,
		send_time: 1,
		debug: {
			role,
			status: role === "assistant" ? "running" : "finished",
			correlation_id: correlationId,
		},
	} as SuperMagicMessageItem
}

const userMessage = createMessage({ appMessageId: "user-message" })

afterEach(() => {
	cleanup()
	storeState.activeStreamsByTopic.clear()
	storeState.messageNodesById.clear()
	storeState.streamStagesByTopicAndId.clear()
})

describe("MessageList bottom loading", () => {
	it("routes every converted top-level message through the virtual list", () => {
		render(
			<MessageList
				data={[
					userMessage,
					createMessage({
						appMessageId: "assistant-virtual",
						role: "assistant",
						correlationId: "assistant-virtual-correlation",
					}),
				]}
				selectedTopic={topicA}
			/>,
		)

		expect(screen.getByTestId("virtual-message-stream")).toBeInTheDocument()
		expect(screen.getByTestId("message-user-message")).toBeInTheDocument()
		expect(screen.getByTestId("message-assistant-virtual")).toBeInTheDocument()
	})

	it("刷新恢复时活跃流不可见则显示 Loading，可见后隐藏，Final 清理后不会重新出现。", () => {
		storeState.activeStreamsByTopic.set(topicA.chat_topic_id, ["stream-message-a"])
		const { rerender } = render(
			<MessageList data={[userMessage]} selectedTopic={topicA} showLoading={false} />,
		)

		expect(screen.getByTestId("super-magic-message-list-loading")).toBeInTheDocument()
		expect(screen.queryByText("ui.aiGeneratedTip")).not.toBeInTheDocument()

		const assistantMessage = createMessage({
			appMessageId: "assistant-message-a",
			superMessageId: "stream-message-a",
			role: "assistant",
			correlationId: "correlation-a",
		})
		rerender(
			<MessageList
				data={[userMessage, assistantMessage]}
				selectedTopic={topicA}
				showLoading={false}
			/>,
		)
		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()

		storeState.activeStreamsByTopic.delete(topicA.chat_topic_id)
		rerender(
			<MessageList
				data={[userMessage, assistantMessage]}
				selectedTopic={topicA}
				showLoading={false}
			/>,
		)
		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})

	it("活跃流空壳消息行已进入列表但尚无可见正文时继续显示 Loading。", () => {
		const superMessageId = "stream-empty-content"
		storeState.activeStreamsByTopic.set(topicA.chat_topic_id, [superMessageId])
		storeState.messageNodesById.set(superMessageId, {
			role: "assistant",
			reasoning_content: "",
			content: "",
			tool_calls: [],
		})
		storeState.streamStagesByTopicAndId.set(
			`${topicA.chat_topic_id}\u0000${superMessageId}`,
			"content",
		)
		const assistantMessage = createMessage({
			appMessageId: "assistant-empty-content",
			superMessageId,
			role: "assistant",
			correlationId: "correlation-empty-content",
		})

		const { rerender } = render(
			<MessageList
				data={[userMessage, assistantMessage]}
				selectedTopic={topicA}
				showLoading={false}
			/>,
		)

		expect(screen.getByTestId("super-magic-message-list-loading")).toBeInTheDocument()

		storeState.messageNodesById.set(superMessageId, {
			role: "assistant",
			reasoning_content: "",
			content: "正文已经可见",
			tool_calls: [],
		})
		rerender(
			<MessageList
				data={[userMessage, assistantMessage]}
				selectedTopic={topicA}
				showLoading={false}
			/>,
		)

		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})

	it.each([
		{ label: "reasoning/content 消息行", appMessageId: "assistant-content" },
		{ label: "Tool Call 卡片消息行", appMessageId: "assistant-tool-call" },
	])("$label 已可见时不重复显示底部 Loading。", ({ appMessageId }) => {
		const superMessageId = `super-${appMessageId}`
		storeState.activeStreamsByTopic.set(topicA.chat_topic_id, [superMessageId])

		render(
			<MessageList
				data={[
					userMessage,
					createMessage({
						appMessageId,
						superMessageId,
						role: "assistant",
						correlationId: `correlation-${appMessageId}`,
					}),
				]}
				selectedTopic={topicA}
				showLoading
			/>,
		)

		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})

	it("Topic A 的活跃流不影响 Topic B。", () => {
		storeState.activeStreamsByTopic.set(topicA.chat_topic_id, ["stream-topic-a"])

		render(<MessageList data={[userMessage]} selectedTopic={topicB} showLoading={false} />)

		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})

	it("Topic waiting_for_user 时不显示 MessageList 底部 Loading。", () => {
		render(
			<MessageList
				data={[userMessage]}
				selectedTopic={topicA}
				showLoading
				currentTopicStatus={TaskStatus.WAITING_FOR_USER}
			/>,
		)

		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})

	it("当前撤回分支已经渲染活跃消息时不会错误重新打开 Loading。", () => {
		storeState.activeStreamsByTopic.set(topicA.chat_topic_id, ["revoked-assistant"])
		const revokedUser = createMessage({
			appMessageId: "revoked-user",
			status: MessageStatus.REVOKED,
		})
		const revokedAssistant = createMessage({
			appMessageId: "revoked-assistant-app",
			superMessageId: "revoked-assistant",
			role: "assistant",
			correlationId: "revoked-correlation",
		})

		render(
			<MessageList
				data={[userMessage, revokedUser, revokedAssistant]}
				selectedTopic={topicA}
				showLoading
			/>,
		)

		expect(screen.getByTestId("message-revoked-assistant")).toBeInTheDocument()
		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})

	it("空消息列表继续使用原有 Initial Spinner 或 Fallback。", () => {
		storeState.activeStreamsByTopic.set(topicA.chat_topic_id, ["stream-message-a"])
		const { rerender } = render(
			<MessageList data={[]} selectedTopic={topicA} showLoading={false} isMessagesLoading />,
		)
		expect(screen.getByTestId("initial-spinner")).toBeInTheDocument()
		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()

		rerender(
			<MessageList
				data={[]}
				selectedTopic={topicA}
				showLoading={false}
				isMessagesLoading={false}
			/>,
		)
		expect(screen.getByTestId("message-list-fallback")).toBeInTheDocument()
		expect(screen.queryByTestId("super-magic-message-list-loading")).not.toBeInTheDocument()
	})
})
