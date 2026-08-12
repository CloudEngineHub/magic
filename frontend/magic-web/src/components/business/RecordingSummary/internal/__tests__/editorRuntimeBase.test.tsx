import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useWebRecordingEditorRuntime } from "../editorRuntimeBase"

const startRecordingMock = vi.hoisted(() => vi.fn())

vi.mock("@/services/recordSummary/serviceInstance", () => ({
	initializeService: () => ({
		startRecording: startRecordingMock,
		completeRecordingWithSummary: vi.fn(),
		cancelRecording: vi.fn(),
	}),
}))

vi.mock("@/stores/recordingSummary", () => ({
	default: {
		businessData: {
			workspace: { id: "mock-workspace-runtime" },
			project: { id: "mock-project-runtime" },
			topic: { id: "mock-topic-runtime" },
		},
		isRecording: false,
		isPaused: false,
		duration: "00:00:00",
		isStartingRecord: false,
		floatPanel: {
			toggleExpanded: vi.fn(),
		},
	},
}))

vi.mock("@/components/business/RecordingSummary/components/RealtimeWaveform", () => ({
	default: () => null,
}))

describe("useWebRecordingEditorRuntime", () => {
	it("uses the selected recording topic as the fixed chat topic", async () => {
		startRecordingMock.mockReset()
		const { result } = renderHook(() => useWebRecordingEditorRuntime())
		const topic = { id: "mock-topic-source" }
		const selectedTopic = { id: "mock-topic-chat" }

		await act(async () => {
			await result.current.actions.startRecording({
				workspace: { id: "mock-workspace-runtime" } as never,
				project: { id: "mock-project-runtime" } as never,
				topic: topic as never,
				selectedTopic: selectedTopic as never,
				model: { model_id: "mock-model-runtime" } as never,
				audioSource: "microphone",
			})
		})

		expect(startRecordingMock).toHaveBeenCalledWith(
			expect.objectContaining({
				topic,
				chatTopic: selectedTopic,
			}),
		)
	})
})
