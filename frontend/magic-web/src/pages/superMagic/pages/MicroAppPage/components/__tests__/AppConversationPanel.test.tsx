import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import AppConversationPanel from "../AppConversationPanel"

vi.mock("../../context", () => ({
	useAppStore: () => ({
		conversation: { setConversationGenerating: vi.fn() },
	}),
}))

vi.mock("../../utils/microAppModelMode", () => ({
	resolveMicroAppModelSelectionMode: () => "micro-app",
}))

vi.mock("@/pages/superMagic/components/ConversationPanelScaffold", () => ({
	default: ({ editor }: { editor: React.ReactNode }) => <div>{editor}</div>,
}))

vi.mock("@/pages/superMagic/components/ConversationPanelScaffold/ConversationEmptyState", () => ({
	default: () => null,
}))

vi.mock(
	"@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer",
	() => ({
		default: ({ editorContext }: { editorContext: Record<string, unknown> }) => {
			const mergeSendParams = editorContext.mergeSendParams as
				| ((params: { defaultParams: Record<string, unknown> }) => Record<string, unknown>)
				| undefined
			const mergedParams = mergeSendParams?.({ defaultParams: { topicMode: "default" } })

			return (
				<div
					data-testid="web-micro-app-editor"
					data-model-topic-mode={editorContext.topicMode}
					data-send-topic-mode={mergedParams?.topicMode}
				/>
			)
		},
	}),
)

vi.mock("@/pages/superMagic/components/MessageHeader", () => ({ default: () => null }))

vi.mock("@/pages/superMagic/components/MessagePanel/components/MessageQueue", () => ({
	default: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils/draftKey", () => ({
	createMessageEditorDraftKey: () => "micro-app-draft",
}))

vi.mock("@/pages/superMagic/services/messageSendFlowService", () => ({
	messageSendService: { sendContent: vi.fn() },
}))

vi.mock("@/pages/superMagic/services/messageSendPreparation", () => ({
	resolveMessageSendContext: () => ({}),
}))

vi.mock("@/pages/superMagic/services/topicStatusSyncService", () => ({
	applyOptimisticTopicRunningState: vi.fn(),
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: vi.fn() },
	PubSubEvents: { Message_Scroll_To_Bottom: "Message_Scroll_To_Bottom" },
}))

vi.mock("@/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete", () => ({
	useRefreshTopicDetailOnTaskComplete: vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useTopicMessages", () => ({
	useTopicMessages: () => ({
		handlePullMoreMessage: vi.fn(),
		isMessagesInitialLoading: false,
		isSelectedTopicMessagesReady: true,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useScopedTopicReadProgress", () => ({
	useScopedTopicReadProgress: () => ({ handleTopicMessagesChange: vi.fn() }),
}))

vi.mock("@/pages/superMagic/hooks/useTopicConversationLoading", () => ({
	useTopicConversationLoading: () => ({ messages: [], showLoading: false }),
}))

vi.mock("@/pages/superMagic/hooks/useInterruptAndUndoMessage", () => ({
	useInterruptAndUndoMessage: vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions", () => ({
	useScopedMessageHeaderTopicActions: () => ({}),
}))

vi.mock("@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue", () => ({
	default: () => ({
		queue: [],
		queueStats: {},
		editingQueueItem: null,
		removeFromQueue: vi.fn(),
		sendQueuedMessage: vi.fn(),
		startEditQueueItem: vi.fn(),
		cancelEditQueueItem: vi.fn(),
		addToQueue: vi.fn(),
		finishEditQueueItem: vi.fn(),
	}),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/hooks/useTopicModel", () => ({
	default: () => ({ topicModelStore: {} }),
}))

vi.mock("@/stores/superMagic/topicModelStore", () => ({
	createSuperMagicTopicModelStore: () => ({}),
}))

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: null } },
}))

describe("AppConversationPanel", () => {
	it("uses the micro-app employee model catalog and send mode", () => {
		const topicStore = {
			selectedTopic: { id: "topic-1", topic_name: "Topic" },
			setSelectedTopic: vi.fn(),
			updateTopic: vi.fn(),
		} as never

		render(
			<AppConversationPanel
				selectedProject={{ id: "project-1", project_name: "Micro App" } as never}
				topicStore={topicStore}
				mentionPanelStore={{} as never}
				projectFilesStore={{} as never}
			/>,
		)

		expect(screen.getByTestId("web-micro-app-editor")).toHaveAttribute(
			"data-model-topic-mode",
			"micro-app",
		)
		expect(screen.getByTestId("web-micro-app-editor")).toHaveAttribute(
			"data-send-topic-mode",
			"micro-app",
		)
	})
})
