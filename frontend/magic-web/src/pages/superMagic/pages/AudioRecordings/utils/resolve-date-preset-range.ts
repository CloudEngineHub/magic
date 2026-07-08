/** Shared date presets for PC and mobile recording list filters */
export type AudioRecordingsDatePreset = "all" | "today" | "week" | "month"

/** Normalizes a date to the first second of the local day for filter requests. */
function toStartOfDayTimestamp(date: Date): number {
	const normalized = new Date(date)
	normalized.setHours(0, 0, 0, 0)
	return Math.floor(normalized.getTime() / 1000)
}

/** Normalizes a date to the last millisecond of the local day for filter requests. */
function toEndOfDayTimestamp(date: Date): number {
	const normalized = new Date(date)
	normalized.setHours(23, 59, 59, 999)
	return Math.floor(normalized.getTime() / 1000)
}

/** Maps shared date presets to API created_at range (unix seconds, local timezone) */
export function resolveDatePresetRange(preset: AudioRecordingsDatePreset): {
	start?: number
	end?: number
} {
	if (preset === "all") return {}

	const now = new Date()
	const end = toEndOfDayTimestamp(now)

	if (preset === "today") {
		const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
		return { start: toStartOfDayTimestamp(startDate), end }
	}

	const startDate = new Date(now)
	if (preset === "week") startDate.setDate(startDate.getDate() - 6)
	// Keep "Last 30 days" inclusive of today, matching the week preset semantics.
	if (preset === "month") startDate.setDate(startDate.getDate() - 29)

	return { start: toStartOfDayTimestamp(startDate), end }
}
