import { describe, expect, it } from "vitest"
import { resolveEraserMaskColors } from "../eraserMaskMode"

describe("resolveEraserMaskColors", () => {
	it("uses white strokes on a black background for normal erasing", () => {
		expect(resolveEraserMaskColors(false)).toEqual({
			background: "#000",
			stroke: "#fff",
		})
	})

	it("uses black strokes on a white background for inverted erasing", () => {
		expect(resolveEraserMaskColors(true)).toEqual({
			background: "#fff",
			stroke: "#000",
		})
	})
})
