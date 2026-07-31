import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MessageStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
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
})
