import { describe, expect, it, vi } from "vitest"
import { playTranscriptFromSegment } from "../transcript-playback"

describe("playTranscriptFromSegment", () => {
	it("seeks to the selected transcript time and keeps playback running", () => {
		const seekTo = vi.fn()

		// The transcript jump should resume continuous playback from the clicked sentence.
		playTranscriptFromSegment({ seekTo }, 55)

		expect(seekTo).toHaveBeenCalledWith(55, { autoplay: true })
	})
})
