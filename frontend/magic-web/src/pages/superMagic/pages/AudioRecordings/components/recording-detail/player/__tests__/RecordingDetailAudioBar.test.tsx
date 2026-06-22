import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { RecordingDetailAudioBar } from "../RecordingDetailAudioBar"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { rate?: string }) => {
			if (key === "detail.player.playbackSpeed") return `${options?.rate ?? ""}x`
			if (key === "detail.pause") return "Pause"
			if (key === "detail.play") return "Play"
			return key
		},
	}),
}))

describe("RecordingDetailAudioBar", () => {
	const baseProps = {
		audioRef: { current: null },
		audioUrl: "test.mp3",
		durationSec: 125,
		currentSec: 10,
		playing: false,
		expanded: false,
		rate: 1,
		peakNorms: [0.2, 0.8, 0.4],
		onExpandedChange: vi.fn(),
		onTogglePlay: vi.fn(),
		onSeek: vi.fn(),
		onPlaybackRateChange: vi.fn(),
	}

	it("renders expanded controls with prototype skip icons", () => {
		render(<RecordingDetailAudioBar {...baseProps} expanded />)

		expect(screen.getByText("00:00:10")).toBeInTheDocument()
		expect(screen.getByLabelText("detail.player.skipBackAria")).toBeInTheDocument()
		expect(screen.getByLabelText("detail.player.skipForwardAria")).toBeInTheDocument()
	})

	it("uses default ±15s skip handlers when callbacks are omitted", () => {
		const onSeek = vi.fn()
		render(<RecordingDetailAudioBar {...baseProps} expanded currentSec={30} onSeek={onSeek} />)

		fireEvent.click(screen.getByLabelText("detail.player.skipBackAria"))
		fireEvent.click(screen.getByLabelText("detail.player.skipForwardAria"))

		expect(onSeek).toHaveBeenNthCalledWith(1, 15)
		expect(onSeek).toHaveBeenNthCalledWith(2, 45)
	})

	it("opens playback rate menu in expanded mode", () => {
		const onPlaybackRateChange = vi.fn()
		render(
			<RecordingDetailAudioBar
				{...baseProps}
				expanded
				onPlaybackRateChange={onPlaybackRateChange}
			/>,
		)

		fireEvent.click(screen.getByLabelText("detail.player.playbackRateMenuAria"))
		fireEvent.click(screen.getByRole("option", { name: "1.5x" }))
		expect(onPlaybackRateChange).toHaveBeenCalledWith(1.5)
	})
})
