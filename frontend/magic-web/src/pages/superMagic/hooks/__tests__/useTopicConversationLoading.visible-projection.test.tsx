import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MessageStatus, TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useTopicConversationLoading } from "../useTopicConversationLoading"

const mockState = vi.hoisted(() => ({
	messages: new Map<string, unknown[]>(),
	getMessageNode: vi.fn(() => ({ status: "finished" })),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		messages: mockState.messages,
		buffer: new Map(),
		getMessageNode: mockState.getMessageNode,
	},
}))

vi.mock("@/pages/superMagic/stores/optimisticMessageStore", () => ({
	optimisticMessageStore: {
		topicOptimisticMap: {},
		hydrateFromStorage: vi.fn(),
		getStatus: vi.fn(),
	},
}))

const selectedTopic = {
	id: "topic-id",
	chat_topic_id: "chat-topic-id",
	topic_name: "Topic",
} as Topic

describe("useTopicConversationLoading visible projection", () => {
	beforeEach(() => {
		mockState.messages.clear()
		vi.clearAllMocks()
	})

	it("does not expose historical revoked messages to UI consumers", async () => {
		mockState.messages.set("chat-topic-id", [
			{
				type: "rich_text",
				role: "user",
				app_message_id: "historical-revoked",
				status: MessageStatus.REVOKED,
			},
			{
				type: "rich_text",
				role: "user",
				app_message_id: "normal-message",
				status: "read",
			},
		])
		const onTopicMessagesChange = vi.fn()

		const { result } = renderHook(() =>
			useTopicConversationLoading({ selectedTopic, onTopicMessagesChange }),
		)
		await act(async () => {
			await Promise.resolve()
		})

		expect(result.current.messages.map((message) => message.app_message_id)).toEqual([
			"normal-message",
		])
	})

	it("ends global Topic loading when the Topic is waiting_for_user", async () => {
		mockState.messages.set("chat-topic-id", [
			{
				type: "rich_text",
				role: "user",
				app_message_id: "waiting-user-message",
				status: "read",
			},
			{
				type: "super_magic_message",
				role: "assistant",
				app_message_id: "waiting-user-assistant",
				super_message_id: "waiting-user-assistant",
				status: "running",
			},
		])
		mockState.getMessageNode.mockReturnValue({ status: "running" })
		const onTopicMessagesChange = vi.fn()
		const runningTopic = {
			...selectedTopic,
			task_status: TaskStatus.RUNNING,
		} as Topic
		const waitingForAgentTopic = {
			...runningTopic,
			task_status: TaskStatus.WAITING,
		} as Topic
		const waitingTopic = {
			...runningTopic,
			task_status: TaskStatus.WAITING_FOR_USER,
		} as Topic

		const { result, rerender } = renderHook(
			({ topic }: { topic: Topic }) =>
				useTopicConversationLoading({
					selectedTopic: topic,
					onTopicMessagesChange,
				}),
			{ initialProps: { topic: runningTopic } },
		)
		await act(async () => {
			await Promise.resolve()
		})

		rerender({ topic: waitingForAgentTopic })
		await act(async () => {
			await Promise.resolve()
		})
		expect(result.current.showLoading).toBe(true)

		rerender({ topic: waitingTopic })
		await act(async () => {
			await Promise.resolve()
		})

		expect(result.current.showLoading).toBe(false)
		expect(onTopicMessagesChange).toHaveBeenLastCalledWith(
			expect.objectContaining({ isLoading: false, selectedTopic: waitingTopic }),
		)
	})
})
