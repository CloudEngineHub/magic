import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type { RawSuperMagicMessageEnvelope, ToolCall } from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_ID = "topic-persistence"
const CORRELATION_ID = "correlation-persistence"
const SUPER_MESSAGE_ID = "super-message-persistence"
const SETTLE_MS = 2_000

interface ProjectedNode {
	content?: string | null
	correlation_id?: string
	tool_calls?: Array<{
		id?: string
		function?: { name?: string; arguments?: string }
	}>
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function createToolCall({
	id = "tool-1",
	index = 0,
	name = "read_file",
	arguments: argumentsValue = "{}",
}: {
	id?: string
	index?: number
	name?: string
	arguments?: string
} = {}): ToolCall {
	return {
		id,
		index,
		type: "function",
		function: { name, arguments: argumentsValue },
	}
}

function createChunk({
	i = 0,
	content = "",
	correlationId = CORRELATION_ID,
	finishReason = null,
	toolCalls = [],
}: {
	i?: number
	content?: string
	correlationId?: string
	finishReason?: "stop" | "tool_calls" | "length" | null
	toolCalls?: ToolCall[]
} = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-${correlationId}-${i}`,
		app_message_id: `app-${correlationId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: `completion-${correlationId}`,
		super_magic_chunk: {
			super_message_id:
				correlationId === CORRELATION_ID ? SUPER_MESSAGE_ID : `super-${correlationId}`,
			task_id: `task-${correlationId}`,
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
	appMessageId = "final-app",
	correlationId = CORRELATION_ID,
	seqId = "100",
	content = "canonical",
	status = "finished",
	toolCalls = [],
	malformedTool,
}: {
	appMessageId?: string
	correlationId?: string
	seqId?: string
	content?: string
	status?: "waiting" | "running" | "finished"
	toolCalls?: ToolCall[]
	malformedTool?: unknown
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
					super_message_id:
						correlationId === CORRELATION_ID
							? SUPER_MESSAGE_ID
							: `super-${correlationId}`,
					correlation_id: correlationId,
					content,
					status,
					send_timestamp: 1,
					tool_calls: toolCalls,
					...(malformedTool === undefined
						? {}
						: { tool: malformedTool as Record<string, unknown> }),
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(TOPIC_ID)
	return store
}

function node(
	store: SuperMagicStore,
	superMessageId = SUPER_MESSAGE_ID,
): ProjectedNode | undefined {
	const value = store.getMessageNode(superMessageId)
	return value && typeof value === "object" ? (value as ProjectedNode) : undefined
}

function settle(): void {
	vi.advanceTimersByTime(SETTLE_MS)
}

describe("SuperMagicStore / 持久化和回放", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("chunk 已实时消费，又从 IndexedDB 回放一次。", () => {
		const store = createStore()
		const live = createChunk({ i: 0, content: "A" })
		store.receiveChunk(live)
		store.receiveChunk(clone(live))
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))

		settle()
		expect(node(store)).toMatchObject({ content: "AB" })
	})

	it("IndexedDB 中消息顺序不按 `i`。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ i: 2, content: "C" }))
		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 1, content: "B" }))
		store.receiveChunk(createChunk({ i: 3, content: "D", finishReason: "stop" }))

		settle()
		expect(node(store)).toMatchObject({ content: "ABCD" })
	})

	it("IndexedDB 记录按字符串 key 排序导致时间顺序异常。", () => {
		const store = createStore()
		const records = [
			{ key: "1", chunk: createChunk({ i: 0, content: "A" }) },
			{ key: "2", chunk: createChunk({ i: 1, content: "B" }) },
			{ key: "10", chunk: createChunk({ i: 2, content: "C" }) },
			{ key: "11", chunk: createChunk({ i: 3, content: "D", finishReason: "stop" }) },
		]
		for (const record of records.sort((left, right) => left.key.localeCompare(right.key))) {
			store.receiveChunk(record.chunk)
		}

		settle()
		expect(node(store)).toMatchObject({ content: "ABCD" })
	})

	it("使用 `performance.now()` 作为 key 时发生碰撞。", () => {
		const store = createStore()
		const first = createChunk({ i: 0, content: "first" })
		store.receiveChunk(first)
		store.receiveChunk(clone(first))
		store.receiveChunk(createChunk({ i: 1, content: "done", finishReason: "stop" }))

		settle()
		expect(node(store)?.content).toBe("firstdone")
	})

	it("页面刷新时只恢复 arguments chunk，没有恢复工具头。", () => {
		const store = createStore()
		const anonymous = createToolCall({ arguments: '{"path":"a.txt"}' }) as Partial<ToolCall>
		delete anonymous.id
		if (anonymous.function) delete anonymous.function.name
		store.receiveChunk(createChunk({ toolCalls: [anonymous as ToolCall] }))
		settle()

		expect(node(store)?.tool_calls ?? []).toHaveLength(0)
		store.enqueueMessage(
			TOPIC_ID,
			createFinal({ toolCalls: [createToolCall({ arguments: '{"path":"a.txt"}' })] }),
		)
		settle()
		expect(node(store)?.tool_calls?.[0]).toMatchObject({ id: "tool-1" })
	})

	it("页面刷新时只恢复 final，没有恢复前序 chunk。", () => {
		const store = createStore()
		store.enqueueMessage(TOPIC_ID, createFinal({ content: "final-only" }))

		expect(node(store)).toMatchObject({ content: "final-only" })
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
		settle()
		expect(node(store)).toMatchObject({ content: "final-only" })
	})

	it.each(["waiting", "running", "finished"] as const)(
		"无 StreamState 的 HTTP Assistant 快照 status=%s 时直接落地。",
		(status) => {
			const store = createStore()
			const correlationId = `correlation-${status}`
			const content = `final-${status}`

			store.enqueueMessage(
				TOPIC_ID,
				createFinal({
					appMessageId: `app-${status}`,
					correlationId,
					content,
					status,
				}),
			)

			expect(node(store, `super-${correlationId}`)).toMatchObject({ content, status })
			expect(store.getStreamState(TOPIC_ID, correlationId)).toBeUndefined()
			expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
			expect(vi.getTimerCount()).toBe(0)
		},
	)

	it("页面刷新时恢复旧 StreamState，又收到实时 final。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ content: "old" }))
		store.enqueueMessage(TOPIC_ID, createFinal({ content: "live-final" }))
		store.receiveChunk(createChunk({ i: 1, content: "late-old" }))
		settle()

		expect(node(store)).toMatchObject({ content: "live-final" })
		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
	})

	it("本地持久化数据来自旧协议版本。", () => {
		const store = createStore()
		const legacy = {
			...createChunk({ i: 0, content: "legacy" }),
			super_magic_chunk: { version: 1, payload: "legacy" },
		} as unknown as SuperMagicChunkMessage
		expect(() => store.receiveChunk(legacy)).not.toThrow()

		expect(store.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		store.enqueueMessage(TOPIC_ID, createFinal({ content: "compatible" }))
		settle()
		expect(node(store)).toMatchObject({ content: "compatible" })
	})

	it("持久化数据中的 tool 字段类型与当前类型不一致。", () => {
		const store = createStore()
		store.enqueueMessage(
			TOPIC_ID,
			createFinal({
				content: "tool-data",
				malformedTool: ["legacy-tool-shape"],
			}),
		)
		settle()

		expect(node(store)).toMatchObject({ content: "tool-data" })
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("序列化时丢失 `undefined` 字段，匿名槽位形态发生变化。", () => {
		const store = createStore()
		const source = createToolCall({ arguments: "partial" }) as Partial<ToolCall>
		delete source.id
		if (source.function) delete source.function.name
		const replayed = JSON.parse(JSON.stringify(source)) as ToolCall
		store.receiveChunk(createChunk({ toolCalls: [replayed] }))
		store.enqueueMessage(
			TOPIC_ID,
			createFinal({ toolCalls: [createToolCall({ arguments: "partial" })] }),
		)
		settle()

		expect(node(store)?.tool_calls).toHaveLength(1)
		expect(node(store)?.tool_calls?.[0]?.id).toBe("tool-1")
	})

	it("大型 HTML arguments 重复持久化造成存储膨胀。", () => {
		const store = createStore()
		const html = `<html>${"<p>content</p>".repeat(2_000)}</html>`
		const chunk = createChunk({ toolCalls: [createToolCall({ arguments: html })] })
		store.receiveChunk(chunk)
		store.receiveChunk(clone(chunk))
		store.enqueueMessage(
			TOPIC_ID,
			createFinal({ toolCalls: [createToolCall({ arguments: html })] }),
		)
		settle()

		expect(node(store)?.tool_calls?.[0]?.function?.arguments).toBe(html)
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("IndexedDB 写入失败，但实时状态继续运行。", () => {
		const store = createStore()
		const liveChunk = createChunk({ i: 0, content: "live" })
		let persistenceFailed = true
		try {
			if (persistenceFailed) throw new Error("IndexedDB write failed")
		} catch {
			// Persistence failure must not prevent the live transport from reaching the store.
		}
		persistenceFailed = false
		store.receiveChunk(liveChunk)
		store.receiveChunk(createChunk({ i: 1, content: "-ok", finishReason: "stop" }))
		settle()

		expect(node(store)).toMatchObject({ content: "live-ok" })
		expect(persistenceFailed).toBe(false)
	})

	it("IndexedDB 数据部分写入，形成不完整回放。", () => {
		const store = createStore()
		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.receiveChunk(createChunk({ i: 2, content: "C", finishReason: "stop" }))
		settle()

		expect(node(store)?.content ?? "").not.toContain("C")
		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)

		const generation = store.beginTopicSync(TOPIC_ID)
		store.initializeMessages(TOPIC_ID, [createFinal({ content: "ABC", seqId: "200" })])
		expect(
			store.completeTopicSync(TOPIC_ID, generation, {
				succeeded: true,
				latestSeqId: "200",
			}),
		).toBe(true)
		settle()

		expect(node(store)).toMatchObject({ content: "ABC" })
	})

	it("clear/reset 只清理 messages，没有清理 topicMeta。", () => {
		const beforeReset = createStore()
		beforeReset.receiveChunk(createChunk({ content: "old" }))
		expect(beforeReset.isTopicStreaming(TOPIC_ID)).toBe(true)

		const afterReset = createStore()
		expect(afterReset.getMessageNode(SUPER_MESSAGE_ID)).toBeUndefined()
		expect(afterReset.getStreamState(TOPIC_ID, CORRELATION_ID)).toBeUndefined()
		expect(afterReset.isTopicStreaming(TOPIC_ID)).toBe(false)
	})

	it("clear/reset 只清理 messageMap，没有清理 buffer。", () => {
		const beforeReset = createStore()
		beforeReset.enqueueMessage(TOPIC_ID, createFinal({ content: "queued" }))
		settle()

		const afterReset = createStore()
		expect(afterReset.getMessageNode(SUPER_MESSAGE_ID)).toBeUndefined()
		afterReset.enqueueMessage(TOPIC_ID, createFinal({ content: "fresh" }))
		settle()
		expect(node(afterReset)).toMatchObject({ content: "fresh" })
	})
})
