import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	collectStudyAttachments,
	findStudyDir,
	listLibraryFiles,
	parseDiscussionFile,
	parseInterviewFile,
	parsePersonaFile,
	parseStudyFile,
	resolvePhaseStatuses,
} from "../services/researchFiles"

const file = (path: string, extra: Partial<AttachmentItem> = {}): AttachmentItem => ({
	file_id: path,
	relative_file_path: path,
	is_directory: false,
	...extra,
})

const validStudy = {
	schema_version: 1,
	title: "AI 录音硬件",
	question: "老板们为什么不用 AI 录音？",
	phase: "interview",
	phases: [
		{ key: "clarify", status: "done" },
		{ key: "plan", status: "done" },
		{ key: "desk_research", status: "done" },
		{ key: "interview", status: "running" },
	],
}

describe("findStudyDir", () => {
	it("finds the study directory written by the topic", () => {
		const list = [
			file("/studies/a-1111/study.json", { topic_id: "t1" }),
			file("studies/b-2222/study.json", { topic_id: "t2" }),
		]
		expect(findStudyDir(list, "t1")).toBe("studies/a-1111/")
		expect(findStudyDir(list, "t2")).toBe("studies/b-2222/")
		expect(findStudyDir(list, "t3")).toBeNull()
	})

	it("ignores nested study.json files and prefers the latest one", () => {
		const list = [
			file("studies/a/inner/study.json", { topic_id: "t1" }),
			file("studies/old/study.json", { topic_id: "t1", updated_at: "2026-10-17 10:00:00" }),
			file("studies/new/study.json", { topic_id: "t1", updated_at: "2026-10-18 10:00:00" }),
		]
		expect(findStudyDir(list, "t1")).toBe("studies/new/")
	})
})

describe("collectStudyAttachments", () => {
	it("groups files by contract role", () => {
		const list = [
			file("studies/s/study.json"),
			file("studies/s/panel.json"),
			file("studies/s/report.html"),
			file("studies/s/validation-questionnaire.md"),
			file("studies/s/interviews/p_b.json"),
			file("studies/s/interviews/p_a.json"),
			file("studies/s/discussions/d1.json"),
			file("studies/other/report.html"),
		]
		const result = collectStudyAttachments(list, "studies/s/")
		expect(result.study?.file_id).toBe("studies/s/study.json")
		expect(result.report?.file_id).toBe("studies/s/report.html")
		expect(result.interviews.map((item) => item.file_id)).toEqual([
			"studies/s/interviews/p_a.json",
			"studies/s/interviews/p_b.json",
		])
		expect(result.discussions).toHaveLength(1)
		expect(result.all).toHaveLength(7)
	})
})

describe("listLibraryFiles", () => {
	it("lists only top-level json files of the library directory", () => {
		const list = [
			file("personas/p_a.json"),
			file("personas/notes.md"),
			file("personas/archive/p_b.json"),
			file("personas", { is_directory: true, file_id: "dir" }),
		]
		expect(listLibraryFiles(list, "personas/").map((item) => item.file_id)).toEqual([
			"personas/p_a.json",
		])
	})
})

describe("parsers", () => {
	it("accepts a valid study and reports stepper statuses", () => {
		const parsed = parseStudyFile(JSON.stringify(validStudy))
		expect(parsed.ok).toBe(true)
		if (!parsed.ok) return
		expect(resolvePhaseStatuses(parsed.data).map((item) => item.status)).toEqual([
			"done",
			"done",
			"done",
			"running",
			"pending",
			"pending",
		])
	})

	it("treats half-written or unknown-version files as not ready", () => {
		expect(parseStudyFile('{"schema_version":1,"title":').ok).toBe(false)
		expect(parseStudyFile({ ...validStudy, schema_version: 2 }).ok).toBe(false)
		expect(parseStudyFile({ ...validStudy, phase: "unknown" }).ok).toBe(false)
	})

	it("keeps a persona when optional fields are malformed", () => {
		const parsed = parsePersonaFile({
			schema_version: 1,
			id: "p_wang_7f3a",
			name: "王建国",
			tier: "legendary",
			tags: "not-an-array",
			extra_field: true,
		})
		expect(parsed.ok).toBe(true)
		if (!parsed.ok) return
		expect(parsed.data.tier).toBe("generated")
		expect(parsed.data.tags).toBeUndefined()
	})

	it("parses interviews and discussions", () => {
		expect(
			parseInterviewFile({
				schema_version: 1,
				persona_id: "p_a",
				status: "done",
				rounds: [{ role: "moderator", text: "你好" }],
			}).ok,
		).toBe(true)
		expect(
			parseDiscussionFile({
				schema_version: 1,
				participants: ["p_a", "p_b"],
				status: "running",
				rounds: [{ speaker: "p_a", text: "我觉得" }],
			}).ok,
		).toBe(true)
		expect(parseInterviewFile({ schema_version: 1, status: "done", rounds: [] }).ok).toBe(false)
	})
})
