import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SeqRecordType, type SeqRecord } from "@/apis/modules/chat/types"
import { messagesConverter } from "@/pages/superMagic/components/MessageList/helpers"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { superMagicStore } from "@/pages/superMagic/stores"
import type { MessageCommittedEvent } from "@/pages/superMagic/stores/events"
import type { RawSuperMagicMessageEnvelope } from "@/pages/superMagic/stores/types"
import { projectRevokedMessageBranches } from "@/pages/superMagic/utils/project-visible-messages-by-revoked-tail"
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
	super_message_id?: string
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

		expect(mockState.enqueueCalls).toHaveLength(0)
		expect(getNode(toSuperMessageId(correlationId))).toMatchObject({
			app_message_id: "assistant-ws-write",
			super_message_id: toSuperMessageId(correlationId),
			content: "canonical from WS pull",
		})
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
			createChunk({
				topicId: topic.chat_topic_id,
				correlationId,
				content: "draft pending",
			}),
		)
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeDefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(true)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))

		await triggerPersistentMessageEvent(topic)
		await settleStoreRendering()

		expect(getNode(toSuperMessageId(correlationId))).toMatchObject({
			content: "canonical settled",
			status: "finished",
		})
		expect(getNode(toSuperMessageId(correlationId))?.app_message_id).toBe("assistant-ws-settle")
		expect(
			getAssistantCards(topic.chat_topic_id, toSuperMessageId(correlationId)),
		).toMatchObject([{ app_message_id: "assistant-ws-settle" }])
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

		expect(getNode(toSuperMessageId(correlationId))).toMatchObject({
			app_message_id: "assistant-resident-poll",
			content: "persistent result from polling",
		})
		expect(
			getAssistantCards(topic.chat_topic_id, toSuperMessageId(correlationId)),
		).toMatchObject([{ app_message_id: "assistant-resident-poll" }])
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
			createChunk({
				topicId: topic.chat_topic_id,
				correlationId,
				content: "stalled draft",
			}),
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

		expect(getNode(toSuperMessageId(correlationId))).toMatchObject({
			app_message_id: "assistant-watchdog-owner",
			content: "recovered by watchdog owner",
		})
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

		expect(getNode(toSuperMessageId(correlationId))?.content).toBe(
			"finished authoritative snapshot",
		)
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
					{ isProcessing?: boolean } | undefined
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
			createChunk({
				topicId: topic.chat_topic_id,
				correlationId,
				content: "draft survives",
			}),
		)
		mockState.getMessagesByConversationId.mockRejectedValueOnce(new Error("first pull failed"))
		await triggerPersistentMessageEvent(topic)

		expect(getNode(toSuperMessageId(correlationId))?.content).toBe("draft survives")
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeDefined()

		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))
		await triggerPersistentMessageEvent(topic)
		await settleStoreRendering()

		expect(consoleErrorSpy).toHaveBeenCalled()
		expect(getNode(toSuperMessageId(correlationId))).toMatchObject({
			app_message_id: "assistant-ws-retry",
			content: "recovered on retry",
		})
		expect(superMagicStore.getStreamState(topic.chat_topic_id, correlationId)).toBeUndefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(false)
	})

	it("WS 以外层 chat_topic_id 路由，同时保留 Assistant 内层 Agent topic。", async () => {
		const topic = createTopic("outer-route")
		await renderInitializedTopic(topic)
		const innerAgentTopicId = "agent-inner-topic"
		const correlationId = "correlation-outer-route"
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			nodeTopicId: innerAgentTopicId,
			appMessageId: "assistant-outer-route",
			correlationId,
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
		expect(getNode(toSuperMessageId(correlationId))).toMatchObject({
			app_message_id: "assistant-outer-route",
			topic_id: innerAgentTopicId,
		})
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
		expect(mockState.enqueueCalls).toEqual([])
		expect(assistantCards).toHaveLength(1)
		expect(assistantCards[0]?.app_message_id).toBe("assistant-exactly-once")
		expect(arrivals.events).toHaveLength(1)
		expect(arrivals.events[0]).toMatchObject({
			type: "message.committed",
			payload: { message: { appMessageId: "assistant-exactly-once" } },
		})
		expect(superMagicStore.buffer.get(topic.chat_topic_id)?.messages ?? []).toHaveLength(0)
		expect(getNode(toSuperMessageId(correlationId))?.content).toBe("exactly once canonical")
		expect(getNode(toSuperMessageId(correlationId))?.app_message_id).toBe(
			"assistant-exactly-once",
		)
		arrivals.unsubscribe()
	})

	it("公共锚点尾部替换会移除跨 Tab 撤回后缺席的整轮 User/Assistant/Tool 分支。", async () => {
		const topic = createTopic("cross-tab-authoritative-tail")
		await renderInitializedTopic(topic)
		const prefix = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "stable-prefix",
			seqId: "100",
		})
		const removedUser = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-a-user",
			seqId: "200",
		})
		const removedAssistant = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-a-assistant",
			correlationId: "message-a-correlation",
			seqId: "201",
			content: "message A assistant",
		})
		const removedTool = createToolEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-a-tool",
			superMessageId: "message-a-tool-super",
			correlationId: "message-a-correlation",
			seqId: "202",
			toolId: "message-a-tool-id",
		})
		superMagicStore.initializeMessages(topic.chat_topic_id, [
			prefix,
			removedUser,
			removedAssistant,
			removedTool,
		])

		const messageB = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-b",
			seqId: "300",
		})
		mockState.getMessagesByConversationId.mockResolvedValueOnce({
			items: [messageB, prefix],
			has_more: true,
			page_token: "older-page",
		})

		await triggerPersistentMessageEvent(topic, 1, "300")

		const canonicalMessages = superMagicStore.messages.get(topic.chat_topic_id) ?? []
		const uiMessages = messagesConverter(Array.from(canonicalMessages))
		expect(canonicalMessages.map((message) => message.app_message_id)).toEqual([
			"stable-prefix",
			"message-b",
		])
		expect(uiMessages.map((message) => message?.app_message_id)).toEqual([
			"stable-prefix",
			"message-b",
		])
		expect(getNode(toSuperMessageId("message-a-correlation"))).toBeUndefined()
		expect(getNode("message-a-tool-super")).toBeUndefined()
		expect(
			superMagicStore.toolResponseMap.get(topic.chat_topic_id)?.get("message-a-tool-id"),
		).toBeUndefined()
	})

	it("HTTP tail 对账必须更新公共锚点之前的 User 撤回状态。", async () => {
		const topic = createTopic("authoritative-tail-status-before-anchor", TaskStatus.FINISHED)
		await renderInitializedTopic(topic)
		const prefix = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "stable-prefix",
			seqId: "100",
		})
		const revokedUser = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-c-user",
			seqId: "200",
			outerStatus: ConversationMessageStatus.Read,
		})
		const assistant = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-d-assistant",
			correlationId: "message-d-correlation",
			seqId: "201",
			content: "message D assistant",
		})
		superMagicStore.initializeMessages(topic.chat_topic_id, [prefix, revokedUser, assistant])

		const httpRevokedUser = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-c-user",
			seqId: "200",
			outerStatus: ConversationMessageStatus.Revoked,
		})
		const httpAssistant = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-d-assistant",
			correlationId: "message-d-correlation",
			seqId: "201",
			content: "message D assistant",
			outerStatus: ConversationMessageStatus.Read,
		})
		mockState.getMessagesByConversationId.mockResolvedValueOnce({
			items: [httpAssistant, httpRevokedUser, prefix],
			has_more: true,
			page_token: "older-page",
		})

		await triggerPersistentMessageEvent(topic)

		const canonicalMessages = superMagicStore.messages.get(topic.chat_topic_id) ?? []
		const canonicalUser = canonicalMessages.find(
			(message) => message.app_message_id === "message-c-user",
		)
		const projection = projectRevokedMessageBranches(canonicalMessages)
		expect(canonicalUser).toMatchObject({
			imStatus: ConversationMessageStatus.Revoked,
			status: ConversationMessageStatus.Revoked,
		})
		expect(projection.revokedBranchMessages.map((message) => message.app_message_id)).toEqual([
			"message-c-user",
			"message-d-assistant",
		])
	})

	it("权威尾部请求期间新产生的流保留，但请求开始前缺席的旧分支被移除。", async () => {
		const topic = createTopic("authoritative-tail-concurrent-stream")
		await renderInitializedTopic(topic)
		const prefix = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "stable-prefix",
			seqId: "100",
		})
		const removedUser = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "old-user",
			seqId: "200",
		})
		superMagicStore.initializeMessages(topic.chat_topic_id, [prefix, removedUser])
		superMagicStore.receiveChunk(
			createChunk({
				topicId: topic.chat_topic_id,
				correlationId: "old-stream",
				content: "old draft",
			}),
		)
		const response = createDeferred<ReturnType<typeof createResponse>>()
		mockState.getMessagesByConversationId.mockImplementationOnce(() => response.promise)
		const handler = mockState.pubsubHandlers.get("Super_Magic_New_Message_V2")
		if (!handler) throw new Error("persistent message handler was not registered")
		act(() => {
			handler({
				conversation_id: topic.chat_conversation_id,
				seq_id: "300",
				message: { topic_id: topic.chat_topic_id },
			})
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(200)
			await flushPromises()
		})
		expect(mockState.getMessagesByConversationId).toHaveBeenCalledTimes(1)
		superMagicStore.receiveChunk(
			createChunk({
				topicId: topic.chat_topic_id,
				correlationId: "new-stream",
				content: "new draft",
			}),
		)
		expect(
			superMagicStore.getStreamState(topic.chat_topic_id, toSuperMessageId("new-stream")),
		).toBeDefined()
		const messageB = createUserEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "message-b",
			seqId: "300",
		})
		response.resolve({
			items: [messageB, prefix],
			has_more: true,
			page_token: "older-page",
		})
		await act(async () => {
			await flushPromises()
		})

		// The HTTP tail is committed through the coordinated status/membership entry;
		// assert its observable membership result instead of coupling the test to the
		// internal Store method used to apply that atomic write.
		expect(
			(superMagicStore.messages.get(topic.chat_topic_id) || []).map(
				(message) => message.app_message_id,
			),
		).toEqual(["stable-prefix", "super-new-stream", "message-b"])
		expect(
			superMagicStore.getStreamState(topic.chat_topic_id, toSuperMessageId("old-stream")),
		).toBeUndefined()
		expect(
			superMagicStore.getStreamState(topic.chat_topic_id, toSuperMessageId("new-stream")),
		).toBeDefined()
		expect(getNode(toSuperMessageId("old-stream"))).toBeUndefined()
		expect(getNode(toSuperMessageId("new-stream"))).toBeDefined()
		expect(
			superMagicStore.getStreamState(topic.chat_topic_id, toSuperMessageId("new-stream"))
				?.content,
		).toBe("new draft")
	})

	it("增量 HTTP 明确撤回活动 Assistant 时立即更新状态、终止旧流并只提交一次。", async () => {
		const topic = createTopic("http-revoke-active-stream")
		await renderInitializedTopic(topic)
		const correlationId = "correlation-http-revoke-active-stream"
		const superMessageId = toSuperMessageId(correlationId)
		const envelope = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-http-revoke-active-stream",
			correlationId,
			seqId: "180",
			content: "revoked canonical content",
			outerStatus: ConversationMessageStatus.Revoked,
		})
		const arrivals = collectArrivals(topic.chat_topic_id)

		superMagicStore.receiveChunk(
			createChunk({ topicId: topic.chat_topic_id, correlationId, content: "revoked draft" }),
		)
		expect(superMagicStore.getStreamState(topic.chat_topic_id, superMessageId)).toBeDefined()
		mockState.getMessagesByConversationId.mockResolvedValueOnce(createResponse([envelope]))

		await triggerPersistentMessageEvent(topic)

		const canonicalCard = (superMagicStore.messages.get(topic.chat_topic_id) ?? []).find(
			(message) =>
				message.role === "assistant" && message.super_message_id === superMessageId,
		)
		expect(canonicalCard).toMatchObject({
			app_message_id: "assistant-http-revoke-active-stream",
			super_message_id: superMessageId,
			seq_id: "180",
			status: ConversationMessageStatus.Revoked,
		})
		expect(superMagicStore.getStreamState(topic.chat_topic_id, superMessageId)).toBeUndefined()
		expect(superMagicStore.isTopicStreaming(topic.chat_topic_id)).toBe(false)
		expect(arrivals.events).toHaveLength(1)
		expect(arrivals.events[0]).toMatchObject({
			payload: {
				message: {
					appMessageId: "assistant-http-revoke-active-stream",
					logicalMessageId: superMessageId,
					seqId: "180",
					status: ConversationMessageStatus.Revoked,
				},
			},
		})
		arrivals.unsubscribe()
	})

	it("WS 只作为通知时，增量 HTTP 仍能恢复已有消息状态且不删除窗口外消息。", async () => {
		const topic = createTopic("http-status-reconciliation", TaskStatus.FINISHED)
		await renderInitializedTopic(topic)
		const targetCorrelationId = "correlation-http-status-target"
		const historicalCorrelationId = "correlation-http-status-historical"
		const targetRevoked = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-http-status-target",
			correlationId: targetCorrelationId,
			seqId: "200",
			content: "target canonical content",
			outerStatus: ConversationMessageStatus.Revoked,
		})
		const targetRestored = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-http-status-target",
			correlationId: targetCorrelationId,
			seqId: "200",
			content: "stale duplicate content",
			outerStatus: ConversationMessageStatus.Read,
		})
		const historical = createAssistantEnvelope({
			topicId: topic.chat_topic_id,
			appMessageId: "assistant-http-status-historical",
			correlationId: historicalCorrelationId,
			seqId: "100",
			content: "outside incremental window",
		})
		superMagicStore.initializeMessages(topic.chat_topic_id, [historical, targetRevoked])

		mockState.getMessagesByConversationId.mockResolvedValueOnce(
			createResponse([targetRestored]),
		)
		await triggerPersistentMessageEvent(topic)

		const messageRecords = superMagicStore.messages.get(topic.chat_topic_id) ?? []
		expect(messageRecords).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					app_message_id: "assistant-http-status-historical",
				}),
				expect.objectContaining({
					app_message_id: "assistant-http-status-target",
					status: ConversationMessageStatus.Revoked,
					imStatus: ConversationMessageStatus.Revoked,
					superStatus: "finished",
				}),
			]),
		)
		expect(getNode(toSuperMessageId(targetCorrelationId))?.content).toBe(
			"target canonical content",
		)

		superMagicStore.authorizeImStatusRestore(topic.chat_topic_id)
		mockState.getMessagesByConversationId.mockResolvedValueOnce(
			createResponse([targetRestored]),
		)
		await triggerPersistentMessageEvent(topic)

		expect(
			(superMagicStore.messages.get(topic.chat_topic_id) ?? []).find(
				(message) => message.app_message_id === "assistant-http-status-target",
			),
		).toMatchObject({
			status: ConversationMessageStatus.Read,
			imStatus: ConversationMessageStatus.Read,
			superStatus: "finished",
		})
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

async function triggerPersistentMessageEvent(
	topic: Topic,
	times = 1,
	seqId?: string,
): Promise<void> {
	const handler = mockState.pubsubHandlers.get("Super_Magic_New_Message_V2")
	if (!handler) throw new Error("persistent message handler was not registered")
	act(() => {
		for (let index = 0; index < times; index += 1) {
			handler({
				conversation_id: topic.chat_conversation_id,
				...(seqId ? { seq_id: seqId } : {}),
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
			super_message_id: toSuperMessageId(correlationId),
			task_id: `task-${correlationId}`,
			i: 0,
			usage: null,
			correlation_id: correlationId,
			choices: [
				{
					...({ index: 0 } as const),
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
	outerStatus = ConversationMessageStatus.Read,
}: {
	topicId: string
	nodeTopicId?: string
	appMessageId: string
	correlationId: string
	seqId: string
	content: string
	outerStatus?: ConversationMessageStatus
}): RawSuperMagicMessageEnvelope {
	const node: SuperMagicNode = {
		role: "assistant",
		topic_id: nodeTopicId,
		message_id: `node-${appMessageId}`,
		super_message_id: toSuperMessageId(correlationId),
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
				status: outerStatus,
				unread_count: 0,
				topic_id: topicId,
				type: ConversationMessageType.SuperMagicMessage,
				super_magic_message: node,
			},
		},
	} satisfies SeqRecord<SuperMagicConversationMessageV2>

	return envelope as unknown as RawSuperMagicMessageEnvelope
}

function createUserEnvelope({
	topicId,
	appMessageId,
	seqId,
	outerStatus = ConversationMessageStatus.Read,
}: {
	topicId: string
	appMessageId: string
	seqId: string
	outerStatus?: ConversationMessageStatus
}): RawSuperMagicMessageEnvelope {
	const node: SuperMagicNode = {
		role: "user",
		topic_id: topicId,
		message_id: `node-${appMessageId}`,
		super_message_id: appMessageId,
		content: appMessageId,
		reasoning_content: null,
		tool_calls: [],
		status: "finished",
		send_timestamp: Number(seqId),
	}
	return createNodeEnvelope({ topicId, appMessageId, seqId, node, outerStatus })
}

function createToolEnvelope({
	topicId,
	appMessageId,
	superMessageId,
	correlationId,
	seqId,
	toolId,
}: {
	topicId: string
	appMessageId: string
	superMessageId: string
	correlationId: string
	seqId: string
	toolId: string
}): RawSuperMagicMessageEnvelope {
	const node = {
		role: "tool",
		topic_id: topicId,
		message_id: `node-${appMessageId}`,
		super_message_id: superMessageId,
		correlation_id: correlationId,
		content: null,
		reasoning_content: null,
		tool_calls: null,
		tool_call_id: toolId,
		tool: { id: toolId, name: "read_file", status: "finished" },
		status: "finished",
		send_timestamp: Number(seqId),
	} as SuperMagicNode
	return createNodeEnvelope({ topicId, appMessageId, seqId, node })
}

function createNodeEnvelope({
	topicId,
	appMessageId,
	seqId,
	node,
	outerStatus = ConversationMessageStatus.Read,
}: {
	topicId: string
	appMessageId: string
	seqId: string
	node: SuperMagicNode
	outerStatus?: ConversationMessageStatus
}): RawSuperMagicMessageEnvelope {
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
				sender_id:
					node.role === "user" ? "user-hook-integration" : "assistant-hook-integration",
				send_time: Number(seqId),
				status: outerStatus,
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

function toSuperMessageId(correlationId: string): string {
	return `super-${correlationId}`
}

function getNode(superMessageId: string): ProjectedNode | undefined {
	const node = superMagicStore.getMessageNode(superMessageId)
	return node && typeof node === "object" ? (node as ProjectedNode) : undefined
}

function getAssistantCards(topicId: string, superMessageId: string): ProjectedNode[] {
	return messagesConverter(Array.from(superMagicStore.messages.get(topicId) ?? [])).filter(
		(message) => message?.role === "assistant" && message?.super_message_id === superMessageId,
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
