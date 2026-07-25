import type { SelfMediaPostTags, SelfMediaStructuredTags } from "../../types"

export const REDNOTE_STRUCTURED_TAG_KEYS = ["core", "mid", "longtail", "trend"] as const

export function splitRednoteTagText(value: unknown): string[] {
	if (typeof value !== "string" && typeof value !== "number") return []

	return String(value)
		.split(/[\s,，、#]+/)
		.map((tag) => tag.trim().replace(/^#+/, ""))
		.filter(Boolean)
}

export function normalizeRednoteTags(tagsRaw: SelfMediaPostTags | undefined): string[] {
	const tags =
		tagsRaw && typeof tagsRaw === "object" && !Array.isArray(tagsRaw)
			? REDNOTE_STRUCTURED_TAG_KEYS.flatMap((key) => {
					const value = tagsRaw[key]
					return Array.isArray(value)
						? value.flatMap(splitRednoteTagText)
						: splitRednoteTagText(value)
				})
			: Array.isArray(tagsRaw)
				? tagsRaw.flatMap(splitRednoteTagText)
				: splitRednoteTagText(tagsRaw)

	return Array.from(new Set(tags))
}

export function parseRednoteTagDraft(value: string): string[] {
	return Array.from(new Set(splitRednoteTagText(value)))
}

export function updateRednoteTags(
	current: SelfMediaPostTags | undefined,
	nextTags: string[],
): SelfMediaPostTags {
	if (typeof current === "string") {
		return nextTags.map((tag) => `#${tag}`).join(" ")
	}
	if (Array.isArray(current)) return nextTags
	if (!current || typeof current !== "object") {
		return { core: nextTags, mid: [], longtail: [], trend: [] }
	}

	const assigned = new Set<string>()
	const result: SelfMediaStructuredTags = { ...current }

	for (const key of REDNOTE_STRUCTURED_TAG_KEYS) {
		const currentGroup = new Set(normalizeRednoteTags(current[key] as SelfMediaPostTags))
		const retained = nextTags.filter((tag) => currentGroup.has(tag) && !assigned.has(tag))
		result[key] = retained
		retained.forEach((tag) => assigned.add(tag))
	}

	const newTags = nextTags.filter((tag) => !assigned.has(tag))
	result.core = [...(result.core || []), ...newTags]
	return result
}
