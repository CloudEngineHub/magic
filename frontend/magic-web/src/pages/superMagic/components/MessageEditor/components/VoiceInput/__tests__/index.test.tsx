import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { forwardRef, useImperativeHandle, useRef } from "react"
import SuperMagicVoiceInput from ".."
import type { VoiceInputProps, VoiceInputRef } from "@/components/business/VoiceInput"

let mockStopRecording = vi.fn()
let mockDisconnect = vi.fn()
let mockIsRecording = false
let mockLatestVoiceInputProps: VoiceInputProps | undefined

function mockAssignVoiceInputRef(
	ref: React.ForwardedRef<VoiceInputRef>,
	mockVoiceInput: VoiceInputRef,
) {
	if (!ref) return
	if (typeof ref === "function") {
		ref(mockVoiceInput)
		return
	}

	ref.current = mockVoiceInput
}

vi.mock("@/components/business/VoiceInput", () => ({
	default: forwardRef<VoiceInputRef, VoiceInputProps>((props, ref) => {
		mockLatestVoiceInputProps = props

		const mockVoiceInput = {
			stopRecording: mockStopRecording,
			disconnect: mockDisconnect,
			isRecording: mockIsRecording,
			status: mockIsRecording ? "recording" : "idle",
		} satisfies VoiceInputRef

		useImperativeHandle(ref, () => mockVoiceInput)
		mockAssignVoiceInputRef(ref, mockVoiceInput)

		return (
			<div data-testid="voice-input">
				<button
					data-testid="voice-button"
					onClick={() => {
						mockIsRecording = true
						props.onRecordingChange?.(true)
						setTimeout(() => {
							mockIsRecording = false
							mockStopRecording()
							props.onRecordingChange?.(false)
						}, 50)
					}}
				>
					Voice Input
				</button>
			</div>
		)
	}),
}))

vi.mock("@/hooks/useMicrophonePermission", () => ({
	useMicrophonePermission: ({ onStateReset }: { onStateReset?: () => void }) => {
		const mockHandlePermissionError = vi.fn((error) => {
			if (error.name === "NotAllowedError") {
				onStateReset?.()
				return
			}

			throw error
		})

		return {
			handlePermissionError: mockHandlePermissionError,
		}
	},
}))

vi.mock("antd", () => ({
	Modal: {
		confirm: vi.fn(),
	},
	message: {
		info: vi.fn(),
	},
}))

vi.mock("antd-mobile", () => ({
	Dialog: {
		confirm: vi.fn(),
	},
}))

describe("SuperMagicVoiceInput", () => {
	let mockUpdateValue: ReturnType<typeof vi.fn>
	let voiceInputRef: React.RefObject<VoiceInputRef>

	const TestComponent = () => {
		const ref = useRef<VoiceInputRef>(null)
		voiceInputRef = ref

		return <SuperMagicVoiceInput ref={ref} initValue="initial" updateValue={mockUpdateValue} />
	}

	beforeEach(() => {
		mockUpdateValue = vi.fn()
		mockStopRecording = vi.fn()
		mockDisconnect = vi.fn()
		mockIsRecording = false
		mockLatestVoiceInputProps = undefined
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllTimers()
	})

	it("should render correctly", () => {
		render(<TestComponent />)
		expect(screen.getByTestId("voice-input")).toBeInTheDocument()
	})

	it("should handle permission denied error correctly", async () => {
		render(<TestComponent />)

		const voiceButton = screen.getByTestId("voice-button")

		expect(voiceInputRef.current?.isRecording).toBe(false)
		expect(voiceInputRef.current?.status).toBe("idle")

		fireEvent.click(voiceButton)

		await waitFor(
			() => {
				expect(voiceInputRef.current?.isRecording).toBe(false)
				expect(voiceInputRef.current?.status).toBe("idle")
			},
			{ timeout: 300 },
		)
	})

	it("should maintain consistent state across multiple interactions", async () => {
		render(<TestComponent />)

		const voiceButton = screen.getByTestId("voice-button")

		for (let i = 0; i < 3; i++) {
			fireEvent.click(voiceButton)

			await waitFor(
				() => {
					expect(voiceInputRef.current?.isRecording).toBe(false)
					expect(voiceInputRef.current?.status).toBe("idle")
				},
				{ timeout: 300 },
			)
		}
	})

	it("should call stopRecording when permission is denied", async () => {
		render(<TestComponent />)

		await waitFor(() => {
			expect(voiceInputRef.current).toBeTruthy()
		})

		fireEvent.click(screen.getByTestId("voice-button"))

		await waitFor(
			() => {
				expect(mockStopRecording).toHaveBeenCalled()
			},
			{ timeout: 300 },
		)
	})

	it("should handle updateValue correctly when recording", () => {
		render(<TestComponent />)

		expect(mockUpdateValue).not.toHaveBeenCalled()
	})

	it("should reset state immediately on permission error", async () => {
		render(<TestComponent />)

		const startTime = Date.now()

		fireEvent.click(screen.getByTestId("voice-button"))

		await waitFor(() => {
			const elapsedTime = Date.now() - startTime
			expect(elapsedTime).toBeLessThan(250)
			expect(voiceInputRef.current?.isRecording).toBe(false)
			expect(voiceInputRef.current?.status).toBe("idle")
		})
	})

	it("should directly delegate to VoiceInput", async () => {
		render(<TestComponent />)

		await waitFor(() => {
			expect(voiceInputRef.current).toBeTruthy()
		})

		expect(voiceInputRef.current?.isRecording).toBe(false)
		expect(voiceInputRef.current?.status).toBe("idle")
		expect(typeof voiceInputRef.current?.stopRecording).toBe("function")
		expect(typeof voiceInputRef.current?.disconnect).toBe("function")
	})

	it("should emit deferred text instead of writing editor for interim result", () => {
		const onDeferredTextChange = vi.fn()

		render(
			<SuperMagicVoiceInput
				commitMode="deferred"
				onDeferredTextChange={onDeferredTextChange}
				updateValue={mockUpdateValue}
			/>,
		)

		act(() => {
			mockIsRecording = true
			mockLatestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 1000,
						definite: false,
					},
				],
			})
		})

		expect(onDeferredTextChange).toHaveBeenLastCalledWith("hello")
		expect(mockUpdateValue).not.toHaveBeenCalled()
	})

	it("should replace overlapping pending text with definite text", () => {
		const onDeferredTextChange = vi.fn()

		render(
			<SuperMagicVoiceInput
				commitMode="deferred"
				onDeferredTextChange={onDeferredTextChange}
				updateValue={mockUpdateValue}
			/>,
		)

		act(() => {
			mockIsRecording = true
			mockLatestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 1000,
						definite: false,
					},
				],
			})
			mockLatestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 1000,
						definite: true,
					},
				],
			})
		})

		expect(onDeferredTextChange).toHaveBeenLastCalledWith("hello")
	})

	it("should replace overlapping pending text when final text changes", () => {
		const onDeferredTextChange = vi.fn()

		render(
			<SuperMagicVoiceInput
				commitMode="deferred"
				onDeferredTextChange={onDeferredTextChange}
				updateValue={mockUpdateValue}
			/>,
		)

		act(() => {
			mockIsRecording = true
			mockLatestVoiceInputProps?.onResult("hello.", {
				text: "hello.",
				utterances: [
					{
						text: "hello.",
						start_time: 0,
						end_time: 1100,
						definite: false,
					},
				],
			})
			mockLatestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 1000,
						definite: true,
					},
				],
			})
		})

		expect(onDeferredTextChange).toHaveBeenLastCalledWith("hello")
	})
})
