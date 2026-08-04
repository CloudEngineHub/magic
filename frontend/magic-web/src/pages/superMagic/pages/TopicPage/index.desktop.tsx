import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useDeepCompareEffect, useDebounceFn, useUpdateEffect, useMemoizedFn } from "ahooks"
import { isEmpty } from "lodash-es"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Detail, { type DetailRef } from "../../components/Detail"
import { SendMessageOptions } from "../../components/MessagePanel/types"
import { shouldCheckAttachmentsOnTaskStatus } from "../../services/topicStatusSyncService"
import useStyles from "../Workspace/style"
import { JSONContent } from "@tiptap/core"
import GlobalMentionPanelStore from "@/components/business/MentionPanel/builtin-store"
import projectFilesStore from "@/stores/projectFiles"
import { filterClickableMessageWithoutRevoked } from "../../utils/handleMessage"
import { useDetailModeCache } from "../../hooks/useDetailModeCache"
import { useAttachmentsPolling } from "../../hooks/useAttachmentsPolling"
import { useProjectAttachmentsChangeRealtime } from "../../hooks/useProjectAttachmentsChangeRealtime"
import { useAutoOpenFile } from "../../hooks/useAutoOpenFile"
import { useDeferUntilFileTabsCacheLoaded } from "../../hooks/useDeferUntilFileTabsCacheLoaded"
import { useRefreshTopicDetailOnTaskComplete } from "../../hooks/useRefreshTopicDetailOnTaskComplete"
import { AttachmentDataProcessor } from "../../utils/attachmentDataProcessor"
import {
	measureAttachmentFetch,
	recordAttachmentsStaleResponseDropped,
} from "../../utils/attachmentPerf"
import {
	normalizeUpdateAttachmentsPayload,
	releaseAttachmentsRefreshWaitersWithoutFetch,
	resolveAttachmentsRefreshWaitersForProject,
	type SuperMagicUpdateAttachmentsRequest,
	withAttachmentsRefreshWaitersResolved,
} from "@/pages/superMagic/services/attachmentsTopicSync"
import { isCollaborationWorkspace } from "../../constants"
import { useNoPermissionCollaborationProject } from "../../hooks/useNoPermissionCollaborationProject"
import { superMagicStore } from "@/pages/superMagic/stores"
import { observer } from "mobx-react-lite"
import { SuperMagicApi } from "@/apis"
import { workspaceStore, projectStore, topicStore } from "../../stores/core"
import SuperMagicService, { loadProjectAttachments } from "../../services"
import { userStore } from "@/models/user"
import { useInterruptAndUndoMessage } from "../../hooks/useInterruptAndUndoMessage"
import { useTopicConversationLoading } from "../../hooks/useTopicConversationLoading"
import { useTopicMessages } from "../../hooks/useTopicMessages"
import { useCreateTopicListener } from "../../components/TopicMode/useCreateTopicListener"
import { useTopicFiles } from "./hooks/useTopicFiles"
import TopicSidebar from "./components/TopicSidebar"
import { isAudioProjectMode } from "@/services/audioRecordings"
import TopicMessagePanel from "./components/TopicMessagePanel"
import { ChatConversationActionsSlot } from "@/pages/superMagic/pages/ChatProjectPage/components/ChatConversationActionsSlot"
import TopicDesktopPanels from "./components/TopicDesktopPanels"
import { useTopicDetailPanelController } from "./hooks/useTopicDetailPanelController"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "./hooks/useTopicHistoryLayoutState"
import { useMessageHeaderTopicActions } from "./hooks/useMessageHeaderTopicActions"
import { useAICardDeepLinkOpen } from "./hooks/useAICardDeepLinkOpen"
import type { AttachmentItem } from "../../components/TopicFilesButton/hooks"
import { TaskStatus } from "../Workspace/types"
import { resolveMessageSendContext } from "../../services/messageSendPreparation"
import { messageSendService } from "../../services/messageSendFlowService"
import { isReadOnlyProject } from "../../utils/permission"
import { MessageHeaderTopicHistoryPanel } from "../../components/MessageHeader"
import topicReadProgressService from "../../services/topicReadProgressService"
import dayjs from "@/lib/dayjs"
import type { MessageItem } from "../../stores/types"
import { isAbortError, useLatestAbortableRequest } from "../../hooks/useLatestAbortableRequest"
import { useProjectFirstAttachmentRender } from "../../hooks/useProjectFirstAttachmentRender"

/** 任务消息状态变化后延迟拉工作区/项目详情，减轻后端尚未落库时单次请求仍返回 running 的问题 */
const WORKSPACE_PROJECT_STATUS_REFRESH_DELAY_MS = 1000

function normalizeMessageSendTimeToMs(value: unknown): number | null {
	if (value === null || value === undefined) return null

	const numericValue =
		typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
	if (!Number.isFinite(numericValue) || numericValue <= 0) return null

	// 10位秒、13位毫秒、16位微秒、19位纳秒
	if (numericValue < 1e11) return Math.floor(numericValue * 1000)
	if (numericValue < 1e14) return Math.floor(numericValue)
	if (numericValue < 1e17) return Math.floor(numericValue / 1000)
	return Math.floor(numericValue / 1e6)
}

function resolveReadProgressPayloadFromMessages(messages: Array<any>) {
	if (!Array.isArray(messages) || messages.length === 0)
		return {
			lastReadAt: dayjs().format("YYYY-MM-DD HH:mm:ss"),
			lastReadMessageId: undefined,
		}

	const latestMessage = messages[messages.length - 1]
	const fallbackReadAt = dayjs().format("YYYY-MM-DD HH:mm:ss")
	const normalizedSendTimeMs = normalizeMessageSendTimeToMs(latestMessage?.send_time)
	const parsedReadAt =
		normalizedSendTimeMs && normalizedSendTimeMs > 0
			? dayjs(normalizedSendTimeMs).format("YYYY-MM-DD HH:mm:ss")
			: fallbackReadAt

	return {
		lastReadAt: parsedReadAt,
		lastReadMessageId:
			typeof latestMessage?.app_message_id === "string"
				? latestMessage.app_message_id
				: undefined,
	}
}

function resolveReadProgressPayloadFromMessage(message?: {
	send_time?: unknown
	app_message_id?: unknown
}) {
	const fallbackReadAt = dayjs().format("YYYY-MM-DD HH:mm:ss")
	const normalizedSendTimeMs = normalizeMessageSendTimeToMs(message?.send_time)
	const parsedReadAt =
		normalizedSendTimeMs && normalizedSendTimeMs > 0
			? dayjs(normalizedSendTimeMs).format("YYYY-MM-DD HH:mm:ss")
			: fallbackReadAt

	return {
		lastReadAt: parsedReadAt,
		lastReadMessageId:
			typeof message?.app_message_id === "string" ? message.app_message_id : undefined,
	}
}

async function syncTopicStatusPatch(topicId: string) {
	if (!topicId) return
	const statusResponse = await SuperMagicApi.getTopicsStatus({ topic_ids: [topicId] })
	const topicItems = statusResponse.topics || statusResponse.list || []
	const statusItem = topicItems.find((item) => item.id === topicId)
	if (!statusItem) return

	topicStore.mergeTopic(topicId, {
		task_status: statusItem.status as TaskStatus,
		status: statusItem.status as TaskStatus,
		has_unread: statusItem.has_unread,
	})
}

interface TopicPageDesktopProps {
	pageVariant?: "default" | "singleTopicChat"
}

// 工作区组件
function TopicPage({ pageVariant = "default" }: TopicPageDesktopProps) {
	const isSingleTopicChat = pageVariant === "singleTopicChat"
	// Get workspace and project state from stores
	const selectedWorkspace = workspaceStore.selectedWorkspace
	const selectedProject = projectStore.selectedProject
	const selectedTopic = topicStore.selectedTopic
	const attachments = projectFilesStore.workspaceFileTree
	const attachmentList = projectFilesStore.workspaceFilesList
	const setAttachments = useMemoizedFn((nextAttachments: AttachmentItem[]) => {
		projectFilesStore.setWorkspaceFileTree(nextAttachments)
	})

	/** ======================== Hooks ======================== */
	const { styles } = useStyles()
	const { handleNoPermissionCollaborationProject } = useNoPermissionCollaborationProject()

	/** ======================== Refs ======================== */
	const detailRef = useRef<DetailRef>(null)
	const delayedWorkspaceProjectStatusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	)
	const previousTopicIdRef = useRef<string | null>(null)
	const { shouldRenderProjectFirstRequest, resetProjectFirstRequestRender } =
		useProjectFirstAttachmentRender()
	const { startRequest: startAttachmentsRequest, cancelCurrent: cancelAttachmentsRequest } =
		useLatestAbortableRequest()

	/** ======================== States ======================== */
	const [autoDetail, setAutoDetail] = useState<any>()
	const [userSelectDetail, setUserSelectDetail] = useState<any>()
	const [isShowLoadingInit, setIsShowLoadingInit] = useState(false)
	const [isDetailPanelFullscreen, setIsDetailPanelFullscreen] = useState(false)
	const clearUserSelectDetail = useMemoizedFn(() => {
		setUserSelectDetail(null)
	})
	// Calculate read-only status based on user role
	const isReadOnly = isReadOnlyProject(selectedProject?.user_role)
	const hideProjectCard = isSingleTopicChat || isAudioProjectMode(selectedProject?.project_mode)
	const topicActions = useMessageHeaderTopicActions({
		selectedProject,
		selectedTopic,
		topicStore,
	})

	// Use topic files hook to manage file-related logic
	const { activeFileId, handleFileClick, topicFilesProps, setActiveFileId } = useTopicFiles({
		selectedProject,
		selectedWorkspace,
		selectedTopic,
		projects: projectStore.projects,
		workspaces: workspaceStore.workspaces,
		attachments,
		setAttachments,
		setUserSelectDetail,
		detailRef,
		isReadOnly,
	})

	const {
		shouldShowDetailPanel,
		handleFileClickWithPanel,
		topicFilesPropsWithPanel,
		handleActiveDetailTabChange,
		clearActiveDetailTabType,
	} = useTopicDetailPanelController({
		detailRef,
		isReadOnly,
		activeFileId,
		setActiveFileId,
		handleFileClick,
		topicFilesProps,
		attachmentList,
	})

	const { onFileTabsCacheLoaded, scheduleWhenTabsCacheReady } = useDeferUntilFileTabsCacheLoaded(
		selectedProject?.id,
	)

	useAICardDeepLinkOpen({
		topicId: selectedTopic?.id,
		attachments,
		scheduleWhenTabsCacheReady,
		handleFileClickWithPanel,
		clearUserSelectDetail,
	})

	const { isTopicHistoryPanelOpen, closeTopicHistoryPanel, toggleTopicHistoryPanel } =
		useTopicHistoryLayoutState({
			storageKey: TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS.topicPage,
			isEnabled: !isReadOnly && !isSingleTopicChat,
		})

	const activeFileIdRef = useRef<string | null>(activeFileId)
	activeFileIdRef.current = activeFileId

	// 使用详情模式缓存 hook
	useDetailModeCache({
		selectedProjectId: selectedProject?.id,
		autoDetail,
		userDetail: userSelectDetail,
		setAutoDetail,
		setUserDetail: setUserSelectDetail,
	})

	const {
		checkAndOpenFileByMessages,
		checkAndOpenFileByTopicChanged,
		reset: resetAutoOpenFile,
	} = useAutoOpenFile()

	useRefreshTopicDetailOnTaskComplete({
		selectedTopic,
		onTopicDetailLoaded: topicStore.updateTopic,
	})

	// 当项目或话题发生变化时，清理状态
	useUpdateEffect(() => {
		setAutoDetail(null)
		setUserSelectDetail(null)
		clearActiveDetailTabType()
		resetAutoOpenFile()
	}, [selectedProject?.id])

	const updateDetail = useMemoizedFn(
		({
			latestMessageDetail,
			isLoading,
			tool,
		}: {
			latestMessageDetail: any
			isLoading: boolean
			tool?: any
		}) => {
			if (isEmpty(latestMessageDetail)) {
				setAutoDetail({
					type: "empty",
					data: {
						text: isLoading ? "正在思考" : "完成任务",
					},
				})
			} else {
				setAutoDetail({
					...latestMessageDetail,
					id: tool?.id,
					name: tool?.name,
				})
			}
		},
	)

	useEffect(() => {
		return () => {
			if (delayedWorkspaceProjectStatusTimeoutRef.current) {
				clearTimeout(delayedWorkspaceProjectStatusTimeoutRef.current)
				delayedWorkspaceProjectStatusTimeoutRef.current = null
			}
			void topicReadProgressService.flushCurrentTopicReadProgress("route-leave")
		}
	}, [])

	useEffect(() => {
		const previousTopicId = previousTopicIdRef.current
		const currentTopicId = selectedTopic?.id || null
		if (previousTopicId && previousTopicId !== currentTopicId)
			void topicReadProgressService.flushTopicReadProgress({
				topicId: previousTopicId,
				reason: "switch-topic",
			})
		previousTopicIdRef.current = currentTopicId
	}, [selectedTopic?.id])

	useEffect(() => {
		const handleVisibilityChange = () => {
			if (document.visibilityState !== "hidden") return
			void topicReadProgressService.flushCurrentTopicReadProgress("page-hide")
		}

		const handleBeforeUnload = () => {
			void topicReadProgressService.flushCurrentTopicReadProgress("before-unload")
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)
		window.addEventListener("beforeunload", handleBeforeUnload)
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange)
			window.removeEventListener("beforeunload", handleBeforeUnload)
		}
	}, [])

	const currentTopicStatus = selectedTopic?.task_status
	const currentTopicStatusRef = useRef<TaskStatus | undefined>(currentTopicStatus)
	const selectedProjectRef = useRef(selectedProject)
	const selectedWorkspaceRef = useRef(selectedWorkspace)
	currentTopicStatusRef.current = currentTopicStatus
	selectedProjectRef.current = selectedProject
	selectedWorkspaceRef.current = selectedWorkspace

	const { checkNowDebounced } = useAttachmentsPolling({
		projectId: selectedProject?.id,
		autoStart: false,
		onAttachmentsChange: useCallback(({ tree, list }: { tree: any[]; list: any[] }) => {
			// 统一处理 metadata，内部自闭环处理验证和返回逻辑
			const processedData = AttachmentDataProcessor.processAttachmentData(
				{ tree, list },
				{ preserveList: true },
			)
			projectFilesStore.setWorkspaceFileTree(processedData.tree, {
				list: processedData.list,
				source: "TopicPage.taskStatusCheck",
			})
		}, []),
		onError: useMemoizedFn((error: any) => {
			if (isCollaborationWorkspace(selectedWorkspace)) {
				// 团队共享项目，如果权限不足，回到首页
				handleNoPermissionCollaborationProject(error)
				return
			}
		}),
	})

	/**
	 * 处理到达消息引发的话题状态变化：
	 * 1) 仅在状态真正变化时更新本地话题状态；
	 * 2) 同步拉取话题 unread 补丁，避免后端短暂延迟导致状态不一致；
	 * 3) 延迟刷新工作区/项目状态，减少后端未落库时的无效请求；
	 * 4) 当任务结束且页面可见时，补记一次即时已读进度。
	 */
	const handleArrivedTopicStatusChange = useMemoizedFn(
		({
			nextStatus,
			topicId,
			lastReadAt,
			lastReadMessageId,
		}: {
			nextStatus?: TaskStatus
			topicId: string
			lastReadAt?: string
			lastReadMessageId?: string
		}) => {
			if (!nextStatus || !topicId) return

			const latestTopicStatus = currentTopicStatusRef.current
			const hasStatusChanged = nextStatus !== latestTopicStatus
			if (!hasStatusChanged) return

			currentTopicStatusRef.current = nextStatus
			void SuperMagicService.topic.updateTopicStatus(topicId, nextStatus)
			const shouldMarkImmediateRead =
				document.visibilityState === "visible" &&
				(nextStatus === TaskStatus.FINISHED || nextStatus === TaskStatus.ERROR)
			const syncPromise = syncTopicStatusPatch(topicId).catch((error) => {
				console.warn("[TopicPage] 同步话题 unread 状态失败:", error)
			})

			currentTopicStatusRef.current = nextStatus
			void SuperMagicService.topic.updateTopicStatus(topicId, nextStatus)
			if (shouldCheckAttachmentsOnTaskStatus(nextStatus)) {
				checkNowDebounced()
			}

			const latestWorkspaceId = selectedWorkspaceRef.current?.id
			const latestProjectId = selectedProjectRef.current?.id
			if (delayedWorkspaceProjectStatusTimeoutRef.current) {
				clearTimeout(delayedWorkspaceProjectStatusTimeoutRef.current)
			}
			delayedWorkspaceProjectStatusTimeoutRef.current = setTimeout(() => {
				delayedWorkspaceProjectStatusTimeoutRef.current = null
				if (latestWorkspaceId) {
					void SuperMagicService.workspace.updateWorkspaceStatus(latestWorkspaceId)
				}
				if (latestProjectId) {
					void SuperMagicService.project.updateProjectStatus(latestProjectId)
				}
			}, WORKSPACE_PROJECT_STATUS_REFRESH_DELAY_MS)

			if (shouldMarkImmediateRead) {
				void syncPromise.finally(() => {
					window.setTimeout(() => {
						topicReadProgressService.markTopicReadProgress({
							topicId,
							lastReadAt,
							lastReadMessageId,
							reason: "message-change",
							immediate: true,
						})
					}, 1000)
				})
			}
		},
	)

	useEffect(() => {
		if (!selectedTopic?.chat_topic_id || !selectedTopic?.id) return

		return superMagicStore.registerTopicMessageListener({
			topicId: selectedTopic.chat_topic_id,
			callback: ({
				message,
				messageNode,
			}: {
				message: MessageItem
				messageNode: { status?: unknown }
			}) => {
				if (message?.role === "user") return
				const readProgressPayload = resolveReadProgressPayloadFromMessage(message)
				handleArrivedTopicStatusChange({
					nextStatus: messageNode?.status as TaskStatus | undefined,
					topicId: selectedTopic.id,
					lastReadAt: readProgressPayload.lastReadAt,
					lastReadMessageId: readProgressPayload.lastReadMessageId,
				})
			},
		})
	}, [handleArrivedTopicStatusChange, selectedTopic?.chat_topic_id, selectedTopic?.id])

	const { messages, showLoading } = useTopicConversationLoading({
		selectedTopic,
		hideLoadingWhenBufferHasContent: true,
		onTopicMessagesChange: ({
			isLoading,
			lastMessageNode,
			selectedTopic: currentTopic,
			topicMessages,
		}) => {
			setIsShowLoadingInit(true)

			// 记录任务状态是否发生变化（用于判断是否为新消息导致的任务完成）
			const hasStatusChanged = lastMessageNode?.status !== currentTopicStatus
			const readProgressPayload = resolveReadProgressPayloadFromMessages(topicMessages)
			const targetTopicId = currentTopic?.id || selectedTopic?.id

			const lastDetailMessage = topicMessages.findLast((message) => {
				const node = superMagicStore.getMessageNode(message?.app_message_id)
				return filterClickableMessageWithoutRevoked(node)
			})

			const lastDetailMessageNode = superMagicStore.getMessageNode(
				lastDetailMessage?.app_message_id,
			) as
				| {
						tool?: {
							detail?: any
							id?: string
							name?: string
						}
				  }
				| undefined
			if (filterClickableMessageWithoutRevoked(lastDetailMessageNode)) {
				updateDetail({
					latestMessageDetail: lastDetailMessageNode?.tool?.detail,
					isLoading,
					tool: lastDetailMessageNode?.tool,
				})

				scheduleWhenTabsCacheReady(() => {
					checkAndOpenFileByMessages({
						lastMessageNode,
						lastDetailMessageNode,
						lastDetailMessage,
						hasStatusChanged,
						activeFileId,
						getActiveFileId: () => activeFileIdRef.current,
					})
				})
			}

			if (targetTopicId) {
				topicReadProgressService.markTopicReadProgress({
					topicId: targetTopicId,
					lastReadAt: readProgressPayload.lastReadAt,
					lastReadMessageId: readProgressPayload.lastReadMessageId,
					reason: "message-change",
				})
			}
		},
	})

	// Handle interrupt and undo message functionality
	useInterruptAndUndoMessage({
		selectedTopic,
		messages,
		userInfo: userStore.user.userInfo,
	})

	useDeepCompareEffect(() => {
		setUserSelectDetail(null)
		clearActiveDetailTabType()
	}, [selectedTopic?.id, selectedTopic?.chat_topic_id])

	useProjectAttachmentsChangeRealtime({
		projectId: selectedProject?.id,
		onFallbackError: useMemoizedFn((error: unknown) => {
			if (isCollaborationWorkspace(selectedWorkspace)) {
				handleNoPermissionCollaborationProject(error)
				return
			}
			console.error("Failed to refresh realtime attachments:", error)
		}),
	})

	const { handlePullMoreMessage, isMessagesInitialLoading, isSelectedTopicMessagesReady } =
		useTopicMessages({
			selectedTopic,
		})

	useUpdateEffect(() => {
		if (!isSelectedTopicMessagesReady) return

		if (selectedTopic?.id) {
			const readProgressPayload = resolveReadProgressPayloadFromMessages(messages)
			void syncTopicStatusPatch(selectedTopic.id)
				.catch((error) => {
					console.warn("[TopicPage] 进入话题触发前同步话题 unread 状态失败:", error)
				})
				.finally(() => {
					topicReadProgressService.markTopicReadProgress({
						topicId: selectedTopic.id,
						lastReadAt: readProgressPayload.lastReadAt,
						lastReadMessageId: readProgressPayload.lastReadMessageId,
						reason: "enter-topic",
						immediate: true,
					})
				})
		}

		scheduleWhenTabsCacheReady(() => {
			checkAndOpenFileByTopicChanged({
				activeFileId,
				getActiveFileId: () => activeFileIdRef.current,
			})
		})
	}, [selectedTopic?.id, isSelectedTopicMessagesReady])

	const updateAttachments = useDebounceFn(
		(selectedProject: any, callback?: () => void) => {
			const projectId = selectedProject?.id as string | undefined
			if (!projectId) {
				cancelAttachmentsRequest()
				resetProjectFirstRequestRender()
				projectFilesStore.setWorkspaceFileTree([])
				releaseAttachmentsRefreshWaitersWithoutFetch()
				return
			}
			const request = startAttachmentsRequest()
			const shouldRenderIncrementally = shouldRenderProjectFirstRequest(projectId)
			let didCommitFinalSnapshot = false

			try {
				pubsub.publish(PubSubEvents.Update_Attachments_Loading, true)
				withAttachmentsRefreshWaitersResolved(
					projectId,
					measureAttachmentFetch("TopicPage.updateAttachments", () =>
						loadProjectAttachments({
							projectId,
							signal: request.signal,
							onBatchSnapshot: shouldRenderIncrementally
								? ({ tree, list, phase, isFinal }) => {
										if (!request.isCurrent()) {
											recordAttachmentsStaleResponseDropped(
												"TopicPage.updateAttachments",
												{ stage: "batch_snapshot", phase },
											)
											return
										}
										const processedData =
											AttachmentDataProcessor.processAttachmentData(
												{ tree, list },
												{ preserveList: true },
											)
										projectFilesStore.setWorkspaceFileTree(processedData.tree, {
											list: processedData.list,
											source: `TopicPage.batch.${phase}`,
										})
										if (isFinal) {
											didCommitFinalSnapshot = true
										}
									}
								: undefined,
						}),
					)
						.then((res: Awaited<ReturnType<typeof loadProjectAttachments>>) => {
							if (!request.isCurrent()) {
								recordAttachmentsStaleResponseDropped(
									"TopicPage.updateAttachments",
									{ stage: "load_result" },
								)
								return
							}
							if (!didCommitFinalSnapshot) {
								projectFilesStore.setWorkspaceFileTree(res.tree, {
									list: res.list,
									source: "TopicPage.load_result",
								})
							}
							GlobalMentionPanelStore.finishLoadAttachmentsPromise(projectId)
						})
						.catch((error: unknown) => {
							if (isAbortError(error)) return
							if (!request.isCurrent()) {
								recordAttachmentsStaleResponseDropped(
									"TopicPage.updateAttachments",
									{ stage: "load_error" },
								)
								return
							}
							console.error("Failed to fetch attachments:", error)
							projectFilesStore.setWorkspaceFileTree([])
						})
						.finally(() => {
							request.release()
							if (request.isCurrent()) {
								pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
							}
							callback?.()
						}),
				)
			} catch (error) {
				if (isAbortError(error)) return
				console.error("Failed to fetch attachments:", error)
				projectFilesStore.setWorkspaceFileTree([])
				resolveAttachmentsRefreshWaitersForProject(projectId)
				callback?.()
			}
		},
		{
			wait: 500,
		},
	).run

	useDeepCompareEffect(() => {
		const projectId = selectedProject?.id
		if (selectedProject) {
			// 初始化加载附件的Promise
			GlobalMentionPanelStore.initLoadAttachments(selectedProject?.id)
			updateAttachments(selectedProject)
		}

		return () => {
			cancelAttachmentsRequest()
			if (projectId) {
				GlobalMentionPanelStore.clearInitLoadAttachmentsPromise(projectId)
			}
		}
	}, [selectedProject?.id])

	const disPlayDetail = useMemo(() => {
		return userSelectDetail || autoDetail
	}, [userSelectDetail, autoDetail])

	useEffect(() => {
		const handleUpdateAttachments = (
			payloadOrCallback?: SuperMagicUpdateAttachmentsRequest,
		) => {
			const payload = normalizeUpdateAttachmentsPayload(payloadOrCallback)

			if (selectedProject && selectedTopic) {
				updateAttachments(selectedProject, payload?.callback)
				return
			}
			payload?.callback?.()
			releaseAttachmentsRefreshWaitersWithoutFetch()
		}

		pubsub.subscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		return () => {
			pubsub?.unsubscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedTopic, selectedProject])

	useEffect(() => {
		pubsub.subscribe(PubSubEvents.Super_Magic_Update_Auto_Detail, (data) => {
			setAutoDetail(data)
		})
		return () => {
			pubsub?.unsubscribe(PubSubEvents.Super_Magic_Update_Auto_Detail)
		}
	}, [])

	// Chat detail creates a new conversation on expert switch instead of sibling topics.
	useCreateTopicListener({ enabled: !isSingleTopicChat })

	// 封装消息发送处理函数
	const handleSendMsg = useMemoizedFn(
		(content: JSONContent | string, options?: SendMessageOptions) => {
			messageSendService.sendContent({
				content,
				options,
				showLoading: messages?.length > 1 && showLoading,
				context: resolveMessageSendContext({
					selectedProject,
					selectedTopic,
					selectedWorkspace,
					setSelectedTopic: topicStore.setSelectedTopic,
				}),
			})

			// 延迟200ms通知MessageList组件滚动到底部
			pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom, { time: 1000 })
		},
	)

	const handleSelectedTopicChange = useMemoizedFn((topic: any) => {
		topicStore.setSelectedTopic(topic)
	})

	const renderMessagePanel = useMemoizedFn(
		({
			isConversationPanelCollapsed,
			isDraggingPanel,
			onToggleConversationPanel,
			onExpandConversationPanel,
			historyTriggerMode,
			isHistoryPanelOpen,
			onToggleHistoryPanel,
		}: {
			isConversationPanelCollapsed: boolean
			isDraggingPanel: boolean
			onToggleConversationPanel: () => void
			onExpandConversationPanel: () => void
			historyTriggerMode: "dropdown" | "layout"
			isHistoryPanelOpen: boolean
			onToggleHistoryPanel?: () => void
		}) => (
			<TopicMessagePanel
				selectedProject={selectedProject}
				selectedTopic={selectedTopic}
				messages={messages as any}
				showLoading={showLoading}
				isShowLoadingInit={isShowLoadingInit}
				currentTopicStatus={currentTopicStatus}
				attachments={attachments}
				handleSendMsg={handleSendMsg}
				handlePullMoreMessage={handlePullMoreMessage}
				isMessagesLoading={isMessagesInitialLoading}
				handleFileClick={handleFileClickWithPanel}
				setUserSelectDetail={setUserSelectDetail}
				setSelectedTopic={handleSelectedTopicChange}
				topicActions={topicActions}
				isConversationPanelCollapsed={isConversationPanelCollapsed}
				isDraggingPanel={isDraggingPanel}
				onToggleConversationPanel={onToggleConversationPanel}
				onExpandConversationPanel={onExpandConversationPanel}
				detailPanelVisible={shouldShowDetailPanel}
				historyTriggerMode={historyTriggerMode}
				isHistoryPanelOpen={isHistoryPanelOpen}
				onToggleHistoryPanel={onToggleHistoryPanel}
				trailingActions={isSingleTopicChat ? <ChatConversationActionsSlot /> : undefined}
			/>
		),
	)

	return (
		<TopicDesktopPanels
			containerClassName={styles.container}
			detailPanelClassName={styles.detailPanel}
			isDetailPanelFullscreen={isDetailPanelFullscreen}
			sidebar={
				<TopicSidebar
					selectedProject={selectedProject}
					selectedWorkspace={selectedWorkspace}
					selectedTopic={selectedTopic}
					isReadOnly={isReadOnly}
					topicFilesProps={topicFilesPropsWithPanel}
					hideProjectCard={hideProjectCard}
					siderVariant={isSingleTopicChat ? "chat" : "default"}
				/>
			}
			detailPanel={
				<Detail
					ref={detailRef}
					disPlayDetail={disPlayDetail}
					userSelectDetail={userSelectDetail}
					setUserSelectDetail={setUserSelectDetail}
					attachments={attachments}
					attachmentList={attachmentList}
					topicId={selectedTopic?.id}
					baseShareUrl={`${window.location.origin}/share`}
					currentTopicStatus={currentTopicStatus}
					messages={messages}
					autoDetail={autoDetail}
					allowEdit={!isReadOnly}
					selectedTopic={selectedTopic}
					selectedProject={selectedProject}
					activeFileId={activeFileId}
					onActiveFileChange={setActiveFileId}
					onActiveTabChange={handleActiveDetailTabChange}
					onFullscreenChange={setIsDetailPanelFullscreen}
					onFileTabsCacheLoaded={onFileTabsCacheLoaded}
				/>
			}
			isReadOnly={isReadOnly}
			keepDetailMountedWhenHidden
			historyLayout={
				isSingleTopicChat
					? undefined
					: {
							isOpen: isTopicHistoryPanelOpen,
							onClose: closeTopicHistoryPanel,
							onToggle: toggleTopicHistoryPanel,
							renderPanel: ({
								isConversationPanelCollapsed,
								onExpandConversationPanel,
								onClose,
								closeButtonRef,
							}) => (
								<MessageHeaderTopicHistoryPanel
									selectedProject={selectedProject}
									topicStore={topicStore}
									topicActions={topicActions}
									isConversationPanelCollapsed={isConversationPanelCollapsed}
									onExpandConversationPanel={onExpandConversationPanel}
									onClose={onClose}
									closeButtonRef={closeButtonRef}
								/>
							),
						}
			}
			shouldShowDetailPanel={shouldShowDetailPanel}
			renderMessagePanel={renderMessagePanel}
		/>
	)
}

// 导出的工作区组件
export default observer(TopicPage)
