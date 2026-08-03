import { lazy, memo, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { JSONContent } from "@tiptap/core"
import { useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import MessageList, { MessageListProvider } from "../../../components/MessageList"
import MessageHeader, { type MessageHeaderTopicActions } from "../../../components/MessageHeader"
import { SuperMagicMessageItem } from "../../../components/MessageList/type"
import { ProjectListItem, TaskStatus, Topic, TopicMode } from "../../Workspace/types"
import { cn } from "@/lib/utils"
import { superMagicStore } from "@/pages/superMagic/stores"
import { topicStore } from "../../../stores/core"
import useTopicMode from "@/pages/superMagic/hooks/useTopicMode"
import { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"
import useTopicModel from "@/pages/superMagic/components/MessageEditor/hooks/useTopicModel"
import ModeAvatar from "@/pages/superMagic/components/ModeAvatar"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { MessageListContextState } from "@/pages/superMagic/components/MessageList/context"
import {
	OptimisticMessage,
	optimisticMessageStore,
} from "@/pages/superMagic/stores/optimisticMessageStore"
import { getNetworkMonitor } from "@/services/recordSummary/NetworkMonitor"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { SendMessageOptions } from "@/pages/superMagic/components/MessagePanel/types"
import type { HandleSendParams } from "@/pages/superMagic/services/messageSendFlowService"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import projectFilesStore from "@/stores/projectFiles"
import { useFileActionVisibility } from "@/pages/superMagic/providers/file-action-visibility-provider"

const ProjectPageInputContainer = lazy(
	() => import("../../../components/ProjectPageInputContainer"),
)

interface RetryMessageNode {
	content?: string
	extra?: SendMessageOptions["extra"]
}

interface RetrySendSuperAgentExtra {
	mentions?: MentionListItem[]
	model?: ModelItem | null
	image_model?: ModelItem | null
	video_model?: ModelItem | null
	topic_pattern?: TopicMode
}

function isRetryJSONContent(content: unknown): content is JSONContent {
	return Boolean(content) && typeof content === "object"
}

/** Recovers original content and send params from the v2 main store rich_text node; no body copy is kept in sidecar. */
function resolveRetryMessagePayload(messageNode: unknown) {
	const node = messageNode as RetryMessageNode
	if (!node?.content) return undefined

	let parsedContent: unknown
	try {
		// Historical rich_text may be corrupted by stale or abnormal writes; JSON.parse must not break the page flow during retry recovery.
		parsedContent = JSON.parse(node.content)
	} catch {
		return undefined
	}
	if (!isRetryJSONContent(parsedContent)) return undefined

	return {
		content: parsedContent,
		options: node.extra ? ({ extra: node.extra } as SendMessageOptions) : undefined,
	}
}

function resolveRetrySendParams(
	retryPayload: NonNullable<ReturnType<typeof resolveRetryMessagePayload>>,
): HandleSendParams {
	// Failed retry must go through the first-layer send entry, so we restore rich_text extra back to editor send params.
	const superAgent = retryPayload.options?.extra?.super_agent as
		RetrySendSuperAgentExtra | undefined

	return {
		value: retryPayload.content,
		mentionItems: superAgent?.mentions ?? [],
		selectedModel: superAgent?.model,
		selectedImageModel: superAgent?.image_model,
		selectedVideoModel: superAgent?.video_model,
		topicMode: superAgent?.topic_pattern,
		extra: retryPayload.options?.extra,
	}
}

interface TopicMessagePanelProps {
	selectedProject: ProjectListItem | null
	selectedTopic: Topic | null
	messages: SuperMagicMessageItem[]
	showLoading: boolean
	isShowLoadingInit: boolean
	currentTopicStatus: any
	attachments: any[]
	handleSendMsg: (content: JSONContent | string, options?: SendMessageOptions) => void
	handlePullMoreMessage: (topicInfo: any, callback?: () => void) => void
	handleFileClick: (fileId: string, fileData?: any) => void
	setUserSelectDetail: (detail: any) => void
	setSelectedTopic: (topic: any) => void
	topicActions: MessageHeaderTopicActions
	isConversationPanelCollapsed?: boolean
	onToggleConversationPanel?: () => void
	onExpandConversationPanel?: () => void
	detailPanelVisible?: boolean
	isMessagesLoading?: boolean
	isDraggingPanel?: boolean
	historyTriggerMode?: "dropdown" | "layout"
	isHistoryPanelOpen?: boolean
	onToggleHistoryPanel?: () => void
	/** Injected by singleTopicChat variant for conversation-level overflow actions. */
	trailingActions?: ReactNode
}

function TopicMessagePanel({
	selectedProject,
	selectedTopic,
	messages,
	showLoading,
	isShowLoadingInit,
	currentTopicStatus,
	attachments,
	handleSendMsg,
	handlePullMoreMessage,
	handleFileClick,
	setUserSelectDetail,
	setSelectedTopic,
	topicActions,
	isConversationPanelCollapsed = false,
	onToggleConversationPanel,
	onExpandConversationPanel,
	detailPanelVisible = true,
	isMessagesLoading,
	isDraggingPanel = false,
	historyTriggerMode = "dropdown",
	isHistoryPanelOpen = false,
	onToggleHistoryPanel,
	trailingActions,
}: TopicMessagePanelProps) {
	// Chat detail route hides branch-topic actions via FileActionVisibilityProvider.
	const { hideCreateNewTopic } = useFileActionVisibility()
	const allowTopicBranchActions = !hideCreateNewTopic

	/**
	 * 聊天页的话题模式，用于已有话题的模式展示或新话题的模式切换
	 */
	const { topicMode, setTopicMode } = useTopicMode({
		selectedTopic,
		selectedProject,
	})

	const sharedTopicModelStore = useMemo(() => createSuperMagicTopicModelStore(), [])

	const { topicModelStore } = useTopicModel({
		selectedTopic,
		selectedProject,
		topicMode,
		topicModelStore: sharedTopicModelStore,
	})
	const shouldScrollAfterRetryRef = useRef(false)
	const sendRetryMessageRef = useRef<(params: HandleSendParams) => Promise<boolean>>()
	const retryingOptimisticMessageIdsRef = useRef<Set<string>>(new Set())

	const topicModeConfig = useMemo(() => {
		return superMagicModeService.getModeConfigWithLegacy(
			topicMode,
			undefined,
			false,
			selectedTopic?.agent_code,
		)
	}, [topicMode, selectedTopic?.agent_code])

	const handleRetryOptimisticMessage = useMemoizedFn(async (message: SuperMagicMessageItem) => {
		const chatTopicId = selectedTopic?.chat_topic_id
		const appMessageId = message?.app_message_id
		if (!chatTopicId || !appMessageId) return

		const retryingKey = `${chatTopicId}:${appMessageId}`
		if (retryingOptimisticMessageIdsRef.current.has(retryingKey)) return

		// Retry entry only handles failed optimistic messages in the current topic to prevent accidental sends after state changes.
		if (message?.topic_id && `${message.topic_id}` !== chatTopicId) return
		if (
			optimisticMessageStore.getStatus(chatTopicId, appMessageId) !==
			OptimisticMessage.Status.Failed
		)
			return
		if (getNetworkMonitor().isNetworkOffline()) {
			// Offline retry keeps the original failed node intact to avoid generating a new failed message after deletion.
			return
		}

		const retryPayload = resolveRetryMessagePayload(
			superMagicStore.getMessageNode(message.super_message_id),
		)
		if (!retryPayload) return
		if (!sendRetryMessageRef.current) return

		retryingOptimisticMessageIdsRef.current.add(retryingKey)
		// Retry reuses the first-layer editor send entry; normal send logic decides between direct send or queue.
		let didStartRetry = false
		try {
			didStartRetry = await sendRetryMessageRef.current({
				...resolveRetrySendParams(retryPayload),
			})
		} catch (e) {
			return
		} finally {
			retryingOptimisticMessageIdsRef.current.delete(retryingKey)
		}
		if (!didStartRetry) return

		// Before deleting the old failed message, re-anchor subsequent failed messages to the previous anchor point.
		optimisticMessageStore.reanchorDependentsBeforeMessageRemoval({
			chat_topic_id: chatTopicId,
			app_message_id: appMessageId,
		})
		optimisticMessageStore.remove({
			chat_topic_id: chatTopicId,
			app_message_id: appMessageId,
		})
		superMagicStore.removeUserMessage(chatTopicId, appMessageId)

		shouldScrollAfterRetryRef.current =
			!showLoading && currentTopicStatus !== TaskStatus.RUNNING
	})

	const value = useMemo<MessageListContextState>(() => {
		return {
			allowRevoke: true,
			allowUserMessageCopy: true,
			allowScheduleTaskCreate: true,
			allowMessageTooltip: true,
			// "从此处创建新话题" and timeout "新建话题" both respect chat visibility flags.
			allowConversationCopy: allowTopicBranchActions,
			allowCreateNewTopic: allowTopicBranchActions,
			onTopicSwitch: setSelectedTopic,
			onRetryOptimisticMessage: handleRetryOptimisticMessage,
			projectFilesStore,
			renderAssistantAvatar: topicModeConfig?.mode
				? ({ className } = {}) => (
						<ModeAvatar
							mode={topicModeConfig.mode}
							className={className}
							iconSize={20}
						/>
					)
				: undefined,
		}
	}, [allowTopicBranchActions, topicModeConfig, setSelectedTopic, handleRetryOptimisticMessage])

	const messagesWithOptimisticMeta = messages.map((message) => {
		const optimisticStatus = optimisticMessageStore.getStatus(
			selectedTopic?.chat_topic_id,
			message?.app_message_id,
		)
		if (!optimisticStatus) return message

		return {
			...message,
			optimisticMeta: {
				status: optimisticStatus,
			},
		}
	})

	useLayoutEffect(() => {
		if (!shouldScrollAfterRetryRef.current) return
		shouldScrollAfterRetryRef.current = false
		// Retry deletes the old failed node and inserts a new sending node; count may stay the same — scroll after this DOM commit.
		pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom, {
			behavior: "auto",
			time: 1000,
		})
	})

	return (
		<div
			className={cn(
				"relative z-10 flex h-full flex-col items-center overflow-hidden",
				!isDraggingPanel && "transition-all duration-300",
				!isConversationPanelCollapsed && "rounded-lg",
				isConversationPanelCollapsed ? "px-0 pb-0" : "pb-2",
			)}
		>
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
				trailingActions={trailingActions}
			/>
			{/* Keep the scroll viewport in layout so native scroll anchoring preserves the reading position. */}
			{selectedTopic && (
				<div
					className={cn(
						"flex h-full w-full flex-col",
						isConversationPanelCollapsed && "invisible",
					)}
				>
					<MessageListProvider value={value}>
						<MessageList
							data={messagesWithOptimisticMeta as SuperMagicMessageItem[]}
							setSelectedDetail={setUserSelectDetail}
							selectedTopic={selectedTopic}
							handlePullMoreMessage={handlePullMoreMessage}
							showLoading={showLoading}
							currentTopicStatus={currentTopicStatus}
							handleSendMsg={handleSendMsg}
							onFileClick={handleFileClick}
							isMessagesLoading={isMessagesLoading}
							enableRevokedUserMessageReedit
							topicModelStore={topicModelStore}
							enableExport
							exportTitle={selectedTopic?.topic_name}
						/>
					</MessageListProvider>
					<ProjectPageInputContainer
						className="mx-auto max-w-3xl rounded-2xl"
						classNames={{
							editorInnerWrapper: "border border-border",
							editor: "border-none",
						}}
						messages={messagesWithOptimisticMeta}
						showLoading={showLoading}
						selectedProject={selectedProject}
						selectedTopic={selectedTopic}
						setSelectedTopic={setSelectedTopic}
						onFileClick={handleFileClick}
						onMessageSendReady={(sendMessage, prevSendMessage) => {
							// Only update ref if it still points to the old instance (or is a new registration); prevents stale cleanup from clearing newly registered functions.
							if (
								prevSendMessage === undefined ||
								sendRetryMessageRef.current === prevSendMessage
							) {
								sendRetryMessageRef.current = sendMessage
							}
						}}
						attachments={attachments}
						isShowLoadingInit={isShowLoadingInit}
						topicModeLogic={{
							topicMode,
							setTopicMode,
						}}
						size={detailPanelVisible ? "small" : "default"}
					/>
				</div>
			)}
		</div>
	)
}

export default memo(observer(TopicMessagePanel))
