import { describe, expect, it } from "vitest"
import { getDeclaredDimension } from "../dimensionValue"

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
			getDeclaredDimension(
				{
					inlineStyles: { width: "400px" },
					computedStyles: { width: "400px" },
				},
				"width",
			),
		).toBe("400px")
	})
})
