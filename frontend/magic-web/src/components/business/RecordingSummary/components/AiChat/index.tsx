import MessageList, { MessageListProvider } from "@/pages/superMagic/components/MessageList"
import { observer } from "mobx-react-lite"
import recordingSummaryStore from "@/stores/recordingSummary"
import { useMemoizedFn } from "ahooks"
import { ProjectFilesStore } from "@/stores/projectFiles"
import { userStore } from "@/models/user"
import { useInterruptAndUndoMessage } from "@/pages/superMagic/hooks/useInterruptAndUndoMessage"
import { LongMemoryApi } from "@/apis"
import { initializeService } from "@/services/recordSummary/serviceInstance"
import Editor from "./components/Editor"
import { useStyles } from "./styles"
import { type MentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { useTopicMessages } from "./hooks/useTopicMessages"
import { useEffect, useMemo, useRef, type ReactNode } from "react"
import PreviewDetailPopup, {
	PreviewDetailPopupRef,
} from "@/pages/superMagicMobile/components/PreviewDetailPopup"
import { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useFileOpen } from "@/pages/superMagic/components/TopicFilesButton/hooks/useFileOpen"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { downloadFileWithAnchor } from "@/pages/superMagic/utils/handleFIle"
import { JSONContent } from "@tiptap/core"
import { merge } from "lodash-es"
import { useMessageChanges } from "@/pages/superMagic/hooks/useMessageChanges"
import { LongMemory } from "@/types/longMemory"
import { resolveMessageSendContext } from "@/pages/superMagic/services/messageSendPreparation"
import { createMessageSendService } from "@/pages/superMagic/services/messageSendFlowService"
import { convertFileToTabItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/utils/tabUtils"
import MessageListFallback from "./components/MessageListFallback"
import type { ProjectListItem, Topic, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import TopicMessagePanel from "@/pages/superMagic/pages/TopicPage/components/TopicMessagePanel"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import type { MessageHeaderTopicActions } from "@/pages/superMagic/components/MessageHeader"

/** Normalize relative paths before matching path-only message attachments to workspace files. */
function normalizeAttachmentPath(path: string | undefined): string {
	return (path || "").trim().replace(/^\/+|\/+$/g, "")
}

export interface AiChatProps {
	projectFilesStore: ProjectFilesStore
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	checkNowDebounced: () => void
	recordSummaryFileStore: MentionPanelStore
	/** Optional detail-page resources; active recording falls back to the recording store. */
	selectedTopic?: Topic | null
	selectedProject?: ProjectListItem | null
	selectedWorkspace?: Workspace | null
	setSelectedProject?: (project: ProjectListItem | null) => void
	setSelectedTopic?: (topic: Topic | null) => void
	setSelectedWorkspace?: (workspace: Workspace | null) => void
	/** Detail pages do not flush live ASR state before sending. */
	useRecordingSync?: boolean
	/** Reuses the full project-detail message/editor surface inside recording detail. */
	projectDetailMode?: boolean
	/** Controls whether the project-detail conversation can switch into recording mode. */
	allowRecordingMode?: boolean
	topicStore?: TopicStore
	topicActions?: MessageHeaderTopicActions
	historyTriggerMode?: "dropdown" | "layout"
	isHistoryPanelOpen?: boolean
	onToggleHistoryPanel?: () => void
	isConversationPanelCollapsed?: boolean
	onToggleConversationPanel?: () => void
	onExpandConversationPanel?: () => void
	trailingActions?: ReactNode
}

export function AiChat(props: AiChatProps) {
	const {
		attachments,
		attachmentList,
		checkNowDebounced,
		recordSummaryFileStore,
		projectFilesStore,
		selectedTopic: selectedTopicProp,
		selectedProject: selectedProjectProp,
		selectedWorkspace: selectedWorkspaceProp,
		setSelectedProject = recordingSummaryStore.setProject,
		setSelectedTopic = recordingSummaryStore.setChatTopic,
		setSelectedWorkspace = recordingSummaryStore.setWorkspace,
		useRecordingSync = true,
		projectDetailMode = false,
		allowRecordingMode = true,
		topicStore,
		topicActions,
		historyTriggerMode,
		isHistoryPanelOpen,
		onToggleHistoryPanel,
		isConversationPanelCollapsed = false,
		onToggleConversationPanel,
		onExpandConversationPanel,
		trailingActions,
	} = props

	const recordSummaryService = initializeService()
	const { styles } = useStyles()
	const previewDetailPopupRef = useRef<PreviewDetailPopupRef>(null)

	const selectedTopic =
		selectedTopicProp !== undefined
			? selectedTopicProp
			: (recordingSummaryStore.businessData.chatTopic ?? null)
	const selectedProject =
		selectedProjectProp !== undefined
			? selectedProjectProp
			: (recordingSummaryStore.businessData.project ?? null)
	const selectedWorkspace =
		selectedWorkspaceProp !== undefined
			? selectedWorkspaceProp
			: (recordingSummaryStore.businessData.workspace ?? null)

	const scopedMessageSendService = useMemo(
		() => createMessageSendService({ mentionPanelStore: recordSummaryFileStore }),
		[recordSummaryFileStore],
	)

	// 使用消息管理 hook
	const { messages, showLoading, isShowLoadingInit, handlePullMoreMessage } = useTopicMessages({
		selectedTopic,
		selectedWorkspace,
		checkNowDebounced,
	})

	const { hasMemoryUpdateMessage } = useMessageChanges(messages)

	useEffect(() => {
		if (!hasMemoryUpdateMessage) return
		// 更新长期记忆
		try {
			LongMemoryApi.getMemories({
				status: [LongMemory.MemoryStatus.Pending, LongMemory.MemoryStatus.PENDING_REVISION],
				page_size: 99,
			}).then((res) => {
				if (res?.success) {
					userStore.user.setPendingMemoryList(res.data || [])
				}
			})
		} catch (error) {
			console.error(error)
		}
	}, [hasMemoryUpdateMessage])

	// Handle interrupt and undo message functionality
	useInterruptAndUndoMessage({
		selectedTopic,
		messages,
		userInfo: userStore.user.userInfo,
	})

	// 封装消息发送处理函数
	const handleSendMsg = useMemoizedFn((content: JSONContent | string, options?: any) => {
		/**
		 * 补充 asr_task_key 参数
		 * 用于录音总结模式，AI 对话功能使用该逻辑
		 */
		const _options = merge(options, {
			extra: {
				super_agent: {
					dynamic_params: useRecordingSync
						? { asr_task_key: recordSummaryService.getCurrentSessionTaskKey() }
						: undefined,
				},
			},
		})

		// Detail conversations are independent from the live recorder flush lifecycle.
		if (useRecordingSync) {
			recordSummaryService.flushNoteUpdate()
			recordSummaryService.flushTranscriptUpdate()
		}

		scopedMessageSendService.sendContent({
			content,
			showLoading: messages?.length > 1 && showLoading,
			options: _options,
			context: resolveMessageSendContext({
				selectedProject,
				selectedTopic,
				selectedWorkspace,
				setSelectedProject,
				setSelectedTopic,
				setSelectedWorkspace,
				// Detail conversations update both the selected topic and history list atomically.
				topicStore,
				updateTopicName: topicActions?.updateTopicName,
			}),
		})

		// 延迟200ms通知MessageList组件滚动到底部
		setTimeout(() => {
			pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom)
		}, 200)
	})

	const { handleOpenFile, handleNodeFile } = useFileOpen({
		setUserSelectDetail: (detail) => {
			previewDetailPopupRef.current?.open(detail, attachments, attachmentList)
		},
		attachments,
	})

	const onFileClick = useMemoizedFn((fileItem: string | AttachmentItem) => {
		// Accept both direct attachment objects and legacy file-id callbacks.
		const targetFile =
			typeof fileItem === "string"
				? attachmentList.find((item) => item.file_id === fileItem)
				: fileItem
		if (targetFile) {
			handleOpenFile(targetFile)
		}
	})

	useEffect(() => {
		const openFileTabCallback = (data: { fileId: string; fileData?: AttachmentItem }) => {
			// Message attachments arrive as file records, while node events use the legacy node shape.
			if (data.fileData) {
				handleOpenFile(data.fileData)
				return
			}

			handleNodeFile(data)
		}

		pubsub.subscribe(PubSubEvents.Open_File_Tab, openFileTabCallback)
		return () => {
			pubsub?.unsubscribe(PubSubEvents.Open_File_Tab, openFileTabCallback)
		}
	}, [handleNodeFile, handleOpenFile])

	useEffect(() => {
		const openPlaybackTabCallback = (data: any) => {
			handleNodeFile(data)
		}

		pubsub.subscribe(PubSubEvents.Open_Playback_Tab, openPlaybackTabCallback)
		return () => {
			pubsub?.unsubscribe(PubSubEvents.Open_Playback_Tab, openPlaybackTabCallback)
		}
	}, [handleNodeFile])

	useEffect(() => {
		/** Resolve path-only attachment events inside the standalone conversation preview. */
		const openFileTabByPathCallback = (data: unknown) => {
			const payload = data as {
				filePath?: string
				fileName?: string
				action?: "open" | "download"
			}
			const targetPath = normalizeAttachmentPath(payload.filePath)
			if (!targetPath) return

			const targetFile = attachmentList.find(
				(item) => normalizeAttachmentPath(item.relative_file_path) === targetPath,
			)
			if (!targetFile?.file_id) return

			if (payload.action === "download") {
				void getTemporaryDownloadUrl({
					file_ids: [targetFile.file_id],
					is_download: true,
				}).then((result: any[]) => {
					downloadFileWithAnchor(result?.[0]?.url)
				})
				return
			}

			handleOpenFile(targetFile)
		}

		pubsub.subscribe(PubSubEvents.Open_File_Tab_By_Path, openFileTabByPathCallback)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Open_File_Tab_By_Path, openFileTabByPathCallback)
		}
	}, [attachmentList, handleOpenFile])

	useEffect(() => {
		if (!useRecordingSync) return
		if (!selectedProject?.id) {
			return
		}
		recordSummaryFileStore.getInitLoadAttachmentsPromise(selectedProject?.id).then(() => {
			// 把笔记添加到当前会话的tabs中，方便@
			const noteContent = recordSummaryService.getNoteFile()
			if (noteContent) {
				const targetFile = attachmentList.find(
					(item) => item.file_id === noteContent.file_id,
				)
				if (targetFile) {
					const tabItem = convertFileToTabItem(targetFile, attachmentList, {
						create_at: Date.now(),
						active_at: Date.now(),
					})
					if (tabItem) {
						recordSummaryFileStore.setCurrentTabs([tabItem])
					}
				}
			}
		})
	}, [
		selectedProject?.id,
		attachmentList,
		recordSummaryFileStore,
		recordSummaryService,
		useRecordingSync,
	])

	const value = useMemo(() => {
		return {
			allowRevoke: true,
			allowUserMessageCopy: false,
			allowScheduleTaskCreate: false,
			allowMessageTooltip: true,
			allowCreateNewTopic: false,
			projectFilesStore,
		}
	}, [projectFilesStore])

	const previewPopup = (
		<PreviewDetailPopup
			ref={previewDetailPopupRef}
			setUserSelectDetail={(detail: any) => {
				previewDetailPopupRef.current?.open(detail, attachments, attachmentList)
			}}
			selectedTopic={selectedTopic}
			selectedProject={selectedProject}
		/>
	)

	if (projectDetailMode && topicStore && topicActions) {
		return (
			<>
				{/* Recording detail uses the complete project conversation surface with scoped dependencies. */}
				<TopicMessagePanel
					selectedProject={selectedProject}
					selectedWorkspace={selectedWorkspace}
					selectedTopic={selectedTopic}
					messages={messages}
					showLoading={showLoading}
					isShowLoadingInit={isShowLoadingInit}
					currentTopicStatus={selectedTopic?.task_status}
					attachments={attachments}
					handleSendMsg={handleSendMsg}
					handlePullMoreMessage={handlePullMoreMessage}
					handleFileClick={(fileId) => onFileClick(fileId)}
					setUserSelectDetail={(detail) => {
						previewDetailPopupRef.current?.open(detail, attachments, attachmentList)
					}}
					setSelectedTopic={setSelectedTopic}
					topicActions={topicActions}
					topicStore={topicStore}
					projectFilesStore={projectFilesStore}
					mentionPanelStore={recordSummaryFileStore}
					allowRecordingMode={allowRecordingMode}
					historyTriggerMode={historyTriggerMode ?? "layout"}
					isHistoryPanelOpen={isHistoryPanelOpen}
					onToggleHistoryPanel={onToggleHistoryPanel}
					isConversationPanelCollapsed={isConversationPanelCollapsed}
					onToggleConversationPanel={onToggleConversationPanel}
					onExpandConversationPanel={onExpandConversationPanel}
					trailingActions={trailingActions}
				/>
				{previewPopup}
			</>
		)
	}

	return (
		<div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
			<MessageListProvider value={value}>
				{messages.length === 0 ? (
					<div className={`${styles.messageListFallback} min-h-0 flex-1`}>
						<MessageListFallback />
					</div>
				) : (
					<MessageList
						data={messages}
						selectedTopic={selectedTopic}
						handlePullMoreMessage={handlePullMoreMessage}
						showLoading={showLoading}
						currentTopicStatus={selectedTopic?.task_status}
						handleSendMsg={handleSendMsg}
						className={`${styles.messageList} min-h-0 flex-1`}
						onFileClick={onFileClick}
						stickyMessageClassName="top-0 [--sticky-message-mask-bg:rgb(255_255_255)] [--sticky-message-mask-fade-from:rgb(255_255_255)]"
					/>
				)}
			</MessageListProvider>
			{/* <div className={styles.aiGeneratedMessageTip}>
				{t("recordingSummary.ui.aiGeneratedTip")}
			</div> */}
			<Editor
				messages={messages}
				attachments={attachments}
				selectedWorkspace={selectedWorkspace}
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				mentionPanelStore={recordSummaryFileStore}
				projectFilesStore={projectFilesStore}
				isShowLoadingInit={isShowLoadingInit}
				showLoading={showLoading}
			/>
			{previewPopup}
		</div>
	)
}

export default observer(AiChat)
