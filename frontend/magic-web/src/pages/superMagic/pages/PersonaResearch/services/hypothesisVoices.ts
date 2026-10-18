import type { EvidenceRef, StudyHypothesis, SynthesisTheme, ThemeStance } from "../types"

export type VoiceStance = "support" | "partial" | "oppose" | "none"

export interface StanceGroup {
	stance: VoiceStance
	personaIds: string[]
}

export type QuoteEvidence = Extract<EvidenceRef, { kind: "quote" }>

const STANCE_ORDER: VoiceStance[] = ["support", "partial", "oppose", "none"]

/**
 * Who stood where on a hypothesis, from the synthesis themes linked to it (theme.hypothesis_ids).
 * A persona who supports one linked theme and opposes another, or is "mixed" on any, counts as
 * partial. Returns null when no theme is linked: without that link the UI shows only who was
 * quoted, rather than guessing a stance from the quotes.
 */
export function hypothesisStanceGroups(
	hypothesis: Pick<StudyHypothesis, "id">,
	themes: Pick<SynthesisTheme, "hypothesis_ids" | "stance_by_persona">[],
	panelIds: string[],
): StanceGroup[] | null {
	const linked = themes.filter((theme) => theme.hypothesis_ids?.includes(hypothesis.id))
	if (linked.length === 0) return null

	const seen = new Map<string, Set<ThemeStance>>()
	for (const theme of linked) {
		for (const [personaId, stance] of Object.entries(theme.stance_by_persona)) {
			const set = seen.get(personaId) ?? new Set<ThemeStance>()
			set.add(stance)
			seen.set(personaId, set)
		}
	}

	const ids = panelIds.length ? panelIds : [...seen.keys()]
	const byStance = new Map<VoiceStance, string[]>(STANCE_ORDER.map((stance) => [stance, []]))
	for (const personaId of ids) {
		byStance.get(resolveStance(seen.get(personaId)))?.push(personaId)
	}
	return STANCE_ORDER.map((stance) => ({
		stance,
		personaIds: byStance.get(stance) ?? [],
	})).filter((group) => group.personaIds.length > 0)
}

function resolveStance(stances: Set<ThemeStance> | undefined): VoiceStance {
	if (!stances) return "none"
	const support = stances.has("support")
	const oppose = stances.has("oppose")
	if (stances.has("mixed") || (support && oppose)) return "partial"
	if (support) return "support"
	if (oppose) return "oppose"
	return "none"
}

/** Distinct personas quoted as evidence, in citation order. */
export function quotedPersonaIds(hypothesis: Pick<StudyHypothesis, "evidence_refs">): string[] {
	const ids: string[] = []
	for (const ref of hypothesis.evidence_refs ?? []) {
		if (ref.kind === "quote" && !ids.includes(ref.persona_id)) ids.push(ref.persona_id)
	}
	return ids
}

/** The quote that represents a hypothesis: the first quoted evidence, usually the strongest. */
export function leadQuote(
	hypothesis: Pick<StudyHypothesis, "evidence_refs">,
): QuoteEvidence | null {
	return (
		(hypothesis.evidence_refs ?? []).find(
			(ref): ref is QuoteEvidence => ref.kind === "quote",
		) ?? null
	)
}

/** Desk-research source ids ("S8") cited by a hypothesis. */
export function sourceRefs(hypothesis: Pick<StudyHypothesis, "evidence_refs">): string[] {
	return (hypothesis.evidence_refs ?? []).flatMap((ref) =>
		ref.kind === "source" ? [ref.ref] : [],
	)
}
