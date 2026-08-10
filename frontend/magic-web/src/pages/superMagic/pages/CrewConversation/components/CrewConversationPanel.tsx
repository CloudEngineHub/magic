import { useMemo, useState } from "react"
import type { JSONContent } from "@tiptap/react"
import { useMemoizedFn } from "ahooks"
import { merge } from "lodash-es"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { History, MessageCirclePlus } from "lucide-react"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import ConversationEmptyState from "@/pages/superMagic/components/ConversationPanelScaffold/ConversationEmptyState"
import ConversationPanelScaffold from "@/pages/superMagic/components/ConversationPanelScaffold"
import MessageList, { MessageListProvider } from "@/pages/superMagic/components/MessageList"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import MobileInputContainer from "@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer"
import MobileComposerModeSelector from "@/pages/superMagicMobile/pages/ChatPage/components/mobile-composer/MobileComposerModeSelector"
import MessageHeader, {
	type MessageHeaderTopicActions,
} from "@/pages/superMagic/components/MessageHeader"
import type {
	SceneEditorContext,
	SceneEditorNodes,
} from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import MessageQueue from "@/pages/superMagic/components/MessagePanel/components/MessageQueue"
import useMessageQueue from "@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue"
import useTopicModel from "@/pages/superMagic/components/MessageEditor/hooks/useTopicModel"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import type { SendMessageOptions } from "@/pages/superMagic/components/MessagePanel/types"
import type { MessageListContextState } from "@/pages/superMagic/components/MessageList/context"
import { useInterruptAndUndoMessage } from "@/pages/superMagic/hooks/useInterruptAndUndoMessage"
import { useTaskInterrupt } from "@/pages/superMagic/hooks/useTaskInterrupt"
import { useTopicConversationLoading } from "@/pages/superMagic/hooks/useTopicConversationLoading"
import { useTopicMessages } from "@/pages/superMagic/hooks/useTopicMessages"
import { createMessageSendService } from "@/pages/superMagic/services/messageSendFlowService"
import { resolveMessageSendContext } from "@/pages/superMagic/services/messageSendPreparation"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { userStore } from "@/models/user"
import { Button } from "@/components/shadcn-ui/button"
import { DEFAULT_LAYOUT_CONFIG } from "@/pages/superMagic/components/MessageEditor/constants/constant"
import { MOBILE_LAYOUT_CONFIG } from "@/pages/superMagic/components/MainInputContainer/components/editors/constant"
import { cn } from "@/lib/utils"
import { useCrewConversationStore } from "../context"
import { useMagicWidgetBridge } from "../hooks/useMagicWidgetBridge"
import CrewAvatar from "./CrewAvatar"

interface CrewConversationPanelProps {
	widgetContext?: { instanceId: string; hostOrigin: string } | null
	variant: "desktop" | "mobile"
	detailPanelVisible?: boolean
	isConversationPanelCollapsed?: boolean
	onToggleConversationPanel?: () => void
	onExpandConversationPanel?: () => void
	historyTriggerMode?: "dropdown" | "layout"
	isHistoryPanelOpen?: boolean
	onToggleHistoryPanel?: () => void
	showTopicHistory?: boolean
	onOpenTopics?: () => void
	topicActions?: MessageHeaderTopicActions
	onFileClick?: (fileItem?: unknown) => void
}

function CrewConversationPanel({
	variant,
	detailPanelVisible = true,
	isConversationPanelCollapsed = false,
	onToggleConversationPanel,
	onExpandConversationPanel,
	historyTriggerMode = "dropdown",
	isHistoryPanelOpen = false,
	onToggleHistoryPanel,
	showTopicHistory = true,
	onOpenTopics,
	topicActions,
	onFileClick,
	widgetContext = null,
}: CrewConversationPanelProps) {
	const { t } = useTranslation(["crew/market", "super"])
	const store = useCrewConversationStore()
	const selectedProject = store.selectedProject
	const selectedTopic = store.selectedTopic
	const agentCode = store.agentCode
	const topicStore = store.topicStore
	const isMobile = variant === "mobile"
	const [stopEventLoading, setStopEventLoading] = useState(false)
	const { notifyAgentReady } = useMagicWidgetBridge({
		// Keep the protocol listener alive before a topic exists so early commands receive an explicit response.
		context: widgetContext,
		createNewConversation: store.createAndSelectNewTopic,
	})

	const scopedMessageSendService = useMemo(
		() =>
			createMessageSendService({
				mentionPanelStore: store.mentionPanelStore,
			}),
		[store.mentionPanelStore],
	)

	const { messages, showLoading } = useTopicConversationLoading<TaskStatus>({
		selectedTopic,
		onConversationGeneratingChange: store.setConversationGenerating,
		onTopicMessagesChange: ({ lastMessageNode, selectedTopic: currentTopic }) => {
			if (currentTopic?.id && lastMessageNode?.status) {
				store.updateTopicStatus(currentTopic.id, lastMessageNode.status)
			}
		},
	})
	const canInterruptTask =
		showLoading || selectedTopic?.task_status === TaskStatus.WAITING_FOR_USER

	const { handlePullMoreMessage, isMessagesInitialLoading } = useTopicMessages({
		selectedTopic,
	})

	const messageQueue = useMessageQueue({
		projectId: selectedProject?.id,
		topicId: selectedTopic?.id,
		agentCode,
		isTaskRunning: showLoading,
		isEmptyStatus: false,
		isShowLoadingInit: isMessagesInitialLoading,
	})

	const { topicModelStore } = useTopicModel({
		selectedTopic,
		selectedProject,
		topicMode: TopicMode.CustomAgent,
		agentCode,
		topicModelStore: store.topicModelStore,
	})

	const { handleInterrupt } = useTaskInterrupt({
		selectedTopic: selectedTopic ?? null,
		userId: userStore.user.userInfo?.user_id,
		isStopping: stopEventLoading,
		setIsStopping: setStopEventLoading,
		canInterrupt: canInterruptTask,
	})

	const handleSendMsg = useMemoizedFn(
		(content: JSONContent | string, options?: SendMessageOptions) => {
			scopedMessageSendService.sendContent({
				content,
				options,
				showLoading: messages.length > 1 && showLoading,
				context: resolveMessageSendContext({
					selectedProject,
					selectedTopic,
					selectedWorkspace: store.selectedWorkspace,
					setSelectedProject: store.setSelectedProject,
					setSelectedTopic: topicStore.setSelectedTopic,
					setSelectedWorkspace: store.setSelectedWorkspace,
					topicStore,
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
						variant={isMobile ? "mobile" : "default"}
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
		isMobile,
	])

	const editorContext = useMemo<SceneEditorContext>(() => {
		return {
			draftKey: createMessageEditorDraftKey({
				selectedProject,
				selectedTopic,
			}),
			selectedTopic,
			selectedProject,
			selectedWorkspace: store.selectedWorkspace,
			setSelectedTopic: topicStore.setSelectedTopic,
			setSelectedProject: store.setSelectedProject,
			setSelectedWorkspace: store.setSelectedWorkspace,
			topicMode: TopicMode.CustomAgent,
			agentCode,
			topicStore,
			layoutConfig: isMobile ? MOBILE_LAYOUT_CONFIG : DEFAULT_LAYOUT_CONFIG,
			placeholder: t("super:messageEditor.placeholderLoading"),
			showLoading,
			isTaskRunning: canInterruptTask,
			stopEventLoading,
			onReady: notifyAgentReady,
			handleInterrupt,
			onFileClick,
			mentionPanelStore: store.mentionPanelStore,
			projectFilesStore: store.projectFilesStore,
			topicModelStore,
			enableMessageSendByContent: true,
			showModeToggle: false,
			allowChangeMode: false,
			containerClassName: isMobile
				? undefined
				: "rounded-xl border border-border bg-background",
			mobileModeSelectorVariant: isMobile ? "claw" : undefined,
			messagesLength: messages.length,
			mergeSendParams: ({ defaultParams }) =>
				merge({}, defaultParams, {
					topicMode: TopicMode.CustomAgent,
					extra: {
						super_agent: {
							topic_pattern: TopicMode.CustomAgent,
							agent_code: agentCode,
						},
					},
				}),
			queueContext: {
				editingQueueItem: messageQueue.editingQueueItem,
				addToQueue: messageQueue.addToQueue,
				finishEditQueueItem: messageQueue.finishEditQueueItem,
			},
			size: isMobile ? "mobile" : detailPanelVisible ? "small" : "default",
		}
	}, [
		agentCode,
		detailPanelVisible,
		handleInterrupt,
		isMobile,
		messageQueue.addToQueue,
		messageQueue.editingQueueItem,
		messageQueue.finishEditQueueItem,
		messages.length,
		selectedProject,
		selectedTopic,
		showLoading,
		canInterruptTask,
		stopEventLoading,
		onFileClick,
		notifyAgentReady,
		store.mentionPanelStore,
		store.projectFilesStore,
		store.selectedWorkspace,
		store.setSelectedProject,
		store.setSelectedWorkspace,
		t,
		topicModelStore,
		topicStore,
	])

	const messageListProviderValue = useMemo<MessageListContextState>(
		() => ({
			allowRevoke: true,
			allowUserMessageCopy: true,
			allowMessageTooltip: true,
			allowConversationCopy: true,
			allowCreateNewTopic: true,
			onTopicSwitch: topicStore.setSelectedTopic,
			projectFilesStore: store.projectFilesStore,
			renderAssistantAvatar: ({ className } = {}) => (
				<CrewAvatar
					src={store.agent?.icon}
					name={store.agent?.name}
					className={cn("size-7", className)}
				/>
			),
		}),
		[
			store.agent?.icon,
			store.agent?.name,
			store.projectFilesStore,
			topicStore.setSelectedTopic,
		],
	)

	const emptyTitle = store.agent?.name || t("crew/market:crewConversation.unknownCrew")
	const emptySubtitle =
		store.agent?.description || store.agent?.role || t("crew/market:crewConversation.emptyHint")

	if (!isMobile) {
		return (
			<div
				className={cn(
					"relative z-10 flex h-full flex-col items-center overflow-hidden",
					"transition-all duration-300",
					!isConversationPanelCollapsed && "rounded-lg",
					isConversationPanelCollapsed ? "px-0 pb-0" : "pb-2",
				)}
				data-testid="crew-conversation-panel"
			>
				{topicActions ? (
					<MessageHeader
						isConversationPanelCollapsed={isConversationPanelCollapsed}
						onToggleConversationPanel={onToggleConversationPanel}
						onExpandConversationPanel={onExpandConversationPanel}
						detailPanelVisible={detailPanelVisible}
						selectedProject={selectedProject}
						topicStore={topicStore}
						topicActions={topicActions}
						historyTriggerMode={historyTriggerMode}
						isHistoryPanelOpen={isHistoryPanelOpen}
						onToggleHistoryPanel={onToggleHistoryPanel}
						showTopicHistory={showTopicHistory}
					/>
				) : null}
				{/* Keep the scroll viewport in layout so native scroll anchoring preserves the reading position. */}
				{selectedTopic ? (
					<div
						className={cn(
							"flex h-full w-full flex-col",
							isConversationPanelCollapsed && "invisible",
						)}
					>
						<MessageListProvider value={messageListProviderValue}>
							<MessageList
								data={messages as SuperMagicMessageItem[]}
								setSelectedDetail={onFileClick}
								selectedTopic={selectedTopic}
								handlePullMoreMessage={handlePullMoreMessage}
								showLoading={showLoading}
								currentTopicStatus={selectedTopic?.task_status}
								handleSendMsg={handleSendMsg}
								onFileClick={onFileClick}
								isMessagesLoading={isMessagesInitialLoading}
								enableRevokedUserMessageReedit
								topicModelStore={topicModelStore}
							/>
						</MessageListProvider>
						<div
							className="mx-auto w-full max-w-3xl rounded-2xl"
							data-testid="crew-conversation-editor"
						>
							<DefaultMessageEditorContainer
								editorContext={editorContext}
								editorNodes={editorNodes}
							/>
						</div>
					</div>
				) : null}
			</div>
		)
	}

	const emptyState = (
		<ConversationEmptyState
			icon={
				<CrewAvatar
					src={store.agent?.icon}
					name={store.agent?.name}
					className={isMobile ? "size-14" : "size-16"}
				/>
			}
			iconSoundEnabled={false}
			title={emptyTitle}
			subtitle={emptySubtitle}
			variant={isMobile ? "compact" : "hero"}
			testId="crew-conversation-empty"
		/>
	)

	const editor = (
		<div className="flex w-full flex-col">
			<div className="mb-2 flex min-h-8 items-center justify-between gap-2">
				<MobileComposerModeSelector
					selectedTopic={selectedTopic}
					selectedProject={selectedProject}
					topicMode={TopicMode.CustomAgent}
					agentCode={agentCode}
					selectorVariant="claw"
					topicModelStore={topicModelStore}
					messagesLength={messages.length}
					onModeChange={undefined}
				/>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						type="button"
						variant="ghost"
						className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
						aria-label={t("crew/market:crewConversation.newConversation")}
						disabled={store.isCreatingTopic || showLoading}
						onClick={() => void store.createAndSelectNewTopic()}
					>
						<MessageCirclePlus className="size-4" />
						<span>{t("crew/market:crewConversation.newConversation")}</span>
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
						aria-label={t("crew/market:crewConversation.topics")}
						onClick={onOpenTopics}
					>
						<History className="size-4" />
						<span>{t("crew/market:crewConversation.topics")}</span>
					</Button>
				</div>
			</div>
			<MobileInputContainer editorContext={editorContext} editorNodes={editorNodes} />
		</div>
	)

	return (
		<ConversationPanelScaffold
			scope="crew-conversation"
			rootTestId="crew-conversation-panel"
			editorTestId="crew-conversation-editor"
			isConversationPanelCollapsed={isConversationPanelCollapsed}
			detailPanelVisible={detailPanelVisible}
			header={null}
			emptyHero={emptyState}
			emptyCompact={emptyState}
			editor={editor}
			editorNodes={editorNodes}
			messageListProviderValue={messageListProviderValue}
			messages={messages as SuperMagicMessageItem[]}
			selectedTopic={selectedTopic}
			handlePullMoreMessage={handlePullMoreMessage}
			showLoading={showLoading}
			currentTopicStatus={selectedTopic?.task_status}
			handleSendMsg={handleSendMsg}
			isMessagesLoading={isMessagesInitialLoading}
			messageLayoutPaddingBottomPx={156}
			messageListBottomFade
			className="h-full"
		/>
	)
}

export default observer(CrewConversationPanel)
