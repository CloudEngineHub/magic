import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { classifyStudyDeliverables } from "../services/researchDeliverables"
import { collectStudyAttachments } from "../services/researchFiles"

const file = (path: string): AttachmentItem => ({
	file_id: path,
	relative_file_path: path,
	is_directory: false,
})

const dir = "studies/recorder-7f3a/"
const projectFiles = [
	"study.json",
	"report.html",
	"plan.md",
	"desk-research.md",
	"validation-questionnaire.md",
	"validation-questionnaire.csv",
	"synthesis.json",
	"interviews/p1.json",
	"interviews/p2.json",
	"discussions/d1.json",
].map((name) => file(`${dir}${name}`))
const study = collectStudyAttachments(projectFiles, dir)

describe("classifyStudyDeliverables", () => {
	it("groups study files by role and keeps unrelated files as others", () => {
		const result = classifyStudyDeliverables(
			[...projectFiles, file("uploads/notes.png")],
			study,
		)

		expect(result?.report?.file_id).toBe(`${dir}report.html`)
		expect(result?.validation?.file_id).toBe(`${dir}validation-questionnaire.md`)
		expect(result?.validationCsv?.file_id).toBe(`${dir}validation-questionnaire.csv`)
		expect(result?.documents.map((doc) => doc.key)).toEqual(["plan", "deskResearch"])
		expect(result?.interviews).toBe(2)
		expect(result?.discussions).toBe(1)
		expect(result?.hasSynthesis).toBe(true)
		expect(result?.others.map((item) => item.file_id)).toEqual(["uploads/notes.png"])
	})

	it("matches message attachments by file id even without a path", () => {
		const result = classifyStudyDeliverables([{ file_id: `${dir}plan.md` }], study)
		expect(result?.documents).toHaveLength(1)
	})

	it("keeps the default list when nothing study-specific is attached", () => {
		expect(classifyStudyDeliverables([file("uploads/notes.png")], study)).toBeNull()
		expect(classifyStudyDeliverables([file(`${dir}study.json`)], study)).toBeNull()
		expect(classifyStudyDeliverables(projectFiles, null)).toBeNull()
	})
})
