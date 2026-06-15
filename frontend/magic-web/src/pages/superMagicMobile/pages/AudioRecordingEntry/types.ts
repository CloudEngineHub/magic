import type {
	AudioProjectSortBy,
	AudioProjectSortOrder,
	AudioRecordingSummaryFilter,
} from "@/types/audioProject"

/** Prototype-aligned date presets — no custom range on mobile */
export type MobileAudioRecordingsDatePreset = "all" | "today" | "week" | "month"

/** Mobile list supports the same two sort options as PC V1 */
export type MobileAudioRecordingsSortOption = "updated_at_desc" | "created_at_desc"

/** Secondary filter state shown in the filter sheet (date + sort) */
export interface MobileAudioRecordingsFilterState {
	datePreset: MobileAudioRecordingsDatePreset
	sortOption: MobileAudioRecordingsSortOption
}

/** Default filter: all dates, sort by updated_at desc (PC default for mobile) */
export const MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT: MobileAudioRecordingsFilterState = {
	datePreset: "all",
	sortOption: "updated_at_desc",
}

/** Parses a mobile sort option key into API sort params */
export function parseMobileSortOption(option: MobileAudioRecordingsSortOption): {
	sortBy: AudioProjectSortBy
	sortOrder: AudioProjectSortOrder
} {
	if (option === "created_at_desc") {
		return { sortBy: "created_at", sortOrder: "desc" }
	}
	return { sortBy: "updated_at", sortOrder: "desc" }
}

/**
 * Counts active secondary filters for the toolbar badge.
 * Summary status is included because mobile now places it inside the filter sheet.
 */
export function countActiveMobileAudioFilters(
	state: MobileAudioRecordingsFilterState,
	summaryFilter: AudioRecordingSummaryFilter = "all",
): number {
	let count = 0
	if (state.datePreset !== "all") count++
	if (state.sortOption !== "updated_at_desc") count++
	if (summaryFilter !== "all") count++
	return count
}
