import { parseRecordingTimeToSeconds } from "./time"

const TIME_TEXT_REGEX = /(?<!\]\()(\d{1,3}:[0-5]\d(?::[0-5]\d)?)/g
const MARKDOWN_MAGIC_TIME_LINK_REGEX = /\[([^\]]+)]\(magic-time:\/\/\/?([^)]+)\)/g
const CODED_MAGIC_TIME_LINK_REGEX = /`\\?\[([^\\\]]+)\\?]\??\\?\(magic-time:\/\/\/?([^\\)]+)\\?\)`/g
const PLAIN_MAGIC_TIME_TEXT_REGEX =
	/(\d{1,3}:[0-5]\d(?::[0-5]\d)?)\s*\(magic-time:\/\/\/?([^)]+)\)/g
const SPEAKER_GROUP_REGEX = /\[(Speaker-[\w-]+(?:\s*,\s*Speaker-[\w-]+)+)]/g
const SPEAKER_ID_REGEX = /\bSpeaker-[\w-]+\b/g

/** Converts plain time text in markdown into internal links handled by the shared audio player. */
export function injectMarkdownTimeLinks(markdown: string): string {
	const preservedLinks: string[] = []
	const withPlaceholders = markdown
		.replace(CODED_MAGIC_TIME_LINK_REGEX, (_match, label: string, seconds: string) => {
			return `[${label}](magic-time://${seconds})`
		})
		.replace(MARKDOWN_MAGIC_TIME_LINK_REGEX, (match) => {
			const index = preservedLinks.push(match) - 1
			return `MAGIC_TIME_LINK_${index}`
		})
		.replace(PLAIN_MAGIC_TIME_TEXT_REGEX, (_match, label: string, seconds: string) => {
			const index = preservedLinks.push(`[${label}](magic-time://${seconds})`) - 1
			return `MAGIC_TIME_LINK_${index}`
		})

	return withPlaceholders
		.replace(TIME_TEXT_REGEX, (match) => {
			const seconds = parseRecordingTimeToSeconds(match)
			return `[${match}](magic-time://${seconds})`
		})
		.replace(
			/MAGIC_TIME_LINK_(\d+)/g,
			(_match, index: string) => preservedLinks[Number(index)] ?? "",
		)
}

/** Reads seconds from an internal markdown time link href. */
export function parseMarkdownTimeLink(href: string | undefined): number | null {
	if (!href?.match(/^magic-time:\/\/\/?/)) return null
	const seconds = Number(href.replace(/^magic-time:\/\/\/?/, ""))
	return Number.isFinite(seconds) ? seconds : null
}

/** Converts speaker ids in markdown into internal links so every speaker pill opens settings. */
export function injectMarkdownSpeakerLinks(
	markdown: string,
	speakerNameMap: Record<string, string>,
): string {
	const preservedLinks: string[] = []
	const toSpeakerLink = (speakerId: string) => {
		const label = speakerNameMap[speakerId]?.trim() || speakerId
		const index =
			preservedLinks.push(`[${label}](magic-speaker://${encodeURIComponent(speakerId)})`) - 1
		return `MAGIC_SPEAKER_LINK_${index}`
	}

	return markdown
		.replace(SPEAKER_GROUP_REGEX, (_match, group: string) =>
			group
				.split(/\s*,\s*/)
				.map((speakerId) => toSpeakerLink(speakerId))
				.join(" "),
		)
		.replace(SPEAKER_ID_REGEX, (speakerId) => toSpeakerLink(speakerId))
		.replace(
			/MAGIC_SPEAKER_LINK_(\d+)/g,
			(_match, index: string) => preservedLinks[Number(index)] ?? "",
		)
}

/** Reads the speaker id from an internal markdown speaker link href. */
export function parseMarkdownSpeakerLink(href: string | undefined): string | null {
	if (!href?.startsWith("magic-speaker://")) return null
	return decodeURIComponent(href.replace("magic-speaker://", ""))
}

/** Collects generated speaker ids from transcript and summary text. */
export function collectSpeakerIdsFromText(text: string): string[] {
	return Array.from(new Set(text.match(SPEAKER_ID_REGEX) ?? [])).sort()
}

/** Collects all unique speaker ids across transcript, notes, and summary text. */
export function collectRecordingSpeakerIds(contents: Array<string | undefined>): string[] {
	const allIds = contents.flatMap((content) => {
		if (!content) return []
		return collectSpeakerIdsFromText(content)
	})
	return Array.from(new Set(allIds)).sort()
}
