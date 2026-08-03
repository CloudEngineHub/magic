import { makeAutoObservable, observable, runInAction, toJS } from "mobx"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { unionBy, get, set, merge, isEqual } from "lodash-es"
import dayjs from "@/lib/dayjs"
import type { SuperMagicChunkMessage } from "@/types/chat/intermediate_message"
import {
	createWebSocketRecordMetadata,
	persistMessagesToStorage,
	waitForMessagePersistence,
	WEBSOCKET_RECORD_METADATA_KEY,
	type PersistableMessage,
	type WebSocketRecordSource,
} from "./persistence"
import { notifyAskUserV2BrowserNotificationFromMessageNode } from "../services/askUserBrowserNotificationService"
import { ASK_USER_TOOL } from "../components/MessageList/utils/askUserConstants"
import {
	getRawMessageNode,
	transformRawMessage,
	sortMessages,
	addOneToBigNumberString,
	isToolCallsEqual,
	isToolCallArgumentsComplete,
	compactToolCalls,
	getCharsPerTick,
	calculateBatchSize,
	adjustSliceEnd,
	createStreamState,
	getDefaultTopicMeta,
} from "./message-transforms"
import { bindSuperMagicStoreCollaborators, superMagicStoreCollaborators } from "./collaborators"
import type {
	MessageStreamEndReason,
	SuperMagicEventMap,
	SuperMagicEventMessageRef,
	SuperMagicEventMeta,
	SuperMagicEventSource,
	SuperMagicEventType,
	SuperMagicSubscribeOptions,
	SuperMagicToolCallDelta,
	ToolCallSettledStatus,
	TaskCompletedEvent,
	TopicExecutionEndedEvent,
	TopicExecutionEndedStatus,
} from "./events"
import { createSuperMagicEventEmitter } from "./events/internal/emitter"
import { SuperMagicEventTransitionLedger } from "./events/internal/transition-ledger"

// Re-export types (preserves all existing public type exports)
export type {
	MessageItem,
	RawSuperMagicMessageNode,
	RawSuperMagicMessageEnvelope,
	StreamRecoveryRequestPayload,
	StreamRecoveryState,
	StreamRecoveryFailurePayload,
	ToolResponseRecoveryState,
	InitializeMessagesOptions,
	HttpToolProjectionPolicy,
	ReconcileAuthoritativeMessagesInput,
	TopicSyncRenderStrategy,
} from "./types"
export type {
	MessageCommittedEvent,
	MessageStreamDeltaEvent,
	MessageStreamEndedEvent,
	MessageStreamEndReason,
	MessageStreamStartedEvent,
	SuperMagicEvent,
	SuperMagicEventCallback,
	SuperMagicEventMap,
	SuperMagicEventMessageRef,
	SuperMagicEventMeta,
	SuperMagicEventScope,
	SuperMagicEventSource,
	SuperMagicEventType,
	SuperMagicSubscribe,
	SuperMagicSubscribeOptions,
	SuperMagicToolCallDelta,
	SuperMagicUnsubscribe,
	ToolCallSettledEvent,
	ToolCallSettledStatus,
	TaskCompletedEvent,
	TopicExecutionEndedEvent,
	TopicExecutionEndedStatus,
} from "./events"

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
	StreamRecoveryRequestPayload,
	StreamRecoveryState,
	StreamRecoveryFailurePayload,
	ToolResponseRecoveryState,
	InitializeMessagesOptions,
	ReconcileAuthoritativeMessagesInput,
	TopicSyncRenderStrategy,
} from "./types"

/** 离开话题达到该时长后，重新进入时直接展示当前已知 draft。 */
const TOPIC_LONG_ABSENCE_THRESHOLD_MS = 30_000

const getMonotonicNow = () => (typeof performance === "undefined" ? Date.now() : performance.now())

/** UI 已追平但迟迟没有终态时，触发一次服务端权威恢复而不是永久等待下一条 WS chunk。 */
const STREAM_RECOVERY_TIMEOUT_MS = 5_000

const STREAM_RECOVERY_MAX_BACKOFF_MS = 30_000

const STREAM_RECOVERY_MAX_ATTEMPTS = 3

const STREAM_RECOVERY_TOTAL_BUDGET_MS = 30_000

const TERMINAL_TOPIC_TASK_STATUSES = new Set(["finished", "error", "suspended"])

/** 小 chunk 先短窗口合并，降低深序列化和 IndexedDB 事务频率。 */
const STREAM_PERSISTENCE_BATCH_SIZE = 10
const STREAM_PERSISTENCE_FLUSH_MS = 200

/** 流式渲染保持约一帧一次；提速只增加单帧字符量。 */
const STREAM_RENDER_FRAME_MS = 16

/** Final 单独到达时先温和提速，给正文保留自然的连续流式效果。 */
const FINAL_STREAM_SETTLING_MULTIPLIER = 3
const FINAL_STREAM_MAX_SETTLING_BATCH = 384
const FINAL_STREAM_SETTLING_MAX_MS = 4_000

/** 检测到后继 Agent 消息压力后，从压力发生时开始计算快速追赶预算。 */
const FINAL_STREAM_CATCHUP_BUDGET_MS = 1_500
const FINAL_STREAM_SAFETY_CATCHUP_BUDGET_MS = 1_000
const FINAL_STREAM_MAX_CATCHUP_BATCH = 1_024
const FINAL_STREAM_MIN_VISIBLE_FRAMES = 4
const FINAL_STREAM_SMALL_TAIL = 32

/** Tool response 的 canonical 状态集合；response_missing 是 Store 内部生成的弱终态。 */
const VALID_TOOL_RESPONSE_STATUSES = new Set([
	"waiting",
	"running",
	"finished",
	"error",
	"suspended",
	"response_missing",
])

const TASK_SUSPENDED_EVENT = "agent_suspended"

type StreamChunkPayload = SuperMagicChunkMessage["super_magic_chunk"]

type StreamChunkChoice = StreamChunkPayload["choices"][number] & { index?: unknown }

type StreamChunkChoiceWarning =
	| {
			code: "chunk-multiple-choices"
			choiceCount: number
			choiceIndexes: unknown[]
	  }
	| {
			code: "chunk-choice-index-invalid"
			choiceIndex: unknown
	  }
	| {
			code: "chunk-choice-index-missing"
	  }

type StreamChunkChoiceSelection =
	| { kind: "heartbeat" }
	| {
			kind: "accepted"
			choice: StreamChunkChoice
			warning?: StreamChunkChoiceWarning
	  }
	| {
			kind: "rejected"
			warning: StreamChunkChoiceWarning
			shouldRecover: boolean
	  }

interface StreamChunkLedger {
	nextChunkIndex: number
	pendingChunks: Map<number, StreamChunkPayload>
	reportedChoiceWarnings: Map<string, Set<StreamChunkChoiceWarning["code"]>>
	pendingGapFinal?: {
		chunkIndex: number
		finishReason: string
		recoveryGeneration?: number
	}
}

interface InternalStreamRecoveryState extends StreamRecoveryState {
	failureEmitted: boolean
	watchdogTimer: ReturnType<typeof setTimeout> | null
	deadlineTimer: ReturnType<typeof setTimeout> | null
}

interface AuthoritativeAssistantSnapshot {
	appMessageId: string
	node: RawSuperMagicMessageNode
}

interface TopicSyncContext {
	generation: number
	correlationIds: Set<string>
	authoritativeCorrelationIds: Set<string>
	didApplyAuthoritativeSnapshot: boolean
}

interface SharedReplayState {
	latestMessageId: string
	pendingAssistant?: {
		correlationId: string
		toolCalls: ToolCall[]
	}
}

interface PendingHttpToolResponse {
	node: RawSuperMagicMessageNode
	seqId?: string
	correlationId: string
}

type ToolResponseRecordResult =
	| { kind: "recorded"; response: ToolResponseState }
	| { kind: "unchanged" }
	| { kind: "missing_owner" }
	| { kind: "owner_conflict" }
	| { kind: "invalid_tool_id" }

interface PersistenceQueue {
	messages: PersistableMessage[]
	timer: ReturnType<typeof setTimeout> | null
}

type CanonicalFinalSource = "im" | "http"

interface CanonicalFinalBarrier {
	seqId: string
	appMessageId: string
	correlationId: string
}

interface StreamTransportBarrier {
	correlationId: string
	chunkIndex: number
}

interface CanonicalFinalSettlementInput {
	source: CanonicalFinalSource
	topicId: string
	appMessageId: string
	superMessageId: string
	correlationId: string
	seqId?: string
	finalNode: RawSuperMagicMessageNode
	finalMessage?: MessageItem
	revisionDecision?: "new" | "same" | "higher" | "stale"
	emitEvents?: boolean
}

interface CanonicalFinalSettlementResult {
	accepted: boolean
	streamWasActive: boolean
	canonicalNode: RawSuperMagicMessageNode
	canonicalMessage?: MessageItem
	seqId: string
}

interface FinalRenderState {
	topicId: string
	superMessageId: string
	visibleNode: RawSuperMagicMessageNode
	targetNode: RawSuperMagicMessageNode
	startedAt: number
	catchupDeadlineAt: number | null
	timer: ReturnType<typeof setTimeout> | null
}

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

export class SuperMagicStore implements SuperMagicStoreCallbackRegistrar {
	private collaborators: SuperMagicStoreCollaborators
	private eventEmitter = createSuperMagicEventEmitter()
	private eventTransitions = new SuperMagicEventTransitionLedger()
	/** Revision-aware Final barrier; Set<superMessageId> alone cannot admit later generations. */
	private canonicalFinalBarriers = new Map<string, CanonicalFinalBarrier>()
	/** Finish-reason barrier; blocks late chunks of one transport generation without implying Final. */
	private streamTransportBarriers = new Map<string, StreamTransportBarrier>()
	/** Final-only visual projection; never participates in Topic streaming or lifecycle events. */
	private finalRenderStates = new Map<string, FinalRenderState>()
	private topicSyncGenerationCounter = 0
	/** HTTP 同步中的 finished assistant 先按代次暂存，只有同步成功且任务 finished 才提升为终态。 */
	private pendingTopicSyncFinalizations = new Map<
		string,
		{ generation: number; snapshots: Map<string, AuthoritativeAssistantSnapshot> }
	>()
	private topicSyncContexts = new Map<string, TopicSyncContext>()
	/** 非 UI canonical sidecar：metadata-only chunk 也参与排序，但不会创建空 StreamState。 */
	private streamChunkLedgers = new Map<string, StreamChunkLedger>()
	/** tool response 的 seq 只用于 canonical 覆盖防御，不暴露到 ToolResponseState。 */
	private latestToolResponseSeqIds = new Map<string, Map<string, string>>()
	/**
	 * Tool identity belongs to the first Assistant call inside one Topic. Keep ownership
	 * outside the observable response Map so UI lookup remains topic + tool.id while all
	 * ingress paths share the same correlation guard.
	 */
	private toolCallOwners = new Map<string, Map<string, string>>()
	/** Message 级缺失 Tool Response 索引；只描述恢复需求，不伪造服务端 role=tool。 */
	private toolResponseRecoveryStates = new Map<string, Map<string, ToolResponseRecoveryState>>()
	/** O(1) 找到最近一个仍有待恢复普通工具的 Assistant，供后继首个 Chunk 使用。 */
	private latestRecoverableAssistantByTopic = new Map<string, string>()
	/** HTTP 历史分页中先到且暂时没有 Assistant owner 的 Tool response。 */
	private pendingHttpToolResponses = new Map<
		string,
		Map<string, Map<string, PendingHttpToolResponse>>
	>()
	/** 分享消息会被整批、逐条和旧前缀重复回放；该 sidecar 只记录单 topic 的顺序与待结算工具。 */
	private sharedReplayStates = new Map<string, SharedReplayState>()
	/** 取消撤回后的单次 HTTP 恢复授权；普通快照不得自行把 revoked 改回 read。 */
	private imStatusRestoreAuthorizations = new Set<string>()
	/** 持久化是诊断旁路；按 Store 实例隔离，避免不同会话共享未 flush 的 chunk。 */
	private persistenceQueues = new Map<string, PersistenceQueue>()
	/** 单 Topic 单 timer 下的轮转游标，避免多个 SuperMessage 流互相饿死或递归 ping-pong。 */
	private streamRenderStarted = new Map<string, Set<string>>()
	/**
	 * Chunk 可能只有 metadata 或其 StreamState 已在 Final/恢复路径中清理；保留
	 * SuperMessage -> 协议 correlation 的旁路映射，确保 recovery 事件仍输出真实 correlation。
	 */
	private streamCorrelationIds = new Map<string, string>()
	private onServerMessagesConfirmedCallbacks = new Set<
		(payload: ServerMessagesConfirmedPayload) => void
	>()
	private onStreamRecoveryRequestedCallbacks = new Set<
		(payload: StreamRecoveryRequestPayload) => void
	>()
	private onStreamRecoveryFailedCallbacks = new Set<
		(payload: StreamRecoveryFailurePayload) => void
	>()
	private streamRecoveryStates = new Map<string, InternalStreamRecoveryState>()
	// 消息
	messages: Map<SuperMagicStoreTopicId, MessageItem[]> = new Map()
	// 消息缓冲区
	buffer: Map<
		SuperMagicStoreTopicId,
		{ isProcessing: boolean; messages: RawSuperMagicMessageEnvelope[] }
	> = new Map()
	// 消息内容（卡片形式）
	messageMap: Map<string, unknown> = new Map()
	// 工具调用响应最新态（key: <topic_id, tool.id>）
	toolResponseMap: Map<string, Map<string, ToolResponseState>> = new Map()
	/** 话题消息元数据 */
	topicMeta: Map<SuperMagicStoreTopicId, TopicMeta> = new Map()
	/** 话题Id映射( < IM话题Id, 超麦话题Id > ) */
	topicMap: Map<string, string> = new Map()
	/** 当前可见话题 ID，仅该话题执行定时器驱动的打字机渲染 */
	activeTopicId: string | null = null

	constructor(collaborators: SuperMagicStoreCollaborators = superMagicStoreCollaborators) {
		this.collaborators = collaborators
		makeAutoObservable<
			this,
			| "eventEmitter"
			| "eventTransitions"
			| "canonicalFinalBarriers"
			| "streamTransportBarriers"
			| "finalRenderStates"
			| "onServerMessagesConfirmedCallbacks"
			| "onStreamRecoveryRequestedCallbacks"
			| "onStreamRecoveryFailedCallbacks"
			| "topicSyncGenerationCounter"
			| "pendingTopicSyncFinalizations"
			| "topicSyncContexts"
			| "streamChunkLedgers"
			| "latestToolResponseSeqIds"
			| "toolCallOwners"
			| "toolResponseRecoveryStates"
			| "latestRecoverableAssistantByTopic"
			| "pendingHttpToolResponses"
			| "sharedReplayStates"
			| "imStatusRestoreAuthorizations"
			| "persistenceQueues"
			| "streamRenderStarted"
			| "streamCorrelationIds"
			| "streamRecoveryStates"
		>(
			this,
			{
				eventEmitter: false,
				eventTransitions: false,
				canonicalFinalBarriers: false,
				streamTransportBarriers: false,
				// Keep render-state values referentially stable for timer ownership while
				// making Map replacements observable to MessageNode.
				finalRenderStates: observable.shallow,
				onServerMessagesConfirmedCallbacks: false,
				onStreamRecoveryRequestedCallbacks: false,
				onStreamRecoveryFailedCallbacks: false,
				topicSyncGenerationCounter: false,
				pendingTopicSyncFinalizations: false,
				topicSyncContexts: false,
				streamChunkLedgers: false,
				latestToolResponseSeqIds: false,
				toolCallOwners: false,
				toolResponseRecoveryStates: false,
				latestRecoverableAssistantByTopic: false,
				pendingHttpToolResponses: false,
				sharedReplayStates: false,
				imStatusRestoreAuthorizations: false,
				persistenceQueues: false,
				streamRenderStarted: false,
				streamCorrelationIds: false,
				streamRecoveryStates: false,
			},
			{ autoBind: true },
		)
	}

	/**
	 * Store 查询统一使用 SuperMessage ID。User 固定使用 appMessageId；Assistant/Tool
	 * 优先使用后端字段，历史消息缺失时回退 appMessageId。
	 */
	private normalizeAssistantSuperMessageId(
		messageNode: RawSuperMagicMessageNode | undefined,
		appMessageId = "",
	) {
		if (!messageNode) return String(appMessageId || "").trim()
		const superMessageId = String(
			messageNode.role === "user"
				? appMessageId
				: messageNode.super_message_id || appMessageId,
		).trim()
		if (appMessageId) messageNode.app_message_id = appMessageId
		if (superMessageId) messageNode.super_message_id = superMessageId
		return superMessageId
	}

	private getMessageSuperMessageId(message: MessageItem | undefined) {
		return String(
			message?.super_message_id ||
				message?.debug?.super_message_id ||
				message?.app_message_id ||
				"",
		).trim()
	}

	private normalizeAssistantMessageItem(
		message: MessageItem,
		messageNode: RawSuperMagicMessageNode | undefined,
		appMessageId = message.app_message_id,
	): MessageItem {
		const superMessageId = this.normalizeAssistantSuperMessageId(messageNode, appMessageId)
		const normalizedMessage = this.normalizeMessageStatuses(message, messageNode)
		if (!superMessageId) return normalizedMessage
		return {
			...normalizedMessage,
			super_message_id: superMessageId,
			debug: messageNode as RawSuperMagicMessageNode,
			content: messageNode?.content,
			reasoning_content: messageNode?.reasoning_content,
			tool_calls: messageNode?.tool_calls,
		}
	}

	/**
	 * IM envelope 与 SuperMessage node 是两个独立状态域。`status` 只保留为
	 * 旧消费者兼容别名，任何执行/流生命周期逻辑必须读取 `superStatus` 或 node。
	 */
	private normalizeMessageStatuses(
		message: MessageItem,
		messageNode?: RawSuperMagicMessageNode,
	): MessageItem {
		const imStatus = String(message.imStatus ?? message.status ?? "")
		const superStatus =
			message.role === "user"
				? undefined
				: String(message.superStatus ?? messageNode?.status ?? "") || undefined
		return {
			...message,
			status: imStatus,
			imStatus,
			superStatus,
		}
	}

	/** 由明确的取消撤回动作授权下一次 HTTP 写入恢复 IM 状态。 */
	authorizeImStatusRestore(topicId: string) {
		if (topicId) this.imStatusRestoreAuthorizations.add(topicId)
	}

	private consumeImStatusRestoreAuthorization(topicId: string, hasIncomingMessages: boolean) {
		if (!hasIncomingMessages || !this.imStatusRestoreAuthorizations.has(topicId)) return false
		this.imStatusRestoreAuthorizations.delete(topicId)
		return true
	}

	private getAssistantMessageNode(_topicId: string, superMessageId: string) {
		const messageNode = this.messageMap.get(superMessageId) as
			RawSuperMagicMessageNode | undefined
		return messageNode?.role === "assistant" ? messageNode : undefined
	}

	private setAssistantMessageNode(
		_topicId: string,
		superMessageId: string,
		messageNode: RawSuperMagicMessageNode,
		appMessageId?: string,
	) {
		messageNode.super_message_id = superMessageId
		if (appMessageId) messageNode.app_message_id = appMessageId
		// 跨 Topic 冲突暂不额外建复合键；单字符串 Map 按最后一次写入生效。
		this.messageMap.set(superMessageId, messageNode)
	}

	/** User/Tool 与 Assistant 一样只写入归一化后的 SuperMessage ID。 */
	private setNonAssistantMessageNode(
		_topicId: string,
		superMessageId: string,
		messageNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!superMessageId || !messageNode) return
		messageNode.super_message_id = superMessageId
		this.messageMap.set(superMessageId, messageNode)
	}

	private findStreamIdentity(topicId: string, identity: string) {
		const topicMeta = this.topicMeta.get(topicId)
		if (!topicMeta) return undefined
		if (topicMeta.content.has(identity)) return identity
		const matches = Array.from(topicMeta.content.entries()).filter(
			([, streamState]) => streamState.correlation_id === identity,
		)
		if (matches.length === 1) return matches[0][0]

		const sidecarMatches = Array.from(this.streamCorrelationIds.entries())
			.filter(([key, correlationId]) => {
				const topicPrefix = `${topicId}\u0000`
				return key.startsWith(topicPrefix) && correlationId === identity
			})
			.map(([key]) => key.slice(`${topicId}\u0000`.length))
		return sidecarMatches.length === 1 ? sidecarMatches[0] : undefined
	}

	private getStreamCorrelationId(topicId: string, streamIdentity: string) {
		return (
			this.topicMeta.get(topicId)?.content.get(streamIdentity)?.correlation_id ||
			this.streamCorrelationIds.get(`${topicId}\u0000${streamIdentity}`) ||
			String(this.getAssistantMessageNode(topicId, streamIdentity)?.correlation_id || "") ||
			streamIdentity
		)
	}

	private setStreamCorrelationId(topicId: string, streamIdentity: string, correlationId: string) {
		if (!topicId || !streamIdentity || !correlationId) return
		this.streamCorrelationIds.set(`${topicId}\u0000${streamIdentity}`, correlationId)
	}

	private clearStreamCorrelationId(topicId: string, streamIdentity: string) {
		this.streamCorrelationIds.delete(`${topicId}\u0000${streamIdentity}`)
	}

	private syncAssistantCardProjection(topicId: string, superMessageId: string) {
		const messageNode = this.getAssistantMessageNode(topicId, superMessageId)
		if (!messageNode) return
		const messages = this.messages.get(topicId) || []
		const index = messages.findIndex(
			(message) =>
				message.role === "assistant" &&
				this.getMessageSuperMessageId(message) === superMessageId,
		)
		if (index < 0) return
		const nextMessages = messages.slice()
		nextMessages[index] = {
			...messages[index],
			super_message_id: superMessageId,
			correlation_id: String(messageNode.correlation_id || ""),
			content: messageNode.content,
			reasoning_content: messageNode.reasoning_content,
			tool_calls: messageNode.tool_calls,
			debug: messageNode,
		}
		this.messages.set(topicId, nextMessages)
	}

	private getToolCallOwner(topicId: string, toolId: string) {
		return this.toolCallOwners.get(topicId)?.get(toolId)
	}

	private claimToolCallOwner(
		topicId: string,
		correlationId: string,
		toolId: string,
	): "claimed" | "owned" | "conflict" {
		if (!topicId || !correlationId || !toolId) return "conflict"
		const topicOwners = this.toolCallOwners.get(topicId) || new Map<string, string>()
		const currentOwner = topicOwners.get(toolId)
		if (currentOwner) return currentOwner === correlationId ? "owned" : "conflict"

		topicOwners.set(toolId, correlationId)
		this.toolCallOwners.set(topicId, topicOwners)
		return "claimed"
	}

	private applyAssistantToolOwnership(
		topicId: string,
		messageNode: RawSuperMagicMessageNode | undefined,
	): RawSuperMagicMessageNode | undefined {
		if (messageNode?.role !== "assistant" || !Array.isArray(messageNode.tool_calls)) {
			return messageNode
		}
		const ownerIdentity = String(
			messageNode.super_message_id || messageNode.correlation_id || "",
		).trim()
		if (!ownerIdentity) return messageNode

		const acceptedToolCalls = (messageNode.tool_calls as ToolCall[]).filter((toolCall) => {
			const toolId = String(toolCall?.id || "").trim()
			if (!toolId) return true
			return this.claimToolCallOwner(topicId, ownerIdentity, toolId) !== "conflict"
		})
		if (acceptedToolCalls.length === messageNode.tool_calls.length) return messageNode

		// Preserve the transport object for diagnostics; only canonical/effective Assistant
		// projection removes a tool that belongs to another correlation in this Topic.
		return {
			...messageNode,
			tool_calls: acceptedToolCalls,
		}
	}

	private getToolResponseRecoveryKey(ownerSuperMessageId: string, toolId: string) {
		return `${ownerSuperMessageId}\u0000${toolId}`
	}

	private getTopicToolResponseRecoveryMap(topicId: string) {
		let recoveryMap = this.toolResponseRecoveryStates.get(topicId)
		if (!recoveryMap) {
			recoveryMap = new Map()
			this.toolResponseRecoveryStates.set(topicId, recoveryMap)
		}
		return recoveryMap
	}

	private refreshLatestRecoverableAssistant(topicId: string) {
		const recoveryMap = this.toolResponseRecoveryStates.get(topicId)
		if (!recoveryMap || recoveryMap.size === 0) {
			this.toolResponseRecoveryStates.delete(topicId)
			this.latestRecoverableAssistantByTopic.delete(topicId)
			return
		}
		const latest = Array.from(recoveryMap.values()).sort((left, right) =>
			compareMessageSeqId(left.anchorSeqId, right.anchorSeqId),
		)
		this.latestRecoverableAssistantByTopic.set(
			topicId,
			latest[latest.length - 1].ownerSuperMessageId,
		)
	}

	private isStrongToolResponseStatus(status?: string) {
		return status === "finished" || status === "error" || status === "suspended"
	}

	private isOrdinaryRecoverableToolCall(toolCall: ToolCall | undefined) {
		const toolId = String(toolCall?.id || "").trim()
		return Boolean(toolId && toolCall?.function?.name && !this.isAskUserToolCall(toolCall))
	}

	/** 当前 Tool Response 是否仍需要服务端权威恢复；UI loading 不参与该判断。 */
	private needsCanonicalToolRecovery(
		topicId: string,
		ownerSuperMessageId: string,
		toolId: string,
	) {
		const recovery = this.toolResponseRecoveryStates
			.get(topicId)
			?.get(this.getToolResponseRecoveryKey(ownerSuperMessageId, toolId))
		if (!recovery || recovery.phase === "dormant") return false
		const response = this.toolResponseMap.get(topicId)?.get(toolId)
		return !this.isStrongToolResponseStatus(response?.status)
	}

	/**
	 * Canonical Assistant Final 建立 Message 级缺失索引。该索引只在身份、owner、
	 * tool.id 都合法时创建，并允许后续真实 role=tool 覆盖 response_missing。
	 */
	private registerAssistantToolRecoveries(
		topicId: string,
		ownerSuperMessageId: string,
		ownerAppMessageId: string,
		anchorSeqId: string,
		toolCalls: ToolCall[],
	) {
		const recoveryMap = this.getTopicToolResponseRecoveryMap(topicId)
		const currentToolIds = new Set<string>()
		toolCalls.forEach((toolCall) => {
			if (!this.isOrdinaryRecoverableToolCall(toolCall)) return
			const toolId = String(toolCall.id).trim()
			if (this.claimToolCallOwner(topicId, ownerSuperMessageId, toolId) === "conflict") return
			currentToolIds.add(toolId)
			const response = this.toolResponseMap.get(topicId)?.get(toolId)
			if (this.isStrongToolResponseStatus(response?.status)) {
				recoveryMap.delete(this.getToolResponseRecoveryKey(ownerSuperMessageId, toolId))
				return
			}

			const key = this.getToolResponseRecoveryKey(ownerSuperMessageId, toolId)
			const existing = recoveryMap.get(key)
			recoveryMap.set(key, {
				topicId,
				ownerSuperMessageId,
				ownerAppMessageId,
				toolId,
				anchorSeqId,
				phase: existing?.phase || "awaiting_response",
				attempt: existing?.attempt || 0,
				nextRetryAt: existing?.nextRetryAt || null,
				...(existing?.lastTrigger ? { lastTrigger: existing.lastTrigger } : {}),
			})
		})

		// Final 删除的 streamed Tool 不得继续进入 recovery；这是 Final 的权威集合。
		Array.from(recoveryMap.entries()).forEach(([key, recovery]) => {
			if (
				recovery.ownerSuperMessageId === ownerSuperMessageId &&
				!currentToolIds.has(recovery.toolId)
			)
				recoveryMap.delete(key)
		})

		this.refreshLatestRecoverableAssistant(topicId)
	}

	/** 后继 Assistant 的首个有效 Chunk 是执行完成屏障，但不是具体结果屏障。 */
	private settlePreviousAssistantToolResponses(topicId: string, nextSuperMessageId: string) {
		const previousSuperMessageId = this.latestRecoverableAssistantByTopic.get(topicId)
		if (!previousSuperMessageId || previousSuperMessageId === nextSuperMessageId) return
		const recoveryMap = this.toolResponseRecoveryStates.get(topicId)
		if (!recoveryMap) return

		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
		const settlements: Array<{ toolId: string; response: ToolResponseState }> = []
		let hasPendingRecovery = false
		recoveryMap.forEach((recovery) => {
			if (recovery.ownerSuperMessageId !== previousSuperMessageId) return
			recovery.phase = "execution_settled_pending_response"
			recovery.lastTrigger = "tool_response"
			const current = toolResponseMap.get(recovery.toolId)
			if (this.isStrongToolResponseStatus(current?.status)) return
			const ownerToolCalls = this.getAssistantMessageNode(
				topicId,
				previousSuperMessageId,
			)?.tool_calls
			const toolCall = (Array.isArray(ownerToolCalls) ? ownerToolCalls : []).find(
				(candidate) => candidate?.id === recovery.toolId,
			) as ToolCall | undefined
			if (current?.status !== "response_missing" && toolCall) {
				const nextState = this.mergeToolResponseState(current, {
					...(toolCall.tool || {}),
					id: recovery.toolId,
					name: toolCall.tool?.name || toolCall.function?.name || "",
					status: "response_missing",
				})
				toolResponseMap.set(recovery.toolId, nextState)
				settlements.push({ toolId: recovery.toolId, response: nextState })
			}
			hasPendingRecovery = true
		})
		if (!hasPendingRecovery) return
		this.toolResponseMap.set(topicId, toolResponseMap)
		settlements.forEach(({ toolId, response }) =>
			this.publishToolCallSettled(topicId, toolId, response, undefined, "stream"),
		)

		const first = Array.from(recoveryMap.values()).find(
			(recovery) => recovery.ownerSuperMessageId === previousSuperMessageId,
		)
		const correlationId = this.getStreamCorrelationId(topicId, previousSuperMessageId)
		this.emitStreamRecoveryRequested({
			topicId,
			correlationId,
			reason: "tool_response",
			anchorAppMessageId: first?.ownerAppMessageId,
			anchorSeqId: first?.anchorSeqId,
		})
	}

	getToolResponseRecoveryState(topicId: string, ownerSuperMessageId: string, toolId: string) {
		const state = this.toolResponseRecoveryStates
			.get(topicId)
			?.get(this.getToolResponseRecoveryKey(ownerSuperMessageId, toolId))
		return state ? { ...state } : undefined
	}

	getToolResponseRecoveryRequest(topicId: string): StreamRecoveryRequestPayload | undefined {
		const candidates = Array.from(this.toolResponseRecoveryStates.get(topicId)?.values() || [])
			.filter((recovery) =>
				this.needsCanonicalToolRecovery(
					topicId,
					recovery.ownerSuperMessageId,
					recovery.toolId,
				),
			)
			.sort((left, right) => compareMessageSeqId(left.anchorSeqId, right.anchorSeqId))
		const first = candidates[0]
		if (!first) return undefined
		return {
			topicId,
			correlationId: this.getStreamCorrelationId(topicId, first.ownerSuperMessageId),
			reason: "tool_response",
			anchorAppMessageId: first.ownerAppMessageId,
			anchorSeqId: first.anchorSeqId,
		}
	}

	private clearToolResponseRecovery(topicId: string, toolId: string) {
		const recoveryMap = this.toolResponseRecoveryStates.get(topicId)
		if (!recoveryMap) return
		Array.from(recoveryMap.entries()).forEach(([key, recovery]) => {
			if (recovery.toolId === toolId) recoveryMap.delete(key)
		})
		this.refreshLatestRecoverableAssistant(topicId)
	}

	/** Coordinator 发请求前的二次校验，避免 UI 门控或迟到 IM 已解决时仍打 HTTP。 */
	resolveStreamRecoveryRequest(payload: StreamRecoveryRequestPayload) {
		this.wakeDormantToolRecoveries(payload.topicId, payload.reason)
		if (payload.reason !== "tool_response") return payload
		return this.getToolResponseRecoveryRequest(payload.topicId)
	}

	private wakeDormantToolRecoveries(
		topicId: string,
		trigger?: StreamRecoveryRequestPayload["reason"],
	) {
		if (!trigger || trigger === "tool_response") return
		this.toolResponseRecoveryStates.get(topicId)?.forEach((recovery) => {
			if (recovery.phase === "dormant") {
				recovery.phase = "awaiting_response"
				recovery.attempt = 0
				recovery.nextRetryAt = null
			}
		})
	}

	markToolResponseRecoveryDormant(topicId: string, anchorAppMessageId?: string) {
		this.toolResponseRecoveryStates.get(topicId)?.forEach((recovery) => {
			if (!anchorAppMessageId || recovery.ownerAppMessageId === anchorAppMessageId) {
				recovery.phase = "dormant"
				recovery.nextRetryAt = null
			}
		})
	}

	/** Coordinator 的 sidecar 生命周期只描述调度，不改变 canonical Tool 状态。 */
	markToolResponseRecoveryScheduled(topicId: string, anchorAppMessageId?: string) {
		this.toolResponseRecoveryStates.get(topicId)?.forEach((recovery) => {
			if (!anchorAppMessageId || recovery.ownerAppMessageId === anchorAppMessageId) {
				recovery.phase = "scheduled"
			}
		})
	}

	markToolResponseRecoveryInFlight(topicId: string, anchorAppMessageId?: string) {
		this.toolResponseRecoveryStates.get(topicId)?.forEach((recovery) => {
			if (!anchorAppMessageId || recovery.ownerAppMessageId === anchorAppMessageId) {
				recovery.phase = "in_flight"
			}
		})
	}

	markToolResponseRecoveryAwaitingResponse(topicId: string, anchorAppMessageId?: string) {
		this.toolResponseRecoveryStates.get(topicId)?.forEach((recovery) => {
			if (!anchorAppMessageId || recovery.ownerAppMessageId === anchorAppMessageId) {
				if (recovery.phase !== "dormant") recovery.phase = "awaiting_response"
			}
		})
	}

	private isOrphanFinishTaskResponse(messageNode: RawSuperMagicMessageNode, toolId: string) {
		return Boolean(
			messageNode.role === "tool" &&
			messageNode.tool?.name === "finish_task" &&
			/^\d+$/.test(toolId) &&
			String(messageNode.task_id || "").trim(),
		)
	}

	private primeHttpAssistantToolOwnership(
		topicId: string,
		envelopes: RawSuperMagicMessageEnvelope[],
	) {
		const assistants = envelopes
			.map((envelope, sourceIndex) => {
				const rawNode = getRawMessageNode(envelope?.seq?.message)
				if (rawNode?.role !== "assistant") return undefined
				const superMessageId = this.normalizeAssistantSuperMessageId(
					rawNode,
					String(envelope?.seq?.message?.app_message_id || ""),
				)
				if (!superMessageId) return undefined
				return {
					rawNode: { ...rawNode, super_message_id: superMessageId },
					superMessageId,
					correlationId: String(rawNode.correlation_id || ""),
					seqId: String(envelope?.seq?.seq_id || ""),
					sourceIndex,
				}
			})
			.filter(Boolean)
			.sort((left, right) => {
				if (!left || !right) return 0
				if (left.seqId && right.seqId) {
					const order = compareMessageSeqId(left.seqId, right.seqId)
					if (order !== 0) return order
				}
				return left.sourceIndex - right.sourceIndex
			}) as Array<{
			rawNode: RawSuperMagicMessageNode
			superMessageId: string
			correlationId: string
			seqId: string
			sourceIndex: number
		}>

		assistants.forEach(({ rawNode, superMessageId, correlationId }) => {
			this.applyAssistantToolOwnership(topicId, rawNode)
			this.setStreamCorrelationId(topicId, superMessageId, correlationId)
		})
	}

	private queuePendingHttpToolResponse(
		topicId: string,
		messageNode: RawSuperMagicMessageNode,
		seqId?: unknown,
	) {
		const toolId = String(messageNode.tool?.id || "").trim()
		const correlationId = String(messageNode.correlation_id || "").trim()
		if (!toolId || !correlationId) return
		const topicPending = this.pendingHttpToolResponses.get(topicId) || new Map()
		const toolPending = topicPending.get(toolId) || new Map()
		const candidate: PendingHttpToolResponse = {
			node: messageNode,
			seqId: this.getValidToolResponseSeqId(seqId) || undefined,
			correlationId,
		}
		const current = toolPending.get(correlationId)
		if (
			current?.seqId &&
			candidate.seqId &&
			compareMessageSeqId(candidate.seqId, current.seqId) < 0
		)
			return
		toolPending.set(correlationId, candidate)
		topicPending.set(toolId, toolPending)
		this.pendingHttpToolResponses.set(topicId, topicPending)
	}

	private drainPendingHttpToolResponses(
		topicId: string,
		toolResponseMap: Map<string, ToolResponseState>,
		settlements: Array<{ toolId: string; response: ToolResponseState }>,
	) {
		const topicPending = this.pendingHttpToolResponses.get(topicId)
		if (!topicPending) return

		topicPending.forEach((correlationPending, toolId) => {
			correlationPending.forEach((candidate, correlationId) => {
				const ownerIdentity = this.getToolCallOwner(topicId, toolId)
				const ownerCorrelationId = ownerIdentity
					? this.getStreamCorrelationId(topicId, ownerIdentity)
					: ""
				if (!ownerIdentity) return
				if (ownerIdentity !== correlationId && ownerCorrelationId !== correlationId) {
					correlationPending.delete(correlationId)
					return
				}

				const result = this.recordToolResponse(
					topicId,
					candidate.node,
					candidate.seqId,
					toolResponseMap,
					"http",
				)
				if (result.kind === "recorded")
					settlements.push({ toolId, response: result.response })
				if (result.kind !== "missing_owner") correlationPending.delete(correlationId)
			})
			if (correlationPending.size === 0) topicPending.delete(toolId)
		})
		if (topicPending.size === 0) this.pendingHttpToolResponses.delete(topicId)
	}

	private settleHistoricalToolCalls(
		topicId: string,
		envelopes: RawSuperMagicMessageEnvelope[],
		toolResponseMap: Map<string, ToolResponseState>,
		settlements: Array<{ toolId: string; response: ToolResponseState }>,
	) {
		const activeStreamIds = this.getTopicMetadata(topicId).content
		const seenAssistantIds = new Set<string>()
		envelopes.forEach((envelope) => {
			const rawNode = getRawMessageNode(envelope?.seq?.message)
			if (rawNode?.role !== "assistant") return
			const superMessageId = this.normalizeAssistantSuperMessageId(
				rawNode,
				String(envelope?.seq?.message?.app_message_id || ""),
			)
			if (!superMessageId || seenAssistantIds.has(superMessageId)) return
			seenAssistantIds.add(superMessageId)
			if (activeStreamIds.has(superMessageId)) return

			const canonicalNode = this.getAssistantMessageNode(topicId, superMessageId) || rawNode
			const toolCalls = Array.isArray(canonicalNode.tool_calls)
				? (canonicalNode.tool_calls as ToolCall[])
				: []
			toolCalls.forEach((toolCall) => {
				const toolId = String(toolCall?.id || "").trim()
				if (!toolId || this.isAskUserToolCall(toolCall)) return
				const current = toolResponseMap.get(toolId)
				if (this.isHistoricalTerminalToolResponse(current)) return

				const nextState = {
					...this.mergeToolResponseState(current, {
						...(toolCall.tool || {}),
						id: toolId,
						name: toolCall.tool?.name || toolCall.function?.name || "",
						status: "response_missing",
					}),
					status: "response_missing",
				} satisfies ToolResponseState
				if (isEqual(current, nextState)) return
				toolResponseMap.set(toolId, nextState)
				settlements.push({ toolId, response: nextState })
			})
		})
	}

	private isHistoricalTerminalToolResponse(response?: ToolResponseState) {
		return (
			response?.status === "finished" ||
			response?.status === "error" ||
			response?.status === "suspended" ||
			response?.status === "response_missing"
		)
	}

	subscribe<T extends SuperMagicEventType>(
		type: T,
		callback: (event: SuperMagicEventMap[T]) => void,
		options?: SuperMagicSubscribeOptions<T>,
	) {
		return this.eventEmitter.subscribe(type, callback, options)
	}

	private getEventEntityKey(
		kind: "message" | "stream" | "tool" | "task" | "topic",
		topicId: string,
		identity: string,
	) {
		return `${kind}\u0000${topicId}\u0000${identity}`
	}

	private createEventMeta(
		source: SuperMagicEventSource,
		entityKey: string,
		identity: Omit<SuperMagicEventMeta, "occurredAt" | "revision" | "sequence" | "source">,
		revision = this.eventTransitions.nextRevision(entityKey),
	): SuperMagicEventMeta {
		return {
			...identity,
			sequence: this.eventTransitions.nextSequence(),
			revision,
			occurredAt: Date.now(),
			source,
		}
	}

	private publishStreamStarted(
		topicId: string,
		streamIdentity: string,
		chunkIndex: number,
		startsWith: SuperMagicEventMap["message.stream.started"]["payload"]["startsWith"],
		correlationId = streamIdentity,
	) {
		const streamKey = this.getEventEntityKey("stream", topicId, streamIdentity)
		const transition = this.eventTransitions.startStream(streamKey)
		if (!transition.started) return transition.generation
		// 只有新的 Assistant 首个有效正文/推理/工具 Chunk 才能作为上一条工具的
		// 执行完成屏障；heartbeat/usage metadata 不具备该业务语义。
		if (startsWith !== "metadata") {
			this.settlePreviousAssistantToolResponses(topicId, streamIdentity)
		}
		this.eventEmitter.emit({
			type: "message.stream.started",
			meta: {
				...this.createEventMeta("stream", streamKey, {
					topicId,
					correlationId,
					streamGeneration: transition.generation,
				}),
				correlationId,
				streamGeneration: transition.generation,
			},
			payload: { chunkIndex, startsWith },
		})
		return transition.generation
	}

	private publishStreamEnded(
		topicId: string,
		streamIdentity: string,
		reason: MessageStreamEndReason,
		options: {
			finishReason?: string | null
			awaitingCanonicalMessage: boolean
			replacedByGeneration?: number
		},
		source: SuperMagicEventSource = "stream",
		correlationId = streamIdentity,
	) {
		const streamKey = this.getEventEntityKey("stream", topicId, streamIdentity)
		const generation = this.eventTransitions.endStream(streamKey, reason)
		if (!generation) return
		this.eventEmitter.emit({
			type: "message.stream.ended",
			meta: {
				...this.createEventMeta(source, streamKey, {
					topicId,
					correlationId,
					streamGeneration: generation,
				}),
				correlationId,
				streamGeneration: generation,
			},
			payload: { reason, ...options },
		})
	}

	/**
	 * Canonical Final is an independent close barrier. It must still publish the
	 * `awaitingCanonicalMessage=false` edge when finish_reason already closed the
	 * transport stream, so it cannot reuse publishStreamEnded's active-stream guard.
	 */
	private publishCanonicalFinalStreamEnded(
		topicId: string,
		superMessageId: string,
		seqId: string,
		reason: MessageStreamEndReason,
		source: CanonicalFinalSource,
		correlationId: string,
	) {
		const streamKey = this.getEventEntityKey("stream", topicId, superMessageId)
		const finalKey = `${streamKey}\u0000final\u0000${seqId || "unknown"}`
		if (!this.eventTransitions.recordCanonicalFinal(finalKey)) return
		if (
			!this.eventTransitions.isStreamActive(streamKey) &&
			this.eventTransitions.getLastStreamEndReason(streamKey) === reason
		) {
			return
		}
		const generation = this.eventTransitions.ensureStreamGeneration(streamKey)
		this.eventEmitter.emit({
			type: "message.stream.ended",
			meta: {
				...this.createEventMeta(source, streamKey, {
					topicId,
					correlationId,
					streamGeneration: generation,
				}),
				correlationId,
				streamGeneration: generation,
			},
			payload: { reason, awaitingCanonicalMessage: false },
		})
	}

	private publishStreamDelta(
		topicId: string,
		streamIdentity: string,
		payload: SuperMagicEventMap["message.stream.delta"]["payload"],
		correlationId = streamIdentity,
	) {
		const streamKey = this.getEventEntityKey("stream", topicId, streamIdentity)
		const streamGeneration = this.eventTransitions.getStreamGeneration(streamKey)
		if (!streamGeneration) return
		this.eventEmitter.emit({
			type: "message.stream.delta",
			meta: {
				...this.createEventMeta("stream", streamKey, {
					topicId,
					correlationId,
					streamGeneration,
				}),
				correlationId,
				streamGeneration,
			},
			payload,
		})
	}

	private toEventMessageRef(
		message: MessageItem,
		messageNode?: RawSuperMagicMessageNode,
	): SuperMagicEventMessageRef {
		const appMessageId = String(message.app_message_id || "") || undefined
		const correlationId =
			String(message.correlation_id || messageNode?.correlation_id || "") || undefined
		const role = message.role
		const imStatus = String(message.imStatus ?? message.status ?? "")
		const superStatus =
			role === "user"
				? undefined
				: String(message.superStatus ?? messageNode?.status ?? "") || undefined
		return {
			logicalMessageId:
				role === "assistant"
					? this.getMessageSuperMessageId(message) || correlationId || appMessageId || ""
					: appMessageId || correlationId || "",
			appMessageId,
			correlationId,
			seqId: String(message.seq_id || "") || undefined,
			role,
			type: String(message.type || ""),
			imStatus,
			superStatus,
			status: imStatus,
			sendTime: Number(message.send_time || 0),
		}
	}

	private publishMessageCommitted(
		topicId: string,
		message: MessageItem,
		messageNode: RawSuperMagicMessageNode | undefined,
		source: SuperMagicEventSource,
		authority: "server" | "local" = "server",
	) {
		const messageRef = this.toEventMessageRef(message, messageNode)
		const messageKey = this.getEventEntityKey("message", topicId, messageRef.logicalMessageId)
		const transition = this.eventTransitions.recordMessage(
			messageKey,
			this.getMessageTransitionSnapshot(messageRef, messageNode),
		)
		if (!transition) return
		const revision = this.eventTransitions.nextRevision(messageKey)
		const identity = {
			topicId,
			correlationId: messageRef.correlationId,
			appMessageId: messageRef.appMessageId,
			messageSeqId: messageRef.seqId,
		}
		this.eventEmitter.emit({
			type: "message.committed",
			meta: this.createEventMeta(source, messageKey, identity, revision),
			payload: {
				message: messageRef,
				operation: transition.operation,
				authority,
				changedFields: transition.changedFields,
			},
		})
		this.publishTaskCompleted(topicId, message, messageNode, source)

		if (messageRef.role === "assistant") {
			this.observeTopicExecutionStatus(
				topicId,
				messageRef.superStatus || "",
				source,
				messageRef,
			)
		}
	}

	private getMessageTransitionSnapshot(
		messageRef: SuperMagicEventMessageRef,
		messageNode?: RawSuperMagicMessageNode,
	) {
		return {
			appMessageId: messageRef.appMessageId,
			correlationId: messageRef.correlationId,
			seqId: messageRef.seqId,
			role: messageRef.role,
			type: messageRef.type,
			imStatus: messageRef.imStatus,
			superStatus: messageRef.superStatus,
			status: messageRef.status,
			sendTime: messageRef.sendTime,
			event: messageNode?.event,
		}
	}

	private seedMessageEventState(
		topicId: string,
		message: MessageItem,
		messageNode?: RawSuperMagicMessageNode,
	) {
		const messageRef = this.toEventMessageRef(message, messageNode)
		const messageKey = this.getEventEntityKey("message", topicId, messageRef.logicalMessageId)
		this.eventTransitions.seedMessage(
			messageKey,
			this.getMessageTransitionSnapshot(messageRef, messageNode),
		)
		if (messageRef.role === "assistant") {
			const status = String(messageRef.superStatus || "")
			this.eventTransitions.seedTopicExecution(
				this.getEventEntityKey("topic", topicId, "execution"),
				status,
				this.isTopicTerminalStatus(status),
			)
		}
	}

	private isTopicTerminalStatus(status?: string): status is TopicExecutionEndedStatus {
		return Boolean(status && TERMINAL_TOPIC_TASK_STATUSES.has(status))
	}

	private observeTopicExecutionStatus(
		topicId: string,
		status: string,
		source: SuperMagicEventSource,
		message?: SuperMagicEventMessageRef,
	) {
		const transition = this.eventTransitions.recordTopicExecutionStatus(
			this.getEventEntityKey("topic", topicId, "execution"),
			status,
			this.isTopicTerminalStatus(status),
		)
		if (!transition || !this.isTopicTerminalStatus(status)) return

		const topicKey = this.getEventEntityKey("topic", topicId, "execution")
		this.eventEmitter.emit({
			type: "topic.execution.ended",
			meta: this.createEventMeta(source, topicKey, {
				topicId,
				...(message?.correlationId ? { correlationId: message.correlationId } : {}),
				...(message?.appMessageId ? { appMessageId: message.appMessageId } : {}),
				...(message?.seqId ? { messageSeqId: message.seqId } : {}),
			}),
			payload: {
				status,
				...(message ? { triggerMessage: { ...message, role: "assistant" } } : {}),
			},
		} satisfies TopicExecutionEndedEvent)
	}

	private resolveAuthoritativeStreamEndReason(status?: string): MessageStreamEndReason {
		if (status === "revoked") return "revoked"
		if (status === "suspended") return "suspended"
		return "authoritative_final"
	}

	private publishToolCallSettled(
		topicId: string,
		toolId: string,
		response: ToolResponseState,
		messageNode?: RawSuperMagicMessageNode,
		source: SuperMagicEventSource = "im",
	) {
		const status = response.status
		if (
			status !== "finished" &&
			status !== "error" &&
			status !== "suspended" &&
			status !== "response_missing"
		)
			return
		const strength = status === "response_missing" ? "weak" : "strong"
		const toolKey = this.getEventEntityKey("tool", topicId, toolId)
		if (!this.eventTransitions.recordToolSettlement(toolKey, status, strength)) return
		const correlationId = String(messageNode?.correlation_id || "") || undefined
		this.eventEmitter.emit({
			type: "toolCall.settled",
			meta: {
				...this.createEventMeta(source, toolKey, {
					topicId,
					correlationId,
					toolCallId: toolId,
				}),
				toolCallId: toolId,
			},
			payload: {
				toolCall: { id: toolId, name: response.name },
				response: {
					status: status as ToolCallSettledStatus,
					action: response.action,
					remark: response.remark,
					detail: response.detail,
				},
				strength,
				replaceable: strength === "weak",
			},
		})
	}

	private publishTaskCompleted(
		topicId: string,
		message: MessageItem,
		messageNode: RawSuperMagicMessageNode | undefined,
		source: SuperMagicEventSource,
	) {
		if (messageNode?.role !== "tool") return
		const toolId = String(messageNode.tool?.id || "").trim()
		if (
			!toolId ||
			this.getToolCallOwner(topicId, toolId) ||
			!this.isOrphanFinishTaskResponse(messageNode, toolId)
		)
			return

		const correlationId = String(messageNode.correlation_id || "").trim()
		const appMessageId = String(message.app_message_id || "").trim()
		const taskId = String(messageNode.task_id || "").trim()
		if (!correlationId || !appMessageId || !taskId) return

		const taskKey = this.getEventEntityKey("task", topicId, taskId)
		if (!this.eventTransitions.recordTaskCompleted(taskKey)) return
		this.eventEmitter.emit({
			type: "task.completed",
			meta: {
				...this.createEventMeta(source, taskKey, {
					topicId,
					correlationId,
					appMessageId,
				}),
				correlationId,
				appMessageId,
				taskId,
			},
			payload: {
				source: "finish_task",
				result: {
					detail: messageNode.tool?.detail,
					attachments: Array.isArray(messageNode.attachments)
						? messageNode.attachments
						: [],
				},
			},
		} satisfies TaskCompletedEvent)
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

	registerOnStreamRecoveryFailed(callback: (payload: StreamRecoveryFailurePayload) => void) {
		this.onStreamRecoveryFailedCallbacks.add(callback)
		return () => {
			this.onStreamRecoveryFailedCallbacks.delete(callback)
		}
	}

	private emitServerMessagesConfirmed(payload: ServerMessagesConfirmedPayload) {
		this.onServerMessagesConfirmedCallbacks.forEach((callback) => {
			callback(payload)
		})
	}

	private emitStreamRecoveryRequested(payload: StreamRecoveryRequestPayload) {
		this.onStreamRecoveryRequestedCallbacks.forEach((callback) => {
			try {
				callback(payload)
			} catch (error) {
				console.error("[SuperMagicStore] stream recovery request listener error", {
					error,
					topicId: payload.topicId,
					correlationId: payload.correlationId,
				})
			}
		})
	}

	private emitStreamRecoveryFailed(payload: StreamRecoveryFailurePayload) {
		this.onStreamRecoveryFailedCallbacks.forEach((callback) => {
			try {
				callback(payload)
			} catch (error) {
				console.error("[SuperMagicStore] stream recovery failure listener error", {
					error,
					topicId: payload.topicId,
					correlationId: payload.correlationId,
				})
			}
		})
	}

	private getTopicInactiveElapsedMs(topicMeta: TopicMeta): number {
		if (topicMeta.inactiveAt === null) return 0

		const wallElapsedMs = Math.max(Date.now() - topicMeta.inactiveAt, 0)
		if (topicMeta.inactiveMonotonicAt === null) return wallElapsedMs

		const monotonicElapsedMs = Math.max(getMonotonicNow() - topicMeta.inactiveMonotonicAt, 0)
		const clockDriftMs = Math.abs(wallElapsedMs - monotonicElapsedMs)
		return clockDriftMs <= TOPIC_LONG_ABSENCE_THRESHOLD_MS
			? Math.max(wallElapsedMs, monotonicElapsedMs)
			: monotonicElapsedMs
	}

	private enqueuePersistenceRecord(
		topicId: string,
		message: PersistableMessage,
		flushImmediately = false,
	) {
		const queue = this.persistenceQueues.get(topicId) || { messages: [], timer: null }
		queue.messages.push(message)
		this.persistenceQueues.set(topicId, queue)

		if (flushImmediately || queue.messages.length >= STREAM_PERSISTENCE_BATCH_SIZE) {
			this.flushMessagePersistence(topicId)
			return
		}
		if (queue.timer) return

		queue.timer = setTimeout(() => {
			queue.timer = null
			this.flushMessagePersistence(topicId)
		}, STREAM_PERSISTENCE_FLUSH_MS)
	}

	private queueMessagePersistence(
		topicId: string,
		message: PersistableMessage,
		flushImmediately = false,
	) {
		this.enqueuePersistenceRecord(topicId, message, flushImmediately)
	}

	/**
	 * WebSocket 原始广播必须在任何 Store 去重、revision 或 HTTP reconciliation 之前记录。
	 * 记录保留原始 payload，并用当前 Tab 的 writer sequence 还原真实交错顺序。
	 */
	recordWebSocketMessage(
		topicId: string,
		message: PersistableMessage,
		source: WebSocketRecordSource,
		flushImmediately = false,
	) {
		if (!topicId || !message || typeof message !== "object") return

		const rawMessage = message as unknown as {
			send_time?: unknown
			message?: {
				send_time?: unknown
				super_magic_message?: { send_timestamp?: unknown }
			}
			super_magic_chunk?: { created?: unknown }
			[key: string]: unknown
		}
		const sentAt =
			rawMessage.send_time ??
			rawMessage.message?.send_time ??
			rawMessage.super_magic_chunk?.created ??
			rawMessage.message?.super_magic_message?.send_timestamp
		const recordedMessage = {
			...rawMessage,
			[WEBSOCKET_RECORD_METADATA_KEY]: createWebSocketRecordMetadata(
				source,
				typeof sentAt === "number" ? sentAt : undefined,
			),
		} as PersistableMessage

		this.enqueuePersistenceRecord(topicId, recordedMessage, flushImmediately)
	}

	private flushMessagePersistence(topicId: string) {
		const queue = this.persistenceQueues.get(topicId)
		if (!queue || queue.messages.length === 0) return
		if (queue.timer) clearTimeout(queue.timer)
		this.persistenceQueues.delete(topicId)
		persistMessagesToStorage(topicId, queue.messages)
	}

	/** 报告查询前冲刷 Store 批次，并等待当前页面已提交的 IndexedDB 写入完成。 */
	async flushMessagePersistenceForReport(topicId: string): Promise<void> {
		this.flushMessagePersistence(topicId)
		await waitForMessagePersistence()
	}

	/**
	 * 设置当前可见话题。切换后自动回放已完成的流式快照（场景 2）
	 * 并恢复仍在进行中的流式渲染定时器（场景 1）。
	 */
	setActiveTopicId(topicId: string | null) {
		const prevTopicId = this.activeTopicId
		if (prevTopicId && prevTopicId !== topicId) {
			this.flushMessagePersistence(prevTopicId)
			const previousMeta = this.topicMeta.get(prevTopicId)
			if (previousMeta) {
				previousMeta.inactiveAt = Date.now()
				previousMeta.inactiveMonotonicAt = getMonotonicNow()
				if (previousMeta.timer) {
					clearTimeout(previousMeta.timer)
					previousMeta.timer = null
					previousMeta.activeRenderSuperMessageId = null
				}
				this.clearStreamRecoveryTimer(prevTopicId)
			}
			// Render-only Final projections may continue while the Topic is hidden;
			// project their canonical target immediately instead of retaining a hidden timer.
			Array.from(this.finalRenderStates.values())
				.filter((state) => state.topicId === prevTopicId)
				.forEach((state) => this.clearFinalRenderState(prevTopicId, state.superMessageId))
		}
		this.activeTopicId = topicId
		// 切换可见 Topic 会取消旧 Topic 的 render timer；若旧 Topic 的
		// authoritative Final 已经排在 buffer 中，必须立即释放这个渲染屏障，
		// 否则后台 Final 永远无法收敛 StreamState，也不会发布 Topic 终态事件。
		if (prevTopicId && prevTopicId !== topicId) {
			this.processMessageBufferAfterRenderRelease(prevTopicId)
		}
		if (topicId && topicId !== prevTopicId) {
			const topicMeta = this.getTopicMetadata(topicId)
			const inactiveElapsedMs = this.getTopicInactiveElapsedMs(topicMeta)
			topicMeta.lastActiveAt = Date.now()
			if (
				topicMeta.content.size > 0 &&
				inactiveElapsedMs >= TOPIC_LONG_ABSENCE_THRESHOLD_MS
			) {
				topicMeta.renderPolicy = "instant"
			}
			this.replayPendingSnapshots(topicId)
			this.resumeActiveStreams(topicId)
		}
	}

	/** 清理当前话题等待服务端恢复的 watchdog，避免切换话题后旧流再次唤醒。 */
	private clearStreamRecoveryTimer(topicId: string, correlationId?: string) {
		const keyPrefix = `${topicId}\u0000`
		this.streamRecoveryStates.forEach((state, key) => {
			if (!key.startsWith(keyPrefix)) return
			if (correlationId && key !== this.getStreamRecoveryKey(topicId, correlationId)) return
			if (state.watchdogTimer) clearTimeout(state.watchdogTimer)
			state.watchdogTimer = null
		})

		// Keep clearing the legacy topic slot while callers and persisted TopicMeta still expose it.
		const topicMeta = this.topicMeta.get(topicId)
		if (!topicMeta?.recoveryTimer) return
		if (correlationId && topicMeta.recoveryCorrelationId !== correlationId) return
		clearTimeout(topicMeta.recoveryTimer)
		topicMeta.recoveryTimer = null
		topicMeta.recoveryCorrelationId = null
	}

	private getStreamRecoveryKey(topicId: string, correlationId: string) {
		return `${topicId}\u0000${correlationId}`
	}

	private getTopicRecoveryCorrelationIds(topicId: string) {
		const keyPrefix = `${topicId}\u0000`
		return Array.from(this.streamRecoveryStates.keys())
			.filter((key) => key.startsWith(keyPrefix))
			.map((key) => key.slice(keyPrefix.length))
	}

	private getTopicBufferedAssistantCorrelationIds(topicId: string) {
		const buffer = this.buffer.get(topicId) as
			{ messages: RawSuperMagicMessageEnvelope[] } | undefined
		if (!buffer) return []
		return buffer.messages.flatMap((envelope) => {
			const imMessage = envelope?.seq?.message
			const rawNode = getRawMessageNode(imMessage)
			const superMessageId = this.normalizeAssistantSuperMessageId(
				rawNode,
				String(imMessage?.app_message_id || ""),
			)
			return rawNode?.role === "assistant" && superMessageId ? [superMessageId] : []
		})
	}

	private getTrackedTopicCorrelationIds(topicId: string, syncContext?: TopicSyncContext) {
		return new Set([
			...(syncContext?.correlationIds || []),
			...this.getTopicMetadata(topicId).content.keys(),
			...this.getTopicRecoveryCorrelationIds(topicId),
			...this.getTopicBufferedAssistantCorrelationIds(topicId),
		])
	}

	getStreamRecoveryState(topicId: string, identity: string): StreamRecoveryState | undefined {
		const streamIdentity = this.findStreamIdentity(topicId, identity) || identity
		const state = this.streamRecoveryStates.get(
			this.getStreamRecoveryKey(topicId, streamIdentity),
		)
		if (!state) return undefined
		return {
			status: state.status,
			...(state.reason ? { reason: state.reason } : {}),
			attempts: state.attempts,
			startedAt: state.startedAt,
			elapsedMs:
				state.status === "failed"
					? state.elapsedMs
					: Math.min(
							Math.max(Date.now() - state.startedAt, 0),
							STREAM_RECOVERY_TOTAL_BUDGET_MS,
						),
		}
	}

	private clearStreamRecoveryState(topicId: string, correlationId: string) {
		this.clearStreamRecoveryTimer(topicId, correlationId)
		const key = this.getStreamRecoveryKey(topicId, correlationId)
		const state = this.streamRecoveryStates.get(key)
		if (state?.deadlineTimer) clearTimeout(state.deadlineTimer)
		this.streamRecoveryStates.delete(key)
	}

	private armStreamRecoveryDeadline(
		topicId: string,
		correlationId: string,
		state: InternalStreamRecoveryState,
	) {
		if (state.deadlineTimer) return
		const remainingBudget = Math.max(
			STREAM_RECOVERY_TOTAL_BUDGET_MS - Math.max(Date.now() - state.startedAt, 0),
			0,
		)
		state.deadlineTimer = setTimeout(() => {
			runInAction(() => {
				const currentState = this.streamRecoveryStates.get(
					this.getStreamRecoveryKey(topicId, correlationId),
				)
				if (currentState !== state || currentState.status === "failed") return
				currentState.deadlineTimer = null
				this.failStreamRecovery(topicId, correlationId, currentState)
			})
		}, remainingBudget)
	}

	private ensureStreamRecoveryState(topicId: string, correlationId: string) {
		const key = this.getStreamRecoveryKey(topicId, correlationId)
		let state = this.streamRecoveryStates.get(key)
		if (state) return state
		state = {
			status: "waiting",
			attempts: 0,
			startedAt: Date.now(),
			elapsedMs: 0,
			failureEmitted: false,
			watchdogTimer: null,
			deadlineTimer: null,
		}
		this.streamRecoveryStates.set(key, state)
		return state
	}

	private resetStreamRecoveryState(topicId: string, correlationId: string) {
		this.clearStreamRecoveryState(topicId, correlationId)
		return this.ensureStreamRecoveryState(topicId, correlationId)
	}

	private markStreamRecoveryWaiting(topicId: string, correlationId: string) {
		const state = this.streamRecoveryStates.get(
			this.getStreamRecoveryKey(topicId, correlationId),
		)
		if (!state || state.status === "failed") return
		if (state.deadlineTimer) clearTimeout(state.deadlineTimer)
		state.deadlineTimer = null
		state.status = "waiting"
	}

	private resumeTopicAfterSync(topicId: string, correlationIds: ReadonlySet<string>) {
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicId !== this.activeTopicId || topicMeta.syncState === "syncing") return
		if (topicMeta.content.size > 0) {
			if (!topicMeta.timer) this.resumeActiveStreams(topicId)
			return
		}

		correlationIds.forEach((correlationId) => {
			const recoveryState = this.streamRecoveryStates.get(
				this.getStreamRecoveryKey(topicId, correlationId),
			)
			if (
				!recoveryState ||
				recoveryState.status === "failed" ||
				topicMeta.finalizedCorrelationIds.has(correlationId)
			)
				return
			this.scheduleStreamRecovery(topicId, correlationId, true)
		})
	}

	private releaseSupersededTopicSyncs() {
		const releasedTopics = new Map<string, Set<string>>()
		this.topicMeta.forEach((topicMeta, topicId) => {
			if (topicMeta.syncState !== "syncing") return
			const syncContext = this.topicSyncContexts.get(topicId)
			const correlationIds = this.getTrackedTopicCorrelationIds(topicId, syncContext)
			correlationIds.forEach((correlationId) => {
				this.markStreamRecoveryWaiting(topicId, correlationId)
			})
			topicMeta.syncState = "idle"
			releasedTopics.set(topicId, correlationIds)
		})
		this.pendingTopicSyncFinalizations.clear()
		this.topicSyncContexts.clear()
		return releasedTopics
	}

	private failStreamRecovery(
		topicId: string,
		streamIdentity: string,
		state: InternalStreamRecoveryState,
	) {
		if (state.status === "failed") return
		this.clearStreamRecoveryTimer(topicId, streamIdentity)
		if (state.deadlineTimer) clearTimeout(state.deadlineTimer)
		state.deadlineTimer = null
		state.status = "failed"
		state.reason = "recovery_failed"
		state.elapsedMs = Math.min(
			Math.max(Date.now() - state.startedAt, 0),
			STREAM_RECOVERY_TOTAL_BUDGET_MS,
		)
		if (state.failureEmitted) return
		state.failureEmitted = true
		this.emitStreamRecoveryFailed({
			topicId,
			correlationId: this.getStreamCorrelationId(topicId, streamIdentity),
			status: "failed",
			reason: "recovery_failed",
			attempts: state.attempts,
			startedAt: state.startedAt,
			elapsedMs: state.elapsedMs,
		})
		const gapFinal = this.getExistingStreamChunkLedger(topicId, streamIdentity)?.pendingGapFinal
		if (gapFinal) {
			// 普通未完成流保持既有失败语义；只有已经观察到 transport Final 的缺口流
			// 才结束视觉 loading，并保留最后 canonical 快照与 recovery_failed 可观测状态。
			this.closeGapFinalStreamPreservingCanonical(
				topicId,
				streamIdentity,
				gapFinal.finishReason,
				{
					preserveRecoveryFailure: true,
					awaitingCanonicalMessage: true,
				},
			)
		}
	}

	private getStreamChunkLedger(topicId: string, correlationId: string): StreamChunkLedger {
		const key = `${topicId}\u0000${correlationId}`
		let ledger = this.streamChunkLedgers.get(key)
		if (!ledger) {
			ledger = {
				nextChunkIndex: 0,
				pendingChunks: new Map(),
				reportedChoiceWarnings: new Map(),
			}
			this.streamChunkLedgers.set(key, ledger)
		}
		return ledger
	}

	private clearStreamChunkLedger(topicId: string, correlationId: string) {
		this.streamChunkLedgers.delete(`${topicId}\u0000${correlationId}`)
	}

	private getExistingStreamChunkLedger(topicId: string, streamIdentity: string) {
		return this.streamChunkLedgers.get(`${topicId}\u0000${streamIdentity}`)
	}

	/**
	 * Gap Final 只能由 Final 到达后新启动的同步代次收敛。若 Final 到达时已有请求在途，
	 * 该旧代次不会被绑定，完成后会立即再发起一次恢复，避免使用 Final 前的陈旧快照。
	 */
	private bindPendingGapFinalsToSyncGeneration(
		topicId: string,
		generation: number,
		streamIdentities: ReadonlySet<string>,
	) {
		streamIdentities.forEach((streamIdentity) => {
			const gapFinal = this.getExistingStreamChunkLedger(
				topicId,
				streamIdentity,
			)?.pendingGapFinal
			if (gapFinal && gapFinal.recoveryGeneration === undefined) {
				gapFinal.recoveryGeneration = generation
			}
		})
	}

	private getPendingGapFinalStreamIdentities(topicId: string) {
		const keyPrefix = `${topicId}\u0000`
		return Array.from(this.streamChunkLedgers.entries()).flatMap(([key, ledger]) =>
			key.startsWith(keyPrefix) && ledger.pendingGapFinal
				? [key.slice(keyPrefix.length)]
				: [],
		)
	}

	/**
	 * 权威快照已经先写入 messageMap；这里只移除 Gap Final 遗留的动画/传输状态，
	 * 绝不把缺口后的空或不完整 StreamState 反向覆盖到 canonical Assistant 节点。
	 */
	private closeGapFinalStreamPreservingCanonical(
		topicId: string,
		streamIdentity: string,
		finishReason: string,
		{
			preserveRecoveryFailure = false,
			awaitingCanonicalMessage = false,
		}: {
			preserveRecoveryFailure?: boolean
			awaitingCanonicalMessage?: boolean
		} = {},
	) {
		const topicMeta = this.getTopicMetadata(topicId)
		const correlationId = this.getStreamCorrelationId(topicId, streamIdentity)
		const wasActiveRender = topicMeta.activeRenderSuperMessageId === streamIdentity
		if (wasActiveRender) {
			if (topicMeta.timer) {
				clearTimeout(topicMeta.timer)
				topicMeta.timer = null
			}
			topicMeta.activeRenderSuperMessageId = null
		}

		topicMeta.content.delete(streamIdentity)
		topicMeta.streamSnapshots.delete(streamIdentity)
		topicMeta.finalizedCorrelationIds.add(streamIdentity)
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)

		if (!preserveRecoveryFailure) this.clearStreamRecoveryState(topicId, streamIdentity)
		this.clearStreamChunkLedger(topicId, streamIdentity)
		if (!preserveRecoveryFailure) this.clearStreamCorrelationId(topicId, streamIdentity)
		const startedStreams = this.streamRenderStarted.get(topicId)
		startedStreams?.delete(streamIdentity)
		if (startedStreams?.size === 0) this.streamRenderStarted.delete(topicId)

		this.publishStreamEnded(
			topicId,
			streamIdentity,
			"finish_reason",
			{
				finishReason: finishReason || null,
				awaitingCanonicalMessage,
			},
			"recovery",
			correlationId,
		)
		const gapFinalChunkIndex =
			this.getExistingStreamChunkLedger(topicId, streamIdentity)?.pendingGapFinal
				?.chunkIndex ?? 0
		this.setStreamTransportBarrier(topicId, streamIdentity, {
			correlationId,
			chunkIndex: gapFinalChunkIndex,
		})

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
		if (
			topicId === this.activeTopicId &&
			topicMeta.syncState !== "syncing" &&
			topicMeta.content.size > 0 &&
			!topicMeta.timer
		) {
			// Topic 共享单一渲染 timer；当前 Gap Final 退出后必须把执行权交给兄弟流。
			const nextStreamIdentity = topicMeta.content.keys().next().value
			if (nextStreamIdentity) this.startStreamRendering(topicId, nextStreamIdentity)
		}
	}

	private settleGapFinalStreamsFromAuthoritativeSnapshot(
		topicId: string,
		generation: number,
		authoritativeStreamIdentities: ReadonlySet<string>,
	) {
		this.getPendingGapFinalStreamIdentities(topicId).forEach((streamIdentity) => {
			const gapFinal = this.getExistingStreamChunkLedger(
				topicId,
				streamIdentity,
			)?.pendingGapFinal
			if (
				!gapFinal ||
				gapFinal.recoveryGeneration !== generation ||
				!authoritativeStreamIdentities.has(streamIdentity)
			)
				return

			this.closeGapFinalStreamPreservingCanonical(
				topicId,
				streamIdentity,
				gapFinal.finishReason,
			)
		})
	}

	private requestPendingGapFinalRecoveries(topicId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicId !== this.activeTopicId || topicMeta.syncState === "syncing") return

		this.getPendingGapFinalStreamIdentities(topicId).forEach((streamIdentity) => {
			const gapFinal = this.getExistingStreamChunkLedger(
				topicId,
				streamIdentity,
			)?.pendingGapFinal
			if (!gapFinal) return
			// 上一代已经结束但没有提供可用快照；下一次 beginTopicSync 必须重新绑定新代次。
			delete gapFinal.recoveryGeneration
			const recoveryState = this.ensureStreamRecoveryState(topicId, streamIdentity)
			this.clearStreamRecoveryTimer(topicId, streamIdentity)
			this.markStreamRecoveryWaiting(topicId, streamIdentity)
			// completeTopicSync 仍运行在 coordinator 的旧 in-flight 回调中；推迟到下一轮任务，
			// 确保 coordinator 已释放旧 generation 后再发布新的 recovery request。
			recoveryState.watchdogTimer = setTimeout(() => {
				runInAction(() => {
					const currentState = this.streamRecoveryStates.get(
						this.getStreamRecoveryKey(topicId, streamIdentity),
					)
					if (currentState !== recoveryState) return
					currentState.watchdogTimer = null
					if (
						currentState.status === "failed" ||
						this.getTopicMetadata(topicId).syncState === "syncing" ||
						topicId !== this.activeTopicId ||
						!this.getExistingStreamChunkLedger(topicId, streamIdentity)?.pendingGapFinal
					)
						return
					this.requestStreamRecovery(
						topicId,
						streamIdentity,
						currentState,
						this.getStreamState(topicId, streamIdentity),
					)
				})
			}, 0)
		})
	}

	/**
	 * SuperMagic 只支持候选 0。选择规则在进入正文、工具、终态和事件编排前统一执行，
	 * 避免任一分支重新退化为按数组位置读取 choices[0]。
	 */
	private selectStreamChunkChoice(messageChunk: StreamChunkPayload): StreamChunkChoiceSelection {
		const choices = Array.isArray(messageChunk?.choices)
			? (messageChunk.choices as StreamChunkChoice[])
			: []
		if (choices.length === 0) return { kind: "heartbeat" }

		if (choices.length > 1) {
			const choiceIndexes = choices.map((choice) => choice.index)
			const validPrimaryChoiceCount = choiceIndexes.filter((index) => index === 0).length
			return {
				kind: "rejected",
				warning: {
					code: "chunk-multiple-choices",
					choiceCount: choices.length,
					choiceIndexes,
				},
				shouldRecover: validPrimaryChoiceCount !== 1,
			}
		}

		const choice = choices[0]
		if (!choice) return { kind: "heartbeat" }
		if (choice.index === undefined) {
			return {
				kind: "accepted",
				choice,
				warning: { code: "chunk-choice-index-missing" },
			}
		}
		if (choice.index === 0) return { kind: "accepted", choice }

		return {
			kind: "rejected",
			warning: {
				code: "chunk-choice-index-invalid",
				choiceIndex: choice.index,
			},
			shouldRecover: true,
		}
	}

	/** 同一 Topic/SuperMessage/correlation 的同类协议异常只报告一次。 */
	private reportStreamChunkChoiceWarning(
		topicId: string,
		superMessageId: string,
		correlationId: string,
		ledger: StreamChunkLedger,
		selection: StreamChunkChoiceSelection,
	) {
		const warning = selection.kind === "heartbeat" ? undefined : selection.warning
		if (!warning) return

		const reportedCodes = ledger.reportedChoiceWarnings.get(correlationId) || new Set()
		if (reportedCodes.has(warning.code)) return
		reportedCodes.add(warning.code)
		ledger.reportedChoiceWarnings.set(correlationId, reportedCodes)

		switch (warning.code) {
			case "chunk-multiple-choices":
				console.warn("[SuperMagicStore] multiple choices ignored", {
					code: warning.code,
					topicId,
					superMessageId,
					correlationId,
					choiceCount: warning.choiceCount,
					choiceIndexes: warning.choiceIndexes,
					resolution: "ignore-choice-payload",
				})
				break
			case "chunk-choice-index-invalid":
				console.warn("[SuperMagicStore] invalid choice index", {
					code: warning.code,
					topicId,
					superMessageId,
					correlationId,
					choiceIndex: warning.choiceIndex,
					expectedChoiceIndex: 0,
					resolution: "ignore-choice-payload-and-recover",
				})
				break
			case "chunk-choice-index-missing":
				console.warn("[SuperMagicStore] missing choice index", {
					code: warning.code,
					topicId,
					superMessageId,
					correlationId,
					fallbackChoiceIndex: 0,
					resolution: "fallback-single-choice",
				})
				break
		}
	}

	/** 协议身份无法确定时复用既有恢复预算与去重状态，不直接绕过状态机发布事件。 */
	private requestInvalidChoiceRecovery(
		topicId: string,
		superMessageId: string,
		topicMeta: TopicMeta,
	) {
		if (topicId !== this.activeTopicId || topicMeta.syncState === "syncing") return
		this.clearStreamRecoveryTimer(topicId, superMessageId)
		this.requestStreamRecovery(
			topicId,
			superMessageId,
			this.ensureStreamRecoveryState(topicId, superMessageId),
			this.getStreamState(topicId, superMessageId),
		)
	}

	private requestStreamRecovery(
		topicId: string,
		streamIdentity: string,
		recoveryState: InternalStreamRecoveryState,
		streamState?: StreamState,
	) {
		if (recoveryState.status === "failed" || recoveryState.status === "recovering") return
		const elapsedMs = Math.max(Date.now() - recoveryState.startedAt, 0)
		if (
			recoveryState.attempts >= STREAM_RECOVERY_MAX_ATTEMPTS ||
			elapsedMs >= STREAM_RECOVERY_TOTAL_BUDGET_MS
		) {
			this.failStreamRecovery(topicId, streamIdentity, recoveryState)
			return
		}

		recoveryState.attempts += 1
		recoveryState.elapsedMs = elapsedMs
		recoveryState.status = "recovering"
		if (streamState) streamState.recoveryAttempts = recoveryState.attempts
		this.armStreamRecoveryDeadline(topicId, streamIdentity, recoveryState)
		this.emitStreamRecoveryRequested({
			topicId,
			correlationId: this.getStreamCorrelationId(topicId, streamIdentity),
		})
	}

	/**
	 * 渲染追平后进入等待态时启动一次 watchdog。等待态本身是正常的，只有超过阈值仍未
	 * 收到可渲染数据才请求 HTTP 权威快照，避免把“模型思考中”误判成卡死。
	 */
	private scheduleStreamRecovery(
		topicId: string,
		streamIdentity: string,
		allowMissingStreamState = false,
	) {
		const topicMeta = this.getTopicMetadata(topicId)
		const streamState = topicMeta.content.get(streamIdentity)
		if ((!streamState && !allowMissingStreamState) || streamState?.isFinalMessageReceived)
			return
		if (topicMeta.syncState === "syncing") return
		if (topicId !== this.activeTopicId) return
		const recoveryState = this.ensureStreamRecoveryState(topicId, streamIdentity)
		if (recoveryState.status === "failed") return
		if (recoveryState.status === "recovering") return
		if (recoveryState.watchdogTimer) return
		const elapsedMs = Math.max(Date.now() - recoveryState.startedAt, 0)
		if (
			recoveryState.attempts >= STREAM_RECOVERY_MAX_ATTEMPTS ||
			elapsedMs >= STREAM_RECOVERY_TOTAL_BUDGET_MS
		) {
			this.failStreamRecovery(topicId, streamIdentity, recoveryState)
			return
		}

		const recoveryDeadline = Math.min(
			STREAM_RECOVERY_TIMEOUT_MS * 2 ** recoveryState.attempts,
			STREAM_RECOVERY_MAX_BACKOFF_MS,
			STREAM_RECOVERY_TOTAL_BUDGET_MS,
		)
		// Recovery is anchored to the latest effective network/canonical progress. Rendering
		// time consumes the same budget and must not start a fresh full timeout afterwards.
		const recoveryDelay = Math.max(
			Math.min(recoveryDeadline - elapsedMs, STREAM_RECOVERY_TOTAL_BUDGET_MS - elapsedMs),
			0,
		)
		this.markStreamRecoveryWaiting(topicId, streamIdentity)
		recoveryState.watchdogTimer = setTimeout(() => {
			runInAction(() => {
				const currentStreamState = topicMeta.content.get(streamIdentity)
				const currentRecoveryState = this.streamRecoveryStates.get(
					this.getStreamRecoveryKey(topicId, streamIdentity),
				)
				if (currentRecoveryState === recoveryState) {
					currentRecoveryState.watchdogTimer = null
				}
				if (
					(!currentStreamState && !allowMissingStreamState) ||
					currentStreamState?.isFinalMessageReceived ||
					!currentRecoveryState ||
					currentRecoveryState !== recoveryState ||
					currentRecoveryState.status === "failed" ||
					topicMeta.syncState === "syncing" ||
					topicId !== this.activeTopicId
				)
					return

				// 等待阶段由 recoveryTimer 自身唤醒；真正发出 HTTP recovery 后再保留
				// 独立 deadline，确保请求悬挂时仍受 30 秒总预算约束。
				this.requestStreamRecovery(
					topicId,
					streamIdentity,
					currentRecoveryState,
					currentStreamState,
				)
			})
		}, recoveryDelay)
	}

	/**
	 * 开始一次话题权威同步。代次在所有话题间单调递增，确保 A 的旧请求在切到 B 后
	 * 即使晚返回，也无法覆盖 A/B 当前已经确认的消息视图。
	 */
	beginTopicSync(topicId: string): number {
		const releasedTopics = this.releaseSupersededTopicSyncs()
		const topicMeta = this.getTopicMetadata(topicId)
		const trackedCorrelationIds = this.getTrackedTopicCorrelationIds(topicId)
		this.clearStreamRecoveryTimer(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
			topicMeta.activeRenderSuperMessageId = null
		}
		const generation = ++this.topicSyncGenerationCounter
		topicMeta.syncGeneration = generation
		topicMeta.syncState = "syncing"
		// 同一时刻只有全局最新 generation 可写回；旧代次已在上方释放为 idle。
		this.pendingTopicSyncFinalizations.set(topicId, {
			generation,
			snapshots: new Map(),
		})
		this.bindPendingGapFinalsToSyncGeneration(topicId, generation, trackedCorrelationIds)
		this.topicSyncContexts.set(topicId, {
			generation,
			correlationIds: trackedCorrelationIds,
			authoritativeCorrelationIds: new Set(),
			didApplyAuthoritativeSnapshot: false,
		})
		releasedTopics.forEach((correlationIds, releasedTopicId) => {
			if (releasedTopicId !== topicId) {
				this.resumeTopicAfterSync(releasedTopicId, correlationIds)
			}
		})
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
		this.flushMessagePersistence(topicId)
		const pendingFinalizations = this.pendingTopicSyncFinalizations.get(topicId)
		if (pendingFinalizations?.generation === generation) {
			this.pendingTopicSyncFinalizations.delete(topicId)
		}
		const syncContext = this.topicSyncContexts.get(topicId)
		const correlationIds = this.getTrackedTopicCorrelationIds(topicId, syncContext)
		if (syncContext?.generation === generation) this.topicSyncContexts.delete(topicId)
		correlationIds.forEach((correlationId) => {
			this.markStreamRecoveryWaiting(topicId, correlationId)
		})
		this.topicSyncGenerationCounter += 1
		const topicMeta = this.getTopicMetadata(topicId)
		topicMeta.syncState = "idle"
		this.resumeTopicAfterSync(topicId, correlationIds)
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
			renderStrategy = "auto",
		}: {
			succeeded: boolean
			taskStatus?: string
			latestSeqId?: string
			renderStrategy?: TopicSyncRenderStrategy
		},
	): boolean {
		if (!this.isTopicSyncCurrent(topicId, generation)) return false

		const topicMeta = this.getTopicMetadata(topicId)
		const pendingFinalizations = this.pendingTopicSyncFinalizations.get(topicId)
		const syncContext = this.topicSyncContexts.get(topicId)
		this.pendingTopicSyncFinalizations.delete(topicId)
		this.topicSyncContexts.delete(topicId)
		this.clearStreamRecoveryTimer(topicId)
		const now = Date.now()
		const previousSyncedSeqId = topicMeta.lastSyncedSeqId
		const hasLongRecoveryGap =
			this.getTopicInactiveElapsedMs(topicMeta) >= TOPIC_LONG_ABSENCE_THRESHOLD_MS
		const hasSequenceAdvanced = Boolean(
			succeeded &&
			previousSyncedSeqId &&
			latestSeqId &&
			compareMessageSeqId(latestSeqId, previousSyncedSeqId) > 0,
		)
		const isFinishedSync = taskStatus === "finished"
		const isSuccessfulSuspendedSync = Boolean(succeeded && taskStatus === "suspended")
		const isTerminalTopic = Boolean(taskStatus && TERMINAL_TOPIC_TASK_STATUSES.has(taskStatus))
		if (isTerminalTopic) this.flushMessagePersistence(topicId)
		const hasCurrentFinalizationSnapshot = Boolean(
			succeeded && pendingFinalizations?.generation === generation,
		)

		if (renderStrategy === "foreground-instant") {
			// 浏览器重新激活是一次性的无动画恢复；startStreamRendering 会在投影后
			// 把非终态 StreamState 切回 live，不影响后续新 Chunk 的正常流式节奏。
			topicMeta.renderPolicy = "instant"
		} else if (isTerminalTopic) {
			topicMeta.renderPolicy = "instant"
		} else if (hasLongRecoveryGap) {
			topicMeta.renderPolicy = "instant"
		} else if (hasSequenceAdvanced) {
			topicMeta.renderPolicy = "catchup"
		} else {
			topicMeta.renderPolicy = "live"
		}

		if (succeeded) {
			topicMeta.lastSyncedAt = now
			if (latestSeqId) topicMeta.lastSyncedSeqId = latestSeqId
		}
		topicMeta.syncState = "idle"
		if (!isFinishedSync) {
			syncContext?.correlationIds.forEach((correlationId) => {
				this.markStreamRecoveryWaiting(topicId, correlationId)
			})
		}
		if (succeeded && syncContext?.generation === generation) {
			this.settleGapFinalStreamsFromAuthoritativeSnapshot(
				topicId,
				generation,
				syncContext.authoritativeCorrelationIds,
			)
		}

		if (hasCurrentFinalizationSnapshot && pendingFinalizations) {
			this.finalizeSynchronizedAssistantSnapshots(topicId, pendingFinalizations.snapshots)
		}

		if (isFinishedSync) {
			if (succeeded && syncContext?.generation === generation) {
				this.discardSynchronizedStreamsOutsideSnapshot(topicId, syncContext)
			}
			// HTTP finished 是普通工具缺失响应的第二个业务完成屏障；只补 canonical
			// 占位，不伪造 tool 消息或成功领域事件，迟到的真实响应仍可覆盖它。
			if (succeeded) this.fillMissingToolResponses(topicId)
			// task terminal 只结算同步开始时已存在的 correlation；同步期间到达的新任务继续运行。
			this.settleTopicStreamsInstantly(
				topicId,
				syncContext?.generation === generation ? syncContext.correlationIds : new Set(),
			)
			if (topicMeta.content.size > 0) {
				topicMeta.renderPolicy = "live"
				if (topicId === this.activeTopicId && !topicMeta.timer) {
					this.resumeActiveStreams(topicId)
				}
			}
		} else if (isSuccessfulSuspendedSync) {
			// 只有权威 topic 状态才批量结算未完成工具；单个 tool message 的 suspended
			// 只描述该工具自身，不能扩大为整个任务的中断信号。
			this.handleTopicSuspended(topicId, "recovery")
		} else if (isTerminalTopic && topicMeta.renderPolicy === "instant") {
			this.settleTopicStreamsInstantly(
				topicId,
				syncContext?.generation === generation ? syncContext.correlationIds : undefined,
			)
		} else {
			// Authoritative sync is a render barrier. Finals that depend on a local
			// StreamState must be consumed only after the generation becomes idle, so
			// startStreamRendering can create the real card/app-message alias normally.
			const buffer = this.getTopicBuffer(topicId)
			buffer.isProcessing = false
			this.processMessageBuffer(topicId)
			this.resumeTopicAfterSync(
				topicId,
				syncContext?.generation === generation
					? syncContext.correlationIds
					: new Set(topicMeta.content.keys()),
			)
		}
		if (taskStatus) {
			// Publish Topic terminal state only after the sync has settled the tracked
			// message streams; subscribers must never observe a Topic-ended event while
			// an authoritative terminal sync still exposes active StreamState entries.
			this.observeTopicExecutionStatus(topicId, taskStatus, "http")
		}
		if (!isTerminalTopic) this.requestPendingGapFinalRecoveries(topicId)
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

	private getLatestAssistantMessageForIdentity(
		messages: MessageItem[],
		appMessageId: string,
		superMessageId: string,
	) {
		return messages.reduce<MessageItem | undefined>((latest, message) => {
			if (message.role !== "assistant") return latest
			const matchesIdentity =
				(Boolean(appMessageId) && message.app_message_id === appMessageId) ||
				(Boolean(superMessageId) &&
					this.getMessageSuperMessageId(message) === superMessageId)
			if (!matchesIdentity) return latest
			if (!latest || compareMessageSeqId(message.seq_id, latest.seq_id) > 0) return message
			return latest
		}, undefined)
	}

	private upsertAuthoritativeMessage(
		messages: MessageItem[],
		incoming: MessageItem,
		options?: { allowImStatusRestore?: boolean },
	) {
		const existingIndex = messages.findIndex(
			(message) =>
				message.app_message_id === incoming.app_message_id ||
				(incoming.role === "assistant" &&
					message.role === "assistant" &&
					Boolean(this.getMessageSuperMessageId(incoming)) &&
					this.getMessageSuperMessageId(message) ===
						this.getMessageSuperMessageId(incoming)),
		)
		if (existingIndex < 0) {
			messages.push(this.normalizeMessageStatuses(incoming, incoming.debug))
			return
		}
		messages[existingIndex] = this.mergeAuthoritativeMessageCard(
			messages[existingIndex],
			incoming,
			options?.allowImStatusRestore === true,
		)
	}

	/** Final/HTTP revisions share one Assistant card by SuperMessage ID; retain the highest real seq. */
	private dedupeAuthoritativeMessages(messages: MessageItem[]) {
		const deduped: MessageItem[] = []
		messages.forEach((incoming) => {
			const incomingSuperMessageId = this.getMessageSuperMessageId(incoming)
			const existingIndex = deduped.findIndex(
				(candidate) =>
					candidate.app_message_id === incoming.app_message_id ||
					(incoming.role === "assistant" &&
						candidate.role === "assistant" &&
						incomingSuperMessageId &&
						this.getMessageSuperMessageId(candidate) === incomingSuperMessageId),
			)
			if (existingIndex < 0) {
				deduped.push(incoming)
				return
			}
			const current = deduped[existingIndex]
			if (compareMessageSeqId(incoming.seq_id, current.seq_id) >= 0) {
				deduped[existingIndex] = this.mergeAuthoritativeMessageCard(current, incoming)
			}
		})
		return deduped
	}

	private mergeAuthoritativeMessageCard(
		current: MessageItem,
		incoming: MessageItem,
		allowImStatusRestore = false,
	) {
		const normalizedIncoming = this.normalizeMessageStatuses(incoming, incoming.debug)
		const currentImStatus = String(current.imStatus ?? current.status ?? "")
		const incomingImStatus = normalizedIncoming.imStatus
		const sameImMessage =
			Boolean(current.app_message_id) &&
			Boolean(normalizedIncoming.app_message_id) &&
			current.app_message_id === normalizedIncoming.app_message_id
		if (
			sameImMessage &&
			currentImStatus === "revoked" &&
			incomingImStatus &&
			incomingImStatus !== "revoked" &&
			!allowImStatusRestore
		) {
			return {
				...normalizedIncoming,
				status: currentImStatus,
				imStatus: currentImStatus,
			}
		}
		if (!incomingImStatus) {
			return {
				...normalizedIncoming,
				status: currentImStatus,
				imStatus: currentImStatus,
			}
		}
		return normalizedIncoming
	}

	private mergeAuthoritativeMessageStatus(
		current: MessageItem,
		incoming: MessageItem,
		allowImStatusRestore = false,
	) {
		// IM 可见性状态与 Assistant 内容 revision 是两个独立状态域。
		// 普通 HTTP 快照不能把已经撤回的 IM 消息隐式恢复；只有显式取消撤回
		// 消费一次授权后，下一次 HTTP 写入才允许 revoked -> read/seen。
		const currentImStatus = String(current.imStatus ?? current.status ?? "")
		const incomingImStatus = String(incoming.imStatus ?? incoming.status ?? "")
		const hasIncomingSuperStatus = incoming.superStatus !== undefined
		const hasSuperStatusChange =
			hasIncomingSuperStatus && current.superStatus !== incoming.superStatus
		const sameImMessage =
			Boolean(current.app_message_id) &&
			Boolean(incoming.app_message_id) &&
			current.app_message_id === incoming.app_message_id
		if (!sameImMessage) {
			// `super_message_id` only identifies the logical Assistant card. It must
			// never transfer an older revision's IM status to the current app message.
			return hasSuperStatusChange
				? { ...current, superStatus: incoming.superStatus }
				: current
		}
		if (!incomingImStatus || currentImStatus === incomingImStatus) {
			return hasSuperStatusChange
				? { ...current, superStatus: incoming.superStatus }
				: current
		}
		if (
			sameImMessage &&
			currentImStatus === "revoked" &&
			incomingImStatus !== "revoked" &&
			!allowImStatusRestore
		)
			return hasSuperStatusChange
				? { ...current, superStatus: incoming.superStatus }
				: current
		return {
			...current,
			status: incomingImStatus,
			imStatus: incomingImStatus,
			...(hasSuperStatusChange ? { superStatus: incoming.superStatus } : {}),
		}
	}

	private hasAssistantPayloadConflict(
		currentNode: RawSuperMagicMessageNode | undefined,
		incomingNode: RawSuperMagicMessageNode,
	) {
		if (!currentNode || currentNode.role !== "assistant") return false
		const normalizedCurrent = this.cloneAuthoritativeAssistantSnapshot(currentNode)
		const normalizedIncoming = this.cloneAuthoritativeAssistantSnapshot(incomingNode)
		const comparableFields = ["content", "reasoning_content", "tool_calls", "status"] as const
		return comparableFields.some((field) => {
			if (!Object.prototype.hasOwnProperty.call(incomingNode, field)) return false
			return !isEqual(normalizedCurrent[field], normalizedIncoming[field])
		})
	}

	private warnAssistantSeqConflict(
		topicId: string,
		appMessageId: string,
		correlationId: string,
		seqId: string,
	) {
		console.warn("[SuperMagicStore] assistant seq conflict", {
			code: "assistant-seq-conflict",
			topicId,
			appMessageId,
			correlationId,
			seqId,
			resolution: "preserve-first-canonical",
		})
	}

	private warnAssistantAppIdentityConflict(
		topicId: string,
		appMessageId: string,
		existingCorrelationId: string,
		incomingCorrelationId: string,
	) {
		console.warn("[SuperMagicStore] assistant app identity conflict", {
			topicId,
			appMessageId,
			existingCorrelationId,
			incomingCorrelationId,
			resolution: "preserve-existing-correlation-canonical",
		})
	}

	private removeTopicMessageNodesOutsideSnapshot(
		_topicId: string,
		previousMessages: MessageItem[],
		nextMessages: MessageItem[],
	) {
		const retainedSuperMessageIds = new Set(
			nextMessages.map((message) => this.getMessageSuperMessageId(message)).filter(Boolean),
		)

		previousMessages.forEach((message) => {
			const superMessageId = this.getMessageSuperMessageId(message)
			if (!superMessageId || retainedSuperMessageIds.has(superMessageId)) return
			this.messageMap.delete(superMessageId)
		})
	}

	private getMessageNodeToolIds(messageNode: RawSuperMagicMessageNode | undefined) {
		if (!messageNode) return []
		if (messageNode.role === "tool") {
			const toolId =
				messageNode.tool &&
				typeof messageNode.tool === "object" &&
				!Array.isArray(messageNode.tool)
					? String(messageNode.tool.id || "").trim()
					: ""
			return toolId ? [toolId] : []
		}
		if (messageNode.role !== "assistant" || !Array.isArray(messageNode.tool_calls)) return []
		return messageNode.tool_calls.flatMap((toolCall) => {
			const toolId = String(toolCall?.id || "").trim()
			return toolId ? [toolId] : []
		})
	}

	private getEnvelopeIdentity(envelope: RawSuperMagicMessageEnvelope) {
		const imMessage = envelope?.seq?.message
		const messageNode = getRawMessageNode(imMessage)
		return this.normalizeAssistantSuperMessageId(
			messageNode,
			String(imMessage?.app_message_id || ""),
		)
	}

	private getPersistableIdentity(value: PersistableMessage) {
		const record = value as unknown as Record<string, unknown>
		const chunk = record.super_magic_chunk as { super_message_id?: unknown } | undefined
		if (chunk?.super_message_id) return String(chunk.super_message_id)
		const imMessage = record.message as RawSuperMagicMessageSequence["message"] | undefined
		const messageNode = getRawMessageNode(imMessage)
		return this.normalizeAssistantSuperMessageId(
			messageNode,
			String(imMessage?.app_message_id || ""),
		)
	}

	/**
	 * 权威 membership 删除必须同时收敛消息卡及其运行时派生状态。
	 * 否则旧分支即使从列表消失，也会被 buffer、晚到 Final 或工具 Map 再次投影回来。
	 */
	private removeTopicStateOutsideSnapshot(
		topicId: string,
		previousMessages: MessageItem[],
		nextMessages: MessageItem[],
		explicitlyPreservedStreamIds?: ReadonlySet<string>,
	) {
		const retainedSuperMessageIds = new Set(
			nextMessages.map((message) => this.getMessageSuperMessageId(message)).filter(Boolean),
		)
		const removedMessages = previousMessages.filter((message) => {
			const superMessageId = this.getMessageSuperMessageId(message)
			return Boolean(superMessageId && !retainedSuperMessageIds.has(superMessageId))
		})
		const removedSuperMessageIds = new Set(
			removedMessages
				.map((message) => this.getMessageSuperMessageId(message))
				.filter(Boolean),
		)
		const removedStreamSuperMessageIds = new Set(
			removedMessages.flatMap((message) =>
				message.role === "assistant" ? [this.getMessageSuperMessageId(message)] : [],
			),
		)
		if (explicitlyPreservedStreamIds !== undefined) {
			this.getTopicMetadata(topicId).content.forEach((_state, superMessageId) => {
				if (
					!retainedSuperMessageIds.has(superMessageId) &&
					!explicitlyPreservedStreamIds.has(superMessageId)
				) {
					removedSuperMessageIds.add(superMessageId)
					removedStreamSuperMessageIds.add(superMessageId)
				}
			})
		}
		if (removedSuperMessageIds.size === 0) return
		const retainedToolIds = new Set(
			nextMessages.flatMap((message) => {
				const node = this.messageMap.get(this.getMessageSuperMessageId(message)) as
					RawSuperMagicMessageNode | undefined
				return this.getMessageNodeToolIds(node)
			}),
		)
		const removedToolIds = new Set(
			removedMessages.flatMap((message) => {
				const node = this.messageMap.get(this.getMessageSuperMessageId(message)) as
					RawSuperMagicMessageNode | undefined
				return this.getMessageNodeToolIds(node)
			}),
		)
		const topicOwners = this.toolCallOwners.get(topicId)
		topicOwners?.forEach((ownerSuperMessageId, toolId) => {
			if (removedStreamSuperMessageIds.has(ownerSuperMessageId)) removedToolIds.add(toolId)
		})
		retainedToolIds.forEach((toolId) => removedToolIds.delete(toolId))

		const topicMeta = this.getTopicMetadata(topicId)
		const removedCorrelations = new Set<string>()
		const removedActiveRender = Boolean(
			topicMeta.activeRenderSuperMessageId &&
			removedStreamSuperMessageIds.has(topicMeta.activeRenderSuperMessageId),
		)
		if (removedActiveRender && topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
			topicMeta.activeRenderSuperMessageId = null
		}

		const buffer = this.getTopicBuffer(topicId)
		buffer.messages = buffer.messages.filter((envelope) => {
			const identity = this.getEnvelopeIdentity(envelope)
			const messageNode = getRawMessageNode(envelope?.seq?.message)
			const hasRemovedTool = this.getMessageNodeToolIds(messageNode).some((toolId) =>
				removedToolIds.has(toolId),
			)
			return !removedSuperMessageIds.has(identity) && !hasRemovedTool
		})
		buffer.isProcessing = false

		removedSuperMessageIds.forEach((superMessageId) => this.messageMap.delete(superMessageId))
		removedStreamSuperMessageIds.forEach((superMessageId) => {
			const correlationId = this.getStreamCorrelationId(topicId, superMessageId)
			removedCorrelations.add(correlationId)
			this.clearFinalRenderState(topicId, superMessageId)
			topicMeta.content.delete(superMessageId)
			topicMeta.streamSnapshots.delete(superMessageId)
			// Tombstone 同时阻断晚到 chunk，以及在 canonical 卡已被删除时到达的旧 Final。
			topicMeta.finalizedCorrelationIds.add(superMessageId)
			this.clearStreamRecoveryState(topicId, superMessageId)
			this.clearStreamChunkLedger(topicId, superMessageId)
			this.clearStreamCorrelationId(topicId, superMessageId)
			this.setCanonicalFinalBarrier(topicId, superMessageId, {
				seqId: "",
				appMessageId: "",
				correlationId,
			})
			this.streamRenderStarted.get(topicId)?.delete(superMessageId)
			this.pendingTopicSyncFinalizations.get(topicId)?.snapshots.delete(superMessageId)
			this.topicSyncContexts.get(topicId)?.correlationIds.delete(superMessageId)
			this.topicSyncContexts.get(topicId)?.authoritativeCorrelationIds.delete(superMessageId)
			this.publishStreamEnded(
				topicId,
				superMessageId,
				"recovery_replaced",
				{ awaitingCanonicalMessage: false },
				"http",
				correlationId,
			)
		})
		if (this.streamRenderStarted.get(topicId)?.size === 0) {
			this.streamRenderStarted.delete(topicId)
		}

		const toolResponseMap = this.toolResponseMap.get(topicId)
		const toolSeqMap = this.latestToolResponseSeqIds.get(topicId)
		const pendingHttpResponses = this.pendingHttpToolResponses.get(topicId)
		removedToolIds.forEach((toolId) => {
			toolResponseMap?.delete(toolId)
			toolSeqMap?.delete(toolId)
			topicOwners?.delete(toolId)
			pendingHttpResponses?.delete(toolId)
		})
		if (toolResponseMap?.size === 0) this.toolResponseMap.delete(topicId)
		if (toolSeqMap?.size === 0) this.latestToolResponseSeqIds.delete(topicId)
		if (topicOwners?.size === 0) this.toolCallOwners.delete(topicId)
		if (pendingHttpResponses?.size === 0) this.pendingHttpToolResponses.delete(topicId)

		const toolRecoveryMap = this.toolResponseRecoveryStates.get(topicId)
		toolRecoveryMap?.forEach((recovery, key) => {
			if (
				removedStreamSuperMessageIds.has(recovery.ownerSuperMessageId) ||
				removedToolIds.has(recovery.toolId)
			) {
				toolRecoveryMap.delete(key)
			}
		})
		this.refreshLatestRecoverableAssistant(topicId)

		const persistenceQueue = this.persistenceQueues.get(topicId)
		if (persistenceQueue) {
			persistenceQueue.messages = persistenceQueue.messages.filter(
				(value) => !removedSuperMessageIds.has(this.getPersistableIdentity(value)),
			)
			if (persistenceQueue.messages.length === 0) {
				if (persistenceQueue.timer) clearTimeout(persistenceQueue.timer)
				this.persistenceQueues.delete(topicId)
			}
		}

		const replayState = this.sharedReplayStates.get(topicId)
		if (
			replayState?.pendingAssistant &&
			removedCorrelations.has(replayState.pendingAssistant.correlationId)
		) {
			replayState.pendingAssistant = undefined
		}

		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)
		if (
			removedActiveRender &&
			topicId === this.activeTopicId &&
			topicMeta.content.size > 0 &&
			!topicMeta.timer
		) {
			const nextSuperMessageId = topicMeta.content.keys().next().value
			if (nextSuperMessageId) this.startStreamRendering(topicId, nextSuperMessageId)
		}
	}

	/**
	 * 完整成功的 terminal HTTP 快照不会保留快照外的旧流。只丢弃同步开始时已经
	 * 存在且本次快照未确认的 correlation；同步期间新启动的任务不受影响。
	 */
	private discardSynchronizedStreamsOutsideSnapshot(
		topicId: string,
		syncContext: TopicSyncContext,
	) {
		if (!syncContext.didApplyAuthoritativeSnapshot) return
		const discardedStreamIdentities = new Set(
			Array.from(syncContext.correlationIds).filter(
				(streamIdentity) => !syncContext.authoritativeCorrelationIds.has(streamIdentity),
			),
		)
		if (discardedStreamIdentities.size === 0) return

		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
			topicMeta.activeRenderSuperMessageId = null
		}

		const previousMessages = this.messages.get(topicId) || []
		const retainedMessages = previousMessages.filter(
			(message) =>
				!(
					message.role === "assistant" &&
					message.topic_id === topicId &&
					discardedStreamIdentities.has(this.getMessageSuperMessageId(message))
				),
		)
		this.removeTopicMessageNodesOutsideSnapshot(topicId, previousMessages, retainedMessages)
		this.messages.set(topicId, retainedMessages)

		const buffer = this.getTopicBuffer(topicId)
		buffer.messages = buffer.messages.filter((envelope) => {
			const imMessage = envelope?.seq?.message
			const rawNode = getRawMessageNode(imMessage)
			const superMessageId = this.normalizeAssistantSuperMessageId(
				rawNode,
				String(imMessage?.app_message_id || ""),
			)
			if (!discardedStreamIdentities.has(superMessageId)) return true

			this.messageMap.delete(superMessageId)
			return false
		})
		buffer.isProcessing = false

		const discardedCorrelationIds = new Map<string, string>()
		discardedStreamIdentities.forEach((streamIdentity) => {
			const correlationId = this.getStreamCorrelationId(topicId, streamIdentity)
			discardedCorrelationIds.set(streamIdentity, correlationId)
			this.messageMap.delete(streamIdentity)
			topicMeta.content.delete(streamIdentity)
			topicMeta.streamSnapshots.delete(streamIdentity)
			topicMeta.finalizedCorrelationIds.add(streamIdentity)
			this.clearStreamRecoveryState(topicId, streamIdentity)
			this.clearStreamChunkLedger(topicId, streamIdentity)
			this.clearStreamCorrelationId(topicId, streamIdentity)
			this.setStreamTransportBarrier(topicId, streamIdentity, {
				correlationId,
				chunkIndex: 0,
			})
		})

		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)
		discardedStreamIdentities.forEach((streamIdentity) => {
			this.publishStreamEnded(
				topicId,
				streamIdentity,
				"recovery_replaced",
				{ awaitingCanonicalMessage: false },
				"recovery",
				discardedCorrelationIds.get(streamIdentity) || streamIdentity,
			)
		})
	}

	private applyHttpMessageStatusesInAction(
		topicId: string,
		currentMessages: MessageItem[],
		statusMessages: RawSuperMagicMessageEnvelope[],
		allowImStatusRestore: boolean,
	) {
		const nextMessages = currentMessages.slice()
		const committedUpdates: Array<{
			message: MessageItem
			node?: RawSuperMagicMessageNode
		}> = []
		let didChange = false
		let settledStream = false

		statusMessages.forEach((envelope) => {
			const imMessage = envelope?.seq?.message
			const rawNode = getRawMessageNode(imMessage)
			const appMessageId = String(imMessage?.app_message_id || "")
			const superMessageId = this.normalizeAssistantSuperMessageId(rawNode, appMessageId)
			const incomingMessage = this.normalizeAssistantMessageItem(
				transformRawMessage(envelope?.seq as RawSuperMagicMessageSequence),
				rawNode,
				appMessageId,
			)
			const incomingStatus = String(incomingMessage.imStatus || incomingMessage.status || "")
			if (!appMessageId || !incomingStatus) return

			// IM 状态只能由同一 topic 下同一 app_message_id 的消息写入。
			// 唯一例外是仍在活动流中的 Assistant 占位卡：先用 SuperMessage
			// 找到占位卡，再由真实 app_message_id 收敛其持久身份。
			let existingIndex = nextMessages.findIndex(
				(message) => message.app_message_id === appMessageId,
			)
			const streamKey =
				rawNode?.role === "assistant" && superMessageId
					? this.getEventEntityKey("stream", topicId, superMessageId)
					: ""
			const superMessageIndex =
				existingIndex < 0 && rawNode?.role === "assistant" && superMessageId
					? nextMessages.findIndex(
							(message) =>
								message.role === "assistant" &&
								this.getMessageSuperMessageId(message) === superMessageId,
						)
					: -1
			const isActiveStreamPlaceholder =
				existingIndex < 0 &&
				superMessageIndex >= 0 &&
				Boolean(streamKey) &&
				this.eventTransitions.isStreamActive(streamKey)
			if (isActiveStreamPlaceholder) existingIndex = superMessageIndex
			if (existingIndex < 0) return

			const currentMessage = nextMessages[existingIndex]
			// 非撤回 Final 仍由 membership/enqueue 一次性完成真实身份和正文结算，
			// 避免状态观察阶段先发布一个仅按占位卡命中的重复 committed 事件。
			if (isActiveStreamPlaceholder && incomingStatus !== "revoked" && !allowImStatusRestore)
				return

			// 只先收敛真实 app_message_id，不复制 Final 的 seq/content 元数据；
			// membership 阶段仍需把这条消息视为高于本地占位 revision，才能让
			// authoritative Assistant node 进入 terminal merge，而不是被误判为 same。
			const reconciledCurrentMessage = isActiveStreamPlaceholder
				? { ...currentMessage, app_message_id: appMessageId }
				: currentMessage
			const currentImStatus = String(
				reconciledCurrentMessage.imStatus ?? reconciledCurrentMessage.status ?? "",
			)
			if (
				currentImStatus === "revoked" &&
				incomingStatus !== "revoked" &&
				!allowImStatusRestore
			)
				return

			const hasImStatusChange = currentImStatus !== incomingStatus
			const updatedMessage = hasImStatusChange
				? {
						...reconciledCurrentMessage,
						status: incomingStatus,
						imStatus: incomingStatus,
					}
				: reconciledCurrentMessage
			if (updatedMessage !== currentMessage) {
				nextMessages[existingIndex] = updatedMessage
				didChange = true
				if (hasImStatusChange) {
					committedUpdates.push({
						message: updatedMessage,
						node:
							currentMessage.role === "assistant"
								? this.getAssistantMessageNode(topicId, superMessageId)
								: (this.messageMap.get(
										this.getMessageSuperMessageId(updatedMessage),
									) as RawSuperMagicMessageNode | undefined),
					})
				}
			}

			if (rawNode?.role === "assistant" && incomingStatus === "revoked" && superMessageId) {
				const correlationId = String(
					rawNode.correlation_id || currentMessage.correlation_id || "",
				)
				const currentNode = this.getAssistantMessageNode(topicId, superMessageId)
				const wasStreamActive = this.eventTransitions.isStreamActive(streamKey)
				const didSettleCurrentStream = this.reconcileServerAssistantSnapshot(
					topicId,
					appMessageId,
					superMessageId,
					correlationId,
					currentNode || rawNode,
					{
						seqId: String(envelope?.seq?.seq_id || ""),
						finalMessage: updatedMessage,
						revisionDecision: "same",
						source: "http",
					},
				)
				settledStream = didSettleCurrentStream || settledStream
				if (wasStreamActive) {
					this.publishCanonicalFinalStreamEnded(
						topicId,
						superMessageId,
						String(envelope?.seq?.seq_id || ""),
						"revoked",
						"http",
						correlationId,
					)
				}
			}
		})

		return { nextMessages, committedUpdates, didChange, settledStream }
	}

	private resumeAfterHttpStatusReconciliation(topicId: string, settledStream: boolean) {
		if (!settledStream) return
		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicId === this.activeTopicId && topicMeta.content.size > 0 && !topicMeta.timer) {
			const nextSuperMessageId = topicMeta.content.keys().next().value
			if (nextSuperMessageId) this.startStreamRendering(topicId, nextSuperMessageId)
		}
	}

	/**
	 * HTTP 增量窗口只对“响应中明确返回的消息”更新外层状态，不拥有窗口外 membership。
	 */
	reconcileHttpMessageStatuses(topicId: string, messages: RawSuperMagicMessageEnvelope[]) {
		const currentMessages = this.messages.get(topicId) || []
		if (currentMessages.length === 0 || messages.length === 0) return
		const allowImStatusRestore = this.consumeImStatusRestoreAuthorization(topicId, true)
		let committedUpdates: Array<{
			message: MessageItem
			node?: RawSuperMagicMessageNode
		}> = []
		let settledStream = false
		runInAction(() => {
			const result = this.applyHttpMessageStatusesInAction(
				topicId,
				currentMessages,
				messages,
				allowImStatusRestore,
			)
			if (result.didChange) this.messages.set(topicId, sortMessages(result.nextMessages))
			committedUpdates = result.committedUpdates
			settledStream = result.settledStream
			this.resumeAfterHttpStatusReconciliation(topicId, settledStream)
		})
		committedUpdates.forEach(({ message, node }) => {
			this.publishMessageCommitted(topicId, message, node, "http")
		})
	}

	/**
	 * 统一 HTTP 写入入口：状态观察集与 membership 快照来自同一次成功查询，
	 * 并在同一 MobX action 内提交。普通增量仍保留 enqueueMessage 的流式语义。
	 */
	reconcileAuthoritativeMessages(
		topicId: string,
		{ statusItems, membershipItems, writeOptions }: ReconcileAuthoritativeMessagesInput,
	) {
		if (writeOptions.mode !== "incremental") {
			this.initializeMessages(topicId, membershipItems, {
				...writeOptions,
				statusMessages: statusItems,
			})
			return
		}

		// Incremental HTTP is still authoritative for the returned tail. It must use the
		// HTTP reconcile path directly; routing those envelopes through enqueueMessage would
		// reintroduce IM buffering and make Final settlement depend on render timers.
		this.initializeMessages(topicId, membershipItems, {
			mode: "merge",
			statusMessages: statusItems,
			eventPolicy: "live_arrival",
			toolProjectionPolicy: "preserve_live",
		})
	}

	/**
	 * @description 写入 HTTP 消息；默认以完整快照替换，历史分页必须显式使用 merge。
	 * @param topicId 话题id
	 * @param messages 消息列表
	 */
	initializeMessages(
		topicId: string,
		messages: RawSuperMagicMessageEnvelope[],
		{
			mode = "replace",
			toolProjectionPolicy = "historical_terminal",
			eventPolicy = "silent_hydration",
			statusMessages,
			anchorSuperMessageId,
			preserveStreamSuperMessageIds,
			syncGeneration,
		}: InitializeMessagesOptions = {},
	) {
		const allowImStatusRestore = this.consumeImStatusRestoreAuthorization(
			topicId,
			(statusMessages?.length || messages.length) > 0,
		)
		let previousMessages = (this.messages.get(topicId) || []).slice()
		const statusCommittedUpdates: Array<{
			message: MessageItem
			node?: RawSuperMagicMessageNode
		}> = []
		const httpToolSettlements: Array<{
			toolId: string
			response: ToolResponseState
		}> = []
		const tailAnchorIndex =
			mode === "replace_tail" && anchorSuperMessageId
				? previousMessages.findIndex(
						(message) =>
							this.getMessageSuperMessageId(message) === anchorSuperMessageId,
					)
				: -1
		const topicBuffer = this.getTopicBuffer(topicId)
		const syncTopicMeta = this.getTopicMetadata(topicId)
		const explicitlyPreservedStreamIds = preserveStreamSuperMessageIds
			? new Set(preserveStreamSuperMessageIds)
			: undefined
		const previousToolResponses = new Map(this.toolResponseMap.get(topicId) || [])
		const activeEventStreamIdentities = new Set(
			(messages || []).flatMap((envelope) => {
				const imMessage = envelope?.seq?.message
				const rawNode = getRawMessageNode(imMessage)
				const superMessageId = this.normalizeAssistantSuperMessageId(
					rawNode,
					String(imMessage?.app_message_id || ""),
				)
				if (!superMessageId) return []
				const streamKey = this.getEventEntityKey("stream", topicId, superMessageId)
				return this.eventTransitions.isStreamActive(streamKey) ? [superMessageId] : []
			}),
		)
		// 冷历史先写入 ledger 作为后续 revision 的比较基线，但流式占位卡不属于 committed 事实。
		previousMessages.forEach((message) => {
			const superMessageId = this.getMessageSuperMessageId(message)
			if (
				message.role === "assistant" &&
				superMessageId &&
				activeEventStreamIdentities.has(superMessageId)
			)
				return
			const node = this.messageMap.get(superMessageId) as RawSuperMagicMessageNode | undefined
			this.seedMessageEventState(topicId, message, node)
		})
		const pendingFinalizations = this.pendingTopicSyncFinalizations.get(topicId)
		const syncContext = this.topicSyncContexts.get(topicId)
		const currentSyncFinalizations =
			syncTopicMeta.syncState === "syncing" &&
			pendingFinalizations?.generation === syncTopicMeta.syncGeneration &&
			(syncGeneration === undefined || syncGeneration === syncTopicMeta.syncGeneration)
				? pendingFinalizations
				: undefined
		const currentSyncContext =
			syncTopicMeta.syncState === "syncing" &&
			syncContext?.generation === syncTopicMeta.syncGeneration
				? syncContext
				: undefined
		const authoritativeSyncContext =
			mode === "replace" &&
			currentSyncContext &&
			(syncGeneration === undefined || syncGeneration === currentSyncContext.generation)
				? currentSyncContext
				: undefined
		// A stale response still participates in per-message version arbitration, but it no
		// longer owns replacement/deletion or the current generation's snapshot membership.
		// live_arrival 只证明本次 HTTP 返回的节点已经持久化，不证明它覆盖完整 Topic。
		// 即使调用方误传 replace，也必须保留快照外历史；完整恢复继续使用 silent_hydration。
		const requestedMode =
			(mode === "replace_tail" && tailAnchorIndex < 0) ||
			(mode === "replace" && eventPolicy === "live_arrival")
				? "merge"
				: mode
		const appliedMode =
			requestedMode === "replace" && syncGeneration !== undefined && !authoritativeSyncContext
				? "merge"
				: requestedMode
		if (authoritativeSyncContext) {
			authoritativeSyncContext.authoritativeCorrelationIds.clear()
			authoritativeSyncContext.didApplyAuthoritativeSnapshot = true
		}
		const incomingAppMessageIds: string[] = []
		console.log("API 拉取的消息列表", messages)
		const bufferedMessageIds = new Set(
			topicBuffer.messages.map((item) => item?.seq?.message?.app_message_id),
		)
		runInAction(() => {
			const statusResult = this.applyHttpMessageStatusesInAction(
				topicId,
				previousMessages,
				statusMessages || messages,
				allowImStatusRestore,
			)
			previousMessages = statusResult.nextMessages
			statusCommittedUpdates.push(...statusResult.committedUpdates)
			const snapshotMessages = (messages || []).slice()
			// HTTP order is a transport presentation detail. Prime ownership before recording
			// any Tool response, including preserve_live authoritative-tail batches; a live
			// projection must not lose a real response merely because Tool precedes Assistant.
			this.primeHttpAssistantToolOwnership(topicId, snapshotMessages)
			const snapshotLatestSeqId = snapshotMessages.reduce((latestSeqId, envelope) => {
				const currentSeqId = String(envelope?.seq?.seq_id || "")
				if (!currentSeqId) return latestSeqId
				if (!latestSeqId || compareMessageSeqId(currentSeqId, latestSeqId) > 0) {
					return currentSeqId
				}
				return latestSeqId
			}, "")
			const authoritativeMessages: MessageItem[] =
				appliedMode === "merge"
					? previousMessages.slice()
					: appliedMode === "replace_tail"
						? previousMessages.slice(0, tailAnchorIndex + 1)
						: []
			const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
			let settledStream = statusResult.settledStream
			snapshotMessages.forEach((envelope) => {
				const imMessage = envelope?.seq?.message
				const normalizedRawNode = getRawMessageNode(imMessage)
				const superMessageId = this.normalizeAssistantSuperMessageId(
					normalizedRawNode,
					String(imMessage?.app_message_id || ""),
				)
				const rawNode = this.applyAssistantToolOwnership(topicId, normalizedRawNode)
				const messageType = String(imMessage?.type || "")
				const appMessageId = imMessage?.app_message_id as string
				const correlationId = String(rawNode?.correlation_id || "")
				const incomingMessage: MessageItem = this.normalizeAssistantMessageItem(
					transformRawMessage(envelope?.seq as RawSuperMagicMessageSequence),
					rawNode,
					appMessageId,
				)
				if (rawNode?.role === "assistant" && superMessageId) {
					incomingMessage.super_message_id = superMessageId
					rawNode.super_message_id = superMessageId
					this.setStreamCorrelationId(topicId, superMessageId, correlationId)
				}
				// 针对客户端的工具调用消息直接过滤
				if (incomingMessage?.type === "user_tool_call") {
					if (appMessageId) incomingAppMessageIds.push(appMessageId)
					return
				}

				if (rawNode?.role === "assistant" && appMessageId && superMessageId) {
					const existingAppMessage = this.getLatestAssistantMessageForIdentity(
						[...previousMessages, ...authoritativeMessages],
						appMessageId,
						superMessageId,
					)
					if (
						existingAppMessage?.app_message_id === appMessageId &&
						existingAppMessage?.correlation_id &&
						existingAppMessage.correlation_id !== correlationId
					) {
						// app_message_id owns the IM state, while super_message_id owns the
						// logical Assistant card. A correlation change is therefore a revision,
						// not an identity conflict that can reject the incoming snapshot.
						this.warnAssistantAppIdentityConflict(
							topicId,
							appMessageId,
							existingAppMessage.correlation_id,
							correlationId,
						)
					}
					authoritativeSyncContext?.authoritativeCorrelationIds.add(superMessageId)

					const revisionMessages = [...previousMessages, ...authoritativeMessages]
					const revisionDecision = this.getAssistantRevisionDecision(
						topicId,
						appMessageId,
						superMessageId,
						envelope?.seq?.seq_id,
						revisionMessages,
					)
					const currentNode = this.messageMap.get(superMessageId) as
						RawSuperMagicMessageNode | undefined
					const isAuthoritativeAssistantFinal =
						rawNode.role === "assistant" && messageType === "super_magic_message"
					if (revisionDecision === "same" || revisionDecision === "stale") {
						if (appMessageId) incomingAppMessageIds.push(appMessageId)
						const currentMessage = this.getLatestAssistantMessageForIdentity(
							revisionMessages,
							appMessageId,
							superMessageId,
						)
						if (currentMessage) {
							this.upsertAuthoritativeMessage(
								authoritativeMessages,
								this.mergeAuthoritativeMessageStatus(
									currentMessage,
									incomingMessage,
									allowImStatusRestore,
								),
								{ allowImStatusRestore },
							)
						}
						if (revisionDecision === "same") {
							if (this.hasAssistantPayloadConflict(currentNode, rawNode)) {
								this.warnAssistantSeqConflict(
									topicId,
									appMessageId,
									correlationId,
									String(envelope?.seq?.seq_id || ""),
								)
							}
						}
						if (
							revisionDecision === "same" &&
							isAuthoritativeAssistantFinal &&
							currentNode?.role === "assistant"
						) {
							const wasStreamActive = this.eventTransitions.isStreamActive(
								this.getEventEntityKey("stream", topicId, superMessageId),
							)
							// Same-revision Final owns this stream generation. A stale Final may
							// update its own IM status, but cannot close a higher revision already known locally.
							settledStream =
								this.reconcileServerAssistantSnapshot(
									topicId,
									appMessageId,
									superMessageId,
									correlationId,
									currentNode,
									{
										seqId: String(envelope?.seq?.seq_id || ""),
										finalMessage: incomingMessage,
										revisionDecision: this.getAssistantRevisionDecision(
											topicId,
											appMessageId,
											superMessageId,
											envelope?.seq?.seq_id,
										),
										source: "http",
									},
								) || settledStream
							if (wasStreamActive) {
								this.publishCanonicalFinalStreamEnded(
									topicId,
									superMessageId,
									String(envelope?.seq?.seq_id || ""),
									"revoked" === incomingMessage.imStatus
										? "revoked"
										: "authoritative_final",
									"http",
									correlationId,
								)
							}
						}
						return
					}
				}
				if (appMessageId) incomingAppMessageIds.push(appMessageId)

				if (
					(!bufferedMessageIds.has(appMessageId) || rawNode?.role === "assistant") &&
					rawNode?.event !== "before_llm_request"
				) {
					this.upsertAuthoritativeMessage(authoritativeMessages, incomingMessage, {
						allowImStatusRestore,
					})
				}
				if (messageType === "super_magic_message") {
					const toolResponseResult = this.recordToolResponse(
						topicId,
						rawNode,
						envelope?.seq?.seq_id,
						toolResponseMap,
						"http",
					)
					if (toolResponseResult.kind === "recorded") {
						httpToolSettlements.push({
							toolId: String(rawNode?.tool?.id || ""),
							response: toolResponseResult.response,
						})
					} else if (toolResponseResult.kind === "missing_owner" && rawNode) {
						this.queuePendingHttpToolResponse(topicId, rawNode, envelope?.seq?.seq_id)
					}
				}

				if (rawNode && rawNode.role !== "assistant") {
					this.setNonAssistantMessageNode(
						topicId,
						incomingMessage.super_message_id,
						rawNode,
					)
				}
				if (rawNode?.role === "assistant" && appMessageId && superMessageId) {
					const isRevokedAssistant = incomingMessage.imStatus === "revoked"
					const didSettleStream = this.reconcileServerAssistantSnapshot(
						topicId,
						appMessageId,
						superMessageId,
						correlationId,
						rawNode,
						{
							seqId: String(envelope?.seq?.seq_id || ""),
							finalMessage: incomingMessage,
							revisionDecision: this.getAssistantRevisionDecision(
								topicId,
								appMessageId,
								superMessageId,
								envelope?.seq?.seq_id,
							),
							source: "http",
						},
					)
					const canonicalAssistantNode = this.getAssistantMessageNode(
						topicId,
						superMessageId,
					)
					if (canonicalAssistantNode) {
						this.upsertAuthoritativeMessage(
							authoritativeMessages,
							this.normalizeAssistantMessageItem(
								incomingMessage,
								canonicalAssistantNode,
								appMessageId,
							),
						)
					}
					if (!isRevokedAssistant) {
						const canonicalNode = this.messageMap.get(superMessageId) as
							RawSuperMagicMessageNode | undefined
						// Finalization must retain the already-reconciled nested tool fields;
						// storing the raw HTTP payload here would erase inherited arguments later.
						const topicCanonicalNode =
							canonicalNode?.role === "assistant" &&
							canonicalNode.correlation_id === correlationId &&
							canonicalNode.topic_id === topicId
								? canonicalNode
								: undefined
						currentSyncFinalizations?.snapshots.set(superMessageId, {
							appMessageId,
							node: this.cloneAuthoritativeAssistantSnapshot(
								topicCanonicalNode || rawNode,
							),
						})
					}
					settledStream = didSettleStream || settledStream
				}
			})

			this.drainPendingHttpToolResponses(topicId, toolResponseMap, httpToolSettlements)
			if (toolProjectionPolicy === "historical_terminal") {
				this.settleHistoricalToolCalls(
					topicId,
					snapshotMessages,
					toolResponseMap,
					httpToolSettlements,
				)
			}

			// HTTP 快照不包含仍在本地流式生成、尚未具备服务端终态的占位卡时，
			// 该临时卡作为本地 overlay 保留。WS/IM 已持久落地且 seq 高于本次快照
			// 水位的消息同样属于并发增量，不能被稍早生成的 authoritative 响应删除。
			if (appliedMode !== "merge")
				previousMessages.forEach((message, messageIndex) => {
					const messageSuperMessageId = this.getMessageSuperMessageId(message)
					const hasSnapshotIdentity = authoritativeMessages.some(
						(candidate) =>
							candidate.app_message_id === message.app_message_id ||
							(Boolean(messageSuperMessageId) &&
								candidate.role === "assistant" &&
								this.getMessageSuperMessageId(candidate) === messageSuperMessageId),
					)
					if (hasSnapshotIdentity) return

					const isStreamingMessage = Boolean(
						message.role === "assistant" &&
						messageSuperMessageId &&
						syncTopicMeta.content.has(messageSuperMessageId),
					)
					const precedingUserMessage = isStreamingMessage
						? previousMessages
								.slice(0, messageIndex)
								.reverse()
								.find((candidate) => candidate.role === "user")
						: undefined
					const hasRetainedTurnUser = Boolean(
						precedingUserMessage &&
						authoritativeMessages.some(
							(candidate) =>
								this.getMessageSuperMessageId(candidate) ===
								this.getMessageSuperMessageId(precedingUserMessage),
						),
					)
					const isStreamingOverlay = Boolean(
						isStreamingMessage &&
						(explicitlyPreservedStreamIds === undefined ||
							explicitlyPreservedStreamIds.has(messageSuperMessageId) ||
							hasRetainedTurnUser),
					)
					const isNewerPersistentMessage = Boolean(
						snapshotLatestSeqId &&
						message.seq_id &&
						compareMessageSeqId(message.seq_id, snapshotLatestSeqId) > 0,
					)
					if (isStreamingOverlay || isNewerPersistentMessage) {
						this.upsertAuthoritativeMessage(authoritativeMessages, message)
					}
				})
			// Clean up local sidecars.
			this.emitServerMessagesConfirmed({
				chat_topic_id: topicId,
				app_message_ids: incomingAppMessageIds,
			})

			const mergedServerMessages = sortMessages(
				this.dedupeAuthoritativeMessages(authoritativeMessages),
			)
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
			if (appliedMode !== "merge") {
				this.removeTopicStateOutsideSnapshot(
					topicId,
					previousMessages,
					mergedServerMessages,
					explicitlyPreservedStreamIds,
				)
			}
			if (settledStream) {
				// 服务端快照已解除流式回压；继续消费已在后台排队的 tool 响应，
				// 同时由 processMessageBuffer 跳过已确认终态的重复 assistant 消息。
				const buffer = this.getTopicBuffer(topicId)
				buffer.isProcessing = false
				// During an authoritative generation, completeTopicSync owns the release
				// order. Processing here would hit the sync render barrier before the real
				// Assistant identity/card has been established.
				if (syncTopicMeta.syncState !== "syncing") {
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
			}
		})
		httpToolSettlements.forEach(({ toolId, response }) => {
			if (toolId) this.publishToolCallSettled(topicId, toolId, response, undefined, "http")
		})
		if (toolProjectionPolicy === "historical_terminal") {
			// Refresh/history hydration can be the only signal after a missed Tool WS event;
			// re-enter the same Topic coordinator without inventing a stronger Tool result.
			const pendingToolRecovery = this.getToolResponseRecoveryRequest(topicId)
			if (pendingToolRecovery) this.emitStreamRecoveryRequested(pendingToolRecovery)
		}

		const previousAppMessageIds = new Set(
			previousMessages.map((message) => message.app_message_id).filter(Boolean),
		)
		const previousAssistantSuperMessageIds = new Set(
			previousMessages.flatMap((message) =>
				message.role === "assistant" && this.getMessageSuperMessageId(message)
					? [this.getMessageSuperMessageId(message)]
					: [],
			),
		)
		;(messages || []).forEach((envelope) => {
			const imMessage = envelope?.seq?.message
			const rawNode = getRawMessageNode(imMessage)
			const appMessageId = String(imMessage?.app_message_id || "")
			const superMessageId = this.normalizeAssistantSuperMessageId(rawNode, appMessageId)
			const correlationId = String(rawNode?.correlation_id || "")
			const currentMessage = (this.messages.get(topicId) || []).find(
				(message) =>
					message.app_message_id === appMessageId ||
					(Boolean(superMessageId) &&
						message.role === "assistant" &&
						this.getMessageSuperMessageId(message) === superMessageId),
			)
			if (!currentMessage) return
			const canonicalNode = (this.messageMap.get(
				this.getMessageSuperMessageId(currentMessage),
			) || rawNode) as RawSuperMagicMessageNode | undefined
			const settledActiveStream = Boolean(
				superMessageId && activeEventStreamIdentities.has(superMessageId),
			)
			const updatedExistingMessage = Boolean(
				previousAppMessageIds.has(currentMessage.app_message_id) ||
				(currentMessage.role === "assistant" &&
					this.getMessageSuperMessageId(currentMessage) &&
					previousAssistantSuperMessageIds.has(
						this.getMessageSuperMessageId(currentMessage),
					)),
			)

			if (
				rawNode?.role === "assistant" &&
				(eventPolicy === "live_arrival" || settledActiveStream)
			) {
				this.publishCanonicalFinalStreamEnded(
					topicId,
					superMessageId,
					String(envelope?.seq?.seq_id || ""),
					currentMessage.imStatus === "revoked"
						? "revoked"
						: canonicalNode?.status === "suspended"
							? "suspended"
							: "authoritative_final",
					"http",
					correlationId,
				)
			}
			if (eventPolicy === "live_arrival" || settledActiveStream || updatedExistingMessage) {
				this.publishMessageCommitted(topicId, currentMessage, canonicalNode, "http")
			} else {
				this.seedMessageEventState(topicId, currentMessage, canonicalNode)
			}

			if (rawNode?.role === "tool") {
				const toolId =
					rawNode.tool && typeof rawNode.tool === "object" && !Array.isArray(rawNode.tool)
						? String(rawNode.tool.id || "").trim()
						: ""
				const response = toolId ? this.toolResponseMap.get(topicId)?.get(toolId) : undefined
				const previousResponse = toolId ? previousToolResponses.get(toolId) : undefined
				const updatedExistingTool = Boolean(
					previousResponse && response && !isEqual(previousResponse, response),
				)
				if (response && (settledActiveStream || updatedExistingTool)) {
					this.publishToolCallSettled(topicId, toolId, response, rawNode, "http")
				}
			}
		})

		// 状态观察集可能包含被 SuperMessage 公共锚点截断的 User/Tool；
		// 这些消息不在本次 membership loop 中，但其 IM 状态仍已进入 canonical。
		const membershipAppMessageIds = new Set(
			(messages || []).map((envelope) =>
				String(envelope?.seq?.message?.app_message_id || ""),
			),
		)
		statusCommittedUpdates.forEach(({ message, node }) => {
			if (membershipAppMessageIds.has(message.app_message_id)) return
			const currentMessage = (this.messages.get(topicId) || []).find(
				(item) => item.app_message_id === message.app_message_id,
			)
			if (currentMessage) this.publishMessageCommitted(topicId, currentMessage, node, "http")
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
					let rawNode = {
						...(sharedMessage?.raw_content?.super_magic_message as Record<
							string,
							unknown
						>),
					} as RawSuperMagicMessageNode
					const topicId = String(sharedMessage?.topic_id || rawNode?.topic_id || "")
					const appMessageId = String(rawNode?.app_message_id || messageId)
					const superMessageId = this.normalizeAssistantSuperMessageId(
						rawNode,
						appMessageId,
					)
					rawNode = this.applyAssistantToolOwnership(topicId, rawNode) || rawNode
					if (rawNode?.role === "tool") {
						this.recordToolResponse(topicId, rawNode, undefined, undefined, "shared")
					} else if (rawNode?.role === "assistant" && topicId) {
						this.advanceSharedReplay(topicId, messageId, rawNode)
					}

					this.messageMap.set(superMessageId, rawNode)
				} else {
					this.messageMap.set(messageId, sharedMessage)
				}
			})
		})
	}

	private advanceSharedReplay(
		topicId: string,
		messageId: string,
		assistantNode: RawSuperMagicMessageNode,
	) {
		const replayState = this.sharedReplayStates.get(topicId) || { latestMessageId: "" }
		if (
			messageId &&
			replayState.latestMessageId &&
			compareMessageSeqId(messageId, replayState.latestMessageId) <= 0
		) {
			// 分享播放会从头重放旧前缀；旧 Assistant 只刷新 messageMap，不能反向充当完成屏障。
			return
		}

		if (messageId) replayState.latestMessageId = messageId
		const correlationId = String(assistantNode.correlation_id || "")
		const pendingAssistant = replayState.pendingAssistant
		if (pendingAssistant && pendingAssistant.correlationId !== correlationId) {
			this.settleSharedToolCalls(topicId, pendingAssistant.toolCalls)
			replayState.pendingAssistant = undefined
		}

		const hasToolCalls = Object.prototype.hasOwnProperty.call(assistantNode, "tool_calls")
		if (hasToolCalls) {
			const toolCalls = Array.isArray(assistantNode.tool_calls)
				? this.cloneToolCallsForRendering(assistantNode.tool_calls as ToolCall[])
				: []
			replayState.pendingAssistant =
				toolCalls.length > 0 ? { correlationId, toolCalls } : undefined
		}

		this.sharedReplayStates.set(topicId, replayState)
	}

	/** 分享列表没有普通 Topic buffer；下一 Assistant 是缺失工具响应的现成完成屏障。 */
	private settleSharedToolCalls(topicId: string, toolCalls: ToolCall[]) {
		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
		let changed = false
		const settlements: Array<{ toolId: string; response: ToolResponseState }> = []

		toolCalls.forEach((toolCall) => {
			const toolId = String(toolCall.id || "")
			if (!toolId || this.isAskUserToolCall(toolCall)) return

			const current = toolResponseMap.get(toolId)
			if (
				current?.status === "finished" ||
				current?.status === "error" ||
				current?.status === "suspended" ||
				current?.status === "response_missing"
			)
				return

			const nextState = this.mergeToolResponseState(current, {
				...(toolCall.tool || {}),
				id: toolId,
				name: toolCall.tool?.name || toolCall.function?.name || "",
				status: "response_missing",
			})
			toolResponseMap.set(toolId, nextState)
			settlements.push({ toolId, response: nextState })
			changed = true
		})

		if (changed) {
			this.toolResponseMap.set(topicId, toolResponseMap)
			settlements.forEach(({ toolId, response }) => {
				this.publishToolCallSettled(topicId, toolId, response, undefined, "shared")
			})
		}
	}

	// ======================================
	// 方法 1：外部接收真实 chunk（前期正常流）
	// ======================================
	receiveChunk(message: SuperMagicChunkMessage, { persist = true }: { persist?: boolean } = {}) {
		const topicId = message?.topic_id
		const messageChunk = message?.[message?.type]
		const superMessageId = String(messageChunk?.super_message_id || "").trim()
		const taskId = String(messageChunk?.task_id || "").trim()
		const correlationId = String(messageChunk?.correlation_id || "")
		if (!topicId || !superMessageId || !correlationId) return
		this.setStreamCorrelationId(topicId, superMessageId, correlationId)
		const topicMeta = this.getTopicMetadata(topicId)
		const chunkIndex =
			Number.isInteger(messageChunk?.i) && Number(messageChunk.i) >= 0
				? Number(messageChunk.i)
				: null
		const transportBarrier = this.getStreamTransportBarrier(topicId, superMessageId)
		if (transportBarrier) {
			const startsNewGeneration =
				chunkIndex === 0 &&
				transportBarrier.correlationId &&
				transportBarrier.correlationId !== correlationId
			if (!startsNewGeneration) {
				this.clearStreamChunkLedger(topicId, superMessageId)
				return
			}
			// A different correlation starting at i=0 is explicit transport evidence for
			// a successor generation; finish_reason must not become a permanent tombstone.
			this.clearStreamTransportBarrier(topicId, superMessageId)
		}
		const finalBarrier = this.getCanonicalFinalBarrier(topicId, superMessageId)
		if (finalBarrier) {
			// Chunk transport carries no persistent revision. A changed correlation alone
			// cannot prove a higher canonical revision, so only a later IM/HTTP Final with
			// a higher seq_id may advance this logical Assistant message.
			this.clearStreamChunkLedger(topicId, superMessageId)
			return
		}

		const choiceSelection = this.selectStreamChunkChoice(messageChunk)
		const choice = choiceSelection.kind === "accepted" ? choiceSelection.choice : undefined
		const delta = choice?.delta
		const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
		const hasTextDelta = Boolean(
			(typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) ||
			(typeof delta?.content === "string" && delta.content.length > 0),
		)
		// Tool arguments remain canonical even when the tool header is missing. They must
		// reach the indexed provisional slot, but only a stable tool id is projectable.
		const hasCanonicalDelta = hasTextDelta || toolCalls.length > 0
		const streamStateBeforeChunk = this.getStreamState(topicId, superMessageId)

		if (chunkIndex === null) {
			// 缺失或非法序号无法安全排序和去重；丢弃当前包，等待后续完整消息兜底收敛。
			console.error("chunk error")
			return
		}
		if (hasCanonicalDelta || choice?.finish_reason) {
			this.promoteActiveFinalStreamForSuccessor(topicId, superMessageId)
		}

		const ledger = this.getStreamChunkLedger(topicId, superMessageId)
		const hasBufferedLaterChunk = Array.from(ledger.pendingChunks.keys()).some(
			(pendingChunkIndex) => pendingChunkIndex > 0,
		)
		if (
			choiceSelection.kind === "accepted" &&
			chunkIndex === 0 &&
			(ledger.nextChunkIndex > 1 || (ledger.nextChunkIndex > 0 && hasBufferedLaterChunk)) &&
			!topicMeta.finalizedCorrelationIds.has(superMessageId)
		) {
			// 同一 correlation 已推进到 i>0 后再次收到 i=0，表示模型放弃旧回答并从头生成。
			// completion id 仅作附带信息；这里只重置旧流状态，保留原消息卡片与非流式元数据。
			ledger.pendingChunks.clear()
			delete ledger.pendingGapFinal
			ledger.nextChunkIndex = 0
			topicMeta.content.delete(superMessageId)
			topicMeta.streamSnapshots.delete(superMessageId)
			this.clearStreamRecoveryState(topicId, superMessageId)
			if (topicMeta.timer) {
				clearTimeout(topicMeta.timer)
				topicMeta.timer = null
				topicMeta.activeRenderSuperMessageId = null
			}

			const cachedNode = this.getAssistantMessageNode(topicId, superMessageId)
			if (
				cachedNode &&
				typeof cachedNode === "object" &&
				(cachedNode as RawSuperMagicMessageNode).role === "assistant" &&
				(cachedNode as RawSuperMagicMessageNode).correlation_id === correlationId &&
				(cachedNode as RawSuperMagicMessageNode).topic_id === topicId
			) {
				const streamNode = cachedNode as RawSuperMagicMessageNode
				streamNode.content = ""
				streamNode.reasoning_content = ""
				streamNode.tool_calls = []
				this.setAssistantMessageNode(topicId, superMessageId, streamNode)
			}
			const currentGeneration = this.eventTransitions.getStreamGeneration(
				this.getEventEntityKey("stream", topicId, superMessageId),
			)
			this.publishStreamEnded(
				topicId,
				superMessageId,
				"restart",
				{
					awaitingCanonicalMessage: false,
					...(currentGeneration ? { replacedByGeneration: currentGeneration + 1 } : {}),
				},
				"stream",
				correlationId,
			)
		}
		// correlationId 负责隔离一轮流，i 负责该轮内的幂等和顺序；旧序号与待处理重复序号都直接忽略。
		if (chunkIndex < ledger.nextChunkIndex || ledger.pendingChunks.has(chunkIndex)) {
			return
		}
		if (persist) this.queueMessagePersistence(topicId, message, Boolean(choice?.finish_reason))

		runInAction(() => {
			ledger.pendingChunks.set(chunkIndex, messageChunk)
			const isGapFinal =
				Boolean(choice?.finish_reason) &&
				!streamStateBeforeChunk?.isFinalMessageReceived &&
				chunkIndex > ledger.nextChunkIndex
			if (isGapFinal) {
				// Final 只提供 transport 终态；缺口后的正文、reasoning 和工具增量仍不能乱序应用。
				// 记录后立即请求权威快照，后续仅由 Final 之后的新同步代次清理视觉流状态。
				ledger.pendingGapFinal = {
					chunkIndex,
					finishReason: String(choice?.finish_reason || ""),
				}
				const recoveryState = this.ensureStreamRecoveryState(topicId, superMessageId)
				if (topicId === this.activeTopicId && topicMeta.syncState !== "syncing") {
					this.clearStreamRecoveryTimer(topicId, superMessageId)
					this.requestStreamRecovery(
						topicId,
						superMessageId,
						recoveryState,
						this.getStreamState(topicId, superMessageId),
					)
				}
			}
			let appliedChunk = false

			while (ledger.pendingChunks.has(ledger.nextChunkIndex)) {
				const orderedChunk = ledger.pendingChunks.get(ledger.nextChunkIndex)
				ledger.pendingChunks.delete(ledger.nextChunkIndex)
				ledger.nextChunkIndex += 1
				if (!orderedChunk) continue

				const orderedChoiceSelection = this.selectStreamChunkChoice(orderedChunk)
				this.reportStreamChunkChoiceWarning(
					topicId,
					superMessageId,
					correlationId,
					ledger,
					orderedChoiceSelection,
				)
				if (orderedChoiceSelection.kind === "rejected") {
					if (orderedChoiceSelection.shouldRecover) {
						this.requestInvalidChoiceRecovery(topicId, superMessageId, topicMeta)
					}
					// transport i 仍已被 ledger 消费，但异常候选不得进入 canonical/UI/事件状态。
					continue
				}

				const orderedChoice =
					orderedChoiceSelection.kind === "accepted"
						? orderedChoiceSelection.choice
						: undefined
				const orderedDelta = orderedChoice?.delta
				const orderedToolCalls = Array.isArray(orderedDelta?.tool_calls)
					? orderedDelta.tool_calls
					: []
				const orderedIsFinal = Boolean(orderedChoice?.finish_reason)
				const orderedHasTextDelta = Boolean(
					(typeof orderedDelta?.reasoning_content === "string" &&
						orderedDelta.reasoning_content.length > 0) ||
					(typeof orderedDelta?.content === "string" && orderedDelta.content.length > 0),
				)
				const orderedHasCanonicalDelta = orderedHasTextDelta || orderedToolCalls.length > 0
				// role/heartbeat/usage-only 只推进 ledger，不进入 topicMeta.content，避免空流占用 UI loading 状态。
				if (!orderedHasCanonicalDelta && !orderedIsFinal) {
					// 非正文首包也证明该 correlation 已存在；若后续正文丢失，等待 watchdog 发起权威恢复。
					this.scheduleStreamRecovery(topicId, superMessageId, true)
					this.publishStreamStarted(
						topicId,
						superMessageId,
						Number(orderedChunk.i),
						"metadata",
						correlationId,
					)
					continue
				}
				if (!orderedChoice) continue

				const existingStreamState = this.getStreamState(topicId, superMessageId)
				if (!existingStreamState && orderedIsFinal && !orderedHasCanonicalDelta) {
					this.clearStreamRecoveryTimer(topicId, superMessageId)
					this.clearStreamChunkLedger(topicId, superMessageId)
					if (topicId === this.activeTopicId && topicMeta.syncState !== "syncing") {
						this.requestStreamRecovery(
							topicId,
							superMessageId,
							this.ensureStreamRecoveryState(topicId, superMessageId),
						)
					}
					this.publishStreamStarted(
						topicId,
						superMessageId,
						Number(orderedChunk.i),
						"metadata",
						correlationId,
					)
					this.publishStreamEnded(
						topicId,
						superMessageId,
						"finish_reason",
						{
							finishReason: String(orderedChoice?.finish_reason || "") || null,
							awaitingCanonicalMessage: true,
						},
						"stream",
						correlationId,
					)
					break
				}

				const streamState =
					existingStreamState ||
					this.getTopicStreamState(topicId, superMessageId, correlationId, taskId)
				streamState.correlation_id = correlationId
				streamState.task_id = taskId || streamState.task_id
				if (streamState.isFinalMessageReceived) {
					this.clearStreamChunkLedger(topicId, superMessageId)
					this.clearStreamCorrelationId(topicId, superMessageId)
					break
				}
				appliedChunk =
					this.applyOrderedChunk(
						topicId,
						superMessageId,
						topicMeta,
						streamState,
						orderedChunk,
						orderedChoice,
					) || appliedChunk
				if (streamState.isFinalMessageReceived) {
					this.clearStreamChunkLedger(topicId, superMessageId)
					this.clearStreamCorrelationId(topicId, superMessageId)
					break
				}
			}

			// 出现 gap 时不让后到参数越过工具头；超过恢复阈值后由 HTTP 权威快照收敛。
			if (!appliedChunk && ledger.pendingChunks.size > 0) {
				let streamState = this.getStreamState(topicId, superMessageId)
				if (!streamState && hasCanonicalDelta) {
					streamState = this.getTopicStreamState(
						topicId,
						superMessageId,
						correlationId,
						taskId,
					)
				}
				if (streamState && !streamState.isFinalMessageReceived) {
					topicMeta.isStream = true
					this.scheduleStreamRecovery(topicId, superMessageId)
				}
			}
		})
	}

	private applyOrderedChunk(
		topicId: string,
		superMessageId: string,
		topicMeta: TopicMeta,
		streamState: StreamState,
		messageChunk: SuperMagicChunkMessage["super_magic_chunk"],
		choice: StreamChunkChoice,
	): boolean {
		if (streamState.isFinalMessageReceived) return false
		const delta = choice?.delta
		const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
		const previousContentLength = streamState.content.length
		const previousReasoningContentLength = streamState.reasoning_content.length
		const previousTools = streamState.tool_calls.map((toolCall) => ({
			id: toolCall?.id,
			name: toolCall?.function?.name,
			arguments: toolCall?.function?.arguments || "",
		}))
		const isFinalChunk = Boolean(choice?.finish_reason)
		const hasEffectiveProgress = Boolean(
			(typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) ||
			(typeof delta?.content === "string" && delta.content.length > 0) ||
			toolCalls.length > 0,
		)

		if (isFinalChunk) {
			this.clearStreamRecoveryState(topicId, superMessageId)
			topicMeta.isStream = false
			this.beginFinalSettling(topicMeta, streamState)
		} else {
			if (hasEffectiveProgress) {
				this.resetStreamRecoveryState(topicId, superMessageId)
				streamState.recoveryAttempts = 0
			}
			// 新的增量 chunk 说明话题已经重新进入运行态，结束上一次终态同步留下的瞬时策略。
			if (topicMeta.renderPolicy === "instant") topicMeta.renderPolicy = "live"
			topicMeta.isStream = true
		}

		if (delta?.reasoning_content) streamState.reasoning_content += delta.reasoning_content
		if (delta?.content) streamState.content += delta.content

		toolCalls.forEach((toolCall) => {
			const fn = toolCall?.function
			if (!fn || Array.isArray(fn) || typeof fn !== "object") return
			const toolId = typeof toolCall.id === "string" && toolCall.id ? toolCall.id : undefined
			const toolName = typeof fn.name === "string" && fn.name ? fn.name : undefined
			const incomingArguments = typeof fn.arguments === "string" ? fn.arguments : undefined
			const indexedToolPosition =
				Number.isInteger(toolCall.index) && Number(toolCall.index) >= 0
					? Number(toolCall.index)
					: undefined
			const matchingIdIndexes: number[] = []
			if (toolId) {
				streamState.tool_calls.forEach((existingTool, index) => {
					if (existingTool?.id === toolId) matchingIdIndexes.push(index)
				})
			}
			const toolIndex =
				toolId && !toolName && matchingIdIndexes.length === 1
					? matchingIdIndexes[0]
					: (indexedToolPosition ??
						(toolId && matchingIdIndexes.length === 1
							? matchingIdIndexes[0]
							: undefined))
			if (toolIndex === undefined) return

			const matchingIdIndex =
				matchingIdIndexes.length === 1 ? matchingIdIndexes[0] : undefined
			const targetTool = streamState.tool_calls[toolIndex]
			const targetToolId =
				typeof targetTool?.id === "string" && targetTool.id ? targetTool.id : undefined
			if (toolId && targetToolId && targetToolId !== toolId) return
			if (
				toolId &&
				matchingIdIndex !== undefined &&
				matchingIdIndex !== toolIndex &&
				targetTool
			)
				return
			if (toolId && this.claimToolCallOwner(topicId, superMessageId, toolId) === "conflict")
				return

			let existingTool = targetTool
			if (toolId && matchingIdIndex !== undefined && matchingIdIndex !== toolIndex) {
				existingTool = streamState.tool_calls[matchingIdIndex]
				delete streamState.tool_calls[matchingIdIndex]
			}

			const isKnownToolContinuation = Boolean(
				toolId && existingTool?.id === toolId && !toolName,
			)
			const isToolHeader = Boolean(toolName || (toolId && !isKnownToolContinuation))

			if (isToolHeader) {
				const provisionalArguments =
					typeof existingTool?.function?.arguments === "string"
						? existingTool.function.arguments
						: undefined
				// 参数续片可能因网络乱序先到；工具头补齐时必须升级原槽位而不是追加新工具。
				streamState.tool_calls[toolIndex] = {
					...existingTool,
					...toolCall,
					id: toolId || existingTool?.id,
					index: toolIndex,
					type: toolCall.type || existingTool?.type || "function",
					function: {
						...existingTool?.function,
						...fn,
						name: toolName || existingTool?.function?.name || "",
						arguments: provisionalArguments ?? incomingArguments ?? "",
					},
				} as ToolCall
				return
			}
			if (!incomingArguments) return

			const cachedArguments = get(
				streamState,
				["tool_calls", toolIndex, "function", "arguments"],
				"",
			)
			const argCache = typeof cachedArguments === "string" ? cachedArguments : ""
			set(
				streamState,
				["tool_calls", toolIndex, "function", "arguments"],
				argCache + incomingArguments,
			)
		})

		const toolCallDeltas = streamState.tool_calls.reduce<SuperMagicToolCallDelta[]>(
			(accumulator, toolCall, index) => {
				if (!toolCall) return accumulator
				const previous = previousTools[index]
				const argumentsValue = toolCall.function?.arguments || ""
				const changed =
					!previous ||
					previous.id !== toolCall.id ||
					previous.name !== toolCall.function?.name ||
					previous.arguments !== argumentsValue
				if (!changed) return accumulator
				const previousArguments = previous?.arguments || ""
				accumulator.push({
					index,
					...(toolCall.id ? { id: toolCall.id } : {}),
					...(toolCall.function?.name ? { name: toolCall.function.name } : {}),
					...(argumentsValue !== previousArguments
						? {
								argumentsDelta: argumentsValue.startsWith(previousArguments)
									? argumentsValue.slice(previousArguments.length)
									: argumentsValue,
							}
						: {}),
					argumentsLength: argumentsValue.length,
				})
				return accumulator
			},
			[],
		)
		const contentDelta = streamState.content.slice(previousContentLength)
		const reasoningContentDelta = streamState.reasoning_content.slice(
			previousReasoningContentLength,
		)
		const startsWith = reasoningContentDelta
			? "reasoning"
			: contentDelta
				? "content"
				: toolCallDeltas.length > 0
					? "tool_call"
					: "metadata"
		this.publishStreamStarted(
			topicId,
			superMessageId,
			Number(messageChunk.i),
			startsWith,
			messageChunk.correlation_id,
		)
		if (contentDelta || reasoningContentDelta || toolCallDeltas.length > 0) {
			this.publishStreamDelta(
				topicId,
				superMessageId,
				{
					chunkIndex: Number(messageChunk.i),
					contentDelta,
					contentLength: streamState.content.length,
					reasoningContentDelta,
					reasoningContentLength: streamState.reasoning_content.length,
					toolCallDeltas,
				},
				messageChunk.correlation_id,
			)
		}
		if (isFinalChunk) {
			this.publishStreamEnded(
				topicId,
				superMessageId,
				"finish_reason",
				{
					finishReason: String(choice?.finish_reason || "") || null,
					awaitingCanonicalMessage: true,
				},
				"stream",
				messageChunk.correlation_id,
			)
			this.setStreamTransportBarrier(topicId, superMessageId, {
				correlationId: messageChunk.correlation_id,
				chunkIndex: Number(messageChunk.i),
			})
		}

		if (!isFinalChunk && hasEffectiveProgress) {
			// Arm recovery from chunk receipt even while the typewriter is still projecting.
			// Only later effective network/canonical progress may reset this correlation clock.
			this.scheduleStreamRecovery(topicId, superMessageId)
		}

		// Anonymous argument slots are canonical-only state. Do not create a message
		// card or typewriter timer until content, reasoning, or a stable tool id exists.
		const hasProjectableTools = this.getProjectableToolCalls(streamState.tool_calls).length > 0
		if (streamState.content || streamState.reasoning_content || hasProjectableTools) {
			if (
				isFinalChunk &&
				topicMeta.timer &&
				topicMeta.activeRenderSuperMessageId === superMessageId
			) {
				// Final 需要立即应用新的结算节奏；这里只重启属于当前 SuperMessage 的
				// timer，不能抢占同 Topic 中正在投影的其他消息。
				clearTimeout(topicMeta.timer)
				topicMeta.timer = null
				topicMeta.activeRenderSuperMessageId = null
			}
			this.startStreamRendering(topicId, superMessageId)
		}
		return true
	}

	private cloneAuthoritativeAssistantSnapshot(
		serverNode: RawSuperMagicMessageNode,
	): RawSuperMagicMessageNode {
		const snapshot = {
			...serverNode,
		} as RawSuperMagicMessageNode
		const streamControlledFields = ["content", "reasoning_content", "tool_calls"] as const
		// 运行时对象可能显式携带 undefined；它与 wire-level absent 同义，必须从
		// merge 输入中删除，否则对象展开会把已经继承的 canonical 字段覆盖掉。
		streamControlledFields.forEach((field) => {
			if (!this.hasDefinedFinalField(serverNode, field)) {
				delete (snapshot as Record<string, unknown>)[field]
			}
		})

		if (this.hasDefinedFinalField(serverNode, "content")) {
			snapshot.content = typeof serverNode.content === "string" ? serverNode.content : ""
		}
		if (this.hasDefinedFinalField(serverNode, "reasoning_content")) {
			snapshot.reasoning_content =
				typeof serverNode.reasoning_content === "string" ? serverNode.reasoning_content : ""
		}
		if (this.hasDefinedFinalField(serverNode, "tool_calls")) {
			snapshot.tool_calls = Array.isArray(serverNode.tool_calls)
				? this.cloneToolCallsForRendering(serverNode.tool_calls as ToolCall[])
				: []
		}

		return snapshot
	}

	/** Final 字段的 undefined/absent 与显式 null、空值具有不同覆盖语义。 */
	private hasDefinedFinalField(
		node: RawSuperMagicMessageNode | undefined,
		field: "content" | "reasoning_content" | "tool_calls",
	) {
		return Boolean(
			node &&
			Object.prototype.hasOwnProperty.call(node, field) &&
			(node as Record<string, unknown>)[field] !== undefined,
		)
	}

	private getFinalToolCalls(node: RawSuperMagicMessageNode | undefined) {
		if (!this.hasDefinedFinalField(node, "tool_calls")) {
			return { present: false, toolCalls: [] as ToolCall[] }
		}
		return {
			present: true,
			toolCalls: Array.isArray(node?.tool_calls) ? (node.tool_calls as ToolCall[]) : [],
		}
	}

	/**
	 * Merge an authoritative Assistant snapshot without treating nested absent fields
	 * as explicit clears. Only an Assistant node from the same logical domain may act
	 * as the inheritance source.
	 */
	private mergeAuthoritativeAssistantSnapshot(
		currentNode: RawSuperMagicMessageNode | undefined,
		finalNode: RawSuperMagicMessageNode,
	): RawSuperMagicMessageNode {
		const currentAssistantNode = currentNode?.role === "assistant" ? currentNode : undefined
		const authoritativeNode = {
			...(currentAssistantNode
				? this.cloneAuthoritativeAssistantSnapshot(currentAssistantNode)
				: {}),
			...this.cloneAuthoritativeAssistantSnapshot(finalNode),
		} as RawSuperMagicMessageNode
		const finalToolState = this.getFinalToolCalls(finalNode)

		if (finalToolState.present) {
			const currentToolCalls = Array.isArray(currentAssistantNode?.tool_calls)
				? (currentAssistantNode.tool_calls as ToolCall[])
				: []
			authoritativeNode.tool_calls = this.cloneToolCallsForRendering(
				this.reconcileFinalToolCalls(currentToolCalls, finalToolState.toolCalls),
			)
		}

		return authoritativeNode
	}

	private getCanonicalFinalBarrier(topicId: string, superMessageId: string) {
		return this.canonicalFinalBarriers.get(`${topicId}\u0000${superMessageId}`)
	}

	private getStreamTransportBarrier(topicId: string, superMessageId: string) {
		return this.streamTransportBarriers.get(`${topicId}\u0000${superMessageId}`)
	}

	private setStreamTransportBarrier(
		topicId: string,
		superMessageId: string,
		barrier: StreamTransportBarrier,
	) {
		this.streamTransportBarriers.set(`${topicId}\u0000${superMessageId}`, barrier)
	}

	private clearStreamTransportBarrier(topicId: string, superMessageId: string) {
		this.streamTransportBarriers.delete(`${topicId}\u0000${superMessageId}`)
	}

	private setCanonicalFinalBarrier(
		topicId: string,
		superMessageId: string,
		barrier: CanonicalFinalBarrier,
	) {
		this.canonicalFinalBarriers.set(`${topicId}\u0000${superMessageId}`, barrier)
	}

	private clearFinalRenderState(topicId: string, superMessageId: string) {
		const key = `${topicId}\u0000${superMessageId}`
		const state = this.finalRenderStates.get(key)
		if (!state) return
		if (state.timer) clearTimeout(state.timer)
		this.finalRenderStates.delete(key)
	}

	/**
	 * Final 后的补齐只更新 render-only projection。Canonical messageMap 已经在
	 * settleCanonicalAssistantFinal 中写入权威完整值，因此该状态绝不会重新成为
	 * MessageNode 的业务 StreamState/loading 来源。
	 */
	private captureFinalRenderProjection(
		topicId: string,
		superMessageId: string,
		visibleNode: RawSuperMagicMessageNode | undefined,
		targetNode: RawSuperMagicMessageNode,
	) {
		if (!visibleNode || visibleNode.role !== "assistant" || targetNode.role !== "assistant")
			return
		const visibleReasoning = String(visibleNode.reasoning_content || "")
		const visibleContent = String(visibleNode.content || "")
		const targetReasoning = String(targetNode.reasoning_content || "")
		const targetContent = String(targetNode.content || "")
		const visibleToolCalls = Array.isArray(visibleNode.tool_calls)
			? this.cloneToolCallsForRendering(visibleNode.tool_calls as ToolCall[])
			: []
		const targetToolCalls = Array.isArray(targetNode.tool_calls)
			? this.cloneToolCallsForRendering(targetNode.tool_calls as ToolCall[])
			: []
		const canAnimateReasoning = targetReasoning.startsWith(visibleReasoning)
		const canAnimateContent = targetContent.startsWith(visibleContent)
		const hasToolCallDelta = !isToolCallsEqual(visibleToolCalls, targetToolCalls)
		if (
			(!canAnimateReasoning || visibleReasoning.length >= targetReasoning.length) &&
			(!canAnimateContent || visibleContent.length >= targetContent.length) &&
			!hasToolCallDelta
		)
			return

		const key = `${topicId}\u0000${superMessageId}`
		this.clearFinalRenderState(topicId, superMessageId)
		const state: FinalRenderState = {
			topicId,
			superMessageId,
			visibleNode: {
				...visibleNode,
				...targetNode,
				content: canAnimateContent ? visibleContent : targetContent,
				reasoning_content: canAnimateReasoning ? visibleReasoning : targetReasoning,
				// A newly introduced Final ToolCall must not carry canonical detail/status into
				// the render-only projection before its declaration/arguments are visible.
				tool_calls: visibleToolCalls,
			},
			targetNode: this.cloneAuthoritativeAssistantSnapshot(targetNode),
			startedAt: getMonotonicNow(),
			catchupDeadlineAt: null,
			timer: null,
		}
		this.finalRenderStates.set(key, state)
		this.scheduleFinalRenderFrame(state)
	}

	private scheduleFinalRenderFrame(state: FinalRenderState) {
		if (state.timer) return
		state.timer = setTimeout(() => {
			runInAction(() => {
				state.timer = null
				const key = `${state.topicId}\u0000${state.superMessageId}`
				const current = this.finalRenderStates.get(key)
				if (current !== state) return
				const visibleReasoning = String(state.visibleNode.reasoning_content || "")
				const visibleContent = String(state.visibleNode.content || "")
				const targetReasoning = String(state.targetNode.reasoning_content || "")
				const targetContent = String(state.targetNode.content || "")
				const remainingReasoning = Math.max(
					targetReasoning.length - visibleReasoning.length,
					0,
				)
				const remainingContent = Math.max(targetContent.length - visibleContent.length, 0)
				const visibleToolCalls = Array.isArray(state.visibleNode.tool_calls)
					? (state.visibleNode.tool_calls as ToolCall[])
					: []
				const targetToolCalls = Array.isArray(state.targetNode.tool_calls)
					? (state.targetNode.tool_calls as ToolCall[])
					: []
				const toolCallsEqual = isToolCallsEqual(visibleToolCalls, targetToolCalls)
				const remainingToolArguments = targetToolCalls.reduce((total, toolCall, index) => {
					const currentArguments = visibleToolCalls[index]?.function?.arguments || ""
					const targetArguments = toolCall?.function?.arguments || ""
					return total + Math.max(targetArguments.length - currentArguments.length, 0)
				}, 0)
				const remaining =
					remainingReasoning +
					remainingContent +
					remainingToolArguments +
					(toolCallsEqual ? 0 : 1)
				if (remaining <= 0) {
					this.clearFinalRenderState(state.topicId, state.superMessageId)
					return
				}
				const now = getMonotonicNow()
				let catchupDeadlineAt = state.catchupDeadlineAt
				if (
					catchupDeadlineAt === null &&
					now - state.startedAt >= FINAL_STREAM_SETTLING_MAX_MS
				) {
					catchupDeadlineAt = now + FINAL_STREAM_SAFETY_CATCHUP_BUDGET_MS
				}
				const remainingFrames =
					catchupDeadlineAt === null
						? Number.POSITIVE_INFINITY
						: Math.max(
								Math.ceil(
									Math.max(catchupDeadlineAt - now, 0) / STREAM_RENDER_FRAME_MS,
								),
								1,
							)
				let frameBudget = Math.max(
					getCharsPerTick(remaining),
					Number.isFinite(remainingFrames) ? Math.ceil(remaining / remainingFrames) : 1,
				)
				const visibleNode = { ...state.visibleNode }
				if (remainingReasoning > 0) {
					const reasoningStep = Math.min(frameBudget, remainingReasoning)
					visibleNode.reasoning_content = targetReasoning.slice(
						0,
						visibleReasoning.length + reasoningStep,
					)
					frameBudget -= reasoningStep
				}
				if (frameBudget > 0 && remainingContent > 0) {
					visibleNode.content = targetContent.slice(
						0,
						visibleContent.length + Math.min(frameBudget, remainingContent),
					)
				}
				if (frameBudget > 0 && !toolCallsEqual) {
					visibleNode.tool_calls = this.advanceFinalRenderToolCalls(
						visibleToolCalls,
						targetToolCalls,
						frameBudget,
					)
				}
				const nextState: FinalRenderState = {
					...state,
					visibleNode,
					catchupDeadlineAt,
					timer: null,
				}
				this.finalRenderStates.set(key, nextState)
				this.scheduleFinalRenderFrame(nextState)
			})
		}, STREAM_RENDER_FRAME_MS)
	}

	getRenderedMessageNode(superMessageId?: string, topicId?: string) {
		const canonical = this.messageMap.get(superMessageId || "") as
			RawSuperMagicMessageNode | undefined
		if (!superMessageId) return canonical
		const renderState = Array.from(this.finalRenderStates.values()).find(
			(state) =>
				state.superMessageId === superMessageId && (!topicId || state.topicId === topicId),
		)
		return renderState?.visibleNode || canonical
	}

	/**
	 * Tool Response 的 canonical 入账与视觉展示分离：所属 Assistant 仍处于
	 * StreamState/FinalRenderState 时，继续投影调用声明中的 running/waiting；
	 * RenderSession 完成后才开放 toolResponseMap 的真实 status/detail。
	 */
	getToolResponseForRendering(
		topicId: string,
		ownerSuperMessageId: string,
		toolCall: { id?: string; tool?: unknown },
	) {
		const embeddedResponse = toolCall?.tool as ToolResponseState | undefined
		const hasActiveRenderSession =
			Boolean(this.getStreamState(topicId, ownerSuperMessageId)) ||
			this.finalRenderStates.has(`${topicId}\u0000${ownerSuperMessageId}`)
		if (hasActiveRenderSession) return embeddedResponse
		return (
			this.toolResponseMap.get(topicId)?.get(String(toolCall?.id || "")) || embeddedResponse
		)
	}

	/**
	 * Single business settlement core shared by IM Final and HTTP authoritative Final.
	 * Callers may keep their own membership/anchor policy, but once this method accepts
	 * the revision all canonical, stream, barrier, and optional lifecycle effects converge.
	 */
	private settleCanonicalAssistantFinal({
		source,
		topicId,
		appMessageId,
		superMessageId,
		correlationId,
		seqId,
		finalNode,
		finalMessage,
		revisionDecision = "new",
		emitEvents = false,
	}: CanonicalFinalSettlementInput): CanonicalFinalSettlementResult {
		const normalizedSeqId = String(seqId || "")
		const existingBarrier = this.getCanonicalFinalBarrier(topicId, superMessageId)
		const currentNode = this.getAssistantMessageNode(topicId, superMessageId)
		if (revisionDecision === "stale") {
			return {
				accepted: false,
				streamWasActive: false,
				canonicalNode: currentNode || finalNode,
				seqId: normalizedSeqId,
			}
		}
		if (
			revisionDecision === "same" &&
			existingBarrier &&
			existingBarrier.seqId === normalizedSeqId &&
			currentNode?.role === "assistant"
		) {
			// Same revision is idempotent. Keep the first canonical payload on conflict,
			// while still allowing this call to repair any residual StreamState.
			if (this.hasAssistantPayloadConflict(currentNode, finalNode)) {
				this.warnAssistantSeqConflict(topicId, appMessageId, correlationId, normalizedSeqId)
			}
			finalNode = currentNode
		}

		const streamState = this.getStreamState(topicId, superMessageId)
		const streamWasActive = Boolean(streamState)
		const visibleNode = currentNode
		const reconciliationBase = streamState
			? ({
					...(currentNode || {}),
					role: "assistant",
					correlation_id: correlationId || streamState.correlation_id,
					super_message_id: superMessageId,
					content: streamState.content,
					reasoning_content: streamState.reasoning_content,
					tool_calls: this.cloneToolCallsForRendering(streamState.tool_calls),
				} as RawSuperMagicMessageNode)
			: currentNode
		const canonicalNode = {
			...this.mergeAuthoritativeAssistantSnapshot(reconciliationBase, {
				...finalNode,
				role: "assistant",
				correlation_id:
					correlationId ||
					String(finalNode.correlation_id || streamState?.correlation_id || ""),
				super_message_id: superMessageId,
			} as RawSuperMagicMessageNode),
			correlation_id:
				correlationId ||
				String(finalNode.correlation_id || streamState?.correlation_id || ""),
			super_message_id: superMessageId,
		} as RawSuperMagicMessageNode

		// Only a live StreamState provides a resumable visual prefix. Historical/refresh
		// hydration projects the canonical Final immediately instead of replaying animation.
		this.captureFinalRenderProjection(
			topicId,
			superMessageId,
			streamState ? visibleNode : undefined,
			canonicalNode,
		)
		this.setAssistantMessageNode(topicId, superMessageId, canonicalNode, appMessageId)

		const messages = this.messages.get(topicId) || []
		const cardIndex = messages.findIndex(
			(message) =>
				message.app_message_id === appMessageId ||
				(message.role === "assistant" &&
					this.getMessageSuperMessageId(message) === superMessageId),
		)
		const canonicalMessage = finalMessage
			? ({
					...(cardIndex >= 0 ? messages[cardIndex] : {}),
					...finalMessage,
					topic_id: topicId,
					app_message_id: appMessageId || finalMessage.app_message_id,
					super_message_id: superMessageId,
					correlation_id: String(canonicalNode.correlation_id || correlationId || ""),
					content: canonicalNode.content,
					reasoning_content: canonicalNode.reasoning_content,
					tool_calls: canonicalNode.tool_calls,
					debug: canonicalNode,
				} as MessageItem)
			: cardIndex >= 0
				? ({
						...messages[cardIndex],
						topic_id: topicId,
						app_message_id: appMessageId || messages[cardIndex].app_message_id,
						super_message_id: superMessageId,
						correlation_id: String(canonicalNode.correlation_id || correlationId || ""),
						content: canonicalNode.content,
						reasoning_content: canonicalNode.reasoning_content,
						tool_calls: canonicalNode.tool_calls,
						debug: canonicalNode,
					} as MessageItem)
				: undefined
		if (canonicalMessage) {
			const nextMessages = messages.slice()
			if (cardIndex >= 0) nextMessages[cardIndex] = canonicalMessage
			else nextMessages.push(canonicalMessage)
			this.messages.set(topicId, sortMessages(this.dedupeAuthoritativeMessages(nextMessages)))
		}

		const topicMeta = this.getTopicMetadata(topicId)
		const ownsRenderTimer = topicMeta.activeRenderSuperMessageId === superMessageId
		if (ownsRenderTimer && topicMeta.timer) clearTimeout(topicMeta.timer)
		if (ownsRenderTimer) topicMeta.activeRenderSuperMessageId = null
		if (ownsRenderTimer) topicMeta.timer = null
		this.clearStreamRecoveryState(topicId, superMessageId)
		this.clearStreamChunkLedger(topicId, superMessageId)
		topicMeta.content.delete(superMessageId)
		topicMeta.streamSnapshots.delete(superMessageId)
		topicMeta.finalizedCorrelationIds.add(superMessageId)
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)
		this.clearStreamCorrelationId(topicId, superMessageId)
		this.streamRenderStarted.get(topicId)?.delete(superMessageId)
		if (this.streamRenderStarted.get(topicId)?.size === 0)
			this.streamRenderStarted.delete(topicId)
		this.setCanonicalFinalBarrier(topicId, superMessageId, {
			seqId: normalizedSeqId,
			appMessageId: appMessageId || String(canonicalNode.app_message_id || ""),
			correlationId: String(canonicalNode.correlation_id || correlationId || ""),
		})
		this.registerAssistantToolRecoveries(
			topicId,
			superMessageId,
			appMessageId || String(canonicalNode.app_message_id || ""),
			normalizedSeqId,
			(Array.isArray(canonicalNode.tool_calls) ? canonicalNode.tool_calls : []) as ToolCall[],
		)

		if (emitEvents && canonicalMessage) {
			this.publishCanonicalFinalStreamEnded(
				topicId,
				superMessageId,
				normalizedSeqId,
				this.resolveAuthoritativeStreamEndReason(
					canonicalMessage.imStatus === "revoked" ? "revoked" : canonicalNode.status,
				),
				source,
				String(canonicalNode.correlation_id || correlationId || ""),
			)
			this.publishMessageCommitted(topicId, canonicalMessage, canonicalNode, source)
		}

		return {
			accepted: true,
			streamWasActive,
			canonicalNode,
			canonicalMessage,
			seqId: normalizedSeqId,
		}
	}

	/**
	 * HTTP authoritative Final 快照静默结算本代明确确认的 SuperMessage。丢弃同步窗口内
	 * 重建的 StreamState，并重新写回权威节点；Topic 是否仍 running 不影响消息级封口。
	 */
	private finalizeSynchronizedAssistantSnapshots(
		topicId: string,
		snapshots: Map<string, AuthoritativeAssistantSnapshot>,
	) {
		if (snapshots.size === 0) return
		snapshots.forEach(({ appMessageId, node }, superMessageId) => {
			const correlationId = String(node.correlation_id || "")
			this.settleCanonicalAssistantFinal({
				source: "http",
				topicId,
				appMessageId,
				superMessageId,
				correlationId,
				seqId: String(node.seq_id || ""),
				finalNode: node,
				revisionDecision: "same",
				emitEvents: false,
			})
		})
		const topicMeta = this.getTopicMetadata(topicId)
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
	}

	/**
	 * 全量消息同步是切回话题后的服务端权威快照。若列表仍持有同 SuperMessage
	 * 的流式占位卡片，需要同时覆盖 canonical 节点并静默结算旧 StreamState，
	 * 避免 API 已返回终态后又恢复离开前的打字机动画。
	 */
	private reconcileServerAssistantSnapshot(
		topicId: string,
		appMessageId: string,
		superMessageId: string,
		correlationId: string,
		serverNode: RawSuperMagicMessageNode,
		options: {
			seqId?: string
			finalMessage?: MessageItem
			revisionDecision?: "new" | "same" | "higher" | "stale"
			emitEvents?: boolean
			source?: CanonicalFinalSource
		} = {},
	) {
		const result = this.settleCanonicalAssistantFinal({
			source: options.source || "http",
			topicId,
			appMessageId,
			superMessageId,
			correlationId,
			seqId: options.seqId,
			finalNode: serverNode,
			finalMessage: options.finalMessage,
			revisionDecision: options.revisionDecision,
			emitEvents: options.emitEvents,
		})
		return result.streamWasActive
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
	private getValidToolResponseSeqId(seqId: unknown): string | undefined {
		if (typeof seqId === "string") {
			const normalizedSeqId = seqId.trim()
			return normalizedSeqId || undefined
		}
		if (typeof seqId === "number" && Number.isFinite(seqId)) return String(seqId)
		return undefined
	}

	private getToolResponseSeqMap(topicId: string) {
		let seqMap = this.latestToolResponseSeqIds.get(topicId)
		if (!seqMap) {
			seqMap = new Map()
			this.latestToolResponseSeqIds.set(topicId, seqMap)
		}
		return seqMap
	}

	private isValidToolResponseStatus(status: unknown): status is string {
		return typeof status === "string" && VALID_TOOL_RESPONSE_STATUSES.has(status)
	}

	private classifySameSeqToolResponse(current: ToolResponseState, incoming: ToolResponseState) {
		let hasSupplement = false
		for (const [key, value] of Object.entries(incoming)) {
			if (value === undefined) continue
			const currentValue = current[key]
			if (currentValue === undefined) {
				hasSupplement = true
				continue
			}
			if (!isEqual(currentValue, value)) return { hasConflict: true, hasSupplement: false }
		}
		return { hasConflict: false, hasSupplement }
	}

	/**
	 * 低版本只阻止 canonical 覆盖；消息本身仍继续进入列表、messageMap 和事件链路。
	 * 同版本允许补齐缺失字段，但一旦发现已存在字段冲突，保留首次 canonical 结果。
	 */
	private recordToolResponse(
		topicId: string,
		messageNode?: RawSuperMagicMessageNode,
		seqId?: unknown,
		targetMap?: Map<string, ToolResponseState>,
		source: SuperMagicEventSource = "im",
	): ToolResponseRecordResult {
		if (messageNode?.role !== "tool") return { kind: "unchanged" }
		const rawTool = messageNode.tool
		if (!rawTool || typeof rawTool !== "object" || Array.isArray(rawTool)) {
			return { kind: "unchanged" }
		}

		// 历史 tool_call_id 只保留在 raw message 中用于观测；canonical 身份只认 tool.id。
		const toolId = typeof rawTool.id === "string" ? rawTool.id.trim() : ""
		const toolCallId =
			typeof messageNode.tool_call_id === "string" ? messageNode.tool_call_id.trim() : ""
		if (!toolId) {
			console.warn("[SuperMagicStore] tool response missing tool.id", {
				code: "tool-response-missing-tool-id",
				topicId,
				toolCallId,
				resolution: "ignore-canonical-association",
			})
			return { kind: "invalid_tool_id" }
		}

		const toolResponseMap = targetMap || this.toolResponseMap.get(topicId) || new Map()
		// A rejected raw response still establishes an empty Topic bucket, preserving the
		// existing observable shape while keeping the canonical tool identity absent.
		if (!targetMap && !this.toolResponseMap.has(topicId)) {
			this.toolResponseMap.set(topicId, toolResponseMap)
		}
		const correlationId = String(messageNode.correlation_id || "").trim()
		const ownerIdentity = this.getToolCallOwner(topicId, toolId)
		const ownerCorrelationId = ownerIdentity
			? this.getStreamCorrelationId(topicId, ownerIdentity)
			: ""
		const isOrphanFinishTask =
			!ownerIdentity && this.isOrphanFinishTaskResponse(messageNode, toolId)
		if (!isOrphanFinishTask && !ownerIdentity) return { kind: "missing_owner" }
		if (
			!isOrphanFinishTask &&
			ownerIdentity !== correlationId &&
			ownerCorrelationId !== correlationId
		)
			return { kind: "owner_conflict" }

		const current = toolResponseMap.get(toolId)
		const normalizedSeqId = this.getValidToolResponseSeqId(seqId)
		const seqMap = this.getToolResponseSeqMap(topicId)
		const latestSeqId = seqMap.get(toolId)
		const shouldReportProtocolWarning = Boolean(
			!current || (normalizedSeqId && normalizedSeqId !== latestSeqId),
		)
		if (shouldReportProtocolWarning && toolCallId && toolCallId !== toolId) {
			console.warn("[SuperMagicStore] tool response id conflict", {
				topicId,
				toolId,
				toolCallId,
			})
		}

		const incoming: ToolResponseState = {
			...(rawTool as ToolResponseState),
			id: toolId,
		}
		const publishSettlement = (response: ToolResponseState) => {
			if (this.isStrongToolResponseStatus(response.status)) {
				this.clearToolResponseRecovery(topicId, toolId)
			}
			// HTTP snapshot 使用 targetMap 批量构建 canonical 状态；是否对外发布由同步边界统一裁决。
			if (!targetMap && !isOrphanFinishTask)
				this.publishToolCallSettled(topicId, toolId, response, messageNode, source)
		}
		if (rawTool.status === undefined) {
			const hasValidCurrentStatus = this.isValidToolResponseStatus(current?.status)
			const fallbackStatus = hasValidCurrentStatus ? current?.status : "running"
			incoming.status = fallbackStatus
			if (shouldReportProtocolWarning) {
				console.warn("[SuperMagicStore] tool response missing status", {
					code: "tool-response-missing-status",
					topicId,
					toolId,
					fallbackStatus,
					resolution: hasValidCurrentStatus
						? "preserve-current-status"
						: "default-running",
				})
			}
		} else if (!this.isValidToolResponseStatus(rawTool.status)) {
			const fallbackStatus = this.isValidToolResponseStatus(current?.status)
				? current.status
				: "running"
			incoming.status = fallbackStatus
			if (shouldReportProtocolWarning) {
				console.warn("[SuperMagicStore] unknown tool response status", {
					topicId,
					toolId,
					incomingStatus: rawTool.status,
					fallbackStatus,
				})
			}
		}

		if (!current) {
			toolResponseMap.set(toolId, incoming)
			if (normalizedSeqId) seqMap.set(toolId, normalizedSeqId)
			this.toolResponseMap.set(topicId, toolResponseMap)
			publishSettlement(incoming)
			return { kind: "recorded", response: incoming }
		}
		if (normalizedSeqId && !latestSeqId) {
			// response_missing 等无版本占位被真实消息接管时，从这条消息开始建立 seq 基线。
			const nextState = this.mergeToolResponseState(current, incoming)
			toolResponseMap.set(toolId, nextState)
			seqMap.set(toolId, normalizedSeqId)
			this.toolResponseMap.set(topicId, toolResponseMap)
			publishSettlement(nextState)
			return { kind: "recorded", response: nextState }
		}

		if (normalizedSeqId && latestSeqId) {
			const sequenceOrder = compareMessageSeqId(normalizedSeqId, latestSeqId)
			if (sequenceOrder < 0) {
				console.warn("[SuperMagicStore] stale tool response ignored", {
					topicId,
					toolCallId: toolId,
					incomingSeqId: normalizedSeqId,
					latestSeqId,
				})
				return { kind: "unchanged" }
			}
			if (sequenceOrder === 0) {
				const sameSeqResult = this.classifySameSeqToolResponse(current, incoming)
				if (sameSeqResult.hasConflict) {
					console.warn("[SuperMagicStore] conflicting tool response ignored", {
						topicId,
						toolCallId: toolId,
						seqId: normalizedSeqId,
					})
					return { kind: "unchanged" }
				}
				if (!sameSeqResult.hasSupplement) return { kind: "unchanged" }
				const supplemented = this.mergeToolResponseState(current, incoming)
				toolResponseMap.set(toolId, supplemented)
				this.toolResponseMap.set(topicId, toolResponseMap)
				publishSettlement(supplemented)
				return { kind: "recorded", response: supplemented }
			}

			const nextState = this.mergeToolResponseState(current, incoming)
			toolResponseMap.set(toolId, nextState)
			seqMap.set(toolId, normalizedSeqId)
			this.toolResponseMap.set(topicId, toolResponseMap)
			publishSettlement(nextState)
			return { kind: "recorded", response: nextState }
		}

		// 未知版本不能破坏已有强终态；其余情况保留原有状态合并语义。
		const nextState = this.isStrongToolResponseStatus(current.status)
			? this.mergeUnknownSeqToolResponseState(current, incoming)
			: this.mergeToolResponseState(current, incoming)
		if (nextState === current || isEqual(nextState, current)) return { kind: "unchanged" }
		toolResponseMap.set(toolId, nextState)
		this.toolResponseMap.set(topicId, toolResponseMap)
		publishSettlement(nextState)
		return { kind: "recorded", response: nextState }
	}

	private mergeUnknownSeqToolResponseState(
		current: ToolResponseState,
		incoming: ToolResponseState,
	): ToolResponseState {
		const safeIncoming: ToolResponseState = {}
		Object.entries(incoming).forEach(([key, value]) => {
			if (value !== undefined && current[key] === undefined) safeIncoming[key] = value
		})
		if (Object.keys(safeIncoming).length === 0) return current
		return this.mergeToolResponseState(current, safeIncoming)
	}

	/**
	 * Tool response 的真实执行状态只能向更强终态推进；response_missing 是可被真实
	 * finished/error 覆盖的弱占位。字段按 defined 值合并，避免占位清空真实 detail。
	 */
	private mergeToolResponseState(
		current: ToolResponseState | undefined,
		incoming: ToolResponseState,
	): ToolResponseState {
		const currentStatus = current?.status
		const incomingStatus = incoming.status
		const preserveRealPayload =
			incomingStatus === "response_missing" &&
			(currentStatus === "finished" || currentStatus === "error")
		const merged: ToolResponseState = { ...(current || {}) }
		Object.entries(incoming).forEach(([key, value]) => {
			if (value === undefined) return
			if (preserveRealPayload && key !== "status" && current?.[key] !== undefined) return
			merged[key] = value
		})

		if (!currentStatus || incomingStatus === undefined) {
			if (currentStatus && incomingStatus === undefined) merged.status = currentStatus
			return merged
		}

		if (currentStatus === "running" && incomingStatus === "waiting") {
			// waiting 是执行前态；后到消息可以补充 detail/attachments，但不能让
			// 已开始执行的工具重新进入等待态。
			merged.status = "running"
		} else if (currentStatus === "finished") {
			merged.status = "finished"
		} else if (currentStatus === "error") {
			merged.status = incomingStatus === "finished" ? "finished" : "error"
		} else if (currentStatus === "response_missing") {
			merged.status =
				incomingStatus === "finished" ||
				incomingStatus === "error" ||
				incomingStatus === "suspended"
					? incomingStatus
					: "response_missing"
		} else if (currentStatus === "suspended") {
			// 合成 suspended 是可被迟到真实终态纠正的弱终态，但不能回滚为运行态。
			merged.status =
				incomingStatus === "finished" || incomingStatus === "error"
					? incomingStatus
					: "suspended"
		}

		return merged
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
			this.setNonAssistantMessageNode(
				resolvedTopicId,
				nextMessage.super_message_id,
				messageNode,
			)
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

		this.setNonAssistantMessageNode(topicId, nextMessage.super_message_id, messageNode)
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
			// User 的 SuperMessage ID 按协议恒等于 appMessageId。
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
			const superMessageId = nextMessage.super_message_id
			this.setNonAssistantMessageNode(
				resolvedTopicId,
				superMessageId,
				merge({}, this.messageMap.get(superMessageId), messageNode),
			)
		})
	}

	// ======================================
	// 方法 2：收到最终 message → 切换续流模式
	// ======================================
	private getAssistantRevisionSeqId(
		topicId: string,
		appMessageId: string,
		superMessageId: string,
		includeBuffer = true,
		messageList?: MessageItem[],
	) {
		let latestSeqId = ""
		const consider = (seqId: unknown) => {
			const normalized = typeof seqId === "string" ? seqId : String(seqId || "")
			if (!normalized) return
			if (!latestSeqId || compareMessageSeqId(normalized, latestSeqId) > 0) {
				latestSeqId = normalized
			}
		}

		;(messageList || this.messages.get(topicId) || []).forEach((item) => {
			if (item.role !== "assistant") return
			const matchesAppMessageId =
				Boolean(appMessageId) && item.app_message_id === appMessageId
			const matchesSuperMessageId =
				Boolean(superMessageId) && this.getMessageSuperMessageId(item) === superMessageId
			if (!matchesAppMessageId && !matchesSuperMessageId) return
			// 流式占位卡的 seq 是本地推导值，不代表已接受的 Final revision。
			if (
				item.app_message_id === superMessageId &&
				this.getMessageSuperMessageId(item) === superMessageId
			)
				return
			consider(item.seq_id)
		})

		if (includeBuffer) {
			this.getTopicBuffer(topicId).messages.forEach((envelope) => {
				const sequence = envelope?.seq
				const rawNode = getRawMessageNode(sequence?.message)
				if (rawNode?.role !== "assistant") return
				const matchesAppMessageId =
					Boolean(appMessageId) && sequence?.message?.app_message_id === appMessageId
				const candidateSuperMessageId = this.normalizeAssistantSuperMessageId(
					rawNode,
					String(sequence?.message?.app_message_id || ""),
				)
				const matchesSuperMessageId =
					Boolean(superMessageId) && candidateSuperMessageId === superMessageId
				if (!matchesAppMessageId && !matchesSuperMessageId) return
				consider(sequence?.seq_id)
			})
		}

		return latestSeqId || undefined
	}

	private getAssistantRevisionDecision(
		topicId: string,
		appMessageId: string,
		superMessageId: string,
		incomingSeqId: unknown,
		messageList?: MessageItem[],
	): "new" | "same" | "stale" | "higher" {
		const currentSeqId = this.getAssistantRevisionSeqId(
			topicId,
			appMessageId,
			superMessageId,
			true,
			messageList,
		)
		if (!currentSeqId) return "new"
		const incoming =
			typeof incomingSeqId === "string" ? incomingSeqId : String(incomingSeqId || "")
		if (!incoming) return "same"
		const order = compareMessageSeqId(incoming, currentSeqId)
		if (order > 0) return "higher"
		if (order < 0) return "stale"
		return "same"
	}

	private enqueueAssistantRevision(
		topicId: string,
		baseMessage: RawSuperMagicMessageEnvelope,
		appMessageId: string,
		superMessageId: string,
	) {
		const buffer = this.getTopicBuffer(topicId)
		const incomingSeqId = baseMessage?.seq?.seq_id
		const existingIndex = buffer.messages.findIndex((envelope) => {
			const sequence = envelope?.seq
			const rawNode = getRawMessageNode(sequence?.message)
			const candidateSuperMessageId = this.normalizeAssistantSuperMessageId(
				rawNode,
				String(sequence?.message?.app_message_id || ""),
			)
			return (
				rawNode?.role === "assistant" &&
				((Boolean(appMessageId) && sequence?.message?.app_message_id === appMessageId) ||
					(Boolean(superMessageId) && candidateSuperMessageId === superMessageId))
			)
		})

		if (existingIndex < 0) {
			buffer.messages.push(baseMessage)
			return
		}

		const existingSeqId = buffer.messages[existingIndex]?.seq?.seq_id
		if (
			typeof incomingSeqId === "string" &&
			typeof existingSeqId === "string" &&
			compareMessageSeqId(incomingSeqId, existingSeqId) > 0
		) {
			// 同一逻辑卡在 buffer 中只保留最高 revision，避免重复消费和重复通知。
			buffer.messages[existingIndex] = baseMessage
		}
	}

	enqueueMessage(
		topicId: string,
		baseMessage: RawSuperMagicMessageEnvelope,
		{ persist = true }: { persist?: boolean } = {},
	) {
		const message = baseMessage?.seq as RawSuperMagicMessageSequence
		const msgCache = this.messages.get(topicId) || []

		const messageNode = this.applyAssistantToolOwnership(
			topicId,
			getRawMessageNode(message?.message),
		)

		const appMessageId = message?.message?.app_message_id as string
		const superMessageId = this.normalizeAssistantSuperMessageId(messageNode, appMessageId)
		const nextMessage = this.normalizeAssistantMessageItem(
			transformRawMessage(message),
			messageNode,
			appMessageId,
		)
		const msgIdSet = new Set(msgCache.map((o) => o?.app_message_id))
		const correlationId = String(messageNode?.correlation_id || "")
		const currentAssistantMessage =
			messageNode?.role === "assistant"
				? this.getLatestAssistantMessageForIdentity(msgCache, appMessageId, superMessageId)
				: undefined
		const canonicalFinalBarrier = superMessageId
			? this.getCanonicalFinalBarrier(topicId, superMessageId)
			: undefined
		if (
			messageNode?.role === "assistant" &&
			superMessageId &&
			canonicalFinalBarrier &&
			!currentAssistantMessage &&
			(!message?.seq_id ||
				!canonicalFinalBarrier.seqId ||
				compareMessageSeqId(String(message.seq_id), canonicalFinalBarrier.seqId) <= 0)
		) {
			// 权威 membership 已删除该逻辑卡；没有 canonical 高版本可比较时，迟到 Final
			// 与迟到 chunk 一样属于旧分支，不能重新写入 buffer、工具状态或持久化队列。
			return
		}
		if (currentAssistantMessage?.imStatus === "revoked" && nextMessage.imStatus !== "revoked") {
			// A successful revoke is the authority barrier for its old Assistant generation.
			// Reject late IM/WS revisions before persistence, tool-state updates, or listeners;
			// HTTP initializeMessages remains able to restore the message after cancelUndoMessage.
			return
		}
		const revisionDecision =
			messageNode?.role === "assistant"
				? this.getAssistantRevisionDecision(
						topicId,
						appMessageId,
						superMessageId,
						message?.seq_id,
					)
				: "new"
		if (revisionDecision === "same" || revisionDecision === "stale") {
			const skippedStreamState = superMessageId
				? this.getStreamState(topicId, superMessageId)
				: undefined
			if (messageNode?.role === "assistant" && superMessageId && skippedStreamState) {
				if (revisionDecision === "same") {
					const wasStreamActive = this.eventTransitions.isStreamActive(
						this.getEventEntityKey("stream", topicId, superMessageId),
					)
					this.reconcileServerAssistantSnapshot(
						topicId,
						appMessageId,
						superMessageId,
						correlationId,
						this.getAssistantMessageNode(topicId, superMessageId) || messageNode,
						{
							seqId: String(message?.seq_id || ""),
							finalMessage: nextMessage,
							revisionDecision: this.getAssistantRevisionDecision(
								topicId,
								appMessageId,
								superMessageId,
								message?.seq_id,
							),
							source: "im",
						},
					)
					if (wasStreamActive) {
						this.publishCanonicalFinalStreamEnded(
							topicId,
							superMessageId,
							String(message?.seq_id || ""),
							nextMessage.imStatus === "revoked" ? "revoked" : "authoritative_final",
							"im",
							correlationId,
						)
					}
				}
			}
			return
		}
		const isHigherAssistantRevision = revisionDecision === "higher"
		if (messageNode?.role === "assistant" && superMessageId) {
			this.promoteActiveFinalStreamForSuccessor(topicId, superMessageId)
		}

		const buffer = this.getTopicBuffer(topicId)
		this.recordToolResponse(topicId, messageNode, message?.seq_id)
		const isTaskSuspendedEvent = messageNode?.event === TASK_SUSPENDED_EVENT
		if (isTaskSuspendedEvent) {
			this.handleTopicSuspended(topicId, "im")
		}
		if (messageNode?.role === "assistant" && !isTaskSuspendedEvent) {
			// 新 assistant 到达证明上一轮已推进；排除当前 assistant，避免把它自己的
			// tool_calls 当成缺失项，并检查 buffer 中尚未消费的真实 tool response。
			this.fillMissingToolResponses(topicId, [appMessageId, superMessageId, correlationId])
		}

		// 针对客户端的工具调用消息直接过滤
		if (nextMessage?.type === "user_tool_call") {
			if (persist) this.queueMessagePersistence(topicId, message, true)
			return
		}

		const hasMessage = msgIdSet.has(appMessageId)
		const hasSuperMessageIdMessage = msgCache.some(
			(item) =>
				Boolean(superMessageId) &&
				item?.role === messageNode?.role &&
				item?.role === "assistant" &&
				this.getMessageSuperMessageId(item) === superMessageId,
		)
		const hasBufferMessage = buffer.messages.some(
			(o) => o?.seq?.message?.app_message_id === appMessageId,
		)
		if (
			!isHigherAssistantRevision &&
			(hasMessage || hasSuperMessageIdMessage || hasBufferMessage)
		) {
			if (hasSuperMessageIdMessage && superMessageId && messageNode?.role === "assistant") {
				const settlement = this.settleCanonicalAssistantFinal({
					source: "im",
					topicId,
					appMessageId,
					superMessageId,
					correlationId,
					seqId: String(message?.seq_id || ""),
					finalNode: messageNode,
					finalMessage: nextMessage,
					revisionDecision,
					emitEvents: true,
				})
				if (settlement.canonicalNode.status === "finished")
					this.fillMissingToolResponses(topicId)
				if (persist) this.queueMessagePersistence(topicId, message, true)
			}
			return
		}

		if (persist) this.queueMessagePersistence(topicId, message, true)

		if (nextMessage?.type === "rich_text") {
			const topicId = nextMessage?.topic_id || ""
			const messages = this.messages.get(topicId) || []
			runInAction(() => {
				this.setNonAssistantMessageNode(topicId, nextMessage.super_message_id, messageNode)
				this.messages.set(topicId, [...messages, nextMessage])
			})
			return
		}

		if (nextMessage?.type === "super_magic_message") {
			const bufferHasAssistantRevision =
				messageNode?.role === "assistant" && isHigherAssistantRevision
			if (bufferHasAssistantRevision) {
				this.enqueueAssistantRevision(topicId, baseMessage, appMessageId, superMessageId)
			} else {
				const bufferIndex = buffer?.messages.findIndex(
					(o) =>
						o?.seq?.message?.app_message_id ===
						baseMessage?.seq?.message?.app_message_id,
				)
				if (bufferIndex < 0) buffer?.messages.push(baseMessage)
			}
			if (bufferHasAssistantRevision || buffer?.messages.length > 0) {
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

	/**
	 * 流式已完成（streamState 已删除）后真消息才到达时，
	 * 将真消息 tool_calls 各项上的 tool 字段同步到 messageMap 缓存。
	 */
	private syncToolCallsToolField(
		topicId: string,
		superMessageId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!superMessageId || !finalNode) return
		const finalToolCalls = Array.isArray(finalNode.tool_calls)
			? (finalNode.tool_calls as ToolCall[])
			: []
		if (finalToolCalls.length === 0) return

		const cache = this.getAssistantMessageNode(topicId, superMessageId)
		if (
			cache?.role !== "assistant" ||
			cache.super_message_id !== superMessageId ||
			!Array.isArray(cache.tool_calls)
		)
			return

		const cacheToolCalls = cache.tool_calls as ToolCall[]
		let mutated = false
		finalToolCalls.forEach((ft, i) => {
			if (ft.tool && cacheToolCalls[i]) {
				cacheToolCalls[i].tool = ft.tool
				mutated = true
			}
		})
		if (mutated) {
			this.setAssistantMessageNode(topicId, superMessageId, cache)
		}
	}

	/**
	 * StreamState may already be gone when the authoritative assistant message arrives.
	 * This helper is only called from that branch, so replacing the complete final stream
	 * fields cannot interrupt the existing typewriter catch-up path.
	 */
	private syncFinalAssistantStreamFields(
		topicId: string,
		superMessageId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!superMessageId || !finalNode) return
		const cache = this.getAssistantMessageNode(topicId, superMessageId)
		if (cache?.role !== "assistant" || cache.super_message_id !== superMessageId) return

		if (this.hasDefinedFinalField(finalNode, "content")) {
			cache.content = typeof finalNode.content === "string" ? finalNode.content : ""
		}
		if (this.hasDefinedFinalField(finalNode, "reasoning_content")) {
			cache.reasoning_content =
				typeof finalNode.reasoning_content === "string" ? finalNode.reasoning_content : ""
		}

		const finalToolState = this.getFinalToolCalls(finalNode)
		if (finalToolState.present) {
			const currentToolCalls = Array.isArray(cache.tool_calls)
				? (cache.tool_calls as ToolCall[])
				: []
			cache.tool_calls = this.cloneToolCallsForRendering(
				this.reconcileFinalToolCalls(currentToolCalls, finalToolState.toolCalls),
			)
		}
		this.setAssistantMessageNode(topicId, superMessageId, cache)
		this.syncAssistantCardProjection(topicId, superMessageId)
	}

	/**
	 * 将真消息节点中的非流式元信息合并到 chunk 阶段创建的 mock 节点。
	 * 跳过 content / reasoning_content / tool_calls（由 startStreamRendering
	 * 渐进 catch-up），也跳过 correlation_id / topic_id（mock 已按外层路由身份建表）。
	 */
	private syncFinalNodeMetadata(
		topicId: string,
		superMessageId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!superMessageId || !finalNode) return
		const cache = this.getAssistantMessageNode(topicId, superMessageId)
		if (cache?.role !== "assistant" || cache.super_message_id !== superMessageId) return

		const streamControlledKeys = new Set([
			"content",
			"reasoning_content",
			"tool_calls",
			// The outer topic is the Store transport/routing identity. The Final node's
			// topic_id may belong to the inner Agent domain and must not replace it here.
			"topic_id",
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
			this.setAssistantMessageNode(topicId, superMessageId, cache)
		}
	}

	/**
	 * 将真消息卡片中的身份 / 状态字段合并到逻辑卡片。
	 * React key 由 super_message_id 稳定，卡片的持久 app_message_id 使用 Final 真 ID。
	 */
	private syncFinalCardMetadata(
		topicId: string,
		superMessageId: string,
		finalCard: MessageItem | undefined,
	) {
		if (!topicId || !superMessageId || !finalCard) return
		const messages = this.messages.get(topicId)
		if (!messages?.length) return

		const cardIndex = messages.findIndex(
			(item) =>
				item.role === "assistant" && this.getMessageSuperMessageId(item) === superMessageId,
		)
		if (cardIndex < 0) return

		const existingCard = messages[cardIndex]
		const merged = this.mergeFinalCardMetadata(existingCard, finalCard)
		if (merged === existingCard) return
		const nextMessages = messages.slice()
		nextMessages[cardIndex] = merged
		this.messages.set(topicId, sortMessages(nextMessages))
	}

	private mergeFinalCardMetadata(existingCard: MessageItem, finalCard: MessageItem) {
		// 卡片属于传入的 topicId；Final 可能携带另一个内层 Agent topic，不能改写路由归属。
		const patchableKeys: Array<string> = [
			"app_message_id",
			"super_message_id",
			"correlation_id",
			"magic_message_id",
			"conversation_id",
			"sender_id",
			"send_time",
			"seq_id",
			"status",
			"imStatus",
			"superStatus",
			"event",
			"refer_message_id",
			"parent_correlation_id",
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

		return mutated ? merged : existingCard
	}

	/**
	 * 没有对应 StreamState 的 Assistant Final 来自历史回补或 Final-only 路径。
	 * 这类消息已经是服务端权威快照，应直接落地，不能借用其他 correlation 的 topic timer
	 * 创建伪流式动画；同时只清理当前 correlation，保留同 topic 中仍在运行的真实流。
	 */
	private commitBufferedAssistantSnapshotImmediately(
		topicId: string,
		superMessageId: string,
		correlationId: string,
		rawAppMessageId: string,
		message: MessageItem,
		messageNode: RawSuperMagicMessageNode,
	) {
		const result = this.settleCanonicalAssistantFinal({
			source: "im",
			topicId,
			appMessageId: rawAppMessageId,
			superMessageId,
			correlationId,
			seqId: String(message.seq_id || ""),
			finalNode: {
				...messageNode,
				// Store bucket/card ownership comes from enqueueMessage(topicId), while the
				// canonical Agent node retains its inner business topic when the server sent one.
				topic_id: messageNode.topic_id || topicId,
				correlation_id: correlationId,
				super_message_id: superMessageId,
			} as RawSuperMagicMessageNode,
			finalMessage: message,
			emitEvents: true,
		})
		if (result.canonicalNode.status === "finished") {
			this.fillMissingToolResponses(topicId)
		}

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
	}

	/**
	 * A persistent message without StreamState is already canonical and may bypass an
	 * unrelated Assistant animation. Stream-bound Finals stay ordered until the current
	 * render/sync barrier is released; this avoids head-of-line starvation without adding
	 * a second queue or changing message ordering inside either class.
	 */
	private getNextProcessableBufferIndex(
		topicId: string,
		messages: RawSuperMagicMessageEnvelope[],
	): number {
		const topicMeta = this.getTopicMetadata(topicId)
		return messages.findIndex((envelope) => {
			const messageNode = getRawMessageNode(envelope?.seq?.message)
			if (messageNode?.role !== "assistant") return true

			const superMessageId = this.normalizeAssistantSuperMessageId(
				messageNode,
				String(envelope?.seq?.message?.app_message_id || ""),
			)
			const streamState = superMessageId
				? this.getStreamState(topicId, superMessageId)
				: undefined
			if (!streamState) return true

			return topicMeta.syncState !== "syncing" && !topicMeta.timer
		})
	}

	private processMessageBuffer(topicId: string) {
		const buffer = this.getTopicBuffer(topicId)
		if (buffer.messages.length > 0 && !buffer.isProcessing) {
			const nextMessageIndex = this.getNextProcessableBufferIndex(topicId, buffer.messages)
			if (nextMessageIndex < 0) return
			buffer.isProcessing = true
			const [nextMessage] = buffer.messages.splice(nextMessageIndex, 1)

			const messageNode = this.applyAssistantToolOwnership(
				topicId,
				getRawMessageNode(nextMessage?.seq?.message),
			)
			const rawAppMessageId = String(nextMessage?.seq?.message?.app_message_id || "")
			const superMessageId = this.normalizeAssistantSuperMessageId(
				messageNode,
				rawAppMessageId,
			)
			const message = this.normalizeAssistantMessageItem(
				transformRawMessage(nextMessage?.seq as RawSuperMagicMessageSequence),
				messageNode,
				rawAppMessageId,
			)

			if (messageNode && messageNode.role !== "assistant") {
				if (messageNode.role === "tool") {
					// tool response 已在 enqueueMessage / 入队时写入 canonical map；这里不再等待
					// assistant 动画，避免一个停住的 StreamState 永久卡住整个消息队列。
					this.recordToolResponse(topicId, messageNode, nextMessage?.seq?.seq_id)
				}

				console.log(
					"%c 【DEBUG】 消费队列 - 非 Assistant",
					"background-color: pink;color: white;padding:0 4px",
					JSON.parse(JSON.stringify(buffer)),
				)
				const messages = this.messages.get(topicId) || []
				messages.push(message)
				this.messages.set(topicId, unionBy(sortMessages(messages), "app_message_id"))
				this.setNonAssistantMessageNode(topicId, message.super_message_id, messageNode)
				this.publishMessageCommitted(topicId, message, messageNode, "im")

				buffer.isProcessing = false
				this.processMessageBuffer(topicId)
			} else {
				const correlationId = String(messageNode?.correlation_id || "")
				const topicMeta = this.getTopicMetadata(topicId)
				const currentSeqId = this.getAssistantRevisionSeqId(
					topicId,
					rawAppMessageId,
					superMessageId,
					false,
				)
				const incomingSeqId = nextMessage?.seq?.seq_id
				if (
					typeof currentSeqId === "string" &&
					typeof incomingSeqId === "string" &&
					compareMessageSeqId(incomingSeqId, currentSeqId) <= 0
				) {
					// HTTP 或先到 revision 已占据该逻辑卡时，buffer 中旧/重复副本不得回退 canonical。
					buffer.isProcessing = false
					this.processMessageBuffer(topicId)
					return
				}
				const bufferedFinalBarrier = superMessageId
					? this.getCanonicalFinalBarrier(topicId, superMessageId)
					: undefined
				if (superMessageId && bufferedFinalBarrier) {
					const isHigherRevision =
						typeof incomingSeqId === "string" &&
						Boolean(bufferedFinalBarrier.seqId) &&
						compareMessageSeqId(incomingSeqId, bufferedFinalBarrier.seqId) > 0
					if (!isHigherRevision) {
						// 已结算的同版本或旧版本仍是重复副本；保留 tombstone，阻止迟到 chunk 重开流。
						buffer.isProcessing = false
						this.processMessageBuffer(topicId)
						return
					}
					// 高 seq Final 是新 revision；不清除 tombstone，避免旧 chunk 在排队窗口重开流。
				}
				// 入队时上一轮可能还未完成 UI 投影；真正消费新 assistant 时再检查一次，
				// 此时上一轮 tool_calls 已可见，同时当前 assistant 仍被明确排除。
				if (
					messageNode?.role === "assistant" &&
					messageNode.event !== TASK_SUSPENDED_EVENT
				) {
					this.fillMissingToolResponses(topicId, [
						rawAppMessageId,
						superMessageId,
						correlationId,
					])
				}

				const existingStreamState = this.getStreamState(topicId, superMessageId)
				if (!existingStreamState) {
					this.commitBufferedAssistantSnapshotImmediately(
						topicId,
						superMessageId,
						correlationId,
						rawAppMessageId,
						message,
						messageNode as RawSuperMagicMessageNode,
					)
					return
				}
				const settlement = this.settleCanonicalAssistantFinal({
					source: "im",
					topicId,
					appMessageId: rawAppMessageId,
					superMessageId,
					correlationId,
					seqId: String(incomingSeqId || ""),
					finalNode: messageNode as RawSuperMagicMessageNode,
					finalMessage: message,
					revisionDecision: "new",
					emitEvents: true,
				})
				if (settlement.canonicalNode.status === "finished")
					this.fillMissingToolResponses(topicId)
			}
		}
	}

	/**
	 * 渲染 timer 是 Topic 级别的单一执行权。timer 释放后，之前因该执行权被
	 * 拒绝的 Assistant Final 必须重新尝试消费；否则 buffer 会永久停在“有消息但
	 * 没有后续事件”的状态。复用 buffer.isProcessing 作为 per-topic single-flight
	 * 门闩，避免 timer 回调、完成回调和其他入口在同一同步栈内重复消费。
	 */
	private processMessageBufferAfterRenderRelease(topicId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		const buffer = this.getTopicBuffer(topicId)
		if (
			topicMeta.syncState === "syncing" ||
			topicMeta.timer ||
			buffer.isProcessing ||
			buffer.messages.length === 0
		)
			return

		this.processMessageBuffer(topicId)
	}

	private startStreamRendering(topicId: string, superMessageId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.syncState === "syncing") return
		if (topicMeta?.timer) {
			return
		}
		const startedStreams = this.streamRenderStarted.get(topicId) || new Set<string>()
		startedStreams.add(superMessageId)
		this.streamRenderStarted.set(topicId, startedStreams)

		const streamState = this.getTopicStreamState(topicId, superMessageId)
		const correlationId = streamState.correlation_id
		const cachedNode = this.getAssistantMessageNode(topicId, superMessageId)
		let cache = cachedNode as RawSuperMagicMessageNode
		if (cache) {
			cache.correlation_id = correlationId
			cache.task_id = streamState.task_id
		}

		if (!cache) {
			cache = this.getDefaultNode(
				superMessageId,
				topicId,
				correlationId,
				streamState.task_id,
			) as RawSuperMagicMessageNode
			this.setAssistantMessageNode(topicId, superMessageId, cache)

			const messages = this.messages.get(topicId) || []
			const lastMessage = messages[messages.length - 1]
			const seqId = lastMessage ? addOneToBigNumberString(lastMessage.seq_id) : "1"

			const card = this.getDefaultMessage({
				topic_id: topicId,
				correlation_id: correlationId,
				super_message_id: superMessageId,
				app_message_id: superMessageId,
				seq_id: seqId,
			}) as any
			card.task_id = streamState.task_id
			card.content = cache.content
			card.reasoning_content = cache.reasoning_content
			card.tool_calls = cache.tool_calls
			card.debug = cache

			const nextMessages = messages.filter(
				(message) =>
					message.role !== "assistant" ||
					this.getMessageSuperMessageId(message) !== superMessageId,
			)
			this.messages.set(topicId, sortMessages([...nextMessages, card]))
		}

		if (topicMeta.renderPolicy === "instant") {
			if (streamState.isFinalMessageReceived) {
				this.settleTopicStreamsInstantly(topicId)
				return
			}

			cache.reasoning_content = streamState.reasoning_content
			cache.content = streamState.content
			const projectedToolCalls = this.cloneToolCallsForRendering(streamState.tool_calls)
			cache.tool_calls = projectedToolCalls
			streamState.currentToolIndex = projectedToolCalls.length
			this.setAssistantMessageNode(topicId, superMessageId, cache)
			this.syncAssistantCardProjection(topicId, superMessageId)
			topicMeta.renderPolicy = "live"
			this.scheduleStreamRecovery(topicId, superMessageId)
			return
		}

		if (topicId !== this.activeTopicId) {
			if (streamState.isFinalMessageReceived) {
				this.flushStreamToCompletion(topicId, superMessageId)
			}
			return
		}
		topicMeta.activeRenderSuperMessageId = superMessageId

		const progressed = this.resumeFromCurrentStateV2(topicId, superMessageId)
		this.syncAssistantCardProjection(topicId, superMessageId)

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
				this.completeStreamRendering(topicId, superMessageId)
				return
			}
		}
		if (!progressed && streamState.isFinalMessageReceived) {
			// final 已到但视觉状态无法继续推进时，权威快照优先，禁止继续创建 16ms 空转 timer。
			this.settleFinalStreamImmediately(topicId, superMessageId)
			return
		}
		if (!progressed && !streamState.isFinalMessageReceived) {
			// 流式无新数据且未收到最终消息 → 暂停定时器，等待下一个 chunk
			// 到达后由 receiveChunk 重启渲染；若长期没有有效数据则 watchdog 请求 HTTP 快照。
			if (topicMeta.renderPolicy === "catchup") topicMeta.renderPolicy = "live"
			topicMeta.activeRenderSuperMessageId = null
			this.scheduleStreamRecovery(topicId, superMessageId)
			// 一个 Topic 只有一个打字机 timer；当前流追平后立即让出给其他 SuperMessage。
			const nextStreamIdentity = Array.from(topicMeta.content.keys()).find(
				(identity) => identity !== superMessageId && !startedStreams.has(identity),
			)
			if (nextStreamIdentity) this.startStreamRendering(topicId, nextStreamIdentity)
			return
		}

		topicMeta.timer = setTimeout(() => {
			runInAction(() => {
				topicMeta.timer = null
				topicMeta.activeRenderSuperMessageId = null
				this.startStreamRendering(topicId, superMessageId)
				// The previous frame may have caught up without reaching a terminal
				// state. Once its timer releases, retry any canonical Final that was
				// held behind that render barrier.
				this.processMessageBufferAfterRenderRelease(topicId)
			})
		}, STREAM_RENDER_FRAME_MS)
	}

	/** Final 后工具声明也必须通过 render-only projection 逐步开放，不能重新使用 StreamState。 */
	private advanceFinalRenderToolCalls(
		visibleToolCalls: ToolCall[],
		targetToolCalls: ToolCall[],
		frameBudget: number,
	) {
		if (isToolCallsEqual(visibleToolCalls, targetToolCalls)) return visibleToolCalls
		const nextToolCalls = visibleToolCalls.map((toolCall) => ({
			...toolCall,
			function: { ...toolCall.function },
		}))
		const firstChangedIndex = targetToolCalls.findIndex((targetToolCall, index) => {
			const visibleToolCall = visibleToolCalls[index]
			const targetArguments = String(targetToolCall.function?.arguments || "")
			const visibleArguments = String(visibleToolCall?.function?.arguments || "")
			return (
				!visibleToolCall ||
				visibleToolCall.id !== targetToolCall.id ||
				visibleToolCall.function?.name !== targetToolCall.function?.name ||
				targetArguments !== visibleArguments
			)
		})
		if (firstChangedIndex < 0) return this.cloneToolCallsForRendering(targetToolCalls)

		const targetToolCall = targetToolCalls[firstChangedIndex]
		const visibleToolCall = visibleToolCalls[firstChangedIndex]
		const targetArguments = String(targetToolCall.function?.arguments || "")
		const visibleArguments = String(visibleToolCall?.function?.arguments || "")
		const nextArguments = targetArguments.startsWith(visibleArguments)
			? targetArguments.slice(
					0,
					Math.min(
						targetArguments.length,
						visibleArguments.length + Math.max(frameBudget, 1),
					),
				)
			: targetArguments
		const renderOnlyToolCall: ToolCall = {
			...targetToolCall,
			index: firstChangedIndex,
			function: {
				...targetToolCall.function,
				arguments: nextArguments,
			},
			// Keep the embedded response in the visual state at executing. Canonical detail
			// remains in toolResponseMap and is opened only after FinalRenderState completes.
			tool: visibleToolCall?.tool
				? { ...visibleToolCall.tool, status: "running" }
				: targetToolCall.tool
					? {
							id: targetToolCall.id,
							name: targetToolCall.tool.name || targetToolCall.function?.name || "",
							status: "running",
						}
					: undefined,
		}
		nextToolCalls[firstChangedIndex] = renderOnlyToolCall
		return nextToolCalls.slice(0, firstChangedIndex + 1)
	}

	/**
	 * 不可见话题收到 final 后：保存视觉快照，一次性写入 messageMap，
	 * 然后 completeStreamRendering 以正常排空 buffer / 触发事件。
	 */
	private flushStreamToCompletion(topicId: string, superMessageId: string) {
		const streamState = this.getTopicStreamState(topicId, superMessageId)
		const cache = this.getAssistantMessageNode(topicId, superMessageId)
		if (!cache || !streamState) return
		if (cache.role !== "assistant" || cache.super_message_id !== superMessageId) {
			this.completeStreamRendering(topicId, superMessageId)
			return
		}

		const topicMeta = this.getTopicMetadata(topicId)
		topicMeta.streamSnapshots.set(superMessageId, {
			reasoning_content: streamState.reasoning_content || "",
			content: (streamState.content as string) || "",
			tool_calls: this.cloneToolCallsForRendering(
				Array.isArray(cache.tool_calls) ? (cache.tool_calls as ToolCall[]) : [],
			),
		})

		cache.reasoning_content = streamState.reasoning_content
		cache.content = streamState.content
		cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
		this.setAssistantMessageNode(topicId, superMessageId, cache)
		this.syncAssistantCardProjection(topicId, superMessageId)

		this.completeStreamRendering(topicId, superMessageId)
	}

	private settleFinalStreamImmediately(topicId: string, superMessageId: string) {
		const streamState = this.getStreamState(topicId, superMessageId)
		const cache = this.getAssistantMessageNode(topicId, superMessageId)
		if (!streamState || !cache) return
		if (cache.role !== "assistant" || cache.super_message_id !== superMessageId) {
			streamState.stage = "done"
			this.completeStreamRendering(topicId, superMessageId)
			return
		}

		cache.reasoning_content = streamState.reasoning_content
		cache.content = streamState.content
		cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
		streamState.stage = "done"
		this.setAssistantMessageNode(topicId, superMessageId, cache)
		this.syncAssistantCardProjection(topicId, superMessageId)
		this.completeStreamRendering(topicId, superMessageId)
	}

	/**
	 * 服务端已确认话题终态时，直接把仍保留的 canonical stream 内容投影到消息节点，
	 * 一次性移除动画状态并释放 buffer，避免终态话题再次进入打字机循环。
	 */
	private settleTopicStreamsInstantly(topicId: string, streamIdentities?: ReadonlySet<string>) {
		const topicMeta = this.getTopicMetadata(topicId)
		const targetStreamIdentities = streamIdentities
			? Array.from(streamIdentities)
			: Array.from(topicMeta.content.keys())
		if (streamIdentities) {
			targetStreamIdentities.forEach((streamIdentity) => {
				this.clearStreamRecoveryTimer(topicId, streamIdentity)
			})
		} else {
			this.clearStreamRecoveryTimer(topicId)
		}
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
			topicMeta.activeRenderSuperMessageId = null
		}

		const messages = this.messages.get(topicId) || []
		targetStreamIdentities.forEach((superMessageId) => {
			const streamState = topicMeta.content.get(superMessageId)
			if (!streamState) return
			const cachedNode = this.getAssistantMessageNode(topicId, superMessageId)
			const cache =
				cachedNode ||
				(this.getDefaultNode(
					superMessageId,
					topicId,
					streamState.correlation_id,
					streamState.task_id,
				) as RawSuperMagicMessageNode)
			streamState.isFinalMessageReceived = true
			streamState.stage = "done"
			cache.reasoning_content = streamState.reasoning_content
			cache.content = streamState.content
			cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
			this.setAssistantMessageNode(topicId, superMessageId, cache)
			let targetMessage = messages.find(
				(message) =>
					message.role === "assistant" &&
					message.topic_id === topicId &&
					this.getMessageSuperMessageId(message) === superMessageId,
			)
			if (!targetMessage) {
				targetMessage = messages.find(
					(message) => this.getMessageSuperMessageId(message) === superMessageId,
				)
			}
			this.messageMap.set(superMessageId, cache)
			this.syncAssistantCardProjection(topicId, superMessageId)
			topicMeta.finalizedCorrelationIds.add(superMessageId)
			this.clearStreamRecoveryState(topicId, superMessageId)
			this.clearStreamChunkLedger(topicId, superMessageId)
		})

		targetStreamIdentities.forEach((streamIdentity) => {
			topicMeta.content.delete(streamIdentity)
			topicMeta.streamSnapshots.delete(streamIdentity)
		})
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
	}

	private completeStreamRendering(topicId: string, superMessageId?: string) {
		const meta = this.getTopicMetadata(topicId)
		this.clearStreamRecoveryTimer(topicId, superMessageId)
		if (superMessageId) this.clearStreamChunkLedger(topicId, superMessageId)
		meta.isStreamLoading = false
		if (meta.timer) {
			clearTimeout(meta.timer)
			meta.timer = null
		}
		if (!superMessageId || meta.activeRenderSuperMessageId === superMessageId) {
			meta.activeRenderSuperMessageId = null
		}
		const completedStreamState = superMessageId ? meta.content?.get(superMessageId) : undefined
		if (superMessageId && completedStreamState?.isFinalMessageReceived) {
			meta.finalizedCorrelationIds.add(superMessageId)
			this.clearStreamRecoveryState(topicId, superMessageId)
		}
		if (superMessageId && meta.content?.has(superMessageId)) {
			meta.content.delete(superMessageId)
		}
		if (superMessageId) {
			const startedStreams = this.streamRenderStarted.get(topicId)
			startedStreams?.delete(superMessageId)
			if (startedStreams?.size === 0) this.streamRenderStarted.delete(topicId)
		}
		this.topicMeta.set(topicId, meta)

		if (superMessageId) {
			const completedNode = this.getAssistantMessageNode(topicId, superMessageId) as
				RawSuperMagicMessageNode | undefined
			if (completedNode?.role === "assistant" && completedNode.status === "finished") {
				// finished assistant 是逐工具完成屏障。已有 canonical 或 buffer response
				// 会按 tool.id 被跳过，只为同轮真正缺失的工具生成弱终态。
				this.fillMissingToolResponses(topicId)
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

	private handleTopicSuspended(topicId: string, source: SuperMagicEventSource) {
		const topicMeta = this.topicMeta.get(topicId)
		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
		const previousToolResponses = new Map(toolResponseMap)
		const suspendedStreams: Array<{ superMessageId: string; correlationId: string }> = []

		topicMeta?.content.forEach((streamState, superMessageId) => {
			if (streamState.isFinalMessageReceived) return
			suspendedStreams.push({
				superMessageId,
				correlationId: streamState.correlation_id,
			})

			const validToolCalls = this.getProjectableToolCalls(streamState.tool_calls).filter(
				isToolCallArgumentsComplete,
			)

			streamState.tool_calls = validToolCalls
			streamState.isFinalMessageReceived = true

			const cache = this.getAssistantMessageNode(topicId, superMessageId)
			if (
				cache?.role === "assistant" &&
				cache.super_message_id === superMessageId &&
				cache.topic_id === topicId
			) {
				cache.tool_calls = validToolCalls.length > 0 ? validToolCalls : []
				this.setAssistantMessageNode(topicId, superMessageId, cache)
			}

			validToolCalls.forEach((tc) => {
				if (tc.id && !this.isAskUserToolCall(tc)) {
					const current = toolResponseMap.get(tc.id)
					if (!this.isSettledToolResponse(current)) {
						toolResponseMap.set(
							tc.id,
							this.mergeToolResponseState(
								current,
								this.createInterruptedToolResponse(tc),
							),
						)
					}
				}
			})

			this.completeStreamRendering(topicId, superMessageId)
		})

		this.fillInterruptedToolResponses(topicId, toolResponseMap)
		this.toolResponseMap.set(topicId, toolResponseMap)
		suspendedStreams.forEach(({ superMessageId, correlationId }) => {
			this.publishStreamEnded(
				topicId,
				superMessageId,
				"suspended",
				{ awaitingCanonicalMessage: false },
				source,
				correlationId,
			)
		})
		toolResponseMap.forEach((response, toolId) => {
			const previous = previousToolResponses.get(toolId)
			if (previous && isEqual(previous, response)) return
			this.publishToolCallSettled(topicId, toolId, response, undefined, source)
		})
	}

	private isAskUserToolCall(tc: ToolCall) {
		return tc.function?.name === ASK_USER_TOOL.name || tc.tool?.name === ASK_USER_TOOL.name
	}

	private isSettledToolResponse(response?: ToolResponseState) {
		return (
			response?.status === "finished" ||
			response?.status === "error" ||
			response?.status === "suspended"
		)
	}

	/**
	 * 在有业务完成屏障时，为仍缺少真实 tool response 的普通工具写入弱终态。
	 * 仅更新 canonical Map；buffer 已有真实响应、ask_user 或强终态工具都会跳过。
	 */
	private fillMissingToolResponses(topicId: string, currentAssistantIds: string[] = []) {
		const excludedAssistantIds = new Set(currentAssistantIds.filter(Boolean))
		const bufferedToolIds = new Set<string>()
		this.getTopicBuffer(topicId).messages.forEach((message) => {
			const node = getRawMessageNode(message?.seq?.message)
			if (node?.role !== "tool") return
			const toolId = typeof node.tool?.id === "string" ? node.tool.id.trim() : ""
			if (toolId) bufferedToolIds.add(toolId)
		})

		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
		let changed = false
		const settlements: Array<{ toolId: string; response: ToolResponseState }> = []
		const settleToolCalls = (toolCalls: ToolCall[]) => {
			toolCalls.forEach((toolCall) => {
				const toolId = String(toolCall.id || "")
				if (!toolId || this.isAskUserToolCall(toolCall) || bufferedToolIds.has(toolId))
					return

				const current = toolResponseMap.get(toolId)
				if (
					current?.status === "finished" ||
					current?.status === "error" ||
					current?.status === "suspended" ||
					current?.status === "response_missing"
				)
					return

				const missingResponse: ToolResponseState = {
					...(toolCall.tool || {}),
					id: toolId,
					name: toolCall.tool?.name || toolCall.function?.name || "",
					status: "response_missing",
				}
				const nextState = this.mergeToolResponseState(current, missingResponse)
				toolResponseMap.set(toolId, nextState)
				settlements.push({ toolId, response: nextState })
				changed = true
			})
		}

		;(this.messages.get(topicId) || []).forEach((message) => {
			if (message.role !== "assistant") return
			const node = this.messageMap.get(this.getMessageSuperMessageId(message)) as
				RawSuperMagicMessageNode | undefined
			if (!node) return
			if (
				excludedAssistantIds.has(this.getMessageSuperMessageId(message)) ||
				excludedAssistantIds.has(message.correlation_id) ||
				excludedAssistantIds.has(String(node.correlation_id || ""))
			)
				return

			const toolCalls = Array.isArray(node.tool_calls) ? (node.tool_calls as ToolCall[]) : []
			settleToolCalls(toolCalls)
		})

		// 下一 assistant 可能在上一条长工具参数仍处于动画投影时到达。此时
		// messageMap 尚未展示完整 tool_calls，但 StreamState 已持有 canonical final 数据。
		this.topicMeta.get(topicId)?.content.forEach((streamState, correlationId) => {
			if (excludedAssistantIds.has(correlationId)) return
			settleToolCalls(streamState.tool_calls)
		})

		if (changed) {
			this.toolResponseMap.set(topicId, toolResponseMap)
			settlements.forEach(({ toolId, response }) => {
				this.publishToolCallSettled(topicId, toolId, response)
			})
		}
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

			const node = this.messageMap.get(this.getMessageSuperMessageId(msg)) as
				RawSuperMagicMessageNode | undefined
			const toolCalls = (node?.tool_calls as ToolCall[]) || []
			if (toolCalls.length === 0) continue

			let hasUnresolved = false
			toolCalls.forEach((tc) => {
				if (tc.id && !this.isAskUserToolCall(tc)) {
					const current = toolResponseMap.get(tc.id)
					if (this.isSettledToolResponse(current)) return
					hasUnresolved = true
					toolResponseMap.set(
						tc.id,
						this.mergeToolResponseState(
							current,
							this.createInterruptedToolResponse(tc),
						),
					)
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
	 * 最终 assistant 是工具调用的权威快照：
	 * - 已有合法 id 按稳定 identity 匹配，arguments/name/label 以最终态覆盖；
	 * - 参数先到形成的临时 index 槽位会被同 index 的最终工具升级；
	 * - 最终快照中不存在的匿名或脏工具直接丢弃，避免幽灵工具进入 UI。
	 */
	private reconcileFinalToolCalls(current: ToolCall[], incoming: ToolCall[]): ToolCall[] {
		const finalTools = this.dedupeFinalToolCallsById(
			this.getFinalProjectableToolCalls(incoming),
		)
		if (finalTools.length === 0) return []

		return finalTools.map((finalTool, incomingIndex) => {
			const existingById = current.find(
				(existing) => existing?.id && existing.id === finalTool.id,
			)
			const protocolSlotIndex = Number.isInteger(finalTool.index)
				? Number(finalTool.index)
				: incomingIndex
			const existingBySlot = current[protocolSlotIndex]
			const existing =
				existingById ||
				(this.isTemporaryToolSlot(existingBySlot, protocolSlotIndex)
					? existingBySlot
					: undefined)
			const hasFinalArguments = Boolean(
				finalTool.function &&
				Object.prototype.hasOwnProperty.call(finalTool.function, "arguments") &&
				finalTool.function.arguments !== undefined,
			)
			// TC-03 只允许同一稳定 tool id 继承参数；匿名 index 槽位仅用于升级身份，
			// 不能在 Final 漏字段时把未归属的 arguments 借给一个新工具。
			const canInheritArguments = Boolean(existing?.id && existing.id === finalTool.id)
			return {
				...existing,
				...finalTool,
				id: finalTool.id,
				type: finalTool.type || "function",
				index: incomingIndex,
				function: {
					...existing?.function,
					...finalTool.function,
					name: finalTool.function?.name || "",
					label: finalTool.function?.label || "",
					arguments: hasFinalArguments
						? typeof finalTool.function?.arguments === "string"
							? finalTool.function.arguments
							: ""
						: canInheritArguments && typeof existing?.function?.arguments === "string"
							? existing.function.arguments
							: "",
				},
			}
		})
	}

	/** Final is canonical per tool id; duplicate values use last-write-wins. */
	private dedupeFinalToolCallsById(finalTools: ToolCall[]): ToolCall[] {
		const deduped: ToolCall[] = []
		const outputIndexById = new Map<string, number>()
		const sourceIndexById = new Map<string, number>()

		finalTools.forEach((toolCall, incomingIndex) => {
			const toolCallId = String(toolCall.id || "")
			const outputIndex = outputIndexById.get(toolCallId)
			if (outputIndex === undefined) {
				outputIndexById.set(toolCallId, deduped.length)
				sourceIndexById.set(toolCallId, incomingIndex)
				deduped.push(toolCall)
				return
			}

			console.warn("[SuperMagicStore] duplicate final tool call id", {
				toolCallId,
				previousIndex: sourceIndexById.get(toolCallId),
				incomingIndex,
				resolution: "last-write-wins",
			})
			deduped[outputIndex] = toolCall
			sourceIndexById.set(toolCallId, incomingIndex)
		})

		return deduped
	}

	private isAnonymousToolSlot(toolCall: ToolCall | undefined) {
		const hasArguments = typeof toolCall?.function?.arguments === "string"
		const toolId = String(toolCall?.id || "").trim()
		const toolName = String(toolCall?.function?.name || "").trim()
		return hasArguments && !toolId && !toolName
	}

	private getToolCallProjectionRejectionReason(toolCall: ToolCall | undefined) {
		if (!String(toolCall?.id || "").trim()) return "missing-tool-id"
		const fn = toolCall?.function as unknown
		if (!fn || Array.isArray(fn) || typeof fn !== "object") return "invalid-function"
		if (!String((fn as { name?: unknown }).name || "").trim()) {
			return "missing-function-name"
		}
		return undefined
	}

	private isProjectableToolCall(toolCall: ToolCall | undefined) {
		return this.getToolCallProjectionRejectionReason(toolCall) === undefined
	}

	private getFinalProjectableToolCalls(toolCalls: ToolCall[] = []): ToolCall[] {
		return compactToolCalls(toolCalls).filter((toolCall, incomingIndex) => {
			const reason = this.getToolCallProjectionRejectionReason(toolCall)
			if (!reason) return true
			// Anonymous slots are an existing streamed-arguments compatibility shape. They stay
			// non-projectable without being reported as a malformed stable tool contract.
			if (reason === "missing-tool-id") return false

			console.warn("[SuperMagicStore] invalid final tool call", {
				toolCallId: String(toolCall?.id || ""),
				incomingIndex,
				reason,
				resolution: "exclude-from-canonical-projection",
			})
			return false
		})
	}

	private getProjectableToolCalls(toolCalls: ToolCall[] = []): ToolCall[] {
		return compactToolCalls(toolCalls).filter((toolCall) =>
			this.isProjectableToolCall(toolCall),
		)
	}

	private isTemporaryToolSlot(toolCall: ToolCall | undefined, index: number) {
		const toolId = String(toolCall?.id || "")
		return (
			this.isAnonymousToolSlot(toolCall) ||
			!toolId ||
			(toolId === String(index) && !toolCall?.function?.name)
		)
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

	private cloneToolCallsForRendering(toolCalls: ToolCall[]): ToolCall[] {
		return this.getProjectableToolCalls(toolCalls).map((toolCall, index) => ({
			...toolCall,
			index,
			function: { ...toolCall.function },
		}))
	}

	private resumeFromCurrentStateV2(topicId: string, superMessageId: string): boolean {
		const streamState = this.getTopicStreamState(topicId, superMessageId)
		const messageMap =
			this.getAssistantMessageNode(topicId, superMessageId) ||
			this.getDefaultNode(
				superMessageId,
				topicId,
				streamState.correlation_id,
				streamState.task_id,
			)

		const finalContent = streamState.content || ""
		const finalReasoningContent = streamState.reasoning_content || ""
		const finalTools = this.getProjectableToolCalls(streamState.tool_calls)
		if (!messageMap.reasoning_content) messageMap.reasoning_content = ""
		if (!messageMap.content) messageMap.content = ""

		if (streamState.isFinalMessageReceived) {
			// 非前缀 Final 是权威纠错，不能伪造追加动画；只对可安全续接的尾部做多帧推进。
			if (
				messageMap.reasoning_content &&
				finalReasoningContent &&
				!finalReasoningContent.startsWith(messageMap.reasoning_content)
			) {
				messageMap.reasoning_content = finalReasoningContent
			}
			if (
				messageMap.content &&
				finalContent &&
				!finalContent.startsWith(messageMap.content)
			) {
				messageMap.content = finalContent
			}

			const remainingReasoningContent = finalReasoningContent.startsWith(
				messageMap.reasoning_content,
			)
				? finalReasoningContent.slice(messageMap.reasoning_content.length)
				: ""
			const remainingContent = finalContent.startsWith(messageMap.content)
				? finalContent.slice(messageMap.content.length)
				: ""
			const totalRemaining = remainingReasoningContent.length + remainingContent.length

			if (totalRemaining > 0) {
				let frameBudget = this.getStreamRenderStep(topicId, totalRemaining, streamState)
				let progressed = false

				if (remainingReasoningContent && frameBudget > 0) {
					streamState.stage = "reasoning_content"
					const reasoningStep = adjustSliceEnd(
						remainingReasoningContent,
						Math.min(frameBudget, remainingReasoningContent.length),
					)
					messageMap.reasoning_content += remainingReasoningContent.slice(
						0,
						reasoningStep,
					)
					frameBudget = Math.max(frameBudget - reasoningStep, 0)
					progressed = reasoningStep > 0
				}

				if (remainingContent && frameBudget > 0) {
					streamState.stage = "content"
					const contentStep = adjustSliceEnd(
						remainingContent,
						Math.min(frameBudget, remainingContent.length),
					)
					messageMap.content += remainingContent.slice(0, contentStep)
					progressed = contentStep > 0 || progressed
				}

				if (progressed) {
					this.setAssistantMessageNode(topicId, superMessageId, messageMap)
					return true
				}
			}
		}

		// --------------------------
		// 1. 续流思考（直接补全）
		// --------------------------
		if (
			!streamState.isFinalMessageReceived &&
			finalReasoningContent &&
			finalReasoningContent !== messageMap?.reasoning_content
		) {
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
				this.getStreamRenderStep(topicId, remainingReasoningContent.length, streamState),
			)
			messageMap.reasoning_content += remainingReasoningContent.slice(0, rcStep)
			this.setAssistantMessageNode(topicId, superMessageId, messageMap)
			return true
		}

		// --------------------------
		// 2. 续流正文（从当前截断位置续流）
		// --------------------------
		if (
			!streamState.isFinalMessageReceived &&
			finalContent &&
			finalContent !== messageMap?.content
		) {
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
				this.getStreamRenderStep(topicId, remainingContent.length, streamState),
			)
			messageMap.content += remainingContent.slice(0, cStep)
			this.setAssistantMessageNode(topicId, superMessageId, messageMap)
			return true
		}

		// --------------------------
		// 3. 续流工具（基于 topicMeta.tool_calls 续流到 messageMap）
		// --------------------------
		if (!Array.isArray(messageMap.tool_calls)) messageMap.tool_calls = []
		const orderedFinalTools = streamState.isFinalMessageReceived
			? finalTools
			: this.reorderToolCallsByExisting(messageMap.tool_calls as ToolCall[], finalTools)
		if (
			streamState.isFinalMessageReceived &&
			!isToolCallsEqual(messageMap.tool_calls, orderedFinalTools)
		) {
			// Final assistant 是权威快照；工具字段整体替换，禁止继续拼接 streamed arguments。
			messageMap.tool_calls = this.cloneToolCallsForRendering(orderedFinalTools)
			streamState.stage = "done"
			this.setAssistantMessageNode(topicId, superMessageId, messageMap)
			return false
		}
		if (!isToolCallsEqual(messageMap.tool_calls, orderedFinalTools)) {
			streamState.stage = "tool"

			console.log("【LS】 tool_calls", streamState.stage)
			const toolStepResult = this.streamToolCallsBySingleUnit(
				topicId,
				messageMap,
				streamState,
				orderedFinalTools,
			)
			this.setAssistantMessageNode(topicId, superMessageId, messageMap)
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
				if (toolSynced) this.setAssistantMessageNode(topicId, superMessageId, messageMap)
			}
			streamState.stage = "done"
		}
		console.log("【LS】 done", streamState.stage)
		return false
	}

	private beginFinalSettling(topicMeta: TopicMeta, streamState: StreamState) {
		streamState.isFinalMessageReceived = true
		if (topicMeta.renderPolicy === "instant") return
		if (streamState.renderPace !== "live") return

		// Final 单独到达时只提高每帧字符量；真正的 1.5 秒预算必须等后继消息出现后再开始。
		streamState.renderPace = "settling"
		streamState.settlingStartedAt = getMonotonicNow()
		streamState.finalCatchupDeadlineAt = null
		streamState.catchupMinimumFramesRemaining = 0
	}

	private promoteFinalStreamToCatchup(
		streamState: StreamState,
		budgetMs = FINAL_STREAM_CATCHUP_BUDGET_MS,
		remaining = this.getFinalTextRemaining(streamState),
	) {
		if (!streamState.isFinalMessageReceived || streamState.renderPace === "catchup") return

		streamState.renderPace = "catchup"
		streamState.finalCatchupDeadlineAt = getMonotonicNow() + budgetMs
		streamState.catchupMinimumFramesRemaining =
			remaining > FINAL_STREAM_SMALL_TAIL ? FINAL_STREAM_MIN_VISIBLE_FRAMES : 0
	}

	/**
	 * 新消息进入 Store 时立即提升当前 Final 的视觉速度，不能等到 Buffer 消费，
	 * 否则当前 Topic 的唯一 timer 本身会阻塞后继消息并形成队头等待。
	 */
	private promoteActiveFinalStreamForSuccessor(topicId: string, successorSuperMessageId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		const activeSuperMessageId = topicMeta.activeRenderSuperMessageId
		if (!activeSuperMessageId || activeSuperMessageId === successorSuperMessageId) return

		const activeStreamState = topicMeta.content.get(activeSuperMessageId)
		if (!activeStreamState || activeStreamState.stage === "done") return
		this.promoteFinalStreamToCatchup(
			activeStreamState,
			FINAL_STREAM_CATCHUP_BUDGET_MS,
			this.getFinalTextRemaining(
				activeStreamState,
				this.getAssistantMessageNode(topicId, activeSuperMessageId),
			),
		)
	}

	private getFinalTextRemaining(streamState: StreamState, messageMap?: RawSuperMagicMessageNode) {
		const reasoningContent = String(messageMap?.reasoning_content || "")
		const content = String(messageMap?.content || "")
		const remainingReasoning = streamState.reasoning_content.startsWith(reasoningContent)
			? streamState.reasoning_content.length - reasoningContent.length
			: 0
		const remainingContent = streamState.content.startsWith(content)
			? streamState.content.length - content.length
			: 0
		return Math.max(remainingReasoning, 0) + Math.max(remainingContent, 0)
	}

	private getStreamRenderStep(
		topicId: string,
		remaining: number,
		streamState: StreamState,
	): number {
		const liveStep = getCharsPerTick(remaining)
		const topicMeta = this.getTopicMetadata(topicId)
		const settlingStep = Math.min(
			liveStep * FINAL_STREAM_SETTLING_MULTIPLIER,
			FINAL_STREAM_MAX_SETTLING_BATCH,
		)
		if (
			streamState.renderPace === "settling" &&
			streamState.settlingStartedAt !== null &&
			getMonotonicNow() - streamState.settlingStartedAt >= FINAL_STREAM_SETTLING_MAX_MS
		) {
			// 没有后继消息也不能永久占用渲染通道；安全追平仍保持多帧推进。
			this.promoteFinalStreamToCatchup(
				streamState,
				FINAL_STREAM_SAFETY_CATCHUP_BUDGET_MS,
				remaining,
			)
		}

		const shouldCatchup =
			topicMeta.renderPolicy === "catchup" || streamState.renderPace === "catchup"
		if (!shouldCatchup) {
			return streamState.renderPace === "settling" ? settlingStep : liveStep
		}
		if (streamState.finalCatchupDeadlineAt !== null) {
			const remainingBudgetMs = Math.max(
				streamState.finalCatchupDeadlineAt - getMonotonicNow(),
				0,
			)
			const deadlineFrames = Math.ceil(remainingBudgetMs / STREAM_RENDER_FRAME_MS)
			const minimumVisibleFrames =
				remaining > FINAL_STREAM_SMALL_TAIL ? streamState.catchupMinimumFramesRemaining : 0
			const remainingFrames = Math.max(deadlineFrames, minimumVisibleFrames, 1)
			if (streamState.catchupMinimumFramesRemaining > 0) {
				streamState.catchupMinimumFramesRemaining -= 1
			}
			return Math.min(
				remaining,
				FINAL_STREAM_MAX_CATCHUP_BATCH,
				Math.max(settlingStep, Math.ceil(remaining / remainingFrames)),
			)
		}
		// 追平必须至少不慢于实时打字机；calculateBatchSize 负责放大小文本尾段的推进步长。
		return Math.max(liveStep, calculateBatchSize(remaining, true))
	}

	private streamToolCallsBySingleUnit(
		topicId: string,
		messageMap: ToolStreamMessageState,
		streamState: StreamState,
		finalTools: ToolCall[],
	): ToolStreamStepResult {
		const projectableTools = this.getProjectableToolCalls(finalTools)
		if (projectableTools.length === 0) {
			streamState.currentToolIndex = 0
			return { progressed: false, done: true }
		}

		let startIndex = Math.max(streamState.currentToolIndex || 0, 0)

		for (let j = 0; j < Math.min(startIndex, projectableTools.length); j++) {
			const cur = get(messageMap, ["tool_calls", j, "function", "arguments"], "")
			const fin = projectableTools[j]?.function?.arguments || ""
			if (cur.length < fin.length) {
				startIndex = j
				break
			}
		}

		for (let i = startIndex; i < projectableTools.length; i++) {
			const finalTool = projectableTools[i]
			const toolId = finalTool.id
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
				const step = this.getStreamRenderStep(topicId, remaining, streamState)
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
				done: streamState.currentToolIndex >= projectableTools.length,
			}
		}

		streamState.currentToolIndex = projectableTools.length
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
		if (!topicMeta?.content?.size || topicMeta.timer || topicMeta.syncState === "syncing")
			return

		const firstCorrelationId = topicMeta.content.keys().next().value
		if (firstCorrelationId) {
			this.startStreamRendering(topicId, firstCorrelationId)
		}
	}

	isTopicStreaming(topicId: string): boolean {
		return (this.topicMeta.get(topicId)?.content?.size ?? 0) > 0
	}

	/**
	 * 返回当前 Topic 的活跃流身份快照，供 UI 判断流式消息是否已经形成可见消息行。
	 * 始终创建新数组，避免调用方修改 TopicMeta 内部的 StreamState Map。
	 */
	getActiveStreamSuperMessageIds(topicId: string): string[] {
		return Array.from(this.topicMeta.get(topicId)?.content?.keys() ?? [])
	}

	/**
	 * @description 获取消息节点
	 * @param superMessageId Store/UI 统一消息身份
	 * @returns 消息节点
	 */
	getMessageNode(superMessageId?: string) {
		return this.messageMap.get(superMessageId || "")
	}

	private getTopicMetadata(topicId: string): TopicMeta {
		if (!this.topicMeta.has(topicId)) {
			this.topicMeta.set(topicId, getDefaultTopicMeta())
		}
		return this.topicMeta.get(topicId)!
	}

	private getTopicStreamState(
		topicId: string,
		superMessageId: string,
		correlationId = "",
		taskId = "",
	): StreamState {
		const topicMeta = this.getTopicMetadata(topicId)
		const resolvedCorrelationId =
			correlationId || this.getStreamCorrelationId(topicId, superMessageId)

		if (!topicMeta.content?.has(superMessageId)) {
			topicMeta.content?.set(
				superMessageId,
				createStreamState({ superMessageId, correlationId: resolvedCorrelationId, taskId }),
			)
		}

		const streamState = topicMeta.content?.get(superMessageId)
		if (streamState) {
			if (correlationId) streamState.correlation_id = correlationId
			streamState.task_id = taskId || streamState.task_id
		}
		return streamState as StreamState
	}

	getStreamState(topicId: string, identity: string): StreamState | undefined {
		const streamIdentity = this.findStreamIdentity(topicId, identity)
		return streamIdentity
			? this.topicMeta.get(topicId)?.content?.get(streamIdentity)
			: undefined
	}

	private getDefaultNode(
		superMessageId: string,
		topicId: string,
		correlationId = superMessageId,
		taskId = "",
	): any {
		return {
			attachments: [],
			content: "",
			correlation_id: correlationId,
			super_message_id: superMessageId,
			task_id: taskId,
			name: null,
			reasoning_content: "",
			role: "assistant",
			status: "running",
			tool: null,
			tool_call_id: null,
			tool_calls: null,
			topic_id: topicId,
			usage: null,
		}
	}

	private getDefaultMessage(node: Record<string, string>) {
		const role = node.role || "assistant"
		return {
			type: "super_magic_message",
			unread_count: 0,
			sender_id: "sender_id",
			send_time: dayjs().unix(),
			status: "unread",
			imStatus: "unread",
			superStatus: role === "user" ? undefined : "running",
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
				imStatus: "read",
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
	const hasFinishReason = message.super_magic_chunk?.choices?.some((choice) =>
		Boolean(choice?.finish_reason),
	)
	superMagicStore.recordWebSocketMessage(
		message.topic_id,
		message,
		"super_magic_chunk",
		hasFinishReason,
	)
	superMagicStore.receiveChunk(message, { persist: false })
})

pubsub.subscribe(PubSubEvents.Super_Magic_New_Message_V2, (payload) => {
	const message = payload as unknown as RawSuperMagicMessageSequence
	const messageType = message?.message?.type
	const source =
		messageType === "super_magic_message"
			? "super_magic_message"
			: messageType === "text" || messageType === "rich_text"
				? "conversation_message"
				: undefined
	if (!source) return
	const topicId = String(
		message.message.topic_id || message.message.super_magic_message?.topic_id || "",
	)
	superMagicStore.recordWebSocketMessage(topicId, message, source, true)
})

superMagicStore.subscribe("task.completed", (payload: TaskCompletedPayload) => {
	console.log("%c task.completed", "background: red; color: white;padding:0 4px", payload)
})

superMagicStore.subscribe("topic.execution.ended", (payload: TopicExecutionEndedPayload) => {
	console.log("%c topic.execution.ended", "background: red; color: white;padding:0 4px", payload)
})
