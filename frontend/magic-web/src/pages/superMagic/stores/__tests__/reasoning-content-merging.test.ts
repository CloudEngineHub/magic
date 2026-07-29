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

const TOPIC_ID = "topic-reasoning"
const CORRELATION_ID = "correlation-reasoning"
const RENDER_SETTLE_MS = 2_000
const RECOVERY_TIMEOUT_MS = 5_100

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]
type ChunkToolCall = ChunkChoice["delta"]["tool_calls"][number]
type FinishReason = ChunkChoice["finish_reason"]

interface ChunkOptions {
	i?: number
	content?: string
	reasoningContent?: string
	finishReason?: FinishReason
	toolCalls?: ChunkToolCall[]
	choices?: ChunkChoice[]
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
	content?: string | null
	reasoning_content?: string | null
	tool_calls?: ProjectedToolCall[] | null
}

interface MutableFinalEnvelope {
	seq: {
		message: {
			super_magic_message: Record<string, unknown>
		}
	}
}

function createChoice({
	content = "",
	reasoningContent = "",
	finishReason = null,
	toolCalls = [],
}: Omit<ChunkOptions, "i" | "choices"> = {}): ChunkChoice {
	return {
		finish_reason: finishReason,
		delta: {
			content,
			role: "assistant",
			tool_calls: toolCalls,
			reasoning_content: reasoningContent,
			index: 0,
		},
	}
}

function createChunk({
	i = 0,
	content = "",
	reasoningContent = "",
	finishReason = null,
	toolCalls = [],
	choices,
}: ChunkOptions = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-${i}`,
		app_message_id: `chunk-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-reasoning",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: "completion-reasoning",
		super_magic_chunk: {
			i,
			usage: null,
			correlation_id: CORRELATION_ID,
			choices: choices ?? [
				createChoice({
					content,
					reasoningContent,
					finishReason,
					toolCalls,
				}),
			],
		},
	}
}

function createToolCall(argumentsValue = "{}"): ChunkToolCall {
	return {
		id: "tool-reasoning",
		type: "function",
		index: 0,
		function: {
			name: "read_file",
			arguments: argumentsValue,
		},
	}
}

function createFinalEnvelope({
	content,
	reasoningContent = "",
	includeReasoning = true,
}: {
	content: string
	reasoningContent?: string
	includeReasoning?: boolean
}): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-reasoning",
			seq_id: "100",
			message_id: "server-reasoning",
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-reasoning",
			organization_code: "organization-reasoning",
			message: {
				magic_message_id: "magic-final-reasoning",
				app_message_id: "app-final-reasoning",
				sender_id: "assistant-reasoning",
				send_time: 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "assistant",
					topic_id: TOPIC_ID,
					message_id: "node-final-reasoning",
					correlation_id: CORRELATION_ID,
					content,
					...(includeReasoning ? { reasoning_content: reasoningContent } : {}),
					tool_calls: [],
					status: "finished",
					send_timestamp: 1,
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	// Runtime uses the V2 node shape, which the legacy envelope alias does not yet include.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function mutateFinalEnvelope(
	envelope: RawSuperMagicMessageEnvelope,
	mutate: (node: Record<string, unknown>) => void,
): RawSuperMagicMessageEnvelope {
	// Malformed protocol values are isolated at this boundary; ordinary fixtures stay typed.
	const clone = JSON.parse(JSON.stringify(envelope)) as MutableFinalEnvelope
	mutate(clone.seq.message.super_magic_message)
	return clone as unknown as RawSuperMagicMessageEnvelope
}

function cloneChunk(chunk: SuperMagicChunkMessage): SuperMagicChunkMessage {
	return JSON.parse(JSON.stringify(chunk)) as SuperMagicChunkMessage
}

function createStore(): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(TOPIC_ID)
	return store
}

function getProjectedNode(store: SuperMagicStore): ProjectedNode | undefined {
	const node = store.getMessageNode(CORRELATION_ID)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function collectRecoveryRequests(store: SuperMagicStore): {
	events: StreamRecoveryRequestPayload[]
	unsubscribe: () => void
} {
	const events: StreamRecoveryRequestPayload[] = []
	const unsubscribe = store.registerOnStreamRecoveryRequested((payload) => events.push(payload))
	return { events, unsubscribe }
}

function advanceRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

function expectSettledNode(store: SuperMagicStore, expected: ProjectedNode): void {
	advanceRendering()
	expect(getProjectedNode(store)).toMatchObject(expected)
	expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
}

describe("SuperMagicStore / Reasoning 和正文内容", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})

	afterEach(() => {
		// Unknown render loops must never be drained without an upper bound.
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("reasoning chunk 重复到达。", () => {
		const store = createStore()
		const reasoningChunk = createChunk({ i: 0, reasoningContent: "先分析" })

		store.receiveChunk(reasoningChunk)
		store.receiveChunk(cloneChunk(reasoningChunk))
		store.receiveChunk(createChunk({ i: 1, finishReason: "stop" }))

		expectSettledNode(store, { reasoning_content: "先分析", content: "" })
	})

	it("reasoning chunk 乱序到达。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, reasoningContent: "A" }))
		store.receiveChunk(createChunk({ i: 2, reasoningContent: "C" }))
		store.receiveChunk(createChunk({ i: 1, reasoningContent: "B" }))
		store.receiveChunk(createChunk({ i: 3, finishReason: "stop" }))

		expectSettledNode(store, { reasoning_content: "ABC" })
	})

	it("reasoning 中间片段丢失。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, reasoningContent: "A" }))
		store.receiveChunk(createChunk({ i: 2, reasoningContent: "C", finishReason: "stop" }))
		advanceRendering(100)

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)?.reasoning_content).toBe("A")
		expect(getProjectedNode(store)?.reasoning_content ?? "").not.toContain("C")
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
	})

	it("content chunk 重复到达。", () => {
		const store = createStore()
		const contentChunk = createChunk({ i: 0, content: "正文" })

		store.receiveChunk(contentChunk)
		store.receiveChunk(cloneChunk(contentChunk))
		store.receiveChunk(createChunk({ i: 1, finishReason: "stop" }))

		expectSettledNode(store, { content: "正文" })
	})

	it("content chunk 乱序到达。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 2, content: "C" }))
		store.receiveChunk(createChunk({ i: 1, content: "B" }))
		store.receiveChunk(createChunk({ i: 3, finishReason: "stop" }))

		expectSettledNode(store, { content: "ABC" })
	})

	it("content 中间片段丢失。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 2, content: "C", finishReason: "stop" }))
		advanceRendering(100)

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)?.content).toBe("A")
		expect(getProjectedNode(store)?.content ?? "").not.toContain("C")
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
	})

	it("content 先到，reasoning 后到。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "结论" }))
		store.receiveChunk(createChunk({ i: 1, reasoningContent: "补充推理" }))
		store.receiveChunk(createChunk({ i: 2, finishReason: "stop" }))

		expectSettledNode(store, {
			content: "结论",
			reasoning_content: "补充推理",
		})
	})

	it("reasoning 已结束后又收到 reasoning chunk。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, reasoningContent: "第一段" }))
		store.receiveChunk(createChunk({ i: 1, content: "正文" }))
		store.receiveChunk(createChunk({ i: 2, reasoningContent: "补充段" }))
		store.receiveChunk(createChunk({ i: 3, finishReason: "stop" }))

		expectSettledNode(store, {
			content: "正文",
			reasoning_content: "第一段补充段",
		})
	})

	it("已进入 tool 阶段后又收到 content chunk。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, toolCalls: [createToolCall('{"path":"a"}')] }))
		store.receiveChunk(createChunk({ i: 1, content: "工具前后的说明" }))
		store.receiveChunk(createChunk({ i: 2, finishReason: "tool_calls" }))

		expectSettledNode(store, {
			content: "工具前后的说明",
			tool_calls: [
				{
					id: "tool-reasoning",
					function: { name: "read_file", arguments: '{"path":"a"}' },
				},
			],
		})
	})

	it("final content 比流式 content 更短。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "流式草稿包含多余内容" }))
		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "最终稿" }))

		expectSettledNode(store, { content: "最终稿" })
	})

	it("final content 与流式 content 长度相同但内容不同。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "draft" }))
		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "final" }))

		expectSettledNode(store, { content: "final" })
	})

	it("final content 不是流式 content 的前缀扩展。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "The draft starts here" }))
		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "A rewritten answer" }))

		expectSettledNode(store, { content: "A rewritten answer" })
	})

	it("terminal final content 为 `null` 时显式清空流式 content。", () => {
		const store = createStore()
		const finalEnvelope = mutateFinalEnvelope(
			createFinalEnvelope({ content: "placeholder" }),
			(node) => {
				node.content = null
			},
		)

		store.receiveChunk(createChunk({ content: "可用的流式正文" }))
		store.enqueueMessage(TOPIC_ID, finalEnvelope)

		// Terminal Final distinguishes an absent field from an explicit clear value.
		expectSettledNode(store, { content: "" })
	})

	it("terminal final content 为空字符串时显式清空流式 content。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "可用的流式正文" }))
		store.enqueueMessage(TOPIC_ID, createFinalEnvelope({ content: "" }))

		expectSettledNode(store, { content: "" })
	})

	it("final message 缺少 reasoning，但流式 reasoning 已存在。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ reasoningContent: "完整推理" }))
		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({ content: "答案", includeReasoning: false }),
		)

		expectSettledNode(store, { content: "答案", reasoning_content: "完整推理" })
	})

	it("final reasoning 与流式 reasoning 不一致。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ reasoningContent: "过时推理" }))
		store.enqueueMessage(
			TOPIC_ID,
			createFinalEnvelope({ content: "答案", reasoningContent: "服务端最终推理" }),
		)

		expectSettledNode(store, {
			content: "答案",
			reasoning_content: "服务端最终推理",
		})
	})

	it("chunk 内容包含半个 Unicode surrogate pair。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "\ud83d" }))
		store.receiveChunk(createChunk({ i: 1, content: "\ude00", finishReason: "stop" }))

		expectSettledNode(store, { content: "😀" })
		expect(getProjectedNode(store)?.content).not.toContain("�")
	})

	it("chunk 在组合字符、ZWJ emoji 或变体选择符中间截断。", () => {
		const store = createStore()
		const expected = "Cafe\u0301 👩\u200d💻\ufe0f"

		store.receiveChunk(createChunk({ i: 0, content: "Cafe" }))
		store.receiveChunk(createChunk({ i: 1, content: "\u0301 👩" }))
		store.receiveChunk(createChunk({ i: 2, content: "\u200d" }))
		store.receiveChunk(createChunk({ i: 3, content: "💻" }))
		store.receiveChunk(createChunk({ i: 4, content: "\ufe0f", finishReason: "stop" }))

		expectSettledNode(store, { content: expected })
		expect(getProjectedNode(store)?.content).not.toContain("�")
	})

	it("Markdown fence 在流式阶段未闭合。", () => {
		const store = createStore()
		const markdown = "```ts\nconst value = 1"

		store.receiveChunk(createChunk({ content: markdown, finishReason: "stop" }))

		expectSettledNode(store, { content: markdown })
	})

	it("citation、HTML 标签或自定义标记在流式阶段未闭合。", () => {
		const store = createStore()
		const markup = '<citation id="source-1"><strong>未闭合内容'

		store.receiveChunk(createChunk({ content: markup, finishReason: "stop" }))

		expectSettledNode(store, { content: markup })
	})

	it("非 Final 保持打字机展示，Final 对超大正文在 2 秒内有界追平。", () => {
		const store = createStore()
		const largeContent = "大段正文".repeat(16_384)

		store.receiveChunk(createChunk({ content: largeContent }))
		const liveContent = getProjectedNode(store)?.content ?? ""
		expect(liveContent.length).toBeGreaterThan(0)
		expect(liveContent.length).toBeLessThan(largeContent.length)

		store.receiveChunk(createChunk({ i: 1, finishReason: "stop" }))
		advanceRendering(RENDER_SETTLE_MS)

		expect(getProjectedNode(store)?.content).toBe(largeContent)
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("正文已经追平，但 final 长时间不到达。", () => {
		const store = createStore()
		const recovery = collectRecoveryRequests(store)

		store.receiveChunk(createChunk({ content: "已经完整展示的正文" }))
		advanceRendering(RENDER_SETTLE_MS)

		expect(getProjectedNode(store)?.content).toBe("已经完整展示的正文")
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeDefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		vi.advanceTimersByTime(RECOVERY_TIMEOUT_MS)
		expect(recovery.events).toEqual([{ topicId: TOPIC_ID, correlationId: CORRELATION_ID }])
		recovery.unsubscribe()
	})
})
