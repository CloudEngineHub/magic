import { describe, expect, it } from "vitest"
import {
	applyResolvedTemplateColors,
	getTemplateColorFamily,
	getTemplatePaletteDistance,
	MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE,
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

	it("classifies colors into stable visual families", () => {
		expect(getTemplateColorFamily("#EF4444")).toBe("red")
		expect(getTemplateColorFamily("#D97706")).toBe("orange")
		expect(getTemplateColorFamily("#FACC15")).toBe("yellow")
		expect(getTemplateColorFamily("#22C55E")).toBe("green")
		expect(getTemplateColorFamily("#06B6D4")).toBe("cyan")
		expect(getTemplateColorFamily("#315ECA")).toBe("blue")
		expect(getTemplateColorFamily("#7C3AED")).toBe("purple")
		expect(getTemplateColorFamily("#EC4899")).toBe("pink")
		expect(getTemplateColorFamily("#F0CAD2")).toBe("pink")
		expect(getTemplateColorFamily("#111827")).toBe("blue")
		expect(getTemplateColorFamily("#111111")).toBe("neutral-dark")
		expect(getTemplateColorFamily("#808080")).toBe("neutral")
		expect(getTemplateColorFamily("#F8FAFC")).toBe("neutral-light")
	})

	it("requires multiple matching colors instead of only matching the dominant color", () => {
		const softPink = ["#F0CAD2", "#EBBAC6", "#E7ACB9", "#DEAFB9", "#6B5C61"]
		const relatedPink = ["#EFC8D1", "#E8B7C3", "#E2A9B6", "#DFAEB8", "#6D5C61"]
		const pinkWithTealPalette = ["#EFC8D1", "#D0EDEC", "#394B55", "#56666F", "#6CB0AA"]
		const tealWithPinkAccents = ["#D0EDEC", "#E992A6", "#394B55", "#56666F", "#EBB8C6"]
		const warmNeutral = ["#D7C9B3", "#E4D9C8", "#CDBDA4", "#C9B396", "#2D3A3D"]

		expect(getTemplatePaletteDistance(softPink, relatedPink)).toBeLessThanOrEqual(
			MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE,
		)
		expect(getTemplatePaletteDistance(softPink, tealWithPinkAccents)).toBeLessThanOrEqual(
			MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE,
		)
		expect(getTemplatePaletteDistance(softPink, pinkWithTealPalette)).toBe(
			Number.POSITIVE_INFINITY,
		)
		expect(getTemplatePaletteDistance(softPink, warmNeutral)).toBe(Number.POSITIVE_INFINITY)
	})
})
