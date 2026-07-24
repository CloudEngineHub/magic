import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type {
	RawSuperMagicMessageEnvelope,
	ToolCall,
	ToolResponseState,
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

const TOPIC_A = "topic-resource-a"
const TOPIC_B = "topic-resource-b"
const RECOVERY_MS = 5_100
const SETTLE_MS = 2_000

interface ProjectedNode {
	content?: string | null
	tool_calls?: Array<{
		id?: string
		function?: { arguments?: string }
	}>
}

function createToolCall({
	id = "tool-1",
	index = 0,
	arguments: argumentsValue = "{}",
}: {
	id?: string
	index?: number
	arguments?: string
} = {}): ToolCall {
	return {
		id,
		index,
		type: "function",
		function: { name: "large_tool", arguments: argumentsValue },
	}
}

function createChunk({
	topicId = TOPIC_A,
	correlationId = "corr-resource",
	i = 0,
	content = "",
	toolCalls = [],
	finishReason = null,
}: {
	topicId?: string
	correlationId?: string
	i?: number
	content?: string
	toolCalls?: ToolCall[]
	finishReason?: "stop" | "tool_calls" | "length" | null
} = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-${topicId}-${correlationId}-${i}`,
		app_message_id: `app-${topicId}-${correlationId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: topicId,
		chat_topic_id: topicId,
		message_id: `completion-${correlationId}`,
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

function createFinal({
	topicId = TOPIC_A,
	correlationId = "corr-resource",
	appMessageId = "final-resource",
	seqId = "100",
	content = "final",
	toolCalls = [],
	role = "assistant",
	tool,
	toolCallId,
}: {
	topicId?: string
	correlationId?: string
	appMessageId?: string
	seqId?: string
	content?: string
	toolCalls?: ToolCall[]
	role?: "assistant" | "user" | "tool"
	tool?: ToolResponseState
	toolCallId?: string
} = {}): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user",
			seq_id: seqId,
			message_id: `server-${seqId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: role === "user" ? "user-1" : "assistant-1",
				send_time: 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role,
					topic_id: topicId,
					message_id: `node-${appMessageId}`,
					correlation_id: correlationId,
					content,
					status: "finished",
					send_timestamp: 1,
					tool_calls: toolCalls,
					...(tool ? { tool } : {}),
					...(toolCallId ? { tool_call_id: toolCallId } : {}),
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(topicId = TOPIC_A): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(topicId)
	return store
}

function getNode(store: SuperMagicStore, id = "corr-resource"): ProjectedNode | undefined {
	const value = store.getMessageNode(id)
	return value && typeof value === "object" ? (value as ProjectedNode) : undefined
}

function settle(): void {
	vi.advanceTimersByTime(SETTLE_MS)
}

describe("SuperMagicStore / 资源和性能", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("重复 chunk 导致 arguments 内存成倍增长。", () => {
		const store = createStore()
		const args = JSON.stringify({ path: "a.txt", body: "x".repeat(8_192) })
		const chunk = createChunk({ toolCalls: [createToolCall({ arguments: args })] })
		store.receiveChunk(chunk)
		store.receiveChunk(JSON.parse(JSON.stringify(chunk)) as SuperMagicChunkMessage)
		store.enqueueMessage(
			TOPIC_A,
			createFinal({ toolCalls: [createToolCall({ arguments: args })] }),
		)
		settle()

		expect(getNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(args)
	})

	it("超大 HTML arguments 在 StreamState 和 messageMap 各保留一份。", () => {
		const store = createStore()
		const html = `<html>${"<section>large</section>".repeat(4_000)}</html>`
		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ arguments: html })] }))

		expect(
			store.getStreamState(TOPIC_A, "corr-resource")?.tool_calls[0]?.function.arguments,
		).toBe(html)
		expect(getNode(store)?.tool_calls ?? []).toHaveLength(0)

		store.enqueueMessage(
			TOPIC_A,
			createFinal({ toolCalls: [createToolCall({ arguments: html })] }),
		)
		settle()
		expect(store.getStreamState(TOPIC_A, "corr-resource")).toBeUndefined()
		expect(getNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(html)
	})

	it("final snapshot 再复制一份完整 arguments。", () => {
		const store = createStore()
		const streamed = "{" + '"html":"' + "x".repeat(16_384) + '"}'
		const canonical = '{"html":"final"}'
		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ arguments: streamed })] }))
		store.enqueueMessage(
			TOPIC_A,
			createFinal({ toolCalls: [createToolCall({ arguments: canonical })] }),
		)
		settle()

		expect(getNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(canonical)
		expect(store.getStreamState(TOPIC_A, "corr-resource")).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("MobX 对每个字符片段产生观察更新。", () => {
		const store = createStore()
		const arrivals: unknown[] = []
		const unsubscribe = store.registerTopicMessageListener({
			topicId: TOPIC_A,
			callback: (payload) => arrivals.push(payload),
		})
		const text = "a".repeat(128)
		for (const [index, char] of [...text].entries()) {
			store.receiveChunk(createChunk({ i: index, content: char }))
		}
		store.receiveChunk(createChunk({ i: text.length, finishReason: "stop" }))
		settle()

		expect(getNode(store)?.content).toBe(text)
		expect(arrivals.length).toBeLessThanOrEqual(1)
		unsubscribe()
	})

	it("16ms timer 在无进展状态下永久运行。", () => {
		const store = createStore()
		const recoveries: unknown[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) =>
			recoveries.push(payload),
		)
		store.receiveChunk(createChunk({ i: 2, content: "gap" }))
		vi.advanceTimersByTime(RECOVERY_MS)
		vi.advanceTimersByTime(RECOVERY_MS * 2)

		expect(recoveries.length).toBeGreaterThanOrEqual(1)
		expect(recoveries.length).toBeLessThanOrEqual(2)
		unsubscribe()
	})

	it("多个 topic 各自残留 timer/recovery timer。", () => {
		const store = createStore(TOPIC_A)
		store.receiveChunk(createChunk({ topicId: TOPIC_A, correlationId: "corr-a", content: "A" }))
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(createChunk({ topicId: TOPIC_B, correlationId: "corr-b", content: "B" }))
		store.enqueueMessage(
			TOPIC_A,
			createFinal({ topicId: TOPIC_A, correlationId: "corr-a", content: "A-final" }),
		)
		store.enqueueMessage(
			TOPIC_B,
			createFinal({ topicId: TOPIC_B, correlationId: "corr-b", content: "B-final" }),
		)
		settle()

		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(store.isTopicStreaming(TOPIC_B)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})

	it("buffer 长期积压大量完整消息对象。", () => {
		const store = createStore()
		const arrived: string[] = []
		const unsubscribe = store.registerTopicMessageListener({
			topicId: TOPIC_A,
			callback: ({ message }) => arrived.push(message.app_message_id),
		})
		for (let index = 0; index < 64; index += 1) {
			store.enqueueMessage(
				TOPIC_A,
				createFinal({
					appMessageId: `app-${index}`,
					correlationId: `corr-${index}`,
					seqId: String(index + 1),
					content: `message-${index}`,
				}),
			)
		}
		settle()

		expect(arrived).toHaveLength(64)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		unsubscribe()
	})

	it("streamSnapshots 长期不清理。", () => {
		const store = createStore(TOPIC_A)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_A, correlationId: "corr-snapshot", content: "draft" }),
		)
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(
			TOPIC_A,
			createFinal({
				topicId: TOPIC_A,
				correlationId: "corr-snapshot",
				content: "background-final",
			}),
		)
		settle()
		store.setActiveTopicId(TOPIC_A)
		settle()

		expect(store.getMessageNode("corr-snapshot")).toMatchObject({ content: "background-final" })
		expect(store.getStreamState(TOPIC_A, "corr-snapshot")).toBeUndefined()
	})

	it("finalizedCorrelationIds 无界增长。", () => {
		const store = createStore()
		for (let index = 0; index < 64; index += 1) {
			const correlationId = `corr-final-${index}`
			store.receiveChunk(
				createChunk({ correlationId, content: String(index), finishReason: "stop" }),
			)
		}
		settle()

		store.receiveChunk(createChunk({ correlationId: "corr-final-63", i: 1, content: "late" }))
		expect(store.getMessageNode("corr-final-63")).toMatchObject({ content: "63" })
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("toolResponseMap 无界增长。", () => {
		const store = createStore()
		for (let index = 0; index < 32; index += 1) {
			const correlationId = `corr-tool-${index}`
			const toolId = `tool-${index}`
			store.enqueueMessage(
				TOPIC_A,
				createFinal({
					correlationId,
					appMessageId: `assistant-${index}`,
					toolCalls: [createToolCall({ id: toolId, index, arguments: "{}" })],
				}),
			)
			store.enqueueMessage(
				TOPIC_A,
				createFinal({
					correlationId,
					appMessageId: `tool-response-${index}`,
					seqId: String(index + 100),
					content: "",
					role: "tool",
					toolCallId: toolId,
					tool: { id: toolId, status: "finished" },
				}),
			)
		}
		settle()

		expect(store.getMessageNode("assistant-31")).toBeDefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("messageMap 无界增长。", () => {
		const store = createStore()
		store.initializeMessages(TOPIC_A, [
			createFinal({
				appMessageId: "old-a",
				correlationId: "old-a-corr",
				content: "old-a",
				seqId: "1",
			}),
			createFinal({
				appMessageId: "old-b",
				correlationId: "old-b-corr",
				content: "old-b",
				seqId: "2",
			}),
		])
		store.initializeMessages(TOPIC_A, [
			createFinal({
				appMessageId: "new-a",
				correlationId: "new-a-corr",
				content: "new-a",
				seqId: "3",
			}),
		])
		settle()

		expect(store.getMessageNode("new-a-corr")).toMatchObject({ content: "new-a" })
		expect(store.getMessageNode("old-a-corr")).toBeUndefined()
		expect(store.getMessageNode("old-b-corr")).toBeUndefined()
	})

	it("调试日志序列化完整 buffer 或大 arguments。", () => {
		const stringify = vi.spyOn(JSON, "stringify")
		const store = createStore()
		const large = "x".repeat(32_768)
		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ arguments: large })] }))
		store.enqueueMessage(
			TOPIC_A,
			createFinal({ toolCalls: [createToolCall({ arguments: large })] }),
		)
		settle()

		const oversizedCalls = stringify.mock.calls.filter(
			([value]) => typeof value === "string" && value.length > 8_192,
		)
		expect(oversizedCalls).toHaveLength(0)
		stringify.mockRestore()
	})

	it("持久化对每个小 chunk 执行 JSON 序列化。", () => {
		const stringify = vi.spyOn(JSON, "stringify")
		const store = createStore()
		for (let index = 0; index < 32; index += 1) {
			store.receiveChunk(createChunk({ i: index, content: "x" }))
		}
		store.receiveChunk(createChunk({ i: 32, finishReason: "stop" }))
		settle()

		expect(stringify.mock.calls.length).toBeLessThan(32)
		stringify.mockRestore()
	})

	it("重复 chunk 导致 IndexedDB 写入量翻倍。", () => {
		const store = createStore()
		const canonicalArrivals: unknown[] = []
		const unsubscribe = store.registerTopicMessageListener({
			topicId: TOPIC_A,
			callback: (payload) => canonicalArrivals.push(payload),
		})
		const chunk = createChunk({ i: 0, content: "A" })
		store.receiveChunk(chunk)
		store.receiveChunk(JSON.parse(JSON.stringify(chunk)) as SuperMagicChunkMessage)
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))
		settle()

		// The canonical completion may be persisted once, but duplicate transport input must not double it.
		expect(canonicalArrivals).toHaveLength(1)
		expect(getNode(store)?.content).toBe("AB")
		unsubscribe()
	})

	it("页面后台时积压大量 timer 和 MobX action，切回瞬间卡顿。", () => {
		const store = createStore(TOPIC_A)
		const recovery: unknown[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) =>
			recovery.push(payload),
		)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_A, correlationId: "corr-background", content: "A" }),
		)
		store.setActiveTopicId(TOPIC_B)
		vi.advanceTimersByTime(30_000)
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_A,
				correlationId: "corr-background",
				i: 1,
				content: "B",
				finishReason: "stop",
			}),
		)
		store.setActiveTopicId(TOPIC_A)
		settle()

		expect(store.getMessageNode("corr-background")).toMatchObject({ content: "AB" })
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(recovery.length).toBeLessThanOrEqual(1)
		unsubscribe()
	})

	it("多个大型工具并行流式后 canonical 工具数量稳定且生命周期收敛。", () => {
		const store = createStore()
		const tools = Array.from({ length: 3 }, (_, index) =>
			createToolCall({ id: `tool-${index}`, index, arguments: "x".repeat(12_000) }),
		)
		store.receiveChunk(createChunk({ toolCalls: tools }))
		store.enqueueMessage(TOPIC_A, createFinal({ toolCalls: tools }))
		settle()

		expect(getNode(store)?.tool_calls).toHaveLength(3)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("Final 快速覆盖超大参数后清理 stream 和 timer。", () => {
		const store = createStore()
		const partial = "x".repeat(32_000)
		const canonical = "final-canonical"
		store.receiveChunk(createChunk({ toolCalls: [createToolCall({ arguments: partial })] }))
		store.enqueueMessage(
			TOPIC_A,
			createFinal({ toolCalls: [createToolCall({ arguments: canonical })] }),
		)
		settle()

		expect(getNode(store)?.tool_calls?.[0]?.function?.arguments).toBe(canonical)
		expect(store.getStreamState(TOPIC_A, "corr-resource")).toBeUndefined()
		expect(vi.getTimerCount()).toBe(0)
	})
})
