import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useTopicMessages } from "../useTopicMessages"

const mockState = vi.hoisted(() => ({
	getMessagesByConversationIdMock: vi.fn(),
	registerStreamRecoveryOwnerMock: vi.fn(),
	subscribeMock: vi.fn(),
	unsubscribeMock: vi.fn(),
	superMagicStoreMock: {
		messages: new Map<string, unknown[]>(),
		initializeMessages: vi.fn(),
		enqueueMessage: vi.fn(),
		setActiveTopicId: vi.fn(),
		getMessageNode: vi.fn(),
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
		subscribe: mockState.subscribeMock,
		unsubscribe: mockState.unsubscribeMock,
	},
	PubSubEvents: {
		Super_Magic_New_Message_V2: "Super_Magic_New_Message_V2",
		Refresh_Topic_Messages: "Refresh_Topic_Messages",
	},
}))

vi.mock("mobx", () => ({
	reaction: vi.fn(() => vi.fn()),
}))

describe("RecordingSummary useTopicMessages", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockState.superMagicStoreMock.messages = new Map()
		mockState.registerStreamRecoveryOwnerMock.mockReturnValue(vi.fn())
		mockState.getMessagesByConversationIdMock.mockResolvedValue({
			items: [],
			has_more: false,
			page_token: "",
		})
	})

	it("registers recovery and forwards syncGeneration to an authoritative replace", async () => {
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic({ task_status: TaskStatus.FINISHED }),
				selectedWorkspace: { id: "workspace-1" },
				checkNowDebounced: vi.fn(),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(mockState.registerStreamRecoveryOwnerMock).toHaveBeenCalledTimes(1)
		const registration = mockState.registerStreamRecoveryOwnerMock.mock.calls[0]?.[0] as {
			getTaskStatus: () => string | undefined
			recover: (context: {
				topicId: string
				conversationId: string
				correlationId: string
				syncGeneration: number
			}) => Promise<{ didPullSucceed: boolean }>
		}
		expect(registration.getTaskStatus()).toBe(TaskStatus.FINISHED)

		const firstPageItems = [createMessageEnvelope("newer", "2")]
		const secondPageItems = [createMessageEnvelope("older", "1")]
		mockState.getMessagesByConversationIdMock.mockReset()
		mockState.getMessagesByConversationIdMock
			.mockResolvedValueOnce({ items: firstPageItems, has_more: true, page_token: "page-2" })
			.mockResolvedValueOnce({
				items: secondPageItems,
				has_more: false,
				page_token: "",
				snapshot_complete: true,
			})
		mockState.superMagicStoreMock.initializeMessages.mockClear()
		await act(async () => {
			await registration.recover({
				topicId: "chat-topic-1",
				conversationId: "conversation-1",
				correlationId: "correlation-1",
				syncGeneration: 31,
			})
		})

		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			[...firstPageItems, ...secondPageItems],
			{
				mode: "replace",
				syncGeneration: 31,
				toolProjectionPolicy: "historical_terminal",
			},
		)
	})

	it("does not replace when the server cannot prove the recovered Topic snapshot", async () => {
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic(),
				selectedWorkspace: { id: "workspace-1" },
				checkNowDebounced: vi.fn(),
			}),
		)
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
		mockState.getMessagesByConversationIdMock.mockResolvedValueOnce({
			items: [createMessageEnvelope("message-b", "2")],
			has_more: false,
			page_token: "",
			snapshot_complete: false,
		})
		mockState.superMagicStoreMock.initializeMessages.mockClear()

		let result: { didPullSucceed: boolean } | undefined
		await act(async () => {
			result = await registration.recover({
				topicId: "chat-topic-1",
				conversationId: "conversation-1",
				correlationId: "correlation-1",
				syncGeneration: 32,
			})
		})

		expect(result).toEqual(expect.objectContaining({ didPullSucceed: false }))
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
	})

	it("does not replace with a partial recovery snapshot when a later page fails", async () => {
		const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
		renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic(),
				selectedWorkspace: { id: "workspace-1" },
				checkNowDebounced: vi.fn(),
			}),
		)
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

		let result: { didPullSucceed: boolean } | undefined
		await act(async () => {
			result = await registration.recover({
				topicId: "chat-topic-1",
				conversationId: "conversation-1",
				correlationId: "correlation-1",
				syncGeneration: 32,
			})
		})

		expect(result).toEqual(expect.objectContaining({ didPullSucceed: false }))
		expect(mockState.superMagicStoreMock.initializeMessages).not.toHaveBeenCalled()
		expect(consoleErrorSpy).toHaveBeenCalled()
		consoleErrorSpy.mockRestore()
	})

	it("refreshes revoked messages with replace and only unsubscribes its own handlers", async () => {
		const { unmount } = renderHook(() =>
			useTopicMessages({
				selectedTopic: createTopic(),
				selectedWorkspace: { id: "workspace-1" },
				checkNowDebounced: vi.fn(),
			}),
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		const wsHandler = mockState.subscribeMock.mock.calls.find(
			([event]) => event === "Super_Magic_New_Message_V2",
		)?.[1]
		const refreshHandler = mockState.subscribeMock.mock.calls.find(
			([event]) => event === "Refresh_Topic_Messages",
		)?.[1]
		expect(wsHandler).toEqual(expect.any(Function))
		expect(refreshHandler).toEqual(expect.any(Function))

		mockState.superMagicStoreMock.initializeMessages.mockClear()
		mockState.superMagicStoreMock.enqueueMessage.mockClear()
		await act(async () => {
			refreshHandler()
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(mockState.superMagicStoreMock.initializeMessages).toHaveBeenCalledWith(
			"chat-topic-1",
			[],
			{
				mode: "replace",
				syncGeneration: undefined,
				toolProjectionPolicy: "historical_terminal",
			},
		)
		expect(mockState.superMagicStoreMock.enqueueMessage).not.toHaveBeenCalled()

		unmount()
		expect(mockState.unsubscribeMock).toHaveBeenCalledWith(
			"Super_Magic_New_Message_V2",
			wsHandler,
		)
		expect(mockState.unsubscribeMock).toHaveBeenCalledWith(
			"Refresh_Topic_Messages",
			refreshHandler,
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
	return {
		seq: {
			seq_id: seqId,
			message: {
				app_message_id: appMessageId,
				type: "text",
				text: { content: appMessageId },
			},
		},
	}
}
