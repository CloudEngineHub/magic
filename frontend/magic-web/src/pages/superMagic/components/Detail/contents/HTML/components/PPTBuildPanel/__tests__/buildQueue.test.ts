import { describe, expect, it } from "vitest"
import type { PPTBuildEntry } from "../../../iframe-bridge/types/props"
import { appendBuildStep, groupBuildQueue, reorderBuildQueue } from "../buildQueue"

const entry = (selector: string, step: number): PPTBuildEntry => ({
	selector,
	label: selector,
	build: { version: 1, step, effect: "fade" },
})
describe("build queue", () => {
	it("reorders click groups together without separating simultaneous elements", () => {
		const entries = [entry("a", 7), entry("b", 2), entry("c", 7)]
		expect(groupBuildQueue(entries).map((g) => g.items.map((e) => e.selector))).toEqual([
			["b"],
			["a", "c"],
		])
		expect(reorderBuildQueue(entries, 1, 0).map((e) => [e.selector, e.build?.step])).toEqual([
			["a", 1],
			["c", 1],
			["b", 2],
		])
		expect(entries.map((e) => e.build.step)).toEqual([7, 2, 7])
	})
	it("ignores invalid and unchanged moves", () => {
		expect(reorderBuildQueue([entry("a", 1)], 0, 0)).toEqual([])
		expect(reorderBuildQueue([entry("a", 1)], 0, 1)).toEqual([])
	})
	it("appends safely at the schema limit and splits without duplicate targets", () => {
		const entries = [entry("a", 999), entry("b", 1000), entry("c", 1000)]
		expect(
			appendBuildStep(entries, "c", "appear").map((e) => [
				e.selector,
				e.build?.step,
				e.build?.effect,
			]),
		).toEqual([
			["a", 1, "fade"],
			["b", 2, "fade"],
			["c", 3, "appear"],
		])
		expect(appendBuildStep([entry("a", 7)], "b")[0].build?.step).toBe(8)
	})
})
