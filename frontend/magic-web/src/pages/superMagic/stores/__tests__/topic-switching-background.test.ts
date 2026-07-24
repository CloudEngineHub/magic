import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { SuperMagicStore } from "@/pages/superMagic/stores"
import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"
import {
	ConversationMessageStatus,
	ConversationMessageType,
	type SuperMagicConversationMessageV2,
} from "@/types/chat/conversation_message"
import {
	IntermediateMessageType,
	type SuperMagicChunkMessage,
} from "@/types/chat/intermediate_message"

const TOPIC_A = "topic-background-a"
const TOPIC_B = "topic-background-b"
const TOPIC_C = "topic-background-c"
const CORRELATION_A = "correlation-background-a"
const CORRELATION_B = "correlation-background-b"
const CORRELATION_C = "correlation-background-c"
const RENDER_SETTLE_MS = 2_000

type ChunkChoice = SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]
type ChunkToolCall = ChunkChoice["delta"]["tool_calls"][number]
type FinishReason = ChunkChoice["finish_reason"]

interface ChunkOptions {
	topicId?: string
	correlationId?: string
	i?: number
	content?: string
	finishReason?: FinishReason
	toolCalls?: ChunkToolCall[]
}

interface ProjectedNode {
	content?: string | null
	reasoning_content?: string | null
	tool_calls?: Array<{
		id?: string
		function?: { name?: string; arguments?: string }
	}> | null
	tool?: {
		id?: string
		status?: string
		detail?: unknown
	}
	status?: string
}

function createChunk({
	topicId = TOPIC_A,
	correlationId = CORRELATION_A,
	i = 0,
	content = "",
	finishReason = null,
	toolCalls = [],
}: ChunkOptions = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-${topicId}-${correlationId}-${i}`,
		app_message_id: `chunk-${topicId}-${correlationId}-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-background",
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

function createToolCall(): ChunkToolCall {
	return {
		id: "tool-background",
		type: "function",
		index: 0,
		function: {
			name: "read_file",
			arguments: '{"path":"a.txt"}',
		},
	}
}

function createFinalEnvelope({
	topicId = TOPIC_A,
	correlationId = CORRELATION_A,
	appMessageId = `final-${correlationId}`,
	seqId = "100",
	content = "final",
	toolCalls = [],
}: {
	topicId?: string
	correlationId?: string
	appMessageId?: string
	seqId?: string
	content?: string
	toolCalls?: ChunkToolCall[]
} = {}): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-background",
			seq_id: seqId,
			message_id: `server-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-background",
			organization_code: "organization-background",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: "assistant-background",
				send_time: Number(seqId),
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "assistant",
					topic_id: topicId,
					message_id: `node-${appMessageId}`,
					correlation_id: correlationId,
					content,
					reasoning_content: "",
					tool_calls: toolCalls,
					status: "finished",
					send_timestamp: Number(seqId),
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createToolResponseEnvelope({
	topicId = TOPIC_A,
	correlationId = CORRELATION_A,
	appMessageId = "tool-response-background",
	seqId = "101",
}: {
	topicId?: string
	correlationId?: string
	appMessageId?: string
	seqId?: string
} = {}): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user-background",
			seq_id: seqId,
			message_id: `server-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-background",
			organization_code: "organization-background",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: "assistant-background",
				send_time: Number(seqId),
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "tool",
					topic_id: topicId,
					message_id: `node-${appMessageId}`,
					correlation_id: correlationId,
					content: null,
					reasoning_content: null,
					tool_call_id: "tool-background",
					tool_calls: null,
					tool: {
						id: "tool-background",
						name: "read_file",
						status: "finished",
						detail: { type: "text", data: "file content" },
					},
					status: "finished",
					send_timestamp: Number(seqId),
				},
			},
		},
	}

	// Tool messages legitimately carry null content, while the legacy envelope alias is narrower.
	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createStore(activeTopicId: string | null = TOPIC_A): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(activeTopicId)
	return store
}

function getProjectedNode(
	store: SuperMagicStore,
	messageId = CORRELATION_A,
): ProjectedNode | undefined {
	const node = store.getMessageNode(messageId)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function advanceRendering(milliseconds = RENDER_SETTLE_MS): void {
	vi.advanceTimersByTime(milliseconds)
}

describe("SuperMagicStore / Topic 切换与后台运行", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"))
	})

	afterEach(() => {
		// Background render/recovery loops are cleaned up without unbounded execution.
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("流式过程中从 topic A 切到 topic B。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ topicId: TOPIC_A, content: "A pending" }))
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_B,
				correlationId: CORRELATION_B,
				content: "B done",
				finishReason: "stop",
			}),
		)
		advanceRendering()

		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeDefined()
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)?.content).toBe("A pending")
		expect(getProjectedNode(store, CORRELATION_B)?.content).toBe("B done")
		expect(store.getStreamState(TOPIC_B, CORRELATION_B)).toBeUndefined()
	})

	it("topic A 后台继续收到 chunk。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ topicId: TOPIC_A, i: 0, content: "A" }))
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(createChunk({ topicId: TOPIC_A, i: 1, content: "B" }))
		advanceRendering()

		expect(store.getStreamState(TOPIC_A, CORRELATION_A)?.content).toBe("AB")
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("topic A 后台收到 final。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ topicId: TOPIC_A, content: "draft" }))
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(TOPIC_A, createFinalEnvelope({ content: "canonical" }))
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("canonical")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("topic A 后台收到 tool response。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ toolCalls: [createToolCall()] }))
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(TOPIC_A, createToolResponseEnvelope())
		advanceRendering()

		expect(getProjectedNode(store, "tool-response-background")).toMatchObject({
			tool: { id: "tool-background", status: "finished" },
		})
		expect(getProjectedNode(store)?.tool_calls?.[0]).toMatchObject({
			id: "tool-background",
		})
	})

	it("topic A 后台完成后切回，错误重播打字机。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "draft" }))
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(TOPIC_A, createFinalEnvelope({ content: "final" }))
		advanceRendering()
		store.setActiveTopicId(TOPIC_A)
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("final")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(vi.getTimerCount()).toBe(0)
	})

	it("topic A 未完成时切回，但 timer 未恢复。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		store.setActiveTopicId(TOPIC_B)
		advanceRendering(500)
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("AB")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("topic A 已完成时切回，却重新创建 StreamState。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "done", finishReason: "stop" }))
		advanceRendering()
		store.setActiveTopicId(TOPIC_B)
		store.setActiveTopicId(TOPIC_A)
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("done")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("快速执行 A → B → A。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ topicId: TOPIC_A, i: 0, content: "A" }))
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_B,
				correlationId: CORRELATION_B,
				content: "B",
			}),
		)
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_A, i: 1, content: "!", finishReason: "stop" }),
		)
		advanceRendering()

		expect(getProjectedNode(store, CORRELATION_A)?.content).toBe("A!")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.getStreamState(TOPIC_B, CORRELATION_B)).toBeDefined()
	})

	it("快速执行 A → B → C → A。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ topicId: TOPIC_A, content: "A" }))
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_B, correlationId: CORRELATION_B, content: "B" }),
		)
		store.setActiveTopicId(TOPIC_C)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_C, correlationId: CORRELATION_C, content: "C" }),
		)
		store.setActiveTopicId(TOPIC_A)
		advanceRendering()

		expect(getProjectedNode(store, CORRELATION_A)?.content).toBe("A")
		expect(getProjectedNode(store, CORRELATION_B)?.content).toBe("B")
		expect(getProjectedNode(store, CORRELATION_C)?.content).toBe("C")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeDefined()
	})

	it("多个 topic 同时收到流式 chunk。", () => {
		const store = createStore()

		store.receiveChunk(
			createChunk({
				topicId: TOPIC_A,
				correlationId: CORRELATION_A,
				content: "A",
				finishReason: "stop",
			}),
		)
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_B,
				correlationId: CORRELATION_B,
				content: "B",
				finishReason: "stop",
			}),
		)
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_C,
				correlationId: CORRELATION_C,
				content: "C",
				finishReason: "stop",
			}),
		)
		advanceRendering()

		expect(getProjectedNode(store, CORRELATION_A)?.content).toBe("A")
		expect(getProjectedNode(store, CORRELATION_B)?.content).toBe("B")
		expect(getProjectedNode(store, CORRELATION_C)?.content).toBe("C")
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(store.isTopicStreaming(TOPIC_B)).toBe(false)
		expect(store.isTopicStreaming(TOPIC_C)).toBe(false)
	})

	it("activeTopicId 更新晚于 chunk 到达。", () => {
		const store = createStore(TOPIC_B)

		store.receiveChunk(createChunk({ topicId: TOPIC_A, content: "arrived first" }))
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(
			createChunk({ topicId: TOPIC_A, i: 1, content: " then active", finishReason: "stop" }),
		)
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("arrived first then active")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
	})

	it("topic 切换时旧 timer 回调已经进入任务队列。", () => {
		const store = createStore()
		const contentA = "A".repeat(4_096)

		store.receiveChunk(
			createChunk({ topicId: TOPIC_A, content: contentA, finishReason: "stop" }),
		)
		store.setActiveTopicId(TOPIC_B)
		store.receiveChunk(
			createChunk({
				topicId: TOPIC_B,
				correlationId: CORRELATION_B,
				content: "B",
				finishReason: "stop",
			}),
		)
		advanceRendering()
		store.setActiveTopicId(TOPIC_A)
		advanceRendering()

		expect(getProjectedNode(store, CORRELATION_A)?.content).toBe(contentA)
		expect(getProjectedNode(store, CORRELATION_B)?.content).toBe("B")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.getStreamState(TOPIC_B, CORRELATION_B)).toBeUndefined()
	})

	it("inactiveAt/lastActiveAt 记录顺序错误。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"))
		store.setActiveTopicId(TOPIC_B)
		vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"))
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("AB")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
	})

	it("浏览器休眠后恢复，错误判断为长时间离开。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "before sleep" }))
		store.setActiveTopicId(TOPIC_B)
		vi.advanceTimersByTime(60_000)
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(createChunk({ i: 1, content: " after wake", finishReason: "stop" }))
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("before sleep after wake")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
	})

	it("系统时间变化导致 inactive 时长异常。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ i: 0, content: "A" }))
		vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"))
		store.setActiveTopicId(TOPIC_B)
		vi.setSystemTime(new Date("2020-01-01T00:00:00.000Z"))
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(createChunk({ i: 1, content: "B", finishReason: "stop" }))
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("AB")
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("切回时 HTTP 同步和 replayPendingSnapshots 同时执行。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "stale draft" }))
		store.setActiveTopicId(TOPIC_B)
		const generation = store.beginTopicSync(TOPIC_A)
		store.initializeMessages(TOPIC_A, [createFinalEnvelope({ content: "authoritative" })])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "100",
			}),
		).toBe(true)
		store.setActiveTopicId(TOPIC_A)
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("authoritative")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
	})

	it("切回时 resumeActiveStreams 早于 HTTP 权威快照。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "stale draft" }))
		store.setActiveTopicId(TOPIC_B)
		store.setActiveTopicId(TOPIC_A)
		advanceRendering(100)
		const generation = store.beginTopicSync(TOPIC_A)
		store.initializeMessages(TOPIC_A, [createFinalEnvelope({ content: "authoritative" })])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "100",
			}),
		).toBe(true)
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("authoritative")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
	})

	it("terminal topic 切回时仍进入 live 模式。", () => {
		const store = createStore()
		const generation = store.beginTopicSync(TOPIC_A)

		store.initializeMessages(TOPIC_A, [createFinalEnvelope({ content: "terminal" })])
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: true,
				taskStatus: "finished",
				latestSeqId: "100",
			}),
		).toBe(true)
		store.setActiveTopicId(TOPIC_B)
		store.setActiveTopicId(TOPIC_A)
		store.receiveChunk(createChunk({ i: 0, content: "late" }))
		advanceRendering(200)

		expect(getProjectedNode(store)?.content).toBe("terminal")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("后台 topic final 后 streamSnapshots 未清理。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "draft" }))
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(TOPIC_A, createFinalEnvelope({ content: "final" }))
		advanceRendering()
		store.receiveChunk(createChunk({ i: 1, content: " late" }))
		store.setActiveTopicId(TOPIC_A)
		advanceRendering()

		expect(getProjectedNode(store)?.content).toBe("final")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
	})

	it("topic 被关闭或删除，但 topicMeta 没有释放。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "done", finishReason: "stop" }))
		advanceRendering()
		store.setActiveTopicId(null)
		vi.advanceTimersByTime(10_000)

		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getProjectedNode(store)?.content).toBe("done")
		expect(vi.getTimerCount()).toBe(0)
	})

	it("同一个页面存在两个 Store 订阅实例，chunk 被消费两次。", () => {
		const firstStore = createStore()
		const secondStore = createStore()
		const firstChunk = createChunk({ i: 0, content: "A" })
		const finalChunk = createChunk({ i: 1, content: "B", finishReason: "stop" })

		firstStore.receiveChunk(firstChunk)
		secondStore.receiveChunk(firstChunk)
		firstStore.receiveChunk(finalChunk)
		secondStore.receiveChunk(finalChunk)
		advanceRendering()

		expect(getProjectedNode(firstStore)?.content).toBe("AB")
		expect(getProjectedNode(secondStore)?.content).toBe("AB")
		expect(firstStore.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(secondStore.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
	})

	it("React Strict Mode 或热更新导致 PubSub 重复订阅。", () => {
		const store = createStore()
		const arrivedAppMessageIds: string[] = []
		const callback = ({ message }: { message: { app_message_id: string } }) => {
			arrivedAppMessageIds.push(message.app_message_id)
		}
		const unsubscribeFirst = store.registerTopicMessageListener({
			topicId: TOPIC_A,
			callback,
		})
		const unsubscribeSecond = store.registerTopicMessageListener({
			topicId: TOPIC_A,
			callback,
		})

		store.enqueueMessage(
			TOPIC_A,
			createFinalEnvelope({ appMessageId: "strict-mode-final", content: "once" }),
		)
		advanceRendering()

		expect(arrivedAppMessageIds).toHaveLength(1)
		unsubscribeFirst()
		unsubscribeSecond()
	})
})
