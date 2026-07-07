import type { RecordingTranscriptSegment } from "../types/recording-detail"

/** Keeps only valid speaker ids and falls back to "all selected" when nothing valid remains. */
export function normalizeSpeakerSelection(speakerIds: string[], selectedIds: string[]) {
	const normalized = speakerIds.filter((speakerId) => selectedIds.includes(speakerId))
	return normalized.length > 0 ? normalized : speakerIds
}

/** Implements the prototype selection rule set while preventing an empty selection. */
export function toggleSpeakerSelection(
	speakerIds: string[],
	selectedIds: string[],
	targetId: string,
) {
	const normalized = normalizeSpeakerSelection(speakerIds, selectedIds)
	const allSelected = normalized.length === speakerIds.length

	if (allSelected) {
		if (speakerIds.length <= 1) return normalized
		return speakerIds.filter((speakerId) => speakerId !== targetId)
	}

	const next = normalized.includes(targetId)
		? normalized.filter((speakerId) => speakerId !== targetId)
		: [...normalized, targetId]

	if (next.length === 0) return normalized
	return speakerIds.filter((speakerId) => next.includes(speakerId))
}

/** Flags whether the current selection is narrower than the full speaker set. */
export function isSpeakerFilterActive(speakerIds: string[], selectedIds: string[]) {
	return normalizeSpeakerSelection(speakerIds, selectedIds).length < speakerIds.length
}

/** Filters only speaker-tagged segments so speakerless lines remain visible under every filter. */
export function filterTranscriptSegmentsBySpeakerIds(
	segments: RecordingTranscriptSegment[],
	selectedIds: string[],
) {
	return segments.filter((segment) => !segment.speaker || selectedIds.includes(segment.speaker))
}
