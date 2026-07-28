import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useTopicMessages } from "../useTopicMessages"

const mockState = vi.hoisted(() => ({
	nextSyncGeneration: 1,
	getMessagesByConversationIdMock: vi.fn(),
	registerStreamRecoveryOwnerMock: vi.fn(),
	pubsubHandlers: new Map<string, (data: any) => void>(),
	superMagicStoreMock: {
		messages: new Map<string, unknown[]>(),
		buffer: new Map<string, { messages: unknown[] }>(),
		topicMeta: new Map<
			string,
			{
				isStream?: boolean
				isStreamLoading?: boolean
				syncState?: "idle" | "syncing"
				syncGeneration?: number
			}
		>(),
		beginTopicSync: vi.fn(() => mockState.nextSyncGeneration++),
		isTopicSyncCurrent: vi.fn(() => true),
		completeTopicSync: vi.fn(() => true),
		cancelTopicSync: vi.fn(),
		getLatestMessageSeqId: vi.fn(() => "assistant-seq-1"),
		initializeMessages: vi.fn((topicId: string, items: unknown[]) => {
			mockState.superMagicStoreMock.messages.set(topicId, items)
		}),
		enqueueMessage: vi.fn(),
		setActiveTopicId: vi.fn(),
		isTopicStreaming: vi.fn(() => false),
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMessagesByConversationId: mockState.getMessagesByConversationIdMock,
	},
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: mockState.superMagicStoreMock,
}))

vi.mock("@/pages/superMagic/services/streamRecoveryCoordinator", () => ({
	registerStreamRecoveryOwner: mockState.registerStreamRecoveryOwnerMock,
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn((event: string, callback: (data: any) => void) => {
			mockState.pubsubHandlers.set(event, callback)
		}),
		unsubscribe: vi.fn((event: string, callback?: (data: any) => void) => {
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

describe("useTopicMessages", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.registerStreamRecoveryOwnerMock.mockReset()
		mockState.nextSyncGeneration = 1
		mockState.superMagicStoreMock.beginTopicSync.mockImplementation(
			() => mockState.nextSyncGeneration++,
		)
		mockState.superMagicStoreMock.isTopicSyncCurrent.mockReturnValue(true)
		mockState.superMagicStoreMock.completeTopicSync.mockReturnValue(true)
		mockState.superMagicStoreMock.messages = new Map()
		mockState.superMagicStoreMock.buffer = new Map()
		mockState.superMagicStoreMock.topicMeta = new Map()
		mockState.superMagicStoreMock.isTopicStreaming.mockReturnValue(false)
		mockState.pubsubHandlers.clear()
		mockState.registerStreamRecoveryOwnerMock.mockReturnValue(vi.fn())
		mockState.getMessagesByConversationIdMock.mockImplementation(
			() => new Promise(() => undefined),
		)
	})

	afterEach(() => {
		vi.useRealTimers()
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
	})

	it("resets initial readiness synchronously when refresh restores a topic", () => {
		const { result, rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic | null }) =>
				useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: null,
				},
			},
		)

		act(() => {
			rerender({
				selectedTopic: createTopic(),
			})
		})

		expect(result.current.isMessagesInitialLoading).toBe(true)
		expect(result.current.isSelectedTopicMessagesReady).toBe(false)
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledWith(
			expect.objectContaining({
				chat_topic_id: "chat-topic-1",
				conversation_id: "conversation-1",
				order: "desc",
			}),
		)
	})

	it("reports a finished completion barrier after resident polling succeeds without a tool response", async () => {
		vi.useFakeTimers()
		const initialResponse = { items: [], has_more: false, page_token: "" }
		const firstPollingResponse = {
			items: [createMessageEnvelope("newer", "2")],
			has_more: true,
			page_token: "page-2",
		}
		const finalPollingResponse = {
			items: [createMessageEnvelope("older", "1")],
			has_more: false,
			page_token: "",
		}
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(initialResponse)

		const { rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
				},
			},
		)

		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
		mockState.getMessagesByConversationIdMock.mockClear()
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()
		mockState.superMagicStoreMock.cancelTopicSync.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		let resolveFirstPollingRequest: ((value: typeof firstPollingResponse) => void) | undefined
		let resolveFinalPollingRequest: ((value: typeof finalPollingResponse) => void) | undefined
		mockState.getMessagesByConversationIdMock
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFirstPollingRequest = resolve
					}),
			)
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						resolveFinalPollingRequest = resolve
					}),
			)

		rerender({
			selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
		})
		// Topic 状态变化本身不是 HTTP 完成屏障；必须等待本轮轮询成功后再通知 Store。
		expect(mockState.superMagicStoreMock.beginTopicSync).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenLastCalledWith(
			expect.objectContaining({
				chat_topic_id: "chat-topic-1",
				conversation_id: "conversation-1",
				limit: 30,
				order: "desc",
			}),
		)
		expect(mockState.superMagicStoreMock.beginTopicSync).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.beginTopicSync).toHaveBeenCalledWith("chat-topic-1")
		const pollingGeneration =
			mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(pollingGeneration).toEqual(expect.any(Number))
		// 请求成功前不能把 topic 状态本身误当成完成屏障。
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
		})
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.beginTopicSync).toHaveBeenCalledTimes(1)

		await act(async () => {
			resolveFirstPollingRequest?.(firstPollingResponse)
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(2)
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ page_token: "page-2", limit: 30 }),
		)
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()

		await act(async () => {
			resolveFinalPollingRequest?.(finalPollingResponse)
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			[...firstPollingResponse.items, ...finalPollingResponse.items],
			{ mode: "replace", syncGeneration: pollingGeneration },
		)

		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			pollingGeneration,
			expect.objectContaining({
				succeeded: true,
				taskStatus: TaskStatus.FINISHED,
			}),
		)
	})

	it("fails finished polling without committing a partial authoritative snapshot", async () => {
		vi.useFakeTimers()
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: false,
			page_token: "",
		})
		const { rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
				},
			},
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({
				items: [createMessageEnvelope("partial", "2")],
				has_more: true,
				page_token: "page-2",
			})
			.mockRejectedValueOnce(new Error("finished polling second page failed"))
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()

		rerender({ selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }) })
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await Promise.resolve()
			await Promise.resolve()
		})

		const generation = mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			generation,
			expect.objectContaining({ succeeded: false, taskStatus: TaskStatus.FINISHED }),
		)
		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it("ignores a late finished polling response after the same topic resumes running", async () => {
		vi.useFakeTimers()
		const emptyPollingResponse = {
			items: [],
			has_more: false,
			page_token: "",
		}
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(emptyPollingResponse)

		const { rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
				},
			},
		)

		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.getMessagesByConversationIdMock.mockClear()
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()
		mockState.superMagicStoreMock.cancelTopicSync.mockClear()
		let resolvePollingRequest: ((value: typeof emptyPollingResponse) => void) | undefined
		mockState.getMessagesByConversationIdMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolvePollingRequest = resolve
				}),
		)

		rerender({
			selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
		})

		const pollingGeneration =
			mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(pollingGeneration).toEqual(expect.any(Number))
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()

		rerender({
			selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
		})
		expect(mockState.superMagicStoreMock.cancelTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			pollingGeneration,
		)

		await act(async () => {
			resolvePollingRequest?.(emptyPollingResponse)
			await Promise.resolve()
		})

		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()
	})

	it("does not start a finished polling generation while another topic sync is active", async () => {
		vi.useFakeTimers()
		const emptyPollingResponse = {
			items: [],
			has_more: false,
			page_token: "",
		}
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(emptyPollingResponse)

		const { rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
				},
			},
		)

		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.getMessagesByConversationIdMock.mockClear()
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()
		mockState.superMagicStoreMock.topicMeta.set("other-chat-topic", {
			syncState: "syncing",
			syncGeneration: 99,
		})

		rerender({
			selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
		})

		expect(mockState.getMessagesByConversationIdMock).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.beginTopicSync).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()
	})

	it("does not let stale syncing metadata block the current finished polling", async () => {
		vi.useFakeTimers()
		const emptyPollingResponse = {
			items: [],
			has_more: false,
			page_token: "",
		}
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(emptyPollingResponse)

		const { rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
				},
			},
		)

		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.getMessagesByConversationIdMock.mockClear()
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()
		mockState.superMagicStoreMock.topicMeta.set("stale-chat-topic", {
			syncState: "syncing",
			syncGeneration: 88,
		})
		mockState.superMagicStoreMock.isTopicSyncCurrent.mockImplementation(
			(topicId: string) => topicId !== "stale-chat-topic",
		)
		mockState.getMessagesByConversationIdMock.mockImplementationOnce(
			() => new Promise(() => undefined),
		)

		rerender({
			selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.beginTopicSync).toHaveBeenCalledWith("chat-topic-1")
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()
	})

	it("cancels the polling generation when incremental message processing throws", async () => {
		vi.useFakeTimers()
		const emptyPollingResponse = {
			items: [],
			has_more: false,
			page_token: "",
		}
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(emptyPollingResponse)

		const { rerender } = renderHook(
			({ selectedTopic }: { selectedTopic: Topic }) => useTopicMessages({ selectedTopic }),
			{
				initialProps: {
					selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
				},
			},
		)

		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()
		mockState.superMagicStoreMock.cancelTopicSync.mockClear()
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(emptyPollingResponse)
		mockState.superMagicStoreMock.isTopicSyncCurrent.mockImplementationOnce(() => {
			throw new Error("incremental processing failed")
		})

		rerender({
			selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await Promise.resolve()
		})

		const pollingGeneration =
			mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(pollingGeneration).toEqual(expect.any(Number))
		expect(mockState.superMagicStoreMock.cancelTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			pollingGeneration,
		)
		expect(mockState.superMagicStoreMock.completeTopicSync).not.toHaveBeenCalled()
	})

	it("loads older history with merge semantics instead of replacing the current topic", async () => {
		const topic = createTopic()
		const olderItems = [
			{
				seq: {
					seq_id: "1",
					message: {
						app_message_id: "older-message",
						type: "text",
						text: { content: "older" },
					},
				},
			},
		]
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({ items: [], has_more: true, page_token: "older-page" })
			.mockResolvedValueOnce({ items: olderItems, has_more: false, page_token: "" })

		const { result } = renderHook(() => useTopicMessages({ selectedTopic: topic }))
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.superMagicStoreMock.initializeMessages.mockClear()

		await act(async () => {
			result.current.handlePullMoreMessage(topic)
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenLastCalledWith(
			expect.objectContaining({ page_token: "older-page" }),
		)
		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			olderItems,
			{ mode: "merge" },
		)
	})

	it("keeps history pagination single-flight for repeated top-threshold notifications", async () => {
		const topic = createTopic()
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: true,
			page_token: "older-page",
		})
		const { result } = renderHook(() => useTopicMessages({ selectedTopic: topic }))
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		let resolveHistoryRequest: ((value: any) => void) | undefined
		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveHistoryRequest = resolve
				}),
		)

		act(() => {
			result.current.handlePullMoreMessage(topic)
			result.current.handlePullMoreMessage(topic)
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)

		await act(async () => {
			resolveHistoryRequest?.({ items: [], has_more: false, page_token: "" })
			await Promise.resolve()
		})
	})

	it("stops history pagination after the server reports no more messages", async () => {
		const topic = createTopic()
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: true,
			page_token: "older-page",
		})
		const { result } = renderHook(() => useTopicMessages({ selectedTopic: topic }))
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock.mockResolvedValue({
			items: [],
			has_more: false,
			page_token: "",
		})
		await act(async () => {
			result.current.handlePullMoreMessage(topic)
			await Promise.resolve()
			await Promise.resolve()
		})
		act(() => {
			result.current.handlePullMoreMessage(topic)
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
	})

	it("passes non-empty WS incremental items to enqueueMessage in server order with full envelopes", async () => {
		vi.useFakeTimers()
		const newerEnvelope = createMessageEnvelope("newer", "2")
		const olderEnvelope = createMessageEnvelope("older", "1")
		mockState.getMessagesByConversationIdMock.mockResolvedValue({
			items: [newerEnvelope, olderEnvelope],
			has_more: false,
			page_token: "",
		})
		renderHook(() => useTopicMessages({ selectedTopic: createTopic() }))
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.getMessagesByConversationIdMock.mockClear()

		act(() => {
			const handleNewMessage = mockState.pubsubHandlers.get("Super_Magic_New_Message_V2")
			handleNewMessage?.({
				conversation_id: "conversation-1",
				message: { topic_id: "chat-topic-1" },
			})
			handleNewMessage?.({
				conversation_id: "conversation-1",
				message: { topic_id: "chat-topic-1" },
			})
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300)
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledWith(
			expect.objectContaining({ limit: 10, chat_topic_id: "chat-topic-1" }),
		)
		expect(mockState.superMagicStoreMock.enqueueMessage).toHaveBeenCalledTimes(2)
		expect(mockState.superMagicStoreMock.enqueueMessage).toHaveBeenNthCalledWith(
			1,
			"chat-topic-1",
			olderEnvelope,
		)
		expect(mockState.superMagicStoreMock.enqueueMessage).toHaveBeenNthCalledWith(
			2,
			"chat-topic-1",
			newerEnvelope,
		)
		// The Hook must forward the original envelopes, not reconstructed message fragments.
		expect(mockState.superMagicStoreMock.enqueueMessage.mock.calls[0]?.[1]).toBe(olderEnvelope)
		expect(mockState.superMagicStoreMock.enqueueMessage.mock.calls[1]?.[1]).toBe(newerEnvelope)
	})

	it("ignores persistent-message events for another topic", async () => {
		vi.useFakeTimers()
		mockState.getMessagesByConversationIdMock.mockResolvedValue({
			items: [],
			has_more: false,
			page_token: "",
		})
		renderHook(() => useTopicMessages({ selectedTopic: createTopic() }))
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.getMessagesByConversationIdMock.mockClear()

		act(() => {
			mockState.pubsubHandlers.get("Super_Magic_New_Message_V2")?.({
				conversation_id: "conversation-1",
				message: { topic_id: "another-chat-topic" },
			})
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300)
		})

		expect(mockState.getMessagesByConversationIdMock).not.toHaveBeenCalled()
	})

	it("stops finished polling after the first successful authoritative sync", async () => {
		vi.useFakeTimers()
		mockState.getMessagesByConversationIdMock.mockResolvedValue({
			items: [],
			has_more: false,
			page_token: "",
		})
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		mockState.getMessagesByConversationIdMock.mockClear()

		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await Promise.resolve()
			await Promise.resolve()
		})
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)

		await act(async () => {
			await vi.advanceTimersByTimeAsync(40_000)
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
	})

	it("registers the active topic as the recovery owner and forwards its generation to replace", async () => {
		const emptySnapshot = { items: [], has_more: false, page_token: "" }
		mockState.getMessagesByConversationIdMock.mockResolvedValue(emptySnapshot)

		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(mockState.registerStreamRecoveryOwnerMock).toHaveBeenCalledTimes(1)
		const registration = mockState.registerStreamRecoveryOwnerMock.mock.calls[0]?.[0] as {
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
		expect(registration).toEqual(
			expect.objectContaining({
				topicId: "chat-topic-1",
				conversationId: "conversation-1",
			}),
		)
		expect(registration.getTaskStatus()).toBe(TaskStatus.FINISHED)

		mockState.getMessagesByConversationIdMock.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		const firstPageItems = [createMessageEnvelope("newer", "2")]
		const secondPageItems = [createMessageEnvelope("older", "1")]
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({ items: firstPageItems, has_more: true, page_token: "page-2" })
			.mockResolvedValueOnce({ items: secondPageItems, has_more: false, page_token: "" })
		let recoveryResult: { didPullSucceed: boolean } | undefined
		await act(async () => {
			recoveryResult = await registration.recover({
				topicId: "chat-topic-1",
				conversationId: "conversation-1",
				correlationId: "correlation-1",
				syncGeneration: 23,
			})
		})

		expect(recoveryResult).toEqual(expect.objectContaining({ didPullSucceed: true }))
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(2)
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				chat_topic_id: "chat-topic-1",
				conversation_id: "conversation-1",
				limit: 100,
				page_token: "",
			}),
		)
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				chat_topic_id: "chat-topic-1",
				conversation_id: "conversation-1",
				limit: 100,
				page_token: "page-2",
			}),
		)
		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			[...firstPageItems, ...secondPageItems],
			{ mode: "replace", syncGeneration: 23 },
		)
	})

	it("does not replace with a partial recovery snapshot when a later page fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mockState.getMessagesByConversationIdMock.mockResolvedValue({
			items: [],
			has_more: false,
			page_token: "",
		})
		renderHook(() => useTopicMessages({ selectedTopic: createTopic() }))
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})
		const registration = mockState.registerStreamRecoveryOwnerMock.mock.calls[0]?.[0] as {
			recover: (context: {
				topicId: string
				conversationId: string
				correlationId: string
				syncGeneration: number
			}) => Promise<{ didPullSucceed: boolean }>
		}

		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({
				items: [createMessageEnvelope("partial", "2")],
				has_more: true,
				page_token: "page-2",
			})
			.mockRejectedValueOnce(new Error("second page failed"))
		mockState.superMagicStoreMock.initializeMessages.mockClear()

		let recoveryResult: { didPullSucceed: boolean } | undefined
		await act(async () => {
			recoveryResult = await registration.recover({
				topicId: "chat-topic-1",
				conversationId: "conversation-1",
				correlationId: "correlation-1",
				syncGeneration: 24,
			})
		})

		expect(recoveryResult).toEqual(expect.objectContaining({ didPullSucceed: false }))
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it("wraps foreground recovery in one generation and completes after the full snapshot commits", async () => {
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: false,
			page_token: "",
		})
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		mockState.superMagicStoreMock.messages.set("chat-topic-1", [
			{ app_message_id: "foreground-anchor" },
		])
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
		})
		document.dispatchEvent(new Event("visibilitychange"))

		const firstPageItems = [createMessageEnvelope("newer", "3")]
		const secondPageItems = [
			createMessageEnvelope("foreground-anchor", "2"),
			createMessageEnvelope("older", "1"),
		]
		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({ items: firstPageItems, has_more: true, page_token: "page-2" })
			.mockResolvedValueOnce({ items: secondPageItems, has_more: false, page_token: "" })
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()

		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"))
			expect(mockState.superMagicStoreMock.beginTopicSync).toHaveBeenCalledWith(
				"chat-topic-1",
			)
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()
		})

		const generation = mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			[...firstPageItems, ...secondPageItems],
			{ mode: "replace", syncGeneration: generation },
		)
		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			generation,
			expect.objectContaining({
				succeeded: true,
				taskStatus: TaskStatus.RUNNING,
				latestSeqId: "assistant-seq-1",
			}),
		)
	})

	it("fails foreground recovery without committing the first page when the second page fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: false,
			page_token: "",
		})
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		mockState.superMagicStoreMock.messages.set("chat-topic-1", [
			{ app_message_id: "foreground-anchor" },
		])
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
		})
		document.dispatchEvent(new Event("visibilitychange"))

		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({
				items: [createMessageEnvelope("partial", "2")],
				has_more: true,
				page_token: "page-2",
			})
			.mockRejectedValueOnce(new Error("foreground second page failed"))
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()

		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"))
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()
		})

		const generation = mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			generation,
			expect.objectContaining({
				succeeded: false,
				taskStatus: TaskStatus.RUNNING,
			}),
		)
		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it.each([
		{
			label: "the first incomplete page has no continuation token",
			responses: [
				{
					items: [createMessageEnvelope("partial", "2")],
					has_more: true,
					page_token: "",
				},
			],
		},
		{
			label: "the second page is still incomplete and has not reached the anchor",
			responses: [
				{
					items: [createMessageEnvelope("partial-2", "3")],
					has_more: true,
					page_token: "page-2",
				},
				{
					items: [createMessageEnvelope("partial-1", "2")],
					has_more: true,
					page_token: "page-3",
				},
			],
		},
	])("does not commit foreground recovery when $label", async ({ responses }) => {
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: false,
			page_token: "",
		})
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic({ task_status: TaskStatus.RUNNING }),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		mockState.superMagicStoreMock.messages.set("chat-topic-1", [
			{ app_message_id: "foreground-anchor" },
		])
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
		})
		document.dispatchEvent(new Event("visibilitychange"))

		mockState.getMessagesByConversationIdMock.mockReset()
		responses.forEach((response) => {
			mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(response)
		})
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()

		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"))
			await Promise.resolve()
			await Promise.resolve()
			await Promise.resolve()
		})

		const generation = mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			generation,
			expect.objectContaining({ succeeded: false, taskStatus: TaskStatus.RUNNING }),
		)
	})
})

function createTopic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: "topic-1",
		topic_name: "Topic 1",
		chat_topic_id: "chat-topic-1",
		chat_conversation_id: "conversation-1",
		...overrides,
	} as Topic
}

function createMessageEnvelope(appMessageId: string, seqId: string) {
	const correlationId = `correlation-${appMessageId}`
	// WS 增量测试必须使用真实 Assistant 结构，避免 text fixture 掩盖类型过滤回归。
	return {
		type: "seq",
		seq: {
			magic_id: "magic-hook-test",
			seq_id: seqId,
			message_id: `server-${seqId}-${appMessageId}`,
			conversation_id: "conversation-1",
			message: {
				magic_message_id: `magic-${appMessageId}`,
				app_message_id: appMessageId,
				topic_id: "chat-topic-1",
				type: "super_magic_message",
				super_magic_message: {
					role: "assistant",
					topic_id: "chat-topic-1",
					message_id: `node-${appMessageId}`,
					correlation_id: correlationId,
					content: appMessageId,
					reasoning_content: null,
					tool_calls: [],
					status: "finished",
					send_timestamp: Number(seqId),
				},
			},
		},
	}
}
