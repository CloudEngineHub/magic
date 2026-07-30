import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { messagesConverter } from "@/pages/superMagic/components/MessageList/helpers"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type { MessageCommittedEvent } from "@/pages/superMagic/stores/events"
import type {
	RawSuperMagicMessageEnvelope,
	StreamRecoveryRequestPayload,
} from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
	type SuperMagicNode,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_A = "topic-sync-a"
const TOPIC_B = "topic-sync-b"
const AGENT_TOPIC_A = "agent-topic-a"
const CORRELATION_ID = "correlation-sync"
const SUPER_MESSAGE_ID = "super-message-sync"
const RENDER_SETTLE_MS = 2_000
// These broad fake-timer windows keep black-box observation finite; they are not product SLAs.
const INITIAL_RECOVERY_OBSERVATION_MS = 8_000
const RETRY_RECOVERY_OBSERVATION_MS = 20_000
const RECOVERY_MAX_ATTEMPTS = 3
const RECOVERY_TOTAL_BUDGET_MS = 30_000
const RECOVERY_POST_BUDGET_OBSERVATION_MS = 60_000

function toAssistantSuperMessageId(correlationId: string): string {
	return correlationId === CORRELATION_ID ? SUPER_MESSAGE_ID : `super-${correlationId}`
}

function toToolSuperMessageId(appMessageId: string): string {
	return `super-${appMessageId}`
}

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]
type ChunkToolCall = ChunkChoice["delta"]["tool_calls"][number]

interface ProjectedToolCall {
	id?: string
	index?: number
	type?: string
	function?: {
		name?: string
		arguments?: string
	}
	tool?: {
		id?: string
		status?: string
	}
}

interface ProjectedNode {
	app_message_id?: string
	super_message_id?: string
	role?: string
	topic_id?: string
	content?: string | null
	correlation_id?: string
	status?: string
	tool_call_id?: string
	tool_calls?: ProjectedToolCall[] | null
	tool?: {
		id?: string
		status?: string
	} | null
}

interface StreamRecoveryStateProjection {
	status?: string
	reason?: string
	attempts?: number
	elapsedMs?: number
}

interface StreamRecoveryFailurePayload {
	topicId: string
	correlationId: string
	status: "failed"
	reason: "recovery_failed"
	attempts: number
	elapsedMs: number
}

interface StreamRecoveryObservableStore {
	getStreamRecoveryState?: (
		topicId: string,
		correlationId: string,
	) => StreamRecoveryStateProjection | undefined
	registerOnStreamRecoveryFailed?: (
		callback: (payload: StreamRecoveryFailurePayload) => void,
	) => () => void
}

interface ChunkOptions {
	topicId?: string
	correlationId?: string
	superMessageId?: string
	i?: number
	content?: string
	reasoningContent?: string
	finishReason?: ChunkChoice["finish_reason"]
	toolCalls?: ChunkToolCall[]
	usage?: SuperMagicChunkMessage["super_magic_chunk"]["usage"]
	choices?: ChunkChoice[]
}

interface EnvelopeOptions {
	topicId?: string
	nodeTopicId?: string
	appMessageId?: string
	correlationId?: string
	superMessageId?: string
	seqId?: string
	role?: "assistant" | "tool" | "user"
	outerStatus?: ConversationMessageStatus
	content?: string | null
	toolCalls?: ProjectedToolCall[] | null
	omitContent?: boolean
	omitToolCalls?: boolean
	toolId?: string
	toolCallId?: string
	toolStatus?: string
	nodeStatus?: string
}

function createChunk({
	topicId = TOPIC_A,
	correlationId = CORRELATION_ID,
	superMessageId = toAssistantSuperMessageId(correlationId),
	i = 0,
	content = "",
	reasoningContent = "",
	finishReason = null,
	toolCalls = [],
	usage = null,
	choices,
}: ChunkOptions = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-chunk-${topicId}-${i}`,
		app_message_id: `app-chunk-${topicId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: topicId,
		chat_topic_id: topicId,
		message_id: `completion-${topicId}`,
		super_magic_chunk: {
			super_message_id: superMessageId,
			task_id: `task-${correlationId}`,
			i,
			usage,
			correlation_id: correlationId,
			choices: choices ?? [
				{
					...({ index: 0 } as const),
					finish_reason: finishReason,
					delta: {
						content,
						role: "assistant",
						tool_calls: toolCalls,
						reasoning_content: reasoningContent,
						index: 0,
					},
				},
			],
		},
	}
}

function createMetadataOnlyChunk({
	i,
	finishReason = null,
}: {
	i: number
	finishReason?: ChunkChoice["finish_reason"]
}): SuperMagicChunkMessage {
	return createChunk({
		i,
		choices: [
			{
				...({ index: 0 } as const),
				finish_reason: finishReason,
				delta: { index: 0 } as ChunkChoice["delta"],
			},
		],
	})
}

function createUsageOnlyChunk(i: number): SuperMagicChunkMessage {
	return createChunk({
		i,
		choices: [],
		usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
	})
}

function createToolCall({
	id = "tool-1",
	index = 0,
	arguments: argumentsValue = '{"path":"README.md"}',
	status,
}: {
	id?: string
	index?: number
	arguments?: string
	status?: string
} = {}): ChunkToolCall & ProjectedToolCall {
	return {
		id,
		index,
		type: "function",
		function: {
			name: "read_file",
			arguments: argumentsValue,
		},
		...(status ? { tool: { id, status } } : {}),
	}
}

function createEnvelope(options: EnvelopeOptions = {}): RawSuperMagicMessageEnvelope {
	const {
		topicId = TOPIC_A,
		nodeTopicId = topicId,
		appMessageId = "assistant-sync",
		correlationId = CORRELATION_ID,
		superMessageId,
		seqId = "100",
		role = "assistant",
		toolId = "tool-1",
		toolCallId = "legacy-tool-call-1",
		toolStatus = "finished",
		nodeStatus = role === "assistant" ? "finished" : "running",
		outerStatus = ConversationMessageStatus.Read,
		omitContent = false,
		omitToolCalls = false,
	} = options
	const content = Object.prototype.hasOwnProperty.call(options, "content")
		? options.content
		: role === "assistant"
			? "canonical"
			: null
	const toolCalls = Object.prototype.hasOwnProperty.call(options, "toolCalls")
		? options.toolCalls
		: role === "assistant"
			? []
			: null
	const resolvedSuperMessageId =
		role === "user"
			? appMessageId
			: String(
					superMessageId ||
						(role === "assistant"
							? toAssistantSuperMessageId(correlationId)
							: toToolSuperMessageId(appMessageId)),
				)
	const node = {
		role,
		topic_id: nodeTopicId,
		message_id: `node-${appMessageId}`,
		super_message_id: resolvedSuperMessageId,
		correlation_id: correlationId,
		reasoning_content: null,
		status: nodeStatus,
		send_timestamp: Number(seqId) || 1,
	} as SuperMagicNode
	if (!omitContent) node.content = content
	if (!omitToolCalls) node.tool_calls = toolCalls
	if (role === "tool") {
		node.tool_call_id = toolCallId
		node.tool = {
			id: toolId,
			name: "read_file",
			status: toolStatus,
		}
	}

	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-1",
			seq_id: seqId,
			message_id: `server-${seqId}-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: role === "user" ? "user-1" : "assistant-1",
				send_time: Number(seqId) || 1,
				status: outerStatus,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	// Runtime accepts V2, while RawSuperMagicMessageEnvelope still omits that variant.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(TOPIC_A)
	return store
}

function getNode(store: SuperMagicStore, superMessageId: string): ProjectedNode | undefined {
	const directNode = store.getMessageNode(superMessageId)
	const projectedBySuperMessageId = Array.from(store.messages.values())
		.flatMap((messages) => Array.from(messages))
		.find((message) => message.super_message_id === superMessageId)
	const node = directNode ?? projectedBySuperMessageId
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function getMessageRecords(
	store: SuperMagicStore,
	topicId = TOPIC_A,
): Array<Record<string, unknown>> {
	return Array.from(store.messages.get(topicId) ?? []) as Array<Record<string, unknown>>
}

function getUiMessages(store: SuperMagicStore, topicId = TOPIC_A): Array<Record<string, unknown>> {
	return messagesConverter(getMessageRecords(store, topicId)) as Array<Record<string, unknown>>
}

function getBufferedAppMessageIds(store: SuperMagicStore, topicId = TOPIC_A): string[] {
	return (store.buffer.get(topicId)?.messages ?? [])
		.map((message) => (message as RawSuperMagicMessageEnvelope).seq?.message?.app_message_id)
		.filter((appMessageId): appMessageId is string => typeof appMessageId === "string")
}

function getEmbeddedToolState(
	store: SuperMagicStore,
	toolId = "tool-1",
	correlationId = CORRELATION_ID,
): ProjectedToolCall["tool"] | undefined {
	const superMessageId = toAssistantSuperMessageId(correlationId)
	return getNode(store, superMessageId)?.tool_calls?.find((tool) => tool.id === toolId)?.tool
}

function getCanonicalToolState(store: SuperMagicStore, toolId: string, topicId = TOPIC_A) {
	return store.toolResponseMap.get(topicId)?.get(toolId) as ProjectedToolCall["tool"] | undefined
}

function getEffectiveToolState(
	store: SuperMagicStore,
	toolId = "tool-1",
	correlationId = CORRELATION_ID,
	topicId = TOPIC_A,
): ProjectedToolCall["tool"] | undefined {
	return (
		getCanonicalToolState(store, toolId, topicId) ??
		getEmbeddedToolState(store, toolId, correlationId)
	)
}

function advanceRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function advanceUntilRecovery(
	events: StreamRecoveryRequestPayload[],
	expectedCount: number,
	maxMilliseconds: number,
): number | undefined {
	for (let elapsed = 0; elapsed <= maxMilliseconds; elapsed += 100) {
		if (events.length >= expectedCount) return elapsed
		vi.advanceTimersByTime(100)
	}
	return undefined
}

function collectRecoveryRequests(store: SuperMagicStore): {
	events: StreamRecoveryRequestPayload[]
	unsubscribe: () => void
} {
	const events: StreamRecoveryRequestPayload[] = []
	const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => events.push(payload))
	return { events, unsubscribe }
}

function getStreamRecoveryState(
	store: SuperMagicStore,
	topicId = TOPIC_A,
	correlationId = CORRELATION_ID,
): StreamRecoveryStateProjection | undefined {
	const observableStore = store as unknown as StreamRecoveryObservableStore
	return observableStore.getStreamRecoveryState?.call(store, topicId, correlationId)
}

function collectRecoveryFailures(store: SuperMagicStore): {
	events: StreamRecoveryFailurePayload[]
	isSupported: boolean
	unsubscribe: () => void
} {
	const events: StreamRecoveryFailurePayload[] = []
	const observableStore = store as unknown as StreamRecoveryObservableStore
	const register = observableStore.registerOnStreamRecoveryFailed
	const unsubscribe =
		register?.call(store, (payload) => events.push(payload)) ?? (() => undefined)
	return { events, isSupported: typeof register === "function", unsubscribe }
}

function collectTopicArrivals(store: SuperMagicStore): {
	events: MessageCommittedEvent[]
	unsubscribe: () => void
} {
	const events: MessageCommittedEvent[] = []
	const unsubscribe = store.subscribe("message.committed", (event) => events.push(event), {
		scope: { topicId: TOPIC_A },
	})
	return { events, unsubscribe }
}

describe("SuperMagicStore / HTTP 权威同步与恢复", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(0)
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it("已有 HTTP sync 时 watchdog 必须复用该请求，不再发起 recovery。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ content: "incomplete" }))
		const generation = store.beginTopicSync(TOPIC_A)
		advanceUntilRecovery(recovery.events, 1, INITIAL_RECOVERY_OBSERVATION_MS)

		expect(store.isTopicSyncCurrent(TOPIC_A, generation)).toBe(true)
		expect(recovery.events).toHaveLength(0)
		store.cancelTopicSync(TOPIC_A, generation)
		recovery.unsubscribe()
	})

	it("同一 correlation 的 recovery 开始同步后必须合并后续 watchdog。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		let inFlightGeneration: number | undefined
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			inFlightGeneration ??= store.beginTopicSync(payload.topicId)
		})

		store.receiveChunk(createChunk({ content: "incomplete" }))
		const firstDelay = advanceUntilRecovery(events, 1, INITIAL_RECOVERY_OBSERVATION_MS)
		expect(inFlightGeneration).toBeDefined()

		// Re-arm the same correlation while the recovery request is still current.
		// Without this second chunk, the test could pass merely because no new watchdog was scheduled.
		store.receiveChunk(createChunk({ i: 1, content: "still incomplete" }))
		vi.advanceTimersByTime(RETRY_RECOVERY_OBSERVATION_MS * 2)

		expect(firstDelay).toBeDefined()
		expect(firstDelay).toBeGreaterThan(0)
		expect(events).toEqual([{ topicId: TOPIC_A, correlationId: CORRELATION_ID }])
		if (inFlightGeneration !== undefined) {
			store.cancelTopicSync(TOPIC_A, inFlightGeneration)
		}
		unsubscribe()
	})

	it("recovery requested listener 抛错时必须隔离异常并继续通知后续 listener。", () => {
		const store = createStore()
		const listenerError = new Error("listener failed")
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		const unsubscribeThrowing = store.registerOnStreamRecoveryRequested(() => {
			throw listenerError
		})
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ content: "incomplete" }))

		expect(() => {
			vi.advanceTimersByTime(INITIAL_RECOVERY_OBSERVATION_MS)
		}).not.toThrow()
		expect(recovery.events).toEqual([{ topicId: TOPIC_A, correlationId: CORRELATION_ID }])
		expect(consoleError).toHaveBeenCalledWith(
			"[SuperMagicStore] stream recovery request listener error",
			expect.objectContaining({
				error: listenerError,
				topicId: TOPIC_A,
				correlationId: CORRELATION_ID,
			}),
		)

		unsubscribeThrowing()
		recovery.unsubscribe()
	})

	it("取消当前 recovery sync 后必须重新进入 watchdog，不能永久停在 waiting。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		let inFlightGeneration: number | undefined
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			inFlightGeneration ??= store.beginTopicSync(payload.topicId)
		})

		store.receiveChunk(createChunk({ content: "incomplete" }))
		expect(advanceUntilRecovery(events, 1, INITIAL_RECOVERY_OBSERVATION_MS)).toBeDefined()
		expect(inFlightGeneration).toBeDefined()

		if (inFlightGeneration !== undefined) {
			store.cancelTopicSync(TOPIC_A, inFlightGeneration)
		}

		expect(advanceUntilRecovery(events, 2, RETRY_RECOVERY_OBSERVATION_MS)).toBeDefined()
		expect(events).toEqual([
			{ topicId: TOPIC_A, correlationId: CORRELATION_ID },
			{ topicId: TOPIC_A, correlationId: CORRELATION_ID },
		])
		unsubscribe()
	})

	it("新 topic sync 抢占旧 generation 后必须释放旧 topic 的 syncing 状态。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ content: "topic A incomplete" }))
		const generationA = store.beginTopicSync(TOPIC_A)
		store.setActiveTopicId(TOPIC_B)
		const generationB = store.beginTopicSync(TOPIC_B)

		expect(store.isTopicSyncCurrent(TOPIC_A, generationA)).toBe(false)
		expect(store.isTopicSyncCurrent(TOPIC_B, generationB)).toBe(true)
		store.cancelTopicSync(TOPIC_B, generationB)
		store.setActiveTopicId(TOPIC_A)

		expect(
			advanceUntilRecovery(recovery.events, 1, INITIAL_RECOVERY_OBSERVATION_MS),
		).toBeDefined()
		expect(recovery.events).toEqual([{ topicId: TOPIC_A, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
	})

	it("旧恢复请求的低 seq HTTP 数据进入 initializeMessages 后仍不得回退。", () => {
		const store = createStore()
		const oldGeneration = store.beginTopicSync(TOPIC_A)
		const newGeneration = store.beginTopicSync(TOPIC_A)

		expect(store.isTopicSyncCurrent(TOPIC_A, oldGeneration)).toBe(false)
		expect(store.isTopicSyncCurrent(TOPIC_A, newGeneration)).toBe(true)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({ appMessageId: "same-response", seqId: "200", content: "new" }),
		])
		expect(
			store.completeTopicSync(TOPIC_A, newGeneration, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "200",
			}),
		).toBe(true)

		// D9: generation does not guard data writes; initializeMessages owns version arbitration.
		store.initializeMessages(TOPIC_A, [
			createEnvelope({ appMessageId: "same-response", seqId: "100", content: "old" }),
		])
		expect(
			store.completeTopicSync(TOPIC_A, oldGeneration, {
				succeeded: true,
				latestSeqId: "100",
			}),
		).toBe(false)

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("new")
		expect(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "same-response",
				correlation_id: CORRELATION_ID,
				seq_id: "200",
			},
		])
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
	})

	it("公共锚点尾部替换保留锚点前缀，并移除 HTTP 覆盖范围内缺席的完整撤回分支。", () => {
		const store = createStore()
		const prefix = createEnvelope({
			appMessageId: "stable-prefix",
			seqId: "100",
			role: "user",
		})
		const revokedUser = createEnvelope({
			appMessageId: "removed-user",
			seqId: "200",
			role: "user",
		})
		const removedAssistant = createEnvelope({
			appMessageId: "removed-assistant",
			correlationId: "removed-assistant-correlation",
			superMessageId: "removed-assistant-super-message",
			seqId: "201",
		})
		const removedTool = createEnvelope({
			appMessageId: "removed-tool",
			correlationId: "removed-assistant-correlation",
			superMessageId: "removed-tool-super-message",
			seqId: "202",
			role: "tool",
			toolId: "removed-tool-id",
		})
		store.initializeMessages(TOPIC_A, [prefix, revokedUser, removedAssistant, removedTool])

		const messageB = createEnvelope({
			appMessageId: "message-b",
			seqId: "300",
			role: "user",
		})
		store.initializeMessages(TOPIC_A, [messageB, prefix], {
			mode: "replace_tail",
			anchorSuperMessageId: "stable-prefix",
		})

		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual([
			"stable-prefix",
			"message-b",
		])
		expect(getNode(store, "removed-assistant-super-message")).toBeUndefined()
		expect(getNode(store, "removed-tool-super-message")).toBeUndefined()
	})

	it("公共锚点尾部替换清理缺席活动流及工具派生状态，并阻断旧分支晚到 Chunk/Final。", () => {
		const store = createStore()
		const prefix = createEnvelope({
			appMessageId: "stable-prefix",
			seqId: "100",
			role: "user",
		})
		const removedUser = createEnvelope({
			appMessageId: "removed-user",
			seqId: "200",
			role: "user",
		})
		const removedTool = createEnvelope({
			appMessageId: "removed-tool",
			correlationId: "removed-stream-correlation",
			superMessageId: "removed-tool-super-message",
			seqId: "202",
			role: "tool",
			toolId: "removed-tool-id",
		})
		store.initializeMessages(TOPIC_A, [prefix, removedUser])
		vi.setSystemTime(201)
		store.receiveChunk(
			createChunk({
				correlationId: "removed-stream-correlation",
				superMessageId: "removed-stream-super-message",
				content: "removed draft",
				toolCalls: [createToolCall({ id: "removed-tool-id" })],
			}),
		)
		store.enqueueMessage(TOPIC_A, removedTool)

		expect(store.getStreamState(TOPIC_A, "removed-stream-super-message")).toBeDefined()
		expect(getCanonicalToolState(store, "removed-tool-id")).toBeDefined()

		const messageB = createEnvelope({
			appMessageId: "message-b",
			seqId: "300",
			role: "user",
		})
		store.initializeMessages(TOPIC_A, [messageB, prefix], {
			mode: "replace_tail",
			anchorSuperMessageId: "stable-prefix",
			preserveStreamSuperMessageIds: [],
		})

		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual([
			"stable-prefix",
			"message-b",
		])
		expect(store.getStreamState(TOPIC_A, "removed-stream-super-message")).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getNode(store, "removed-stream-super-message")).toBeUndefined()
		expect(getCanonicalToolState(store, "removed-tool-id")).toBeUndefined()

		store.receiveChunk(
			createChunk({
				correlationId: "removed-stream-correlation",
				superMessageId: "removed-stream-super-message",
				i: 1,
				content: "late chunk",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "removed-assistant-final",
				correlationId: "removed-stream-correlation",
				superMessageId: "removed-stream-super-message",
				seqId: "201",
				content: "late final",
			}),
		)

		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual([
			"stable-prefix",
			"message-b",
		])
		expect(store.getStreamState(TOPIC_A, "removed-stream-super-message")).toBeUndefined()
		expect(getNode(store, "removed-stream-super-message")).toBeUndefined()
	})

	it("公共锚点仍保留当前 User 轮次时，不删除尚未收到 Final 的同轮活动流。", () => {
		const store = createStore()
		const prefix = createEnvelope({
			appMessageId: "stable-prefix",
			seqId: "100",
			role: "user",
		})
		const currentUser = createEnvelope({
			appMessageId: "current-user",
			seqId: "200",
			role: "user",
		})
		store.initializeMessages(TOPIC_A, [prefix, currentUser])
		store.receiveChunk(
			createChunk({
				correlationId: "current-stream-correlation",
				superMessageId: "current-stream-super-message",
				content: "current draft",
			}),
		)

		store.initializeMessages(TOPIC_A, [currentUser, prefix], {
			mode: "replace_tail",
			anchorSuperMessageId: "current-user",
			preserveStreamSuperMessageIds: [],
		})

		expect(store.getStreamState(TOPIC_A, "current-stream-super-message")).toBeDefined()
		expect(getNode(store, "current-stream-super-message")).toBeDefined()
		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual([
			"stable-prefix",
			"current-user",
			"current-stream-super-message",
		])
	})

	it("公共锚点在提交前消失时降级为 merge，不得执行缺席删除。", () => {
		const store = createStore()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({ appMessageId: "stable-prefix", seqId: "100", role: "user" }),
			createEnvelope({ appMessageId: "keep-local", seqId: "200", role: "user" }),
		])

		store.initializeMessages(
			TOPIC_A,
			[createEnvelope({ appMessageId: "message-b", seqId: "300", role: "user" })],
			{
				mode: "replace_tail",
				anchorSuperMessageId: "missing-anchor",
			},
		)

		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual([
			"stable-prefix",
			"keep-local",
			"message-b",
		])
	})

	it("HTTP 外层 transport topic 负责路由，内层 Agent topic 保留业务映射。", () => {
		const store = createStore()
		const generationB = store.beginTopicSync(TOPIC_B)

		store.initializeMessages(TOPIC_B, [
			createEnvelope({
				topicId: TOPIC_B,
				nodeTopicId: AGENT_TOPIC_A,
				appMessageId: "dual-domain-response",
				correlationId: "dual-domain-correlation",
			}),
		])

		expect(getMessageRecords(store, TOPIC_A)).toHaveLength(0)
		expect(getMessageRecords(store, TOPIC_B)).toMatchObject([
			{
				app_message_id: "dual-domain-response",
				correlation_id: "dual-domain-correlation",
				topic_id: TOPIC_B,
			},
		])
		expect(getNode(store, toAssistantSuperMessageId("dual-domain-correlation"))?.topic_id).toBe(
			AGENT_TOPIC_A,
		)
		expect(
			store.completeTopicSync(TOPIC_B, generationB, {
				succeeded: true,
			}),
		).toBe(true)
		expect(store.completeTopicSync(TOPIC_A, generationB, { succeeded: true })).toBe(false)
	})

	it("清理 outer topic 时不能用 inner Agent topic 判断 canonical ownership。", () => {
		const store = createStore()

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				topicId: TOPIC_A,
				nodeTopicId: AGENT_TOPIC_A,
				appMessageId: "outer-a-app",
				correlationId: "outer-a-correlation",
				content: "keep topic A",
			}),
		])
		store.initializeMessages(TOPIC_B, [
			createEnvelope({
				topicId: TOPIC_B,
				nodeTopicId: AGENT_TOPIC_A,
				appMessageId: "outer-b-app",
				correlationId: "outer-b-correlation",
				content: "remove topic B",
			}),
		])
		const generation = store.beginTopicSync(TOPIC_B)

		store.initializeMessages(TOPIC_B, [], { syncGeneration: generation })
		expect(
			store.completeTopicSync(TOPIC_B, generation, {
				succeeded: true,
				taskStatus: "finished",
			}),
		).toBe(true)

		expect
			.soft(getNode(store, toAssistantSuperMessageId("outer-a-correlation"))?.content)
			.toBe("keep topic A")
		expect(getNode(store, toAssistantSuperMessageId("outer-b-correlation"))).toBeUndefined()
		expect.soft(getMessageRecords(store, TOPIC_A)).toHaveLength(1)
		expect.soft(getMessageRecords(store, TOPIC_B)).toHaveLength(0)
	})

	it("HTTP 响应没有包含目标 correlation。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ content: "target draft" }))
		const generation = store.beginTopicSync(TOPIC_A)
		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "unrelated-app",
					correlationId: "unrelated-correlation",
					seqId: "200",
					content: "unrelated",
				}),
			],
			{ mode: "replace", syncGeneration: generation },
		)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "200",
			}),
		).toBe(true)

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.content).toBe("target draft")
		expect(getNode(store, toAssistantSuperMessageId("unrelated-correlation"))?.content).toBe(
			"unrelated",
		)
		expect(
			advanceUntilRecovery(recovery.events, 1, INITIAL_RECOVERY_OBSERVATION_MS),
		).toBeDefined()
		expect(recovery.events).toEqual([{ topicId: TOPIC_A, correlationId: CORRELATION_ID }])

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "target-app",
				correlationId: CORRELATION_ID,
				seqId: "201",
				content: "target canonical",
			}),
		)
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("target canonical")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		recovery.unsubscribe()
	})

	it("missing Final 触发 recovery 后，HTTP Assistant 完成 canonical 结算并释放 buffer。", () => {
		const store = createStore()
		const recoveryEvents: StreamRecoveryRequestPayload[] = []
		const arrivals = collectTopicArrivals(store)
		const recoveredAssistant = createEnvelope({
			appMessageId: "recovered-real-app",
			correlationId: CORRELATION_ID,
			seqId: "200",
			content: "authoritative recovered content",
		})
		const followingAssistant = createEnvelope({
			appMessageId: "following-app",
			correlationId: "following-correlation",
			seqId: "202",
			content: "following canonical content",
		})
		const queuedAssistant = createEnvelope({
			appMessageId: "queued-final-app",
			correlationId: "queued-final-correlation",
			seqId: "201",
			content: "queued canonical content",
		})
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			recoveryEvents.push(payload)
			const syncGeneration = store.beginTopicSync(payload.topicId)
			// Simulate the authoritative HTTP response for A only. B must survive in the pre-existing buffer.
			store.initializeMessages(payload.topicId, [recoveredAssistant], {
				mode: "replace",
				syncGeneration,
			})
			store.completeTopicSync(payload.topicId, syncGeneration, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "200",
			})
		})

		store.receiveChunk(createChunk({ content: "local draft without Final" }))
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeDefined()
		// A second real stream contributes a Final at the queue head while A still owns the topic timer.
		store.receiveChunk(
			createChunk({
				correlationId: "queued-final-correlation",
				content: "queued draft",
			}),
		)
		store.enqueueMessage(TOPIC_A, queuedAssistant)
		store.enqueueMessage(TOPIC_A, followingAssistant)
		// C 没有 StreamState，不能被前序 correlation 的动画或 Final 队头阻塞。
		expect(getNode(store, "super-following-correlation")?.content).toBe(
			"following canonical content",
		)
		expect(getMessageRecords(store)).toEqual(
			expect.arrayContaining([expect.objectContaining({ app_message_id: "following-app" })]),
		)
		expect(
			arrivals.events.filter(
				(event) => event.payload.message.appMessageId === "following-app",
			),
		).toHaveLength(1)
		expect(getNode(store, "super-queued-final-correlation")).toBeUndefined()
		expect(getBufferedAppMessageIds(store)).toContain("queued-final-app")
		expect(getBufferedAppMessageIds(store)).not.toContain("following-app")

		expect(
			advanceUntilRecovery(recoveryEvents, 1, INITIAL_RECOVERY_OBSERVATION_MS),
		).toBeDefined()
		advanceRendering()

		expect(recoveryEvents).toEqual([{ topicId: TOPIC_A, correlationId: CORRELATION_ID }])
		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("authoritative recovered content")
		expect(
			getUiMessages(store).filter(
				(message) =>
					message.role === "assistant" && message.correlation_id === CORRELATION_ID,
			),
		).toHaveLength(1)
		expect(getNode(store, "super-queued-final-correlation")?.content).toBe(
			"queued canonical content",
		)
		expect(getNode(store, "super-following-correlation")?.content).toBe(
			"following canonical content",
		)
		expect(getMessageRecords(store)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ app_message_id: "recovered-real-app" }),
				expect.objectContaining({ app_message_id: "queued-final-app" }),
				expect.objectContaining({ app_message_id: "following-app" }),
			]),
		)
		expect(store.buffer.get(TOPIC_A)?.messages ?? []).toHaveLength(0)
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getStreamRecoveryState(store)).toBeUndefined()
		expect(store.topicMeta.get(TOPIC_A)?.timer).toBeNull()
		expect(store.topicMeta.get(TOPIC_A)?.recoveryTimer).toBeNull()
		expect(
			arrivals.events.filter(
				(event) => event.payload.message.appMessageId === "following-app",
			),
		).toHaveLength(1)
		unsubscribe()
		arrivals.unsubscribe()
	})

	it("完整 HTTP 请求返回空 authoritative snapshot 时清空 topic。", () => {
		const store = createStore()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "removed-by-empty-snapshot",
				correlationId: "removed-by-empty-correlation",
				seqId: "100",
			}),
		])
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "100",
			}),
		).toBe(true)

		expect(
			getNode(store, toAssistantSuperMessageId("removed-by-empty-correlation")),
		).toBeUndefined()
		expect.soft(getMessageRecords(store)).toHaveLength(0)
		expect.soft(getUiMessages(store)).toHaveLength(0)
	})

	it("成功空 snapshot 必须丢弃同步开始前被旧流阻塞的 buffer 条目。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({ correlationId: "timer-owner-correlation", content: "timer owner" }),
		)
		store.receiveChunk(
			createChunk({ correlationId: "buffer-blocker-correlation", content: "buffer blocker" }),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "buffer-blocker-final",
				correlationId: "buffer-blocker-correlation",
				seqId: "199",
				content: "buffer blocker final",
			}),
		)
		store.receiveChunk(
			createChunk({
				correlationId: "buffered-before-sync-correlation",
				content: "buffered before sync draft",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "buffered-before-sync",
				correlationId: "buffered-before-sync-correlation",
				seqId: "200",
				content: "must be discarded",
			}),
		)
		expect(store.buffer.get(TOPIC_A)?.messages.length).toBeGreaterThan(1)
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [], { syncGeneration: generation })
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
			}),
		).toBe(true)
		advanceRendering()

		expect(
			getNode(store, toAssistantSuperMessageId("buffered-before-sync-correlation")),
		).toBeUndefined()
		expect.soft(getMessageRecords(store)).toHaveLength(0)
		expect.soft(store.buffer.get(TOPIC_A)?.messages).toHaveLength(0)
	})

	it("HTTP 请求失败或分页未完成时不提交空 snapshot，保留现有 topic 数据。", () => {
		const store = createStore()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "preserved-after-incomplete-request",
				correlationId: "preserved-after-incomplete-correlation",
				seqId: "100",
				content: "preserved",
			}),
		])
		const generation = store.beginTopicSync(TOPIC_A)

		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: false,
				taskStatus: "running",
			}),
		).toBe(true)

		expect(
			getNode(store, toAssistantSuperMessageId("preserved-after-incomplete-correlation"))
				?.content,
		).toBe("preserved")
		expect(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "preserved-after-incomplete-request",
				seq_id: "100",
			},
		])
	})

	it("authoritative snapshot 按 seq_id 升序标准化，相同 seq 保持输入稳定顺序。", () => {
		const store = createStore()

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "seq-300",
				correlationId: "correlation-300",
				seqId: "300",
			}),
			createEnvelope({
				appMessageId: "seq-200-first",
				correlationId: "correlation-200-first",
				seqId: "200",
			}),
			createEnvelope({
				appMessageId: "seq-100",
				correlationId: "correlation-100",
				seqId: "100",
			}),
			createEnvelope({
				appMessageId: "seq-200-second",
				correlationId: "correlation-200-second",
				seqId: "200",
			}),
		])

		const expectedOrder = ["seq-100", "seq-200-first", "seq-200-second", "seq-300"]
		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual(
			expectedOrder,
		)
		expect(getUiMessages(store).map((message) => message.app_message_id)).toEqual(expectedOrder)
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("300")
	})

	it("分页结果必须先聚合，再以一次 authoritative snapshot 替换 topic 视图。", () => {
		const store = createStore()

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "snapshot-only-old-app",
				correlationId: "snapshot-only-old-correlation",
				seqId: "90",
				content: "must be removed",
			}),
			createEnvelope({
				appMessageId: "same-app",
				correlationId: "same-correlation",
				seqId: "200",
				content: "local newer",
			}),
		])
		const aggregatedPages = [
			createEnvelope({
				appMessageId: "newest-app",
				correlationId: "newest-correlation",
				seqId: "202",
				content: "newest",
			}),
			createEnvelope({
				appMessageId: "same-app",
				correlationId: "same-correlation",
				seqId: "100",
				content: "stale page item",
			}),
		]

		store.initializeMessages(TOPIC_A, aggregatedPages)

		expect(
			getNode(store, toAssistantSuperMessageId("snapshot-only-old-correlation")),
		).toBeUndefined()
		expect.soft(getNode(store, "super-same-correlation")?.content).toBe("local newer")
		expect
			.soft(getNode(store, toAssistantSuperMessageId("newest-correlation"))?.content)
			.toBe("newest")
		const records = getMessageRecords(store)
		expect
			.soft(records)
			.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ app_message_id: "newest-app", seq_id: "202" }),
					expect.objectContaining({ app_message_id: "same-app", seq_id: "200" }),
				]),
			)
		expect.soft(records).toHaveLength(2)
		expect
			.soft(getUiMessages(store))
			.toEqual(
				expect.arrayContaining([
					expect.objectContaining({ app_message_id: "newest-app", seq_id: "202" }),
					expect.objectContaining({ app_message_id: "same-app", seq_id: "200" }),
				]),
			)
		expect.soft(getUiMessages(store)).toHaveLength(2)
		expect.soft(store.getLatestMessageSeqId(TOPIC_A)).toBe("202")
	})

	it("同逻辑消息的低 seq HTTP 快照不得回退 IM canonical 数据。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "same-app", seqId: "200", content: "local new" }),
		)
		advanceRendering()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({ appMessageId: "same-app", seqId: "100", content: "HTTP old" }),
		])

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("local new")
		expect(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "same-app",
				correlation_id: CORRELATION_ID,
				seq_id: "200",
				role: "assistant",
			},
		])
		expect(getUiMessages(store)).toHaveLength(1)
		expect(getUiMessages(store)[0]).toMatchObject({
			app_message_id: "same-app",
			correlation_id: CORRELATION_ID,
			seq_id: "200",
		})
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
	})

	it("同一逻辑消息 equal seq 但 payload 冲突时保留首次 canonical 并记录结构化冲突。", () => {
		const store = createStore()
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "equal-seq-app",
				correlationId: "equal-seq-correlation",
				seqId: "100",
				content: "first canonical",
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "equal-seq-app",
				correlationId: "equal-seq-correlation",
				seqId: "100",
				content: "conflicting payload",
			}),
		])

		expect
			.soft(getNode(store, toAssistantSuperMessageId("equal-seq-correlation"))?.content)
			.toBe("first canonical")
		expect.soft(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "equal-seq-app",
				correlation_id: "equal-seq-correlation",
				seq_id: "100",
			},
		])
		expect.soft(getUiMessages(store)).toHaveLength(1)
		expect.soft(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
		expect.soft(warnSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				code: "assistant-seq-conflict",
				topicId: TOPIC_A,
				appMessageId: "equal-seq-app",
				correlationId: "equal-seq-correlation",
				seqId: "100",
				resolution: "preserve-first-canonical",
			}),
		)
	})

	it("[REV-01] Assistant 同 seq 的 HTTP 外层状态可从 read 更新为 revoked。", () => {
		const store = createStore()
		const identity = {
			appMessageId: "same-seq-revoke-app",
			correlationId: "same-seq-revoke-correlation",
			superMessageId: "same-seq-revoke-super-message",
			seqId: "100",
			content: "same canonical content",
			nodeStatus: "running",
		} as const

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				...identity,
				outerStatus: ConversationMessageStatus.Read,
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				...identity,
				outerStatus: ConversationMessageStatus.Revoked,
			}),
		])

		expect(
			getMessageRecords(store).find(
				(message) => message.super_message_id === identity.superMessageId,
			)?.status,
		).toBe(ConversationMessageStatus.Revoked)
		expect(getNode(store, identity.superMessageId)?.content).toBe("same canonical content")
	})

	it("[REV-02] Assistant 同 seq 的 HTTP 外层状态可从 revoked 恢复为 read。", () => {
		const store = createStore()
		const identity = {
			appMessageId: "same-seq-restore-app",
			correlationId: "same-seq-restore-correlation",
			superMessageId: "same-seq-restore-super-message",
			seqId: "100",
			content: "restorable canonical content",
			nodeStatus: "finished",
		} as const

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				...identity,
				outerStatus: ConversationMessageStatus.Revoked,
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				...identity,
				outerStatus: ConversationMessageStatus.Read,
			}),
		])

		expect(
			getMessageRecords(store).find(
				(message) => message.super_message_id === identity.superMessageId,
			)?.status,
		).toBe(ConversationMessageStatus.Read)
		expect(getNode(store, identity.superMessageId)?.content).toBe(
			"restorable canonical content",
		)
	})

	it("[REV-03] 低 seq HTTP 撤回状态生效，但不得回退 Assistant canonical 内容。", () => {
		const store = createStore()
		const identity = {
			appMessageId: "stale-content-authoritative-status-app",
			correlationId: "stale-content-authoritative-status-correlation",
			superMessageId: "stale-content-authoritative-status-super-message",
		} as const

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				...identity,
				seqId: "200",
				content: "latest canonical content",
				outerStatus: ConversationMessageStatus.Read,
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				...identity,
				seqId: "100",
				content: "stale HTTP content",
				outerStatus: ConversationMessageStatus.Revoked,
			}),
		])

		expect(
			getMessageRecords(store).find(
				(message) => message.super_message_id === identity.superMessageId,
			),
		).toMatchObject({
			seq_id: "200",
			status: ConversationMessageStatus.Revoked,
		})
		expect(getNode(store, identity.superMessageId)?.content).toBe("latest canonical content")
	})

	it("HTTP 响应比本地 StreamState 更新。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "local draft" }))
		store.initializeMessages(TOPIC_A, [
			createEnvelope({ seqId: "200", content: "HTTP canonical" }),
		])
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("HTTP canonical")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "assistant-sync", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(getUiMessages(store)).toMatchObject([{ app_message_id: "assistant-sync" }])
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("[REV-04] 外层 revoked 即使内层仍 running，也必须终结旧 correlation 流。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "local non-revoked draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "revoked-old-branch",
					correlationId: CORRELATION_ID,
					seqId: "200",
					content: "authoritative revoked branch",
					nodeStatus: "running",
					outerStatus: ConversationMessageStatus.Revoked,
				}),
				createEnvelope({
					appMessageId: "normal-new-branch",
					correlationId: "normal-new-correlation",
					seqId: "201",
					content: "authoritative normal branch",
				}),
			],
			{ mode: "replace", syncGeneration: generation },
		)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "201",
			}),
		).toBe(true)
		advanceRendering()

		expect(
			getMessageRecords(store).map((message) => ({
				appMessageId: message.app_message_id,
				status: message.status,
			})),
		).toEqual([
			{
				appMessageId: "revoked-old-branch",
				status: ConversationMessageStatus.Revoked,
			},
			{
				appMessageId: "normal-new-branch",
				status: ConversationMessageStatus.Read,
			},
		])
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("同一 HTTP replace 中的多条 revoked 消息作为一个权威批次原子保留。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "revoked-batch-1",
					correlationId: "revoked-batch-correlation-1",
					seqId: "200",
					outerStatus: ConversationMessageStatus.Revoked,
				}),
				createEnvelope({
					appMessageId: "revoked-batch-2",
					correlationId: "revoked-batch-correlation-2",
					seqId: "201",
					outerStatus: ConversationMessageStatus.Revoked,
				}),
			],
			{ mode: "replace", syncGeneration: generation },
		)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "201",
			}),
		).toBe(true)
		advanceRendering()

		expect(
			getMessageRecords(store).map((message) => ({
				appMessageId: message.app_message_id,
				status: message.status,
			})),
		).toEqual([
			{
				appMessageId: "revoked-batch-1",
				status: ConversationMessageStatus.Revoked,
			},
			{
				appMessageId: "revoked-batch-2",
				status: ConversationMessageStatus.Revoked,
			},
		])
	})

	it("[REV-05] running Assistant 撤回后迟到 chunk 和 Final 不得重开旧分支。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ i: 0, content: "draft before revoke" }))
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "revoked-settlement",
					correlationId: CORRELATION_ID,
					seqId: "200",
					content: "revoked canonical",
					nodeStatus: "running",
					outerStatus: ConversationMessageStatus.Revoked,
				}),
			],
			{ mode: "replace", syncGeneration: generation },
		)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)
		advanceRendering()

		store.receiveChunk(createChunk({ i: 1, content: "late chunk", finishReason: "stop" }))
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "revoked-settlement",
				correlationId: CORRELATION_ID,
				seqId: "201",
				content: "late non-revoked Final",
			}),
		)
		advanceRendering()

		expect(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "revoked-settlement",
				seq_id: "200",
				status: ConversationMessageStatus.Revoked,
			},
		])
		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("revoked canonical")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("HTTP 响应到达时 final chunk 同时到达。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		store.receiveChunk(createChunk({ i: 0, content: "draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({ seqId: "200", content: "HTTP canonical" }),
		])
		store.receiveChunk(createChunk({ i: 1, content: " stale tail", finishReason: "stop" }))
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("HTTP canonical")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		vi.advanceTimersByTime(RECOVERY_POST_BUDGET_OBSERVATION_MS)
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("HTTP assistant 与 tool response 并发时以 tool.id 的 canonical Map 状态为准。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				toolCalls: [createToolCall({ status: "running" })],
			}),
		])
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ role: "tool", appMessageId: "tool-response", seqId: "201" }),
		)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "201",
			}),
		).toBe(true)
		advanceRendering()

		expect(getEmbeddedToolState(store)?.status).toBe("running")
		expect(getNode(store, toToolSuperMessageId("tool-response"))?.tool_call_id).toBe(
			"legacy-tool-call-1",
		)
		expect(getCanonicalToolState(store, "tool-1")?.status).toBe("finished")
		expect(getCanonicalToolState(store, "legacy-tool-call-1")).toBeUndefined()
		expect(getEffectiveToolState(store)?.status).toBe("finished")
	})

	it("首个 correlation 已终态后，独立 HTTP merge 仍拒绝同 Topic 的其他 correlation 复用 tool.id。", () => {
		const store = createStore()
		const toolId = "http-shared-tool"
		const ownerCorrelationId = "http-tool-owner"
		const incomingCorrelationId = "http-tool-conflict"

		store.receiveChunk(
			createChunk({
				correlationId: ownerCorrelationId,
				toolCalls: [createToolCall({ id: toolId, status: "running" })],
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "http-tool-owner-app",
				correlationId: ownerCorrelationId,
				seqId: "100",
				content: "owner canonical",
				toolCalls: [createToolCall({ id: toolId, status: "running" })],
				nodeStatus: "finished",
			}),
		)
		advanceRendering()

		expect(
			getNode(store, toAssistantSuperMessageId(ownerCorrelationId))?.tool_calls?.map(
				(tool) => tool.id,
			),
		).toEqual([toolId])
		expect(store.getStreamState(TOPIC_A, ownerCorrelationId)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)

		const generation = store.beginTopicSync(TOPIC_A)
		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "http-tool-conflict-app",
					correlationId: incomingCorrelationId,
					seqId: "101",
					content: "conflicting canonical",
					toolCalls: [createToolCall({ id: toolId, status: "running" })],
				}),
			],
			{ mode: "merge", syncGeneration: generation },
		)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "101",
			}),
		).toBe(true)
		advanceRendering()

		expect(
			getNode(store, toAssistantSuperMessageId(ownerCorrelationId))?.tool_calls?.map(
				(tool) => tool.id,
			),
		).toEqual([toolId])
		expect(getNode(store, toAssistantSuperMessageId(incomingCorrelationId))).toMatchObject({
			role: "assistant",
			correlation_id: incomingCorrelationId,
			content: "conflicting canonical",
		})
		expect(
			getNode(store, toAssistantSuperMessageId(incomingCorrelationId))?.tool_calls?.some(
				(tool) => tool.id === toolId,
			) ?? false,
		).toBe(false)
		expect(getMessageRecords(store)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					app_message_id: "http-tool-owner-app",
					correlation_id: ownerCorrelationId,
				}),
				expect.objectContaining({
					app_message_id: "http-tool-conflict-app",
					correlation_id: incomingCorrelationId,
				}),
			]),
		)
	})

	it("同 super_message_id、不同 app/correlation 的 HTTP revision 按高 seq 收敛。", () => {
		const store = createStore()

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "old-app",
				superMessageId: "shared-http-super-message",
				correlationId: "original-correlation",
				seqId: "100",
				content: "original",
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "new-app",
				superMessageId: "shared-http-super-message",
				correlationId: "different-correlation",
				seqId: "200",
				content: "must not overwrite",
			}),
		])

		expect.soft(getNode(store, "shared-http-super-message")).toMatchObject({
			app_message_id: "new-app",
			super_message_id: "shared-http-super-message",
			correlation_id: "different-correlation",
			content: "must not overwrite",
		})
		expect.soft(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "new-app",
				super_message_id: "shared-http-super-message",
				correlation_id: "different-correlation",
				seq_id: "200",
			},
		])
		expect.soft(getUiMessages(store)).toMatchObject([
			{
				app_message_id: "new-app",
				super_message_id: "shared-http-super-message",
				correlation_id: "different-correlation",
				seq_id: "200",
			},
		])
		expect.soft(getUiMessages(store)).toHaveLength(1)
		expect.soft(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
	})

	it("同一 HTTP snapshot 内同 super_message_id 的后续高 seq revision 胜出。", () => {
		const store = createStore()

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "old-batch-app",
				superMessageId: "shared-batch-super-message",
				correlationId: "original-batch-correlation",
				seqId: "100",
				content: "original",
			}),
			createEnvelope({
				appMessageId: "new-batch-app",
				superMessageId: "shared-batch-super-message",
				correlationId: "different-batch-correlation",
				seqId: "200",
				content: "must not overwrite",
			}),
		])

		expect.soft(getNode(store, "shared-batch-super-message")).toMatchObject({
			app_message_id: "new-batch-app",
			super_message_id: "shared-batch-super-message",
			correlation_id: "different-batch-correlation",
			content: "must not overwrite",
		})
		expect.soft(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "new-batch-app",
				super_message_id: "shared-batch-super-message",
				correlation_id: "different-batch-correlation",
				seq_id: "200",
			},
		])
		expect.soft(getUiMessages(store)).toHaveLength(1)
		expect.soft(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
	})

	it("跨分页聚合的同 super_message_id revision 仍按高 seq 收敛。", () => {
		const store = createStore()
		const newestPage = [
			createEnvelope({
				appMessageId: "newest-page-app",
				superMessageId: "cross-page-super-message",
				correlationId: "newest-page-correlation",
				seqId: "200",
				content: "newest page revision",
			}),
		]
		const olderPage = [
			createEnvelope({
				appMessageId: "older-page-app",
				superMessageId: "cross-page-super-message",
				correlationId: "older-page-correlation",
				seqId: "100",
				content: "older page revision",
			}),
		]

		// 页面层先聚合所有分页，再把一个完整 authoritative snapshot 交给 Store。
		store.initializeMessages(TOPIC_A, [...newestPage, ...olderPage])

		expect.soft(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "newest-page-app",
				super_message_id: "cross-page-super-message",
				correlation_id: "newest-page-correlation",
				seq_id: "200",
			},
		])
		expect.soft(getUiMessages(store)).toMatchObject([
			{
				app_message_id: "newest-page-app",
				super_message_id: "cross-page-super-message",
				correlation_id: "newest-page-correlation",
				seq_id: "200",
			},
		])
		expect.soft(getUiMessages(store)).toHaveLength(1)
		expect.soft(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
	})

	it("initializeMessages 按 correlationId 隔离不同 role 的消息。", () => {
		const store = createStore()

		// D2: role 隔离必须在同一次 authoritative snapshot 内验证，不能依赖旧列表残留。
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				role: "tool",
				appMessageId: "tool-app",
				correlationId: "role-collision",
				seqId: "100",
			}),
			createEnvelope({
				role: "assistant",
				appMessageId: "assistant-app",
				correlationId: "role-collision",
				seqId: "101",
				content: "assistant",
			}),
		])

		expect(getNode(store, toToolSuperMessageId("tool-app"))?.role).toBe("tool")
		expect(getNode(store, "super-role-collision")?.role).toBe("assistant")
		expect(getMessageRecords(store)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ app_message_id: "tool-app", role: "tool" }),
				expect.objectContaining({ app_message_id: "assistant-app", role: "assistant" }),
			]),
		)
		expect(getMessageRecords(store)).toHaveLength(2)
	})

	it("HTTP tool response 缺少 tool.id 时不使用 tool_call_id 建立 canonical 关联。", () => {
		const store = createStore()
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				role: "tool",
				appMessageId: "missing-tool-id-response",
				correlationId: "missing-tool-id-correlation",
				seqId: "200",
				toolId: "",
				toolCallId: "legacy-tool-call-must-not-be-used",
			}),
		])

		expect
			.soft(getNode(store, toToolSuperMessageId("missing-tool-id-response")))
			.toMatchObject({
				role: "tool",
				tool_call_id: "legacy-tool-call-must-not-be-used",
			})
		expect.soft(getCanonicalToolState(store, "")).toBeUndefined()
		expect
			.soft(getCanonicalToolState(store, "legacy-tool-call-must-not-be-used"))
			.toBeUndefined()
		expect.soft(warnSpy).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				code: "tool-response-missing-tool-id",
				topicId: TOPIC_A,
				toolCallId: "legacy-tool-call-must-not-be-used",
				resolution: "ignore-canonical-association",
			}),
		)
	})

	it("后到 HTTP assistant 快照不得覆盖 tool.id 对应的 canonical response。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				seqId: "100",
				toolCalls: [createToolCall({ status: "running" })],
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ role: "tool", appMessageId: "tool-response", seqId: "101" }),
		)
		advanceRendering()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "102",
				toolCalls: [createToolCall({ status: "running" })],
			}),
		])

		expect(getEmbeddedToolState(store)?.status).toBe("running")
		expect(getCanonicalToolState(store, "tool-1")?.status).toBe("finished")
		expect(getCanonicalToolState(store, "legacy-tool-call-1")).toBeUndefined()
		expect(getEffectiveToolState(store)?.status).toBe("finished")
	})

	it("terminal HTTP snapshot 的 tool_calls 必须完整替换本地流式 tool slot。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "local-tool", arguments: '{"path":"draft"}' })],
			}),
		)
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				toolCalls: [createToolCall({ id: "canonical-tool" })],
			}),
		])
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.tool_calls?.map((tool) => tool.id)).toEqual([
			"canonical-tool",
		])
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
	})

	it.each([
		["字段缺失时保留", { omitToolCalls: true }, ["local-tool"]],
		["显式 null 时清空", { toolCalls: null }, []],
		["显式空数组时清空", { toolCalls: [] }, []],
	] as const)("terminal tool_calls %s。", (_label, envelopeOptions, expectedToolIds) => {
		const store = createStore()
		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "local-tool", arguments: '{"local":true}' })],
			}),
		)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				...envelopeOptions,
			}),
		])
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.tool_calls?.map((tool) => tool.id) ?? []).toEqual(
			expectedToolIds,
		)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it.each([
		["字段缺失时保留本地内容", { omitContent: true }, "local draft"],
		["显式 null 时清空内容", { content: null }, ""],
		["显式空字符串时清空内容", { content: "" }, ""],
	] as const)("terminal content %s。", (_label, envelopeOptions, expectedContent) => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "local draft" }))

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				...envelopeOptions,
			}),
		])
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.content ?? "").toBe(expectedContent)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("nonterminal HTTP snapshot 的 tool_calls 必须与本地流式 slot 合并。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "local-tool", arguments: '{"local":true}' })],
			}),
		)
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				nodeStatus: "running",
				toolCalls: [
					createToolCall({
						id: "http-tool",
						arguments: '{"http":true}',
						status: "running",
					}),
				],
			}),
		])
		advanceRendering()

		const tools = getNode(store, SUPER_MESSAGE_ID)?.tool_calls ?? []
		const toolIds = tools.map((tool) => tool.id)
		expect.soft(toolIds).toEqual(expect.arrayContaining(["local-tool", "http-tool"]))
		expect.soft(toolIds).toHaveLength(2)
		expect
			.soft(tools.find((tool) => tool.id === "local-tool")?.function?.arguments)
			.toBe('{"local":true}')
		expect
			.soft(tools.find((tool) => tool.id === "http-tool")?.function?.arguments)
			.toBe('{"http":true}')
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it.each([
		["字段缺失", { omitToolCalls: true }],
		["显式 null", { toolCalls: null }],
		["显式空数组", { toolCalls: [] }],
	] as const)("nonterminal tool_calls %s 时保留有效本地 slot。", (_label, envelopeOptions) => {
		const store = createStore()
		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "local-tool", arguments: '{"local":true}' })],
			}),
		)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				nodeStatus: "running",
				...envelopeOptions,
			}),
		])
		advanceRendering()

		const tools = getNode(store, SUPER_MESSAGE_ID)?.tool_calls ?? []
		expect(tools.map((tool) => tool.id)).toEqual(["local-tool"])
		expect(tools[0]?.function?.arguments).toBe('{"local":true}')
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it.each([
		["字段缺失", { omitContent: true }],
		["显式 null", { content: null }],
		["显式空字符串", { content: "" }],
	] as const)(
		"nonterminal content %s 时不删除不可比较版本的本地内容。",
		(_label, envelopeOptions) => {
			const store = createStore()
			store.receiveChunk(createChunk({ content: "local draft" }))

			store.initializeMessages(TOPIC_A, [
				createEnvelope({
					seqId: "200",
					nodeStatus: "running",
					...envelopeOptions,
				}),
			])
			advanceRendering()

			expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("local draft")
			expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
		},
	)

	it("nonterminal snapshot 与本地相同 tool.id 时按字段合并且不覆盖不可比较 arguments。", () => {
		const store = createStore()
		store.receiveChunk(
			createChunk({
				toolCalls: [createToolCall({ id: "shared-tool", arguments: '{"local":true}' })],
			}),
		)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				seqId: "200",
				nodeStatus: "running",
				toolCalls: [
					createToolCall({
						id: "shared-tool",
						arguments: '{"http":true}',
						status: "running",
					}),
				],
			}),
		])
		advanceRendering()

		const tools = getNode(store, SUPER_MESSAGE_ID)?.tool_calls ?? []
		expect.soft(tools).toHaveLength(1)
		expect.soft(tools[0]?.id).toBe("shared-tool")
		expect.soft(tools[0]?.function?.arguments).toBe('{"local":true}')
		expect.soft(tools[0]?.tool?.status).toBe("running")
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("轻量 finished completion barrier 不依赖 authoritative snapshot，且不得删除窗口外消息。", () => {
		const store = createStore()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "historical-assistant",
				correlationId: "historical-correlation",
				seqId: "100",
				content: "historical content outside the polling window",
			}),
			createEnvelope({
				appMessageId: "terminal-assistant",
				correlationId: "terminal-correlation",
				seqId: "200",
				toolCalls: [
					createToolCall({
						id: "missing-terminal-tool",
						status: "running",
					}),
				],
			}),
		])
		const generation = store.beginTopicSync(TOPIC_A)

		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)
		advanceRendering()

		expect(getMessageRecords(store).map((message) => message.app_message_id)).toEqual([
			"historical-assistant",
			"terminal-assistant",
		])
		expect(
			getEffectiveToolState(store, "missing-terminal-tool", "terminal-correlation")?.status,
		).toBe("response_missing")
	})

	it("权威快照完成后公开流式生命周期结束。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [createEnvelope({ seqId: "200", content: "canonical" })])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)
		advanceRendering()

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("过期 generation 的 HTTP payload 仍进入版本裁决，只有生命周期副作用被拒绝。", () => {
		const store = createStore()
		const oldGeneration = store.beginTopicSync(TOPIC_A)
		const currentGeneration = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [
			createEnvelope({ appMessageId: "same-response", seqId: "200", content: "current" }),
		])
		// D9: old HTTP data is not skipped by generation; seq arbitration decides its fate.
		store.initializeMessages(TOPIC_A, [
			createEnvelope({ appMessageId: "same-response", seqId: "100", content: "stale" }),
		])
		expect(
			store.completeTopicSync(TOPIC_A, oldGeneration, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "999",
			}),
		).toBe(false)
		expect(
			store.completeTopicSync(TOPIC_A, currentGeneration, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "200",
			}),
		).toBe(true)

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("current")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "same-response", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
	})

	it("旧 generation 的 replace 响应不得清空当前 generation 的 snapshot membership。", () => {
		const store = createStore()
		const oldGeneration = store.beginTopicSync(TOPIC_A)
		const currentGeneration = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "current-generation-app",
					correlationId: "current-generation-correlation",
					seqId: "200",
					content: "current generation",
				}),
			],
			{ mode: "replace", syncGeneration: currentGeneration },
		)
		store.initializeMessages(TOPIC_A, [], {
			mode: "replace",
			syncGeneration: oldGeneration,
		})

		expect(
			store.completeTopicSync(TOPIC_A, currentGeneration, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)

		expect
			.soft(
				getNode(store, toAssistantSuperMessageId("current-generation-correlation"))
					?.content,
			)
			.toBe("current generation")
		expect.soft(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "current-generation-app",
				correlation_id: "current-generation-correlation",
				seq_id: "200",
			},
		])
		expect.soft(getUiMessages(store)).toHaveLength(1)
	})

	it("同步中已接纳 terminal snapshot 后即使 cancel，也必须拒绝晚到 chunk 重开。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "terminal-before-cancel",
					seqId: "200",
					content: "terminal canonical",
				}),
			],
			{ syncGeneration: generation },
		)
		store.cancelTopicSync(TOPIC_A, generation)
		store.receiveChunk(createChunk({ i: 0, content: "late chunk" }))
		advanceRendering()

		expect.soft(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("terminal canonical")
		expect.soft(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("首次 terminal HTTP snapshot 即使此前没有 StreamState，cancel 后也必须拒绝晚到 chunk。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(
			TOPIC_A,
			[
				createEnvelope({
					appMessageId: "terminal-without-stream",
					seqId: "200",
					content: "terminal canonical",
				}),
			],
			{ syncGeneration: generation },
		)
		store.cancelTopicSync(TOPIC_A, generation)
		store.receiveChunk(createChunk({ i: 0, content: "late chunk" }))
		advanceRendering()

		expect.soft(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("terminal canonical")
		expect.soft(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("syncState 可以离开 syncing，并支持下一代 complete/cancel。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_A)

		expect(store.isTopicSyncCurrent(TOPIC_A, generation)).toBe(true)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
			}),
		).toBe(true)
		expect(store.isTopicSyncCurrent(TOPIC_A, generation)).toBe(false)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
			}),
		).toBe(false)
		store.cancelTopicSync(TOPIC_A, generation)
		expect(store.isTopicSyncCurrent(TOPIC_A, generation)).toBe(false)

		const nextGeneration = store.beginTopicSync(TOPIC_A)
		expect(nextGeneration).toBeGreaterThan(generation)
		expect(store.isTopicSyncCurrent(TOPIC_A, nextGeneration)).toBe(true)
		store.cancelTopicSync(TOPIC_A, nextGeneration)
		store.cancelTopicSync(TOPIC_A, nextGeneration)
		expect(store.isTopicSyncCurrent(TOPIC_A, nextGeneration)).toBe(false)
		expect(
			store.completeTopicSync(TOPIC_A, nextGeneration, {
				succeeded: true,
				taskStatus: "running",
			}),
		).toBe(false)
	})

	it("HTTP 请求失败后的 recovery 退避必须有界且单调递增。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const eventTimes: number[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			eventTimes.push(Date.now())
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		const startedAt = Date.now()
		store.receiveChunk(createChunk({ content: "incomplete" }))
		const firstDelay = advanceUntilRecovery(events, 1, INITIAL_RECOVERY_OBSERVATION_MS)
		const secondDelay = advanceUntilRecovery(events, 2, RETRY_RECOVERY_OBSERVATION_MS)

		expect(firstDelay).toBeDefined()
		expect(secondDelay).toBeDefined()
		expect(eventTimes).toHaveLength(2)
		const [firstEventTime, secondEventTime] = eventTimes as [number, number]
		const firstInterval = firstEventTime - startedAt
		const secondInterval = secondEventTime - firstEventTime
		expect(firstInterval).toBeGreaterThan(0)
		expect(firstInterval).toBeLessThanOrEqual(INITIAL_RECOVERY_OBSERVATION_MS)
		expect(secondInterval).toBeGreaterThanOrEqual(firstInterval)
		expect(secondInterval).toBeLessThanOrEqual(RETRY_RECOVERY_OBSERVATION_MS)
		unsubscribe()
	})

	it("收到新的有效 chunk 后 recovery 退避应重置到初始有界区间。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		store.receiveChunk(createChunk({ i: 0, content: "first" }))
		const firstDelay = advanceUntilRecovery(events, 1, INITIAL_RECOVERY_OBSERVATION_MS)
		expect(firstDelay).toBeDefined()
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.recoveryAttempts).toBeGreaterThan(0)

		store.receiveChunk(createChunk({ i: 1, content: "new data" }))
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.recoveryAttempts).toBe(0)
		const resetDelay = advanceUntilRecovery(events, 2, INITIAL_RECOVERY_OBSERVATION_MS)
		expect(resetDelay).toBeDefined()
		expect(resetDelay).toBeGreaterThan(0)
		expect(resetDelay).toBeLessThanOrEqual(INITIAL_RECOVERY_OBSERVATION_MS)
		unsubscribe()
	})

	it.each([
		["reasoning", (i: number) => createChunk({ i, reasoningContent: "new reasoning" })],
		[
			"tool",
			(i: number) =>
				createChunk({
					i,
					toolCalls: [createToolCall({ id: "effective-tool", arguments: "{}" })],
				}),
		],
	] as const)("收到新的有效 %s chunk 后 recoveryAttempts 归零。", (_label, createNextChunk) => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		store.receiveChunk(createChunk({ i: 0, content: "first" }))
		expect(advanceUntilRecovery(events, 1, INITIAL_RECOVERY_OBSERVATION_MS)).toBeDefined()
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.recoveryAttempts).toBeGreaterThan(0)

		store.receiveChunk(createNextChunk(1))

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.recoveryAttempts).toBe(0)
		unsubscribe()
	})

	it.each([
		["role-only", (i: number) => createChunk({ i })],
		["metadata-only", (i: number) => createMetadataOnlyChunk({ i })],
		["usage-only", (i: number) => createUsageOnlyChunk(i)],
	] as const)("%s chunk 不重置 recoveryAttempts。", (_label, createNextChunk) => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		store.receiveChunk(createChunk({ i: 0, content: "first" }))
		expect(advanceUntilRecovery(events, 1, INITIAL_RECOVERY_OBSERVATION_MS)).toBeDefined()
		const attemptsBefore = store.getStreamState(TOPIC_A, CORRELATION_ID)?.recoveryAttempts
		expect(attemptsBefore).toBeGreaterThan(0)

		store.receiveChunk(createNextChunk(1))

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.recoveryAttempts).toBe(attemptsBefore)
		unsubscribe()
	})

	it("usage-only 与 metadata-only 首包在没有 StreamState 时仍按 3 次或 30 秒预算恢复。", () => {
		const scenarios = [
			["usage-only", () => createUsageOnlyChunk(0)],
			["metadata-only", () => createMetadataOnlyChunk({ i: 0 })],
		] as const

		scenarios.forEach(([label, createFirstChunk]) => {
			vi.clearAllTimers()
			vi.setSystemTime(0)
			const store = createStore()
			const events: StreamRecoveryRequestPayload[] = []
			const failures = collectRecoveryFailures(store)
			const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
				events.push(payload)
				const generation = store.beginTopicSync(payload.topicId)
				store.completeTopicSync(payload.topicId, generation, { succeeded: false })
			})

			store.receiveChunk(createFirstChunk())
			vi.advanceTimersByTime(RECOVERY_TOTAL_BUDGET_MS)

			expect
				.soft(events.length, `${label} must retry after the first failed sync`)
				.toBeGreaterThan(1)
			expect
				.soft(events.length, `${label} recovery attempts must remain bounded`)
				.toBeLessThanOrEqual(RECOVERY_MAX_ATTEMPTS)
			expect
				.soft(getStreamRecoveryState(store), `${label} must expose recovery_failed`)
				.toMatchObject({
					status: "failed",
					reason: "recovery_failed",
				})
			expect.soft(failures.events, `${label} must emit failure exactly once`).toHaveLength(1)

			unsubscribe()
			failures.unsubscribe()
		})
	})

	it("finish_reason-only chunk 结束当前文本流和 watchdog，而不是重置 recovery backoff。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "draft" }))
		store.receiveChunk(createMetadataOnlyChunk({ i: 1, finishReason: "stop" }))
		advanceRendering()

		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)
		vi.advanceTimersByTime(RECOVERY_POST_BUDGET_OBSERVATION_MS)
		expect.soft(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("final-only 首包在没有 StreamState 时仍统一计数、重试并暴露 recovery_failed。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const failures = collectRecoveryFailures(store)
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		store.receiveChunk(createMetadataOnlyChunk({ i: 0, finishReason: "stop" }))

		expect.soft(events).toHaveLength(1)
		expect.soft(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		vi.advanceTimersByTime(RECOVERY_TOTAL_BUDGET_MS)

		expect.soft(events.length).toBeGreaterThan(1)
		expect.soft(events.length).toBeLessThanOrEqual(RECOVERY_MAX_ATTEMPTS)
		expect.soft(getStreamRecoveryState(store)).toMatchObject({
			status: "failed",
			reason: "recovery_failed",
		})
		expect.soft(failures.events).toHaveLength(1)
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)

		unsubscribe()
		failures.unsubscribe()
	})

	it("连续 recovery 失败在最多 3 次或 30 秒后停止自动恢复并暴露 recovery_failed。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const failures = collectRecoveryFailures(store)
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		store.receiveChunk(createChunk({ content: "unrecoverable draft" }))
		vi.advanceTimersByTime(RECOVERY_TOTAL_BUDGET_MS)

		expect.soft(events.length).toBeGreaterThan(0)
		expect.soft(events.length).toBeLessThanOrEqual(RECOVERY_MAX_ATTEMPTS)
		const exhaustedEventCount = events.length
		vi.advanceTimersByTime(RECOVERY_POST_BUDGET_OBSERVATION_MS)
		expect.soft(events).toHaveLength(exhaustedEventCount)

		expect.soft(failures.isSupported).toBe(true)
		expect.soft(getStreamRecoveryState(store)).toMatchObject({
			status: "failed",
			reason: "recovery_failed",
		})
		expect.soft(failures.events).toEqual([
			expect.objectContaining({
				topicId: TOPIC_A,
				correlationId: CORRELATION_ID,
				status: "failed",
				reason: "recovery_failed",
				attempts: expect.any(Number),
				elapsedMs: expect.any(Number),
			}),
		])
		const failure = failures.events[0]
		expect.soft(failure).toBeDefined()
		if (failure) {
			expect.soft(failure.attempts).toBeLessThanOrEqual(RECOVERY_MAX_ATTEMPTS)
			expect.soft(failure.elapsedMs).toBeLessThanOrEqual(RECOVERY_TOTAL_BUDGET_MS)
		}

		// Recovery exhaustion is not a task-terminal signal. Keep the visible draft
		// and thinking state until task finished/final/cancel arrives.
		expect.soft(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("unrecoverable draft")
		expect.soft(getMessageRecords(store)).toMatchObject([{ correlation_id: CORRELATION_ID }])
		expect.soft(getUiMessages(store)).toMatchObject([{ correlation_id: CORRELATION_ID }])
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(true)
		unsubscribe()
		failures.unsubscribe()
	})

	it("同 topic 的不同 correlation 必须各自持有 watchdog 和 recovery failure。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const failures = collectRecoveryFailures(store)
		const correlationA = "parallel-recovery-a"
		const correlationB = "parallel-recovery-b"

		store.receiveChunk(
			createChunk({
				correlationId: correlationA,
				choices: [],
				usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
			}),
		)
		store.receiveChunk(
			createChunk({
				correlationId: correlationB,
				choices: [],
				usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
			}),
		)
		vi.advanceTimersByTime(RECOVERY_TOTAL_BUDGET_MS)

		expect.soft(recovery.events).toHaveLength(2)
		expect.soft(recovery.events).toEqual(
			expect.arrayContaining([
				{ topicId: TOPIC_A, correlationId: correlationA },
				{ topicId: TOPIC_A, correlationId: correlationB },
			]),
		)
		expect.soft(failures.events).toHaveLength(2)
		expect.soft(getStreamRecoveryState(store, TOPIC_A, correlationA)).toMatchObject({
			status: "failed",
			reason: "recovery_failed",
		})
		expect.soft(getStreamRecoveryState(store, TOPIC_A, correlationB)).toMatchObject({
			status: "failed",
			reason: "recovery_failed",
		})
		recovery.unsubscribe()
		failures.unsubscribe()
	})

	it("最终任务已 finished 且 HTTP 同步失败时停止 stream/loading，保留 draft 并允许独立 retry。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: false,
				taskStatus: "finished",
			}),
		).toBe(true)
		advanceRendering()

		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect.soft(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("draft")
		expect.soft(getUiMessages(store)).toMatchObject([{ correlation_id: CORRELATION_ID }])

		// Retry is a separate authoritative sync lifecycle; it must not resurrect the finished stream.
		const retryGeneration = store.beginTopicSync(TOPIC_A)
		store.initializeMessages(TOPIC_A, [createEnvelope({ seqId: "200", content: "recovered" })])
		expect(
			store.completeTopicSync(TOPIC_A, retryGeneration, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)
		expect.soft(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("recovered")
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)

		store.receiveChunk(
			createChunk({
				correlationId: "next-task-correlation",
				i: 0,
				content: "next task draft",
			}),
		)
		advanceRendering()
		expect
			.soft(getNode(store, toAssistantSuperMessageId("next-task-correlation"))?.content)
			.toBe("next task draft")
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("canonical message 完成后结束自身 stream，即使服务端 task 仍 running。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		store.receiveChunk(createChunk({ content: "draft" }))
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [createEnvelope({ seqId: "200", content: "complete" })])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "200",
			}),
		).toBe(true)
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("complete")
		expect(getNode(store, SUPER_MESSAGE_ID)?.status).toBe("finished")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "assistant-sync", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(getUiMessages(store)).toMatchObject([{ app_message_id: "assistant-sync" }])
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		vi.advanceTimersByTime(RETRY_RECOVERY_OBSERVATION_MS * 2)
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("服务端任务状态 finished，但本地仍有 buffer。", () => {
		const store = createStore()
		const arrivals = collectTopicArrivals(store)

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "buffered-1",
				correlationId: "buffered-correlation-1",
				seqId: "100",
				content: "first",
			}),
		)
		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({
				appMessageId: "buffered-2",
				correlationId: "buffered-correlation-2",
				seqId: "101",
				content: "second",
			}),
		)
		const generation = store.beginTopicSync(TOPIC_A)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "101",
			}),
		).toBe(true)
		advanceRendering()

		expect(getNode(store, toAssistantSuperMessageId("buffered-correlation-1"))?.content).toBe(
			"first",
		)
		expect(getNode(store, toAssistantSuperMessageId("buffered-correlation-2"))?.content).toBe(
			"second",
		)
		expect(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "buffered-1",
				correlation_id: "buffered-correlation-1",
				seq_id: "100",
			},
			{
				app_message_id: "buffered-2",
				correlation_id: "buffered-correlation-2",
				seq_id: "101",
			},
		])
		expect(getUiMessages(store).map((message) => message.app_message_id)).toEqual([
			"buffered-1",
			"buffered-2",
		])
		expect(
			arrivals.events
				.filter((event) => ["100", "101"].includes(event.payload.message.seqId || ""))
				.map((event) => event.payload.message.seqId),
		).toEqual(["100", "101"])
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		arrivals.unsubscribe()
	})

	it("已完成消息仍可接受更高 seq 的 authoritative revision。", () => {
		const store = createStore()

		store.enqueueMessage(
			TOPIC_A,
			createEnvelope({ appMessageId: "same-app", seqId: "100", content: "old final" }),
		)
		advanceRendering()
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "same-app",
				seqId: "200",
				content: "updated snapshot",
			}),
		])
		advanceRendering()

		expect(getNode(store, SUPER_MESSAGE_ID)?.content).toBe("updated snapshot")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "same-app", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(getUiMessages(store)).toHaveLength(1)
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
	})
})
