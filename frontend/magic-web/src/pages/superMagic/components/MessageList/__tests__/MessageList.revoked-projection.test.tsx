import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MessageStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import MessageList from "../index"
import type { SuperMagicMessageItem } from "../type"

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
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}))

vi.mock("@/components/shadcn-ui/spinner", () => ({
	Spinner: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/hooks/useAutoScroll", () => ({
	useAutoScroll: () => ({
		showBackToLatest: false,
		scrollToBottom: vi.fn(),
		notifyPullMoreStarted: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Nodes", () => ({
	Node: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/RevokedEditableUserMessage", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/BackToLatestButton", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/LoadingMessage", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageListFallback", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Empty", () => ({
	default: () => null,
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
		isTopicStreaming: () => false,
		getMessageNode: () => ({ status: "finished" }),
	},
}))

vi.mock("@/pages/superMagic/stores/optimisticMessageStore", () => ({
	optimisticMessageStore: {
		getHiddenRevokedOptimisticMessageIds: () => [],
		clearHiddenRevokedOptimisticMessageIds: vi.fn(),
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

const selectedTopic = {
	id: "topic-id",
	chat_topic_id: "chat-topic-id",
	topic_name: "Topic",
} as Topic

function createMessage(id: string, status: string): SuperMagicMessageItem {
	return {
		type: "rich_text",
		role: "user",
		app_message_id: id,
		message_id: id,
		content: id,
		status,
	} as SuperMagicMessageItem
}

function renderVisibleMessageIds(data: SuperMagicMessageItem[]): string[] {
	render(
		<MessageList data={data} selectedTopic={selectedTopic}>
			{(node) => <span data-testid="visible-message">{node.app_message_id}</span>}
		</MessageList>,
	)

	return screen.queryAllByTestId("visible-message").map((node) => node.textContent || "")
}

describe("MessageList revoked visible projection", () => {
	afterEach(() => {
		cleanup()
	})

	it.each([
		{
			label: "历史撤回后已有普通消息",
			input: [
				createMessage("revoked-1", MessageStatus.REVOKED),
				createMessage("normal-2", "finished"),
			],
			expected: ["normal-2"],
		},
		{
			label: "普通消息后存在当前连续撤回段",
			input: [
				createMessage("normal-1", "finished"),
				createMessage("revoked-2", MessageStatus.REVOKED),
				createMessage("revoked-3", MessageStatus.REVOKED),
			],
			expected: ["normal-1", "revoked-2", "revoked-3"],
		},
		{
			label: "历史撤回和当前撤回段同时存在",
			input: [
				createMessage("revoked-1", MessageStatus.REVOKED),
				createMessage("normal-2", "finished"),
				createMessage("revoked-3", MessageStatus.REVOKED),
			],
			expected: ["normal-2", "revoked-3"],
		},
	])("projects $label to the current visible branch", ({ input, expected }) => {
		expect(renderVisibleMessageIds(input)).toEqual(expected)
	})
})
