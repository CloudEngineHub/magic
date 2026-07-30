import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { messagesConverter } from "@/pages/superMagic/components/MessageList/helpers"
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
const LONG_ABSENCE_MS = 30_000
const RECOVERY_WINDOW_MS = 5_100

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
	app_message_id?: string
	correlation_id?: string
	role?: string
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

function getAssistantCards(
	store: SuperMagicStore,
	topicId = TOPIC_A,
	correlationId = CORRELATION_A,
): ProjectedNode[] {
	const records = Array.from(store.messages.get(topicId) ?? []) as Array<Record<string, unknown>>
	return messagesConverter(records).filter(
		(message) => message.role === "assistant" && message.correlation_id === correlationId,
	) as ProjectedNode[]
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
		expect(getAssistantCards(store, TOPIC_B, CORRELATION_B)).toHaveLength(1)
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
		expect(getAssistantCards(store)).toHaveLength(1)
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
		expect(store.toolResponseMap.get(TOPIC_A)?.get("tool-background")).toMatchObject({
			id: "tool-background",
			status: "finished",
		})
	})

	it("topic A 后台完成后切回时直接展示 canonical Final，不重播打字机。", () => {
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
		expect(getAssistantCards(store)).toHaveLength(1)
	})

	it("topic A 未完成时切回，即使没有新 chunk 也会恢复 pending render。", () => {
		const store = createStore()
		const pendingContent = "pending".repeat(1_024)

		store.receiveChunk(createChunk({ i: 0, content: pendingContent }))
		store.setActiveTopicId(TOPIC_B)
		store.setActiveTopicId(TOPIC_A)
		const contentBeforeResume = getProjectedNode(store)?.content ?? ""
		advanceRendering(100)
		const contentAfterResume = getProjectedNode(store)?.content ?? ""

		expect(contentAfterResume.length).toBeGreaterThan(contentBeforeResume.length)
		expect(pendingContent.startsWith(contentAfterResume)).toBe(true)
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)?.content).toBe(pendingContent)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
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
		expect(getProjectedNode(store, CORRELATION_B)?.content).toBe("B")
		expect(store.isTopicStreaming(TOPIC_B)).toBe(true)
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
		expect(store.getStreamState(TOPIC_B, CORRELATION_B)).toBeDefined()
		expect(store.getStreamState(TOPIC_C, CORRELATION_C)).toBeDefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
		expect(store.isTopicStreaming(TOPIC_B)).toBe(true)
		expect(store.isTopicStreaming(TOPIC_C)).toBe(true)
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

	it("topic 切换后已调度的 timer 不会污染其他 topic。", () => {
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

	it("短于 30 秒的离开只恢复 pending render，不锁定内部时间字段。", () => {
		const store = createStore()
		const pendingContent = "short-away".repeat(1_024)

		store.receiveChunk(createChunk({ i: 0, content: pendingContent }))
		store.setActiveTopicId(TOPIC_B)
		vi.setSystemTime(new Date("2026-01-01T00:00:29.999Z"))
		store.setActiveTopicId(TOPIC_A)
		const contentBeforeResume = getProjectedNode(store)?.content ?? ""
		advanceRendering(100)
		const contentAfterResume = getProjectedNode(store)?.content ?? ""

		expect(contentAfterResume.length).toBeGreaterThan(contentBeforeResume.length)
		expect(contentAfterResume.length).toBeLessThan(pendingContent.length)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("离开达到 30 秒后切回，instant settle 当前已知 draft。", () => {
		const store = createStore()
		const pendingContent = "long-away".repeat(1_024)

		store.receiveChunk(createChunk({ i: 0, content: pendingContent }))
		store.setActiveTopicId(TOPIC_B)
		vi.setSystemTime(new Date(`2026-01-01T00:00:${LONG_ABSENCE_MS / 1_000}.000Z`))
		store.setActiveTopicId(TOPIC_A)
		advanceRendering(1)

		expect(getProjectedNode(store)?.content?.length).toBe(pendingContent.length)
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)?.content).toBe(pendingContent)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("wall clock 跳变不会把短暂离开误判为 30 秒长离开。", () => {
		const store = createStore()
		const pendingContent = "clock-jump".repeat(1_024)

		store.receiveChunk(createChunk({ i: 0, content: pendingContent }))
		store.setActiveTopicId(TOPIC_B)
		vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"))
		store.setActiveTopicId(TOPIC_A)
		const contentAfterReturn = getProjectedNode(store)?.content ?? ""
		advanceRendering(100)
		const contentAfterResume = getProjectedNode(store)?.content ?? ""

		expect(contentAfterReturn.length).toBeLessThan(pendingContent.length)
		expect(contentAfterResume.length).toBeGreaterThan(contentAfterReturn.length)
		expect(contentAfterResume.length).toBeLessThan(pendingContent.length)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("切回时已有 HTTP sync，等待权威快照后再恢复本地 draft。", () => {
		const store = createStore()
		const staleDraft = "stale draft".repeat(512)

		store.receiveChunk(createChunk({ content: staleDraft }))
		store.setActiveTopicId(TOPIC_B)
		const generation = store.beginTopicSync(TOPIC_A)
		const contentBeforeReturn = getProjectedNode(store)?.content ?? ""
		store.setActiveTopicId(TOPIC_A)
		advanceRendering(100)

		const contentWhileSyncing = getProjectedNode(store)?.content ?? ""
		expect(contentWhileSyncing.length).toBe(contentBeforeReturn.length)
		expect(staleDraft.startsWith(contentWhileSyncing)).toBe(true)
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)?.content).toBe(staleDraft)

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
		expect(store.getLatestMessageSeqId(TOPIC_A)).toBe("100")
		expect(getAssistantCards(store)).toHaveLength(1)
	})

	it("长时间离开期间 HTTP sync 失败后 instant settle 本地 draft，但保持 stream 未完成。", () => {
		const store = createStore()
		const localDraft = "local draft".repeat(512)

		store.receiveChunk(createChunk({ content: localDraft }))
		store.setActiveTopicId(TOPIC_B)
		vi.setSystemTime(new Date(`2026-01-01T00:00:${LONG_ABSENCE_MS / 1_000}.000Z`))
		const generation = store.beginTopicSync(TOPIC_A)
		const contentBeforeReturn = getProjectedNode(store)?.content ?? ""
		store.setActiveTopicId(TOPIC_A)
		advanceRendering(100)

		expect(getProjectedNode(store)?.content?.length).toBe(contentBeforeReturn.length)
		expect(
			store.completeTopicSync(TOPIC_A, generation, {
				succeeded: false,
				taskStatus: "running",
			}),
		).toBe(true)
		advanceRendering(1)

		expect(getProjectedNode(store)?.content).toBe(localDraft)
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)?.content).toBe(localDraft)
		expect(store.isTopicStreaming(TOPIC_A)).toBe(true)
	})

	it("HTTP 权威快照完成后只保留一张最新 Assistant 卡片。", () => {
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
		const cards = getAssistantCards(store)
		expect(cards).toHaveLength(1)
		expect(cards[0]).toMatchObject({
			app_message_id: `final-${CORRELATION_A}`,
			correlation_id: CORRELATION_A,
		})
	})

	it("terminal topic 切回后拒绝 finalized correlation 的晚到 chunk。", () => {
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
		expect(getAssistantCards(store)).toHaveLength(1)
	})

	it("后台 topic Final 后晚到 chunk 不产生可观察的重播或恢复。", () => {
		const store = createStore()
		const recoveries: unknown[] = []
		const unsubscribe = store.registerOnStreamRecoveryRequested((payload) =>
			recoveries.push(payload),
		)

		store.receiveChunk(createChunk({ content: "draft" }))
		store.setActiveTopicId(TOPIC_B)
		store.enqueueMessage(TOPIC_A, createFinalEnvelope({ content: "final" }))
		advanceRendering()
		store.receiveChunk(createChunk({ i: 1, content: " late" }))
		store.setActiveTopicId(TOPIC_A)
		advanceRendering(RECOVERY_WINDOW_MS)

		expect(getProjectedNode(store)?.content).toBe("final")
		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(recoveries).toHaveLength(0)
		unsubscribe()
	})

	it("setActiveTopicId(null) 只取消选中，保留已完成 topic 的 canonical 消息。", () => {
		const store = createStore()

		store.receiveChunk(createChunk({ content: "done", finishReason: "stop" }))
		advanceRendering()
		store.setActiveTopicId(null)
		vi.advanceTimersByTime(10_000)

		expect(store.getStreamState(TOPIC_A, CORRELATION_A)).toBeUndefined()
		expect(store.isTopicStreaming(TOPIC_A)).toBe(false)
		expect(getProjectedNode(store)?.content).toBe("done")
		expect(getAssistantCards(store)).toHaveLength(1)
	})

	it("同一 callback 的重复注册是独立订阅，并由各自 unsubscribe 管理。", () => {
		const store = createStore()
		const arrivedAppMessageIds: string[] = []
		const callback = ({ payload }: { payload: { message: { appMessageId?: string } } }) => {
			arrivedAppMessageIds.push(payload.message.appMessageId || "")
		}
		const unsubscribeFirst = store.subscribe("message.committed", callback, {
			scope: { topicId: TOPIC_A },
		})
		const unsubscribeSecond = store.subscribe("message.committed", callback, {
			scope: { topicId: TOPIC_A },
		})

		store.enqueueMessage(
			TOPIC_A,
			createFinalEnvelope({ appMessageId: "strict-mode-final", content: "once" }),
		)
		advanceRendering()

		expect(arrivedAppMessageIds).toEqual(["strict-mode-final", "strict-mode-final"])
		unsubscribeFirst()

		store.enqueueMessage(
			TOPIC_A,
			createFinalEnvelope({
				correlationId: "strict-mode-correlation-2",
				appMessageId: "strict-mode-final-2",
				seqId: "102",
				content: "second",
			}),
		)
		advanceRendering()

		expect(arrivedAppMessageIds).toEqual([
			"strict-mode-final",
			"strict-mode-final",
			"strict-mode-final-2",
		])
		unsubscribeSecond()

		store.enqueueMessage(
			TOPIC_A,
			createFinalEnvelope({
				correlationId: "strict-mode-correlation-3",
				appMessageId: "strict-mode-final-3",
				seqId: "103",
				content: "third",
			}),
		)
		advanceRendering()

		expect(arrivedAppMessageIds).toHaveLength(3)
	})
})
