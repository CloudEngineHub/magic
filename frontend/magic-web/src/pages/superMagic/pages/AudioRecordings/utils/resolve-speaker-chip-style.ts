/** Palette tokens for speaker chips — aligned with legacy HTML detail palette order. */
export const SPEAKER_CHIP_STYLES = [
	{ chip: "border-blue-200 bg-blue-50", dot: "bg-blue-500" },
	{ chip: "border-orange-200 bg-orange-50", dot: "bg-orange-500" },
	{ chip: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500" },
	{ chip: "border-violet-200 bg-violet-50", dot: "bg-violet-500" },
	{ chip: "border-rose-200 bg-rose-50", dot: "bg-rose-500" },
	{ chip: "border-sky-200 bg-sky-50", dot: "bg-sky-500" },
] as const

export type SpeakerChipStyle = (typeof SPEAKER_CHIP_STYLES)[number]

/** Builds a deterministic palette index for non-standard speaker ids. */
export function hashSpeakerId(speakerId: string) {
	let hash = 0
	for (let index = 0; index < speakerId.length; index += 1) {
		hash = (hash + speakerId.charCodeAt(index)) % SPEAKER_CHIP_STYLES.length
	}
	return hash
}

/** Resolves stable chip colors for a speaker id so repeated speakers stay visually consistent. */
export function resolveSpeakerChipStyle(speakerId: string): SpeakerChipStyle {
	const speakerNumberMatch = speakerId.match(/Speaker-(\d+)/i)
	const paletteIndex = speakerNumberMatch
		? Math.max(0, Number(speakerNumberMatch[1]) - 1)
		: hashSpeakerId(speakerId)

	return SPEAKER_CHIP_STYLES[paletteIndex % SPEAKER_CHIP_STYLES.length]
}
