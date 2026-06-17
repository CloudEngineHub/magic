import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { MobileRecordingAudioPlayer } from "../components/MobileRecordingAudioPlayer"

describe("MobileRecordingAudioPlayer", () => {
	const defaultProps = {
		audioRef: { current: null },
		audioUrl: "test.mp3",
		currentTime: 10,
		duration: 125,
		progress: 8,
		playing: false,
		expanded: false,
		onToggle: vi.fn(),
		onSeek: vi.fn(),
		onExpandedChange: vi.fn(),
		playbackRate: 1.0,
		onPlaybackRateChange: vi.fn(),
	}

	it("renders collapsed player correctly", () => {
		render(<MobileRecordingAudioPlayer {...defaultProps} />)

		// Collapsed player should display playback time in MM:SS format
		expect(screen.getByText("0:10 / 2:05")).toBeInTheDocument()
		// Should show play button and expand button
		expect(screen.getByLabelText("expand")).toBeInTheDocument()
	})

	it("renders expanded player correctly with custom SVG and rate dropdown menu", () => {
		const props = { ...defaultProps, expanded: true }
		render(<MobileRecordingAudioPlayer {...props} />)

		// Expanded player should display time in HH:MM:SS format
		expect(screen.getByText("00:00:10")).toBeInTheDocument()
		expect(screen.getByText("00:02:05")).toBeInTheDocument()

		// Should show playback rate button
		const rateBtn = screen.getByLabelText("Speed")
		expect(rateBtn).toBeInTheDocument()
		expect(rateBtn).toHaveTextContent("1.0x")

		// Click to open rate listbox
		fireEvent.click(rateBtn)
		const option15 = screen.getByRole("option", { name: "1.5x" })
		expect(option15).toBeInTheDocument()

		// Select rate
		fireEvent.click(option15)
		expect(props.onPlaybackRateChange).toHaveBeenCalledWith(1.5)
	})
})
