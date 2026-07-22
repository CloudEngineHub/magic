import { describe, expect, it } from "vitest"
import { SequenceSpacingResolver } from "../snap/SequenceSpacingResolver"
import { SpacingSnapResolver } from "../snap/SpacingSnapResolver"

const guideResolver = new SpacingSnapResolver()

describe("SequenceSpacingResolver", () => {
	it("extends an existing horizontal A-B gap when dragging C after B", () => {
		const resolver = new SequenceSpacingResolver()
		resolver.prepare([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 0, width: 100, height: 100 } },
		])

		const candidate = resolver.resolve({
			draggingRect: { x: 390, y: 0, width: 100, height: 100 },
			threshold: 16,
		}).horizontal

		expect(candidate).toMatchObject({
			axis: "horizontal",
			mode: "extend-after",
			offset: 10,
			gap: 100,
		})
		expect(candidate?.referenceTargets.map((target) => target.id)).toEqual(["a", "b"])
		if (!candidate) throw new Error("expected a sequence spacing candidate")
		expect(
			guideResolver.createGuideForSnappedRect(candidate, {
				x: 400,
				y: 0,
				width: 100,
				height: 100,
			}).segments,
		).toEqual([
			{ axis: "horizontal", start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
			{ axis: "horizontal", start: { x: 300, y: 50 }, end: { x: 400, y: 50 } },
		])
	})

	it("extends an existing horizontal A-B gap when dragging C before A", () => {
		const resolver = new SequenceSpacingResolver()
		resolver.prepare([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 0, width: 100, height: 100 } },
		])

		const candidate = resolver.resolve({
			draggingRect: { x: -190, y: 0, width: 100, height: 100 },
			threshold: 16,
		}).horizontal

		expect(candidate).toMatchObject({
			axis: "horizontal",
			mode: "extend-before",
			offset: -10,
			gap: 100,
		})
		if (!candidate) throw new Error("expected a sequence spacing candidate")
		expect(
			guideResolver.createGuideForSnappedRect(candidate, {
				x: -200,
				y: 0,
				width: 100,
				height: 100,
			}).segments,
		).toEqual([
			{ axis: "horizontal", start: { x: -100, y: 50 }, end: { x: 0, y: 50 } },
			{ axis: "horizontal", start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
		])
	})

	it("extends an existing vertical A-B gap when dragging C after B", () => {
		const resolver = new SequenceSpacingResolver()
		resolver.prepare([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 0, y: 200, width: 100, height: 100 } },
		])

		const candidate = resolver.resolve({
			draggingRect: { x: 0, y: 390, width: 100, height: 100 },
			threshold: 16,
		}).vertical

		expect(candidate).toMatchObject({
			axis: "vertical",
			mode: "extend-after",
			offset: 10,
			gap: 100,
		})
	})

	it("does not infer a sequence from diagonal elements", () => {
		const resolver = new SequenceSpacingResolver()
		resolver.prepare([
			{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
			{ id: "b", rect: { x: 200, y: 200, width: 100, height: 100 } },
		])

		expect(
			resolver.resolve({
				draggingRect: { x: 390, y: 0, width: 100, height: 100 },
				threshold: 16,
			}).horizontal,
		).toBeNull()
	})
})
