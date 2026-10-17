import { z } from "zod"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { STUDY_PHASE_KEYS } from "../types"
import type {
	DiscussionFile,
	InterviewFile,
	PanelFile,
	ParsedResearchFile,
	PersonaFile,
	StudyFile,
} from "../types"

/**
 * Locates and validates the research contract files inside the project attachment list.
 *
 * The agent owns these files; the page only reads them. A file that is missing, half-written
 * or from an unknown schema version is reported as "not ready" so the conversation keeps
 * working while the side panel shows a waiting state.
 */

export const PERSONAS_DIR = "personas/"
export const PANELS_DIR = "panels/"
export const STUDIES_DIR = "studies/"
export const STUDY_FILE_NAME = "study.json"

/** Attachment paths may or may not start with "/"; compare without it. */
export function normalizeResearchPath(path: string | undefined | null): string {
	return (path ?? "").replace(/^\/+/, "")
}

function attachmentPath(item: AttachmentItem): string {
	return normalizeResearchPath(item.relative_file_path ?? item.path)
}

function isFile(item: AttachmentItem): boolean {
	return !item.is_directory && Boolean(item.file_id)
}

/** Cache key that changes whenever the agent rewrites the file. */
export function attachmentVersionKey(item: AttachmentItem): string {
	return `${item.file_id ?? ""}:${item.updated_at ?? ""}:${item.file_size ?? ""}`
}

/**
 * Finds the study directory that belongs to one topic.
 * Example: topic "123" wrote "studies/ai-recorder-7f3a/study.json" → "studies/ai-recorder-7f3a/".
 * When several study files carry the topic id (a renamed study), the most recently updated wins.
 */
export function findStudyDir(list: AttachmentItem[], topicId: string | undefined): string | null {
	if (!topicId) return null
	const candidates = list.filter((item) => {
		if (!isFile(item) || String(item.topic_id ?? "") !== String(topicId)) return false
		const path = attachmentPath(item)
		return (
			path.startsWith(STUDIES_DIR) &&
			path.endsWith(`/${STUDY_FILE_NAME}`) &&
			path.split("/").length === 3
		)
	})
	if (candidates.length === 0) return null
	const latest = [...candidates].sort((a, b) =>
		String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")),
	)[0]
	const path = attachmentPath(latest)
	return path.slice(0, path.length - STUDY_FILE_NAME.length)
}

export interface StudyAttachments {
	dir: string
	study: AttachmentItem | null
	panel: AttachmentItem | null
	interviews: AttachmentItem[]
	discussions: AttachmentItem[]
	report: AttachmentItem | null
	plan: AttachmentItem | null
	deskResearch: AttachmentItem | null
	validation: AttachmentItem | null
	/** Every file in the study directory, used for delete and file-count chips. */
	all: AttachmentItem[]
}

/** Groups the files of one study directory by contract role. */
export function collectStudyAttachments(list: AttachmentItem[], dir: string): StudyAttachments {
	const files = list.filter((item) => isFile(item) && attachmentPath(item).startsWith(dir))
	const byName = (name: string) =>
		files.find((item) => attachmentPath(item) === `${dir}${name}`) ?? null
	const inSubDir = (sub: string) =>
		files
			.filter((item) => {
				const rest = attachmentPath(item).slice(dir.length)
				return (
					rest.startsWith(`${sub}/`) &&
					rest.endsWith(".json") &&
					rest.split("/").length === 2
				)
			})
			.sort((a, b) => attachmentPath(a).localeCompare(attachmentPath(b)))

	return {
		dir,
		study: byName(STUDY_FILE_NAME),
		panel: byName("panel.json"),
		interviews: inSubDir("interviews"),
		discussions: inSubDir("discussions"),
		report: byName("report.html"),
		plan: byName("plan.md"),
		deskResearch: byName("desk-research.md"),
		validation: byName("validation-questionnaire.md"),
		all: files,
	}
}

/** Lists top-level JSON files of a project-level library directory (personas/ or panels/). */
export function listLibraryFiles(list: AttachmentItem[], dir: string): AttachmentItem[] {
	return list
		.filter((item) => {
			if (!isFile(item)) return false
			const path = attachmentPath(item)
			return path.startsWith(dir) && path.endsWith(".json") && path.split("/").length === 2
		})
		.sort((a, b) => attachmentPath(a).localeCompare(attachmentPath(b)))
}

export function getAttachmentPath(item: AttachmentItem): string {
	return attachmentPath(item)
}

// ---------------------------------------------------------------------------
// Schemas. Required fields are the ones the UI cannot render without; everything else is
// optional so the agent can add detail without breaking the page.
// ---------------------------------------------------------------------------

const schemaVersion = z.literal(1)
const looseRecord = z.record(z.string(), z.unknown())

const studySchema = z.object({
	schema_version: schemaVersion,
	title: z.string(),
	question: z.string(),
	study_type: z
		.enum(["user_research", "product_rnd", "concept_test", "fast_insight", "panel_only"])
		.optional()
		.catch(undefined),
	framework: z.array(z.string()).optional().catch(undefined),
	phase: z.enum([...STUDY_PHASE_KEYS, "done"]),
	phases: z.array(
		z.object({
			key: z.enum(STUDY_PHASE_KEYS),
			status: z.enum(["done", "running", "pending", "skipped", "failed"]),
		}),
	),
	limits: z
		.object({ personas: z.number().optional(), interview_rounds: z.number().optional() })
		.optional()
		.catch(undefined),
	outputs: z
		.object({
			plan: z.string().optional(),
			report: z.string().optional(),
			validation: z.string().optional(),
		})
		.optional()
		.catch(undefined),
})

const personaSchema = z.object({
	schema_version: schemaVersion,
	id: z.string().min(1),
	name: z.string().min(1),
	tagline: z.string().optional().catch(undefined),
	tags: z.array(z.string()).optional().catch(undefined),
	tier: z.enum(["generated", "evidence_based", "imported"]).catch("generated"),
	dimensions: z
		.object({
			demographics: looseRecord.optional(),
			geography: looseRecord.optional(),
			psychographics: looseRecord.optional(),
			behavior: looseRecord.optional(),
			needs_pains: z.array(z.unknown()).optional(),
			tech_adoption: z.string().optional(),
			social: z.string().optional(),
		})
		.optional()
		.catch(undefined),
	layers: z
		.object({
			expression: z.array(z.unknown()).optional(),
			story: z.string().optional(),
			cognition: z.object({ decision_weights: looseRecord.optional() }).optional(),
			behavior: z.array(z.unknown()).optional(),
		})
		.optional()
		.catch(undefined),
	evidence: z
		.array(
			z.object({
				id: z.string(),
				type: z.enum(["web", "upload", "interview"]).catch("web"),
				title: z.string().optional(),
				url: z.string().optional(),
				file: z.string().optional(),
				quote: z.string().optional(),
			}),
		)
		.optional()
		.catch(undefined),
	created_in: z.string().optional().catch(undefined),
	updated_at: z.string().optional().catch(undefined),
})

const panelSchema = z.object({
	schema_version: schemaVersion,
	id: z.string().min(1),
	name: z.string().min(1),
	persona_ids: z.array(z.string()),
	criteria: z.string().optional().catch(undefined),
})

const transcriptBase = {
	schema_version: schemaVersion,
	status: z.enum(["done", "running", "failed"]).catch("running"),
	error: z.string().optional().catch(undefined),
	rounds: z.array(
		z.object({
			role: z.string().optional(),
			speaker: z.string().optional(),
			text: z.string(),
		}),
	),
	summary: z.string().optional().catch(undefined),
	key_findings: z.array(z.string()).optional().catch(undefined),
	quotes: z
		.array(z.object({ text: z.string(), theme: z.string().optional() }))
		.optional()
		.catch(undefined),
}

const interviewSchema = z.object({ ...transcriptBase, persona_id: z.string().min(1) })
const discussionSchema = z.object({
	...transcriptBase,
	id: z.string().optional().catch(undefined),
	participants: z.array(z.string()),
})

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParsedResearchFile<T> {
	let value: unknown = raw
	if (typeof raw === "string") {
		try {
			value = JSON.parse(raw)
		} catch {
			return { ok: false, reason: "invalid_json" }
		}
	}
	const result = schema.safeParse(value)
	if (!result.success) return { ok: false, reason: "schema_mismatch" }
	return { ok: true, data: result.data }
}

export const parseStudyFile = (raw: unknown) =>
	parseWith(studySchema, raw) as ParsedResearchFile<StudyFile>
export const parsePersonaFile = (raw: unknown) =>
	parseWith(personaSchema, raw) as ParsedResearchFile<PersonaFile>
export const parsePanelFile = (raw: unknown) =>
	parseWith(panelSchema, raw) as ParsedResearchFile<PanelFile>
export const parseInterviewFile = (raw: unknown) =>
	parseWith(interviewSchema, raw) as ParsedResearchFile<InterviewFile>
export const parseDiscussionFile = (raw: unknown) =>
	parseWith(discussionSchema, raw) as ParsedResearchFile<DiscussionFile>

/**
 * Stepper position: index of the running phase, else the first pending phase after the last done.
 * Example: clarify=done, plan=done, desk_research=running → 2 (0-based).
 */
export function resolveCurrentPhaseIndex(study: StudyFile | null): number {
	if (!study) return -1
	if (study.phase === "done") return STUDY_PHASE_KEYS.length
	const index = STUDY_PHASE_KEYS.indexOf(study.phase)
	return index
}

/** Status for each stepper slot, falling back to "pending" for phases the agent has not written. */
export function resolvePhaseStatuses(study: StudyFile | null) {
	return STUDY_PHASE_KEYS.map((key) => ({
		key,
		status: study?.phases.find((phase) => phase.key === key)?.status ?? "pending",
	}))
}
