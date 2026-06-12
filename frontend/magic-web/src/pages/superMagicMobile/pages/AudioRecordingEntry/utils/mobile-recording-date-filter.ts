import type { MobileAudioRecordingsDatePreset } from "../types"

/** Converts Date to unix timestamp (seconds) at start of local day */
function toStartOfDayTimestamp(date: Date): number {
	const normalized = new Date(date)
	normalized.setHours(0, 0, 0, 0)
	return Math.floor(normalized.getTime() / 1000)
}

/** Converts Date to unix timestamp (seconds) at end of local day */
function toEndOfDayTimestamp(date: Date): number {
	const normalized = new Date(date)
	normalized.setHours(23, 59, 59, 999)
	return Math.floor(normalized.getTime() / 1000)
}

/** Maps prototype date presets to API created_at range (unix seconds) */
export function resolveMobileDatePresetRange(preset: MobileAudioRecordingsDatePreset): {
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
	if (preset === "month") startDate.setTime(now.getTime() - 30 * 86_400_000)

	return { start: toStartOfDayTimestamp(startDate), end }
}
