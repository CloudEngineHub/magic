import { describe, expect, it } from "vitest"
import {
	buildTemplateCanvasTiles,
	getCanvasEdgeCursor,
	getPriorityWeightedRandomIndex,
} from "../canvasInteraction"

describe("slides template canvas interaction", () => {
	it("biases random selection toward templates earlier in the sorted result", () => {
		expect(getPriorityWeightedRandomIndex(10, 0)).toBe(0)
		expect(getPriorityWeightedRandomIndex(10, 0.5)).toBeLessThan(5)
		expect(getPriorityWeightedRandomIndex(10, 0.99)).toBeGreaterThan(5)
	})

	it("keeps existing tile ids stable when filtered results insert a new template", () => {
		const first = { label: "First", value: "first" }
		const second = { label: "Second", value: "second" }
		const inserted = { label: "Inserted", value: "inserted" }
		const originalTiles = buildTemplateCanvasTiles([first, second])
		const nextTiles = buildTemplateCanvasTiles([inserted, first, second])

		expect(nextTiles[1]?.id).toBe(originalTiles[0]?.id)
		expect(nextTiles[2]?.id).toBe(originalTiles[1]?.id)
	})

	it("uses directional resize cursors for canvas edge hot zones", () => {
		const rect = {
			bottom: 600,
			left: 0,
			right: 800,
			top: 0,
		} as DOMRect

		expect(getCanvasEdgeCursor(rect, { clientX: 400, clientY: 20 })).toBe("n-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 780, clientY: 300 })).toBe("e-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 400, clientY: 580 })).toBe("s-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 20, clientY: 300 })).toBe("w-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 20, clientY: 20 })).toBe("nw-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 780, clientY: 20 })).toBe("ne-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 780, clientY: 580 })).toBe("se-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 20, clientY: 580 })).toBe("sw-resize")
		expect(getCanvasEdgeCursor(rect, { clientX: 400, clientY: 300 })).toBeNull()
	})
})
