import { describe, expect, it } from "vitest"
import { SpacingSnapResolver } from "../snap/SpacingSnapResolver"

const resolver = new SpacingSnapResolver()

describe("SpacingSnapResolver", () => {
	it("snaps a middle element to equal horizontal gaps", () => {
		const result = resolver.resolve({
			draggingRect: { x: 260, y: 0, width: 100, height: 100 },
			targets: [
				{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
				{ id: "c", rect: { x: 400, y: 0, width: 100, height: 100 } },
			],
			threshold: 64,
		})

		expect(result.horizontal).toMatchObject({
			axis: "horizontal",
			mode: "between",
			offset: -60,
			gap: 100,
		})
		expect(
			resolver.createGuideForSnappedRect(result.horizontal!, {
				x: 200,
				y: 0,
				width: 100,
				height: 100,
			}),
		).toMatchObject({
			targetElementIds: ["a", "c"],
			segments: [
				{ start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
				{ start: { x: 300, y: 50 }, end: { x: 400, y: 50 } },
			],
		})
	})

	it("places horizontal spacing guide segments in the overlap center of neighboring elements", () => {
		const result = resolver.resolve({
			draggingRect: { x: 260, y: 50, width: 100, height: 100 },
			targets: [
				{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
				{ id: "c", rect: { x: 400, y: 30, width: 100, height: 100 } },
			],
			threshold: 64,
		})

		expect(
			resolver.createGuideForSnappedRect(result.horizontal!, {
				x: 200,
				y: 50,
				width: 100,
				height: 100,
			}).segments,
		).toMatchObject([
			{ start: { x: 100, y: 75 }, end: { x: 200, y: 75 } },
			{ start: { x: 300, y: 90 }, end: { x: 400, y: 90 } },
		])
	})

	it("rebuilds spacing guides from the final combined snap rect", () => {
		const result = resolver.resolve({
			draggingRect: { x: 260, y: 50, width: 100, height: 100 },
			targets: [
				{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
				{ id: "c", rect: { x: 400, y: 30, width: 100, height: 100 } },
			],
			threshold: 64,
		})
		expect(result.horizontal).not.toBeNull()

		const guide = resolver.createGuideForSnappedRect(result.horizontal!, {
			x: 200,
			y: 0,
			width: 100,
			height: 100,
		})

		expect(guide.segments).toMatchObject([
			{ start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
			{ start: { x: 300, y: 65 }, end: { x: 400, y: 65 } },
		])
	})

	it("snaps a middle element to equal vertical gaps", () => {
		const result = resolver.resolve({
			draggingRect: { x: 0, y: 260, width: 100, height: 100 },
			targets: [
				{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
				{ id: "c", rect: { x: 0, y: 400, width: 100, height: 100 } },
			],
			threshold: 64,
		})

		expect(result.vertical).toMatchObject({
			axis: "vertical",
			mode: "between",
			offset: -60,
			gap: 100,
		})
		expect(
			resolver.createGuideForSnappedRect(result.vertical!, {
				x: 0,
				y: 200,
				width: 100,
				height: 100,
			}).segments,
		).toMatchObject([
			{ start: { x: 50, y: 100 }, end: { x: 50, y: 200 } },
			{ start: { x: 50, y: 300 }, end: { x: 50, y: 400 } },
		])
	})

	it("does not infer equal spacing from diagonal elements", () => {
		const result = resolver.resolve({
			draggingRect: { x: 210, y: 200, width: 100, height: 100 },
			targets: [
				{ id: "a", rect: { x: 0, y: 0, width: 100, height: 100 } },
				{ id: "c", rect: { x: 400, y: 0, width: 100, height: 100 } },
			],
			threshold: 64,
		})

		expect(result.horizontal).toBeNull()
	})
})
