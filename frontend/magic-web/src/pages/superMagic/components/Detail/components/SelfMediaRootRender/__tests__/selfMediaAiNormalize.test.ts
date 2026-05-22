import { describe, expect, it } from "vitest"
import {
	buildCardContentResult,
	cleanJsonFromLlm,
	countTopLevelOutlinePointsFromText,
	parseCardContentFromText,
	parseOutlineFromText,
	reconcileCardCountWithOutline,
} from "../services/selfMediaAiNormalize"

describe("selfMediaAiNormalize", () => {
	it("cleans markdown fences from JSON", () => {
		expect(cleanJsonFromLlm('```json\n{"a":1}\n```')).toBe('{"a":1}')
	})

	it("reconciles cardCount to outline top-level count for card platforms", () => {
		const outlineText = Array.from({ length: 8 }, (_, i) => `- Card ${i + 1}`).join("\n")
		const count = reconcileCardCountWithOutline("rednote", 24, [], outlineText)
		expect(count).toBe(8)
	})

	it("reconciles cardCount from parsed outline nodes", () => {
		const outline = parseOutlineFromText("- A\n- B\n- C")
		expect(reconcileCardCountWithOutline("instagram", 24, outline)).toBe(3)
	})

	it("forces cardCount to 0 for WeChat", () => {
		expect(reconcileCardCountWithOutline("wechat-official-accounts", 8, [])).toBe(0)
	})

	it("parseCardContentFromText does not pad missing cards", () => {
		const lines = Array.from({ length: 8 }, (_, i) => `- Card ${i + 1} content`).join("\n")
		const nodes = parseCardContentFromText(lines)
		expect(nodes).toHaveLength(8)
		expect(nodes.every((n) => n.text.length > 0)).toBe(true)
	})

	it("buildCardContentResult uses outline length over fallback", () => {
		const outline = parseCardContentFromText("- One\n- Two")
		const result = buildCardContentResult(outline, 24)
		expect(result.cardCount).toBe(2)
		expect(result.outline).toHaveLength(2)
	})

	it("countTopLevelOutlinePointsFromText ignores indented sub-points", () => {
		const text = "- One\n  - Sub\n- Two"
		expect(countTopLevelOutlinePointsFromText(text)).toBe(2)
	})
})
