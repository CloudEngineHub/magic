import { describe, expect, it } from "vitest"
import { buildColorSegmentsFromTopics } from "../chapter-color-segments"
import type { RecordingTopicSection } from "../../types/recording-detail"

describe("buildColorSegmentsFromTopics", () => {
	it("maps topic dialogue ranges into flat waveform color segments", () => {
		const topics: RecordingTopicSection[] = [
			{
				id: "topic_a",
				name: "Topic A",
				color: "#112233",
				summaryTitle: "Summary",
				summaryText: "Body",
				summarySpeakers: [],
				itemsTitle: "Related",
				items: [
					{ time: 10, timeEnd: 40, speakers: ["spk_a"], text: "Line one" },
					{ time: 50, speakers: ["spk_b"], text: "Line two" },
				],
			},
		]

		expect(buildColorSegmentsFromTopics(topics)).toEqual([
			{ start: 10, end: 50, color: "#112233" },
		])
	})
})
