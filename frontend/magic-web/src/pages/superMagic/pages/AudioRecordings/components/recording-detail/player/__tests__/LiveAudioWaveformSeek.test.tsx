import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LiveAudioWaveformSeek } from "../LiveAudioWaveformSeek"

describe("LiveAudioWaveformSeek", () => {
	it("seeks when arrow keys are pressed", () => {
		const onSeek = vi.fn()
		render(
			<LiveAudioWaveformSeek
				durationSec={120}
				currentSec={30}
				peakNorms={[0.3, 0.7, 0.5]}
				maxBarPx={20}
				paused={false}
				onSeek={onSeek}
				ariaLabel="seek"
				seekKeyboardStep={15}
			/>,
		)

		const slider = screen.getByRole("slider", { name: "seek" })
		fireEvent.keyDown(slider, { key: "ArrowRight" })
		expect(onSeek).toHaveBeenCalledWith(45)
	})
})
