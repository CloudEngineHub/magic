import type { RecordingTopicSection } from "../types/recording-detail"

/** Flat time-range segment used to paint the chapter color line on the waveform. */
export interface FlatColorSegment {
	start: number
	end: number
	color: string
}

/**
 * Derives waveform chapter color bands from parsed topics markdown sections.
 * Uses each topic's related-dialogue time ranges to infer start/end boundaries.
 */
export function buildColorSegmentsFromTopics(topics: RecordingTopicSection[]): FlatColorSegment[] {
	return topics
		.map((topic) => {
			if (topic.items.length === 0) return null

			const start = Math.min(...topic.items.map((item) => item.time))
			const end = Math.max(...topic.items.map((item) => item.timeEnd ?? item.time))
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null

			return { start, end, color: topic.color }
		})
		.filter((segment): segment is FlatColorSegment => segment != null)
		.slice()
		.sort((a, b) => a.start - b.start)
}
