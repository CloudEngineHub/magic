import { describe, expect, it } from "vitest"

import {
	buildMicroAppIssuePrompt,
	microAppIssuePromptData,
	searchMicroAppIssuePrompts,
} from "../microAppIssuePrompts"

describe("microAppIssuePrompts", () => {
	it("provides a categorized user-facing issue library", () => {
		expect(microAppIssuePromptData.categories).toHaveLength(8)
		expect(microAppIssuePromptData.issues).toHaveLength(32)
		expect(new Set(microAppIssuePromptData.issues.map((issue) => issue.id)).size).toBe(32)
		expect(microAppIssuePromptData.issues.every((issue) => issue.title.zh_CN)).toBe(true)
		expect(microAppIssuePromptData.issues.every((issue) => issue.description.zh_CN)).toBe(true)
	})

	it("builds a complete repair prompt from the selected user symptom", () => {
		const issue = microAppIssuePromptData.issues.find(
			(item) => item.id === "persistence-schema-missing",
		)
		if (!issue) throw new Error("Expected persistence-schema-missing issue")

		const prompt = buildMicroAppIssuePrompt(issue, "zh-CN")

		expect(prompt).toContain("新增功能后缺少需要填写的内容")
		expect(prompt).toContain("先查询真实表结构和项目记忆")
		expect(prompt).toContain("micro_app_plan")
		expect(prompt).toContain("保留已有功能和数据")
	})

	it("searches titles, descriptions, and natural-language keywords", () => {
		const results = searchMicroAppIssuePrompts(
			microAppIssuePromptData.issues,
			"别人数据",
			"zh_CN",
		)

		expect(results.map((issue) => issue.id)).toContain("access-see-others-data")
	})
})
