import { describe, expect, it } from "vitest"
import { SLIDES_TEMPLATE_CANVAS_CARD_WIDTH, buildTemplateCanvasItems } from "../canvasLayout"
import {
	MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS,
	getTemplateCanvasVisibleItemLimit,
	getVisibleTemplateCanvasItems,
} from "../canvasViewport"
import { SLIDES_TEMPLATE_CANVAS_MIN_SCALE } from "../canvasZoom"

describe("slides template canvas viewport", () => {
	it("filters canvas items by the current viewport window", () => {
		const items = buildTemplateCanvasItems(Array.from({ length: 25 }, (_, index) => index))

		expect(
			getVisibleTemplateCanvasItems({
				items,
				offset: { x: 0, y: 0 },
				overscanX: 0,
				overscanY: 0,
				viewportHeight: 100,
				viewportWidth: 200,
			}).map((item) => item.item),
		).toEqual([0])

		expect(
			getVisibleTemplateCanvasItems({
				items,
				offset: { x: -SLIDES_TEMPLATE_CANVAS_CARD_WIDTH, y: 0 },
				overscanX: 0,
				overscanY: 0,
				viewportHeight: 100,
				viewportWidth: 200,
			}).map((item) => item.item),
		).toContain(5)
	})

	it("limits visible canvas items at the minimum scale", () => {
		const items = buildTemplateCanvasItems(Array.from({ length: 180 }, (_, index) => index))

		const visibleItems = getVisibleTemplateCanvasItems({
			items,
			offset: { x: 0, y: 0 },
			scale: SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
			viewportHeight: 1200,
			viewportWidth: 1800,
		})

		expect(visibleItems).toHaveLength(MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS)
	})

	it("expands the visible item budget when the canvas is zoomed out", () => {
		expect(
			getTemplateCanvasVisibleItemLimit({
				scale: 1,
				viewportHeight: 600,
				viewportWidth: 800,
			}),
		).toBeLessThan(MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS)
		expect(
			getTemplateCanvasVisibleItemLimit({
				scale: SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
				viewportHeight: 1200,
				viewportWidth: 1800,
			}),
		).toBe(MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS)
	})

	it("prioritizes real loaded templates over virtual filler tiles when capped", () => {
		const items = buildTemplateCanvasItems([
			{ id: "virtual-a", isVirtual: true },
			{ id: "real-a", isVirtual: false },
			{ id: "virtual-b", isVirtual: true },
			{ id: "real-b", isVirtual: false },
		])

		const visibleItems = getVisibleTemplateCanvasItems({
			getItemRenderPriority: ({ item }) => (item.isVirtual ? 1 : 0),
			items,
			maxItems: 2,
			offset: { x: 0, y: 0 },
			overscanX: 1000,
			overscanY: 1000,
			viewportHeight: 1000,
			viewportWidth: 1000,
		})

		expect(visibleItems.map((item) => item.item.id)).toEqual(["real-a", "real-b"])
	})
})
