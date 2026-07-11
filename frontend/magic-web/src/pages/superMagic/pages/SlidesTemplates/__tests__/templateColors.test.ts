import { describe, expect, it } from "vitest"
import {
	applyResolvedTemplateColors,
	getTemplatePaletteDistance,
	normalizeTemplateColors,
	templateColorToRgba,
} from "../templateColors"

describe("slides template colors", () => {
	it("normalizes safe HEX colors, removes duplicates, and caps the palette", () => {
		expect(
			normalizeTemplateColors([
				"#112233",
				"#112233",
				"javascript:alert(1)",
				"#abcdef",
				"#123456",
				"#654321",
				"#fedcba",
				"#000000",
			]),
		).toEqual(["#112233", "#ABCDEF", "#123456", "#654321", "#FEDCBA"])
	})

	it("only converts validated colors to rgba", () => {
		expect(templateColorToRgba("#336699", 0.2)).toBe("rgba(51, 102, 153, 0.2)")
		expect(templateColorToRgba("url(javascript:alert(1))", 0.2)).toBeUndefined()
	})

	it("only adds extracted colors when the backend palette is missing", () => {
		const templateWithoutColors = { value: "missing" }
		const templateWithColors = { colors: ["#112233"], value: "backend" }

		expect(applyResolvedTemplateColors(templateWithoutColors, [])).toBe(templateWithoutColors)
		expect(applyResolvedTemplateColors(templateWithoutColors, ["#315ECA", "#7AA7FF"])).toEqual({
			colors: ["#315ECA", "#7AA7FF"],
			value: "missing",
		})
		expect(applyResolvedTemplateColors(templateWithColors, ["#315ECA"])).toBe(
			templateWithColors,
		)
	})

	it("ranks perceptually related palettes closer than unrelated palettes", () => {
		const source = ["#315ECA", "#7AA7FF", "#182A5A"]
		const related = ["#365FC2", "#83AEFF", "#26396A"]
		const unrelated = ["#D97706", "#FACC15", "#7C2D12"]

		expect(getTemplatePaletteDistance(source, related)).toBeLessThan(
			getTemplatePaletteDistance(source, unrelated),
		)
		expect(getTemplatePaletteDistance(source, source)).toBeCloseTo(0)
	})
})
