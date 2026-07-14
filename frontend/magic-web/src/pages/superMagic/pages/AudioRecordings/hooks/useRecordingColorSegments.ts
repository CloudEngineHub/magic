import { useMemo } from "react"
import {
	buildColorSegmentsFromTopics,
	type FlatColorSegment,
} from "../utils/chapter-color-segments"
import { parseTopicsMarkdown } from "../utils/topics-parser"

/**
 * Builds waveform chapter color bands from topics summary markdown when summary is ready.
 * Shared by PC and mobile recording detail pages.
 */
export function useRecordingColorSegments(
	summaryReady: boolean,
	topicsMarkdown?: string,
): FlatColorSegment[] | undefined {
	return useMemo(() => {
		if (!summaryReady || !topicsMarkdown) return undefined
		const segments = buildColorSegmentsFromTopics(parseTopicsMarkdown(topicsMarkdown))
		return segments.length > 0 ? segments : undefined
	}, [summaryReady, topicsMarkdown])
}
