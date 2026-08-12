import { describe, expect, it } from "vitest"
import type { RecordingTranscriptSegment } from "../../types/recording-detail"
import {
	filterTranscriptSegmentsBySearchQuery,
	normalizeTranscriptSearchQuery,
	splitTranscriptTextBySearchQuery,
} from "../transcript-search"

const segments: RecordingTranscriptSegment[] = [
	{
		id: "segment-alpha",
		start: 2,
		end: 7,
		speaker: "Speaker-Alpha",
		text: "Draft Plan and draft notes",
	},
	{
		id: "segment-beta",
		start: 8,
		end: 12,
		speaker: "Speaker-Beta",
		text: "Review the [sample] output",
	},
]

/** Verifies the literal transcript search contract independently from React rendering. */
describe("transcript search", () => {
	it("trims only outer query whitespace", () => {
		expect(normalizeTranscriptSearchQuery("  draft plan  ")).toBe("draft plan")
	})

	it("filters body text with case-insensitive literal matching", () => {
		expect(filterTranscriptSegmentsBySearchQuery(segments, "DRAFT")).toEqual([segments[0]])
		expect(filterTranscriptSegmentsBySearchQuery(segments, "[sample]")).toEqual([segments[1]])
	})

	it("returns the original segment list when the normalized query is empty", () => {
		expect(filterTranscriptSegmentsBySearchQuery(segments, "   ")).toBe(segments)
	})

	it("splits every non-overlapping match while preserving original casing", () => {
		expect(splitTranscriptTextBySearchQuery(segments[0].text, "draft")).toEqual([
			{ text: "Draft", matched: true },
			{ text: " Plan and ", matched: false },
			{ text: "draft", matched: true },
			{ text: " notes", matched: false },
		])
	})

	it("keeps unmatched text as a single plain part", () => {
		expect(splitTranscriptTextBySearchQuery("Synthetic transcript", "missing")).toEqual([
			{ text: "Synthetic transcript", matched: false },
		])
	})
})
