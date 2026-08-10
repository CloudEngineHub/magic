import type { RecordingTranscriptSegment } from "../types/recording-detail"

export interface TranscriptSearchTextPart {
	text: string
	matched: boolean
}

/** Normalizes user input while preserving meaningful whitespace inside the query. */
export function normalizeTranscriptSearchQuery(query: string) {
	return query.trim()
}

/** Filters transcript segments by a case-insensitive literal match against body text only. */
export function filterTranscriptSegmentsBySearchQuery(
	segments: RecordingTranscriptSegment[],
	query: string,
) {
	const normalizedQuery = normalizeTranscriptSearchQuery(query)
	if (!normalizedQuery) return segments

	const comparableQuery = normalizedQuery.toLowerCase()
	return segments.filter((segment) => segment.text.toLowerCase().includes(comparableQuery))
}

/** Splits transcript text into plain and matched parts for safe highlight rendering. */
export function splitTranscriptTextBySearchQuery(
	text: string,
	query: string,
): TranscriptSearchTextPart[] {
	const normalizedQuery = normalizeTranscriptSearchQuery(query)
	if (!normalizedQuery || !text) return [{ text, matched: false }]

	const comparableText = text.toLowerCase()
	const comparableQuery = normalizedQuery.toLowerCase()
	const parts: TranscriptSearchTextPart[] = []
	let cursor = 0

	while (cursor < text.length) {
		const matchIndex = comparableText.indexOf(comparableQuery, cursor)
		if (matchIndex < 0) break

		if (matchIndex > cursor) {
			parts.push({ text: text.slice(cursor, matchIndex), matched: false })
		}
		parts.push({
			text: text.slice(matchIndex, matchIndex + normalizedQuery.length),
			matched: true,
		})
		cursor = matchIndex + normalizedQuery.length
	}

	if (cursor < text.length) {
		parts.push({ text: text.slice(cursor), matched: false })
	}

	return parts.length > 0 ? parts : [{ text, matched: false }]
}
