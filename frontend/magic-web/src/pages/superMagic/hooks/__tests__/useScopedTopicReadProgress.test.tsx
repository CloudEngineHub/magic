import { renderHook } from "@testing-library/react"
import { StrictMode, type PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { useScopedTopicReadProgress } from "../useScopedTopicReadProgress"

const mockState = vi.hoisted(() => ({
	activeSubscriptions: 0,
	cleanupFunctions: [] as Array<ReturnType<typeof vi.fn>>,
	subscribe: vi.fn(),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		messages: new Map<string, unknown[]>(),
		subscribe: mockState.subscribe,
	},
}))

vi.mock("@/pages/superMagic/services/topicReadProgressService", () => ({
	createTopicReadProgressService: vi.fn(() => ({
		flushCurrentTopicReadProgress: vi.fn(() => Promise.resolve()),
		flushTopicReadProgress: vi.fn(() => Promise.resolve()),
		markTopicReadProgress: vi.fn(),
	})),
	normalizeMessageSendTimeToMs: vi.fn(() => undefined),
	resolveReadProgressPayloadFromMessages: vi.fn(() => ({})),
}))

vi.mock("@/pages/superMagic/services/topicStatusSyncService", () => ({
	handleArrivedTopicStatusChange: vi.fn(),
	syncTopicStatusPatch: vi.fn(() => Promise.resolve()),
}))

function createTopic(): Topic {
	return {
		id: "topic-1",
		user_id: "user-1",
		chat_topic_id: "chat-topic-1",
		chat_conversation_id: "conversation-1",
		topic_name: "Topic 1",
		task_status: TaskStatus.RUNNING,
		task_mode: "chat",
		project_id: "project-1",
		topic_mode: TopicMode.General,
		updated_at: "2026-07-26T00:00:00Z",
		workspace_id: "workspace-1",
		token_used: null,
	}
}

function StrictModeWrapper({ children }: PropsWithChildren) {
	return <StrictMode>{children}</StrictMode>
}

describe("useScopedTopicReadProgress / topic listener lifecycle", () => {
	beforeEach(() => {
		mockState.activeSubscriptions = 0
		mockState.cleanupFunctions = []
		mockState.subscribe.mockReset()
		mockState.subscribe.mockImplementation(() => {
			mockState.activeSubscriptions += 1
			let active = true
			const unsubscribe = vi.fn(() => {
				if (!active) return
				active = false
				mockState.activeSubscriptions -= 1
			})
			mockState.cleanupFunctions.push(unsubscribe)
			return unsubscribe
		})
	})

	it("Strict Mode 的 mount-cleanup-remount 最终只保留一个活跃 topic 订阅。", () => {
		const { unmount } = renderHook(
			() =>
				useScopedTopicReadProgress({
					scopeName: "strict-mode-test",
					topicStore: {} as never,
					selectedTopic: createTopic(),
					isSelectedTopicMessagesReady: false,
				}),
			{ wrapper: StrictModeWrapper },
		)

		expect(mockState.subscribe).toHaveBeenCalledTimes(2)
		expect(mockState.subscribe).toHaveBeenCalledWith(
			"message.committed",
			expect.any(Function),
			{ scope: { topicId: "chat-topic-1" } },
		)
		expect(mockState.activeSubscriptions).toBe(1)
		expect(
			mockState.cleanupFunctions.filter((cleanup) => cleanup.mock.calls.length === 0),
		).toHaveLength(1)

		unmount()

		expect(mockState.activeSubscriptions).toBe(0)
		expect(mockState.cleanupFunctions.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(
			true,
		)
	})
})
