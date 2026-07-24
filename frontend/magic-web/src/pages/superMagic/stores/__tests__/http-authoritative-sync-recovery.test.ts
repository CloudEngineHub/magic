import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { messagesConverter } from "@/pages/superMagic/components/MessageList/helpers"
import { SuperMagicStore } from "@/pages/superMagic/stores"
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
const RENDER_SETTLE_MS = 2_000
// These broad fake-timer windows keep black-box observation finite; they are not product SLAs.
const INITIAL_RECOVERY_OBSERVATION_MS = 8_000
const RETRY_RECOVERY_OBSERVATION_MS = 20_000
// The exact retry count is intentionally not part of HTTP-D11. These windows
// only bound this black-box observation so an infinite spinner cannot hang the test.
const RETRY_TERMINAL_MAX_WINDOWS = 32
const RETRY_TERMINAL_QUIESCENCE_WINDOWS = 2
const RETRY_TERMINAL_WINDOW_MS = RETRY_RECOVERY_OBSERVATION_MS + 1_000

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

interface ChunkOptions {
	topicId?: string
	correlationId?: string
	i?: number
	content?: string
	finishReason?: ChunkChoice["finish_reason"]
	toolCalls?: ChunkToolCall[]
}

interface EnvelopeOptions {
	topicId?: string
	nodeTopicId?: string
	appMessageId?: string
	correlationId?: string
	seqId?: string
	role?: "assistant" | "tool"
	content?: string | null
	toolCalls?: ProjectedToolCall[] | null
	toolId?: string
	toolCallId?: string
	toolStatus?: string
	nodeStatus?: string
}

function createChunk({
	topicId = TOPIC_A,
	correlationId = CORRELATION_ID,
	i = 0,
	content = "",
	finishReason = null,
	toolCalls = [],
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
			i,
			usage: null,
			correlation_id: correlationId,
			choices: [
				{
					finish_reason: finishReason,
					delta: {
						content,
						role: "assistant",
						tool_calls: toolCalls,
						reasoning_content: "",
						index: 0,
					},
				},
			],
		},
	}
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

function createEnvelope({
	topicId = TOPIC_A,
	nodeTopicId = topicId,
	appMessageId = "assistant-sync",
	correlationId = CORRELATION_ID,
	seqId = "100",
	role = "assistant",
	content = role === "assistant" ? "canonical" : null,
	toolCalls = role === "assistant" ? [] : null,
	toolId = "tool-1",
	toolCallId = "legacy-tool-call-1",
	toolStatus = "finished",
	nodeStatus = role === "assistant" ? "finished" : "running",
}: EnvelopeOptions = {}): RawSuperMagicMessageEnvelope {
	const node = {
		role,
		topic_id: nodeTopicId,
		message_id: `node-${appMessageId}`,
		correlation_id: correlationId,
		content,
		reasoning_content: null,
		tool_calls: toolCalls,
		status: nodeStatus,
		send_timestamp: Number(seqId) || 1,
	} as SuperMagicNode
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
				sender_id: "assistant-1",
				send_time: Number(seqId) || 1,
				status: ConversationMessageStatus.Read,
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

function getNode(store: SuperMagicStore, id: string): ProjectedNode | undefined {
	const node = store.getMessageNode(id)
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

function getEmbeddedToolState(
	store: SuperMagicStore,
	toolId = "tool-1",
	correlationId = CORRELATION_ID,
): ProjectedToolCall["tool"] | undefined {
	return getNode(store, correlationId)?.tool_calls?.find((tool) => tool.id === toolId)?.tool
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

describe("SuperMagicStore / HTTP 权威同步与恢复", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(0)
	})

	afterEach(() => {
		vi.clearAllTimers()
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

		expect(getNode(store, CORRELATION_ID)?.content).toBe("new")
		expect(getNode(store, "same-response")?.content).toBe("new")
		expect(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "same-response",
				correlation_id: CORRELATION_ID,
				seq_id: "200",
			},
		])
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
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
		expect(getNode(store, "dual-domain-response")?.topic_id).toBe(AGENT_TOPIC_A)
		expect(getNode(store, "dual-domain-correlation")?.topic_id).toBe(AGENT_TOPIC_A)
		expect(
			store.completeTopicSync(TOPIC_B, generationB, {
				succeeded: true,
			}),
		).toBe(true)
		expect(store.completeTopicSync(TOPIC_A, generationB, { succeeded: true })).toBe(false)
	})

	it("HTTP 响应没有包含目标 correlation。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ content: "target draft" }))
		const generation = store.beginTopicSync(TOPIC_A)
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "unrelated-app",
				correlationId: "unrelated-correlation",
				seqId: "200",
				content: "unrelated",
			}),
		])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "running",
				latestSeqId: "200",
			}),
		).toBe(true)

		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)?.content).toBe("target draft")
		expect(getNode(store, "unrelated-correlation")?.content).toBe("unrelated")
		expect(
			advanceUntilRecovery(recovery.events, 1, INITIAL_RECOVERY_OBSERVATION_MS),
		).toBeDefined()
		expect(recovery.events).toEqual([{ topicId: TOPIC_A, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
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

		expect.soft(getNode(store, "snapshot-only-old-correlation")).toBeUndefined()
		expect.soft(getNode(store, "same-correlation")?.content).toBe("local newer")
		expect.soft(getNode(store, "newest-correlation")?.content).toBe("newest")
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

		expect(getNode(store, CORRELATION_ID)?.content).toBe("local new")
		expect(getNode(store, "same-app")?.content).toBe("local new")
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

	it("HTTP 响应比本地 StreamState 更新。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "local draft" }))
		store.initializeMessages(TOPIC_A, [
			createEnvelope({ seqId: "200", content: "HTTP canonical" }),
		])
		advanceRendering()

		expect(getNode(store, CORRELATION_ID)?.content).toBe("HTTP canonical")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "assistant-sync", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(getUiMessages(store)).toMatchObject([{ app_message_id: "assistant-sync" }])
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("HTTP 响应到达时 final chunk 同时到达。", () => {
		const store = createStore()
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

		expect(getNode(store, CORRELATION_ID)?.content).toBe("HTTP canonical")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
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
		expect(getNode(store, "tool-response")?.tool_call_id).toBe("legacy-tool-call-1")
		expect(getCanonicalToolState(store, "tool-1")?.status).toBe("finished")
		expect(getCanonicalToolState(store, "legacy-tool-call-1")).toBeUndefined()
		expect(getEffectiveToolState(store)?.status).toBe("finished")
	})

	it("同 appMessageId、不同 correlationId 的 HTTP 记录必须整体拒绝。", () => {
		const store = createStore()

		// Use an HTTP canonical baseline so stream-path app-id normalization cannot
		// blur the D3 identity-conflict input.
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "shared-app",
				correlationId: "original-correlation",
				seqId: "100",
				content: "original",
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createEnvelope({
				appMessageId: "shared-app",
				correlationId: "different-correlation",
				seqId: "200",
				content: "must not overwrite",
			}),
		])

		expect.soft(getNode(store, "original-correlation")?.content).toBe("original")
		expect.soft(getNode(store, "different-correlation")).toBeUndefined()
		expect.soft(getMessageRecords(store)).toMatchObject([
			{
				app_message_id: "shared-app",
				correlation_id: "original-correlation",
				seq_id: "100",
			},
		])
		expect.soft(getUiMessages(store)).toMatchObject([
			{
				app_message_id: "shared-app",
				correlation_id: "original-correlation",
				seq_id: "100",
			},
		])
		expect.soft(getUiMessages(store)).toHaveLength(1)
		expect.soft(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
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

		expect(getNode(store, "tool-app")?.role).toBe("tool")
		expect(getNode(store, "assistant-app")?.role).toBe("assistant")
		expect(getMessageRecords(store)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ app_message_id: "tool-app", role: "tool" }),
				expect.objectContaining({ app_message_id: "assistant-app", role: "assistant" }),
			]),
		)
		expect(getMessageRecords(store)).toHaveLength(2)
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

		expect(getNode(store, CORRELATION_ID)?.tool_calls?.map((tool) => tool.id)).toEqual([
			"canonical-tool",
		])
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
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

		const tools = getNode(store, CORRELATION_ID)?.tool_calls ?? []
		const toolIds = tools.map((tool) => tool.id)
		expect.soft(toolIds).toEqual(expect.arrayContaining(["local-tool", "http-tool"]))
		expect.soft(toolIds).toHaveLength(2)
		expect
			.soft(tools.find((tool) => tool.id === "local-tool")?.function?.arguments)
			.toBe('{"local":true}')
		expect
			.soft(tools.find((tool) => tool.id === "http-tool")?.function?.arguments)
			.toBe('{"http":true}')
		expect.soft(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeDefined()
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

		expect(getNode(store, CORRELATION_ID)?.content).toBe("current")
		expect(getNode(store, "same-response")?.content).toBe("current")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "same-response", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
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

		const nextGeneration = store.beginTopicSync(TOPIC_A)
		expect(nextGeneration).toBeGreaterThan(generation)
		expect(store.isTopicSyncCurrent(TOPIC_A, nextGeneration)).toBe(true)
		store.cancelTopicSync(TOPIC_A, nextGeneration)
		expect(store.isTopicSyncCurrent(TOPIC_A, nextGeneration)).toBe(false)
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

	it("连续 recovery 失败必须在有界次数后进入可观察终态。", () => {
		const store = createStore()
		const events: StreamRecoveryRequestPayload[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => {
			events.push(payload)
			const generation = store.beginTopicSync(payload.topicId)
			store.completeTopicSync(payload.topicId, generation, { succeeded: false })
		})

		store.receiveChunk(createChunk({ content: "unrecoverable draft" }))
		let quietWindows = 0
		for (
			let window = 0;
			window < RETRY_TERMINAL_MAX_WINDOWS &&
			store.isTopicStreaming(TOPIC_A) &&
			quietWindows < RETRY_TERMINAL_QUIESCENCE_WINDOWS;
			window += 1
		) {
			const eventCountBeforeWindow = events.length
			vi.advanceTimersByTime(RETRY_TERMINAL_WINDOW_MS)
			quietWindows = events.length === eventCountBeforeWindow ? quietWindows + 1 : 0
		}

		// D11 leaves the exact retry count implementation-defined. The public stream
		// must still reach a terminal state within this bounded observation window.
		expect.soft(events.length).toBeGreaterThan(0)
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)

		const terminalEventCount = events.length
		vi.advanceTimersByTime(RETRY_TERMINAL_WINDOW_MS * RETRY_TERMINAL_QUIESCENCE_WINDOWS)
		expect.soft(events).toHaveLength(terminalEventCount)
		unsubscribe()
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
		expect.soft(getNode(store, CORRELATION_ID)?.content).toBe("draft")
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
		expect.soft(getNode(store, CORRELATION_ID)?.content).toBe("recovered")
		expect.soft(store.isTopicStreaming(TOPIC_A)).toBe(false)
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

		expect(getNode(store, CORRELATION_ID)?.content).toBe("complete")
		expect(getNode(store, CORRELATION_ID)?.status).toBe("finished")
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

		expect(getNode(store, "buffered-correlation-1")?.content).toBe("first")
		expect(getNode(store, "buffered-correlation-2")?.content).toBe("second")
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
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
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

		expect(getNode(store, CORRELATION_ID)?.content).toBe("updated snapshot")
		expect(getMessageRecords(store)).toMatchObject([
			{ app_message_id: "same-app", correlation_id: CORRELATION_ID, seq_id: "200" },
		])
		expect(getUiMessages(store)).toHaveLength(1)
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("200")
		expect(store.getStreamState(TOPIC_A, CORRELATION_ID)).toBeUndefined()
	})
})
