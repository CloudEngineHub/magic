/** Converts M:SS or H:MM:SS style time text into total seconds for playback seeking. */
export function parseRecordingTimeToSeconds(value: string): number {
	const parts = value
		.trim()
		.split(":")
		.map((part) => Number(part))

	if (parts.some((part) => !Number.isFinite(part))) return 0

	if (parts.length === 3) {
		const [hours, minutes, seconds] = parts
		return hours * 3600 + minutes * 60 + seconds
	}

	if (parts.length === 2) {
		const [minutes, seconds] = parts
		return minutes * 60 + seconds
	}

	return parts[0] ?? 0
}

/** Formats seconds as mm:ss or hh:mm:ss so transcript and player labels stay aligned. */
export function formatRecordingTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return "00:00"

	const totalSeconds = Math.floor(seconds)
	const hours = Math.floor(totalSeconds / 3600)
	const minutes = Math.floor((totalSeconds % 3600) / 60)
	const remain = totalSeconds % 60

	if (hours > 0) {
		return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`
	}

	return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`
}
