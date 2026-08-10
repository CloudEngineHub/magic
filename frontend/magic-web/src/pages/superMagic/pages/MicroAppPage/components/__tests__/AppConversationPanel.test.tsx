import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import AppConversationPanel from "../AppConversationPanel"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

const scaffoldMocks = vi.hoisted(() => ({
	messageListProviderValue: null as Record<string, unknown> | null,
	setSelectedDetail: undefined as ((detail: unknown) => void) | undefined,
	enableRevokedUserMessageReedit: false,
	revokedEditorContext: null as Record<string, unknown> | null,
}))

const scopedProgressMocks = vi.hoisted(() => ({
	params: null as Record<string, unknown> | null,
}))

vi.mock("../../context", () => ({
	useAppStore: () => ({
		conversation: { setConversationGenerating: vi.fn() },
	}),
}))

vi.mock("../../utils/microAppModelMode", () => ({
	resolveMicroAppModelSelectionMode: () => "default",
}))

vi.mock("@/pages/superMagic/components/ConversationPanelScaffold", () => ({
	default: ({
		editor,
		emptyCompact,
		messageListProviderValue,
		setSelectedDetail,
		enableRevokedUserMessageReedit,
		revokedEditorContext,
	}: {
		editor: React.ReactNode
		emptyCompact: React.ReactNode
		messageListProviderValue: Record<string, unknown>
		setSelectedDetail?: (detail: unknown) => void
		enableRevokedUserMessageReedit?: boolean
		revokedEditorContext?: Record<string, unknown>
	}) => {
		scaffoldMocks.messageListProviderValue = messageListProviderValue
		scaffoldMocks.setSelectedDetail = setSelectedDetail
		scaffoldMocks.enableRevokedUserMessageReedit = Boolean(enableRevokedUserMessageReedit)
		scaffoldMocks.revokedEditorContext = revokedEditorContext ?? null
		return (
			<div>
				{emptyCompact}
				{editor}
			</div>
		)
	},
}))

vi.mock("@/pages/superMagic/components/ConversationPanelScaffold/ConversationEmptyState", () => ({
	default: ({
		icon,
		title,
		subtitle,
		testId,
	}: {
		icon: React.ReactNode
		title: React.ReactNode
		subtitle: React.ReactNode
		testId: string
	}) => (
		<div data-testid={testId}>
			{icon}
			{title}
			{subtitle}
		</div>
	),
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
	useScopedTopicReadProgress: (params: Record<string, unknown>) => {
		scopedProgressMocks.params = params
		return { handleTopicMessagesChange: vi.fn() }
	},
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
	it("uses the micro app conversation illustration and action-oriented copy", () => {
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

		const emptyState = screen.getByTestId("micro-app-conversation-empty-compact")
		expect(emptyState).toBeInTheDocument()
		expect(
			screen.getByTestId("micro-app-conversation-empty-compact-illustration"),
		).toHaveAttribute("data-state", "conversation-empty")
		expect(emptyState).toHaveTextContent("microAppPage.conversation.emptyTitle")
		expect(emptyState).toHaveTextContent("microAppPage.conversation.emptyDescription")
	})

	it("uses the default model catalog and keeps the micro-app send mode", () => {
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
			"default",
		)
		expect(screen.getByTestId("web-micro-app-editor")).toHaveAttribute(
			"data-send-topic-mode",
			"micro-app",
		)
	})

	it("provides the project attachment store to the message list", () => {
		const topicStore = {
			selectedTopic: { id: "topic-1", topic_name: "Topic" },
			setSelectedTopic: vi.fn(),
			updateTopic: vi.fn(),
		} as never
		const projectFilesStore = {
			workspaceFilesList: [{ file_id: "file-1", file_name: "index.html" }],
		} as never

		render(
			<AppConversationPanel
				selectedProject={{ id: "project-1", project_name: "Micro App" } as never}
				topicStore={topicStore}
				mentionPanelStore={{} as never}
				projectFilesStore={projectFilesStore}
			/>,
		)

		expect(scaffoldMocks.messageListProviderValue).toEqual(
			expect.objectContaining({ projectFilesStore }),
		)
	})

	it("enables the revoked user message editor", () => {
		const selectedProject = { id: "project-1", project_name: "Micro App" } as never
		const topicStore = {
			selectedTopic: { id: "topic-1", topic_name: "Topic", topic_mode: "micro-app" },
			setSelectedTopic: vi.fn(),
			updateTopic: vi.fn(),
		} as never

		render(
			<AppConversationPanel
				selectedProject={selectedProject}
				topicStore={topicStore}
				mentionPanelStore={{} as never}
				projectFilesStore={{} as never}
			/>,
		)

		expect(scaffoldMocks.enableRevokedUserMessageReedit).toBe(true)
		expect(scaffoldMocks.revokedEditorContext).toEqual(
			expect.objectContaining({
				selectedProject,
				topicMode: "default",
				modelTopicMode: "default",
				topicStore,
			}),
		)
		const mergeSendParams = scaffoldMocks.revokedEditorContext?.mergeSendParams as
			| ((params: { defaultParams: Record<string, unknown> }) => Record<string, unknown>)
			| undefined
		expect(mergeSendParams?.({ defaultParams: { topicMode: "default" } })).toEqual(
			expect.objectContaining({ topicMode: "micro-app" }),
		)
	})

	it("forwards tool details to the page preview handler", () => {
		const onSelectDetail = vi.fn()
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
				onSelectDetail={onSelectDetail}
			/>,
		)

		expect(scaffoldMocks.setSelectedDetail).toBe(onSelectDetail)
	})

	it("requests an attachment refresh when the topic reaches a terminal status", () => {
		const checkAttachmentsNowDebounced = vi.fn()
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
				onTerminalTopicStatusChange={checkAttachmentsNowDebounced}
			/>,
		)

		expect(scopedProgressMocks.params).toEqual(
			expect.objectContaining({
				onTerminalTopicStatusChange: checkAttachmentsNowDebounced,
			}),
		)
	})
})
