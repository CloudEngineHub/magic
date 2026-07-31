import type { ComponentType } from "react"
import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { SceneEditorContext } from "@/pages/superMagic/components/MainInputContainer/components/editors/types"
import type { InvalidModeFallbackProps } from "@/pages/superMagic/components/MessageEditor/components/TopicInvalidModeFallback"
import { useInvalidTopicModeFallback } from "../useInvalidTopicModeFallback"

const modeServiceMock = vi.hoisted(() => ({
	isModeValid: vi.fn(() => false),
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		isModeValid: modeServiceMock.isModeValid,
	},
}))

vi.mock("@/services/superMagic/DefaultAgentSelectionService", () => ({
	getFallbackTopicModeIdentifier: () => TopicMode.PPT,
}))

vi.mock("@/pages/superMagic/services/messageSendPreparation", () => ({
	createTopicForMessageContext: vi.fn(),
}))

const InvalidModeFallback = (() => null) as ComponentType<InvalidModeFallbackProps>

describe("useInvalidTopicModeFallback", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		modeServiceMock.isModeValid.mockReturnValue(false)
	})

	it("recovers an empty invalid topic without invoking the persistent setter", async () => {
		const setTopicMode = vi.fn()
		const recoverTopicMode = vi.fn()
		const editorContext = {
			selectedTopic: {
				id: "topic-1",
				agent_code: "offline-agent",
			},
			selectedProject: null,
			topicMode: TopicMode.CustomAgent,
			messagesLength: 0,
			setTopicMode,
			recoverTopicMode,
			invalidModeFallback: InvalidModeFallback,
		} as unknown as SceneEditorContext

		const { result } = renderHook(() => useInvalidTopicModeFallback(editorContext))

		await waitFor(() => {
			expect(recoverTopicMode).toHaveBeenCalledWith(TopicMode.PPT)
		})
		expect(setTopicMode).not.toHaveBeenCalled()
		expect(result.current.isActive).toBe(false)
	})

	it("keeps the fallback active when an invalid topic has messages", () => {
		const setTopicMode = vi.fn()
		const recoverTopicMode = vi.fn()
		const editorContext = {
			selectedTopic: {
				id: "topic-1",
				agent_code: "offline-agent",
			},
			selectedProject: null,
			topicMode: TopicMode.CustomAgent,
			messagesLength: 1,
			setTopicMode,
			recoverTopicMode,
			invalidModeFallback: InvalidModeFallback,
		} as unknown as SceneEditorContext

		const { result } = renderHook(() => useInvalidTopicModeFallback(editorContext))

		expect(result.current.isActive).toBe(true)
		expect(recoverTopicMode).not.toHaveBeenCalled()
		expect(setTopicMode).not.toHaveBeenCalled()
	})
})
