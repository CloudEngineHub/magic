import { describe, expect, it } from "vitest"
import { appendStudyReference, studyTopicIds, studyTopicReference } from "../services/studyTopics"

describe("study topic protocol", () => {
	it("retains native file identity and deduplicates retry/re-edit references", () => {
		const reference = studyTopicReference(
			{ file_id: "file", relative_file_path: "studies/one/study.json" },
			"project",
			"研究标题",
		)
		const value = appendStudyReference(
			{
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: "Follow up" }] }],
			},
			reference,
		)
		const restored = JSON.parse(JSON.stringify(value))
		expect(restored.content[1].content[0].attrs.data).toEqual({
			file_id: "file",
			file_name: "研究标题",
			file_path: "studies/one/study.json",
			file_extension: "json",
			project_id: "project",
		})
		expect(appendStudyReference(restored, reference)).toBe(restored)
	})
	it("ignores malformed contracts and preserves old single-topic data", () => {
		const old = {
			schema_version: 1,
			topic_id: "main",
			title: "T",
			question: "Q",
			phase: "done",
			phases: [],
		}
		expect(studyTopicIds(old)).toEqual(["main"])
		expect(studyTopicIds({ ...old, topic_ids: ["main", "child", "child"] })).toEqual([
			"main",
			"child",
		])
		expect(studyTopicIds({ topic_id: "unrelated", topic_ids: ["child"] })).toEqual([])
	})
})
