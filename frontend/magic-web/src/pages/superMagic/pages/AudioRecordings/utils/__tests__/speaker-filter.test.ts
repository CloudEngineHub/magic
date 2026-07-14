import { describe, expect, it } from "vitest"
import {
	filterTranscriptSegmentsBySpeakerIds,
	isSpeakerFilterActive,
	normalizeSpeakerSelection,
	toggleSpeakerSelection,
} from "../speaker-filter"

/** Verifies the shared speaker-filter state machine used by both desktop and mobile detail pages. */
describe("speaker-filter", () => {
	it("falls back to all speakers when the selection is empty or invalid", () => {
		expect(normalizeSpeakerSelection(["Speaker-1", "Speaker-2"], [])).toEqual([
			"Speaker-1",
			"Speaker-2",
		])
		expect(
			normalizeSpeakerSelection(["Speaker-1", "Speaker-2"], ["Speaker-9", "Speaker-2"]),
		).toEqual(["Speaker-2"])
		expect(normalizeSpeakerSelection(["Speaker-1", "Speaker-2"], ["Speaker-9"])).toEqual([
			"Speaker-1",
			"Speaker-2",
		])
	})

	it("treats toggling from all-selected as excluding the tapped speaker", () => {
		expect(
			toggleSpeakerSelection(
				["Speaker-1", "Speaker-2", "Speaker-3"],
				["Speaker-1", "Speaker-2", "Speaker-3"],
				"Speaker-2",
			),
		).toEqual(["Speaker-1", "Speaker-3"])
	})

	it("never allows the selection to shrink to zero speakers", () => {
		expect(toggleSpeakerSelection(["Speaker-1"], ["Speaker-1"], "Speaker-1")).toEqual([
			"Speaker-1",
		])
		expect(
			toggleSpeakerSelection(["Speaker-1", "Speaker-2"], ["Speaker-2"], "Speaker-2"),
		).toEqual(["Speaker-2"])
	})

	it("flags the filter as active only when a strict subset is selected", () => {
		expect(isSpeakerFilterActive(["Speaker-1", "Speaker-2"], ["Speaker-1", "Speaker-2"])).toBe(
			false,
		)
		expect(isSpeakerFilterActive(["Speaker-1", "Speaker-2"], ["Speaker-1"])).toBe(true)
	})

	it("filters only speaker-tagged transcript rows and preserves speakerless rows", () => {
		expect(
			filterTranscriptSegmentsBySpeakerIds(
				[
					{ id: "a", start: 0, speaker: "Speaker-1", text: "Alpha" },
					{ id: "b", start: 5, text: "Untyped line" },
					{ id: "c", start: 10, speaker: "Speaker-2", text: "Beta" },
				],
				["Speaker-1"],
			).map((segment) => segment.id),
		).toEqual(["a", "b"])
	})
})
