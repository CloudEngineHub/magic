/**
 * File contracts written by the persona-research agent and read by the AI research pages.
 * Keep in sync with backend/super-magic/agents/skills/persona-research/reference/file-contracts.md.
 *
 * Project layout (one special project per user, one topic per study):
 * personas/<persona_id>.json            persona library, reused across studies
 * panels/<panel_id>.json                saved persona groups
 * studies/<slug>/study.json             study state that drives the stepper
 * studies/<slug>/panel.json             personas used by this study
 * studies/<slug>/interviews/<id>.json   one-on-one transcripts
 * studies/<slug>/discussions/<id>.json  focus-group transcripts
 * studies/<slug>/report.html, plan.md, desk-research.md, validation-questionnaire.md
 */

export const STUDY_PHASE_KEYS = [
	"clarify",
	"plan",
	"desk_research",
	"interview",
	"report",
	"validation",
] as const

export type StudyPhaseKey = (typeof STUDY_PHASE_KEYS)[number]
export type StudyPhase = StudyPhaseKey | "done"
export type StudyPhaseStatus = "done" | "running" | "pending" | "skipped" | "failed"

export type StudyType =
	"user_research" | "product_rnd" | "concept_test" | "fast_insight" | "panel_only"

export interface StudyPhaseState {
	key: StudyPhaseKey
	status: StudyPhaseStatus
}

export interface StudyFile {
	schema_version: 1
	title: string
	question: string
	study_type?: StudyType
	framework?: string[]
	phase: StudyPhase
	phases: StudyPhaseState[]
	limits?: { personas?: number; interview_rounds?: number }
	outputs?: { plan?: string; report?: string; validation?: string }
}

export type PersonaTier = "generated" | "evidence_based" | "imported"

export interface PersonaEvidence {
	id: string
	type: "web" | "upload" | "interview"
	title?: string
	url?: string
	file?: string
	quote?: string
}

export interface PersonaFile {
	schema_version: 1
	id: string
	name: string
	tagline?: string
	tags?: string[]
	tier: PersonaTier
	dimensions?: {
		demographics?: Record<string, unknown>
		geography?: Record<string, unknown>
		psychographics?: Record<string, unknown>
		behavior?: Record<string, unknown>
		needs_pains?: unknown[]
		tech_adoption?: string
		social?: string
	}
	layers?: {
		expression?: unknown[]
		story?: string
		cognition?: { decision_weights?: Record<string, unknown> }
		behavior?: unknown[]
	}
	evidence?: PersonaEvidence[]
	created_in?: string
	updated_at?: string
}

export interface PanelFile {
	schema_version: 1
	id: string
	name: string
	persona_ids: string[]
	criteria?: string
}

export interface TranscriptRound {
	/** "moderator", "persona" (interviews) or a persona_id (discussions). */
	role?: string
	speaker?: string
	text: string
}

export interface TranscriptQuote {
	text: string
	theme?: string
}

export interface InterviewFile {
	schema_version: 1
	persona_id: string
	status: "done" | "running" | "failed"
	error?: string
	rounds: TranscriptRound[]
	summary?: string
	key_findings?: string[]
	quotes?: TranscriptQuote[]
}

export interface DiscussionFile extends Omit<InterviewFile, "persona_id"> {
	id?: string
	participants: string[]
}

/** A parsed research file together with the attachment it was read from. */
export interface ResearchFileRef<T> {
	fileId: string
	path: string
	data: T
}

/** Result of reading one contract file; invalid files are surfaced as "not ready" instead of errors. */
export type ParsedResearchFile<T> = { ok: true; data: T } | { ok: false; reason: string }
