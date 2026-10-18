import { describe, expect, it } from "vitest"
import {
	appendParagraph,
	parseResearchOptions,
	researchSettingsLine,
} from "../services/researchOptions"

describe("researchSettingsLine", () => {
	it("omits auto items and uses the fixed prefix and labels", () => {
		expect(researchSettingsLine({ method: "concept_test", panelSize: 8, rounds: 5 })).toBe(
			"【研究设置】访谈人数: 8 · 访谈轮数: 5 · 研究方式: concept_test",
		)
		expect(researchSettingsLine({ method: "auto", panelSize: 6, rounds: "auto" })).toBe(
			"【研究设置】访谈人数: 6",
		)
	})

	it("returns null when nothing is fixed", () => {
		expect(
			researchSettingsLine({ method: "auto", panelSize: "auto", rounds: "auto" }),
		).toBeNull()
	})
})

describe("researchSettingsLine with a report template", () => {
	it("adds the chosen template and leaves the default out", () => {
		expect(
			researchSettingsLine(
				{ method: "auto", panelSize: "auto", rounds: "auto" },
				"templates/brand.html",
			),
		).toBe("【研究设置】报告模板: templates/brand.html")
		expect(researchSettingsLine({ method: "auto", panelSize: 6, rounds: "auto" }, null)).toBe(
			"【研究设置】访谈人数: 6",
		)
	})
})

describe("appendParagraph", () => {
	it("adds a paragraph after the existing content without mutating it", () => {
		const doc = {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "问题" }] }],
		}
		const next = appendParagraph(doc, "【研究设置】访谈人数: 8")
		expect(next.content).toHaveLength(2)
		expect(next.content?.[1]).toEqual({
			type: "paragraph",
			content: [{ type: "text", text: "【研究设置】访谈人数: 8" }],
		})
		expect(doc.content).toHaveLength(1)
	})

	it("creates a document when there is none", () => {
		expect(appendParagraph(undefined, "x").type).toBe("doc")
	})
})

describe("parseResearchOptions", () => {
	it("keeps offered values and resets the rest to auto", () => {
		expect(parseResearchOptions({ method: "concept_test", panelSize: 9, rounds: 5 })).toEqual({
			method: "concept_test",
			panelSize: "auto",
			rounds: 5,
		})
		expect(parseResearchOptions(null)).toEqual({
			method: "auto",
			panelSize: "auto",
			rounds: "auto",
		})
	})
})
