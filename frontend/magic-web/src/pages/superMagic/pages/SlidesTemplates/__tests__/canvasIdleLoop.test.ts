import { describe, expect, it } from "vitest"
import {
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_STEP_Y,
	type TemplateCanvasItem,
} from "../canvasLayout"
import {
	resolveSlidesTemplateCanvasIdleLoops,
	resolveSlidesTemplateCanvasLoopItems,
} from "../canvasIdleLoop"
import type { SlidesTemplateCanvasTile } from "../canvasInteraction"

function createCanvasItem(
	index: number,
	column: number,
	row: number,
	featured = false,
): TemplateCanvasItem<SlidesTemplateCanvasTile> {
	return {
		index,
		grid: { x: column, y: row },
		position: { x: column * 326, y: row * SLIDES_TEMPLATE_CANVAS_STEP_Y },
		size: featured
			? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE
			: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
		span: featured
			? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN
			: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
		item: {
			id: `tile-${index}`,
			imageUrl: `tile-${index}.png`,
			template: { value: `template-${index}`, label: `Template ${index}` },
		},
	}
}

describe("slides template canvas idle loop", () => {
	it("creates independent loops for every continuous regular column", () => {
		const items = [
			...Array.from({ length: 5 }, (_, index) => createCanvasItem(index, -1, index - 2)),
			...Array.from({ length: 4 }, (_, index) => createCanvasItem(index + 10, 2, index - 1)),
		]

		expect(resolveSlidesTemplateCanvasIdleLoops(items)).toEqual([
			{
				column: -1,
				delay: 0.65,
				distance: 5 * SLIDES_TEMPLATE_CANVAS_STEP_Y,
				direction: 1,
				duration: (5 * SLIDES_TEMPLATE_CANVAS_STEP_Y) / 11.5,
			},
			{
				column: 2,
				delay: 1.3,
				distance: 4 * SLIDES_TEMPLATE_CANVAS_STEP_Y,
				direction: -1,
				duration: (4 * SLIDES_TEMPLATE_CANVAS_STEP_Y) / 13,
			},
		])
	})

	it("skips featured and discontinuous columns", () => {
		const items = [
			createCanvasItem(1, 0, 0, true),
			...Array.from({ length: 4 }, (_, index) => createCanvasItem(index + 10, 0, index + 2)),
			createCanvasItem(20, 1, -2),
			createCanvasItem(21, 1, 0),
			createCanvasItem(22, 1, 1),
			...Array.from({ length: 4 }, (_, index) => createCanvasItem(index + 30, 2, index)),
		]

		expect(resolveSlidesTemplateCanvasIdleLoops(items)).toEqual([
			{
				column: 2,
				delay: 1.3,
				distance: 4 * SLIDES_TEMPLATE_CANVAS_STEP_Y,
				direction: -1,
				duration: (4 * SLIDES_TEMPLATE_CANVAS_STEP_Y) / 13,
			},
		])
	})

	it("renders source cards that enter the viewport later in a long-running loop", () => {
		const allItems = Array.from({ length: 8 }, (_, index) => createCanvasItem(index, 0, index))
		const visibleItems = allItems.slice(0, 4)
		const distance = allItems.length * SLIDES_TEMPLATE_CANVAS_STEP_Y

		expect(
			resolveSlidesTemplateCanvasLoopItems({
				allItems,
				currentY: -4 * SLIDES_TEMPLATE_CANVAS_STEP_Y,
				loopEndY: -distance,
				visibleItems,
			}).map(({ grid }) => grid.y),
		).toEqual(expect.arrayContaining([4, 5, 6, 7]))
	})

	it("preloads the next card before it starts entering the visible column", () => {
		const allItems = Array.from({ length: 8 }, (_, index) => createCanvasItem(index, 0, index))
		const visibleItems = allItems.slice(0, 4)
		const distance = allItems.length * SLIDES_TEMPLATE_CANVAS_STEP_Y

		expect(
			resolveSlidesTemplateCanvasLoopItems({
				allItems,
				currentY: -0.1,
				loopEndY: -distance,
				visibleItems,
			}).map(({ grid }) => grid.y),
		).toContain(4)
	})
})
