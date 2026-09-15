import { useMemo, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { useMemoizedFn } from "ahooks"
import { JSONContent } from "@/infrastructure/editors/tiptap/react"
import { useTranslation } from "react-i18next"
import ConversationPanelScaffold from "@/pages/superMagic/components/ConversationPanelScaffold"
import ConversationEmptyState from "@/pages/superMagic/components/ConversationPanelScaffold/ConversationEmptyState"
import { MicroAppConversationEmptyIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import type { SendMessageOptions } from "@/pages/superMagic/components/MessagePanel/types"
import { useInterruptAndUndoMessage } from "@/pages/superMagic/hooks/useInterruptAndUndoMessage"
import { useTopicConversationLoading } from "@/pages/superMagic/hooks/useTopicConversationLoading"
import { useTopicMessages } from "@/pages/superMagic/hooks/useTopicMessages"
import { resolveMessageSendContext } from "@/pages/superMagic/services/messageSendPreparation"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import { messageSendService } from "@/pages/superMagic/services/messageSendFlowService"
import type { HandleSendParams } from "@/pages/superMagic/services/messageSendFlowService"
import {
	isTopicWaitingForUser,
	type ProjectListItem,
} from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "../../Workspace/TopicMode"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { userStore } from "@/models/user"
import type {
	SceneEditorContext,
	SceneEditorNodes,
} from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import MessageQueue from "@/pages/superMagic/components/MessagePanel/components/MessageQueue"
import useMessageQueue from "@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue"
import MessageHeader from "@/pages/superMagic/components/MessageHeader"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import { DEFAULT_LAYOUT_CONFIG } from "@/pages/superMagic/components/MessageEditor/constants/constant"
import { MentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"
import useTopicModel from "@/pages/superMagic/components/MessageEditor/hooks/useTopicModel"
import { useRefreshTopicDetailOnTaskComplete } from "@/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete"
import { useScopedTopicReadProgress } from "@/pages/superMagic/hooks/useScopedTopicReadProgress"
import { applyOptimisticTopicRunningState } from "@/pages/superMagic/services/topicStatusSyncService"
import { useAppStore } from "../context"
import { resolveMicroAppModelSelectionMode } from "../utils/microAppModelMode"
import type { RevokedMessageEditorContext } from "@/pages/superMagic/components/MessageList/revoked-editor-context"
import useTopicMode from "@/pages/superMagic/hooks/useTopicMode"
import { ModeToggle } from "@/pages/superMagic/components/TopicMode"
import { resolveAgentSelection } from "@/services/superMagic/DefaultAgentSelectionService"
import TopicService from "@/pages/superMagic/services/topicService"

interface AppConversationPanelProps {
	selectedProject: ProjectListItem | null
	topicStore: TopicStore
	isConversationPanelCollapsed?: boolean
	onToggleConversationPanel?: () => void
	onExpandConversationPanel?: () => void
	detailPanelVisible?: boolean
	historyTriggerMode?: "dropdown" | "layout"
	isHistoryPanelOpen?: boolean
	onToggleHistoryPanel?: () => void
	mentionPanelStore: MentionPanelStore
	projectFilesStore: ProjectFilesStore
	onTerminalTopicStatusChange?: () => void
	onSelectDetail?: (detail: unknown) => void
	hideConversationPanelToggle?: boolean
	trailingActions?: ReactNode
}

function AppConversationPanel({
	selectedProject,
	topicStore,
	isConversationPanelCollapsed = false,
	onToggleConversationPanel,
	onExpandConversationPanel,
	detailPanelVisible = true,
	historyTriggerMode = "dropdown",
	isHistoryPanelOpen = false,
	onToggleHistoryPanel,
	mentionPanelStore,
	projectFilesStore,
	onTerminalTopicStatusChange,
	onSelectDetail,
	hideConversationPanelToggle = false,
	trailingActions,
}: AppConversationPanelProps) {
	const { conversation } = useAppStore()
	const selectedTopic = topicStore.selectedTopic
	const modelTopicMode = resolveMicroAppModelSelectionMode()
	// Runtime conversations default to MicroApp while still allowing the shared employee selector
	// to switch the send-time topic mode for a newly created scoped topic.
	const { topicMode, setTopicMode, recoverTopicMode } = useTopicMode({
		selectedTopic,
		selectedProject,
		fallbackTopicMode: TopicMode.MicroApp,
	})

	const sharedTopicModelStore = useMemo(() => createSuperMagicTopicModelStore(), [])

	useRefreshTopicDetailOnTaskComplete({
		selectedTopic,
		onTopicDetailLoaded: topicStore.updateTopic,
	})

	const { topicModelStore } = useTopicModel({
		selectedTopic,
		selectedProject,
		topicMode: modelTopicMode,
		topicModelStore: sharedTopicModelStore,
	})

	const { handlePullMoreMessage, isMessagesInitialLoading, isSelectedTopicMessagesReady } =
		useTopicMessages({
			selectedTopic,
		})

	const { handleTopicMessagesChange } = useScopedTopicReadProgress({
		scopeName: "AppConversationPanel",
		topicStore,
		selectedTopic,
		isSelectedTopicMessagesReady,
		onTerminalTopicStatusChange,
	})

	const { messages, showLoading } = useTopicConversationLoading({
		selectedTopic,
		onConversationGeneratingChange: conversation.setConversationGenerating,
		onTopicMessagesChange: handleTopicMessagesChange,
	})

	const messageQueue = useMessageQueue({
		projectId: selectedProject?.id,
		topicId: selectedTopic?.id,
		agentCode: selectedTopic?.agent_code,
		isTaskRunning: showLoading,
		isWaitingForUser: isTopicWaitingForUser(selectedTopic),
		isEmptyStatus: false,
		isShowLoadingInit: isMessagesInitialLoading,
	})

	const mergeMicroAppSendParams = useMemoizedFn(
		({ defaultParams }: { defaultParams: HandleSendParams }) => {
			const selection = resolveAgentSelection(topicMode, selectedTopic?.agent_code)
			const extra = { ...(defaultParams.extra ?? {}) }
			delete extra.agent_code

			return {
				...defaultParams,
				topicMode: selection.topicPattern,
				extra: selection.agentCode
					? { ...extra, agent_code: selection.agentCode }
					: Object.keys(extra).length > 0
						? extra
						: undefined,
			}
		},
	)

	const handleCreateTopic = useMemoizedFn((mode: TopicMode) => {
		if (!selectedProject?.id) return

		const selection = resolveAgentSelection(mode)
		void new TopicService({ store: topicStore }).createTopic({
			projectId: selectedProject.id,
			topicName: "",
			sourceTopic: selectedTopic
				? {
						project_id: selectedProject.id,
						topic_mode: selection.topicPattern,
						agent_code: selection.agentCode,
					}
				: null,
		})
	})

	const handleSendMsg = useMemoizedFn(
		(content: JSONContent | string, options?: SendMessageOptions) => {
			messageSendService.sendContent({
				content,
				options,
				showLoading: messages.length > 1 && showLoading,
				context: resolveMessageSendContext({
					selectedProject,
					selectedTopic,
					topicStore,
					setSelectedTopic: topicStore.setSelectedTopic,
				}),
			})

			pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom, { time: 1000 })
		},
	)

	useInterruptAndUndoMessage({
		selectedTopic,
		messages,
		userInfo: userStore.user.userInfo,
	})

	const topicActions = useScopedMessageHeaderTopicActions({
		selectedProject,
		selectedTopic,
		topicStore,
	})

	const editorNodes = useMemo<SceneEditorNodes>(() => {
		const messageQueueNode =
			messageQueue.queue.length > 0 ? (
				<div className="mb-2">
					<MessageQueue
						queue={messageQueue.queue}
						queueStats={messageQueue.queueStats}
						editingQueueItem={messageQueue.editingQueueItem}
						onRemoveMessage={messageQueue.removeFromQueue}
						onSendMessage={messageQueue.sendQueuedMessage}
						onStartEdit={messageQueue.startEditQueueItem}
						onCancelEdit={messageQueue.cancelEditQueueItem}
					/>
				</div>
			) : null

		return { messageQueueNode }
	}, [
		messageQueue.queue,
		messageQueue.queueStats,
		messageQueue.editingQueueItem,
		messageQueue.removeFromQueue,
		messageQueue.sendQueuedMessage,
		messageQueue.startEditQueueItem,
		messageQueue.cancelEditQueueItem,
	])

	const editorContext = useMemo<SceneEditorContext>(() => {
		return {
			draftKey: createMessageEditorDraftKey({
				selectedProject,
				selectedTopic,
			}),
			selectedTopic,
			selectedProject,
			topicMode,
			modelTopicMode,
			agentCode: selectedTopic?.agent_code,
			setTopicMode,
			recoverTopicMode,
			topicStore,
			setSelectedTopic: topicStore.setSelectedTopic,
			mentionPanelStore,
			projectFilesStore,
			attachments: projectFilesStore.workspaceFileTree,
			topicModelStore,
			layoutConfig: DEFAULT_LAYOUT_CONFIG,
			showLoading,
			size: detailPanelVisible ? "small" : "default",
			onSendComplete: ({ success, currentProject, currentTopic }) => {
				if (!success) return

				applyOptimisticTopicRunningState({
					topicStore,
					topic: currentTopic ?? topicStore.selectedTopic,
					project: currentProject ?? selectedProject,
				})
			},
			mergeSendParams: mergeMicroAppSendParams,
			queueContext: {
				editingQueueItem: messageQueue.editingQueueItem,
				addToQueue: messageQueue.addToQueue,
				finishEditQueueItem: messageQueue.finishEditQueueItem,
			},
			enableMessageSendByContent: true,
		}
	}, [
		selectedProject,
		selectedTopic,
		topicMode,
		modelTopicMode,
		setTopicMode,
		recoverTopicMode,
		topicStore,
		mentionPanelStore,
		projectFilesStore,
		topicModelStore,
		showLoading,
		messageQueue.editingQueueItem,
		messageQueue.addToQueue,
		messageQueue.finishEditQueueItem,
		mergeMicroAppSendParams,
		detailPanelVisible,
	])

	const revokedEditorContext = useMemo<RevokedMessageEditorContext>(() => {
		return {
			selectedProject,
			setSelectedTopic: topicStore.setSelectedTopic,
			topicMode,
			modelTopicMode,
			agentCode: selectedTopic?.agent_code,
			setTopicMode,
			recoverTopicMode,
			topicStore,
			mentionPanelStore,
			projectFilesStore,
			topicModelStore,
			mergeSendParams: mergeMicroAppSendParams,
		}
	}, [
		selectedProject,
		topicStore,
		topicMode,
		selectedTopic?.agent_code,
		modelTopicMode,
		setTopicMode,
		recoverTopicMode,
		mentionPanelStore,
		projectFilesStore,
		topicModelStore,
		mergeMicroAppSendParams,
	])

	const messageListProviderValue = useMemo(() => {
		return {
			allowRevoke: true,
			allowUserMessageCopy: true,
			allowScheduleTaskCreate: false,
			allowMessageTooltip: true,
			allowConversationCopy: true,
			onTopicSwitch: topicStore.setSelectedTopic,
			projectFilesStore,
		}
	}, [projectFilesStore, topicStore.setSelectedTopic])

	// Keep the composer inset symmetric inside the narrow conversation rail.
	return (
		<ConversationPanelScaffold
			scope="app-conversation-panel"
			isConversationPanelCollapsed={isConversationPanelCollapsed}
			detailPanelVisible={detailPanelVisible}
			header={
				<MessageHeader
					isConversationPanelCollapsed={isConversationPanelCollapsed}
					onToggleConversationPanel={onToggleConversationPanel}
					onExpandConversationPanel={onExpandConversationPanel}
					detailPanelVisible={detailPanelVisible}
					hideConversationPanelToggle={hideConversationPanelToggle}
					selectedProject={selectedProject}
					topicStore={topicStore}
					topicActions={topicActions}
					hideTopicListModeIcon
					historyTriggerMode={historyTriggerMode}
					isHistoryPanelOpen={isHistoryPanelOpen}
					onToggleHistoryPanel={onToggleHistoryPanel}
					trailingActions={trailingActions}
				/>
			}
			emptyHero={<AppConversationEmptyState variant="hero" className="w-full" />}
			emptyCompact={<AppConversationEmptyState variant="compact" />}
			editor={
				<div className="flex h-full min-h-0 w-full flex-none flex-col items-stretch gap-2 self-stretch pt-3">
					{/* The shared editor owns the bordered surface; this wrapper only aligns controls. */}
					<div className="flex w-full shrink-0 items-center gap-4 overflow-hidden">
						<ModeToggle
							size={detailPanelVisible ? "small" : "default"}
							topicMode={topicMode}
							agentCode={selectedTopic?.agent_code}
							allowChangeMode={messages.length === 0}
							onModeChange={setTopicMode}
							onCreateTopic={handleCreateTopic}
						/>
					</div>
					{/* Preserve the scaffold height so the editor can fill the manually resized panel. */}
					{/* <div className="flex px-1">
						<MicroAppIssuePromptPanel variant="desktop" />
					</div> */}
					<DefaultMessageEditorContainer editorContext={editorContext} />
				</div>
			}
			editorNodes={editorNodes}
			messageListProviderValue={messageListProviderValue}
			messages={messages as SuperMagicMessageItem[]}
			selectedTopic={selectedTopic}
			setSelectedDetail={onSelectDetail}
			enableRevokedUserMessageReedit
			revokedEditorContext={revokedEditorContext}
			handlePullMoreMessage={handlePullMoreMessage}
			showLoading={showLoading}
			currentTopicStatus={selectedTopic?.task_status}
			handleSendMsg={handleSendMsg}
			isMessagesLoading={isMessagesInitialLoading}
			className="rounded-none bg-sidebar pb-2 pr-2"
		/>
	)
}

function AppConversationEmptyState({
	className,
	variant,
}: {
	className?: string
	variant: "compact" | "hero"
}) {
	const { t } = useTranslation("super")

	return (
		<ConversationEmptyState
			className={className}
			icon={<AppConversationEmptyIcon variant={variant} />}
			title={t("microAppPage.conversation.emptyTitle")}
			subtitle={t("microAppPage.conversation.emptyDescription")}
			variant={variant}
			testId={`micro-app-conversation-empty-${variant}`}
		/>
	)
}

function AppConversationEmptyIcon({ variant }: { variant: "compact" | "hero" }) {
	return (
		<MicroAppConversationEmptyIllustration
			size={variant === "hero" ? "md" : "sm"}
			testId={`micro-app-conversation-empty-${variant}-illustration`}
		/>
	)
}

export default observer(AppConversationPanel)
