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

	it("uses one recent incremental page as the finished resident-poll completion barrier", async () => {
		vi.useFakeTimers()
		const initialResponse = { items: [], has_more: false, page_token: "" }
		const pollingResponse = {
			items: [createMessageEnvelope("newer", "2"), createMessageEnvelope("older", "1")],
			has_more: true,
			page_token: "page-2",
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
		mockState.superMagicStoreMock.enqueueMessage.mockClear()
		let resolvePollingRequest: ((value: typeof pollingResponse) => void) | undefined
		mockState.getMessagesByConversationIdMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolvePollingRequest = resolve
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
				limit: 20,
				order: "desc",
				page_token: "",
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
			resolvePollingRequest?.(pollingResponse)
			await Promise.resolve()
			await Promise.resolve()
		})
		// Resident polling is a bounded delta check. has_more belongs to history/recovery,
		// so it must not make the timer walk the complete topic history.
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.enqueueMessage.mock.calls).toEqual([
			["chat-topic-1", pollingResponse.items[1]],
			["chat-topic-1", pollingResponse.items[0]],
		])

		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			pollingGeneration,
			expect.objectContaining({
				succeeded: true,
				taskStatus: TaskStatus.FINISHED,
			}),
		)
	})

	it("keeps finished polling retryable when the recent incremental request fails", async () => {
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
		mockState.getMessagesByConversationIdMock.mockRejectedValueOnce(
			new Error("finished polling failed"),
		)
		mockState.superMagicStoreMock.beginTopicSync.mockClear()
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.enqueueMessage.mockClear()
		mockState.superMagicStoreMock.completeTopicSync.mockClear()

		rerender({ selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }) })
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await Promise.resolve()
			await Promise.resolve()
		})

		const generation = mockState.superMagicStoreMock.beginTopicSync.mock.results[0]?.value
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.enqueueMessage).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			generation,
			expect.objectContaining({ succeeded: false, taskStatus: TaskStatus.FINISHED }),
		)

		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [],
			has_more: false,
			page_token: "",
		})
		await act(async () => {
			await vi.advanceTimersByTimeAsync(20_000)
			await Promise.resolve()
		})
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(2)
		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it.fails(
		"P1 contract: continues bounded polling pages until the local anchor is reached",
		async () => {
			const { existingMessages, poll } = await prepareFinishedPollingAnchorContract()
			const firstPageItems = [
				createMessageEnvelope("newest-4", "4"),
				createMessageEnvelope("newest-3", "3"),
			]
			const secondPageItems = [
				createMessageEnvelope("newest-2", "2"),
				createMessageEnvelope("local-anchor", "1"),
				createMessageEnvelope("older-than-anchor", "0"),
			]
			mockState.getMessagesByConversationIdMock
				.mockResolvedValueOnce({
					items: firstPageItems,
					has_more: true,
					page_token: "page-2",
				})
				.mockResolvedValueOnce({
					items: secondPageItems,
					has_more: true,
					page_token: "page-3",
				})

			await poll()

			expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(2)
			expect(mockState.getMessagesByConversationIdMock).toHaveBeenNthCalledWith(
				2,
				expect.objectContaining({ limit: 20, page_token: "page-2" }),
			)
			// Only messages newer than the anchor are committed, in canonical ascending order.
			expect(mockState.superMagicStoreMock.enqueueMessage.mock.calls).toEqual([
				["chat-topic-1", secondPageItems[0]],
				["chat-topic-1", firstPageItems[1]],
				["chat-topic-1", firstPageItems[0]],
			])
			expect(mockState.superMagicStoreMock.messages.get("chat-topic-1")).toBe(
				existingMessages,
			)
			expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
				"chat-topic-1",
				expect.any(Number),
				expect.objectContaining({ succeeded: true, taskStatus: TaskStatus.FINISHED }),
			)
		},
	)

	it.fails("P1 contract: commits no partial delta when a later anchor page fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		const { existingMessages, poll } = await prepareFinishedPollingAnchorContract()
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({
				items: [createMessageEnvelope("partial-new", "2")],
				has_more: true,
				page_token: "page-2",
			})
			.mockRejectedValueOnce(new Error("anchor continuation failed"))

		await poll()

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(2)
		expect(mockState.superMagicStoreMock.enqueueMessage).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(mockState.superMagicStoreMock.messages.get("chat-topic-1")).toBe(existingMessages)
		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			expect.any(Number),
			expect.objectContaining({ succeeded: false, taskStatus: TaskStatus.FINISHED }),
		)
		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it.fails(
		"P1 contract: stops at the polling page budget when the anchor is still missing",
		async () => {
			const { existingMessages, poll } = await prepareFinishedPollingAnchorContract()
			mockState.getMessagesByConversationIdMock
				.mockResolvedValueOnce({
					items: [createMessageEnvelope("page-1-new", "4")],
					has_more: true,
					page_token: "page-2",
				})
				.mockResolvedValueOnce({
					items: [createMessageEnvelope("page-2-new", "3")],
					has_more: true,
					page_token: "page-3",
				})
				.mockResolvedValueOnce({
					items: [createMessageEnvelope("page-3-new", "2")],
					has_more: true,
					page_token: "page-4",
				})

			await poll()

			// Three recent pages form the bounded P1 safety budget; page-4 belongs to explicit recovery.
			expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(3)
			expect(mockState.superMagicStoreMock.enqueueMessage).not.toHaveBeenCalled()
			expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
			expect(mockState.superMagicStoreMock.messages.get("chat-topic-1")).toBe(
				existingMessages,
			)
			expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
				"chat-topic-1",
				expect.any(Number),
				expect.objectContaining({ succeeded: false, taskStatus: TaskStatus.FINISHED }),
			)
		},
	)

	it.fails.each([
		{
			label: "the server omits the next page token",
			responses: [
				{
					items: [createMessageEnvelope("missing-token-new", "2")],
					has_more: true,
					page_token: "",
				},
			],
			expectedRequestCount: 1,
		},
		{
			label: "the server repeats an already visited page token",
			responses: [
				{
					items: [createMessageEnvelope("repeated-token-new-2", "3")],
					has_more: true,
					page_token: "page-2",
				},
				{
					items: [createMessageEnvelope("repeated-token-new-1", "2")],
					has_more: true,
					page_token: "page-2",
				},
			],
			expectedRequestCount: 2,
		},
	])(
		"P1 contract: preserves the current list when $label",
		async ({ responses, expectedRequestCount }) => {
			const { existingMessages, poll } = await prepareFinishedPollingAnchorContract()
			responses.forEach((response) => {
				mockState.getMessagesByConversationIdMock.mockResolvedValueOnce(response)
			})

			await poll()

			expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(
				expectedRequestCount,
			)
			expect(mockState.superMagicStoreMock.enqueueMessage).not.toHaveBeenCalled()
			expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
			expect(mockState.superMagicStoreMock.messages.get("chat-topic-1")).toBe(
				existingMessages,
			)
			expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
				"chat-topic-1",
				expect.any(Number),
				expect.objectContaining({ succeeded: false, taskStatus: TaskStatus.FINISHED }),
			)
		},
	)

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
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [createMessageEnvelope("incremental-throws", "2")],
			has_more: false,
			page_token: "",
		})
		mockState.superMagicStoreMock.enqueueMessage.mockImplementationOnce(() => {
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

	it("commits revoke refresh as one unfiltered authoritative batch", async () => {
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

		const revokedBatch = [
			createMessageEnvelope("historical-revoked", "1", "revoked"),
			createMessageEnvelope("normal", "2", "read"),
			createMessageEnvelope("active-revoked", "3", "revoked"),
		]
		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: revokedBatch,
			has_more: false,
			page_token: "",
		})
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.enqueueMessage.mockClear()

		await act(async () => {
			await mockState.pubsubHandlers.get("Refresh_Topic_Messages")?.()
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledWith(
			expect.objectContaining({
				chat_topic_id: "chat-topic-1",
				limit: 500,
				order: "desc",
			}),
		)
		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledTimes(1)
		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			revokedBatch,
			{ mode: "replace" },
		)
		expect(mockState.superMagicStoreMock.enqueueMessage).not.toHaveBeenCalled()
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

	it("stops finished polling after the first successful incremental completion barrier", async () => {
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

async function prepareFinishedPollingAnchorContract(anchorAppMessageId = "local-anchor") {
	vi.useFakeTimers()
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

	const existingMessages = [{ app_message_id: anchorAppMessageId }]
	mockState.superMagicStoreMock.messages.set("chat-topic-1", existingMessages)
	mockState.getMessagesByConversationIdMock.mockReset()
	mockState.superMagicStoreMock.beginTopicSync.mockClear()
	mockState.superMagicStoreMock.initializeMessages.mockClear()
	mockState.superMagicStoreMock.enqueueMessage.mockClear()
	mockState.superMagicStoreMock.completeTopicSync.mockClear()
	rerender({ selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }) })

	return {
		existingMessages,
		poll: async () => {
			await act(async () => {
				await vi.advanceTimersByTimeAsync(20_000)
				await Promise.resolve()
				await Promise.resolve()
				await Promise.resolve()
			})
		},
	}
}

function createTopic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: "topic-1",
		topic_name: "Topic 1",
		chat_topic_id: "chat-topic-1",
		chat_conversation_id: "conversation-1",
		...overrides,
	} as Topic
}

function createMessageEnvelope(appMessageId: string, seqId: string, status = "read") {
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
				status,
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
