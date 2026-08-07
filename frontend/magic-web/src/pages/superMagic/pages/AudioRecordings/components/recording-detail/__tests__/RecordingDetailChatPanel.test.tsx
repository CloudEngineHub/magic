import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import RecordingDetailChatPanel from "../RecordingDetailChatPanel"
import { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { RECORDING_CHAT_HISTORY_WIDTH } from "../recording-detail-layout"

const messageHeaderMock = vi.hoisted(() => vi.fn())
const historyPanelMock = vi.hoisted(() => vi.fn())

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/business/RecordingSummary/components/AiChat", () => ({
	default: (props: {
		useRecordingSync?: boolean
		projectDetailMode?: boolean
		onToggleHistoryPanel?: () => void
		isConversationPanelCollapsed?: boolean
		onToggleConversationPanel?: () => void
		onExpandConversationPanel?: () => void
	}) => (
		<div>
			<div data-testid="recording-detail-message-header" />
			<button type="button" onClick={props.onToggleHistoryPanel}>
				toggle history
			</button>
			<div
				data-testid="recording-detail-ai-chat"
				data-recording-sync={String(props.useRecordingSync)}
				data-project-detail-mode={String(props.projectDetailMode)}
				data-collapsed={String(props.isConversationPanelCollapsed)}
			/>
			<button type="button" onClick={props.onToggleConversationPanel}>
				toggle conversation
			</button>
			<button type="button" onClick={props.onExpandConversationPanel}>
				expand conversation
			</button>
		</div>
	),
}))

vi.mock("@/pages/superMagic/components/MessageHeader", () => ({
	default: (props: { onToggleHistoryPanel: () => void; onClick?: () => void }) => {
		messageHeaderMock(props)
		return (
			<div data-testid="recording-detail-message-header">
				<button type="button" onClick={props.onToggleHistoryPanel}>
					toggle history
				</button>
			</div>
		)
	},
	MessageHeaderTopicHistoryPanel: (props: unknown) => {
		historyPanelMock(props)
		return <div data-testid="recording-detail-history-panel" />
	},
}))

/** Builds a fictional topic so the focused panel test never uses production identifiers. */
function createTopic() {
	return {
		id: "mock-topic-001",
		user_id: "mock-user-001",
		chat_topic_id: "mock-chat-topic-001",
		chat_conversation_id: "mock-chat-conversation-001",
		topic_name: "Mock topic",
		task_status: "waiting" as const,
		task_mode: "chat",
		project_id: "mock-project-001",
		topic_mode: "chat" as const,
		updated_at: "2026-01-01T00:00:00Z",
		workspace_id: "mock-workspace-001",
	}
}

describe("RecordingDetailChatPanel", () => {
	it("uses the project-detail header and opens the scoped history panel", () => {
		const topicStore = new TopicStore()
		const topic = createTopic()
		topicStore.setTopics([topic])
		topicStore.setSelectedTopic(topic)
		const toggleHistory = vi.fn()
		const toggleConversation = vi.fn()
		const expandConversation = vi.fn()

		render(
			<RecordingDetailChatPanel
				isConversationPanelCollapsed={false}
				historyOpen={false}
				onToggleConversationPanel={toggleConversation}
				onExpandConversationPanel={expandConversation}
				onToggleHistory={toggleHistory}
				topicsLoading={false}
				topicStore={topicStore}
				topicActions={{} as never}
				selectedTopic={topic}
				project={{ id: "mock-project-001" } as never}
				workspace={{ id: "mock-workspace-001" } as never}
				setSelectedTopic={vi.fn()}
				projectFilesStore={{} as never}
				mentionPanelStore={{} as never}
				attachments={[]}
				attachmentList={[]}
			/>,
		)

		expect(screen.getByTestId("recording-detail-message-header")).toBeInTheDocument()
		expect(screen.getByTestId("recording-detail-chat-panel")).not.toHaveClass("border")
		expect(screen.getByTestId("recording-detail-chat-panel")).toHaveClass(
			"h-full",
			"bg-sidebar",
		)
		expect(screen.getByTestId("recording-detail-ai-chat")).toHaveAttribute(
			"data-recording-sync",
			"false",
		)
		expect(screen.getByTestId("recording-detail-ai-chat")).toHaveAttribute(
			"data-project-detail-mode",
			"true",
		)
		fireEvent.click(screen.getByText("toggle history"))
		expect(toggleHistory).toHaveBeenCalledTimes(1)
		fireEvent.click(screen.getByText("toggle conversation"))
		expect(toggleConversation).toHaveBeenCalledTimes(1)
		fireEvent.click(screen.getByText("expand conversation"))
		expect(expandConversation).toHaveBeenCalledTimes(1)
	})

	it("keeps the project conversation mounted in the collapsed narrow state", () => {
		const topicStore = new TopicStore()
		const topic = createTopic()
		topicStore.setTopics([topic])
		topicStore.setSelectedTopic(topic)

		render(
			<RecordingDetailChatPanel
				isConversationPanelCollapsed
				historyOpen={false}
				onToggleConversationPanel={vi.fn()}
				onExpandConversationPanel={vi.fn()}
				onToggleHistory={vi.fn()}
				topicsLoading={false}
				topicStore={topicStore}
				topicActions={{} as never}
				selectedTopic={topic}
				project={{ id: "mock-project-001" } as never}
				workspace={{ id: "mock-workspace-001" } as never}
				setSelectedTopic={vi.fn()}
				projectFilesStore={{} as never}
				mentionPanelStore={{} as never}
				attachments={[]}
				attachmentList={[]}
			/>,
		)

		expect(screen.getByTestId("recording-detail-chat-panel")).toHaveAttribute(
			"data-collapsed",
			"true",
		)
		expect(screen.getByTestId("recording-detail-ai-chat")).toHaveAttribute(
			"data-collapsed",
			"true",
		)
	})

	it("renders the project-detail history panel when it is open", () => {
		const topicStore = new TopicStore()
		const topic = createTopic()
		topicStore.setTopics([topic])
		topicStore.setSelectedTopic(topic)

		render(
			<RecordingDetailChatPanel
				isConversationPanelCollapsed={false}
				historyOpen
				onToggleConversationPanel={vi.fn()}
				onExpandConversationPanel={vi.fn()}
				onToggleHistory={vi.fn()}
				topicsLoading={false}
				topicStore={topicStore}
				topicActions={{} as never}
				selectedTopic={topic}
				project={{ id: "mock-project-001" } as never}
				workspace={{ id: "mock-workspace-001" } as never}
				setSelectedTopic={vi.fn()}
				projectFilesStore={{} as never}
				mentionPanelStore={{} as never}
				attachments={[]}
				attachmentList={[]}
			/>,
		)

		expect(screen.getByTestId("recording-detail-topic-history")).toHaveStyle({
			width: `${RECORDING_CHAT_HISTORY_WIDTH}px`,
		})
		expect(screen.getByTestId("recording-detail-history-panel")).toBeInTheDocument()
	})
})
