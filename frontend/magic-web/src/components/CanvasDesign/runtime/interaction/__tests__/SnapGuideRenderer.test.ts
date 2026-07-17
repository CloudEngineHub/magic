import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SnapGuideRenderer } from "../snap/SnapGuideRenderer"
import type { SpacingGuide } from "../snap/spacingSnapTypes"

const createSolidCanvasData = (): Uint8ClampedArray => {
	const data = new Uint8ClampedArray(400)
	for (let i = 0; i < 100; i++) {
		data[i * 4] = 40
		data[i * 4 + 1] = 40
		data[i * 4 + 2] = 40
		data[i * 4 + 3] = 255
	}
	return data
}

describe("SnapGuideRenderer", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: createSolidCanvasData() })),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("renders spacing guides as bidirectional dimension lines", () => {
		const overlayGroup = new Konva.Group()
		const renderer = new SnapGuideRenderer({
			overlayLayer: overlayGroup as unknown as Konva.Layer,
		})
		const spacingGuide: SpacingGuide = {
			kind: "linear",
			axis: "horizontal",
			gap: 100,
			targetElementIds: ["a", "c"],
			segments: [
				{ axis: "horizontal", start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
				{ axis: "horizontal", start: { x: 300, y: 50 }, end: { x: 400, y: 50 } },
			],
		}

		renderer.cacheVisualParams(1)
		renderer.renderSpacing([spacingGuide])

		const guideGroups = overlayGroup.find(".spacing-guide-group") as Konva.Group[]
		expect(guideGroups).toHaveLength(2)

		const firstMainLine = guideGroups[0].findOne(".spacing-guide-main") as Konva.Line
		const firstStartArrow = guideGroups[0].findOne(".spacing-guide-arrow-start") as Konva.Line
		const firstEndArrow = guideGroups[0].findOne(".spacing-guide-arrow-end") as Konva.Line

		expect(firstMainLine.points()).toEqual([100, 50, 200, 50])
		expect(firstStartArrow.points()[2]).toBe(100)
		expect(firstStartArrow.points()[3]).toBe(50)
		expect(firstEndArrow.points()[2]).toBe(200)
		expect(firstEndArrow.points()[3]).toBe(50)
		expect(firstStartArrow.points()[0]).toBeGreaterThan(100)
		expect(firstEndArrow.points()[0]).toBeLessThan(200)
		expect(overlayGroup.find(".spacing-marker")).toHaveLength(2)
	})

	it("renders each grid guide segment with its own direction marker", () => {
		const overlayGroup = new Konva.Group()
		const renderer = new SnapGuideRenderer({
			overlayLayer: overlayGroup as unknown as Konva.Layer,
		})
		const spacingGuide: SpacingGuide = {
			kind: "grid",
			axis: "vertical",
			sourceAxis: "horizontal",
			anchorTargetId: "b",
			gap: 100,
			targetElementIds: ["a", "b"],
			segments: [
				{ axis: "horizontal", start: { x: 100, y: 50 }, end: { x: 200, y: 50 } },
				{ axis: "vertical", start: { x: 250, y: 100 }, end: { x: 250, y: 200 } },
			],
		}

		renderer.cacheVisualParams(1)
		renderer.renderSpacing([spacingGuide])

		const markers = overlayGroup.find(".spacing-marker") as Konva.Group[]
		expect(markers).toHaveLength(2)
		expect((markers[0].getChildren()[0] as Konva.Line).points()).toEqual([-4, -2, 4, -2])
		expect((markers[1].getChildren()[0] as Konva.Line).points()).toEqual([-2, -4, -2, 4])
	})
})
