import type {
	AudioProjectSortBy,
	AudioProjectSortOrder,
	AudioRecordingSummaryFilter,
} from "@/types/audioProject"
import {
	ALL_RECORDING_GROUP_ID,
	UNGROUPED_RECORDING_GROUP_ID,
} from "@/services/audioRecordings/RecordingGroupsConstants"
import type { AudioRecordingsDatePreset } from "./resolve-date-preset-range"

export const AUDIO_RECORDINGS_FILTER_SESSION_KEY = "audio-recordings.list.filters.v1"

const SUMMARY_FILTERS: AudioRecordingSummaryFilter[] = ["all", "not_summarized", "summarized"]
const DATE_PRESETS: AudioRecordingsDatePreset[] = ["all", "today", "week", "month"]
const SORT_FIELDS: AudioProjectSortBy[] = ["updated_at", "created_at"]
const SORT_ORDERS: AudioProjectSortOrder[] = ["asc", "desc"]

export type MobileAudioRecordingsSessionSortOption = "updated_at_desc" | "created_at_desc"

export interface AudioRecordingsFilterSessionSnapshot {
	summaryFilter: AudioRecordingSummaryFilter
	datePreset: AudioRecordingsDatePreset
	sortBy: AudioProjectSortBy
	sortOrder: AudioProjectSortOrder
	searchKeyword: string
	groupId: string
}

export const DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION: AudioRecordingsFilterSessionSnapshot = {
	summaryFilter: "all",
	datePreset: "all",
	sortBy: "updated_at",
	sortOrder: "desc",
	searchKeyword: "",
	groupId: ALL_RECORDING_GROUP_ID,
}

/** Checks whether a saved value is one of the supported summary filter tabs. */
function isSummaryFilter(value: unknown): value is AudioRecordingSummaryFilter {
	return (
		typeof value === "string" && SUMMARY_FILTERS.includes(value as AudioRecordingSummaryFilter)
	)
}

/** Checks whether a saved value is one of the supported rolling date presets. */
function isDatePreset(value: unknown): value is AudioRecordingsDatePreset {
	return typeof value === "string" && DATE_PRESETS.includes(value as AudioRecordingsDatePreset)
}

/** Checks whether a saved value is a sort field accepted by the audio-projects list API. */
function isSortBy(value: unknown): value is AudioProjectSortBy {
	return typeof value === "string" && SORT_FIELDS.includes(value as AudioProjectSortBy)
}

/** Checks whether a saved value is a sort direction accepted by the audio-projects list API. */
function isSortOrder(value: unknown): value is AudioProjectSortOrder {
	return typeof value === "string" && SORT_ORDERS.includes(value as AudioProjectSortOrder)
}

/** Normalizes unknown JSON into the strict shared PC/H5 list-filter snapshot. */
function normalizeAudioRecordingsFilterSession(
	value: unknown,
): AudioRecordingsFilterSessionSnapshot | null {
	if (value == null || typeof value !== "object") return null

	const candidate = value as Partial<AudioRecordingsFilterSessionSnapshot>
	if (
		!isSummaryFilter(candidate.summaryFilter) ||
		!isDatePreset(candidate.datePreset) ||
		!isSortBy(candidate.sortBy) ||
		!isSortOrder(candidate.sortOrder) ||
		typeof candidate.searchKeyword !== "string" ||
		typeof candidate.groupId !== "string"
	) {
		return null
	}

	return {
		summaryFilter: candidate.summaryFilter,
		datePreset: candidate.datePreset,
		sortBy: candidate.sortBy,
		sortOrder: candidate.sortOrder,
		searchKeyword: candidate.searchKeyword,
		groupId: candidate.groupId,
	}
}

/** Reads the shared session-scoped list filter cache, falling back safely on bad storage data. */
export function readAudioRecordingsFilterSession(): AudioRecordingsFilterSessionSnapshot {
	try {
		if (typeof window === "undefined" || !window.sessionStorage) {
			return DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION
		}

		const raw = window.sessionStorage.getItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY)
		if (!raw) return DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION

		const parsed = JSON.parse(raw)
		return (
			normalizeAudioRecordingsFilterSession(parsed) ?? DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION
		)
	} catch (error) {
		console.warn("Failed to read audio recordings filter session:", error)
		return DEFAULT_AUDIO_RECORDINGS_FILTER_SESSION
	}
}

/** Writes the current list filter snapshot without affecting non-query UI state. */
export function writeAudioRecordingsFilterSession(
	snapshot: AudioRecordingsFilterSessionSnapshot,
): void {
	try {
		if (typeof window === "undefined" || !window.sessionStorage) return
		window.sessionStorage.setItem(AUDIO_RECORDINGS_FILTER_SESSION_KEY, JSON.stringify(snapshot))
	} catch (error) {
		console.warn("Failed to write audio recordings filter session:", error)
	}
}

/** Merges a partial query-state update into the existing shared session snapshot. */
export function patchAudioRecordingsFilterSession(
	patch: Partial<AudioRecordingsFilterSessionSnapshot>,
): AudioRecordingsFilterSessionSnapshot {
	const next = {
		...readAudioRecordingsFilterSession(),
		...patch,
	}
	writeAudioRecordingsFilterSession(next)
	return next
}

/** Converts shared sort fields into the mobile sheet's compact sort option. */
export function resolveMobileAudioRecordingsSortOption(
	snapshot: Pick<AudioRecordingsFilterSessionSnapshot, "sortBy" | "sortOrder">,
): MobileAudioRecordingsSessionSortOption {
	if (snapshot.sortBy === "created_at" && snapshot.sortOrder === "desc") return "created_at_desc"
	return "updated_at_desc"
}

/** Keeps deleted or invisible saved group ids from producing an empty list-filter selection. */
export function resolveAvailableAudioRecordingGroupId(
	groupId: string,
	groups: Array<{ id: string }>,
): string {
	if (groupId === ALL_RECORDING_GROUP_ID || groupId === UNGROUPED_RECORDING_GROUP_ID) {
		return groupId
	}

	return groups.some((group) => group.id === groupId) ? groupId : ALL_RECORDING_GROUP_ID
}
