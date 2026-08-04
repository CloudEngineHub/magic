import { describe, expect, it } from "vitest"
import { getRectDifferenceSegments } from "../crop/cropMaskGeometry"

function getTotalArea(rects: Array<{ width: number; height: number }>): number {
	return rects.reduce((total, rect) => total + rect.width * rect.height, 0)
}

describe("crop mask geometry", () => {
	it("splits the image mask around an inner crop without overlaps", () => {
		const segments = getRectDifferenceSegments(
			{ x: 0, y: 0, width: 160, height: 100 },
			{ x: 20, y: 10, width: 80, height: 60 },
		)

		expect(segments).toHaveLength(4)
		expect(getTotalArea(segments)).toBe(160 * 100 - 80 * 60)
	})

	it("returns only the crop area that extends outside the image", () => {
		const segments = getRectDifferenceSegments(
			{ x: -20, y: -10, width: 200, height: 130 },
			{ x: 0, y: 0, width: 160, height: 100 },
		)

		expect(getTotalArea(segments)).toBe(200 * 130 - 160 * 100)
	})

	it("keeps the whole outer rectangle when there is no intersection", () => {
		expect(
			getRectDifferenceSegments(
				{ x: 0, y: 0, width: 160, height: 100 },
				{ x: 200, y: 200, width: 20, height: 20 },
			),
		).toEqual([{ x: 0, y: 0, width: 160, height: 100 }])
	})
})
