import { describe, expect, it } from "vitest"
import { getContextPanelPosition } from "./contextPanelPosition"

describe("getContextPanelPosition", () => {
	const getOverlapArea = (
		first: { left: number; top: number; width: number; height: number },
		second: { left: number; top: number; width: number; height: number },
	) => {
		const width = Math.max(
			0,
			Math.min(first.left + first.width, second.left + second.width) -
				Math.max(first.left, second.left),
		)
		const height = Math.max(
			0,
			Math.min(first.top + first.height, second.top + second.height) -
				Math.max(first.top, second.top),
		)
		return width * height
	}

	it("keeps the panel inside the canvas bounds when the DOM tree occupies the right side", () => {
		const result = getContextPanelPosition(
			{ left: 140, top: 120, width: 40, height: 40 },
			{ width: 180, height: 260 },
			{ left: 0, top: 80, width: 200, height: 500 },
		)

		expect(result.placement).toBe("bottom")
		expect(result.left).toBe(12)
		expect(result.top).toBe(168)
		expect(result.width).toBe(180)
		expect(result.maxHeight).toBe(260)
	})

	it("respects a non-zero canvas origin", () => {
		const result = getContextPanelPosition(
			{ left: 650, top: 240, width: 40, height: 40 },
			{ width: 240, height: 160 },
			{ left: 200, top: 100, width: 500, height: 400 },
		)

		expect(result.left).toBe(650 - 240 - 8)
		expect(result.top).toBe(240)
	})

	it("uses the top side when horizontal space is too narrow", () => {
		const result = getContextPanelPosition(
			{ left: 110, top: 460, width: 180, height: 40 },
			{ width: 180, height: 260 },
			{ left: 0, top: 80, width: 400, height: 500 },
		)

		expect(result.placement).toBe("top")
		expect(result.top).toBe(192)
		expect(result.maxHeight).toBe(260)
	})

	it("keeps the panel width when neither side can fit it", () => {
		const anchor = { left: 250, top: 120, width: 120, height: 40 }
		const viewport = { left: 0, top: 80, width: 500, height: 500 }

		const result = getContextPanelPosition(anchor, { width: 280, height: 160 }, viewport)

		expect(result.placement).toBe("bottom")
		expect(result.width).toBe(280)
	})

	it("uses the top side when the selected element is near the bottom", () => {
		const result = getContextPanelPosition(
			{ left: 100, top: 390, width: 120, height: 40 },
			{ width: 280, height: 260 },
			{ left: 0, top: 0, width: 400, height: 500 },
		)

		expect(result.placement).toBe("top")
		expect(result.width).toBe(280)
		expect(result.maxHeight).toBe(260)
	})

	it("keeps the original side-panel height and shifts it into the viewport", () => {
		const result = getContextPanelPosition(
			{ left: 240, top: 390, width: 80, height: 40 },
			{ width: 240, height: 260 },
			{ left: 0, top: 0, width: 600, height: 500 },
		)

		expect(result.placement).toBe("right")
		expect(result.width).toBe(240)
		expect(result.maxHeight).toBe(260)
		expect(result.top).toBe(232)
	})

	it("keeps a large panel outside the selected element when it cannot fit at full size", () => {
		const anchor = { left: 100, top: 80, width: 240, height: 120 }
		const result = getContextPanelPosition(
			anchor,
			{ width: 360, height: 260 },
			{ left: 0, top: 0, width: 400, height: 300 },
		)

		expect(getOverlapArea({ ...result, height: result.maxHeight }, anchor)).toBe(0)
		expect(result.placement).toBe("bottom")
		expect(result.width).toBe(360)
		expect(result.maxHeight).toBe(92)
	})

	it("minimizes unavoidable overlap for an element that fills the canvas", () => {
		const anchor = { left: 8, top: 8, width: 384, height: 284 }
		const result = getContextPanelPosition(
			anchor,
			{ width: 360, height: 260 },
			{ left: 0, top: 0, width: 400, height: 300 },
		)

		expect(result.placement).toBe("right")
		expect(result.width).toBe(1)
		expect(result.maxHeight).toBe(260)
		expect(getOverlapArea({ ...result, height: result.maxHeight }, anchor)).toBeLessThanOrEqual(
			260,
		)
	})
})
