import { act, render, screen, fireEvent, waitFor } from "@testing-library/react"
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest"
import { forwardRef, useRef, type ForwardedRef, type RefObject } from "react"
import SuperMagicVoiceInput from ".."
import { VoiceInputRef, type VoiceInputProps } from "@/components/business/VoiceInput"

// Mock dependencies
let mockStopRecording = vi.fn()
let mockDisconnect = vi.fn()
let mockIsRecording = false
let latestVoiceInputProps: VoiceInputProps | undefined

function assignMockVoiceInputRef(ref: ForwardedRef<VoiceInputRef>, value: VoiceInputRef) {
	if (typeof ref === "function") {
		ref(value)
		return
	}

	if (ref) ref.current = value
}

vi.mock("@/components/business/VoiceInput", () => ({
	default: forwardRef<VoiceInputRef, VoiceInputProps>((props, ref) => {
		const { onRecordingChange } = props
		latestVoiceInputProps = props
		// Reset mock implementation
		mockStopRecording.mockImplementation(() => {
			// Simulate state changes after stopRecording is called
			mockIsRecording = false
			onRecordingChange?.(false)
		})

		// Mock VoiceInput component
		const mockVoiceInput = {
			stopRecording: mockStopRecording,
			disconnect: mockDisconnect,
			isRecording: mockIsRecording,
			status: "idle" as const,
		}

		// Expose mock methods to tests
		assignMockVoiceInputRef(ref, mockVoiceInput)

		return (
			<div data-testid="voice-input">
				<button
					data-testid="voice-button"
					onClick={() => {
						// Simulate permission denial; VoiceInput now handles it internally and calls stopRecording
						onRecordingChange?.(true) // Simulate recording start first
						setTimeout(() => {
							// Simulate internal handling for permission errors
							mockStopRecording()
							onRecordingChange?.(false) // Then stop automatically
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
				// Handle permission errors without throwing
			} else {
				throw error
			}
		})

		return {
			handlePermissionError: mockHandlePermissionError,
		}
	},
}))

// Mock antd components
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
	let voiceInputRef: RefObject<VoiceInputRef>

	// Test wrapper component
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
		latestVoiceInputProps = undefined
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

		// Initial state should be idle and not recording
		expect(voiceInputRef.current?.isRecording).toBe(false)
		expect(voiceInputRef.current?.status).toBe("idle")

		// Click to start recording
		fireEvent.click(voiceButton)

		// Wait for VoiceInput internal permission handling to complete
		await waitFor(
			() => {
				// After permission is denied, state should reset to idle and not recording
				expect(voiceInputRef.current?.isRecording).toBe(false)
				expect(voiceInputRef.current?.status).toBe("idle")
			},
			{ timeout: 300 },
		)
	})

	it("should maintain consistent state across multiple interactions", async () => {
		render(<TestComponent />)

		const voiceButton = screen.getByTestId("voice-button")

		// Click multiple times to test state consistency
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

		// Wait for the component to fully render and ensure the ref is set
		await waitFor(() => {
			expect(voiceInputRef.current).toBeTruthy()
		})

		const voiceButton = screen.getByTestId("voice-button")

		fireEvent.click(voiceButton)

		await waitFor(
			() => {
				expect(mockStopRecording).toHaveBeenCalled()
			},
			{ timeout: 300 },
		)
	})

	it("should handle updateValue correctly when recording", async () => {
		// Simulate a normal recording scenario
		render(<TestComponent />)

		// Accessing internal component methods may require a more complex mock in real tests
		expect(mockUpdateValue).not.toHaveBeenCalled()
	})

	it("should keep deferred voice text out of editor until confirmed", () => {
		mockIsRecording = true
		const handleDeferredTextChange = vi.fn()

		render(
			<SuperMagicVoiceInput
				commitMode="deferred"
				updateValue={mockUpdateValue}
				onDeferredTextChange={handleDeferredTextChange}
			/>,
		)

		act(() => {
			latestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 100,
						definite: false,
					},
				],
			})
		})

		expect(handleDeferredTextChange).toHaveBeenCalledWith("hello")
		expect(mockUpdateValue).not.toHaveBeenCalled()
	})

	it("should replace pending deferred text when matching definite result arrives", () => {
		mockIsRecording = true
		const handleDeferredTextChange = vi.fn()

		render(
			<SuperMagicVoiceInput
				commitMode="deferred"
				updateValue={mockUpdateValue}
				onDeferredTextChange={handleDeferredTextChange}
			/>,
		)

		act(() => {
			latestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 100,
						definite: false,
					},
				],
			})
		})
		act(() => {
			latestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 120,
						definite: true,
					},
				],
			})
		})

		expect(handleDeferredTextChange).toHaveBeenLastCalledWith("hello")
		expect(handleDeferredTextChange).not.toHaveBeenCalledWith("hellohello")
		expect(mockUpdateValue).not.toHaveBeenCalled()
	})

	it("should replace overlapping deferred text even when final text changes", () => {
		mockIsRecording = true
		const handleDeferredTextChange = vi.fn()

		render(
			<SuperMagicVoiceInput
				commitMode="deferred"
				updateValue={mockUpdateValue}
				onDeferredTextChange={handleDeferredTextChange}
			/>,
		)

		act(() => {
			latestVoiceInputProps?.onResult("hello", {
				text: "hello",
				utterances: [
					{
						text: "hello",
						start_time: 0,
						end_time: 100,
						definite: false,
					},
				],
			})
		})
		act(() => {
			latestVoiceInputProps?.onResult("hello.", {
				text: "hello.",
				utterances: [
					{
						text: "hello.",
						start_time: 0,
						end_time: 120,
						definite: true,
					},
				],
			})
		})

		expect(handleDeferredTextChange).toHaveBeenLastCalledWith("hello.")
		expect(handleDeferredTextChange).not.toHaveBeenCalledWith("hello.hello")
		expect(mockUpdateValue).not.toHaveBeenCalled()
	})

	it("should reset state immediately on permission error", async () => {
		render(<TestComponent />)

		const voiceButton = screen.getByTestId("voice-button")

		// Record start time
		const startTime = Date.now()

		fireEvent.click(voiceButton)

		// Verify state resets immediately
		await waitFor(() => {
			const elapsedTime = Date.now() - startTime
			expect(elapsedTime).toBeLessThan(250) // Reset should complete within 250ms
			expect(voiceInputRef.current?.isRecording).toBe(false)
			expect(voiceInputRef.current?.status).toBe("idle")
		})
	})

	it("should directly delegate to VoiceInput", async () => {
		render(<TestComponent />)

		await waitFor(() => {
			expect(voiceInputRef.current).toBeTruthy()
		})

		// Verify SuperMagicVoiceInput delegates to VoiceInput correctly
		expect(voiceInputRef.current?.isRecording).toBe(false)
		expect(voiceInputRef.current?.status).toBe("idle")
		expect(typeof voiceInputRef.current?.stopRecording).toBe("function")
	})
})
