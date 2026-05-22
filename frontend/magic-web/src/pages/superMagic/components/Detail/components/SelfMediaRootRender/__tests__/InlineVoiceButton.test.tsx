import { fireEvent, render, screen } from "@testing-library/react"
import { act } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockUseVoiceInput, mockHandlePermissionError } = vi.hoisted(() => ({
	mockUseVoiceInput: vi.fn(),
	mockHandlePermissionError: vi.fn(),
}))

vi.mock("@/components/business/VoiceInput/hooks", () => ({
	useVoiceInput: mockUseVoiceInput,
}))

vi.mock("@/hooks/useMicrophonePermission", () => ({
	useMicrophonePermission: () => ({
		handlePermissionError: mockHandlePermissionError,
	}),
}))

import InlineVoiceButton from "../components/SelfMediaInitPanel/components/ui/InlineVoiceButton"

describe("InlineVoiceButton", () => {
	beforeEach(() => {
		mockUseVoiceInput.mockReset()
		mockHandlePermissionError.mockReset()
		mockUseVoiceInput.mockReturnValue({
			status: "idle",
			isRecording: false,
			toggleRecording: vi.fn(),
			disconnect: vi.fn(),
		})
	})

	it("emits the full field text when voice input returns full transcription", () => {
		const onResult = vi.fn()
		const toggleRecording = vi.fn()
		mockUseVoiceInput.mockReturnValue({
			status: "idle",
			isRecording: false,
			toggleRecording,
			disconnect: vi.fn(),
		})

		render(<InlineVoiceButton value="Draft: " onResult={onResult} />)

		const voiceOptions = mockUseVoiceInput.mock.calls[0][0]

		fireEvent.click(screen.getByRole("button"))

		act(() => {
			voiceOptions.onResult("Hello")
			voiceOptions.onResult("Hello world")
			voiceOptions.onResult("Hello world")
		})

		expect(onResult).toHaveBeenNthCalledWith(1, "Draft: Hello")
		expect(onResult).toHaveBeenNthCalledWith(2, "Draft: Hello world")
		expect(onResult).toHaveBeenNthCalledWith(3, "Draft: Hello world")
	})

	it("keeps completed text when the next sentence starts from an empty transcription", () => {
		const onResult = vi.fn()
		const toggleRecording = vi.fn()
		mockUseVoiceInput.mockReturnValue({
			status: "idle",
			isRecording: false,
			toggleRecording,
			disconnect: vi.fn(),
		})

		render(<InlineVoiceButton value="Draft: " onResult={onResult} />)

		const voiceOptions = mockUseVoiceInput.mock.calls[0][0]

		fireEvent.click(screen.getByRole("button"))

		act(() => {
			voiceOptions.onResult("First sentence.")
			voiceOptions.onResult("")
			voiceOptions.onResult("Second")
			voiceOptions.onResult("Second sentence.")
		})

		expect(onResult).toHaveBeenNthCalledWith(1, "Draft: First sentence.")
		expect(onResult).toHaveBeenNthCalledWith(2, "Draft: First sentence.")
		expect(onResult).toHaveBeenNthCalledWith(3, "Draft: First sentence.Second")
		expect(onResult).toHaveBeenNthCalledWith(4, "Draft: First sentence.Second sentence.")
	})
})
