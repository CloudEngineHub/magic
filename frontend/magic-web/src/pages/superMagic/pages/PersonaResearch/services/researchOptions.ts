import type { StudyType } from "../types"

export const RESEARCH_METHODS = [
	"auto",
	"user_research",
	"product_rnd",
	"concept_test",
	"fast_insight",
] as const satisfies readonly ("auto" | StudyType)[]
export const PANEL_SIZES = ["auto", 4, 6, 8, 10, 12] as const
export const ROUND_COUNTS = ["auto", 3, 5, 8] as const

export interface ResearchOptions {
	method: (typeof RESEARCH_METHODS)[number]
	panelSize: (typeof PANEL_SIZES)[number]
	rounds: (typeof ROUND_COUNTS)[number]
}

export const DEFAULT_RESEARCH_OPTIONS: ResearchOptions = {
	method: "auto",
	panelSize: "auto",
	rounds: "auto",
}

/** Settings the user fixed; "auto" ones are left out so the agent decides them. */
export function fixedResearchOptions(options: ResearchOptions): {
	study_type?: StudyType
	persona_count?: number
	interview_rounds?: number
} {
	return {
		...(options.method === "auto" ? {} : { study_type: options.method }),
		...(options.panelSize === "auto" ? {} : { persona_count: options.panelSize }),
		...(options.rounds === "auto" ? {} : { interview_rounds: options.rounds }),
	}
}

/** Restores saved settings, dropping values that are no longer offered. */
export function parseResearchOptions(raw: unknown): ResearchOptions {
	const value = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
	const pickFrom = <T>(list: readonly T[], candidate: unknown, fallback: T): T =>
		list.includes(candidate as T) ? (candidate as T) : fallback
	return {
		method: pickFrom(RESEARCH_METHODS, value.method, "auto"),
		panelSize: pickFrom(PANEL_SIZES, value.panelSize, "auto"),
		rounds: pickFrom(ROUND_COUNTS, value.rounds, "auto"),
	}
}
