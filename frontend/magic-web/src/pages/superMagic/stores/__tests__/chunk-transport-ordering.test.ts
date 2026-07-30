/**
 * @author biubiukam
 * agent 对话流式单元测试 - Chunk 传输与顺序
 *
 *
 * */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	RawSuperMagicMessageEnvelope,
	StreamRecoveryRequestPayload,
} from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_ID = "topic-1"
const CORRELATION_ID = "correlation-1"
const SUPER_MESSAGE_ID = "super-message-1"
const RENDER_SETTLE_MS = 2_000
const RECOVERY_TIMEOUT_MS = 5_100

function toSuperMessageId(correlationId: string): string {
	return correlationId === CORRELATION_ID ? SUPER_MESSAGE_ID : `super-${correlationId}`
}

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]
type IndexedChunkChoice = ChunkChoice & { index?: number }
type ChunkDelta = ChunkChoice["delta"]
type ChunkToolCall = ChunkDelta["tool_calls"][number]
type ChunkUsage = NonNullable<SuperMagicChunkMessage["super_magic_chunk"]["usage"]>
type FinishReason = ChunkChoice["finish_reason"]

interface ChunkOptions {
	i?: number
	content?: string
	correlationId?: string
	finishReason?: FinishReason
	reasoningContent?: string
	toolCalls?: ChunkToolCall[]
	usage?: ChunkUsage | null
	choices?: IndexedChunkChoice[]
}

interface ProjectedToolCall {
	id?: string
	type?: string
	index?: number
	function?: {
		name?: string
		arguments?: string
	}
}

interface ProjectedNode {
	app_message_id?: string
	super_message_id?: string
	correlation_id?: string
	content?: string | null
	reasoning_content?: string | null
	tool_calls?: ProjectedToolCall[] | null
}

interface MutableProtocolChunk {
	[key: string]: unknown
	send_time?: number
	super_magic_chunk: {
		[key: string]: unknown
		i?: unknown
		id?: string
		choices?: Array<{
			index?: unknown
			finish_reason?: unknown
			delta?: unknown
		}>
	}
}

/**
 * @description 创建 delta
 * @param index choice 级候选索引
 * @param deltaIndex delta 内部兼容字段，用于证明选择规则不依赖数组位置或 delta.index
 * @param content 内容，默认空字符串
 * @param finishReason 完成原因，默认 null
 * @param reasoningContent 推理内容，默认空字符串
 * @param toolCalls 工具调用，默认空数组
 * @returns 创建的 delta
 */
function createChoice({
	index = 0,
	deltaIndex = index,
	content = "",
	finishReason = null,
	reasoningContent = "",
	toolCalls = [],
}: {
	index?: number
	deltaIndex?: number
	content?: string
	finishReason?: FinishReason
	reasoningContent?: string
	toolCalls?: ChunkToolCall[]
} = {}): IndexedChunkChoice {
	return {
		index,
		finish_reason: finishReason,
		delta: {
			content,
			role: "assistant",
			tool_calls: toolCalls,
			reasoning_content: reasoningContent,
			index: deltaIndex,
		},
	}
}

function createChoiceWithoutIndex(options: Parameters<typeof createChoice>[0] = {}): ChunkChoice {
	const choice = createChoice(options)
	delete choice.index
	return choice
}

/**
 * @description 创建 chunk
 * @param i 索引
 * @param content 内容
 * @param correlationId 关联 ID
 * @param finishReason 完成原因
 * @param reasoningContent 推理内容
 * @param toolCalls 工具调用
 * @param usage 使用
 * @param choices 选择
 * @returns 创建的 chunk
 */
function createChunk({
	i = 0,
	content = "",
	correlationId = CORRELATION_ID,
	finishReason = null,
	reasoningContent = "",
	toolCalls = [],
	usage = null,
	choices,
}: ChunkOptions = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-chunk-${i}`,
		app_message_id: `app-chunk-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: "completion-message-1",
		super_magic_chunk: {
			super_message_id: toSuperMessageId(correlationId),
			task_id: `task-${correlationId}`,
			i,
			usage,
			correlation_id: correlationId,
			choices: choices ?? [
				createChoice({
					content,
					finishReason,
					reasoningContent,
					toolCalls,
				}),
			],
		},
	}
}

/**
 * @description 克隆 fixture
 * @param value 值
 * @returns 克隆的值
 */
function cloneFixture<T>(value: T): T {
	// Protocol fixtures are JSON-shaped; this keeps the test portable to the project's browser targets.
	return JSON.parse(JSON.stringify(value)) as T
}

/**
 * @description 克隆 chunk
 * @param chunk chunk
 * @returns 克隆的 chunk
 */
function cloneChunk(chunk: SuperMagicChunkMessage): SuperMagicChunkMessage {
	return cloneFixture(chunk)
}

/** Invalid protocol inputs are isolated here so normal fixtures stay strictly typed. */
function mutateProtocolChunk(
	chunk: SuperMagicChunkMessage,
	mutate: (draft: MutableProtocolChunk) => void,
): SuperMagicChunkMessage {
	const draft = cloneFixture(chunk) as unknown as MutableProtocolChunk
	mutate(draft)
	return draft as unknown as SuperMagicChunkMessage
}

/**
 * @description 创建没有 delta 的 chunk
 * @param i 索引
 * @param finishReason 完成原因
 * @param correlationId 关联 ID
 * @returns 没有 delta 的 chunk
 */
function createChunkWithoutDelta({
	i = 0,
	finishReason = null,
	correlationId = CORRELATION_ID,
}: {
	i?: number
	finishReason?: FinishReason
	correlationId?: string
} = {}): SuperMagicChunkMessage {
	return mutateProtocolChunk(createChunk({ i, correlationId, finishReason }), (draft) => {
		draft.super_magic_chunk.choices = [{ index: 0, finish_reason: finishReason }]
	})
}

type ChunkWithCompletionId = SuperMagicChunkMessage & {
	super_magic_chunk: SuperMagicChunkMessage["super_magic_chunk"] & {
		id: string
	}
}

/**
 * @description 创建完成 chunk
 * @param completionId 完成 ID
 * @param options 选项
 * @returns 完成 chunk
 */
function createCompletionChunk(completionId: string, options: ChunkOptions): ChunkWithCompletionId {
	const chunk = createChunk(options)
	return {
		...chunk,
		super_magic_chunk: {
			...chunk.super_magic_chunk,
			id: completionId,
		},
	}
}

/**
 * @description 创建工具调用
 * @param id 工具 ID
 * @param name 工具名称
 * @param argumentsValue arguments 值
 * @param index 索引
 * @returns 工具调用
 */
function createToolCall({
	id = "tool-1",
	name = "read_file",
	arguments: argumentsValue = "",
	index = 0,
}: {
	id?: string
	name?: string
	arguments?: string
	index?: number
} = {}): ChunkToolCall {
	return {
		id,
		type: "function",
		index,
		function: {
			name,
			arguments: argumentsValue,
		},
	}
}

/**
 * @description 创建仅包含 arguments 的工具调用
 * @param argumentsValue arguments 值
 * @returns 仅包含 arguments 的工具调用
 */
function createArgumentsOnlyToolCall(argumentsValue: string): ChunkToolCall {
	const toolCall = cloneFixture(createToolCall({ arguments: argumentsValue })) as unknown as {
		id?: string
		type: string
		index: number
		function: {
			name?: string
			arguments: string
		}
	}
	delete toolCall.id
	delete toolCall.function.name
	return toolCall as unknown as ChunkToolCall
}

/**
 * @description 创建最终的 envelope
 * @param content 内容
 * @param correlationId 关联 ID
 * @param appMessageId 应用消息 ID
 * @param seqId 序列 ID
 * @param reasoningContent 推理内容
 * @param toolCalls 工具调用
 * @returns 最终的 envelope
 */
function createFinalEnvelope({
	content,
	correlationId = CORRELATION_ID,
	appMessageId = "final-app-1",
	seqId = "100",
	reasoningContent = "",
	toolCalls = [],
}: {
	content: string
	correlationId?: string
	appMessageId?: string
	seqId?: string
	reasoningContent?: string
	toolCalls?: ProjectedToolCall[]
}): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-1",
			seq_id: seqId,
			message_id: `server-${seqId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: "assistant-1",
				send_time: 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "assistant",
					topic_id: TOPIC_ID,
					message_id: `node-${appMessageId}`,
					super_message_id: toSuperMessageId(correlationId),
					correlation_id: correlationId,
					content,
					reasoning_content: reasoningContent,
					tool_calls: toolCalls,
					status: "finished",
					send_timestamp: 1,
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	// Runtime uses the V2 super_magic_message variant, which is not yet included in ConversationQueryMessage.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

/**
 * @description 创建 SuperMagicStore 实例
 * @returns SuperMagicStore 实例
 */
function createStore(): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(TOPIC_ID)
	return store
}

/**
 * @description 获取投影节点
 * @param store SuperMagicStore 实例
 * @param superMessageId SuperMessage ID
 * @returns 投影节点
 */
function getProjectedNode(
	store: SuperMagicStore,
	superMessageId = SUPER_MESSAGE_ID,
): ProjectedNode | undefined {
	const node = store.getMessageNode(superMessageId)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

/**
 * @description 收集流式恢复请求
 * @param store SuperMagicStore 实例
 * @returns 流式恢复请求事件
 */
function collectRecoveryRequests(store: SuperMagicStore): {
	events: StreamRecoveryRequestPayload[]
	unsubscribe: () => void
} {
	const events: StreamRecoveryRequestPayload[] = []
	const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => events.push(payload))
	return { events, unsubscribe }
}

/**
 * @description 推进渲染时间，模拟流式渲染过程
 * @param milliseconds 推进的时间，默认 2000ms
 */
function advanceRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

/**
 * @description 期望流式渲染结果
 * @param store SuperMagicStore 实例
 * @param content 期望的渲染内容
 * @param correlationId 关联 ID
 */
function expectSettledContent(
	store: SuperMagicStore,
	content: string,
	correlationId = CORRELATION_ID,
): void {
	advanceRendering()
	expect(getProjectedNode(store, toSuperMessageId(correlationId))).toMatchObject({ content })
	expect(store.getStreamState(TOPIC_ID, correlationId)).toBeUndefined()
	expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
}

/**
 * @description 期望无效的索引被忽略
 * @param invalidChunk 无效的 chunk
 */
function expectInvalidIndexIgnored(invalidChunk: SuperMagicChunkMessage): void {
	const store = createStore()
	const recovery = collectRecoveryRequests(store)
	const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)

	try {
		store.receiveChunk(invalidChunk)

		expect(consoleError).toHaveBeenCalledTimes(1)
		expect(consoleError).toHaveBeenCalledWith("chunk error")
		expect(getProjectedNode(store)).toBeUndefined()
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		expect(recovery.events).toHaveLength(0)

		store.receiveChunk(createChunk({ i: 0, content: "ok", finishReason: "stop" }))
		expectSettledContent(store, "ok")
	} finally {
		recovery.unsubscribe()
		consoleError.mockRestore()
	}
}

describe("SuperMagicStore / Chunk 传输与顺序", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		// Never execute unknown self-scheduling timers during cleanup.
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("同一个 `i` 的 chunk 完全重复到达。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const firstChunk = createChunk({ i: 0, content: "A" })

		store.receiveChunk(firstChunk)
		store.receiveChunk(cloneChunk(firstChunk))
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))

		expectSettledContent(store, "AB")
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("同一个 `i` 重复到达，但 payload 内容不同。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 0, content: "X" }))
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))

		expectSettledContent(store, "AB")
	})

	// 流式 arguments 截断，final assistant message 使用完整参数权威结算。
	it("chunk 整体乱序到达，例如 `0 → 2 → 1 → 3`。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 2, content: "C" }))

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)?.content).toBe("A")

		store.receiveChunk(createChunk({ i: 1, content: "B" }))
		store.receiveChunk(createChunk({ i: 3, content: "D", finishReason: "stop" }))

		expectSettledContent(store, "ABCD")
	})

	it("chunk 大跨度提前到达，例如 `i=56` 先于 `i=18`。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 56, content: "Z" }))

		expect(getProjectedNode(store)?.content ?? "").not.toContain("Z")
		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
		expect(getProjectedNode(store)?.content ?? "").not.toContain("Z")
		recovery.unsubscribe()
	})

	it("连续丢失单个 chunk。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 2, content: "C", finishReason: "stop" }))
		advanceRendering(100)

		expect(getProjectedNode(store)?.content ?? "").not.toContain("C")
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeDefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(1)
		recovery.unsubscribe()
	})

	it("连续丢失多个 chunk。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 3, content: "D", finishReason: "stop" }))
		advanceRendering(100)

		expect(getProjectedNode(store)?.content ?? "").not.toContain("D")
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(1)
		recovery.unsubscribe()
	})

	it("首个 chunk 丢失。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 1, content: "B" }))
		store.receiveChunk(createChunk({ i: 2, content: "C", finishReason: "stop" }))
		advanceRendering(100)

		expect(getProjectedNode(store)?.content ?? "").toBe("")
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(1)
		recovery.unsubscribe()
	})

	it("工具头 chunk 丢失，但 arguments chunk 正常到达。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createArgumentsOnlyToolCall('{"path":"a.txt"}')],
			}),
		)
		store.receiveChunk(createChunk({ i: 1, finishReason: "tool_calls" }))
		advanceRendering(100)

		const projectedTools = getProjectedNode(store)?.tool_calls ?? []
		expect(projectedTools.some((tool) => tool.id === "0")).toBe(false)

		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "",
				toolCalls: [createToolCall({ arguments: '{"path":"a.txt"}' })],
			}),
		)
		advanceRendering()

		expect(getProjectedNode(store)?.tool_calls?.[0]).toMatchObject({
			id: "tool-1",
			function: { arguments: '{"path":"a.txt"}' },
		})
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("最后一个 arguments chunk 丢失。", () => {
		const store = createStore()
		const partialArguments = '{"path":"a'
		const completeArguments = '{"path":"a.txt"}'

		// Separate the tool header from argument deltas so this case only exercises
		// the missing final arguments fragment, not a missing/anonymous tool header.
		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: "" })],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				toolCalls: [createArgumentsOnlyToolCall(partialArguments)],
			}),
		)
		// i=2 would contain the final arguments fragment, but it is lost in transport.
		store.receiveChunk(createChunk({ i: 3, finishReason: "tool_calls" }))
		advanceRendering(100)

		const observedArguments =
			store.getStreamState(TOPIC_ID, CORRELATION_ID)?.tool_calls[0]?.function.arguments ??
			getProjectedNode(store)?.tool_calls?.[0]?.function?.arguments
		expect(observedArguments).toBe(partialArguments)
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "",
				toolCalls: [createToolCall({ arguments: completeArguments })],
			}),
		)
		advanceRendering()

		expect(getProjectedNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(
			completeArguments,
		)
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("`finish_reason` chunk 丢失。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 1, content: "B" }))
		advanceRendering(100)

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)?.content).toBe("AB")
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(1)
		recovery.unsubscribe()
	})

	it("`finish_reason` chunk 先于前序 chunk 到达。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))
		advanceRendering(100)

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeDefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		expectSettledContent(store, "AB")
	})

	it("`finish_reason` chunk 重复到达。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const finalChunk = createChunk({ i: 1, content: "B", finishReason: "stop" })

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(finalChunk)
		store.receiveChunk(cloneChunk(finalChunk))

		expectSettledContent(store, "AB")
		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("`usage` chunk 先于正文结束到达。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(
			createChunk({
				i: 0,
				choices: [],
				usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
			}),
		)
		store.receiveChunk(createChunk({ i: 1, content: "A" }))
		store.receiveChunk(createChunk({ i: 2, content: "B", finishReason: "stop" }))

		expectSettledContent(store, "AB")
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("只有 `usage`，没有 `finish_reason`。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(
			createChunk({
				i: 0,
				choices: [],
				usage: { completion_tokens: 1, prompt_tokens: 1, total_tokens: 2 },
			}),
		)
		advanceRendering(100)

		expect(getProjectedNode(store)).toBeUndefined()
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		expect(recovery.events).toHaveLength(0)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
	})

	it("只有 `finish_reason`，没有任何前置 StreamState。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunkWithoutDelta({ finishReason: "stop" }))

		expect(getProjectedNode(store)).toBeUndefined()
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
	})

	it("空 heartbeat chunk 到达。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ choices: [] }))

		expect(getProjectedNode(store)).toBeUndefined()
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("heartbeat chunk 重复到达。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const heartbeat = createChunk({ choices: [] })

		store.receiveChunk(heartbeat)
		store.receiveChunk(cloneChunk(heartbeat))

		expect(getProjectedNode(store)).toBeUndefined()
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it("final 后仍有普通 chunk 到达。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "draft" }))
		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "canonical" }))
		advanceRendering()

		store.receiveChunk(createChunk({ i: 1, content: " late" }))
		advanceRendering(100)

		expect(getProjectedNode(store)).toMatchObject({ content: "canonical" })
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("final 后仍有工具 arguments chunk 到达。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				i: 0,
				toolCalls: [createToolCall({ arguments: '{"path":"draft"}' })],
			}),
		)
		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "",
				toolCalls: [createToolCall({ arguments: '{"path":"final"}' })],
			}),
		)
		advanceRendering()

		store.receiveChunk(
			createChunk({
				i: 1,
				toolCalls: [createToolCall({ arguments: "-late" })],
			}),
		)
		advanceRendering(100)

		expect(getProjectedNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(
			'{"path":"final"}',
		)
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("WebSocket 重连后从某个旧 `i` 开始重放。", () => {
		const store = createStore()
		const chunk0 = createChunk({ i: 0, content: "A" })
		const chunk1 = createChunk({ i: 1, content: "B" })

		store.receiveChunk(chunk0)
		store.receiveChunk(chunk1)
		store.receiveChunk(cloneChunk(chunk1))
		store.receiveChunk(createChunk({ i: 2, content: "C", finishReason: "stop" }))

		expectSettledContent(store, "ABC")
	})

	it("WebSocket 重连后从 `i=0` 完整重放。", () => {
		const store = createStore()
		const chunk0 = createChunk({ i: 0, content: "A" })
		const chunk1 = createChunk({ i: 1, content: "B" })

		store.receiveChunk(chunk0)
		store.receiveChunk(chunk1)
		store.receiveChunk(cloneChunk(chunk0))
		store.receiveChunk(cloneChunk(chunk1))
		store.receiveChunk(createChunk({ i: 2, content: "C", finishReason: "stop" }))

		expectSettledContent(store, "ABC")
	})

	it("本地持久化回放与实时 WebSocket 同时投递同一批 chunk。", () => {
		const store = createStore()
		const chunks = [
			createChunk({ i: 0, content: "A" }),
			createChunk({ i: 1, content: "B" }),
			createChunk({ i: 2, content: "C", finishReason: "stop" }),
		]

		for (const chunk of chunks) {
			store.receiveChunk(chunk)
			store.receiveChunk(cloneChunk(chunk))
		}

		expectSettledContent(store, "ABC")
	})

	it("HTTP 快照同步期间仍收到旧 WebSocket chunk。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_ID)

		store.receiveChunk(createChunk({ i: 0, content: "stale" }))
		expect(store.isTopicSyncCurrent(TOPIC_ID, generation)).toBe(true)

		store.initializeMessages(TOPIC_ID, [
			createFinalEnvelope({ content: "authoritative", seqId: "200" }),
		])
		expect(
			store.completeTopicSync(TOPIC_ID, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "200",
			}),
		).toBe(true)

		expectSettledContent(store, "authoritative")
		expect(store.getLatestMessageSeqId(TOPIC_ID)).toBe("200")
	})

	it("HTTP 快照完成后收到同步前积压的 chunk。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_ID)

		store.initializeMessages(TOPIC_ID, [
			createFinalEnvelope({ content: "authoritative", seqId: "201" }),
		])
		expect(
			store.completeTopicSync(TOPIC_ID, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "201",
			}),
		).toBe(true)
		advanceRendering()

		store.receiveChunk(createChunk({ i: 0, content: "stale backlog" }))
		advanceRendering(100)

		expect(getProjectedNode(store)).toMatchObject({ content: "authoritative" })
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("同一个 correlation 下 chunk 的 completion `id` 中途发生变化。", () => {
		const store = createStore()

		store.receiveChunk(createCompletionChunk("completion-a", { i: 0, content: "old-" }))
		store.receiveChunk(createCompletionChunk("completion-a", { i: 1, content: "draft" }))
		store.receiveChunk(createCompletionChunk("completion-b", { i: 0, content: "new-" }))
		store.receiveChunk(createCompletionChunk("completion-b", { i: 1, content: "middle-" }))
		store.receiveChunk(
			createCompletionChunk("completion-b", {
				i: 2,
				content: "done",
				finishReason: "stop",
			}),
		)

		expectSettledContent(store, "new-middle-done")
	})

	it("模型重试后复用 correlationId，但 `i` 从零重新开始。", () => {
		const store = createStore()
		const oldToolCall = createToolCall({
			id: "old-tool",
			name: "read_file",
			arguments: '{"path":"old.txt"}',
		})

		store.receiveChunk(
			createCompletionChunk("completion-a", {
				i: 0,
				content: "old-",
				reasoningContent: "old-thought-",
				toolCalls: [oldToolCall],
			}),
		)
		store.receiveChunk(
			createCompletionChunk("completion-a", {
				i: 1,
				content: "draft",
				reasoningContent: "old-draft",
			}),
		)
		advanceRendering()
		expect(getProjectedNode(store)).toMatchObject({
			content: "old-draft",
			reasoning_content: "old-thought-old-draft",
			tool_calls: [oldToolCall],
		})

		store.receiveChunk(
			createCompletionChunk("completion-b", {
				i: 0,
				content: "new-",
				reasoningContent: "new-thought",
			}),
		)
		store.receiveChunk(
			createCompletionChunk("completion-b", {
				i: 1,
				content: "final",
				finishReason: "stop",
			}),
		)

		expectSettledContent(store, "new-final")
		expect(getProjectedNode(store)).toMatchObject({
			reasoning_content: "new-thought",
			tool_calls: [],
		})
	})

	it("只有 completion `id` 变化且旧流尚未出现 `i>0` 时，重复 `i=0` 仍 first-write-wins。", () => {
		const store = createStore()

		store.receiveChunk(createCompletionChunk("completion-a", { i: 0, content: "old" }))
		store.receiveChunk(createCompletionChunk("completion-b", { i: 0, content: "new" }))
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)?.content).toBe("old")
		store.receiveChunk(
			createCompletionChunk("completion-b", {
				i: 1,
				content: "!",
				finishReason: "stop",
			}),
		)

		expectSettledContent(store, "old!")
	})

	it("`i` 为负数。", () => {
		expectInvalidIndexIgnored(createChunk({ i: -1, content: "bad" }))
	})

	it("`i` 为小数。", () => {
		expectInvalidIndexIgnored(createChunk({ i: 0.5, content: "bad" }))
	})

	it("`i` 为字符串而不是数字。", () => {
		const invalidChunk = mutateProtocolChunk(createChunk({ i: 1, content: "bad" }), (draft) => {
			draft.super_magic_chunk.i = "1"
		})
		expectInvalidIndexIgnored(invalidChunk)
	})

	it("`i` 缺失。", () => {
		const invalidChunk = mutateProtocolChunk(createChunk({ content: "bad" }), (draft) => {
			delete draft.super_magic_chunk.i
		})
		expectInvalidIndexIgnored(invalidChunk)
	})

	it("`i` 极大，导致顺序缓冲长期等待大量缺口。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 1_000_000, content: "bad" }))
		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))

		expectSettledContent(store, "AB")
	})

	it("chunk 的 `send_time` 顺序和 `i` 顺序相反。", () => {
		const store = createStore()
		const firstChunk = mutateProtocolChunk(createChunk({ i: 0, content: "A" }), (draft) => {
			draft.send_time = 200
		})
		const secondChunk = mutateProtocolChunk(
			createChunk({ i: 1, content: "B", finishReason: "stop" }),
			(draft) => {
				draft.send_time = 100
			},
		)

		store.receiveChunk(firstChunk)
		store.receiveChunk(secondChunk)

		expectSettledContent(store, "AB")
	})

	it("chunk 到达速度远快于渲染速度。", () => {
		const store = createStore()
		const fragments = Array.from({ length: 32 }, (_, index) =>
			String.fromCharCode(65 + (index % 26)),
		)

		fragments.forEach((content, index) => {
			store.receiveChunk(
				createChunk({
					i: index,
					content,
					finishReason: index === fragments.length - 1 ? "stop" : null,
				}),
			)
		})

		expectSettledContent(store, fragments.join(""))
	})

	it("chunk 到达速度远慢于恢复 watchdog。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(1)

		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))
		expectSettledContent(store, "AB")
		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS * 2)
		expect(recovery.events).toHaveLength(1)
		recovery.unsubscribe()
	})

	it("浏览器后台节流导致多个 chunk 被集中批量处理。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		vi.advanceTimersByTime(30_000)
		const recoveryCountBeforeBatch = recovery.events.length

		store.receiveChunk(createChunk({ i: 1, content: "B" }))
		store.receiveChunk(createChunk({ i: 2, content: "C" }))
		store.receiveChunk(createChunk({ i: 3, content: "D", finishReason: "stop" }))

		expectSettledContent(store, "ABCD")
		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS * 2)
		expect(recovery.events).toHaveLength(recoveryCountBeforeBatch)
		recovery.unsubscribe()
	})

	it("同一 chunk 内同时包含 reasoning、content 和 tool call。", () => {
		const store = createStore()
		const toolCall = createToolCall({ arguments: '{"path":"a.txt"}' })

		store.receiveChunk(
			createChunk({
				i: 0,
				reasoningContent: "think",
				content: "answer",
				toolCalls: [toolCall],
			}),
		)

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toMatchObject({
			reasoning_content: "think",
			content: "answer",
			tool_calls: [toolCall],
		})

		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "answer",
				reasoningContent: "think",
				toolCalls: [toolCall],
			}),
		)
		advanceRendering()

		expect(getProjectedNode(store)).toMatchObject({
			reasoning_content: "think",
			content: "answer",
			tool_calls: [toolCall],
		})
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("`choices` 为空数组时按 heartbeat/usage chunk 推进，不创建主答案。", () => {
		const store = createStore()
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		try {
			store.receiveChunk(
				createChunk({
					choices: [],
					usage: { completion_tokens: 1, prompt_tokens: 2, total_tokens: 3 },
				}),
			)
			expect(getProjectedNode(store)).toBeUndefined()
			expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
			expect(warnSpy).not.toHaveBeenCalled()

			store.receiveChunk(createChunk({ i: 1, content: "A", finishReason: "stop" }))
			expectSettledContent(store, "A")
		} finally {
			warnSpy.mockRestore()
		}
	})

	it("多个 choice 整包忽略，不合并正文、推理、工具或 finish_reason，并按 correlation 只告警一次。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const streamEvents: string[] = []
		const unsubscribeStreamEvents = [
			store.subscribe("message.stream.started", (event) => streamEvents.push(event.type)),
			store.subscribe("message.stream.delta", (event) => streamEvents.push(event.type)),
			store.subscribe("message.stream.ended", (event) => streamEvents.push(event.type)),
		]
		const ignoredTool = createToolCall({ id: "ignored-tool" })
		const secondaryCorrelationId = "correlation-secondary-choice"

		try {
			store.receiveChunk(
				createChunk({
					i: 0,
					choices: [
						createChoice({
							index: 0,
							content: "ignored-A",
							reasoningContent: "ignored-reasoning",
							toolCalls: [ignoredTool],
							finishReason: "stop",
						}),
						createChoice({ index: 1, content: "ignored-B" }),
					],
				}),
			)
			store.receiveChunk(
				createChunk({
					i: 1,
					choices: [
						createChoice({ index: 0, content: "ignored-replay" }),
						createChoice({ index: 1, content: "ignored-alternative" }),
					],
				}),
			)
			store.receiveChunk(
				createChunk({
					correlationId: secondaryCorrelationId,
					choices: [
						createChoice({ index: 0, content: "ignored-secondary-primary" }),
						createChoice({ index: 1, content: "ignored-secondary-alternative" }),
					],
				}),
			)

			expect(getProjectedNode(store)).toBeUndefined()
			expect(
				getProjectedNode(store, toSuperMessageId(secondaryCorrelationId)),
			).toBeUndefined()
			expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
			expect(store.getStreamState(TOPIC_ID, secondaryCorrelationId)).toBeUndefined()
			expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
			expect(recovery.events).toHaveLength(0)
			expect(streamEvents).toEqual([])

			store.receiveChunk(createChunk({ i: 2, content: "accepted", finishReason: "stop" }))
			expectSettledContent(store, "accepted")
			expect(getProjectedNode(store)?.tool_calls ?? []).not.toContainEqual(
				expect.objectContaining({ id: "ignored-tool" }),
			)

			const warnings = warnSpy.mock.calls.filter(
				([, payload]) =>
					(payload as { code?: string } | undefined)?.code === "chunk-multiple-choices",
			)
			expect(warnings).toHaveLength(2)
			expect(
				warnings.map(
					([, payload]) => (payload as { correlationId?: string }).correlationId,
				),
			).toEqual([CORRELATION_ID, secondaryCorrelationId])
			expect(warnings[0]).toEqual([
				"[SuperMagicStore] multiple choices ignored",
				expect.objectContaining({
					code: "chunk-multiple-choices",
					topicId: TOPIC_ID,
					superMessageId: SUPER_MESSAGE_ID,
					correlationId: CORRELATION_ID,
					choiceCount: 2,
					choiceIndexes: [0, 1],
					resolution: "ignore-choice-payload",
				}),
			])
		} finally {
			unsubscribeStreamEvents.forEach((unsubscribe) => unsubscribe())
			recovery.unsubscribe()
			warnSpy.mockRestore()
		}
	})

	it.each([
		{ caseName: "重复 index=0", choiceIndexes: [0, 0] },
		{ caseName: "不存在 index=0", choiceIndexes: [1, 2] },
	])("多 choice 且 $caseName 时整包拒绝，并请求一次权威恢复。", ({ choiceIndexes }) => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		try {
			store.receiveChunk(
				createChunk({
					choices: choiceIndexes.map((index) =>
						createChoice({ index, content: `ignored-${index}` }),
					),
				}),
			)

			expect(getProjectedNode(store)).toBeUndefined()
			expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
			expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
			expect(
				warnSpy.mock.calls.filter(
					([, payload]) =>
						(payload as { code?: string } | undefined)?.code ===
						"chunk-multiple-choices",
				),
			).toHaveLength(1)
		} finally {
			recovery.unsubscribe()
			warnSpy.mockRestore()
		}
	})

	it("跨 chunk 固定 choice.index=0，非零候选不切换主答案、不结束文本流，并请求权威恢复。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		try {
			store.receiveChunk(
				createChunk({
					i: 0,
					choices: [createChoice({ index: 0, deltaIndex: 9, content: "A" })],
				}),
			)
			store.receiveChunk(
				createChunk({
					i: 1,
					choices: [
						createChoice({
							index: 1,
							deltaIndex: 0,
							content: "ignored-1",
							finishReason: "stop",
						}),
					],
				}),
			)
			store.receiveChunk(
				createChunk({
					i: 2,
					choices: [createChoice({ index: 1, deltaIndex: 0, content: "ignored-2" })],
				}),
			)

			expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toMatchObject({
				content: "A",
				isFinalMessageReceived: false,
			})
			expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])

			store.receiveChunk(
				createChunk({
					i: 3,
					choices: [createChoice({ index: 0, content: "C", finishReason: "stop" })],
				}),
			)
			expectSettledContent(store, "AC")

			const warnings = warnSpy.mock.calls.filter(
				([, payload]) =>
					(payload as { code?: string } | undefined)?.code ===
					"chunk-choice-index-invalid",
			)
			expect(warnings).toEqual([
				[
					"[SuperMagicStore] invalid choice index",
					expect.objectContaining({
						code: "chunk-choice-index-invalid",
						topicId: TOPIC_ID,
						superMessageId: SUPER_MESSAGE_ID,
						correlationId: CORRELATION_ID,
						choiceIndex: 1,
						expectedChoiceIndex: 0,
						resolution: "ignore-choice-payload-and-recover",
					}),
				],
			])
		} finally {
			recovery.unsubscribe()
			warnSpy.mockRestore()
		}
	})

	it("字符串 choice.index='0' 不等同数值 0，候选内容和 finish_reason 均被拒绝。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const invalidChunk = mutateProtocolChunk(createChunk(), (draft) => {
			draft.super_magic_chunk.choices = [
				{
					index: "0",
					finish_reason: "stop",
					delta: {
						content: "ignored-string-index",
						role: "assistant",
						tool_calls: [],
						reasoning_content: "ignored-reasoning",
						index: 0,
					},
				},
			]
		})

		try {
			store.receiveChunk(invalidChunk)

			expect(getProjectedNode(store)).toBeUndefined()
			expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
			expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
			expect(
				warnSpy.mock.calls.filter(
					([, payload]) =>
						(payload as { code?: string } | undefined)?.code ===
						"chunk-choice-index-invalid",
				),
			).toHaveLength(1)
		} finally {
			recovery.unsubscribe()
			warnSpy.mockRestore()
		}
	})

	it("单 choice 缺失 index 时兼容回退数组首项，并按 correlation 只记录一次 warning。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)

		try {
			store.receiveChunk(
				createChunk({
					i: 0,
					choices: [createChoiceWithoutIndex({ deltaIndex: 7, content: "legacy-" })],
				}),
			)
			store.receiveChunk(
				createChunk({
					i: 1,
					choices: [
						createChoiceWithoutIndex({ content: "compatible", finishReason: "stop" }),
					],
				}),
			)

			expectSettledContent(store, "legacy-compatible")
			expect(recovery.events).toHaveLength(0)
			const warnings = warnSpy.mock.calls.filter(
				([, payload]) =>
					(payload as { code?: string } | undefined)?.code ===
					"chunk-choice-index-missing",
			)
			expect(warnings).toEqual([
				[
					"[SuperMagicStore] missing choice index",
					expect.objectContaining({
						code: "chunk-choice-index-missing",
						topicId: TOPIC_ID,
						superMessageId: SUPER_MESSAGE_ID,
						correlationId: CORRELATION_ID,
						fallbackChoiceIndex: 0,
						resolution: "fallback-single-choice",
					}),
				],
			])
		} finally {
			recovery.unsubscribe()
			warnSpy.mockRestore()
		}
	})

	it("choice.index=0 缺少 delta 且存在其他候选时整包忽略，后续只由 canonical Final 收敛。", () => {
		const store = createStore()
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const invalidMultipleChoices = mutateProtocolChunk(createChunk(), (draft) => {
			draft.super_magic_chunk.choices = [
				{ index: 0, finish_reason: null },
				{
					index: 1,
					finish_reason: "stop",
					delta: {
						content: "ignored-alternative",
						role: "assistant",
						tool_calls: [],
						reasoning_content: "ignored-reasoning",
						index: 1,
					},
				},
			]
		})

		try {
			store.receiveChunk(invalidMultipleChoices)
			expect(getProjectedNode(store)).toBeUndefined()
			expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()

			store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "canonical" }))
			expectSettledContent(store, "canonical")
			expect(
				warnSpy.mock.calls.filter(
					([, payload]) =>
						(payload as { code?: string } | undefined)?.code ===
						"chunk-multiple-choices",
				),
			).toHaveLength(1)
		} finally {
			warnSpy.mockRestore()
		}
	})

	it("`choices[0].delta` 缺失。", () => {
		const store = createStore()

		store.receiveChunk(createChunkWithoutDelta())

		expect(getProjectedNode(store)).toBeUndefined()
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()

		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "complete" }))
		expectSettledContent(store, "complete")
	})

	it("`finish_reason` 与非空 delta 同时存在。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "done", finishReason: "stop" }))
		expectSettledContent(store, "done")

		store.receiveChunk(createChunk({ i: 1, content: "late" }))
		advanceRendering(100)
		expect(getProjectedNode(store)).toMatchObject({ content: "done" })
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("finish chunk 已清理 StreamState 后，迟到的完整 final message 权威覆盖全部流式字段。", () => {
		const store = createStore()
		const oldToolCall = createToolCall({
			id: "old-tool",
			name: "read_file",
			arguments: '{"path":"old.txt"}',
		})
		const finalToolCall = createToolCall({
			id: "final-tool",
			name: "write_file",
			arguments: '{"path":"final.txt"}',
		})

		store.receiveChunk(
			createChunk({
				i: 0,
				content: "old-",
				reasoningContent: "old-thought-",
				toolCalls: [oldToolCall],
			}),
		)
		store.receiveChunk(
			createChunk({
				i: 1,
				content: "draft",
				reasoningContent: "old-tail",
				finishReason: "stop",
			}),
		)
		advanceRendering()

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(getProjectedNode(store)).toMatchObject({
			content: "old-draft",
			reasoning_content: "old-thought-old-tail",
			tool_calls: [oldToolCall],
		})
		const messageCardsBeforeFinal = store.messages.get(TOPIC_ID) ?? []
		expect(messageCardsBeforeFinal).toHaveLength(1)
		expect(messageCardsBeforeFinal[0]?.super_message_id).toBe(SUPER_MESSAGE_ID)

		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "final-answer",
				reasoningContent: "final-reasoning",
				toolCalls: [finalToolCall],
			}),
		)

		const finalNode = getProjectedNode(store)
		expect(finalNode?.content).toBe("final-answer")
		expect(finalNode?.reasoning_content).toBe("final-reasoning")
		expect(finalNode?.tool_calls).toHaveLength(1)
		expect(finalNode?.tool_calls?.[0]).toMatchObject(finalToolCall)
		expect(JSON.stringify(finalNode)).not.toContain("old-")
		expect(JSON.stringify(finalNode)).not.toContain("draft")
		expect(JSON.stringify(finalNode)).not.toContain("old-thought")
		expect(JSON.stringify(finalNode)).not.toContain("old-tool")
		const finalSnapshot = cloneFixture(finalNode)

		advanceRendering()
		expect(getProjectedNode(store)).toEqual(finalSnapshot)
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		const messageCardsAfterFinal = store.messages.get(TOPIC_ID) ?? []
		expect(messageCardsAfterFinal).toHaveLength(messageCardsBeforeFinal.length)
		expect(messageCardsAfterFinal[0]?.app_message_id).toBe("final-app-1")
		expect(messageCardsAfterFinal[0]?.super_message_id).toBe(SUPER_MESSAGE_ID)
		expect(messageCardsAfterFinal[0]?.correlation_id).toBe(CORRELATION_ID)
		expect(getProjectedNode(store)).toMatchObject({
			app_message_id: "final-app-1",
			super_message_id: SUPER_MESSAGE_ID,
		})
	})

	it("StreamState 已清理后，完整 final message 的空流式字段会清除旧内容。", () => {
		const store = createStore()
		const oldToolCall = createToolCall({
			id: "old-tool",
			name: "read_file",
			arguments: '{"path":"old.txt"}',
		})

		store.receiveChunk(
			createChunk({
				i: 0,
				content: "old-content",
				reasoningContent: "old-reasoning",
				toolCalls: [oldToolCall],
			}),
		)
		store.receiveChunk(createChunk({ i: 1, finishReason: "stop" }))
		advanceRendering()

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(getProjectedNode(store)?.content).toBe("old-content")
		expect(getProjectedNode(store)?.reasoning_content).toBe("old-reasoning")
		expect(getProjectedNode(store)?.tool_calls).toHaveLength(1)
		expect(getProjectedNode(store)?.tool_calls?.[0]).toMatchObject(oldToolCall)

		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "",
				reasoningContent: "",
				toolCalls: [],
			}),
		)

		expect(getProjectedNode(store)?.content).toBe("")
		expect(getProjectedNode(store)?.reasoning_content).toBe("")
		expect(getProjectedNode(store)?.tool_calls).toEqual([])
		advanceRendering()
		expect(getProjectedNode(store)?.content).toBe("")
		expect(getProjectedNode(store)?.reasoning_content).toBe("")
		expect(getProjectedNode(store)?.tool_calls).toEqual([])
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it('`finish_reason="length"`，但最终 message 内容完整。', () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)
		const finalToolCall = createToolCall({
			id: "final-tool",
			name: "write_file",
			arguments: '{"path":"final.txt"}',
		})

		store.receiveChunk(
			createChunk({
				content: "partial-draft",
				reasoningContent: "draft-thought",
				finishReason: "length",
			}),
		)
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeDefined()
		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({
				content: "authoritative final",
				reasoningContent: "final reasoning",
				toolCalls: [finalToolCall],
			}),
		)

		expectSettledContent(store, "authoritative final")
		expect(getProjectedNode(store)).toMatchObject({
			reasoning_content: "final reasoning",
			tool_calls: [finalToolCall],
		})
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toHaveLength(0)
		recovery.unsubscribe()
	})

	it('`finish_reason="tool_calls"`，但没有 tool call。', () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "answer" }))
		store.receiveChunk(createChunk({ i: 1, finishReason: "tool_calls" }))
		advanceRendering(100)

		expect(getProjectedNode(store)?.tool_calls ?? []).toHaveLength(0)

		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "answer" }))
		expectSettledContent(store, "answer")
	})
})
