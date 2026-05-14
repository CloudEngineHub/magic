import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import VoiceInput from ".."
import type { UseVoiceInputOptions } from "../hooks"

const mockToggleRecording = vi.fn()
const mockStopRecording = vi.fn()
const mockDisconnect = vi.fn()

let mockVoiceState = {
	status: "idle" as const,
	isRecording: false,
}
let mockLatestUseVoiceInputOptions: UseVoiceInputOptions | undefined

vi.mock("@/components/shadcn-ui/tooltip", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagic/components/LazyGuideTour", () => ({
	GuideTourElementId: {
		VoiceInputButton: "voice-input-button",
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
	},
	PubSubEvents: {
		Toggle_Voice_Input: "Toggle_Voice_Input",
	},
}))

vi.mock("../hooks", () => ({
	getHotkeyDisplayText: () => "Ctrl+Shift+E",
	useVoiceInput: (options: UseVoiceInputOptions = {}) => {
		mockLatestUseVoiceInputOptions = options

		return {
			status: mockVoiceState.status,
			isConnected: mockVoiceState.status !== "idle",
			isRecording: mockVoiceState.isRecording,
			connect: vi.fn(),
			disconnect: mockDisconnect,
			startRecording: vi.fn(),
			stopRecording: mockStopRecording,
			toggleRecording: mockToggleRecording,
		}
	},
}))

describe("VoiceInput", () => {
	beforeEach(() => {
		mockVoiceState = {
			status: "idle",
			isRecording: false,
		}
		mockLatestUseVoiceInputOptions = undefined
		mockToggleRecording.mockClear()
		mockStopRecording.mockClear()
		mockDisconnect.mockClear()
	})

	it("renders realtime waveform while recording", () => {
		mockVoiceState = {
			status: "recording",
			isRecording: true,
		}

		render(<VoiceInput onResult={vi.fn()} />)

		expect(screen.getByTestId("voice-input-waveform")).toBeInTheDocument()
		expect(screen.getAllByTestId("voice-input-waveform-bar")).toHaveLength(5)
	})

	it("renders configured waveform bar count", () => {
		mockVoiceState = {
			status: "recording",
			isRecording: true,
		}

		render(<VoiceInput onResult={vi.fn()} waveformBarCount={44} />)

		expect(screen.getAllByTestId("voice-input-waveform-bar")).toHaveLength(44)
	})

	it("does not toggle recording when toggleOnClick is false", () => {
		render(<VoiceInput onResult={vi.fn()} toggleOnClick={false} />)

		fireEvent.click(screen.getByTestId("voice-input-button"))

		expect(mockToggleRecording).not.toHaveBeenCalled()
	})

	it("updates waveform height after receiving an audio chunk", () => {
		mockVoiceState = {
			status: "recording",
			isRecording: true,
		}
		const onWaveformLevelsChange = vi.fn()

		render(<VoiceInput onResult={vi.fn()} onWaveformLevelsChange={onWaveformLevelsChange} />)

		const firstBar = screen.getAllByTestId("voice-input-waveform-bar")[0]
		const initialHeight = firstBar.style.height
		const audioData = new Int16Array([0, 12000, -12000, 16000, -16000]).buffer

		act(() => {
			mockLatestUseVoiceInputOptions?.onAudioChunk?.({
				audioData,
				recordingId: "recording-id",
			})
		})

		expect(firstBar.style.height).not.toBe(initialHeight)
		expect(onWaveformLevelsChange).toHaveBeenCalled()
	})

	it("hides waveform and keeps idle status after recording stops", () => {
		mockVoiceState = {
			status: "recording",
			isRecording: true,
		}
		const { rerender } = render(<VoiceInput onResult={vi.fn()} />)

		expect(screen.getByTestId("voice-input-waveform")).toBeInTheDocument()

		mockVoiceState = {
			status: "idle",
			isRecording: false,
		}
		rerender(<VoiceInput onResult={vi.fn()} />)

		expect(screen.queryByTestId("voice-input-waveform")).not.toBeInTheDocument()
		expect(screen.getByTestId("voice-input-button")).toHaveAttribute("data-status", "idle")
	})
})
