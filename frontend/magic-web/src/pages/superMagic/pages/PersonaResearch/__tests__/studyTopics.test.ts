import { describe, expect, it } from "vitest"
import {
	appendStudyReference,
	parseStudyTopicMarker,
	studyTopicReference,
} from "../services/studyTopics"

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
	it("validates independent relationship and deletion-intent roles", () => {
		const marker = {
			schema_version: 1,
			topic_id: "child",
			primary_topic_id: "main",
			study_dir: "studies/one",
			state: "linked",
			title: "T",
		}
		expect(parseStudyTopicMarker(marker).ok).toBe(true)
		expect(parseStudyTopicMarker({ ...marker, study_dir: "studies/../other" }).ok).toBe(false)
		expect(parseStudyTopicMarker({ ...marker, state: "deleting" }).ok).toBe(false)
		expect(parseStudyTopicMarker({ ...marker, topic_id: "main", state: "deleting" }).ok).toBe(
			true,
		)
		expect(parseStudyTopicMarker({ ...marker, topic_id: "main" }).ok).toBe(false)
	})
})
