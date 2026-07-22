import { makeAutoObservable, runInAction, toJS } from "mobx"
import pubsub from "@/utils/pubsub"
import { unionBy, get, set, merge } from "lodash-es"
import dayjs from "@/lib/dayjs"
import type { SuperMagicChunkMessage } from "@/types/chat/intermediate_message"
import {
	createDomainEventRegistry,
	createTopicMessageListenerRegistry,
	RegisterTopicMessageListenerParams,
	resolveCrewDomainEvent,
	resolveTaskDomainEvent,
} from "./listener-registry"
import { persistMessageToStorage } from "./persistence"
import { notifyAskUserV2BrowserNotificationFromMessageNode } from "../services/askUserBrowserNotificationService"
import { ASK_USER_TOOL } from "../components/MessageList/utils/askUserConstants"
import {
	getRawMessageNode,
	transformRawMessage,
	sortMessages,
	addOneToBigNumberString,
	isToolCallsEqual,
	isToolCallsMatch,
	isToolCallArgumentsComplete,
	compactToolCalls,
	getCharsPerTick,
	calculateBatchSize,
	adjustSliceEnd,
	createStreamState,
	getDefaultTopicMeta,
} from "./message-transforms"
import { bindSuperMagicStoreCollaborators, superMagicStoreCollaborators } from "./collaborators"

// Re-export types (preserves all existing public type exports)
export type {
	MessageItem,
	RawSuperMagicMessageNode,
	RawSuperMagicMessageEnvelope,
	RegisterTopicMessageListenerParams,
	TopicMessageListenerPayload,
	CrewDomainEventPayload,
	TaskDomainEventPayload,
	DomainEventPayload,
	RegisterDomainEventListenerParams,
	StreamRecoveryRequestPayload,
} from "./types"

// Re-export value exports
export { isV2Message } from "./message-transforms"
// import { db } from "./storage"

// Export Role Store
export { roleStore } from "./RoleStore"
// Export File Icon Store
export { fileIconStore } from "./fileIconStore"

// Export Suggestion Store
export { suggestionStore } from "./SuggestionStore"

// ─── Internal type imports ───────────────────────────────────

import type {
	SuperMagicStoreTopicId,
	TopicMessageNode,
	TopicMessageListenerPayload,
	DomainEventPayload,
	RawSuperMagicMessageNode,
	RawSuperMagicIMMessage,
	RawSuperMagicMessageSequence,
	RawSuperMagicMessageEnvelope,
	PendingUserMessageEnvelope,
	ServerMessagesConfirmedPayload,
	SuperMagicStoreCallbackRegistrar,
	SuperMagicStoreCollaborators,
	SharedMessageItem,
	MessageItem,
	StreamState,
	ToolCall,
	ToolStreamStepResult,
	ToolStreamMessageState,
	ToolResponseState,
	TopicMeta,
	RegisterDomainEventListenerParams,
	StreamRecoveryRequestPayload,
} from "./types"

/** 离开话题超过该时长后，重新进入时优先快速追平而不是逐字续播。 */
const TOPIC_CATCHUP_INACTIVE_THRESHOLD_MS = 8_000

/** UI 已追平但迟迟没有终态时，触发一次服务端权威恢复而不是永久等待下一条 WS chunk。 */
const STREAM_RECOVERY_TIMEOUT_MS = 5_000

const STREAM_RECOVERY_MAX_BACKOFF_MS = 30_000

const TERMINAL_TOPIC_TASK_STATUSES = new Set(["finished", "error", "suspended"])

function compareMessageSeqId(left: string, right: string): number {
	if (left === right) return 0
	const normalizedLeft = left.replace(/^0+(?=\d)/, "")
	const normalizedRight = right.replace(/^0+(?=\d)/, "")
	if (/^\d+$/.test(normalizedLeft) && /^\d+$/.test(normalizedRight)) {
		if (normalizedLeft.length !== normalizedRight.length) {
			return normalizedLeft.length - normalizedRight.length
		}
	}
	return normalizedLeft.localeCompare(normalizedRight)
}

function resolveDomainEvents(payload: TopicMessageListenerPayload): DomainEventPayload[] {
	return [resolveCrewDomainEvent(payload), resolveTaskDomainEvent(payload)].filter(
		(event): event is DomainEventPayload => Boolean(event),
	)
}

export class SuperMagicStore implements SuperMagicStoreCallbackRegistrar {
	private collaborators: SuperMagicStoreCollaborators
	private topicSyncGenerationCounter = 0
	private onServerMessagesConfirmedCallbacks = new Set<
		(payload: ServerMessagesConfirmedPayload) => void
	>()
	private onStreamRecoveryRequestedCallbacks = new Set<
		(payload: StreamRecoveryRequestPayload) => void
	>()
	// 消息
	messages: Map<SuperMagicStoreTopicId, MessageItem[]> = new Map()
	// 消息缓冲区
	buffer: Map<
		SuperMagicStoreTopicId,
		{ isProcessing: boolean; messages: RawSuperMagicMessageEnvelope[] }
	> = new Map()
	// 消息内容（卡片形式）
	messageMap: Map<string, unknown> = new Map()
	// 工具调用响应最新态（key: <topic_id, tool_call_id>）
	toolResponseMap: Map<string, Map<string, ToolResponseState>> = new Map()
	/** 话题消息元数据 */
	topicMeta: Map<SuperMagicStoreTopicId, TopicMeta> = new Map()
	/** 话题Id映射( < IM话题Id, 超麦话题Id > ) */
	topicMap: Map<string, string> = new Map()
	/** 当前可见话题 ID，仅该话题执行定时器驱动的打字机渲染 */
	activeTopicId: string | null = null

	/** 话题消息监听注册中心：用于消息到达阶段的订阅/发布 */
	private topicMessageListenerRegistry = createTopicMessageListenerRegistry<
		MessageItem,
		TopicMessageNode
	>()
	/** 领域事件注册中心：用于将消息变更转换后的领域事件统一分发 */
	private domainEventRegistry = createDomainEventRegistry<DomainEventPayload>()

	constructor(collaborators: SuperMagicStoreCollaborators = superMagicStoreCollaborators) {
		this.collaborators = collaborators
		makeAutoObservable(
			this,
			{
				onServerMessagesConfirmedCallbacks: false,
				onStreamRecoveryRequestedCallbacks: false,
				topicSyncGenerationCounter: false,
			},
			{ autoBind: true },
		)
	}

	registerOnServerMessagesConfirmed(callback: (payload: ServerMessagesConfirmedPayload) => void) {
		this.onServerMessagesConfirmedCallbacks.add(callback)
		return () => {
			this.onServerMessagesConfirmedCallbacks.delete(callback)
		}
	}

	registerOnStreamRecoveryRequested(callback: (payload: StreamRecoveryRequestPayload) => void) {
		this.onStreamRecoveryRequestedCallbacks.add(callback)
		return () => {
			this.onStreamRecoveryRequestedCallbacks.delete(callback)
		}
	}

	private emitServerMessagesConfirmed(payload: ServerMessagesConfirmedPayload) {
		this.onServerMessagesConfirmedCallbacks.forEach((callback) => {
			callback(payload)
		})
	}

	private emitStreamRecoveryRequested(payload: StreamRecoveryRequestPayload) {
		this.onStreamRecoveryRequestedCallbacks.forEach((callback) => {
			callback(payload)
		})
	}

	private emitDomainEvents(payload: TopicMessageListenerPayload) {
		resolveDomainEvents(payload).forEach((event) => {
			this.domainEventRegistry.emit(event)
		})
	}

	private emitTopicMessageArrived(payload: TopicMessageListenerPayload) {
		this.topicMessageListenerRegistry.emit(payload)
	}

	/**
	 * 设置当前可见话题。切换后自动回放已完成的流式快照（场景 2）
	 * 并恢复仍在进行中的流式渲染定时器（场景 1）。
	 */
	setActiveTopicId(topicId: string | null) {
		const prevTopicId = this.activeTopicId
		if (prevTopicId && prevTopicId !== topicId) {
			const previousMeta = this.topicMeta.get(prevTopicId)
			if (previousMeta) {
				previousMeta.inactiveAt = Date.now()
				if (previousMeta.timer) {
					clearTimeout(previousMeta.timer)
					previousMeta.timer = null
				}
				this.clearStreamRecoveryTimer(prevTopicId)
			}
		}
		this.activeTopicId = topicId
		if (topicId && topicId !== prevTopicId) {
			this.getTopicMetadata(topicId).lastActiveAt = Date.now()
			this.replayPendingSnapshots(topicId)
			this.resumeActiveStreams(topicId)
		}
	}

	/** 清理当前话题等待服务端恢复的 watchdog，避免切换话题后旧流再次唤醒。 */
	private clearStreamRecoveryTimer(topicId: string, correlationId?: string) {
		const topicMeta = this.topicMeta.get(topicId)
		if (!topicMeta?.recoveryTimer) return
		if (correlationId && topicMeta.recoveryCorrelationId !== correlationId) return
		clearTimeout(topicMeta.recoveryTimer)
		topicMeta.recoveryTimer = null
		topicMeta.recoveryCorrelationId = null
	}

	/**
	 * 渲染追平后进入等待态时启动一次 watchdog。等待态本身是正常的，只有超过阈值仍未
	 * 收到可渲染数据才请求 HTTP 权威快照，避免把“模型思考中”误判成卡死。
	 */
	private scheduleStreamRecovery(topicId: string, correlationId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		const streamState = topicMeta.content.get(correlationId)
		if (!streamState || streamState.isFinalMessageReceived) return
		if (topicId !== this.activeTopicId || topicMeta.timer) return
		if (topicMeta.recoveryTimer && topicMeta.recoveryCorrelationId === correlationId) return

		this.clearStreamRecoveryTimer(topicId)
		const recoveryDelay = Math.min(
			STREAM_RECOVERY_TIMEOUT_MS * 2 ** streamState.recoveryAttempts,
			STREAM_RECOVERY_MAX_BACKOFF_MS,
		)
		topicMeta.recoveryCorrelationId = correlationId
		topicMeta.recoveryTimer = setTimeout(() => {
			runInAction(() => {
				topicMeta.recoveryTimer = null
				topicMeta.recoveryCorrelationId = null
				const currentStreamState = topicMeta.content.get(correlationId)
				if (
					!currentStreamState ||
					currentStreamState.isFinalMessageReceived ||
					topicId !== this.activeTopicId ||
					topicMeta.timer
				)
					return

				currentStreamState.recoveryAttempts += 1
				this.emitStreamRecoveryRequested({ topicId, correlationId })
			})
		}, recoveryDelay)
	}

	/**
	 * 开始一次话题权威同步。代次在所有话题间单调递增，确保 A 的旧请求在切到 B 后
	 * 即使晚返回，也无法覆盖 A/B 当前已经确认的消息视图。
	 */
	beginTopicSync(topicId: string): number {
		const topicMeta = this.getTopicMetadata(topicId)
		const generation = ++this.topicSyncGenerationCounter
		topicMeta.syncGeneration = generation
		topicMeta.syncState = "syncing"
		return generation
	}

	isTopicSyncCurrent(topicId: string, generation: number): boolean {
		const topicMeta = this.topicMeta.get(topicId)
		return Boolean(
			topicMeta?.syncState === "syncing" &&
			topicMeta.syncGeneration === generation &&
			this.topicSyncGenerationCounter === generation,
		)
	}

	/** 取消仍在途的同步，使其后续响应只能被读取、不能再写回 store。 */
	cancelTopicSync(topicId: string, generation: number) {
		if (!this.isTopicSyncCurrent(topicId, generation)) return
		this.topicSyncGenerationCounter += 1
		const topicMeta = this.getTopicMetadata(topicId)
		topicMeta.syncState = "idle"
	}

	/**
	 * 完成权威同步并选择恢复策略。时间仅用于决定动画快慢；话题终态和服务端最终消息
	 * 仍负责结算流式正确性，避免把“离开很久”误当成“任务已完成”。
	 */
	completeTopicSync(
		topicId: string,
		generation: number,
		{
			succeeded,
			taskStatus,
			latestSeqId,
		}: {
			succeeded: boolean
			taskStatus?: string
			latestSeqId?: string
		},
	): boolean {
		if (!this.isTopicSyncCurrent(topicId, generation)) return false

		const topicMeta = this.getTopicMetadata(topicId)
		this.clearStreamRecoveryTimer(topicId)
		const now = Date.now()
		const previousSyncedSeqId = topicMeta.lastSyncedSeqId
		const inactiveSince =
			topicMeta.inactiveAt &&
			(!topicMeta.lastActiveAt || topicMeta.inactiveAt > topicMeta.lastActiveAt)
				? topicMeta.inactiveAt
				: topicMeta.lastSyncedAt
		const hasLongRecoveryGap = Boolean(
			inactiveSince && now - inactiveSince >= TOPIC_CATCHUP_INACTIVE_THRESHOLD_MS,
		)
		const hasSequenceAdvanced = Boolean(
			succeeded &&
			previousSyncedSeqId &&
			latestSeqId &&
			compareMessageSeqId(latestSeqId, previousSyncedSeqId) > 0,
		)
		const isTerminalTopic = Boolean(taskStatus && TERMINAL_TOPIC_TASK_STATUSES.has(taskStatus))

		if (isTerminalTopic) {
			topicMeta.renderPolicy = "instant"
		} else if (hasLongRecoveryGap || hasSequenceAdvanced) {
			topicMeta.renderPolicy = "catchup"
		} else {
			topicMeta.renderPolicy = "live"
		}

		if (succeeded) {
			topicMeta.lastSyncedAt = now
			if (latestSeqId) topicMeta.lastSyncedSeqId = latestSeqId
		}
		topicMeta.syncState = "idle"

		if (topicMeta.renderPolicy === "instant") {
			this.settleTopicStreamsInstantly(topicId)
		} else if (topicId === this.activeTopicId && topicMeta.content.size > 0) {
			this.resumeActiveStreams(topicId)
		}
		return true
	}

	getLatestMessageSeqId(topicId: string): string {
		return (this.messages.get(topicId) || []).reduce((latestSeqId, message) => {
			const currentSeqId = String(message.seq_id || "")
			if (!currentSeqId) return latestSeqId
			if (!latestSeqId || compareMessageSeqId(currentSeqId, latestSeqId) > 0) {
				return currentSeqId
			}
			return latestSeqId
		}, "")
	}

	/**
	 * @description 初始化话题的消息列表 (messages 为desc排序，确保与 this.messages 中时间排序保持一致（从大到小）)
	 * @param topicId 话题id
	 * @param messages 消息列表
	 */
	initializeMessages(topicId: string, messages: RawSuperMagicMessageEnvelope[]) {
		const existingMessages = this.messages.get(topicId) || []
		const topicBuffer = this.getTopicBuffer(topicId)
		const incomingAppMessageIds: string[] = []
		console.log("API 拉取的消息列表", messages)
		const bufferedMessageIds = new Set(
			topicBuffer.messages.map((item) => item?.seq?.message?.app_message_id),
		)
		const existingMessageIds = new Set(existingMessages.map((item) => item.app_message_id))
		runInAction(() => {
			const chronologicalMessages = (messages || []).slice().reverse()
			const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
			let settledStream = false
			chronologicalMessages.forEach((envelope) => {
				const imMessage = envelope?.seq?.message
				const rawNode = getRawMessageNode(imMessage)
				const messageType = String(imMessage?.type || "")
				const appMessageId = imMessage?.app_message_id as string
				if (appMessageId) incomingAppMessageIds.push(appMessageId)
				const correlationId = String(rawNode?.correlation_id || "")
				if (
					!bufferedMessageIds.has(appMessageId) &&
					rawNode?.event !== "before_llm_request"
				) {
					const incomingMessage: MessageItem = transformRawMessage(
						envelope?.seq as RawSuperMagicMessageSequence,
					)
					// 针对客户端的工具调用消息直接过滤
					if (incomingMessage?.type === "user_tool_call") {
						return
					}
					if (
						existingMessageIds.has(appMessageId) ||
						existingMessageIds.has(correlationId)
					) {
						const matchIndex = existingMessages.findIndex(
							(item) =>
								item?.app_message_id === appMessageId ||
								(item?.app_message_id === correlationId &&
									item?.role === rawNode?.role),
						)
						if (matchIndex > -1) {
							const existingMessage = existingMessages[matchIndex]
							if (existingMessage) {
								existingMessages[matchIndex] = {
									...existingMessage,
									...incomingMessage,
									app_message_id: existingMessage.app_message_id,
								}
							}
						}
					} else {
						existingMessages.push(incomingMessage)
					}
				}
				if (messageType === "super_magic_message") {
					if (rawNode?.role === "tool" && rawNode?.tool?.id) {
						toolResponseMap.set(rawNode?.tool?.id, {
							...rawNode?.tool,
						})
					}
				}

				this.messageMap.set(appMessageId, rawNode)
				if (rawNode?.role === "assistant" && appMessageId && correlationId) {
					settledStream =
						this.reconcileServerAssistantSnapshot(
							topicId,
							appMessageId,
							correlationId,
							rawNode,
						) || settledStream
				}
			})
			// Clean up local sidecars.
			this.emitServerMessagesConfirmed({
				chat_topic_id: topicId,
				app_message_ids: incomingAppMessageIds,
			})

			const mergedServerMessages = unionBy(sortMessages(existingMessages), "app_message_id")
			// Server history enters the in-memory list first, then local failed messages are restored by send-time anchors before a single UI update.
			this.collaborators.getRestorableUserMessages(topicId).forEach((message) => {
				this.insertPendingUserMessage(
					mergedServerMessages,
					topicId,
					message.pending_message,
					{
						created_at: message.created_at,
						anchor_message_id: message.anchor_message_id,
						anchor_seq_id: message.anchor_seq_id,
					},
				)
			})

			this.toolResponseMap.set(topicId, toolResponseMap)
			this.messages.set(topicId, mergedServerMessages)
			if (settledStream) {
				// 服务端快照已解除流式回压；继续消费已在后台排队的 tool 响应，
				// 同时由 processMessageBuffer 跳过已确认终态的重复 assistant 消息。
				const buffer = this.getTopicBuffer(topicId)
				buffer.isProcessing = false
				this.processMessageBuffer(topicId)
				const topicMeta = this.getTopicMetadata(topicId)
				if (
					topicId === this.activeTopicId &&
					topicMeta.content.size > 0 &&
					!topicMeta.timer
				) {
					const nextCorrelationId = topicMeta.content.keys().next().value
					if (nextCorrelationId) this.startStreamRendering(topicId, nextCorrelationId)
				}
			}
		})
	}

	/**
	 * @description 加载分享的消息列表
	 * @param messages 消息列表
	 */
	loadSharedMessages(messages: SharedMessageItem[]) {
		runInAction(() => {
			messages?.forEach((sharedMessage) => {
				const messageId = String(sharedMessage?.message_id || "")
				if (sharedMessage?.type === "rich_text") {
					this.messageMap.set(messageId, {
						...sharedMessage,
						...(sharedMessage?.raw_content?.rich_text || {}),
					})
				} else if (sharedMessage?.type === "super_magic_message") {
					const rawNode = {
						...(sharedMessage?.raw_content?.super_magic_message as Record<
							string,
							unknown
						>),
					}
					if (rawNode?.role === "tool") {
						const toolPayload = (rawNode?.tool || {}) as Record<string, unknown>
						const toolCallId = String(rawNode?.tool_call_id || toolPayload?.id || "")
						if (toolCallId) {
							const topicId = String(sharedMessage?.topic_id || "")
							const toolResponse = toolPayload as ToolResponseState
							const topicToolMap = this.toolResponseMap.get(topicId) || new Map()
							topicToolMap.set(toolCallId, toolResponse)
							this.toolResponseMap.set(topicId, topicToolMap)
						}
					}

					this.messageMap.set(messageId, rawNode)
				} else {
					this.messageMap.set(messageId, sharedMessage)
				}
			})
		})
	}

	// ======================================
	// 方法 1：外部接收真实 chunk（前期正常流）
	// ======================================
	receiveChunk(message: SuperMagicChunkMessage) {
		const topicId = message?.topic_id
		persistMessageToStorage(topicId, message)
		const messageChunk = message?.[message?.type]
		const correlationId = String(messageChunk?.correlation_id || "")
		if (!topicId || !correlationId) return
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.finalizedCorrelationIds.has(correlationId)) return

		const choice = messageChunk?.choices?.[0]
		const delta = choice?.delta
		const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
		const isFinalChunk = Boolean(choice?.finish_reason || messageChunk?.usage)
		const hasRenderableDelta = Boolean(
			(typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) ||
			(typeof delta?.content === "string" && delta.content.length > 0) ||
			toolCalls.length > 0,
		)
		// heartbeat/metadata-only chunk 不能创建空 StreamState，否则 topic 会永久保持 streaming。
		if (!hasRenderableDelta && !isFinalChunk) return

		const existingStreamState = this.getStreamState(topicId, correlationId)
		// 只有终止标记但没有任何前置数据时，等待最终 IM/HTTP 消息直接建立完整节点。
		if (!existingStreamState && isFinalChunk && !hasRenderableDelta) {
			if (topicId === this.activeTopicId && topicMeta.syncState !== "syncing") {
				this.emitStreamRecoveryRequested({ topicId, correlationId })
			}
			return
		}

		const stableAppMessageId = correlationId
		const streamState = existingStreamState || this.getTopicStreamState(topicId, correlationId)
		if (streamState.isFinalMessageReceived) return

		runInAction(() => {
			this.clearStreamRecoveryTimer(topicId, correlationId)
			streamState.recoveryAttempts = 0
			if (isFinalChunk) {
				topicMeta.isStream = false
				streamState.isFinalMessageReceived = true
			} else {
				// 新的增量 chunk 说明话题已经重新进入运行态，结束上一次终态同步留下的瞬时策略。
				if (topicMeta.renderPolicy === "instant") topicMeta.renderPolicy = "live"
				topicMeta.isStream = true
			}

			if (delta?.reasoning_content) {
				streamState.reasoning_content += delta.reasoning_content
			}

			if (delta?.content) {
				streamState.content += delta.content
			}

			toolCalls.forEach((toolCall) => {
				const fn = toolCall?.function
				if (fn && !Array.isArray(fn) && typeof fn === "object") {
					const isNewTool = fn.name
					const toolIndex = toolCall?.index ?? 0

					if (isNewTool) {
						const existingTool = streamState.tool_calls[toolIndex]
						streamState.tool_calls[toolIndex] = {
							...existingTool,
							...toolCall,
							function: {
								...existingTool?.function,
								...fn,
							},
						} as ToolCall
					} else {
						const argCache = get(
							streamState,
							["tool_calls", toolIndex, "function", "arguments"],
							"",
						)
						set(
							streamState,
							["tool_calls", toolIndex, "function", "arguments"],
							argCache + (fn.arguments || ""),
						)
					}
				}
			})

			this.startStreamRendering(topicId, stableAppMessageId)
		})
	}

	/**
	 * 全量消息同步是切回话题后的服务端权威快照。若列表仍以 correlationId
	 * 持有流式占位卡片，需要同时覆盖该别名节点并静默结算旧 StreamState，
	 * 避免 API 已返回终态后又恢复离开前的打字机动画。
	 */
	private reconcileServerAssistantSnapshot(
		topicId: string,
		appMessageId: string,
		correlationId: string,
		serverNode: RawSuperMagicMessageNode,
	) {
		const streamState = this.getStreamState(topicId, correlationId)
		const correlationNode = this.messageMap.get(correlationId) as
			| RawSuperMagicMessageNode
			| undefined
		const hasTopicCorrelationNode =
			correlationNode && (!correlationNode.topic_id || correlationNode.topic_id === topicId)
		if (!streamState && !hasTopicCorrelationNode) return

		const reconciledNode = {
			...(hasTopicCorrelationNode ? correlationNode : {}),
			...serverNode,
			content: typeof serverNode.content === "string" ? serverNode.content : "",
			reasoning_content:
				typeof serverNode.reasoning_content === "string"
					? serverNode.reasoning_content
					: "",
			tool_calls: Array.isArray(serverNode.tool_calls)
				? compactToolCalls(serverNode.tool_calls as ToolCall[])
				: [],
		} as RawSuperMagicMessageNode

		// 列表卡片可能仍保留 correlationId 作为稳定 React key；两个查询键必须指向同一终态。
		this.messageMap.set(correlationId, reconciledNode)
		this.messageMap.set(appMessageId, reconciledNode)

		if (!streamState) return
		const topicMeta = this.getTopicMetadata(topicId)
		this.clearStreamRecoveryTimer(topicId, correlationId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}
		topicMeta.content.delete(correlationId)
		topicMeta.streamSnapshots.delete(correlationId)
		topicMeta.finalizedCorrelationIds.add(correlationId)
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)
		return true
	}

	private getTopicBuffer(topicId: string) {
		if (!this.buffer.has(topicId)) {
			this.buffer.set(topicId, { isProcessing: false, messages: [] })
		}
		return this.buffer.get(topicId)! as {
			isProcessing: boolean
			messages: RawSuperMagicMessageEnvelope[]
		}
	}

	/**
	 * tool response 属于 canonical 数据，不应等待 assistant 打字机完成后才入账。
	 * UI 的 tool 字段会从这个 Map 读取，消息队列只负责顺序化列表和领域事件。
	 */
	private recordToolResponse(topicId: string, messageNode?: RawSuperMagicMessageNode) {
		const toolId = String(messageNode?.tool?.id || messageNode?.tool_call_id || "")
		if (!toolId || messageNode?.role !== "tool") return
		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
		toolResponseMap.set(toolId, { ...(messageNode.tool as ToolResponseState) })
		this.toolResponseMap.set(topicId, toolResponseMap)
	}

	addUserMessage(topicId: string, baseMessage: PendingUserMessageEnvelope) {
		const rawMessage = baseMessage?.message as RawSuperMagicIMMessage
		const appMessageId = rawMessage?.app_message_id as string
		const resolvedTopicId = (rawMessage?.topic_id as string) || topicId
		if (!rawMessage || !appMessageId || !resolvedTopicId) return

		const messageList = this.messages.get(resolvedTopicId) || []
		if (messageList.some((item) => item.app_message_id === appMessageId)) return

		const lastMessage = messageList?.[messageList.length - 1]
		const seqId = lastMessage ? addOneToBigNumberString(lastMessage.seq_id) : `${Date.now()}`
		const sequence = {
			seq_id: seqId,
			message_id: appMessageId,
			refer_message_id: "",
			sender_message_id: rawMessage?.sender_id || "",
			conversation_id: baseMessage?.conversation_id || "",
			send_time: dayjs().unix(),
			magic_id: "",
			organization_code: "",
			message: {
				...rawMessage,
				send_time: dayjs().unix(),
			},
		} as RawSuperMagicMessageSequence
		const nextMessage = transformRawMessage(sequence)
		const messageNode = getRawMessageNode(rawMessage)

		runInAction(() => {
			this.messageMap.set(appMessageId, messageNode)
			this.messages.set(
				resolvedTopicId,
				unionBy(sortMessages([...messageList, nextMessage]), "app_message_id"),
			)
		})
	}

	/** Records the current message list anchor before sending; used only for optimistic recovery positioning, not included in API payload. */
	getLatestMessageAnchor(topicId: string) {
		const messageList = this.messages.get(topicId) || []
		const lastMessage = messageList[messageList.length - 1]
		let fallbackAnchorMessage: MessageItem | undefined
		for (let i = messageList.length - 1; i >= 0; i--) {
			if (messageList[i]?.app_message_id) {
				fallbackAnchorMessage = messageList[i]
				break
			}
		}

		return {
			anchor_message_id: fallbackAnchorMessage?.app_message_id,
			anchor_seq_id: lastMessage?.seq_id,
		}
	}

	private getUserMessageAnchorIndex(
		messageList: MessageItem[],
		options?: { anchor_message_id?: string; anchor_seq_id?: string },
	) {
		// Prefer seq anchor for refresh recovery positioning; fall back to app_message_id of the last message before send.
		if (!options?.anchor_seq_id && !options?.anchor_message_id) return -1

		const anchorSeqIndex = options.anchor_seq_id
			? messageList.findIndex((message) => message.seq_id === options.anchor_seq_id)
			: -1
		if (anchorSeqIndex > -1) return anchorSeqIndex

		return options.anchor_message_id
			? messageList.findIndex(
					(message) => message.app_message_id === options.anchor_message_id,
				)
			: -1
	}

	private resolveRestoredUserMessageSeqId(createdAt: number, anchorMessage?: MessageItem) {
		if (!anchorMessage?.seq_id) return `${createdAt}`
		// Construct a local seq using the anchor seq prefix, ensuring stable ordering after the anchor and before the next real message.
		return `${anchorMessage.seq_id}_${createdAt}`
	}

	private isRestoredOptimisticMessageAfterAnchor(message?: MessageItem) {
		// Check if local recovered messages have already been inserted after the anchor; consecutive failed messages continue in order.
		const optimisticStatus = this.collaborators.getMessageOptimisticStatus(
			message?.topic_id,
			message?.app_message_id,
		)
		return Boolean(message?.app_message_id && optimisticStatus)
	}

	private insertPendingUserMessage(
		messageList: MessageItem[],
		topicId: string,
		baseMessage: PendingUserMessageEnvelope,
		options: { created_at?: number; anchor_message_id?: string; anchor_seq_id?: string },
	) {
		// After server history flows back, insert local failed/sending snapshots into the main store list by their send-time anchors.
		const rawMessage = baseMessage?.message as RawSuperMagicIMMessage
		const appMessageId = rawMessage?.app_message_id as string
		if (!rawMessage || !appMessageId || !options.created_at) return
		if (messageList.some((item) => item.app_message_id === appMessageId)) return

		const anchorIndex = this.getUserMessageAnchorIndex(messageList, options)
		const anchorMessage = anchorIndex > -1 ? messageList[anchorIndex] : undefined
		const sendTime = Math.floor(options.created_at / 1000)
		const sequence = {
			seq_id: this.resolveRestoredUserMessageSeqId(options.created_at, anchorMessage),
			message_id: appMessageId,
			refer_message_id: "",
			sender_message_id: rawMessage?.sender_id || "",
			conversation_id: baseMessage?.conversation_id || "",
			send_time: sendTime,
			magic_id: "",
			organization_code: "",
			message: {
				...rawMessage,
				send_time: sendTime,
			},
		} as RawSuperMagicMessageSequence
		const nextMessage = transformRawMessage(sequence)
		const messageNode = getRawMessageNode(rawMessage)
		const insertionIndex = this.getRestoredUserMessageInsertionIndex(messageList, anchorIndex)

		this.messageMap.set(appMessageId, messageNode)
		const nextMessages =
			insertionIndex > -1
				? [
						...messageList.slice(0, insertionIndex),
						nextMessage,
						...messageList.slice(insertionIndex),
					]
				: sortMessages([...messageList, nextMessage])
		messageList.length = 0
		messageList.push(...nextMessages)
	}

	private getRestoredUserMessageInsertionIndex(messageList: MessageItem[], anchorIndex: number) {
		// Multiple failed messages may be consecutively recovered after the same anchor; new messages are inserted after this segment.
		if (anchorIndex === -1) return -1

		let insertionIndex = anchorIndex + 1
		while (this.isRestoredOptimisticMessageAfterAnchor(messageList[insertionIndex])) {
			insertionIndex += 1
		}
		return insertionIndex
	}

	/** Before retrying an optimistic failed message, remove the old local user message from the v2 main message source. */
	removeUserMessage(topicId: string, appMessageId: string) {
		if (!topicId || !appMessageId) return

		const messageList = this.messages.get(topicId) || []
		runInAction(() => {
			this.messages.set(
				topicId,
				messageList.filter((item) => item.app_message_id !== appMessageId),
			)
			this.messageMap.delete(appMessageId)
		})
	}

	replaceUserMessage(
		topicId: string,
		baseMessage: RawSuperMagicMessageEnvelope | RawSuperMagicMessageSequence,
	) {
		const sequence =
			"seq" in baseMessage
				? (baseMessage.seq as RawSuperMagicMessageSequence)
				: (baseMessage as RawSuperMagicMessageSequence)
		const rawMessage = sequence?.message as RawSuperMagicIMMessage
		const appMessageId = rawMessage?.app_message_id as string
		const resolvedTopicId = (rawMessage?.topic_id as string) || topicId
		if (!sequence || !rawMessage || !appMessageId || !resolvedTopicId) return

		const messageNode = getRawMessageNode(rawMessage)
		const nextMessage = transformRawMessage(sequence)
		const messageList = this.messages.get(resolvedTopicId) || []
		const messageIndex = messageList.findIndex((item) => item.app_message_id === appMessageId)

		runInAction(() => {
			const nextMessages = messageList.slice()
			if (messageIndex > -1) {
				nextMessages[messageIndex] = merge({}, nextMessages[messageIndex], nextMessage)
			} else {
				nextMessages.push(nextMessage)
			}
			this.messages.set(
				resolvedTopicId,
				unionBy(sortMessages(nextMessages), "app_message_id"),
			)
			this.messageMap.set(
				appMessageId,
				merge({}, this.messageMap.get(appMessageId), messageNode),
			)
		})
	}

	// ======================================
	// 方法 2：收到最终 message → 切换续流模式
	// ======================================
	enqueueMessage(topicId: string, baseMessage: RawSuperMagicMessageEnvelope) {
		const message = baseMessage?.seq as RawSuperMagicMessageSequence
		const msgCache = this.messages.get(topicId) || []

		const nextMessage = transformRawMessage(message)

		const msgIdSet = new Set(msgCache.map((o) => o?.app_message_id))

		const messageNode = getRawMessageNode(message?.message)

		const appMessageId = message?.message?.app_message_id as string

		const correlationId = messageNode?.correlation_id as string

		const buffer = this.getTopicBuffer(topicId)
		this.recordToolResponse(topicId, messageNode)

		// 针对客户端的工具调用消息直接过滤
		if (nextMessage?.type === "user_tool_call") {
			persistMessageToStorage(topicId, message, true)
			return
		}

		const hasMessage = msgIdSet.has(appMessageId)
		const hasCorrelationIdMessage = msgIdSet.has(correlationId) && messageNode?.role !== "tool"
		const hasBufferMessage = buffer.messages.some(
			(o) => o?.seq?.message?.app_message_id === appMessageId,
		)
		if (hasMessage || hasCorrelationIdMessage || hasBufferMessage) {
			if (hasCorrelationIdMessage && correlationId) {
				// 真消息到达时，把非流式字段（status / task_id / event /
				// attachments / usage 等元信息）同步到 chunk 阶段创建的 mock 节点与卡片，
				// content / reasoning_content / tool_calls 仍走流式 catch-up，
				// 避免一次性刷新打断打字机渲染。
				// ⚠️ 必须放在 `if (streamState)` 之外：当 chunks 自带 finish_reason
				// 且 catch-up 已完成时，completeStreamRendering 会提前把 streamState
				// 从 topicMeta.content 中删掉；此时 IM 层真消息才到达，mock 节点/卡片
				// 仍然存在，元信息同步必须继续执行，否则 task_id / status / event 等
				// 非流式字段将永远停留在 getDefaultNode / getDefaultMessage 的默认值。
				this.syncFinalNodeMetadata(correlationId, messageNode)
				this.syncFinalCardMetadata(topicId, correlationId, nextMessage)

				const streamState = this.getStreamState(topicId, correlationId)
				if (streamState) {
					streamState.isFinalMessageReceived = true
					if (messageNode?.content) streamState.content = messageNode.content as string
					if (messageNode?.reasoning_content)
						streamState.reasoning_content = messageNode.reasoning_content as string

					const finalToolCalls =
						Array.isArray(messageNode?.tool_calls) && messageNode.tool_calls.length > 0
							? (messageNode.tool_calls as ToolCall[])
							: []
					streamState.tool_calls = this.mergeToolCallsById(
						compactToolCalls(streamState.tool_calls),
						compactToolCalls(finalToolCalls),
					)

					const cache = this.messageMap.get(correlationId) as
						| RawSuperMagicMessageNode
						| undefined
					if (cache && finalToolCalls.length === 0) {
						cache.tool_calls = []
						this.messageMap.set(correlationId, cache)
					}

					// IM 消息到达时立即同步 tool 字段到 messageMap，
					// 避免 content 流式阶段工具状态无法更新
					this.syncToolCallsToolField(correlationId, messageNode)

					this.startStreamRendering(topicId, correlationId)
				} else {
					this.syncToolCallsToolField(correlationId, messageNode)
				}
				persistMessageToStorage(topicId, message, true)
			}
			return
		}

		persistMessageToStorage(topicId, message, true)

		if (nextMessage?.type === "rich_text") {
			const topicId = nextMessage?.topic_id || ""
			const messages = this.messages.get(topicId) || []
			runInAction(() => {
				this.messageMap.set(appMessageId, messageNode)
				this.messages.set(topicId, [...messages, nextMessage])
			})
			return
		}

		if (nextMessage?.type === "super_magic_message") {
			const buffer = this.getTopicBuffer(topicId)
			const bufferIndex = buffer?.messages.findIndex(
				(o) =>
					o?.seq?.message?.app_message_id === baseMessage?.seq?.message?.app_message_id,
			)
			if (bufferIndex < 0) {
				buffer?.messages.push(baseMessage)
				console.log(
					"%c 【DEBUG】 插入队列",
					"background-color: red;color: white;padding:0 4px",
					JSON.parse(JSON.stringify(buffer)),
					JSON.parse(JSON.stringify(baseMessage)),
				)
			}
			this.processMessageBuffer(topicId)
		}
	}

	/** 注册指定话题的新消息到达监听，仅响应增量 arrived 事件。 */
	registerTopicMessageListener(
		params: RegisterTopicMessageListenerParams<MessageItem, TopicMessageNode>,
	) {
		return this.topicMessageListenerRegistry.register(params)
	}

	/**
	 * 流式已完成（streamState 已删除）后真消息才到达时，
	 * 将真消息 tool_calls 各项上的 tool 字段同步到 messageMap 缓存。
	 */
	private syncToolCallsToolField(
		correlationId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!correlationId || !finalNode) return
		const finalToolCalls = Array.isArray(finalNode.tool_calls)
			? (finalNode.tool_calls as ToolCall[])
			: []
		if (finalToolCalls.length === 0) return

		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
		if (!cache || !Array.isArray(cache.tool_calls)) return

		const cacheToolCalls = cache.tool_calls as ToolCall[]
		let mutated = false
		finalToolCalls.forEach((ft, i) => {
			if (ft.tool && cacheToolCalls[i]) {
				cacheToolCalls[i].tool = ft.tool
				mutated = true
			}
		})
		if (mutated) {
			this.messageMap.set(correlationId, cache)
		}
	}

	/**
	 * 将真消息节点中的非流式元信息合并到 chunk 阶段创建的 mock 节点。
	 * 跳过 content / reasoning_content / tool_calls（由 startStreamRendering
	 * 渐进 catch-up），也跳过 correlation_id（mock 已经按它建表）。
	 */
	private syncFinalNodeMetadata(
		correlationId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!correlationId || !finalNode) return
		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
		if (!cache) return

		const streamControlledKeys = new Set([
			"content",
			"reasoning_content",
			"tool_calls",
			"correlation_id",
		])

		let mutated = false
		Object.entries(finalNode as Record<string, unknown>).forEach(([key, value]) => {
			if (streamControlledKeys.has(key)) return
			if (value === undefined) return
			if ((cache as Record<string, unknown>)[key] === value) return
			;(cache as Record<string, unknown>)[key] = value
			mutated = true
		})

		if (mutated) {
			this.messageMap.set(correlationId, cache)
		}
	}

	/**
	 * 将真消息卡片中的身份 / 状态字段合并到 mock 卡片。保留 mock 卡片的
	 * app_message_id（== correlationId），避免替换主键导致 React key 抖动
	 * 或下游订阅错位。
	 */
	private syncFinalCardMetadata(
		topicId: string,
		correlationId: string,
		finalCard: MessageItem | undefined,
	) {
		if (!topicId || !correlationId || !finalCard) return
		const messages = this.messages.get(topicId)
		if (!messages?.length) return

		const cardIndex = messages.findIndex((item) => item.app_message_id === correlationId)
		if (cardIndex < 0) return

		const existingCard = messages[cardIndex]
		const patchableKeys: Array<string> = [
			"magic_message_id",
			"conversation_id",
			"sender_id",
			"send_time",
			"seq_id",
			"status",
			"event",
			"refer_message_id",
			"parent_correlation_id",
			"topic_id",
			"type",
		]

		let mutated = false
		const merged: MessageItem = { ...existingCard }
		patchableKeys.forEach((key) => {
			const next = (finalCard as Record<string, unknown>)[key]
			if (next === undefined || next === null || next === "") return
			if ((merged as Record<string, unknown>)[key] === next) return
			;(merged as Record<string, unknown>)[key] = next
			mutated = true
		})

		if (!mutated) return
		const nextMessages = messages.slice()
		nextMessages[cardIndex] = merged
		this.messages.set(topicId, nextMessages)
	}

	private processMessageBuffer(topicId: string) {
		const buffer = this.getTopicBuffer(topicId)
		if (buffer.messages.length > 0 && !buffer.isProcessing) {
			buffer.isProcessing = true
			const nextMessage = buffer.messages.shift()

			const messageNode = getRawMessageNode(nextMessage?.seq?.message)

			const message = transformRawMessage(nextMessage?.seq as RawSuperMagicMessageSequence)

			if (messageNode?.role === "tool") {
				if (messageNode?.status === "suspended") {
					this.handleTopicSuspended(topicId)
				}

				// tool response 已在 enqueueMessage / 入队时写入 canonical map；这里不再等待
				// assistant 动画，避免一个停住的 StreamState 永久卡住整个消息队列。
				this.recordToolResponse(topicId, messageNode)

				console.log(
					"%c 【DEBUG】 消费队列 - 工具",
					"background-color: pink;color: white;padding:0 4px",
					JSON.parse(JSON.stringify(buffer)),
				)
				const messages = this.messages.get(topicId) || []
				messages.push(message)
				this.messages.set(topicId, unionBy(sortMessages(messages), "app_message_id"))
				this.messageMap.set(message?.app_message_id, messageNode)

				this.emitTopicMessageArrived({
					topicId,
					message,
					messageNode,
					stage: "arrived",
				})
				this.emitDomainEvents({
					topicId,
					message,
					messageNode,
					stage: "arrived",
				})

				buffer.isProcessing = false
				this.processMessageBuffer(topicId)
			} else {
				const correlationId = messageNode?.correlation_id as string
				const rawAppMessageId = nextMessage?.seq?.message?.app_message_id as string
				const topicMeta = this.getTopicMetadata(topicId)
				if (correlationId && topicMeta.finalizedCorrelationIds.has(correlationId)) {
					// 全量服务端快照已经结算该 assistant；丢弃 buffer 中的重复副本，
					// 防止切回后又重新创建一份流式状态。
					buffer.isProcessing = false
					this.processMessageBuffer(topicId)
					return
				}

				const streamState = this.getTopicStreamState(topicId, correlationId)
				streamState.isFinalMessageReceived = true
				if (topicMeta.timer) {
					console.log(
						"%c 【DEBUG】 消费队列 - 流式（等待流式完成）",
						"background-color: orange;color: white;padding:0 4px",
						JSON.parse(JSON.stringify(buffer)),
					)
					buffer.messages.unshift(nextMessage!)
					buffer.isProcessing = false
					return
				}

				console.log(
					"%c 【DEBUG】 消费队列 - 流式",
					"background-color: pink;color: white;padding:0 4px",
					JSON.parse(JSON.stringify(nextMessage)),
				)
				streamState.content = messageNode?.content || ""
				streamState.reasoning_content = (messageNode?.reasoning_content as string) || ""
				streamState.tool_calls = (messageNode?.tool_calls as ToolCall[]) || []
				// 服务端原始 app_message_id 与流式稳定 correlationId 都必须可回查到最终节点。
				if (rawAppMessageId) this.messageMap.set(rawAppMessageId, messageNode)
				this.startStreamRendering(topicId, messageNode?.correlation_id as string)

				// 首次真消息（无 chunk 前置）场景：startStreamRendering 只会用
				// getDefaultNode / getDefaultMessage 创建空壳 mock，真消息里的
				// status / task_id / event / attachments / usage 等非流式字段不会被自动写入。
				// 这里与路径 A 保持一致，补一次元信息同步，避免下游读到默认占位值。
				if (correlationId) {
					this.syncFinalNodeMetadata(
						correlationId,
						messageNode as RawSuperMagicMessageNode,
					)
					this.syncFinalCardMetadata(topicId, correlationId, message)
				}
			}
		}
	}

	private startStreamRendering(topicId: string, correlationId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta?.timer) {
			return
		}

		const streamState = this.getTopicStreamState(topicId, correlationId)
		let cache = this.messageMap.get(correlationId || "") as RawSuperMagicMessageNode

		if (!cache) {
			this.messageMap.set(correlationId || "", this.getDefaultNode(correlationId || ""))
			cache = this.messageMap.get(correlationId || "") as RawSuperMagicMessageNode

			const messages = this.messages.get(topicId) || []
			const lastMessage = messages[messages.length - 1]
			const seqId = lastMessage ? addOneToBigNumberString(lastMessage.seq_id) : "1"

			const card = this.getDefaultMessage({
				topic_id: topicId,
				correlation_id: correlationId,
				app_message_id: correlationId,
				seq_id: seqId,
			}) as any

			this.messages.set(topicId, unionBy(sortMessages([...messages, card]), "app_message_id"))
		}

		if (topicMeta.renderPolicy === "instant" && streamState.isFinalMessageReceived) {
			this.settleTopicStreamsInstantly(topicId)
			return
		}

		if (topicId !== this.activeTopicId) {
			if (streamState.isFinalMessageReceived) {
				this.flushStreamToCompletion(topicId, correlationId)
			}
			return
		}

		const progressed = this.resumeFromCurrentStateV2(topicId, correlationId)
		if (progressed) this.clearStreamRecoveryTimer(topicId, correlationId)

		if (streamState.isFinalMessageReceived && streamState.stage === "done") {
			const isStreamContentSame = streamState.content === cache?.content
			const isStreamReasoningContentSame =
				streamState.reasoning_content === cache?.reasoning_content
			const isStreamToolCallsSame = isToolCallsEqual(
				streamState.tool_calls,
				(cache?.tool_calls as ToolCall[]) || [],
			)
			if (isStreamContentSame && isStreamReasoningContentSame && isStreamToolCallsSame) {
				console.log(
					"%c 【DEBUG】 流式终止 V1",
					"background-color: black;color: white;padding:0 4px",
				)
				this.completeStreamRendering(topicId, correlationId)
				return
			}
		}
		if (!progressed && !streamState.isFinalMessageReceived) {
			// 流式无新数据且未收到最终消息 → 暂停定时器，等待下一个 chunk
			// 到达后由 receiveChunk 重启渲染；若长期没有有效数据则 watchdog 请求 HTTP 快照。
			if (topicMeta.renderPolicy === "catchup") topicMeta.renderPolicy = "live"
			this.scheduleStreamRecovery(topicId, correlationId)
			return
		}

		topicMeta.timer = setTimeout(() => {
			runInAction(() => {
				topicMeta.timer = null
				this.startStreamRendering(topicId, correlationId)
			})
		}, 16)
	}

	/**
	 * 不可见话题收到 final 后：保存视觉快照，一次性写入 messageMap，
	 * 然后 completeStreamRendering 以正常排空 buffer / 触发事件。
	 */
	private flushStreamToCompletion(topicId: string, correlationId: string) {
		const streamState = this.getTopicStreamState(topicId, correlationId)
		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode
		if (!cache || !streamState) return

		const topicMeta = this.getTopicMetadata(topicId)
		topicMeta.streamSnapshots.set(correlationId, {
			reasoning_content: streamState.reasoning_content || "",
			content: (streamState.content as string) || "",
			tool_calls: Array.isArray(cache.tool_calls)
				? ([...(cache.tool_calls as ToolCall[])] as ToolCall[])
				: [],
		})

		cache.reasoning_content = streamState.reasoning_content
		cache.content = streamState.content
		cache.tool_calls = streamState.tool_calls
		this.messageMap.set(correlationId, cache)

		this.completeStreamRendering(topicId, correlationId)
	}

	/**
	 * 服务端已确认话题终态时，直接把仍保留的 canonical stream 内容投影到消息节点，
	 * 一次性移除动画状态并释放 buffer，避免终态话题再次进入打字机循环。
	 */
	private settleTopicStreamsInstantly(topicId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		this.clearStreamRecoveryTimer(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}

		const messages = this.messages.get(topicId) || []
		topicMeta.content.forEach((streamState, correlationId) => {
			const cache = (this.messageMap.get(correlationId) ||
				this.getDefaultNode(correlationId)) as RawSuperMagicMessageNode
			streamState.isFinalMessageReceived = true
			streamState.stage = "done"
			cache.reasoning_content = streamState.reasoning_content
			cache.content = streamState.content
			cache.tool_calls = compactToolCalls(streamState.tool_calls)
			this.messageMap.set(correlationId, cache)
			const targetMessage = messages.find(
				(message) =>
					message.correlation_id === correlationId ||
					message.app_message_id === correlationId,
			)
			if (targetMessage?.app_message_id) {
				this.messageMap.set(targetMessage.app_message_id, cache)
			}
			topicMeta.finalizedCorrelationIds.add(correlationId)
		})

		topicMeta.content.clear()
		topicMeta.streamSnapshots.clear()
		topicMeta.isStream = false
		topicMeta.isStreamLoading = false
		this.topicMeta.set(topicId, topicMeta)

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
	}

	private completeStreamRendering(topicId: string, correlationId?: string) {
		const meta = this.getTopicMetadata(topicId)
		this.clearStreamRecoveryTimer(topicId, correlationId)
		meta.isStreamLoading = false
		if (meta.timer) {
			clearTimeout(meta.timer)
			meta.timer = null
		}
		const completedStreamState = correlationId ? meta.content?.get(correlationId) : undefined
		if (correlationId && completedStreamState?.isFinalMessageReceived) {
			meta.finalizedCorrelationIds.add(correlationId)
		}
		if (correlationId && meta.content?.has(correlationId)) {
			meta.content.delete(correlationId)
		}
		this.topicMeta.set(topicId, meta)

		if (correlationId) {
			const messages = this.messages.get(topicId) || []
			const targetMessage = messages.find(
				(m) => m.correlation_id === correlationId || m.app_message_id === correlationId,
			)
			if (targetMessage) {
				const payload = {
					topicId,
					message: targetMessage,
					messageNode:
						this.getMessageNode(targetMessage.app_message_id) ||
						this.getMessageNode(correlationId),
					stage: "arrived" as const,
				} satisfies TopicMessageListenerPayload
				this.emitTopicMessageArrived(payload)
				this.emitDomainEvents(payload)
			}
		}

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
		if (
			meta.renderPolicy === "catchup" &&
			meta.content.size === 0 &&
			buffer.messages.length === 0
		) {
			meta.renderPolicy = "live"
		}

		if (meta.content?.size && !meta.timer) {
			const nextCorrelationId = meta.content.keys().next().value
			if (nextCorrelationId) {
				this.startStreamRendering(topicId, nextCorrelationId)
			}
		}
	}

	private handleTopicSuspended(topicId: string) {
		const topicMeta = this.topicMeta.get(topicId)
		if (!topicMeta?.content) return

		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()

		topicMeta.content.forEach((streamState, correlationId) => {
			if (streamState.isFinalMessageReceived) return

			const validToolCalls = compactToolCalls(streamState.tool_calls).filter(
				isToolCallArgumentsComplete,
			)

			streamState.tool_calls = validToolCalls
			streamState.isFinalMessageReceived = true

			const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
			if (cache) {
				;(cache as any).tool_calls = validToolCalls.length > 0 ? validToolCalls : []
				this.messageMap.set(correlationId, cache)
			}

			validToolCalls.forEach((tc) => {
				if (tc.id && !toolResponseMap.has(tc.id) && !this.isAskUserToolCall(tc)) {
					toolResponseMap.set(tc.id, this.createInterruptedToolResponse(tc))
				}
			})

			this.completeStreamRendering(topicId, correlationId)
		})

		this.fillInterruptedToolResponses(topicId, toolResponseMap)
		this.toolResponseMap.set(topicId, toolResponseMap)
	}

	private isAskUserToolCall(tc: ToolCall) {
		return tc.function?.name === ASK_USER_TOOL.name || tc.tool?.name === ASK_USER_TOOL.name
	}

	/**
	 * 从消息列表末尾向前回溯，为所有缺少 toolResponse 的 tool_call 补填中断状态。
	 * 遇到所有 tool_calls 都已有 response 的 assistant 消息时停止回溯。
	 */
	private fillInterruptedToolResponses(
		topicId: string,
		toolResponseMap: Map<string, ToolResponseState>,
	) {
		const messages = this.messages.get(topicId) || []
		for (let i = messages.length - 1; i >= 0; i--) {
			const msg = messages[i]
			if (msg.role !== "assistant") continue

			const node = this.messageMap.get(msg.app_message_id) as
				| RawSuperMagicMessageNode
				| undefined
			const toolCalls = (node?.tool_calls as ToolCall[]) || []
			if (toolCalls.length === 0) continue

			let hasUnresolved = false
			toolCalls.forEach((tc) => {
				if (tc.id && !toolResponseMap.has(tc.id) && !this.isAskUserToolCall(tc)) {
					hasUnresolved = true
					toolResponseMap.set(tc.id, this.createInterruptedToolResponse(tc))
				}
			})

			if (!hasUnresolved) break
		}
	}

	private createInterruptedToolResponse(tc: ToolCall): ToolResponseState {
		return {
			...tc.tool,
			id: tc.id,
			name: tc.tool?.name || tc.function?.name || "",
			status: "suspended",
			remark: "任务已中断",
		}
	}

	/**
	 * 以 current 数组既有顺序为基准，按 tool_call.id 合并 incoming：
	 * - 已有 id：原位补齐 function.arguments / function.label / tool
	 * - 新 id：追加末尾
	 * 首现即定序、永不重排，根治流式与最终态顺序不一致。
	 */
	private mergeToolCallsById(current: ToolCall[], incoming: ToolCall[]): ToolCall[] {
		if (current.length === 0) return incoming
		if (incoming.length === 0) return incoming

		const currentById = new Map(current.map((t) => [t.id, t]))
		const merged: ToolCall[] = current.map((t) => {
			const inc = incoming.find((i) => i.id === t.id)
			if (!inc) return t
			return {
				...t,
				function: {
					...t.function,
					arguments: inc.function?.arguments ?? t.function?.arguments ?? "",
					label: inc.function?.label || t.function?.label || "",
					name: inc.function?.name || t.function?.name || "",
				},
				...(inc.tool ? { tool: inc.tool } : {}),
			}
		})

		for (const inc of incoming) {
			if (!currentById.has(inc.id)) {
				merged.push(inc)
			}
		}

		return merged
	}

	/**
	 * 按 existingOrder 的 id 顺序重排 tools：已知 id 保持 existingOrder 顺序，
	 * 新 id 追加末尾。用于续流前统一排序，保证 streamToolCallsBySingleUnit
	 * 的 slice 沿用稳定顺序。
	 */
	private reorderToolCallsByExisting(existingOrder: ToolCall[], tools: ToolCall[]): ToolCall[] {
		if (existingOrder.length === 0) return tools
		if (tools.length === 0) return tools

		const toolById = new Map(tools.map((t) => [t.id, t]))
		const ordered: ToolCall[] = []

		for (const existing of existingOrder) {
			const match = toolById.get(existing.id)
			if (match) {
				ordered.push(match)
				toolById.delete(existing.id)
			}
		}

		toolById.forEach((remaining) => {
			ordered.push(remaining)
		})

		return ordered
	}

	private resumeFromCurrentStateV2(topicId: string, appMessageId: string): boolean {
		const streamState = this.getTopicStreamState(topicId, appMessageId)
		const messageMap = this.messageMap.get(appMessageId) || this.getDefaultNode(appMessageId)

		const finalContent = streamState.content || ""
		const finalReasoningContent = streamState.reasoning_content || ""
		const finalTools = compactToolCalls(streamState.tool_calls)

		// --------------------------
		// 1. 续流思考（直接补全）
		// --------------------------
		if (!messageMap?.reasoning_content) {
			messageMap.reasoning_content = ""
		}
		if (finalReasoningContent && finalReasoningContent !== messageMap?.reasoning_content) {
			if (
				messageMap.reasoning_content &&
				!finalReasoningContent.startsWith(messageMap.reasoning_content)
			) {
				messageMap.reasoning_content = finalReasoningContent
			}
			if (finalReasoningContent.length > messageMap?.reasoning_content?.length) {
				streamState.stage = "reasoning_content"
			}
			const currentReasoningContent = messageMap?.reasoning_content
			const remainingReasoningContent = finalReasoningContent.slice(
				currentReasoningContent.length,
			)
			console.log("【LS】 reasoning_content", streamState.stage)
			const rcStep = adjustSliceEnd(
				remainingReasoningContent,
				this.getStreamRenderStep(topicId, remainingReasoningContent.length),
			)
			messageMap.reasoning_content += remainingReasoningContent.slice(0, rcStep)
			this.messageMap.set(appMessageId, messageMap)
			return true
		}

		// --------------------------
		// 2. 续流正文（从当前截断位置续流）
		// --------------------------
		if (!messageMap?.content) {
			messageMap.content = ""
		}
		if (finalContent && finalContent !== messageMap?.content) {
			if (messageMap.content && !finalContent.startsWith(messageMap.content)) {
				messageMap.content = finalContent
			}
			if (finalContent.length > messageMap?.content?.length) {
				streamState.stage = "content"
			}
			const currentContent = messageMap?.content
			const remainingContent = finalContent.slice(currentContent.length)
			console.log("【LS】 content", streamState.stage)
			const cStep = adjustSliceEnd(
				remainingContent,
				this.getStreamRenderStep(topicId, remainingContent.length),
			)
			messageMap.content += remainingContent.slice(0, cStep)
			this.messageMap.set(appMessageId, messageMap)
			return true
		}

		// --------------------------
		// 3. 续流工具（基于 topicMeta.tool_calls 续流到 messageMap）
		// --------------------------
		if (!Array.isArray(messageMap.tool_calls)) messageMap.tool_calls = []
		const orderedFinalTools = this.reorderToolCallsByExisting(
			messageMap.tool_calls as ToolCall[],
			finalTools,
		)
		if (!isToolCallsEqual(messageMap.tool_calls, orderedFinalTools)) {
			streamState.stage = "tool"

			console.log("【LS】 tool_calls", streamState.stage)
			const toolStepResult = this.streamToolCallsBySingleUnit(
				topicId,
				messageMap,
				streamState,
				orderedFinalTools,
			)
			this.messageMap.set(appMessageId, messageMap)
			if (!toolStepResult.progressed && toolStepResult.done) return false
			return true
		}

		if (streamState.isFinalMessageReceived) {
			if (orderedFinalTools.length > 0 && Array.isArray(messageMap.tool_calls)) {
				let toolSynced = false
				orderedFinalTools.forEach((ft, i) => {
					if (
						ft.tool &&
						messageMap.tool_calls?.[i] &&
						messageMap.tool_calls[i].tool !== ft.tool
					) {
						messageMap.tool_calls[i].tool = ft.tool
						toolSynced = true
					}
				})
				if (toolSynced) this.messageMap.set(appMessageId, messageMap)
			}
			streamState.stage = "done"
		}
		console.log("【LS】 done", streamState.stage)
		return false
	}

	private getStreamRenderStep(topicId: string, remaining: number): number {
		const liveStep = getCharsPerTick(remaining)
		if (this.getTopicMetadata(topicId).renderPolicy !== "catchup") return liveStep
		// 追平必须至少不慢于实时打字机；calculateBatchSize 负责放大小文本尾段的推进步长。
		return Math.max(liveStep, calculateBatchSize(remaining, true))
	}

	private streamToolCallsBySingleUnit(
		topicId: string,
		messageMap: ToolStreamMessageState,
		streamState: StreamState,
		finalTools: ToolCall[],
	): ToolStreamStepResult {
		if (!Array.isArray(finalTools) || finalTools.length === 0) {
			streamState.currentToolIndex = 0
			return { progressed: false, done: true }
		}

		let startIndex = Math.max(streamState.currentToolIndex || 0, 0)

		for (let j = 0; j < Math.min(startIndex, finalTools.length); j++) {
			const cur = get(messageMap, ["tool_calls", j, "function", "arguments"], "")
			const fin = finalTools[j]?.function?.arguments || ""
			if (cur.length < fin.length) {
				startIndex = j
				break
			}
		}

		for (let i = startIndex; i < finalTools.length; i++) {
			const finalTool = finalTools[i]
			const toolId = finalTool?.id || String(i)
			const toolType = finalTool?.type || "function"
			const toolName = finalTool?.function?.name || ""
			const toolLabel = finalTool?.function?.label || ""
			const finalArgs = finalTool?.function?.arguments || ""
			const finalToolResponse = finalTool?.tool
			const currentArgs = get(messageMap, ["tool_calls", i, "function", "arguments"], "")

			if (!messageMap.tool_calls?.[i]) {
				messageMap.tool_calls![i] = {
					id: toolId,
					type: toolType,
					index: i,
					function: {
						name: toolName,
						label: toolLabel,
						arguments: "",
					},
					...(finalToolResponse ? { tool: finalToolResponse } : {}),
				}
			}

			set(messageMap, ["tool_calls", i, "id"], toolId)
			set(messageMap, ["tool_calls", i, "type"], toolType)
			set(messageMap, ["tool_calls", i, "index"], i)
			set(messageMap, ["tool_calls", i, "function", "name"], toolName)
			set(messageMap, ["tool_calls", i, "function", "label"], toolLabel)
			if (finalToolResponse) {
				set(messageMap, ["tool_calls", i, "tool"], finalToolResponse)
			}

			if (currentArgs.length < finalArgs.length) {
				const remaining = finalArgs.length - currentArgs.length
				const step = this.getStreamRenderStep(topicId, remaining)
				const safeEnd = adjustSliceEnd(finalArgs, currentArgs.length + step)
				const nextChunk = finalArgs.slice(currentArgs.length, safeEnd)
				set(messageMap, ["tool_calls", i, "function", "arguments"], currentArgs + nextChunk)
				streamState.currentToolIndex = i
				messageMap.tool_calls = messageMap.tool_calls?.slice(0, i + 1)
				return { progressed: true, done: false }
			}

			streamState.currentToolIndex = i + 1
			messageMap.tool_calls = messageMap.tool_calls?.slice(0, i + 1)
			return {
				progressed: true,
				done: streamState.currentToolIndex >= finalTools.length,
			}
		}

		streamState.currentToolIndex = finalTools.length
		return { progressed: false, done: true }
	}

	/**
	 * 切回话题时：清理不可见期间保存的流式快照。
	 * cache (messageMap) 在 flushStreamToCompletion 中已被固化为完整终态，
	 * 无需回退重建 StreamState、无需重启打字机——observer 直接显示终态。
	 */
	private replayPendingSnapshots(topicId: string) {
		const topicMeta = this.topicMeta.get(topicId)
		if (!topicMeta?.streamSnapshots?.size) return

		topicMeta.streamSnapshots.clear()
	}

	/**
	 * 切回话题时：恢复仍在进行中（chunk 尚未结束）的流式渲染定时器。
	 */
	private resumeActiveStreams(topicId: string) {
		const topicMeta = this.topicMeta.get(topicId)
		if (!topicMeta?.content?.size || topicMeta.timer) return

		const firstCorrelationId = topicMeta.content.keys().next().value
		if (firstCorrelationId) {
			this.startStreamRendering(topicId, firstCorrelationId)
		}
	}

	isTopicStreaming(topicId: string): boolean {
		return (this.topicMeta.get(topicId)?.content?.size ?? 0) > 0
	}

	/**
	 * @description 获取消息节点
	 * @param appMessageId 消息id
	 * @returns 消息节点
	 */
	getMessageNode(appMessageId?: string) {
		return this.messageMap.get(appMessageId || "")
	}

	private getTopicMetadata(topicId: string): TopicMeta {
		if (!this.topicMeta.has(topicId)) {
			this.topicMeta.set(topicId, getDefaultTopicMeta())
		}
		return this.topicMeta.get(topicId)!
	}

	private getTopicStreamState(topicId: string, correlationId: string): StreamState {
		const topicMeta = this.getTopicMetadata(topicId)

		if (!topicMeta.content?.has(correlationId)) {
			topicMeta.content?.set(correlationId, createStreamState())
		}

		const streamState = topicMeta.content?.get(correlationId)
		return streamState as StreamState
	}

	getStreamState(topicId: string, correlationId: string): StreamState | undefined {
		return this.topicMeta.get(topicId)?.content?.get(correlationId)
	}

	private getDefaultNode(correlationId: string): any {
		return {
			attachments: [],
			content: "",
			correlation_id: correlationId,
			name: null,
			reasoning_content: "",
			role: "assistant",
			status: "running",
			tool: null,
			tool_call_id: null,
			tool_calls: null,
			topic_id: "",
			usage: null,
		}
	}

	private getDefaultMessage(node: Record<string, string>) {
		return {
			type: "super_magic_message",
			unread_count: 0,
			sender_id: "sender_id",
			send_time: dayjs().unix(),
			status: "unread",
			event: null,
			parent_correlation_id: "",
			role: "assistant",
			refer_message_id: "",
			...node,
		}
	}

	/**
	 * @description 处理超麦流式消息
	 * @param message 消息
	 */
	handleSuperMagicChunkMessage(message: SuperMagicChunkMessage) {}

	/**
	 * @description 设置测试消息(DEBUG 专用)
	 * @param topicId 话题id
	 */
	setTest(topicId: string) {
		this.messages.set(topicId, [
			{
				magic_message_id: "35ef35e5b262aaf728408aefda28f4d6",
				app_message_id: "ml4spbx3-r3j3lwr6mjh",
				topic_id: topicId,
				type: "rich_text",
				unread_count: 0,
				sender_id: "usi_5f2de55e890e1df920df700e569bc64f",
				send_time: dayjs().unix(),
				status: "read",
				parent_correlation_id: "",
				role: "user",
				seq_id: "876836510905307136",
				refer_message_id: "",
			} as unknown as MessageItem,
		])
		this.messageMap.set("ml4spbx3-r3j3lwr6mjh", {
			instructs: [
				{
					value: "normal",
					instruction: null,
				},
			],
			extra: {
				super_agent: {
					chat_mode: "normal",
					topic_pattern: "general",
					agent_code: null,
					model: {
						model_id: "gemini-3-pro-preview",
					},
					image_model: {
						model_id: "gemini-2.5-flash-image-preview",
					},
					enable_web_search: true,
					processed_by_api: null,
				},
			},
			content:
				'{"type":"doc","content":[{"type":"paragraph","attrs":{"suggestion":"，最好能生成一个时间轴图表"},"content":[{"type":"text","text":"帮我整理"漫威"宇宙中的英雄与电影，我需要从钢铁侠开始到现在的蜘蛛侠，每年上映的漫威宇宙电影有哪些？，并列出对应的主要英雄角色、电影海报、上映时间等等，行程可视化的html，按照时间线排序。"}]}]}',
		})
	}

	registerDomainEventListener(params: RegisterDomainEventListenerParams) {
		return this.domainEventRegistry.register(params)
	}
}

// Module-level assembly: query capabilities injected via collaborators, write notifications bound via callback registration.
export const superMagicStore = new SuperMagicStore(superMagicStoreCollaborators)
bindSuperMagicStoreCollaborators(superMagicStore)
// @ts-ignore
window.base = () => {
	console.log(/** keep-console */ "messages      ", toJS(superMagicStore.messages))
	console.log(/** keep-console */ "toolResponseMap", toJS(superMagicStore.toolResponseMap))
	console.log(/** keep-console */ "messageMap    ", toJS(superMagicStore.messageMap))
	console.log(/** keep-console */ "buffer        ", toJS(superMagicStore.buffer))
	console.log(/** keep-console */ "topicMeta  ", toJS(superMagicStore.topicMeta))
}

// @ts-ignore
window.superMagicStore = superMagicStore

// @ts-ignore
pubsub.subscribe("super_magic_chunk_message", (message: SuperMagicChunkMessage) => {
	superMagicStore.receiveChunk(message)
})
