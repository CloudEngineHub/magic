import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { getAttachmentPath, type StudyAttachments } from "./researchFiles"

/** Readable study documents, in reading order. */
export type StudyDocumentKey = "plan" | "deskResearch"

/** One assistant message's attachments, grouped by their role in the study. */
export interface StudyDeliverables {
	report: AttachmentItem | null
	/** Validation questionnaire; `validationCsv` is the same questionnaire for survey tools. */
	validation: AttachmentItem | null
	validationCsv: AttachmentItem | null
	documents: { key: StudyDocumentKey; file: AttachmentItem }[]
	/** Structured files are summarized as counts and open their own output tab. */
	interviews: number
	discussions: number
	hasPanel: boolean
	hasSynthesis: boolean
	hasValidationResults: boolean
	/** Files in the message that are not part of the study contract (user files, images). */
	others: AttachmentItem[]
}

const sameFile = (a: AttachmentItem, b: AttachmentItem | null | undefined) => {
	if (!b) return false
	if (a.file_id && b.file_id) return String(a.file_id) === String(b.file_id)
	return getAttachmentPath(a) !== "" && getAttachmentPath(a) === getAttachmentPath(b)
}

/**
 * Groups a message's attachments by the study they belong to.
 * Returns null when none of them is a study file, so the message keeps the default list.
 *
 * Example: [report.html, plan.md, interviews/p1.json, interviews/p2.json, notes.png]
 * → report, documents [plan], interviews 2, others [notes.png].
 */
export function classifyStudyDeliverables(
	files: AttachmentItem[],
	study: StudyAttachments | null,
): StudyDeliverables | null {
	if (!study) return null
	const result: StudyDeliverables = {
		report: null,
		validation: null,
		validationCsv: null,
		documents: [],
		interviews: 0,
		discussions: 0,
		hasPanel: false,
		hasSynthesis: false,
		hasValidationResults: false,
		others: [],
	}
	files.forEach((file) => {
		const is = (candidate: AttachmentItem | null) => sameFile(file, candidate)
		if (is(study.report)) result.report = file
		else if (is(study.validation)) result.validation = file
		else if (is(study.validationCsv)) result.validationCsv = file
		else if (is(study.plan)) result.documents.push({ key: "plan", file })
		else if (is(study.deskResearch)) result.documents.push({ key: "deskResearch", file })
		else if (study.interviews.some(is)) result.interviews += 1
		else if (study.discussions.some(is)) result.discussions += 1
		else if (is(study.panel)) result.hasPanel = true
		else if (is(study.synthesis)) result.hasSynthesis = true
		else if (is(study.validationResults)) result.hasValidationResults = true
		// study.json is the page's own state file; it has nothing to read on its own.
		else if (is(study.study)) return
		else result.others.push(file)
	})

	const hasStudyContent =
		result.report ||
		result.validation ||
		result.validationCsv ||
		result.documents.length ||
		result.interviews ||
		result.discussions ||
		result.hasPanel ||
		result.hasSynthesis ||
		result.hasValidationResults
	// Only study.json or no study file at all: nothing study-specific to present.
	if (!hasStudyContent) return null
	// Plan before desk research, whatever order the agent attached them in.
	result.documents.sort((a, b) => Number(b.key === "plan") - Number(a.key === "plan"))
	return result
}
