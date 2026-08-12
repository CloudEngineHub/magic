import { useTranslation } from "react-i18next"
import AiChat from "@/components/business/RecordingSummary/components/AiChat"
import {
	MessageHeaderTopicHistoryPanel,
	type MessageHeaderTopicActions,
} from "@/pages/superMagic/components/MessageHeader"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import type { MentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { RECORDING_CHAT_HISTORY_WIDTH } from "./recording-detail-layout"
import { useCreateTopicListener } from "@/pages/superMagic/components/TopicMode/useCreateTopicListener"
import { useRefreshTopicDetailOnTaskComplete } from "@/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete"
import { useScopedTopicReadProgress } from "@/pages/superMagic/hooks/useScopedTopicReadProgress"

export interface RecordingDetailChatPanelProps {
	isConversationPanelCollapsed: boolean
	historyOpen: boolean
	onToggleConversationPanel: () => void
	onExpandConversationPanel: () => void
	onToggleHistory: () => void
	topicsLoading: boolean
	topicStore: TopicStore
	topicActions: MessageHeaderTopicActions
	selectedTopic: Topic | null
	project: ProjectListItem | null
	workspace: Workspace | null
	setSelectedTopic: (topic: Topic | null) => void
	projectFilesStore: ProjectFilesStore
	mentionPanelStore: MentionPanelStore
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
}

/** Renders the desktop recording conversation rail with the project-detail header and history panel. */
export default function RecordingDetailChatPanel({
	isConversationPanelCollapsed,
	historyOpen,
	onToggleConversationPanel,
	onExpandConversationPanel,
	onToggleHistory,
	topicsLoading,
	topicStore,
	topicActions,
	selectedTopic,
	project,
	workspace,
	setSelectedTopic,
	projectFilesStore,
	mentionPanelStore,
	attachments,
	attachmentList,
}: RecordingDetailChatPanelProps) {
	const { t } = useTranslation("super")

	// Register the scoped topic-creation listener so employee switching creates and selects a new topic.
	useCreateTopicListener({
		enabled: Boolean(project),
		selectedProject: project,
		topicStore,
	})

	// Refresh the isolated topic snapshot after a live task completes so the header status follows the server state.
	useRefreshTopicDetailOnTaskComplete({
		selectedTopic,
		onTopicDetailLoaded: topicStore.updateTopic,
	})

	// Keep the scoped topic status aligned with committed assistant/tool messages.
	// RecordingSummary does not expose initial message readiness, so disable only the enter-topic sync.
	useScopedTopicReadProgress({
		scopeName: "RecordingDetailChatPanel",
		topicStore,
		selectedTopic,
		isSelectedTopicMessagesReady: false,
	})

	return (
		<div
			className="flex h-full min-h-0 min-w-0 overflow-hidden bg-sidebar"
			data-testid="recording-detail-chat-panel"
			data-collapsed={String(isConversationPanelCollapsed)}
		>
			<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex min-h-0 flex-1 flex-col">
					{project ? (
						<AiChat
							projectFilesStore={projectFilesStore}
							attachments={attachments}
							attachmentList={attachmentList}
							checkNowDebounced={() => undefined}
							recordSummaryFileStore={mentionPanelStore}
							selectedProject={project}
							selectedWorkspace={workspace}
							selectedTopic={selectedTopic}
							setSelectedProject={() => undefined}
							setSelectedWorkspace={() => undefined}
							setSelectedTopic={setSelectedTopic}
							useRecordingSync={false}
							projectDetailMode
							allowRecordingMode={false}
							topicStore={topicStore}
							topicActions={topicActions}
							historyTriggerMode="layout"
							isHistoryPanelOpen={historyOpen}
							onToggleHistoryPanel={onToggleHistory}
							isConversationPanelCollapsed={isConversationPanelCollapsed}
							onToggleConversationPanel={onToggleConversationPanel}
							onExpandConversationPanel={onExpandConversationPanel}
						/>
					) : (
						<div className="flex h-full items-center justify-center px-4 text-xs text-muted-foreground">
							{topicsLoading ? t("loading") : t("messageHeader.noTopics")}
						</div>
					)}
				</div>
			</div>
			{historyOpen ? (
				<aside
					className="h-full shrink-0 border-l border-border bg-background"
					style={{ width: RECORDING_CHAT_HISTORY_WIDTH }}
					data-testid="recording-detail-topic-history"
					role="complementary"
				>
					<MessageHeaderTopicHistoryPanel
						selectedProject={project}
						topicStore={topicStore}
						topicActions={topicActions}
						onClose={onToggleHistory}
					/>
				</aside>
			) : null}
		</div>
	)
}
