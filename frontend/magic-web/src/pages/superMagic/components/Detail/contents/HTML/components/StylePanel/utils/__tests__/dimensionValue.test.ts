import { describe, expect, it } from "vitest"
import {
	getDeclaredDimension,
	getDimensionField,
	shouldKeepAuthoredDimension,
} from "../dimensionValue"

describe("getDeclaredDimension", () => {
	it("prefers the inline unit over the computed pixel value", () => {
		expect(
			getDeclaredDimension(
				{
					inlineStyles: { width: "50%" },
					computedStyles: { width: "320px", height: "180px" },
				},
				"width",
			),
		).toBe("50%")
	})

	it("falls back to the computed value when no inline unit exists", () => {
		expect(
			getDeclaredDimension(
				{
					computedStyles: { width: "320px", height: "180px" },
				},
				"height",
			),
		).toBe("180px")
	})

	it("returns auto when neither inline nor computed size exists", () => {
		expect(getDeclaredDimension(null, "width")).toBe("auto")
	})

	it("follows an external resize that overwrites a percent with px", () => {
		expect(
			getDimensionField(
				{
					inlineStyles: { width: "400px" },
					computedStyles: { width: "400px" },
				},
				"width",
			),
		).toEqual({ value: "400px", fromInline: true })
	})
})

describe("shouldKeepAuthoredDimension", () => {
	it("keeps a percent when a later refresh only has computed px", () => {
		expect(shouldKeepAuthoredDimension("%", "508px")).toBe(true)
	})

	it("replaces a percent when the incoming px was written inline", () => {
		expect(shouldKeepAuthoredDimension("%", "400px", true)).toBe(false)
	})
})
