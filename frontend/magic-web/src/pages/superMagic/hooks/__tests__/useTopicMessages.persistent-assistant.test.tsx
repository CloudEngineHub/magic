import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { messagesConverter } from "@/pages/superMagic/components/MessageList/helpers"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { superMagicStore } from "@/pages/superMagic/stores"
import type { MessageCommittedEvent } from "@/pages/superMagic/stores/events"
import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"
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
import { useTopicMessages } from "../useTopicMessages"

interface RecoveryOwnerRegistration {
	ownerToken: symbol
	topicId: string
	conversationId: string
	getTaskStatus: () => string | undefined
	recover: (context: {
		topicId: string
		conversationId: string
		correlationId: string
		syncGeneration: number
	}) => Promise<{ didPullSucceed: boolean }>
}

interface ProjectedNode {
	app_message_id?: string
	role?: string
	topic_id?: string
	correlation_id?: string
	content?: string | null
	status?: string
}

const mockState = vi.hoisted(() => ({
	getMessagesByConversationId: vi.fn(),
	pubsubHandlers: new Map<string, (data: unknown) => void>(),
	recoveryOwner: undefined as unknown,
	useRealRecoveryCoordinator: true,
	enqueueCalls: [] as Array<{ topicId: string; envelope: unknown }>,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMessagesByConversationId: mockState.getMessagesByConversationId,
	},
}))

vi.mock("@/pages/superMagic/stores", async () => {
	const actual = await vi.importActual<typeof import("@/pages/superMagic/stores")>(
		"@/pages/superMagic/stores",
	)
	const realStore = new actual.SuperMagicStore()
	const storeBridge = Object.create(realStore) as typeof realStore
	Object.defineProperty(storeBridge, "enqueueMessage", {
		configurable: true,
		value: (topicId: string, envelope: Parameters<typeof realStore.enqueueMessage>[1]) => {
			mockState.enqueueCalls.push({ topicId, envelope })
			return realStore.enqueueMessage(topicId, envelope)
		},
	})
	return {
		...actual,
		// The bridge records the Hook boundary, while inherited MobX actions remain bound to realStore.
		superMagicStore: storeBridge,
	}
})

vi.mock("@/pages/superMagic/services/streamRecoveryCoordinator", async () => {
	const actual = await vi.importActual<
		typeof import("@/pages/superMagic/services/streamRecoveryCoordinator")
	>("@/pages/superMagic/services/streamRecoveryCoordinator")
	return {
		...actual,
		registerStreamRecoveryOwner: vi.fn((registration: RecoveryOwnerRegistration) => {
			mockState.recoveryOwner = registration
			if (!mockState.useRealRecoveryCoordinator) return vi.fn()
			// Preserve the real singleton coordinator so Store watchdog requests traverse the production path.
			return actual.registerStreamRecoveryOwner(registration)
		}),
	}
})

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn((event: string, callback: (data: unknown) => void) => {
			mockState.pubsubHandlers.set(event, callback)
		}),
		unsubscribe: vi.fn((event: string, callback?: (data: unknown) => void) => {
			if (!callback || mockState.pubsubHandlers.get(event) === callback) {
				mockState.pubsubHandlers.delete(event)
			}
		}),
	},
	PubSubEvents: {
		Super_Magic_New_Message_V2: "Super_Magic_New_Message_V2",
		Refresh_Topic_Messages: "Refresh_Topic_Messages",
	},
}))

describe("useTopicMessages / persistent Assistant black-box integration", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(0)
		vi.clearAllMocks()
		mockState.getMessagesByConversationId.mockReset()
		mockState.getMessagesByConversationId.mockImplementation(() => new Promise(() => undefined))
		mockState.pubsubHandlers.clear()
		mockState.recoveryOwner = undefined
		mockState.useRealRecoveryCoordinator = true
		mockState.enqueueCalls.length = 0
		superMagicStore.setActiveTopicId(null)
	})

	afterEach(() => {
		vi.clearAllTimers()
		vi.useRealTimers()
		vi.restoreAllMocks()
	})

	it("WS 持久消息事件最终把完整 Assistant envelope 写入实时 Store。", async () => {
		const topic = createTopic("ws-write")
		await renderInitializedTopic(topic)
		const correlationId = "correlation-ws-write"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-ws-write",
			correlationId,
			seqId: "100",
			content: "canonical from WS pull",
		})
		superMagicStore.receiveChunk(
			createChunk({ topicId: topic.chat_topic_id, correlationId, content: "draft" }),
		)
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeDefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(true)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))
		await triggerPersistentMessageEvent(topic)
		await settleStoreRendering()

		expect(mockState.enqueueCalls).toHaveLength(1)
		expect(mockState.enqueueCalls[0]).toEqual({ topicId: topic.chat_topic_id, envelope })
		expect(mockState.enqueueCalls[0]?.envelope).toBe(envelope)
		expect(getNode("assistant-ws-write")?.content).toBe("canonical from WS pull")
		expect(getNode(correlationId)?.content).toBe("canonical from WS pull")
	})

	it("WS 回拉到持久 Assistant 后用 canonical 替换 draft 并结束对应 StreamState。", async () => {
		const topic = createTopic("ws-settle")
		await renderInitializedTopic(topic)
		const residentTimerCount = vi.getTimerCount()
		const correlationId = "correlation-ws-settle"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-ws-settle",
			correlationId,
			seqId: "110",
			content: "canonical settled",
		})

		superMagicStore.receiveChunk(
			createChunk({ topicId: topic.chat_topic_id, correlationId, content: "draft pending" }),
		)
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeDefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(true)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))

		await triggerPersistentMessageEvent(topic)
		await settleStoreRendering()

		expect(getNode(correlationId)).toMatchObject({
			content: "canonical settled",
			status: "finished",
		})
		expect(getNode("assistant-ws-settle")?.content).toBe("canonical settled")
		expect(getAssistantCards(topic.chat_topic_id, correlationId)).toMatchObject([
			{ app_message_id: "assistant-ws-settle" },
		])
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeUndefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(false)
		expect(superMagicStore.topicMeta.get(topic.chat_topic_id)?.timer).toBeNull()
		expect(superMagicStore.topicMeta.get(topic.chat_topic_id)?.recoveryTimer).toBeNull()
		expect(vi.getTimerCount()).toBe(residentTimerCount)
	})

	it("chunk finish_reason 已到但 WS 事件丢失时，常驻轮询最终补回持久 Assistant。", async () => {
		const topic = createTopic("resident-poll", TaskStatus.RUNNING)
		await renderInitializedTopic(topic)
		const correlationId = "correlation-resident-poll"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-resident-poll",
			correlationId,
			seqId: "120",
			content: "persistent result from polling",
		})

		superMagicStore.receiveChunk(
			createChunk({
				topicId: topic.chat_topic_id,
				correlationId,
				content: "animated result",
				finishReason: "stop",
			}),
		)
		await settleStoreRendering()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(false)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))

		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await flushPromises()
		})
		await settleStoreRendering()

		expect(getNode("assistant-resident-poll")?.content).toBe("persistent result from polling")
		expect(getAssistantCards(topic.chat_topic_id, correlationId)).toMatchObject([
			{ app_message_id: "assistant-resident-poll" },
		])
	})

	it("active stream 跳过常驻轮询时，真实 watchdog coordinator 接管并只回拉一次。", async () => {
		const topic = createTopic("watchdog-owner", TaskStatus.RUNNING)
		await renderInitializedTopic(topic)
		const correlationId = "correlation-watchdog-owner"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-watchdog-owner",
			correlationId,
			seqId: "125",
			content: "recovered by watchdog owner",
		})
		const recoveryResponse = createDeferred<ReturnType<typeof createResponse>>()

		superMagicStore.receiveChunk(
			createChunk({ topicId: topic.chat_topic_id, correlationId, content: "stalled draft" }),
		)
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeDefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(true)
		mockState.getMessagesByConversationId.mockReturnValueOnce(recoveryResponse.promise)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(4_999)
			await flushPromises()
		})
		expect(mockState.getMessagesByConversationId).not.toHaveBeenCalled()

		await act(async () => {
			// SLA is covered by the timer-state test; this integration test isolates owner routing.
			await vi.advanceTimersByTimeAsync(2_501)
			await flushPromises()
		})
		expect(mockState.getMessagesByConversationId).toHaveBeenCalledTimes(1)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(35_000)
			await flushPromises()
		})
		// While watchdog HTTP is in flight, resident polling must remain skipped for the active stream.
		expect(mockState.getMessagesByConversationId).toHaveBeenCalledTimes(1)

		recoveryResponse.resolve(createResponse([envelope]))
		await act(async () => {
			await flushPromises()
		})
		await settleStoreRendering()

		expect(getNode("assistant-watchdog-owner")?.content).toBe("recovered by watchdog owner")
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeUndefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(false)
	})

	it("task 已 FINISHED 但仍 missing Final 时，finished polling 提交权威快照并清空本地流状态。", async () => {
		const runningTopic = createTopic("finished-barrier", TaskStatus.RUNNING)
		// This contract targets the RUNNING -> FINISHED polling barrier, independently of watchdog recovery.
		mockState.useRealRecoveryCoordinator = false
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([]))
		const rendered = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{ initialProps: { selectedTopic: runningTopic } },
		)
		await act(async () => {
			await flushPromises()
		})
		mockState.getMessagesByConversationId.mockClear()
		const correlationId = "correlation-finished-barrier"
		const envelope = createAssistantEnvelope({
			topicId: runningTopic.chat_topic_id,
			appMessageId: "assistant-finished-barrier",
			correlationId,
			seqId: "130",
			content: "finished authoritative snapshot",
		})

		superMagicStore.receiveChunk(
			createChunk({
				topicId: runningTopic.chat_topic_id,
				correlationId,
				content: "unfinished local draft",
			}),
		)
		expect(
			superMagicStore.getStreamState(runningTopic.chat_topic_id, correlationId),
		).toBeDefined()
		expect(superMagicStore.isTopicStreaming(runningTopic.chat_topic_id)).toBe(true)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))
		rendered.rerender({
			selectedTopic: { ...runningTopic, task_status: TaskStatus.FINISHED },
		})

		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await flushPromises()
		})
		await settleStoreRendering()

		expect(getNode(correlationId)?.content).toBe("finished authoritative snapshot")
		expect(
			superMagicStore.getStreamState(runningTopic.chat_topic_id, correlationId),
		).toBeUndefined()
		expect(superMagicStore.isTopicStreaming(runningTopic.chat_topic_id)).toBe(false)
		expect(superMagicStore.topicMeta.get(runningTopic.chat_topic_id)).toMatchObject({
			isStream: false,
			isStreamLoading: false,
			timer: null,
			recoveryTimer: null,
		})
		expect(superMagicStore.buffer.get(runningTopic.chat_topic_id)?.messages ?? []).toHaveLength(
			0,
		)
		expect(
			(
				superMagicStore.buffer.get(runningTopic.chat_topic_id) as
					| { isProcessing?: boolean }
					| undefined
			)?.isProcessing ?? false,
		).toBe(false)
	})

	it("第一次 WS 增量回拉失败后保留 draft，第二次事件成功补回 Assistant 并结束 streaming。", async () => {
		const topic = createTopic("ws-retry")
		await renderInitializedTopic(topic)
		const correlationId = "correlation-ws-retry"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-ws-retry",
			correlationId,
			seqId: "140",
			content: "recovered on retry",
		})
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

		superMagicStore.receiveChunk(
			createChunk({ topicId: topic.chat_topic_id, correlationId, content: "draft survives" }),
		)
		mockState.getMessagesByConversationId.mockRejectedValueOnce(new Error("first pull failed"))
		await triggerPersistentMessageEvent(topic)

		expect(getNode(correlationId)?.content).toBe("draft survives")
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeDefined()

		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))
		await triggerPersistentMessageEvent(topic)
		await settleStoreRendering()

		expect(consoleErrorSpy).toHaveBeenCalled()
		expect(getNode("assistant-ws-retry")?.content).toBe("recovered on retry")
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeUndefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(false)
	})

	it("WS 以外层 chat_topic_id 路由，同时保留 Assistant 内层 Agent topic。", async () => {
		const topic = createTopic("outer-route")
		await renderInitializedTopic(topic)
		const innerAgentTopicId = "agent-inner-topic"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			nodeTopicId: innerAgentTopicId,
			appMessageId: "assistant-outer-route",
			correlationId: "correlation-outer-route",
			seqId: "150",
			content: "routed by outer topic",
		})
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))

		await triggerPersistentMessageEvent(topic)
		await settleStoreRendering()

		expect(
			superMagicStore.messages
				.get(topic.chat_topic_id)
				?.some((message) => message.app_message_id === "assistant-outer-route"),
		).toBe(true)
		expect(getNode("assistant-outer-route")?.topic_id).toBe(innerAgentTopicId)
		expect(superMagicStore.messages.get(innerAgentTopicId)).toBeUndefined()
	})

	it("完整 chunk、WS、HTTP 和 Store 结算只产生一张 Assistant 卡与一次 arrived 事件。", async () => {
		const topic = createTopic("exactly-once")
		await renderInitializedTopic(topic)
		const correlationId = "correlation-exactly-once"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-exactly-once",
			correlationId,
			seqId: "160",
			content: "exactly once canonical",
		})
		const arrivals = collectArrivals(topic.chat_topic_id)

		superMagicStore.receiveChunk(
			createChunk({ topicId: topic.chat_topic_id, correlationId, content: "draft" }),
		)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))
		await triggerPersistentMessageEvent(topic, 2)
		await settleStoreRendering()

		const assistantCards = messagesConverter(
			Array.from(superMagicStore.messages.get(topic.chat_topic_id) ?? []),
		).filter(
			(message) => message?.role === "assistant" && message?.correlation_id === correlationId,
		)
		expect(mockState.getMessagesByConversationId).toHaveBeenCalledTimes(1)
		expect(mockState.enqueueCalls).toEqual([{ topicId: topic.chat_topic_id, envelope }])
		expect(assistantCards).toHaveLength(1)
		expect(assistantCards[0]?.app_message_id).toBe("assistant-exactly-once")
		expect(arrivals.events).toHaveLength(1)
		expect(arrivals.events[0]).toMatchObject({
			type: "message.committed",
			payload: { message: { appMessageId: "assistant-exactly-once" } },
		})
		expect(superMagicStore.buffer.get(topic.chat_topic_id)?.messages ?? []).toHaveLength(0)
		expect(getNode(correlationId)?.content).toBe("exactly once canonical")
		expect(getNode("assistant-exactly-once")?.content).toBe("exactly once canonical")
		arrivals.unsubscribe()
	})
})

async function renderInitializedTopic(topic: Topic) {
	mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([]))
	const rendered = renderHook(() => useTopicMessages({ selectedTopic: topic }))
	await act(async () => {
		await flushPromises()
	})
	mockState.getMessagesByConversationId.mockClear()
	return rendered
}

async function triggerPersistentMessageEvent(topic: Topic, times = 1): Promise<void> {
	const handler = mockState.pubsubHandlers.get("Super_Magic_New_Message_V2")
	if (!handler) throw new Error("persistent message handler was not registered")
	act(() => {
		for (let index = 0; index < times; index += 1) {
			handler({
				conversation_id: topic.chat_conversation_id,
				message: { topic_id: topic.chat_topic_id },
			})
		}
	})
	await act(async () => {
		await vi.advanceTimersByTimeAsync(250)
		await flushPromises()
	})
}

async function settleStoreRendering(milliseconds = 2_500): Promise<void> {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(milliseconds)
		await flushPromises()
	})
}

async function flushPromises(): Promise<void> {
	await Promise.resolve()
	await Promise.resolve()
	await Promise.resolve()
}

function createDeferred<T>(): {
	promise: Promise<T>
	resolve: (value: T) => void
} {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((resolvePromise) => {
		resolve = resolvePromise
	})
	return { promise, resolve }
}

function createTopic(suffix: string, taskStatus = TaskStatus.RUNNING): Topic {
	return {
		id: `topic-${suffix}`,
		topic_name: `Topic ${suffix}`,
		chat_topic_id: `chat-topic-${suffix}`,
		chat_conversation_id: `conversation-${suffix}`,
		task_status: taskStatus,
	} as Topic
}

function createChunk({
	topicId,
	correlationId,
	content,
	finishReason = null,
}: {
	topicId: string
	correlationId: string
	content: string
	finishReason?: SuperMagicChunkMessage["super_magic_chunk"]["choices"][number]["finish_reason"]
}): SuperMagicChunkMessage {
	return {
		magic_message_id: `magic-chunk-${correlationId}`,
		app_message_id: `app-chunk-${correlationId}`,
		type: IntermediateMessageType.SuperMagicChunk,
		project_id: "project-hook-integration",
		topic_id: topicId,
		chat_topic_id: topicId,
		message_id: `completion-${correlationId}`,
		super_magic_chunk: {
			i: 0,
			usage: null,
			correlation_id: correlationId,
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

function createAssistantEnvelope({
	topicId,
	nodeTopicId = topicId,
	appMessageId,
	correlationId,
	seqId,
	content,
}: {
	topicId: string
	nodeTopicId?: string
	appMessageId: string
	correlationId: string
	seqId: string
	content: string
}): RawSuperMagicMessageEnvelope {
	const node: SuperMagicNode = {
		role: "assistant",
		topic_id: nodeTopicId,
		message_id: `node-${appMessageId}`,
		correlation_id: correlationId,
		content,
		reasoning_content: null,
		tool_calls: [],
		status: "finished",
		send_timestamp: Number(seqId),
	}
	const envelope = {
		type: SeqRecordType.seq,
		seq: {
			magic_id: "magic-hook-integration",
			seq_id: seqId,
			message_id: `server-${seqId}-${appMessageId}`,
			refer_message_id: "",
			sender_message_id: "",
			conversation_id: `conversation-${topicId}`,
			organization_code: "organization-hook-integration",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				sender_id: "assistant-hook-integration",
				send_time: Number(seqId),
				status: ConversationMessageStatus.Read,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createResponse(items: RawSuperMagicMessageEnvelope[]) {
	return { items, has_more: false, page_token: "" }
}

function getNode(id: string): ProjectedNode | undefined {
	const node = superMagicStore.getMessageNode(id)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function getAssistantCards(topicId: string, correlationId: string): ProjectedNode[] {
	return messagesConverter(Array.from(superMagicStore.messages.get(topicId) ?? [])).filter(
		(message) => message?.role === "assistant" && message?.correlation_id === correlationId,
	) as ProjectedNode[]
}

function collectArrivals(topicId: string): {
	events: MessageCommittedEvent[]
	unsubscribe: () => void
} {
	const events: MessageCommittedEvent[] = []
	const unsubscribe = superMagicStore.subscribe(
		"message.committed",
		(event) => events.push(event),
		{ scope: { topicId } },
	)
	return { events, unsubscribe }
}
