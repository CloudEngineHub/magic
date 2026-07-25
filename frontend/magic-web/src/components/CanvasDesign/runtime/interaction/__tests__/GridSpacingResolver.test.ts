import { describe, expect, it } from "vitest"
import { GridSpacingResolver } from "../snap/GridSpacingResolver"
import { SequenceSpacingResolver } from "../snap/SequenceSpacingResolver"
import { SpacingSnapResolver } from "../snap/SpacingSnapResolver"

function prepareGridResolver(targets: Parameters<SequenceSpacingResolver["prepare"]>[0]) {
	const sequenceResolver = new SequenceSpacingResolver()
	sequenceResolver.prepare(targets)
	const gridResolver = new GridSpacingResolver()
	gridResolver.prepare(sequenceResolver.getPreparedSequences())
	return gridResolver
}

describe("GridSpacingResolver", () => {
	it("extends a horizontal gap below its aligned anchor", () => {
		const resolver = prepareGridResolver([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 0, width: 100, height: 100 } },
			{ id: "c", rect: { x: 400, y: 0, width: 100, height: 100 } },
		])

		const candidate = resolver.resolve({
			draggingRect: { x: 200, y: 190, width: 100, height: 100 },
			threshold: 16,
			isAnchorAligned: (anchorTargetId) => anchorTargetId === "b",
		}).vertical

		expect(candidate).toMatchObject({
			kind: "grid",
			axis: "vertical",
			sourceAxis: "horizontal",
			mode: "grid-after",
			offset: 10,
			gap: 100,
			anchorTarget: { id: "b" },
		})
		if (!candidate) throw new Error("expected a grid candidate")
		expect(
			new SpacingSnapResolver().createGuideForSnappedRect(candidate, {
				x: 200,
				y: 200,
				width: 100,
				height: 100,
			}).segments,
		).toEqual([
			{ axis: "horizontal", start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
			{ axis: "horizontal", start: { x: 300, y: 50 }, end: { x: 400, y: 50 } },
			{ axis: "vertical", start: { x: 250, y: 100 }, end: { x: 250, y: 200 } },
		])
	})

	it("extends a vertical gap to the right of its aligned anchor", () => {
		const resolver = prepareGridResolver([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 0, y: 200, width: 100, height: 100 } },
		])

		expect(
			resolver.resolve({
				draggingRect: { x: 190, y: 200, width: 100, height: 100 },
				threshold: 16,
				isAnchorAligned: (anchorTargetId) => anchorTargetId === "b",
			}).horizontal,
		).toMatchObject({
			kind: "grid",
			axis: "horizontal",
			sourceAxis: "vertical",
			mode: "grid-after",
			offset: 10,
			anchorTarget: { id: "b" },
		})
	})

	it("supports extending before the anchor on the perpendicular axis", () => {
		const resolver = prepareGridResolver([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 0, width: 100, height: 100 } },
		])

		expect(
			resolver.resolve({
				draggingRect: { x: 200, y: -190, width: 100, height: 100 },
				threshold: 16,
				isAnchorAligned: (anchorTargetId) => anchorTargetId === "b",
			}).vertical,
		).toMatchObject({
			kind: "grid",
			mode: "grid-before",
			offset: -10,
			anchorTarget: { id: "b" },
		})
	})

	it("extends a vertical gap to the left of its aligned anchor", () => {
		const resolver = prepareGridResolver([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 0, y: 200, width: 100, height: 100 } },
		])

		expect(
			resolver.resolve({
				draggingRect: { x: -190, y: 200, width: 100, height: 100 },
				threshold: 16,
				isAnchorAligned: (anchorTargetId) => anchorTargetId === "b",
			}).horizontal,
		).toMatchObject({
			kind: "grid",
			mode: "grid-before",
			offset: -10,
			anchorTarget: { id: "b" },
		})
	})

	it("does not return a candidate when no anchor satisfies the strict alignment", () => {
		const resolver = prepareGridResolver([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 0, width: 100, height: 100 } },
		])

		expect(
			resolver.resolve({
				draggingRect: { x: 120, y: 190, width: 100, height: 100 },
				threshold: 16,
				isAnchorAligned: () => false,
			}).vertical,
		).toBeNull()
	})
})
