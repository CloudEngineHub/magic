import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useTopicMessages } from "../useTopicMessages"

const mockState = vi.hoisted(() => ({
	nextSyncGeneration: 1,
	getMessagesByConversationIdMock: vi.fn(),
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

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
	},
	PubSubEvents: {
		Super_Magic_New_Message_V2: "Super_Magic_New_Message_V2",
		Refresh_Topic_Messages: "Refresh_Topic_Messages",
	},
}))

describe("useTopicMessages", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockState.nextSyncGeneration = 1
		mockState.superMagicStoreMock.beginTopicSync.mockImplementation(
			() => mockState.nextSyncGeneration++,
		)
		mockState.superMagicStoreMock.isTopicSyncCurrent.mockReturnValue(true)
		mockState.superMagicStoreMock.completeTopicSync.mockReturnValue(true)
		mockState.superMagicStoreMock.messages = new Map()
		mockState.superMagicStoreMock.buffer = new Map()
		mockState.superMagicStoreMock.topicMeta = new Map()
		mockState.getMessagesByConversationIdMock.mockImplementation(
			() => new Promise(() => undefined),
		)
	})

	afterEach(() => {
		vi.useRealTimers()
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
		expect(mockState.getMessagesByConversationIdMock).toHaveBeenCalledTimes(1)
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
			resolvePollingRequest?.(emptyPollingResponse)
			await Promise.resolve()
		})

		expect(mockState.superMagicStoreMock.completeTopicSync).toHaveBeenCalledWith(
			"chat-topic-1",
			pollingGeneration,
			expect.objectContaining({
				succeeded: true,
				taskStatus: TaskStatus.FINISHED,
			}),
		)
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
