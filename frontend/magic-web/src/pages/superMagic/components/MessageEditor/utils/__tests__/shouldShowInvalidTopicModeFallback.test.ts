import type { ComponentType } from "react"
import { describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { InvalidModeFallbackProps } from "../../components/TopicInvalidModeFallback"
import { shouldShowInvalidTopicModeFallback } from "../shouldShowInvalidTopicModeFallback"

const FallbackStub = (() => null) as ComponentType<InvalidModeFallbackProps>

const { isModeValidMock } = vi.hoisted(() => ({
	isModeValidMock: vi.fn(),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		isModeValid: isModeValidMock,
	},
}))

describe("shouldShowInvalidTopicModeFallback", () => {
	it("returns false when fallback component is not configured", () => {
		expect(
			shouldShowInvalidTopicModeFallback({
				selectedTopic: { agent_code: "agent-a" } as never,
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

	it("returns true when topic mode is invalid and fallback is configured", () => {
		isModeValidMock.mockReturnValue(false)

		expect(
			shouldShowInvalidTopicModeFallback({
				invalidModeFallback: FallbackStub,
				selectedTopic: { agent_code: "missing-agent" } as never,
				topicMode: "missing-agent" as TopicMode,
			}),
		).toBe(true)
	})
})
