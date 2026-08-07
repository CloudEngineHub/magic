import { useMemo, useState } from "react"
import { merge } from "lodash-es"
import type { FC } from "react"
import recordingSummaryStore from "@/stores/recordingSummary"
import type { ProjectFilesStore } from "@/stores/projectFiles"
import TaskList from "@/pages/superMagic/components/TaskList"
import MessageQueue from "@/pages/superMagic/components/MessagePanel/components/MessageQueue"
import useMessageQueue from "@/pages/superMagic/components/MessagePanel/hooks/useMessageQueue"
import { MessageEditorProvider } from "@/pages/superMagic/components/MessageEditor"
import { createMessageEditorDraftKey } from "@/pages/superMagic/components/MessageEditor/utils/draftKey"
import DefaultMessageEditorContainer from "@/pages/superMagic/components/MainInputContainer/components/editors/DefaultMessageEditorContainer"
import MobileInputContainer from "@/pages/superMagicMobile/pages/ChatPage/components/MobileInputContainer"
import MobileComposerModeSelector from "@/pages/superMagicMobile/pages/ChatPage/components/mobile-composer/MobileComposerModeSelector"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import type { SuperMagicMessageItem } from "@/pages/superMagic/components/MessageList/type"
import { useTaskData } from "@/pages/superMagic/hooks/useTaskData"
import { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { getFallbackTopicModeIdentifier } from "@/services/superMagic/DefaultAgentSelectionService"
import { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { MentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { initializeService } from "@/services/recordSummary/serviceInstance"
import { cn } from "@/lib/tiptap-utils"
import { useIsMobile } from "@/hooks/useIsMobile"
import { createSuperMagicTopicModelStore } from "@/stores/superMagic/topicModelStore"

interface EditorProps {
	messages: SuperMagicMessageItem[]
	attachments?: AttachmentItem[]
	selectedWorkspace: Workspace | null
	selectedTopic: Topic | null
	selectedProject: ProjectListItem | null
	mentionPanelStore: MentionPanelStore
	projectFilesStore: ProjectFilesStore
	isShowLoadingInit: boolean
	showLoading: boolean
}

const Editor: FC<EditorProps> = ({
	messages,
	attachments,
	selectedWorkspace,
	selectedTopic,
	selectedProject,
	mentionPanelStore,
	projectFilesStore,
	isShowLoadingInit,
	showLoading,
}: EditorProps) => {
	const recordSummaryService = initializeService()
	const { taskData } = useTaskData({ selectedTopic })
	const isMobile = useIsMobile()
	// Share one model store between the visible selector and the mobile message composer.
	const [topicModelStore] = useState(createSuperMagicTopicModelStore)

	const messageQueue = useMessageQueue({
		projectId: selectedProject?.id,
		topicId: selectedTopic?.id,
		isTaskRunning: showLoading,
		isEmptyStatus: false,
		isShowLoadingInit,
	})

	const editorContext = useMemo<SceneEditorContext>(() => {
		return {
			draftKey: createMessageEditorDraftKey({
				selectedWorkspace,
				selectedProject,
				selectedTopic,
			}),
			selectedWorkspace,
			selectedTopic,
			selectedProject,
			setSelectedWorkspace: (workspace) => {
				if (workspace) {
					void recordSummaryService.updateWorkspace(workspace)
					return
				}

				recordingSummaryStore.setWorkspace(null)
			},
			setSelectedProject: (project) => {
				if (project) {
					void recordSummaryService.updateProject(project)
					return
				}

				recordingSummaryStore.setProject(null)
			},
			setSelectedTopic: (topic) => {
				if (topic) {
					void recordSummaryService.updateChatTopic(topic)
					return
				}

				recordingSummaryStore.setChatTopic(null)
			},
			topicMode: getFallbackTopicModeIdentifier(),
			size: isMobile ? "mobile" : "small",
			className: "border-none",
			containerClassName: "rounded-xl border-muted-foreground",
			showLoading,
			isEmptyStatus: false,
			messagesLength: messages.length,
			enableMessageSendByContent: true,
			modules: {
				aiCompletion: {
					enabled: true,
				},
				voiceInput: {
					enabled: false,
				},
			},
			attachments,
			mentionPanelStore,
			projectFilesStore,
			topicModelStore,
			// Keep the recording employee fixed while exposing the claw-style model selector on mobile.
			mobileModeSelectorVariant: isMobile ? "claw" : undefined,
			mergeSendParams: ({ defaultParams }) => {
				return merge({}, defaultParams, {
					extra: {
						dynamic_params: {
							asr_task_key: recordSummaryService.getCurrentSessionTaskKey(),
						},
					},
				})
			},
			onSendSuccess: () => {
				setTimeout(() => {
					pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom)
				}, 200)
			},
			queueContext: {
				editingQueueItem: messageQueue.editingQueueItem,
				addToQueue: messageQueue.addToQueue,
				finishEditQueueItem: messageQueue.finishEditQueueItem,
			},
		}
	}, [
		selectedWorkspace,
		selectedProject,
		selectedTopic,
		isMobile,
		showLoading,
		messages.length,
		attachments,
		mentionPanelStore,
		projectFilesStore,
		topicModelStore,
		messageQueue.editingQueueItem,
		messageQueue.addToQueue,
		messageQueue.finishEditQueueItem,
		recordSummaryService,
	])

	const taskDataNode = taskData && taskData?.process?.length > 0 && (
		<div className="mb-2 border-b border-border">
			<TaskList taskData={taskData} isInChat />
		</div>
	)

	const messageQueueNode = messageQueue.queue.length > 0 && (
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
	)

	const messageEditorProviderConfig = useMemo(() => {
		return {
			enableVoiceInput: false,
		}
	}, [])

	return (
		<MessageEditorProvider config={messageEditorProviderConfig}>
			<div className={cn("w-full shrink-0 rounded-xl", isMobile ? "border-0 !p-0" : "m-2")}>
				{taskDataNode}
				{messageQueueNode}
				{isMobile ? (
					<div className="flex w-full flex-col gap-2">
						{/* Keep employee selection hidden while exposing the general-model picker. */}
						<div className="flex min-h-8 items-center px-2">
							<MobileComposerModeSelector
								selectedTopic={selectedTopic}
								selectedProject={selectedProject}
								topicMode={TopicMode.General}
								selectorVariant="claw"
								topicModelStore={topicModelStore}
								messagesLength={messages.length}
								onModeChange={undefined}
							/>
						</div>
						{/* Reuse the same mobile input container as the standalone chat page. */}
						<MobileInputContainer editorContext={editorContext} />
					</div>
				) : (
					<DefaultMessageEditorContainer editorContext={editorContext} />
				)}
			</div>
		</MessageEditorProvider>
	)
}

export default Editor
