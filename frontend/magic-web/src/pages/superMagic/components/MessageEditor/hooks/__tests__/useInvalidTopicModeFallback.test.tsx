import type { ComponentType } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import type { InvalidModeFallbackProps } from "@/pages/superMagic/components/MessageEditor/components/TopicInvalidModeFallback"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import { useInvalidTopicModeFallback } from "../useInvalidTopicModeFallback"

const modeServiceMock = vi.hoisted(() => ({
	isModeValid: vi.fn(() => false),
	isModeAvailabilityResolved: true,
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		isModeValid: modeServiceMock.isModeValid,
		get isModeAvailabilityResolved() {
			return modeServiceMock.isModeAvailabilityResolved
		},
	},
}))

vi.mock("@/services/superMagic/DefaultAgentSelectionService", () => ({
	getFallbackTopicModeIdentifier: () => TopicMode.PPT,
}))

vi.mock("@/pages/superMagic/services/messageSendPreparation", () => ({
	createTopicForMessageContext: vi.fn(),
}))

const InvalidModeFallback = (() => null) as ComponentType<InvalidModeFallbackProps>

function createTopic(overrides: Partial<Topic> = {}): Topic {
	return {
		id: "topic-1",
		user_id: "user-1",
		chat_topic_id: "chat-topic-1",
		chat_conversation_id: "conversation-1",
		topic_name: "Existing Topic",
		task_status: TaskStatus.FINISHED,
		task_mode: "chat",
		project_id: "project-1",
		topic_mode: TopicMode.Empty,
		updated_at: "2026-08-04T00:00:00Z",
		workspace_id: "workspace-1",
		token_used: null,
		...overrides,
	}
}

describe("useInvalidTopicModeFallback", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		modeServiceMock.isModeValid.mockReturnValue(false)
		modeServiceMock.isModeAvailabilityResolved = true
	})

	it("recovers an empty invalid topic without a saved mode", async () => {
		const setTopicMode = vi.fn()
		const recoverTopicMode = vi.fn()
		const editorContext: SceneEditorContext = {
			selectedTopic: createTopic({
				topic_mode: TopicMode.Empty,
				agent_code: "offline-agent",
			}),
			selectedProject: null,
			topicMode: TopicMode.CustomAgent,
			messagesLength: 0,
			setTopicMode,
			recoverTopicMode,
			invalidModeFallback: InvalidModeFallback,
		}

		const { result } = renderHook(() => useInvalidTopicModeFallback(editorContext))

		await waitFor(() => {
			expect(recoverTopicMode).toHaveBeenCalledWith(TopicMode.PPT)
		})
		expect(setTopicMode).not.toHaveBeenCalled()
		expect(result.current.isActive).toBe(false)
	})

	it("keeps the fallback active for an empty topic with a saved unavailable mode", () => {
		const setTopicMode = vi.fn()
		const recoverTopicMode = vi.fn()
		const editorContext: SceneEditorContext = {
			selectedTopic: createTopic({
				topic_mode: TopicMode.CustomAgent,
				agent_code: "offline-agent",
			}),
			selectedProject: null,
			topicMode: TopicMode.CustomAgent,
			messagesLength: 0,
			setTopicMode,
			recoverTopicMode,
			invalidModeFallback: InvalidModeFallback,
		}

		const { result } = renderHook(() => useInvalidTopicModeFallback(editorContext))

		expect(result.current.isActive).toBe(true)
		expect(recoverTopicMode).not.toHaveBeenCalled()
		expect(setTopicMode).not.toHaveBeenCalled()
	})

	it("does not recover an empty topic before mode availability is resolved", () => {
		modeServiceMock.isModeAvailabilityResolved = false
		const recoverTopicMode = vi.fn()
		const editorContext: SceneEditorContext = {
			selectedTopic: createTopic({
				topic_mode: TopicMode.Empty,
			}),
			selectedProject: null,
			topicMode: TopicMode.CustomAgent,
			messagesLength: 0,
			recoverTopicMode,
			invalidModeFallback: InvalidModeFallback,
		}

		const { result } = renderHook(() => useInvalidTopicModeFallback(editorContext))

		expect(result.current.isActive).toBe(false)
		expect(recoverTopicMode).not.toHaveBeenCalled()
	})

	it("keeps the fallback active when an invalid topic has messages", () => {
		const setTopicMode = vi.fn()
		const recoverTopicMode = vi.fn()
		const editorContext: SceneEditorContext = {
			selectedTopic: createTopic({
				topic_mode: TopicMode.CustomAgent,
				agent_code: "offline-agent",
			}),
			selectedProject: null,
			topicMode: TopicMode.CustomAgent,
			messagesLength: 1,
			setTopicMode,
			recoverTopicMode,
			invalidModeFallback: InvalidModeFallback,
		}

		const { result } = renderHook(() => useInvalidTopicModeFallback(editorContext))

		expect(result.current.isActive).toBe(true)
		expect(recoverTopicMode).not.toHaveBeenCalled()
		expect(setTopicMode).not.toHaveBeenCalled()
	})
})
