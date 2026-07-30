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

const TOPIC_ID = "topic-fixture"
const CORRELATION_ID = "correlation-fixture"
const SUPER_MESSAGE_ID = "super-message-fixture"

interface ProjectedNode {
	content?: string | null
}

function cloneFixture<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

function createStore(): SuperMagicStore {
	const store = new SuperMagicStore()
	store.setActiveTopicId(TOPIC_ID)
	return store
}

function createChunk({
	i = 0,
	content = "",
	finishReason = null,
}: {
	i?: number
	content?: string
	finishReason?: "stop" | "tool_calls" | "length" | null
} = {}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-${i}`,
		app_message_id: `chunk-${i}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-1",
		topic_id: TOPIC_ID,
		chat_topic_id: TOPIC_ID,
		message_id: "completion-fixture",
		super_magic_chunk: {
			super_message_id: SUPER_MESSAGE_ID,
			task_id: "task-fixture",
			i,
			usage: null,
			correlation_id: CORRELATION_ID,
			choices: [
				{
					finish_reason: finishReason,
					delta: {
						content,
						role: "assistant",
						tool_calls: [],
						reasoning_content: "",
						index: 0,
					},
				},
			],
		},
	}
}

function createFinal(content = "final"): RawSuperMagicMessageEnvelope {
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-user",
			seq_id: "100",
			message_id: "server-100",
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: "conversation-1",
			organization_code: "organization-1",
			message: {
				magic_message_id: "magic-final",
				app_message_id: "final-app",
				sender_id: "assistant-1",
				send_time: 1,
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: TOPIC_ID,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: {
					role: "assistant",
					topic_id: TOPIC_ID,
					message_id: "node-final",
					super_message_id: SUPER_MESSAGE_ID,
					correlation_id: CORRELATION_ID,
					content,
					status: "finished",
					send_timestamp: 1,
				},
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function getContent(store: SuperMagicStore): string | null | undefined {
	return (store.getMessageNode(SUPER_MESSAGE_ID) as ProjectedNode | undefined)?.content
}

function replayFresh(chunks: SuperMagicChunkMessage[]): SuperMagicStore {
	const store = createStore()
	for (const chunk of chunks.map((item) => cloneFixture(item))) store.receiveChunk(chunk)
	return store
}

describe("SuperMagicStore / 测试隔离与 Fixture", () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
	})

	it("多次执行调试 replay，共用同一个单例 Store。", () => {
		const chunks = [
			createChunk({ i: 0, content: "A" }),
			createChunk({ i: 1, content: "B", finishReason: "stop" }),
		]
		const firstRun = replayFresh(chunks)
		vi.advanceTimersByTime(2_000)
		const secondRun = replayFresh(chunks)
		vi.advanceTimersByTime(2_000)

		expect(firstRun).not.toBe(secondRun)
		expect(getContent(firstRun)).toBe("AB")
		expect(getContent(secondRun)).toBe("AB")
	})

	it("测试回放没有在开始前清理 finalizedCorrelationIds。", () => {
		const firstRun = replayFresh([createChunk({ content: "old", finishReason: "stop" })])
		vi.advanceTimersByTime(2_000)
		expect(getContent(firstRun)).toBe("old")

		const secondRun = replayFresh([createChunk({ content: "new", finishReason: "stop" })])
		vi.advanceTimersByTime(2_000)
		expect(getContent(secondRun)).toBe("new")
	})

	it("测试 helper 发布了错误的 PubSub 事件名。", () => {
		const store = createStore()
		const arrived = vi.fn()
		const unsubscribe = store.subscribe("message.committed", arrived, {
			scope: { topicId: TOPIC_ID },
		})

		store.enqueueMessage(TOPIC_ID, createFinal("published"))
		vi.advanceTimersByTime(2_000)

		expect(arrived).toHaveBeenCalledTimes(1)
		expect(arrived).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "message.committed",
				meta: expect.objectContaining({ topicId: TOPIC_ID }),
			}),
		)
		unsubscribe()
	})

	it("测试 helper 修改了原始 mock 对象，第二次运行数据已被污染。", () => {
		const fixture = createChunk({ content: "immutable", finishReason: "stop" })
		const snapshot = cloneFixture(fixture)

		const firstRun = replayFresh([fixture])
		vi.advanceTimersByTime(2_000)
		const secondRun = replayFresh([fixture])
		vi.advanceTimersByTime(2_000)

		expect(fixture).toEqual(snapshot)
		expect(getContent(firstRun)).toBe("immutable")
		expect(getContent(secondRun)).toBe("immutable")
	})

	it("单测使用 `vi.runAllTimers()`，遇到无限 timer 时测试自身卡死。", () => {
		const store = createStore()
		const recovery = vi.fn()
		const unsubscribe = store.registerOnStreamRecoveryRequested(recovery)
		store.receiveChunk(createChunk({ content: "unfinished" }))

		// Bounded advancement proves the fixture remains controllable even if Store schedules itself.
		vi.advanceTimersByTime(5_100)

		expect(store.isTopicStreaming(TOPIC_ID)).toBe(true)
		expect(recovery).toHaveBeenCalledTimes(1)
		unsubscribe()
	})

	it("大型生产 fixture 作为单测输入，导致测试慢且难以定位失败。", () => {
		const minimalFixture = createChunk({ content: "small", finishReason: "stop" })
		expect(JSON.stringify(minimalFixture).length).toBeLessThan(1_000)

		const store = replayFresh([minimalFixture])
		vi.advanceTimersByTime(2_000)
		expect(getContent(store)).toBe("small")
	})
})
