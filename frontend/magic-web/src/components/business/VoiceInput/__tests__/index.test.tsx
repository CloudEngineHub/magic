import { act, fireEvent, render, screen } from "@testing-library/react"
import type { CSSProperties, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import VoiceInput from ".."
import type { UseVoiceInputOptions } from "../hooks/useVoiceInput"
import type { VoiceInputStatus } from "../types"

interface MockVoiceInputState {
	status: VoiceInputStatus
	isRecording: boolean
}

let latestUseVoiceInputOptions: UseVoiceInputOptions | undefined
let mockToggleRecording = vi.fn()
let mockDisconnect = vi.fn()
let mockVoiceInputState: MockVoiceInputState = {
	status: "idle",
	isRecording: false,
}

vi.mock("@/components/shadcn-ui/tooltip", () => ({
	Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("antd-mobile", () => ({
	SpinLoading: ({ style }: { style?: CSSProperties }) => (
		<div data-testid="voice-input-loading" style={style} />
	),
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
		Toggle_Voice_Input: "toggle-voice-input",
	},
}))

vi.mock("../hooks", () => ({
	getHotkeyDisplayText: () => "⌘⇧E",
	useVoiceInput: (options: UseVoiceInputOptions) => {
		latestUseVoiceInputOptions = options

		return {
			status: mockVoiceInputState.status,
			isRecording: mockVoiceInputState.isRecording,
			toggleRecording: mockToggleRecording,
			stopRecording: vi.fn(),
			disconnect: mockDisconnect,
		}
	},
}))

function createAudioChunk(sampleValue: number): ArrayBuffer {
	const samples = new Int16Array(64)
	samples.fill(sampleValue)
	return samples.buffer
}

describe("VoiceInput", () => {
	beforeEach(() => {
		latestUseVoiceInputOptions = undefined
		mockToggleRecording = vi.fn()
		mockDisconnect = vi.fn()
		mockVoiceInputState = {
			status: "idle",
			isRecording: false,
		}
	})

	it("renders realtime waveform while recording", () => {
		mockVoiceInputState = {
			status: "recording",
			isRecording: true,
		}

		render(<VoiceInput onResult={vi.fn()} />)

		expect(screen.getByTestId("voice-input-waveform")).toBeInTheDocument()
		expect(screen.getAllByTestId("voice-input-waveform-bar")).toHaveLength(11)
	})

	it("supports wider waveform display without toggling on click", () => {
		mockVoiceInputState = {
			status: "recording",
			isRecording: true,
		}

		render(<VoiceInput onResult={vi.fn()} toggleOnClick={false} waveformBarCount={44} />)
		fireEvent.click(screen.getByTestId("voice-input-button"))

		expect(screen.getAllByTestId("voice-input-waveform-bar")).toHaveLength(44)
		expect(mockToggleRecording).not.toHaveBeenCalled()
	})

	it("updates waveform height when audio chunks arrive", () => {
		mockVoiceInputState = {
			status: "recording",
			isRecording: true,
		}

		render(<VoiceInput onResult={vi.fn()} iconSize={24} />)

		const initialLastBar = screen.getAllByTestId("voice-input-waveform-bar").at(-1)
		const initialHeight = Number.parseFloat(initialLastBar?.style.height ?? "0")

		act(() => {
			latestUseVoiceInputOptions?.onAudioChunk?.({
				audioData: createAudioChunk(16000),
				recordingId: "recording-id",
				chunkIndex: 0,
			})
		})

		const updatedLastBar = screen.getAllByTestId("voice-input-waveform-bar").at(-1)
		const updatedHeight = Number.parseFloat(updatedLastBar?.style.height ?? "0")

		expect(updatedHeight).toBeGreaterThan(initialHeight)
	})

	it("hides waveform after recording stops", () => {
		mockVoiceInputState = {
			status: "recording",
			isRecording: true,
		}

		const { rerender } = render(<VoiceInput onResult={vi.fn()} />)
		expect(screen.getByTestId("voice-input-waveform")).toBeInTheDocument()

		mockVoiceInputState = {
			status: "idle",
			isRecording: false,
		}
		rerender(<VoiceInput onResult={vi.fn()} />)

		expect(screen.queryByTestId("voice-input-waveform")).not.toBeInTheDocument()
		expect(screen.getByTestId("voice-input-button")).toHaveAttribute("data-status", "idle")
	})
})
