import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import recordSummaryStore from "../index"

vi.hoisted(() => {
	// Provide deterministic browser storage before the singleton store is imported.
	Object.defineProperty(globalThis, "localStorage", {
		configurable: true,
		value: {
			clear: vi.fn(),
			getItem: vi.fn(() => null),
			key: vi.fn(() => null),
			removeItem: vi.fn(),
			setItem: vi.fn(),
			length: 0,
		},
	})
})

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: null } },
}))

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: { getModelGroupsByMode: vi.fn(() => []) },
}))

describe("RecordingSummaryStore.startRecording", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		recordSummaryStore.reset()
	})

	afterEach(() => {
		vi.runOnlyPendingTimers()
		vi.useRealTimers()
		recordSummaryStore.reset()
	})

	it("opens AI chat by default for desktop audio recordings", () => {
		recordSummaryStore.floatPanel.isMobile = false

		recordSummaryStore.startRecording({
			workspace: { id: "mock-workspace-desktop" } as never,
			project: { id: "mock-project-desktop", project_mode: "audio" } as never,
			topic: { id: "mock-topic-desktop" } as never,
			chatTopic: { id: "mock-chat-topic-desktop" } as never,
			model: { model_id: "mock-model-desktop" } as never,
			userId: "mock-user-desktop",
		})

		expect(recordSummaryStore.floatPanel.expandedAiChat).toBe(true)
	})

	it("keeps AI chat closed by default for mobile recordings", () => {
		recordSummaryStore.floatPanel.isMobile = true

		recordSummaryStore.startRecording({
			workspace: { id: "mock-workspace-mobile" } as never,
			project: { id: "mock-project-mobile", project_mode: "audio" } as never,
			topic: { id: "mock-topic-mobile" } as never,
			chatTopic: { id: "mock-chat-topic-mobile" } as never,
			model: { model_id: "mock-model-mobile" } as never,
			userId: "mock-user-mobile",
		})

		expect(recordSummaryStore.floatPanel.expandedAiChat).toBe(false)
	})
})
