import { describe, expect, it } from "vitest"
import { getGapHandleLayout, getInFlowChildRects } from "../gapHandleLayout"

const container = { top: 0, left: 0, width: 220, height: 220 }

describe("getGapHandleLayout", () => {
	it("returns no handles for a heading display", () => {
		expect(
			getGapHandleLayout(
				container,
				[
					{ top: 0, left: 0, width: 100, height: 40 },
					{ top: 0, left: 120, width: 100, height: 40 },
				],
				"block",
			),
		).toEqual([])
	})

	it("returns no handles when only one in-flow child exists", () => {
		expect(
			getGapHandleLayout(container, [{ top: 10, left: 10, width: 80, height: 80 }], "flex"),
		).toEqual([])
	})

	it("returns a column handle for a horizontal pair", () => {
		const frames = getGapHandleLayout(
			container,
			[
				{ top: 10, left: 10, width: 80, height: 80 },
				{ top: 10, left: 110, width: 80, height: 80 },
			],
			"flex",
		)
		expect(frames).toHaveLength(1)
		expect(frames[0].axis).toBe("column")
		expect(frames[0].cursor).toBe("col-resize")
		expect(frames[0].width).toBeGreaterThanOrEqual(8)
	})

	it("returns both axes for a two-by-two grid", () => {
		const frames = getGapHandleLayout(
			container,
			[
				{ top: 10, left: 10, width: 80, height: 80 },
				{ top: 10, left: 110, width: 80, height: 80 },
				{ top: 110, left: 10, width: 80, height: 80 },
				{ top: 110, left: 110, width: 80, height: 80 },
			],
			"grid",
		)
		expect(frames.map((frame) => frame.axis).sort()).toEqual(["column", "row"])
	})

	it("keeps an 8px hit when the gutter is zero", () => {
		const frames = getGapHandleLayout(
			container,
			[
				{ top: 0, left: 0, width: 100, height: 40 },
				{ top: 0, left: 100, width: 100, height: 40 },
			],
			"flex",
		)
		expect(frames[0].width).toBe(8)
	})

	it("ignores absolute and display-none children", () => {
		expect(
			getInFlowChildRects([
				{ top: 0, left: 0, width: 80, height: 80, position: "absolute" },
				{ top: 0, left: 100, width: 80, height: 80, display: "none" },
				{ top: 0, left: 0, width: 80, height: 80 },
			]),
		).toHaveLength(1)
	})
})
