import { makeAutoObservable, runInAction, toJS } from "mobx"
import pubsub from "@/utils/pubsub"
import { unionBy, get, set, merge, isEqual } from "lodash-es"
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
	StreamRecoveryState,
	StreamRecoveryFailurePayload,
	InitializeMessagesOptions,
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
	StreamRecoveryState,
	StreamRecoveryFailurePayload,
	InitializeMessagesOptions,
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

interface StreamChunkLedger {
	nextChunkIndex: number
	pendingChunks: Map<number, StreamChunkPayload>
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

type AssistantSnapshotMode = "terminal" | "nonterminal"

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
	/** 分享消息会被整批、逐条和旧前缀重复回放；该 sidecar 只记录单 topic 的顺序与待结算工具。 */
	private sharedReplayStates = new Map<string, SharedReplayState>()
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
				onStreamRecoveryFailedCallbacks: false,
				topicSyncGenerationCounter: false,
				pendingTopicSyncFinalizations: false,
				topicSyncContexts: false,
				streamChunkLedgers: false,
				latestToolResponseSeqIds: false,
				sharedReplayStates: false,
				streamRecoveryStates: false,
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

	private emitDomainEvents(payload: TopicMessageListenerPayload) {
		resolveDomainEvents(payload).forEach((event) => {
			this.domainEventRegistry.emit(event)
		})
	}

	private emitTopicMessageArrived(payload: TopicMessageListenerPayload) {
		this.topicMessageListenerRegistry.emit(payload)
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
				previousMeta.inactiveMonotonicAt = getMonotonicNow()
				if (previousMeta.timer) {
					clearTimeout(previousMeta.timer)
					previousMeta.timer = null
				}
				this.clearStreamRecoveryTimer(prevTopicId)
			}
		}
		this.activeTopicId = topicId
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
			| { messages: RawSuperMagicMessageEnvelope[] }
			| undefined
		if (!buffer) return []
		return buffer.messages.flatMap((envelope) => {
			const rawNode = getRawMessageNode(envelope?.seq?.message)
			const correlationId = String(rawNode?.correlation_id || "")
			return rawNode?.role === "assistant" && correlationId ? [correlationId] : []
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

	getStreamRecoveryState(
		topicId: string,
		correlationId: string,
	): StreamRecoveryState | undefined {
		const state = this.streamRecoveryStates.get(
			this.getStreamRecoveryKey(topicId, correlationId),
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
		correlationId: string,
		state: InternalStreamRecoveryState,
	) {
		if (state.status === "failed") return
		this.clearStreamRecoveryTimer(topicId, correlationId)
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
			correlationId,
			status: "failed",
			reason: "recovery_failed",
			attempts: state.attempts,
			startedAt: state.startedAt,
			elapsedMs: state.elapsedMs,
		})
	}

	private getStreamChunkLedger(topicId: string, correlationId: string): StreamChunkLedger {
		const key = `${topicId}\u0000${correlationId}`
		let ledger = this.streamChunkLedgers.get(key)
		if (!ledger) {
			ledger = { nextChunkIndex: 0, pendingChunks: new Map() }
			this.streamChunkLedgers.set(key, ledger)
		}
		return ledger
	}

	private clearStreamChunkLedger(topicId: string, correlationId: string) {
		this.streamChunkLedgers.delete(`${topicId}\u0000${correlationId}`)
	}

	private requestStreamRecovery(
		topicId: string,
		correlationId: string,
		recoveryState: InternalStreamRecoveryState,
		streamState?: StreamState,
	) {
		if (recoveryState.status === "failed" || recoveryState.status === "recovering") return
		const elapsedMs = Math.max(Date.now() - recoveryState.startedAt, 0)
		if (
			recoveryState.attempts >= STREAM_RECOVERY_MAX_ATTEMPTS ||
			elapsedMs >= STREAM_RECOVERY_TOTAL_BUDGET_MS
		) {
			this.failStreamRecovery(topicId, correlationId, recoveryState)
			return
		}

		recoveryState.attempts += 1
		recoveryState.elapsedMs = elapsedMs
		recoveryState.status = "recovering"
		if (streamState) streamState.recoveryAttempts = recoveryState.attempts
		this.armStreamRecoveryDeadline(topicId, correlationId, recoveryState)
		this.emitStreamRecoveryRequested({ topicId, correlationId })
	}

	/**
	 * 渲染追平后进入等待态时启动一次 watchdog。等待态本身是正常的，只有超过阈值仍未
	 * 收到可渲染数据才请求 HTTP 权威快照，避免把“模型思考中”误判成卡死。
	 */
	private scheduleStreamRecovery(
		topicId: string,
		correlationId: string,
		allowMissingStreamState = false,
	) {
		const topicMeta = this.getTopicMetadata(topicId)
		const streamState = topicMeta.content.get(correlationId)
		if ((!streamState && !allowMissingStreamState) || streamState?.isFinalMessageReceived)
			return
		if (topicMeta.syncState === "syncing") return
		if (topicId !== this.activeTopicId) return
		const recoveryState = this.ensureStreamRecoveryState(topicId, correlationId)
		if (recoveryState.status === "failed") return
		if (recoveryState.status === "recovering") return
		if (recoveryState.watchdogTimer) return
		const elapsedMs = Math.max(Date.now() - recoveryState.startedAt, 0)
		if (
			recoveryState.attempts >= STREAM_RECOVERY_MAX_ATTEMPTS ||
			elapsedMs >= STREAM_RECOVERY_TOTAL_BUDGET_MS
		) {
			this.failStreamRecovery(topicId, correlationId, recoveryState)
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
		this.markStreamRecoveryWaiting(topicId, correlationId)
		recoveryState.watchdogTimer = setTimeout(() => {
			runInAction(() => {
				const currentStreamState = topicMeta.content.get(correlationId)
				const currentRecoveryState = this.streamRecoveryStates.get(
					this.getStreamRecoveryKey(topicId, correlationId),
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
					correlationId,
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
		this.clearStreamRecoveryTimer(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}
		const generation = ++this.topicSyncGenerationCounter
		topicMeta.syncGeneration = generation
		topicMeta.syncState = "syncing"
		// 同一时刻只有全局最新 generation 可写回；旧代次已在上方释放为 idle。
		this.pendingTopicSyncFinalizations.set(topicId, {
			generation,
			snapshots: new Map(),
		})
		this.topicSyncContexts.set(topicId, {
			generation,
			correlationIds: this.getTrackedTopicCorrelationIds(topicId),
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
		}: {
			succeeded: boolean
			taskStatus?: string
			latestSeqId?: string
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
		const isSuccessfulFinishedSync = Boolean(succeeded && isFinishedSync)
		const isSuccessfulSuspendedSync = Boolean(succeeded && taskStatus === "suspended")
		const isTerminalTopic = Boolean(taskStatus && TERMINAL_TOPIC_TASK_STATUSES.has(taskStatus))
		const hasCurrentFinalizationSnapshot = Boolean(
			isSuccessfulFinishedSync && pendingFinalizations?.generation === generation,
		)

		if (isTerminalTopic) {
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
			this.handleTopicSuspended(topicId)
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
		correlationId: string,
	) {
		return messages.reduce<MessageItem | undefined>((latest, message) => {
			if (message.role !== "assistant") return latest
			const matchesIdentity =
				(Boolean(appMessageId) && message.app_message_id === appMessageId) ||
				(Boolean(correlationId) && message.correlation_id === correlationId)
			if (!matchesIdentity) return latest
			if (!latest || compareMessageSeqId(message.seq_id, latest.seq_id) > 0) return message
			return latest
		}, undefined)
	}

	private upsertAuthoritativeMessage(messages: MessageItem[], incoming: MessageItem) {
		const existingIndex = messages.findIndex(
			(message) =>
				message.app_message_id === incoming.app_message_id ||
				(incoming.role === "assistant" &&
					message.role === "assistant" &&
					Boolean(incoming.correlation_id) &&
					message.correlation_id === incoming.correlation_id),
		)
		if (existingIndex < 0) {
			messages.push(incoming)
			return
		}
		messages[existingIndex] = incoming
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

	private isAppMessageIdReferencedByOtherTopic(topicId: string, appMessageId: string) {
		return Array.from(this.messages.entries()).some(
			([candidateTopicId, messages]) =>
				candidateTopicId !== topicId &&
				messages.some((message) => message.app_message_id === appMessageId),
		)
	}

	private isAssistantCorrelationReferencedByOtherTopic(topicId: string, correlationId: string) {
		return Array.from(this.messages.entries()).some(
			([candidateTopicId, messages]) =>
				candidateTopicId !== topicId &&
				messages.some(
					(message) =>
						message.role === "assistant" && message.correlation_id === correlationId,
				),
		)
	}

	private removeTopicMessageNodesOutsideSnapshot(
		topicId: string,
		previousMessages: MessageItem[],
		nextMessages: MessageItem[],
	) {
		const retainedAppMessageIds = new Set(nextMessages.map((message) => message.app_message_id))
		const retainedAssistantCorrelations = new Set(
			nextMessages
				.filter((message) => message.role === "assistant" && message.correlation_id)
				.map((message) => message.correlation_id),
		)

		previousMessages.forEach((message) => {
			if (retainedAppMessageIds.has(message.app_message_id)) return
			const preservesCorrelationAlias = Boolean(
				message.role === "assistant" &&
				message.correlation_id &&
				message.app_message_id === message.correlation_id &&
				retainedAssistantCorrelations.has(message.correlation_id),
			)
			if (
				!preservesCorrelationAlias &&
				!this.isAppMessageIdReferencedByOtherTopic(topicId, message.app_message_id)
			) {
				this.messageMap.delete(message.app_message_id)
			}

			if (message.role !== "assistant" || !message.correlation_id) return
			if (retainedAssistantCorrelations.has(message.correlation_id)) return
			const correlationNode = this.messageMap.get(message.correlation_id) as
				| RawSuperMagicMessageNode
				| undefined
			if (
				correlationNode?.role === "assistant" &&
				correlationNode.correlation_id === message.correlation_id &&
				!this.isAssistantCorrelationReferencedByOtherTopic(topicId, message.correlation_id)
			) {
				this.messageMap.delete(message.correlation_id)
			}
		})
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
		const discardedCorrelationIds = new Set(
			Array.from(syncContext.correlationIds).filter(
				(correlationId) => !syncContext.authoritativeCorrelationIds.has(correlationId),
			),
		)
		if (discardedCorrelationIds.size === 0) return

		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}

		const previousMessages = this.messages.get(topicId) || []
		const retainedMessages = previousMessages.filter(
			(message) =>
				!(
					message.role === "assistant" &&
					message.topic_id === topicId &&
					discardedCorrelationIds.has(message.correlation_id)
				),
		)
		this.removeTopicMessageNodesOutsideSnapshot(topicId, previousMessages, retainedMessages)
		this.messages.set(topicId, retainedMessages)

		const buffer = this.getTopicBuffer(topicId)
		buffer.messages = buffer.messages.filter((envelope) => {
			const imMessage = envelope?.seq?.message
			const rawNode = getRawMessageNode(imMessage)
			const correlationId = String(rawNode?.correlation_id || "")
			if (!discardedCorrelationIds.has(correlationId)) return true

			const appMessageId = String(imMessage?.app_message_id || "")
			if (!this.isAppMessageIdReferencedByOtherTopic(topicId, appMessageId)) {
				this.messageMap.delete(appMessageId)
			}
			return false
		})
		buffer.isProcessing = false

		discardedCorrelationIds.forEach((correlationId) => {
			const correlationNode = this.messageMap.get(correlationId) as
				| RawSuperMagicMessageNode
				| undefined
			if (
				correlationNode?.role === "assistant" &&
				correlationNode.correlation_id === correlationId &&
				!this.isAssistantCorrelationReferencedByOtherTopic(topicId, correlationId)
			) {
				this.messageMap.delete(correlationId)
			}
			topicMeta.content.delete(correlationId)
			topicMeta.streamSnapshots.delete(correlationId)
			topicMeta.finalizedCorrelationIds.add(correlationId)
			this.clearStreamRecoveryState(topicId, correlationId)
			this.clearStreamChunkLedger(topicId, correlationId)
		})

		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)
	}

	/**
	 * @description 写入 HTTP 消息；默认以完整快照替换，历史分页必须显式使用 merge。
	 * @param topicId 话题id
	 * @param messages 消息列表
	 */
	initializeMessages(
		topicId: string,
		messages: RawSuperMagicMessageEnvelope[],
		{ mode = "replace", syncGeneration }: InitializeMessagesOptions = {},
	) {
		const previousMessages = (this.messages.get(topicId) || []).slice()
		const topicBuffer = this.getTopicBuffer(topicId)
		const syncTopicMeta = this.getTopicMetadata(topicId)
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
		const appliedMode =
			mode === "replace" && syncGeneration !== undefined && !authoritativeSyncContext
				? "merge"
				: mode
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
			const snapshotMessages = (messages || []).slice()
			const snapshotLatestSeqId = snapshotMessages.reduce((latestSeqId, envelope) => {
				const currentSeqId = String(envelope?.seq?.seq_id || "")
				if (!currentSeqId) return latestSeqId
				if (!latestSeqId || compareMessageSeqId(currentSeqId, latestSeqId) > 0) {
					return currentSeqId
				}
				return latestSeqId
			}, "")
			const authoritativeMessages: MessageItem[] =
				appliedMode === "merge" ? previousMessages.slice() : []
			const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()
			let settledStream = false
			snapshotMessages.forEach((envelope) => {
				const imMessage = envelope?.seq?.message
				const rawNode = getRawMessageNode(imMessage)
				const messageType = String(imMessage?.type || "")
				const appMessageId = imMessage?.app_message_id as string
				const correlationId = String(rawNode?.correlation_id || "")
				const incomingMessage: MessageItem = transformRawMessage(
					envelope?.seq as RawSuperMagicMessageSequence,
				)
				// 针对客户端的工具调用消息直接过滤
				if (incomingMessage?.type === "user_tool_call") {
					if (appMessageId) incomingAppMessageIds.push(appMessageId)
					return
				}

				if (rawNode?.role === "assistant" && appMessageId && correlationId) {
					const existingAppMessage = this.getLatestAssistantMessageForIdentity(
						[...previousMessages, ...authoritativeMessages],
						appMessageId,
						"",
					)
					if (
						existingAppMessage?.correlation_id &&
						existingAppMessage.correlation_id !== correlationId
					) {
						authoritativeSyncContext?.authoritativeCorrelationIds.add(
							existingAppMessage.correlation_id,
						)
						this.upsertAuthoritativeMessage(authoritativeMessages, existingAppMessage)
						this.warnAssistantAppIdentityConflict(
							topicId,
							appMessageId,
							existingAppMessage.correlation_id,
							correlationId,
						)
						return
					}
					authoritativeSyncContext?.authoritativeCorrelationIds.add(correlationId)

					const revisionMessages = [...previousMessages, ...authoritativeMessages]
					const revisionDecision = this.getAssistantRevisionDecision(
						topicId,
						appMessageId,
						correlationId,
						envelope?.seq?.seq_id,
						revisionMessages,
					)
					if (revisionDecision === "same" || revisionDecision === "stale") {
						if (appMessageId) incomingAppMessageIds.push(appMessageId)
						const currentMessage = this.getLatestAssistantMessageForIdentity(
							revisionMessages,
							appMessageId,
							correlationId,
						)
						if (currentMessage) {
							this.upsertAuthoritativeMessage(authoritativeMessages, currentMessage)
						}
						if (revisionDecision === "same") {
							const currentNode = (this.messageMap.get(appMessageId) ||
								this.messageMap.get(correlationId)) as
								| RawSuperMagicMessageNode
								| undefined
							if (this.hasAssistantPayloadConflict(currentNode, rawNode)) {
								this.warnAssistantSeqConflict(
									topicId,
									appMessageId,
									correlationId,
									String(envelope?.seq?.seq_id || ""),
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
					this.upsertAuthoritativeMessage(authoritativeMessages, incomingMessage)
				}
				if (messageType === "super_magic_message") {
					this.recordToolResponse(
						topicId,
						rawNode,
						envelope?.seq?.seq_id,
						toolResponseMap,
					)
				}

				this.messageMap.set(appMessageId, rawNode)
				if (rawNode?.role === "assistant" && appMessageId && correlationId) {
					const didSettleStream = this.reconcileServerAssistantSnapshot(
						topicId,
						appMessageId,
						correlationId,
						rawNode,
						rawNode.status === "finished" ? "terminal" : "nonterminal",
					)
					if (rawNode.status === "finished") {
						const canonicalNode = this.messageMap.get(appMessageId) as
							| RawSuperMagicMessageNode
							| undefined
						// Finalization must retain the already-reconciled nested tool fields;
						// storing the raw HTTP payload here would erase inherited arguments later.
						const topicCanonicalNode =
							canonicalNode?.role === "assistant" &&
							canonicalNode.correlation_id === correlationId &&
							canonicalNode.topic_id === topicId
								? canonicalNode
								: undefined
						currentSyncFinalizations?.snapshots.set(correlationId, {
							appMessageId,
							node: this.cloneAuthoritativeAssistantSnapshot(
								topicCanonicalNode || rawNode,
							),
						})
					}
					settledStream = didSettleStream || settledStream
				}
			})

			// HTTP 快照不包含仍在本地流式生成、尚未具备服务端终态的占位卡时，
			// 该临时卡作为本地 overlay 保留。WS/IM 已持久落地且 seq 高于本次快照
			// 水位的消息同样属于并发增量，不能被稍早生成的 authoritative 响应删除。
			if (appliedMode === "replace")
				previousMessages.forEach((message) => {
					const hasSnapshotIdentity = authoritativeMessages.some(
						(candidate) =>
							candidate.app_message_id === message.app_message_id ||
							(Boolean(message.correlation_id) &&
								candidate.role === "assistant" &&
								candidate.correlation_id === message.correlation_id),
					)
					if (hasSnapshotIdentity) return

					const isStreamingOverlay = Boolean(
						message.role === "assistant" &&
						message.correlation_id &&
						syncTopicMeta.content.has(message.correlation_id),
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

			const mergedServerMessages = unionBy(
				sortMessages(authoritativeMessages),
				"app_message_id",
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
			if (appliedMode === "replace") {
				this.removeTopicMessageNodesOutsideSnapshot(
					topicId,
					previousMessages,
					mergedServerMessages,
				)
			}
			this.messages.set(topicId, mergedServerMessages)
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
					const topicId = String(sharedMessage?.topic_id || rawNode?.topic_id || "")
					if (rawNode?.role === "tool") {
						this.recordToolResponse(topicId, rawNode as RawSuperMagicMessageNode)
					} else if (rawNode?.role === "assistant" && topicId) {
						this.advanceSharedReplay(
							topicId,
							messageId,
							rawNode as RawSuperMagicMessageNode,
						)
					}

					this.messageMap.set(messageId, rawNode)
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

			toolResponseMap.set(
				toolId,
				this.mergeToolResponseState(current, {
					...(toolCall.tool || {}),
					id: toolId,
					name: toolCall.tool?.name || toolCall.function?.name || "",
					status: "response_missing",
				}),
			)
			changed = true
		})

		if (changed) this.toolResponseMap.set(topicId, toolResponseMap)
	}

	// ======================================
	// 方法 1：外部接收真实 chunk（前期正常流）
	// ======================================
	receiveChunk(message: SuperMagicChunkMessage) {
		const topicId = message?.topic_id
		const messageChunk = message?.[message?.type]
		const correlationId = String(messageChunk?.correlation_id || "")
		if (!topicId || !correlationId) return
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.finalizedCorrelationIds.has(correlationId)) {
			this.clearStreamChunkLedger(topicId, correlationId)
			return
		}

		const choice = messageChunk?.choices?.[0]
		const delta = choice?.delta
		const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
		const hasTextDelta = Boolean(
			(typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) ||
			(typeof delta?.content === "string" && delta.content.length > 0),
		)
		// Tool arguments remain canonical even when the tool header is missing. They must
		// reach the indexed provisional slot, but only a stable tool id is projectable.
		const hasCanonicalDelta = hasTextDelta || toolCalls.length > 0
		const chunkIndex =
			Number.isInteger(messageChunk?.i) && Number(messageChunk.i) >= 0
				? Number(messageChunk.i)
				: null

		if (chunkIndex === null) {
			// 缺失或非法序号无法安全排序和去重；丢弃当前包，等待后续完整消息兜底收敛。
			console.error("chunk error")
			return
		}

		const ledger = this.getStreamChunkLedger(topicId, correlationId)
		const hasBufferedLaterChunk = Array.from(ledger.pendingChunks.keys()).some(
			(pendingChunkIndex) => pendingChunkIndex > 0,
		)
		if (
			chunkIndex === 0 &&
			(ledger.nextChunkIndex > 1 || (ledger.nextChunkIndex > 0 && hasBufferedLaterChunk)) &&
			!topicMeta.finalizedCorrelationIds.has(correlationId)
		) {
			// 同一 correlation 已推进到 i>0 后再次收到 i=0，表示模型放弃旧回答并从头生成。
			// completion id 仅作附带信息；这里只重置旧流状态，保留原消息卡片与非流式元数据。
			ledger.pendingChunks.clear()
			ledger.nextChunkIndex = 0
			topicMeta.content.delete(correlationId)
			topicMeta.streamSnapshots.delete(correlationId)
			this.clearStreamRecoveryState(topicId, correlationId)
			if (topicMeta.timer) {
				clearTimeout(topicMeta.timer)
				topicMeta.timer = null
			}

			const cachedNode = this.messageMap.get(correlationId)
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
				this.messageMap.set(correlationId, streamNode)
			}
		}
		// correlationId 负责隔离一轮流，i 负责该轮内的幂等和顺序；旧序号与待处理重复序号都直接忽略。
		if (chunkIndex < ledger.nextChunkIndex || ledger.pendingChunks.has(chunkIndex)) {
			return
		}
		persistMessageToStorage(topicId, message)

		runInAction(() => {
			ledger.pendingChunks.set(chunkIndex, messageChunk)
			let appliedChunk = false

			while (ledger.pendingChunks.has(ledger.nextChunkIndex)) {
				const orderedChunk = ledger.pendingChunks.get(ledger.nextChunkIndex)
				ledger.pendingChunks.delete(ledger.nextChunkIndex)
				ledger.nextChunkIndex += 1
				if (!orderedChunk) continue

				const orderedChoice = orderedChunk.choices?.[0]
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
					this.scheduleStreamRecovery(topicId, correlationId, true)
					continue
				}

				const existingStreamState = this.getStreamState(topicId, correlationId)
				if (!existingStreamState && orderedIsFinal && !orderedHasCanonicalDelta) {
					this.clearStreamRecoveryTimer(topicId, correlationId)
					this.clearStreamChunkLedger(topicId, correlationId)
					if (topicId === this.activeTopicId && topicMeta.syncState !== "syncing") {
						this.requestStreamRecovery(
							topicId,
							correlationId,
							this.ensureStreamRecoveryState(topicId, correlationId),
						)
					}
					break
				}

				const streamState =
					existingStreamState || this.getTopicStreamState(topicId, correlationId)
				if (streamState.isFinalMessageReceived) {
					this.clearStreamChunkLedger(topicId, correlationId)
					break
				}
				appliedChunk =
					this.applyOrderedChunk(
						topicId,
						correlationId,
						topicMeta,
						streamState,
						orderedChunk,
					) || appliedChunk
				if (streamState.isFinalMessageReceived) {
					this.clearStreamChunkLedger(topicId, correlationId)
					break
				}
			}

			// 出现 gap 时不让后到参数越过工具头；超过恢复阈值后由 HTTP 权威快照收敛。
			if (!appliedChunk && ledger.pendingChunks.size > 0) {
				let streamState = this.getStreamState(topicId, correlationId)
				if (!streamState && hasCanonicalDelta) {
					streamState = this.getTopicStreamState(topicId, correlationId)
				}
				if (streamState && !streamState.isFinalMessageReceived) {
					topicMeta.isStream = true
					this.scheduleStreamRecovery(topicId, correlationId)
				}
			}
		})
	}

	private applyOrderedChunk(
		topicId: string,
		stableAppMessageId: string,
		topicMeta: TopicMeta,
		streamState: StreamState,
		messageChunk: SuperMagicChunkMessage["super_magic_chunk"],
	): boolean {
		if (streamState.isFinalMessageReceived) return false
		const choice = messageChunk?.choices?.[0]
		const delta = choice?.delta
		const toolCalls = Array.isArray(delta?.tool_calls) ? delta.tool_calls : []
		const isFinalChunk = Boolean(choice?.finish_reason)
		const hasEffectiveProgress = Boolean(
			(typeof delta?.reasoning_content === "string" && delta.reasoning_content.length > 0) ||
			(typeof delta?.content === "string" && delta.content.length > 0) ||
			toolCalls.length > 0,
		)

		if (isFinalChunk) {
			this.clearStreamRecoveryState(topicId, messageChunk.correlation_id)
			topicMeta.isStream = false
			streamState.isFinalMessageReceived = true
		} else {
			if (hasEffectiveProgress) {
				this.resetStreamRecoveryState(topicId, messageChunk.correlation_id)
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

			let existingTool = targetTool
			if (toolId && matchingIdIndex !== undefined && matchingIdIndex !== toolIndex) {
				if (targetTool) return
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

		if (!isFinalChunk && hasEffectiveProgress) {
			// Arm recovery from chunk receipt even while the typewriter is still projecting.
			// Only later effective network/canonical progress may reset this correlation clock.
			this.scheduleStreamRecovery(topicId, messageChunk.correlation_id)
		}

		// Anonymous argument slots are canonical-only state. Do not create a message
		// card or typewriter timer until content, reasoning, or a stable tool id exists.
		const hasProjectableTools = this.getProjectableToolCalls(streamState.tool_calls).length > 0
		if (streamState.content || streamState.reasoning_content || hasProjectableTools) {
			if (isFinalChunk && topicMeta.timer) {
				// A topic has one render timer, but a completed correlation must not wait
				// forever behind an unrelated stream that may never receive Final. Pause the
				// current projection; completing this Final resumes the remaining StreamState.
				clearTimeout(topicMeta.timer)
				topicMeta.timer = null
			}
			this.startStreamRendering(topicId, stableAppMessageId)
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

	private mergeNonterminalToolCalls(current: ToolCall[], incoming: ToolCall[]): ToolCall[] {
		const merged = current.map((toolCall) =>
			toolCall
				? {
						...toolCall,
						function: { ...toolCall.function },
						...(toolCall.tool ? { tool: { ...toolCall.tool } } : {}),
					}
				: toolCall,
		)

		incoming.forEach((incomingTool) => {
			const incomingId = String(incomingTool?.id || "")
			if (!incomingId) return
			const existingIndex = merged.findIndex((toolCall) => toolCall?.id === incomingId)
			const requestedIndex =
				Number.isInteger(incomingTool.index) && Number(incomingTool.index) >= 0
					? Number(incomingTool.index)
					: undefined
			const targetIndex =
				existingIndex >= 0
					? existingIndex
					: requestedIndex !== undefined && !merged[requestedIndex]
						? requestedIndex
						: merged.length
			const existingTool = merged[targetIndex]
			const existingArguments =
				typeof existingTool?.function?.arguments === "string"
					? existingTool.function.arguments
					: ""
			const incomingArguments =
				typeof incomingTool.function?.arguments === "string"
					? incomingTool.function.arguments
					: ""
			const mergedToolResponse = incomingTool.tool
				? this.mergeToolResponseState(existingTool?.tool, incomingTool.tool)
				: existingTool?.tool

			merged[targetIndex] = {
				...(existingTool || {}),
				...incomingTool,
				id: incomingId,
				type: incomingTool.type || existingTool?.type || "function",
				index: targetIndex,
				function: {
					...(existingTool?.function || {}),
					...(incomingTool.function || {}),
					name: incomingTool.function?.name || existingTool?.function?.name || "",
					arguments: existingArguments || incomingArguments,
				},
				...(mergedToolResponse ? { tool: mergedToolResponse } : {}),
			} as ToolCall
		})

		return merged
	}

	private mergeNonterminalAssistantSnapshot(
		currentNode: RawSuperMagicMessageNode | undefined,
		serverNode: RawSuperMagicMessageNode,
		streamState?: StreamState,
	): RawSuperMagicMessageNode {
		const currentAssistantNode = currentNode?.role === "assistant" ? currentNode : undefined
		const localContent = streamState?.content ?? currentAssistantNode?.content
		const localReasoning =
			streamState?.reasoning_content ?? currentAssistantNode?.reasoning_content
		const incomingContent = typeof serverNode.content === "string" ? serverNode.content : ""
		const incomingReasoning =
			typeof serverNode.reasoning_content === "string" ? serverNode.reasoning_content : ""
		const currentToolCalls = streamState
			? streamState.tool_calls
			: Array.isArray(currentAssistantNode?.tool_calls)
				? (currentAssistantNode.tool_calls as ToolCall[])
				: []
		const incomingToolCalls = Array.isArray(serverNode.tool_calls)
			? (serverNode.tool_calls as ToolCall[])
			: []
		const mergedToolCalls =
			incomingToolCalls.length > 0
				? this.mergeNonterminalToolCalls(currentToolCalls, incomingToolCalls)
				: this.mergeNonterminalToolCalls(currentToolCalls, [])
		const reconciledNode = {
			...(currentAssistantNode
				? this.cloneAuthoritativeAssistantSnapshot(currentAssistantNode)
				: {}),
			...serverNode,
			content:
				typeof localContent === "string" && localContent.length > 0
					? localContent
					: incomingContent,
			reasoning_content:
				typeof localReasoning === "string" && localReasoning.length > 0
					? localReasoning
					: incomingReasoning,
			tool_calls: this.cloneToolCallsForRendering(mergedToolCalls),
		} as RawSuperMagicMessageNode

		if (streamState) {
			streamState.content = String(reconciledNode.content || "")
			streamState.reasoning_content = String(reconciledNode.reasoning_content || "")
			streamState.tool_calls = mergedToolCalls
		}

		return reconciledNode
	}

	/**
	 * HTTP finished 快照只静默结算本代明确确认的 correlation。丢弃同步窗口内重建的
	 * StreamState，并重新写回权威节点，避免 stale chunk 覆盖最终内容或误伤同 topic 其他流。
	 */
	private finalizeSynchronizedAssistantSnapshots(
		topicId: string,
		snapshots: Map<string, AuthoritativeAssistantSnapshot>,
	) {
		if (snapshots.size === 0) return
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}

		snapshots.forEach(({ appMessageId, node }, correlationId) => {
			this.clearStreamRecoveryState(topicId, correlationId)
			this.clearStreamChunkLedger(topicId, correlationId)
			topicMeta.content.delete(correlationId)
			topicMeta.streamSnapshots.delete(correlationId)
			topicMeta.finalizedCorrelationIds.add(correlationId)

			const currentNode = this.messageMap.get(correlationId) as
				| RawSuperMagicMessageNode
				| undefined
			const hasTopicCorrelationNode = Boolean(
				currentNode?.role === "assistant" &&
				currentNode.correlation_id === correlationId &&
				currentNode.topic_id === topicId,
			)
			// HTTP Final 的 absent 字段不具备覆盖语义；先继承当前 canonical，
			// 再让显式 null / 空值经规范化后覆盖对应字段。
			const authoritativeNode = this.mergeAuthoritativeAssistantSnapshot(
				hasTopicCorrelationNode ? currentNode : undefined,
				node,
			)
			// messageMap 的 correlation key 仍是全局别名；被另一 topic 占用时保留原别名，
			// 仅用真实 appMessageId 保存本 topic Final，避免跨 topic 收敛或继承。
			if (!currentNode || hasTopicCorrelationNode) {
				this.messageMap.set(correlationId, authoritativeNode)
			} else {
				this.warnAssistantCorrelationAliasConflict(
					topicId,
					correlationId,
					currentNode.topic_id,
					currentNode.role,
					currentNode.role === "assistant" ? undefined : correlationId,
				)
			}
			this.messageMap.set(appMessageId, authoritativeNode)
		})

		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
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
		mode: AssistantSnapshotMode,
	) {
		if (mode === "terminal") {
			this.clearStreamRecoveryState(topicId, correlationId)
			this.clearStreamChunkLedger(topicId, correlationId)
			// Message-level terminal authority is independent from both StreamState existence
			// and the enclosing request lifecycle. A later cancel cannot reopen this correlation.
			this.getTopicMetadata(topicId).finalizedCorrelationIds.add(correlationId)
		}
		const streamState = this.getStreamState(topicId, correlationId)
		const correlationNode = this.messageMap.get(correlationId) as
			| RawSuperMagicMessageNode
			| undefined
		const hasTopicCorrelationNode = Boolean(
			correlationNode?.role === "assistant" &&
			correlationNode.correlation_id === correlationId &&
			correlationNode.topic_id === topicId,
		)
		const hasConflictingCorrelationNode = Boolean(correlationNode && !hasTopicCorrelationNode)
		// 首次 HTTP 快照也需要建立 correlation 别名；已被其他 topic 占用时只保留
		// 本 topic 的真实 appMessageId，不能因为本 topic 已有 StreamState 就绕过隔离。
		if (!streamState && hasConflictingCorrelationNode) {
			if (this.getTopicMetadata(topicId).syncState !== "syncing") {
				this.warnAssistantCorrelationAliasConflict(
					topicId,
					correlationId,
					correlationNode?.topic_id,
					correlationNode?.role,
					correlationNode?.role === "assistant" ? undefined : correlationId,
				)
			}
			this.messageMap.set(appMessageId, this.cloneAuthoritativeAssistantSnapshot(serverNode))
			return
		}

		const currentAssistantNode = hasTopicCorrelationNode ? correlationNode : undefined
		const reconciliationBase = streamState
			? ({
					...(currentAssistantNode || {}),
					role: "assistant",
					correlation_id: correlationId,
					content: streamState.content,
					reasoning_content: streamState.reasoning_content,
					tool_calls: this.cloneToolCallsForRendering(streamState.tool_calls),
				} as RawSuperMagicMessageNode)
			: currentAssistantNode
		const reconciledNode =
			mode === "terminal"
				? this.mergeAuthoritativeAssistantSnapshot(reconciliationBase, serverNode)
				: this.mergeNonterminalAssistantSnapshot(
						reconciliationBase,
						serverNode,
						streamState,
					)

		// 列表卡片可能仍保留 correlationId 作为稳定 React key；无冲突时两个查询键
		// 指向同一终态。跨 topic 冲突时只写真实 appMessageId，保留旧 correlation alias。
		if (!hasConflictingCorrelationNode) {
			this.messageMap.set(correlationId, reconciledNode)
		} else if (this.getTopicMetadata(topicId).syncState !== "syncing") {
			this.warnAssistantCorrelationAliasConflict(
				topicId,
				correlationId,
				correlationNode?.topic_id,
				correlationNode?.role,
				correlationNode?.role === "assistant" ? undefined : correlationId,
			)
		}
		this.messageMap.set(appMessageId, reconciledNode)

		if (!streamState || mode === "nonterminal") return false
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}
		topicMeta.content.delete(correlationId)
		topicMeta.streamSnapshots.delete(correlationId)
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

	private isStrongToolResponseStatus(status?: string) {
		return status === "finished" || status === "error"
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
	) {
		if (messageNode?.role !== "tool") return
		const rawTool = messageNode.tool
		if (!rawTool || typeof rawTool !== "object" || Array.isArray(rawTool)) return

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
			return
		}

		const toolResponseMap = targetMap || this.toolResponseMap.get(topicId) || new Map()
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
		if (rawTool.status !== undefined && !this.isValidToolResponseStatus(rawTool.status)) {
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
			return
		}
		if (normalizedSeqId && !latestSeqId) {
			// response_missing 等无版本占位被真实消息接管时，从这条消息开始建立 seq 基线。
			toolResponseMap.set(toolId, this.mergeToolResponseState(current, incoming))
			seqMap.set(toolId, normalizedSeqId)
			this.toolResponseMap.set(topicId, toolResponseMap)
			return
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
				return
			}
			if (sequenceOrder === 0) {
				const sameSeqResult = this.classifySameSeqToolResponse(current, incoming)
				if (sameSeqResult.hasConflict) {
					console.warn("[SuperMagicStore] conflicting tool response ignored", {
						topicId,
						toolCallId: toolId,
						seqId: normalizedSeqId,
					})
					return
				}
				if (!sameSeqResult.hasSupplement) return
				const supplemented = this.mergeToolResponseState(current, incoming)
				toolResponseMap.set(toolId, supplemented)
				this.toolResponseMap.set(topicId, toolResponseMap)
				return
			}

			toolResponseMap.set(toolId, this.mergeToolResponseState(current, incoming))
			seqMap.set(toolId, normalizedSeqId)
			this.toolResponseMap.set(topicId, toolResponseMap)
			return
		}

		// 未知版本不能破坏已有强终态；其余情况保留原有状态合并语义。
		const nextState = this.isStrongToolResponseStatus(current.status)
			? this.mergeUnknownSeqToolResponseState(current, incoming)
			: this.mergeToolResponseState(current, incoming)
		if (nextState === current || isEqual(nextState, current)) return
		toolResponseMap.set(toolId, nextState)
		this.toolResponseMap.set(topicId, toolResponseMap)
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
	private getAssistantRevisionSeqId(
		topicId: string,
		appMessageId: string,
		correlationId: string,
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
			const matchesCorrelationId =
				Boolean(correlationId) && item.correlation_id === correlationId
			if (!matchesAppMessageId && !matchesCorrelationId) return
			// 流式占位卡的 seq 是本地推导值，不代表已接受的 Final revision。
			if (item.app_message_id === correlationId && item.correlation_id === correlationId)
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
				const matchesCorrelationId =
					Boolean(correlationId) && rawNode?.correlation_id === correlationId
				if (!matchesAppMessageId && !matchesCorrelationId) return
				consider(sequence?.seq_id)
			})
		}

		return latestSeqId || undefined
	}

	private getAssistantRevisionDecision(
		topicId: string,
		appMessageId: string,
		correlationId: string,
		incomingSeqId: unknown,
		messageList?: MessageItem[],
	): "new" | "same" | "stale" | "higher" {
		const currentSeqId = this.getAssistantRevisionSeqId(
			topicId,
			appMessageId,
			correlationId,
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
		correlationId: string,
	) {
		const buffer = this.getTopicBuffer(topicId)
		const incomingSeqId = baseMessage?.seq?.seq_id
		const existingIndex = buffer.messages.findIndex((envelope) => {
			const sequence = envelope?.seq
			const rawNode = getRawMessageNode(sequence?.message)
			return (
				rawNode?.role === "assistant" &&
				((Boolean(appMessageId) && sequence?.message?.app_message_id === appMessageId) ||
					(Boolean(correlationId) && rawNode?.correlation_id === correlationId))
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

	enqueueMessage(topicId: string, baseMessage: RawSuperMagicMessageEnvelope) {
		const message = baseMessage?.seq as RawSuperMagicMessageSequence
		const msgCache = this.messages.get(topicId) || []

		const nextMessage = transformRawMessage(message)

		const msgIdSet = new Set(msgCache.map((o) => o?.app_message_id))

		const messageNode = getRawMessageNode(message?.message)

		const appMessageId = message?.message?.app_message_id as string

		const correlationId = messageNode?.correlation_id as string
		const revisionDecision =
			messageNode?.role === "assistant"
				? this.getAssistantRevisionDecision(
						topicId,
						appMessageId,
						correlationId,
						message?.seq_id,
					)
				: "new"
		if (revisionDecision === "same" || revisionDecision === "stale") return
		const isHigherAssistantRevision = revisionDecision === "higher"

		const buffer = this.getTopicBuffer(topicId)
		this.recordToolResponse(topicId, messageNode, message?.seq_id)
		const isTaskSuspendedEvent = messageNode?.event === TASK_SUSPENDED_EVENT
		if (isTaskSuspendedEvent) {
			this.handleTopicSuspended(topicId)
		}
		if (messageNode?.role === "assistant" && !isTaskSuspendedEvent) {
			// 新 assistant 到达证明上一轮已推进；排除当前 assistant，避免把它自己的
			// tool_calls 当成缺失项，并检查 buffer 中尚未消费的真实 tool response。
			this.fillMissingToolResponses(topicId, [appMessageId, correlationId])
		}

		// 针对客户端的工具调用消息直接过滤
		if (nextMessage?.type === "user_tool_call") {
			persistMessageToStorage(topicId, message, true)
			return
		}

		const hasMessage = msgIdSet.has(appMessageId)
		const hasCorrelationIdMessage = msgCache.some(
			(item) =>
				Boolean(correlationId) &&
				item?.role === messageNode?.role &&
				item?.role === "assistant" &&
				item?.correlation_id === correlationId,
		)
		const hasBufferMessage = buffer.messages.some(
			(o) => o?.seq?.message?.app_message_id === appMessageId,
		)
		if (
			!isHigherAssistantRevision &&
			(hasMessage || hasCorrelationIdMessage || hasBufferMessage)
		) {
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
					if (this.hasDefinedFinalField(messageNode, "content")) {
						streamState.content =
							typeof messageNode.content === "string" ? messageNode.content : ""
					}
					if (this.hasDefinedFinalField(messageNode, "reasoning_content")) {
						streamState.reasoning_content =
							typeof messageNode.reasoning_content === "string"
								? messageNode.reasoning_content
								: ""
					}

					const finalToolState = this.getFinalToolCalls(messageNode)
					if (finalToolState.present) {
						streamState.tool_calls = this.reconcileFinalToolCalls(
							streamState.tool_calls,
							finalToolState.toolCalls,
						)

						const cache = this.messageMap.get(correlationId) as
							| RawSuperMagicMessageNode
							| undefined
						if (cache && finalToolState.toolCalls.length === 0) {
							cache.tool_calls = []
							this.messageMap.set(correlationId, cache)
						}
					}

					// IM 消息到达时立即同步 tool 字段到 messageMap，
					// 避免 content 流式阶段工具状态无法更新
					this.syncToolCallsToolField(correlationId, messageNode)

					this.startStreamRendering(topicId, correlationId)
				} else {
					this.syncFinalAssistantStreamFields(correlationId, messageNode)
					this.syncToolCallsToolField(correlationId, messageNode)
				}
				const currentNode = this.messageMap.get(correlationId)
				if (appMessageId && currentNode) this.messageMap.set(appMessageId, currentNode)
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
			const bufferHasAssistantRevision =
				messageNode?.role === "assistant" && isHigherAssistantRevision
			if (bufferHasAssistantRevision) {
				this.enqueueAssistantRevision(topicId, baseMessage, appMessageId, correlationId)
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
		if (
			cache?.role !== "assistant" ||
			cache.correlation_id !== correlationId ||
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
			this.messageMap.set(correlationId, cache)
		}
	}

	/**
	 * StreamState may already be gone when the authoritative assistant message arrives.
	 * This helper is only called from that branch, so replacing the complete final stream
	 * fields cannot interrupt the existing typewriter catch-up path.
	 */
	private syncFinalAssistantStreamFields(
		correlationId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!correlationId || !finalNode) return
		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
		if (cache?.role !== "assistant" || cache.correlation_id !== correlationId) return

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
		this.messageMap.set(correlationId, cache)
	}

	/**
	 * 将真消息节点中的非流式元信息合并到 chunk 阶段创建的 mock 节点。
	 * 跳过 content / reasoning_content / tool_calls（由 startStreamRendering
	 * 渐进 catch-up），也跳过 correlation_id / topic_id（mock 已按外层路由身份建表）。
	 */
	private syncFinalNodeMetadata(
		correlationId: string,
		finalNode: RawSuperMagicMessageNode | undefined,
	) {
		if (!correlationId || !finalNode) return
		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
		if (cache?.role !== "assistant" || cache.correlation_id !== correlationId) return

		const streamControlledKeys = new Set([
			"content",
			"reasoning_content",
			"tool_calls",
			"correlation_id",
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
			this.messageMap.set(correlationId, cache)
		}
	}

	/**
	 * 将真消息卡片中的身份 / 状态字段合并到逻辑卡片。
	 * React key 由 correlation_id 稳定，卡片的持久 app_message_id 使用 Final 真 ID。
	 */
	private syncFinalCardMetadata(
		topicId: string,
		correlationId: string,
		finalCard: MessageItem | undefined,
	) {
		if (!topicId || !correlationId || !finalCard) return
		const messages = this.messages.get(topicId)
		if (!messages?.length) return

		const cardIndex = messages.findIndex(
			(item) => item.role === "assistant" && item.correlation_id === correlationId,
		)
		if (cardIndex < 0) return

		const existingCard = messages[cardIndex]
		const nextAppMessageId = (finalCard as Record<string, unknown>).app_message_id
		if (
			typeof nextAppMessageId === "string" &&
			nextAppMessageId &&
			existingCard.app_message_id &&
			existingCard.app_message_id !== nextAppMessageId &&
			existingCard.app_message_id !== correlationId
		) {
			// 不同 appMessageId 代表不同 revision；旧 alias 不永久跟随可变 correlation 节点。
			this.messageMap.delete(existingCard.app_message_id)
		}
		// 卡片属于传入的 topicId；Final 可能携带另一个内层 Agent topic，不能改写路由归属。
		const patchableKeys: Array<string> = [
			"app_message_id",
			"magic_message_id",
			"conversation_id",
			"sender_id",
			"send_time",
			"seq_id",
			"status",
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

		if (!mutated) return
		const nextMessages = messages.slice()
		nextMessages[cardIndex] = merged
		this.messages.set(topicId, nextMessages)
	}

	/**
	 * 没有对应 StreamState 的 Assistant Final 来自历史回补或 Final-only 路径。
	 * 这类消息已经是服务端权威快照，应直接落地，不能借用其他 correlation 的 topic timer
	 * 创建伪流式动画；同时只清理当前 correlation，保留同 topic 中仍在运行的真实流。
	 */
	private commitBufferedAssistantSnapshotImmediately(
		topicId: string,
		correlationId: string,
		rawAppMessageId: string,
		message: MessageItem,
		messageNode: RawSuperMagicMessageNode,
		correlationNode: RawSuperMagicMessageNode | undefined,
	) {
		const topicMeta = this.getTopicMetadata(topicId)
		const hasTopicAssistantAlias = Boolean(
			correlationId &&
			correlationNode?.role === "assistant" &&
			correlationNode.correlation_id === correlationId &&
			correlationNode.topic_id === topicId,
		)
		const hasCorrelationAliasConflict = Boolean(
			correlationId && correlationNode && !hasTopicAssistantAlias,
		)
		const routedFinalNode = {
			...messageNode,
			// Store bucket/card ownership comes from enqueueMessage(topicId), while the
			// canonical Agent node retains its inner business topic when the server sent one.
			topic_id: messageNode.topic_id || topicId,
			...(correlationId ? { correlation_id: correlationId } : {}),
		} as RawSuperMagicMessageNode
		const authoritativeNode = this.mergeAuthoritativeAssistantSnapshot(
			hasTopicAssistantAlias ? correlationNode : undefined,
			routedFinalNode,
		)

		if (correlationId && !hasCorrelationAliasConflict) {
			this.messageMap.set(correlationId, authoritativeNode)
		}
		if (rawAppMessageId) this.messageMap.set(rawAppMessageId, authoritativeNode)

		const messages = this.messages.get(topicId) || []
		const existingCardIndex = messages.findIndex(
			(item) =>
				item.app_message_id === rawAppMessageId ||
				(Boolean(correlationId) &&
					item.role === "assistant" &&
					item.correlation_id === correlationId),
		)
		const existingCard = existingCardIndex >= 0 ? messages[existingCardIndex] : undefined
		if (
			existingCard?.app_message_id &&
			rawAppMessageId &&
			existingCard.app_message_id !== rawAppMessageId &&
			existingCard.app_message_id !== correlationId
		) {
			this.messageMap.delete(existingCard.app_message_id)
		}
		const finalCard = {
			...(existingCard || {}),
			...message,
			topic_id: topicId,
			...(rawAppMessageId ? { app_message_id: rawAppMessageId } : {}),
		} as MessageItem
		const nextMessages = messages.slice()
		if (existingCardIndex >= 0) nextMessages[existingCardIndex] = finalCard
		else nextMessages.push(finalCard)
		this.messages.set(topicId, unionBy(sortMessages(nextMessages), "app_message_id"))

		if (correlationId) {
			topicMeta.content.delete(correlationId)
			topicMeta.streamSnapshots.delete(correlationId)
			topicMeta.finalizedCorrelationIds.add(correlationId)
			this.clearStreamRecoveryState(topicId, correlationId)
			this.clearStreamChunkLedger(topicId, correlationId)
		}
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)

		if (hasCorrelationAliasConflict) {
			this.warnAssistantCorrelationAliasConflict(
				topicId,
				correlationId,
				correlationNode?.topic_id,
				correlationNode?.role,
				correlationNode?.role === "assistant" ? undefined : correlationId,
			)
		}

		const payload = {
			topicId,
			message: finalCard,
			messageNode: authoritativeNode,
			stage: "arrived" as const,
		} satisfies TopicMessageListenerPayload
		this.emitTopicMessageArrived(payload)
		this.emitDomainEvents(payload)
		if (authoritativeNode.status === "finished") {
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

			const correlationId = String(messageNode.correlation_id || "")
			const streamState = correlationId
				? this.getStreamState(topicId, correlationId)
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

			const messageNode = getRawMessageNode(nextMessage?.seq?.message)

			const message = transformRawMessage(nextMessage?.seq as RawSuperMagicMessageSequence)

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
				const currentSeqId = this.getAssistantRevisionSeqId(
					topicId,
					rawAppMessageId,
					correlationId,
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
				if (correlationId && topicMeta.finalizedCorrelationIds.has(correlationId)) {
					const isHigherRevision =
						typeof currentSeqId === "string" &&
						typeof incomingSeqId === "string" &&
						compareMessageSeqId(incomingSeqId, currentSeqId) > 0
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
					this.fillMissingToolResponses(topicId, [rawAppMessageId, correlationId])
				}

				const existingStreamState = this.getStreamState(topicId, correlationId)
				const correlationNode = this.messageMap.get(correlationId) as
					| RawSuperMagicMessageNode
					| undefined
				const hasTopicAssistantAlias = Boolean(
					correlationNode?.role === "assistant" &&
					correlationNode.correlation_id === correlationId &&
					correlationNode.topic_id === topicId,
				)
				const hasCorrelationAliasConflict = Boolean(
					correlationNode && !hasTopicAssistantAlias,
				)
				if (!existingStreamState) {
					this.commitBufferedAssistantSnapshotImmediately(
						topicId,
						correlationId,
						rawAppMessageId,
						message,
						messageNode as RawSuperMagicMessageNode,
						correlationNode,
					)
					return
				}
				const streamState = existingStreamState
				if (hasCorrelationAliasConflict) {
					// correlation alias 只属于同 topic 的 Assistant 逻辑消息。Tool/User 或
					// 其他 topic 已占用该 key 时，Final 仍以真实 appMessageId 落库，绝不
					// 复用、覆盖冲突 canonical。
					const streamNode = streamState
						? ({
								role: "assistant",
								topic_id: topicId,
								correlation_id: correlationId,
								content: streamState.content,
								reasoning_content: streamState.reasoning_content,
								tool_calls: this.cloneToolCallsForRendering(streamState.tool_calls),
							} as RawSuperMagicMessageNode)
						: undefined
					const authoritativeNode = this.mergeAuthoritativeAssistantSnapshot(
						streamNode,
						messageNode as RawSuperMagicMessageNode,
					)
					streamState.isFinalMessageReceived = true
					streamState.stage = "done"
					this.messageMap.set(rawAppMessageId, authoritativeNode)
					const messages = this.messages.get(topicId) || []
					const existingCardIndex = messages.findIndex(
						(item) =>
							item.role === "assistant" && item.correlation_id === correlationId,
					)
					const finalCard =
						existingCardIndex >= 0
							? {
									...messages[existingCardIndex],
									...message,
									app_message_id: rawAppMessageId,
								}
							: message
					const nextMessages = messages.slice()
					if (existingCardIndex >= 0) nextMessages[existingCardIndex] = finalCard
					else nextMessages.push(finalCard)
					this.messages.set(
						topicId,
						unionBy(sortMessages(nextMessages), "app_message_id"),
					)
					topicMeta.content.delete(correlationId)
					topicMeta.streamSnapshots.delete(correlationId)
					topicMeta.finalizedCorrelationIds.add(correlationId)
					topicMeta.isStream = topicMeta.content.size > 0
					topicMeta.isStreamLoading = topicMeta.content.size > 0
					this.clearStreamRecoveryState(topicId, correlationId)
					this.clearStreamChunkLedger(topicId, correlationId)
					this.topicMeta.set(topicId, topicMeta)
					this.warnAssistantCorrelationAliasConflict(
						topicId,
						correlationId,
						correlationNode?.topic_id,
						correlationNode?.role,
						correlationNode?.role === "assistant" ? undefined : correlationId,
					)
					const payload = {
						topicId,
						message: finalCard,
						messageNode: authoritativeNode,
						stage: "arrived" as const,
					} satisfies TopicMessageListenerPayload
					this.emitTopicMessageArrived(payload)
					this.emitDomainEvents(payload)
					if (authoritativeNode.status === "finished") {
						this.fillMissingToolResponses(topicId)
					}
					buffer.isProcessing = false
					this.processMessageBuffer(topicId)
					return
				}

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
				if (this.hasDefinedFinalField(messageNode, "content")) {
					streamState.content =
						typeof messageNode?.content === "string" ? messageNode.content : ""
				}
				if (this.hasDefinedFinalField(messageNode, "reasoning_content")) {
					streamState.reasoning_content =
						typeof messageNode?.reasoning_content === "string"
							? messageNode.reasoning_content
							: ""
				}
				const finalToolState = this.getFinalToolCalls(messageNode)
				if (finalToolState.present) {
					streamState.tool_calls = this.reconcileFinalToolCalls(
						streamState.tool_calls,
						finalToolState.toolCalls,
					)
				}
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
					const currentNode = this.messageMap.get(correlationId)
					if (rawAppMessageId && currentNode)
						this.messageMap.set(rawAppMessageId, currentNode)
				}
			}
		}
	}

	/**
	 * correlation alias belongs exclusively to the Assistant logical-message domain.
	 * A Tool/User candidate may share the correlation for protocol association, but it
	 * must never receive an Assistant snapshot under its own persistent appMessageId.
	 */
	private findAssistantAliasTarget(
		topicId: string,
		correlationId: string,
		messages: MessageItem[],
	): MessageItem | undefined {
		const assistantTarget = messages.find(
			(message) =>
				message.role === "assistant" &&
				message.topic_id === topicId &&
				message.correlation_id === correlationId,
		)
		if (assistantTarget) return assistantTarget

		const conflictingTarget = messages.find(
			(message) =>
				message.role !== "assistant" &&
				message.topic_id === topicId &&
				message.correlation_id === correlationId,
		)
		console.warn("[SuperMagicStore] assistant alias target missing", {
			topicId,
			correlationId,
			conflictingAppMessageId: conflictingTarget?.app_message_id,
			conflictingRole: conflictingTarget?.role,
			resolution: "preserve-correlation-canonical",
		})
		return undefined
	}

	private warnAssistantCorrelationAliasConflict(
		topicId: string,
		correlationId: string,
		conflictingTopicId?: string,
		conflictingRole?: string,
		conflictingAppMessageId?: string,
	) {
		console.warn("[SuperMagicStore] assistant correlation alias conflict", {
			topicId,
			correlationId,
			conflictingTopicId,
			conflictingRole,
			conflictingAppMessageId,
			resolution: "preserve-existing-correlation-canonical",
		})
	}

	private startStreamRendering(topicId: string, correlationId: string) {
		const topicMeta = this.getTopicMetadata(topicId)
		if (topicMeta.syncState === "syncing") return
		if (topicMeta?.timer) {
			return
		}

		const streamState = this.getTopicStreamState(topicId, correlationId)
		const cachedNode = this.messageMap.get(correlationId || "") as
			| RawSuperMagicMessageNode
			| undefined
		const hasUsableAssistantCache = Boolean(
			cachedNode?.role === "assistant" &&
			cachedNode.correlation_id === correlationId &&
			cachedNode.topic_id === topicId,
		)
		if (cachedNode && !hasUsableAssistantCache) {
			// correlation key 已被 Tool/User 或其他 topic 占用时，流式数据先留在
			// topic-scoped StreamState，等待 Final 以真实 appMessageId 建立 Assistant 卡片。
			return
		}
		let cache = cachedNode as RawSuperMagicMessageNode

		if (!cache) {
			this.messageMap.set(
				correlationId || "",
				this.getDefaultNode(correlationId || "", topicId),
			)
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

		if (topicMeta.renderPolicy === "instant") {
			if (streamState.isFinalMessageReceived) {
				this.settleTopicStreamsInstantly(topicId)
				return
			}

			cache.reasoning_content = streamState.reasoning_content
			cache.content = streamState.content
			cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
			streamState.currentToolIndex = cache.tool_calls.length
			this.messageMap.set(correlationId, cache)
			topicMeta.renderPolicy = "live"
			this.scheduleStreamRecovery(topicId, correlationId)
			return
		}

		if (topicId !== this.activeTopicId) {
			if (streamState.isFinalMessageReceived) {
				this.flushStreamToCompletion(topicId, correlationId)
			}
			return
		}

		const progressed = this.resumeFromCurrentStateV2(topicId, correlationId)

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
		if (!progressed && streamState.isFinalMessageReceived) {
			// final 已到但视觉状态无法继续推进时，权威快照优先，禁止继续创建 16ms 空转 timer。
			this.settleFinalStreamImmediately(topicId, correlationId)
			return
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
		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
		if (!cache || !streamState) return
		if (
			cache.role !== "assistant" ||
			cache.correlation_id !== correlationId ||
			cache.topic_id !== topicId
		) {
			// 冲突 correlation key 只能保留 Tool/User canonical；完成流不得借
			// flush 路径绕过 role-scoped alias 规则去改写它。
			this.completeStreamRendering(topicId, correlationId)
			return
		}

		const topicMeta = this.getTopicMetadata(topicId)
		topicMeta.streamSnapshots.set(correlationId, {
			reasoning_content: streamState.reasoning_content || "",
			content: (streamState.content as string) || "",
			tool_calls: this.cloneToolCallsForRendering(
				Array.isArray(cache.tool_calls) ? (cache.tool_calls as ToolCall[]) : [],
			),
		})

		cache.reasoning_content = streamState.reasoning_content
		cache.content = streamState.content
		cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
		this.messageMap.set(correlationId, cache)

		this.completeStreamRendering(topicId, correlationId)
	}

	private settleFinalStreamImmediately(topicId: string, correlationId: string) {
		const streamState = this.getStreamState(topicId, correlationId)
		const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
		if (!streamState || !cache) return
		if (
			cache.role !== "assistant" ||
			cache.correlation_id !== correlationId ||
			cache.topic_id !== topicId
		) {
			streamState.stage = "done"
			this.completeStreamRendering(topicId, correlationId)
			return
		}

		cache.reasoning_content = streamState.reasoning_content
		cache.content = streamState.content
		cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
		streamState.stage = "done"
		this.messageMap.set(correlationId, cache)
		this.completeStreamRendering(topicId, correlationId)
	}

	/**
	 * 服务端已确认话题终态时，直接把仍保留的 canonical stream 内容投影到消息节点，
	 * 一次性移除动画状态并释放 buffer，避免终态话题再次进入打字机循环。
	 */
	private settleTopicStreamsInstantly(topicId: string, correlationIds?: ReadonlySet<string>) {
		const topicMeta = this.getTopicMetadata(topicId)
		const targetCorrelationIds = correlationIds
			? Array.from(correlationIds)
			: Array.from(topicMeta.content.keys())
		if (correlationIds) {
			targetCorrelationIds.forEach((correlationId) => {
				this.clearStreamRecoveryTimer(topicId, correlationId)
			})
		} else {
			this.clearStreamRecoveryTimer(topicId)
		}
		if (topicMeta.timer) {
			clearTimeout(topicMeta.timer)
			topicMeta.timer = null
		}

		const messages = this.messages.get(topicId) || []
		targetCorrelationIds.forEach((correlationId) => {
			const streamState = topicMeta.content.get(correlationId)
			if (!streamState) return
			const cachedNode = this.messageMap.get(correlationId) as
				| RawSuperMagicMessageNode
				| undefined
			const hasAssistantCache = Boolean(
				cachedNode?.role === "assistant" &&
				cachedNode.correlation_id === correlationId &&
				cachedNode.topic_id === topicId,
			)
			const cache =
				(hasAssistantCache ? cachedNode : undefined) ||
				(this.getDefaultNode(correlationId, topicId) as RawSuperMagicMessageNode)
			streamState.isFinalMessageReceived = true
			streamState.stage = "done"
			cache.reasoning_content = streamState.reasoning_content
			cache.content = streamState.content
			cache.tool_calls = this.cloneToolCallsForRendering(streamState.tool_calls)
			if (hasAssistantCache || !cachedNode) {
				this.messageMap.set(correlationId, cache)
			}
			let targetMessage = messages.find(
				(message) =>
					message.role === "assistant" &&
					message.topic_id === topicId &&
					message.correlation_id === correlationId,
			)
			if (cachedNode && !hasAssistantCache && !targetMessage) {
				this.warnAssistantCorrelationAliasConflict(
					topicId,
					correlationId,
					cachedNode.topic_id,
					cachedNode.role,
					cachedNode.role === "assistant" ? undefined : correlationId,
				)
			} else if (!targetMessage) {
				targetMessage = this.findAssistantAliasTarget(topicId, correlationId, messages)
			}
			if (targetMessage?.app_message_id) {
				this.messageMap.set(targetMessage.app_message_id, cache)
			}
			topicMeta.finalizedCorrelationIds.add(correlationId)
			this.clearStreamRecoveryState(topicId, correlationId)
			this.clearStreamChunkLedger(topicId, correlationId)
		})

		targetCorrelationIds.forEach((correlationId) => {
			topicMeta.content.delete(correlationId)
			topicMeta.streamSnapshots.delete(correlationId)
		})
		topicMeta.isStream = topicMeta.content.size > 0
		topicMeta.isStreamLoading = topicMeta.content.size > 0
		this.topicMeta.set(topicId, topicMeta)

		const buffer = this.getTopicBuffer(topicId)
		buffer.isProcessing = false
		this.processMessageBuffer(topicId)
	}

	private completeStreamRendering(topicId: string, correlationId?: string) {
		const meta = this.getTopicMetadata(topicId)
		this.clearStreamRecoveryTimer(topicId, correlationId)
		if (correlationId) this.clearStreamChunkLedger(topicId, correlationId)
		meta.isStreamLoading = false
		if (meta.timer) {
			clearTimeout(meta.timer)
			meta.timer = null
		}
		const completedStreamState = correlationId ? meta.content?.get(correlationId) : undefined
		if (correlationId && completedStreamState?.isFinalMessageReceived) {
			meta.finalizedCorrelationIds.add(correlationId)
			this.clearStreamRecoveryState(topicId, correlationId)
		}
		if (correlationId && meta.content?.has(correlationId)) {
			meta.content.delete(correlationId)
		}
		this.topicMeta.set(topicId, meta)

		if (correlationId) {
			const messages = this.messages.get(topicId) || []
			const targetMessage = this.findAssistantAliasTarget(topicId, correlationId, messages)
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

			const completedNode = this.getMessageNode(correlationId) as
				| RawSuperMagicMessageNode
				| undefined
			if (completedNode?.role === "assistant" && completedNode.status === "finished") {
				// finished assistant 是逐工具完成屏障。已有 canonical 或 buffer response
				// 会按 tool.id 被跳过，只为同轮真正缺失的工具生成弱终态。
				this.fillMissingToolResponses(topicId)
			}
			if (targetMessage?.app_message_id && targetMessage.app_message_id !== correlationId) {
				const currentNode = this.getMessageNode(correlationId) as
					| RawSuperMagicMessageNode
					| undefined
				if (currentNode) {
					// 完成后脱离可变 correlation 节点，避免后续 revision 改写旧 appId。
					this.messageMap.set(
						targetMessage.app_message_id,
						this.cloneAuthoritativeAssistantSnapshot(currentNode),
					)
				}
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
		const toolResponseMap = this.toolResponseMap.get(topicId) || new Map()

		topicMeta?.content.forEach((streamState, correlationId) => {
			if (streamState.isFinalMessageReceived) return

			const validToolCalls = this.getProjectableToolCalls(streamState.tool_calls).filter(
				isToolCallArgumentsComplete,
			)

			streamState.tool_calls = validToolCalls
			streamState.isFinalMessageReceived = true

			const cache = this.messageMap.get(correlationId) as RawSuperMagicMessageNode | undefined
			if (
				cache?.role === "assistant" &&
				cache.correlation_id === correlationId &&
				cache.topic_id === topicId
			) {
				cache.tool_calls = validToolCalls.length > 0 ? validToolCalls : []
				this.messageMap.set(correlationId, cache)
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

			this.completeStreamRendering(topicId, correlationId)
		})

		this.fillInterruptedToolResponses(topicId, toolResponseMap)
		this.toolResponseMap.set(topicId, toolResponseMap)
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
				toolResponseMap.set(toolId, this.mergeToolResponseState(current, missingResponse))
				changed = true
			})
		}

		;(this.messages.get(topicId) || []).forEach((message) => {
			if (message.role !== "assistant") return
			const node = (this.messageMap.get(message.app_message_id) ||
				this.messageMap.get(message.correlation_id)) as RawSuperMagicMessageNode | undefined
			if (!node) return
			if (
				excludedAssistantIds.has(message.app_message_id) ||
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

		if (changed) this.toolResponseMap.set(topicId, toolResponseMap)
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
		const finalTools = this.dedupeFinalToolCallsById(this.getProjectableToolCalls(incoming))
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

	private isProjectableToolCall(toolCall: ToolCall | undefined) {
		return Boolean(String(toolCall?.id || "").trim())
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

	private resumeFromCurrentStateV2(topicId: string, appMessageId: string): boolean {
		const streamState = this.getTopicStreamState(topicId, appMessageId)
		const messageMap =
			this.messageMap.get(appMessageId) || this.getDefaultNode(appMessageId, topicId)

		const finalContent = streamState.content || ""
		const finalReasoningContent = streamState.reasoning_content || ""
		const finalTools = this.getProjectableToolCalls(streamState.tool_calls)

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
			this.messageMap.set(appMessageId, messageMap)
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

	private getDefaultNode(correlationId: string, topicId: string): any {
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
			topic_id: topicId,
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
