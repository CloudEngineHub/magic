import { describe, expect, it } from "vitest"
import {
	CONNECTION_LINE_STYLE,
	CONNECTION_STROKE_SCALE_STYLE,
	resolveConnectionCanvasStrokeWidth,
	resolveConnectionScreenStrokeWidth,
} from "../connectionStyle"

describe("connection stroke scaling", () => {
	it("keeps the current visual stroke width at and above the shrink threshold", () => {
		expect(resolveConnectionScreenStrokeWidth(CONNECTION_LINE_STYLE.strokeWidth, 1)).toBe(
			CONNECTION_LINE_STYLE.strokeWidth,
		)
		expect(resolveConnectionScreenStrokeWidth(CONNECTION_LINE_STYLE.strokeWidth, 2)).toBe(
			CONNECTION_LINE_STYLE.strokeWidth,
		)
		expect(
			resolveConnectionScreenStrokeWidth(
				CONNECTION_LINE_STYLE.strokeWidth,
				CONNECTION_STROKE_SCALE_STYLE.shrinkStartScale,
			),
		).toBe(CONNECTION_LINE_STYLE.strokeWidth)
	})

	it("thins the visual stroke width below the shrink threshold with a minimum width", () => {
		const scale = CONNECTION_STROKE_SCALE_STYLE.shrinkStartScale / 2
		const expectedScreenWidth =
			CONNECTION_LINE_STYLE.strokeWidth *
			Math.pow(
				scale / CONNECTION_STROKE_SCALE_STYLE.shrinkStartScale,
				CONNECTION_STROKE_SCALE_STYLE.shrinkExponent,
			)

		expect(
			resolveConnectionScreenStrokeWidth(CONNECTION_LINE_STYLE.strokeWidth, scale),
		).toBeCloseTo(expectedScreenWidth)
		expect(
			resolveConnectionCanvasStrokeWidth(CONNECTION_LINE_STYLE.strokeWidth, scale),
		).toBeCloseTo(expectedScreenWidth / scale)
		expect(resolveConnectionScreenStrokeWidth(CONNECTION_LINE_STYLE.strokeWidth, 0.01)).toBe(
			CONNECTION_STROKE_SCALE_STYLE.minScreenStrokeWidth,
		)
	})
})
