import type { ComponentType } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { TaskStatus, type Topic } from "@/pages/superMagic/pages/Workspace/types"
import type { InvalidModeFallbackProps } from "../../components/TopicInvalidModeFallback"
import { shouldShowInvalidTopicModeFallback } from "../shouldShowInvalidTopicModeFallback"

const FallbackStub = (() => null) as ComponentType<InvalidModeFallbackProps>

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

const { modeServiceMock, isModeValidMock } = vi.hoisted(() => ({
	modeServiceMock: {
		isModeAvailabilityResolved: true,
	},
	isModeValidMock: vi.fn(),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		isModeValid: isModeValidMock,
		get isModeAvailabilityResolved() {
			return modeServiceMock.isModeAvailabilityResolved
		},
	},
}))

describe("shouldShowInvalidTopicModeFallback", () => {
	beforeEach(() => {
		modeServiceMock.isModeAvailabilityResolved = true
		isModeValidMock.mockReset()
	})

	it("returns false when fallback component is not configured", () => {
		expect(
			shouldShowInvalidTopicModeFallback({
				selectedTopic: createTopic({ agent_code: "agent-a" }),
				topicMode: TopicMode.General,
			}),
		).toBe(false)
	})

	it("returns false when there is no selected topic", () => {
		expect(
			shouldShowInvalidTopicModeFallback({
				invalidModeFallback: FallbackStub,
				topicMode: TopicMode.General,
			}),
		).toBe(false)
	})

	it("returns false when an empty topic has no saved mode", () => {
		isModeValidMock.mockReturnValue(false)

		expect(
			shouldShowInvalidTopicModeFallback({
				invalidModeFallback: FallbackStub,
				selectedTopic: createTopic({
					topic_mode: TopicMode.Empty,
					agent_code: "missing-agent",
				}),
				topicMode: "missing-agent" as TopicMode,
				messagesLength: 0,
			}),
		).toBe(false)
	})

	it("returns true when an empty topic has a saved unavailable mode", () => {
		isModeValidMock.mockReturnValue(false)

		expect(
			shouldShowInvalidTopicModeFallback({
				invalidModeFallback: FallbackStub,
				selectedTopic: createTopic({
					topic_mode: TopicMode.CustomAgent,
					agent_code: "missing-agent",
				}),
				topicMode: TopicMode.CustomAgent,
				messagesLength: 0,
			}),
		).toBe(true)
		expect(isModeValidMock).toHaveBeenCalledWith(TopicMode.CustomAgent, "missing-agent")
	})

	it("waits for mode availability before showing the fallback", () => {
		modeServiceMock.isModeAvailabilityResolved = false
		isModeValidMock.mockReturnValue(false)

		expect(
			shouldShowInvalidTopicModeFallback({
				invalidModeFallback: FallbackStub,
				selectedTopic: createTopic({
					topic_mode: TopicMode.CustomAgent,
					agent_code: "missing-agent",
				}),
				topicMode: TopicMode.PPT,
				messagesLength: 0,
			}),
		).toBe(false)
		expect(isModeValidMock).not.toHaveBeenCalled()
	})

	it("returns true when topic mode is invalid, fallback is configured, and messages exist", () => {
		isModeValidMock.mockReturnValue(false)

		expect(
			shouldShowInvalidTopicModeFallback({
				invalidModeFallback: FallbackStub,
				selectedTopic: createTopic({
					topic_mode: TopicMode.CustomAgent,
					agent_code: "missing-agent",
				}),
				topicMode: "missing-agent" as TopicMode,
				messagesLength: 2,
			}),
		).toBe(true)
	})
})
