import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useRefreshTopicDetailOnTaskComplete } from "../useRefreshTopicDetailOnTaskComplete"

const mockState = vi.hoisted(() => ({
	getTopicDetail: vi.fn(),
	subscribe: vi.fn(),
	taskCompletedCallback: undefined as undefined | ((event: unknown) => void),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getTopicDetail: mockState.getTopicDetail,
	},
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		subscribe: mockState.subscribe,
	},
}))

const topic = {
	id: "topic-1",
	chat_topic_id: "chat-topic-1",
} as Topic

describe("useRefreshTopicDetailOnTaskComplete", () => {
	beforeEach(() => {
		mockState.getTopicDetail.mockReset()
		mockState.subscribe.mockReset()
		mockState.taskCompletedCallback = undefined
		mockState.getTopicDetail.mockResolvedValue(topic)
		mockState.subscribe.mockImplementation((_type, callback) => {
			mockState.taskCompletedCallback = callback
			return vi.fn()
		})
	})

	it("subscribes to task.completed and refreshes the scoped Topic once", async () => {
		const onTopicDetailLoaded = vi.fn()
		renderHook(() =>
			useRefreshTopicDetailOnTaskComplete({
				selectedTopic: topic,
				onTopicDetailLoaded,
			}),
		)

		expect(mockState.subscribe).toHaveBeenCalledWith("task.completed", expect.any(Function), {
			scope: { topicId: "chat-topic-1" },
		})

		act(() => {
			mockState.taskCompletedCallback?.({
				type: "task.completed",
				meta: {
					topicId: "chat-topic-1",
					taskId: "task-1",
					appMessageId: "finish-task-message-1",
				},
				payload: { source: "finish_task", result: { attachments: [] } },
			})
		})

		await waitFor(() => {
			expect(mockState.getTopicDetail).toHaveBeenCalledTimes(1)
		})
		expect(mockState.getTopicDetail).toHaveBeenCalledWith(
			{ id: "topic-1" },
			{ enableErrorMessagePrompt: false },
		)
		expect(onTopicDetailLoaded).toHaveBeenCalledWith(topic)
	})
})
