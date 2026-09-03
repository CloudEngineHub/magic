import { describe, expect, it } from "vitest"
import { areLineHeightsEquivalent, getEquivalentLineHeight } from "../lineHeight"

describe("lineHeight", () => {
	it("converts a unitless ratio to pixels at the current font size", () => {
		expect(getEquivalentLineHeight("1.2", "100px")).toBe("120px")
		expect(getEquivalentLineHeight("120px", "100px")).toBe("1.2")
	})

	it("treats a preserved ratio as equivalent to its computed pixel value", () => {
		expect(areLineHeightsEquivalent("1.2", "120px", "100px")).toBe(true)
		expect(areLineHeightsEquivalent("1.2", "120px", "100")).toBe(true)
	})

	it("rejects a preserved ratio after an external line-height change", () => {
		expect(areLineHeightsEquivalent("1.2", "24px", "100px")).toBe(false)
		expect(areLineHeightsEquivalent("1.2", "1.5", "100px")).toBe(false)
	})
})
