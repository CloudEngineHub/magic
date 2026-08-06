import { isObject, merge } from "lodash-es"
import { JSONContent } from "@tiptap/core"
import { ChatApi, SuperMagicApi } from "@/apis"
import { EventType } from "@/types/chat"
import {
	ConversationMessageType,
	type ConversationQueryMessage,
	type ConversationMessageSend,
} from "@/types/chat/conversation_message"
import type { SeqResponse } from "@/types/request"
import { logger as Logger } from "@/utils/log"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import GlobalMentionPanelStore, {
	type MentionPanelStore,
} from "@/components/business/MentionPanel/builtin-store"
import type { MentionListItem } from "@/components/business/MentionPanel/tiptap-plugin/types"
import { userStore } from "@/models/user"
import {
	DEFAULT_KEY,
	internetSearchManager,
} from "../components/MessageEditor/services/InternetSearchManager"
import type { MessageEditorRef } from "../components/MessageEditor/MessageEditor"
import {
	buildPlainTextJSONContent,
	generateTextFromJSONContent,
	isEmptyJSONContent,
} from "../components/MessageEditor/utils"
import { transformMentions } from "../components/MessageEditor/utils/mention"
import type { ModelItem } from "../components/MessageEditor/types"
import type { SendMessageOptions } from "../components/MessagePanel/types"
import {
	MessageStatus,
	type Workspace,
	type ProjectListItem,
	type Topic,
} from "../pages/Workspace/types"
import { TopicMode } from "../pages/Workspace/TopicMode"
import { superMagicStore } from "../stores"
import { optimisticMessageStore } from "../stores/optimisticMessageStore"
import { getNetworkMonitor } from "@/services/recordSummary/NetworkMonitor"
import { smartRenameTopicIfUnnamed } from "./topicRename"
import { shouldSyncChatConversationName, syncChatProjectNameOnly } from "./chatConversationNameSync"
import { shouldClearEditorAfterSend } from "./messageSendEditorPolicy"
import { startMessageSendRenameTask, trackProjectRenameTask } from "./messageSendRenameTask"
import { projectVisibleMessagesByRevokedTail } from "../utils/project-visible-messages-by-revoked-tail"

const logger = Logger.createLogger("messageSendService")

export interface HandleSendParams {
	value: JSONContent | undefined
	mentionItems: MentionListItem[]
	selectedModel?: ModelItem | null
	selectedImageModel?: ModelItem | null
	selectedVideoModel?: ModelItem | null
	topicMode?: TopicMode
	isFromQueue?: boolean
	queueId?: string
	shouldClearEditorAfterSend?: boolean
	throwOnError?: boolean
	extra?: Record<string, unknown>
}

export interface SendContentParams {
	content: JSONContent | string
	options?: SendMessageOptions
	showLoading?: boolean
	context?: SendRuntimeContext
}

export interface DispatchMessageParams {
	content?: string
	jsonContent?: JSONContent
	options?: SendMessageOptions
	showLoading: boolean
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	context?: SendRuntimeContext
}

export interface PanelSendInput {
	params: HandleSendParams
	context?: SendRuntimeContext
	currentProject: ProjectListItem | null
	currentTopic: Topic | null
	isSending: boolean
	setIsSending: (isSending: boolean) => void
	showLoading: boolean
	isMobile: boolean
	isEmptyStatus: boolean
	tabPattern: TopicMode
	editorRef?: MessageEditorRef | null
	setFocused: (isFocused: boolean) => void
	messagesLength: number
}

export interface SendPanelMessageResult {
	currentProject: ProjectListItem | null
	currentTopic: Topic | null
}

export interface SendRuntimeContext {
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	selectedWorkspace?: Workspace | null
	workspaceId?: string
	updateTopicName?: (topicId: string, topicName: string) => void | Promise<void>
	refreshProjectAfterTopicRename?: boolean
	renameProject?: (
		projectId: string,
		projectName: string,
		workspaceId: string,
	) => void | Promise<void>
}

interface MessageSendServiceDeps {
	chatApi: typeof ChatApi
	superMagicApi: typeof SuperMagicApi
	pubsub: typeof pubsub
	mentionPanelStore: MentionPanelStore
	userStore: typeof userStore
	superMagicStore: typeof superMagicStore
	logger: ReturnType<typeof Logger.createLogger>
}

class MessageSendService {
	private deps: MessageSendServiceDeps = {
		chatApi: ChatApi,
		superMagicApi: SuperMagicApi,
		pubsub,
		mentionPanelStore: GlobalMentionPanelStore,
		userStore,
		superMagicStore,
		logger,
	}

	configure(deps: Partial<MessageSendServiceDeps>) {
		this.deps = {
			...this.deps,
			...deps,
		}
	}

	sendContent({ content, options, showLoading = false, context }: SendContentParams) {
		// 发送前统一处理内容格式
		if (typeof content === "string") {
			void this.dispatchMessage({ content, showLoading, options, context })
			return
		}

		if (!isEmptyJSONContent(content)) {
			void this.dispatchMessage({ jsonContent: content, showLoading, options, context })
		}
	}

	async dispatchMessage({
		content: textContent,
		jsonContent,
		showLoading,
		options,
		selectedProject,
		selectedTopic,
		context,
	}: DispatchMessageParams): Promise<boolean> {
		// 发送前必须有有效话题
		const currentProject =
			selectedProject ?? context?.selectedProject ?? options?._tempProject ?? null
		const currentTopic = selectedTopic ?? context?.selectedTopic ?? options?._tempTopic ?? null

		if (!currentTopic?.id) {
			this.deps.logger.error({
				eventKey: "send_message_failed",
				errorKind: "unknown",
				message: "发送消息 - 未找到选中的话题",
			})
			return false
		}

		const trimmedText = textContent?.trim()
		let resolvedJson: JSONContent | undefined
		if (isObject(jsonContent)) {
			resolvedJson = jsonContent
		} else if (trimmedText) {
			resolvedJson = buildPlainTextJSONContent(trimmedText)
		} else {
			return false
		}

		if (isEmptyJSONContent(resolvedJson)) return false

		const content = JSON.stringify(resolvedJson)
		const messageType = ConversationMessageType.RichText
		const messageId = generateUniqueId()
		const { chat_topic_id, chat_conversation_id } = currentTopic
		const date = new Date().getTime()

		const sendOptions = stripTempOptions(options)

		// 话题名为空时根据内容自动命名，消息发送不等待该任务。
		// 首页创建场景会登记任务，详情页在任务完成后按需刷新一次项目详情。
		const renameTask =
			currentProject && currentTopic
				? startMessageSendRenameTask({
						topicId: currentTopic.id,
						renameTopic: () =>
							smartRenameTopicIfUnnamed({
								topic: currentTopic,
								userQuestion: generateTextFromJSONContent(resolvedJson),
								updateTopicName: context?.updateTopicName,
							}),
						syncProjectName: (topicName) =>
							this.handleSmartProjectRename({
								project: currentProject,
								topicName,
								context,
							}),
						onError: (error) => {
							this.deps.logger.error("Smart topic rename failed", error)
						},
					})
				: undefined

		const mergedSendOptions = merge({}, sendOptions, {
			extra: {
				super_agent: {
					dynamic_params: {
						message_version: "v2",
					},
				},
			},
		})

		if (currentTopic?.id && sendOptions?.extra?.super_agent?.mentions) {
			const mentions = sendOptions.extra.super_agent.mentions
			this.deps.mentionPanelStore.addMentionListItemsToHistory(mentions)
		}

		// 调用聊天接口发送消息
		const sendMessage = () => {
			const optimisticAnchor = this.deps.superMagicStore.getLatestMessageAnchor(chat_topic_id)
			const pendingUserMessage = {
				message: {
					type: messageType,
					[messageType]: {
						content,
						/**
						 * @deprecated follow_up 和 normal 后期将废弃，follow_up 追加对话，normal 正常新对话
						 */
						instructs: [{ value: showLoading ? "follow_up" : "normal" }],
						...mergedSendOptions,
					},
					send_timestamp: date,
					send_time: date,
					sender_id: this.deps.userStore.user.userInfo?.user_id,
					app_message_id: messageId,
					message_id: messageId,
					topic_id: chat_topic_id,
				} as unknown as ConversationMessageSend["message"],
				conversation_id: chat_conversation_id,
			}

			this.deps.superMagicStore.addUserMessage(chat_topic_id, pendingUserMessage)
			optimisticMessageStore.markSending({
				chat_topic_id,
				app_message_id: messageId,
				created_at: date,
				last_attempt_at: date,
				...optimisticAnchor,
				pending_message: pendingUserMessage,
			})
			if (getNetworkMonitor().isNetworkOffline()) {
				optimisticMessageStore.markFailed({ chat_topic_id, app_message_id: messageId })
				return
			}
			this.deps.chatApi
				.chat(EventType.Chat, pendingUserMessage)
				.then((res) => {
					const responseSeq =
						(res as { data?: { seq?: SeqResponse<ConversationQueryMessage> } })?.data
							?.seq ?? (res as { seq?: SeqResponse<ConversationQueryMessage> })?.seq
					if (!responseSeq?.message) return
					// 响应成功后替换 superMagicStore 中对应数据
					this.deps.superMagicStore.replaceUserMessage(chat_topic_id, responseSeq)
					optimisticMessageStore.confirm({ chat_topic_id, app_message_id: messageId })
				})
				.catch((error) => {
					console.log("error", error)
					optimisticMessageStore.markFailed({ chat_topic_id, app_message_id: messageId })
				})
		}

		// 仅当前可见分支仍以 revoked 尾段结束时确认撤回；历史撤回事实不应阻塞新消息。
		const hasRevokedMessages = projectVisibleMessagesByRevokedTail(
			this.getMessageList(currentTopic),
		).some((message) => (message?.imStatus ?? message?.status) === MessageStatus.REVOKED)
		if (hasRevokedMessages) {
			const isConfirmed = await this.confirmRevokedMessagesBeforeSend(currentTopic)
			if (!isConfirmed) return false
		}

		sendMessage()
		if (context?.refreshProjectAfterTopicRename && currentProject && renameTask) {
			trackProjectRenameTask(currentProject.id, renameTask.completion)
		}
		if (hasRevokedMessages) {
			this.deps.pubsub.publish(PubSubEvents.Refresh_Topic_Messages)
		}
		return true
	}

	async sendPanelMessage({
		params,
		context,
		currentProject,
		currentTopic,
		isSending,
		setIsSending,
		showLoading,
		isMobile,
		isEmptyStatus,
		tabPattern,
		editorRef,
		setFocused,
		messagesLength,
	}: PanelSendInput): Promise<SendPanelMessageResult | undefined> {
		if (!params.value || isSending) {
			return
		}

		setIsSending(true)
		void tabPattern

		try {
			if (!currentProject?.id || !currentTopic?.id) {
				this.deps.logger.error({
					eventKey: "send_project_topic_context_missing",
					errorKind: "invalid_state",
					message: "handleSend error: missing project/topic context",
				})
				return
			}

			const data = this.buildSendOptions({
				params,
				mentionItems: params.mentionItems,
				currentProject,
				currentTopic,
				isEmptyStatus,
			})

			const followUp = showLoading && messagesLength > 1
			const isDispatched = await this.dispatchMessage({
				jsonContent: params.value,
				showLoading: followUp,
				options: data,
				selectedProject: currentProject,
				selectedTopic: currentTopic,
				context,
			})
			if (!isDispatched) return
			this.deps.pubsub.publish(PubSubEvents.Message_Scroll_To_Bottom, { time: 1000 })

			if (shouldClearEditorAfterSend(params)) {
				editorRef?.clearContentAfterSend()
			}

			if (!params.isFromQueue) {
				if (isMobile) {
					setFocused(false)
				} else {
					setTimeout(() => {
						if (!editorRef?.editor || editorRef.editor.isDestroyed) return
						editorRef.focus({ enableWhenIsMobile: false })
						setFocused(true)
					}, 100)
				}
			} else {
				setFocused(false)
			}

			return {
				currentProject,
				currentTopic,
			}
		} catch (error) {
			this.deps.logger.error({
				eventKey: "handle_send_failed",
				errorKind: "unknown",
				error: error,
				message: "handleSend error",
			})
		} finally {
			setIsSending(false)
		}
	}

	private buildSendOptions({
		params,
		mentionItems,
		currentProject,
		currentTopic,
		isEmptyStatus,
	}: {
		params: HandleSendParams
		mentionItems: MentionListItem[]
		currentProject: ProjectListItem | null | undefined
		currentTopic: Topic | null | undefined
		isEmptyStatus: boolean
	}): SendMessageOptions {
		const { legacySuperAgentExtra, nestedSuperAgentExtra } = splitSuperAgentExtra(params.extra)

		const model = params.selectedModel
			? {
					model_id: params.selectedModel.model_id,
					model_name: params.selectedModel.model_name,
					model_icon: params.selectedModel.model_icon,
				}
			: undefined

		const imageModel = params.selectedImageModel?.model_id
			? {
					model_id: params.selectedImageModel.model_id,
					model_name: params.selectedImageModel.model_name,
					model_icon: params.selectedImageModel.model_icon,
				}
			: undefined
		const videoModel = params.selectedVideoModel?.model_id
			? {
					model_id: params.selectedVideoModel.model_id,
					model_name: params.selectedVideoModel.model_name,
					model_icon: params.selectedVideoModel.model_icon,
				}
			: undefined

		// 根据话题读取联网搜索开关
		const isInternetSearch = internetSearchManager.getIsChecked(
			isEmptyStatus ? DEFAULT_KEY : currentTopic?.id,
		)

		if (isEmptyStatus && currentTopic?.id) {
			internetSearchManager.setIsChecked(currentTopic.id, isInternetSearch)
		}

		const transformedMentionItems = transformMentions(mentionItems)

		return {
			extra: {
				super_agent: {
					mentions: transformedMentionItems,
					chat_mode: "normal" as const,
					topic_pattern: currentTopic?.topic_mode,
					...(currentTopic?.agent_code && { agent_code: currentTopic.agent_code }),
					model,
					enable_web_search: isInternetSearch,
					...(imageModel && { image_model: imageModel }),
					...(videoModel && { video_model: videoModel }),
					...(params.queueId && { queue_id: params.queueId }),
					...legacySuperAgentExtra,
					...nestedSuperAgentExtra,
				},
			},
			_tempProject: currentProject ?? undefined,
			_tempTopic: currentTopic ?? undefined,
		}
	}

	private getMessageList(topic: Topic) {
		return this.deps.superMagicStore.messages?.get(topic?.chat_topic_id || "") || []
	}

	private async confirmRevokedMessagesBeforeSend(topic: Topic) {
		try {
			const confirmPromise = this.deps.superMagicApi.confirmUndoMessage({
				topic_id: topic.id,
			})
			if (!confirmPromise) return false
			await confirmPromise
			// Confirmation closes revoke-edit mode even if the following message send later fails;
			// the sidecar must not keep projecting the old User branch as editable.
			optimisticMessageStore.clearActiveRevokedAnchor(topic.chat_topic_id)
			return true
		} catch (error) {
			this.deps.logger.error({
				eventKey: "confirm_undo_message_failed",
				errorKind: "unknown",
				error: error,
				message: "confirm undo message failed",
			})
			return false
		}
	}

	private async handleSmartProjectRename({
		project,
		topicName,
		context,
	}: {
		project: ProjectListItem
		topicName: string
		context?: SendRuntimeContext
	}) {
		if (!topicName || !project) return

		// Chat conversations: topic was already renamed by smartRenameTopic; mirror name on project.
		if (shouldSyncChatConversationName(project)) {
			await syncChatProjectNameOnly({
				projectId: project.id,
				name: topicName,
			})
			return
		}

		if (!project.project_name) {
			const workspaceId =
				(context?.workspaceId ?? context?.selectedWorkspace?.id ?? project.workspace_id) ||
				""
			if (workspaceId) {
				await context?.renameProject?.(project.id, topicName, workspaceId)
			}
		}
	}
}

function createMessageSendService(deps: Partial<MessageSendServiceDeps> = {}) {
	const service = new MessageSendService()
	service.configure(deps)
	return service
}

export const messageSendService = new MessageSendService()
export { createMessageSendService }

function generateUniqueId(): string {
	const timestamp = Date.now().toString(36)
	const randomPart = Math.random().toString(36).substring(2, 15)
	return `${timestamp}-${randomPart}`
}

function stripTempOptions(options?: SendMessageOptions): SendMessageOptions | undefined {
	if (!options) return undefined
	// 发送前移除临时字段
	const { _tempProject, _tempTopic, ...rest } = options
	void _tempProject
	void _tempTopic
	return rest
}

function splitSuperAgentExtra(extra?: Record<string, unknown>) {
	if (!extra) {
		return {
			legacySuperAgentExtra: {},
			nestedSuperAgentExtra: {},
		}
	}

	const { super_agent, ...legacySuperAgentExtra } = extra

	return {
		legacySuperAgentExtra,
		nestedSuperAgentExtra: isObject(super_agent)
			? (super_agent as Record<string, unknown>)
			: {},
	}
}
