import { describe, expect, it } from "vitest"
import { buildTemplateCanvasTiles, getPriorityWeightedRandomIndex } from "../canvasInteraction"

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
})
