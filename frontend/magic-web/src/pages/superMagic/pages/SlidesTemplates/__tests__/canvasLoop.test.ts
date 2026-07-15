import { describe, expect, it } from "vitest"
import {
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_GAP_X,
	SLIDES_TEMPLATE_CANVAS_GAP_Y,
	buildTemplateCanvasItems,
} from "../canvasLayout"
import type { SlidesTemplateCanvasTile } from "../canvasInteraction"
import {
	getLoopedVisibleSlidesTemplateCanvasItems,
	getNearestLoopedSlidesTemplateCanvasItem,
	getRebasedSlidesTemplateCanvasOffset,
	getSlidesTemplateCanvasLoopCycle,
	getSlidesTemplateCanvasLoopMetrics,
} from "../canvasLoop"
import { SLIDES_TEMPLATE_CANVAS_MIN_SCALE } from "../canvasZoom"
import {
	getTemplateCanvasVisibleItemLimit,
	MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS,
} from "../canvasViewport"

function createTile(index: number): SlidesTemplateCanvasTile {
	return {
		id: `template-${index}`,
		kind: "cover",
		template: {
			label: `Template ${index}`,
			value: `template-${index}`,
		},
	}
}

describe("slides template canvas loop", () => {
	it("keeps the visible DOM budget stable after moving through many loop periods", () => {
		const items = buildTemplateCanvasItems([createTile(1)])
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics(items)
		const viewport = { viewportHeight: 600, viewportWidth: 800 }
		const initialItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: { x: 0, y: 0 },
			...viewport,
		})
		const distantItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: {
				x: -loopMetrics.width * 10_000,
				y: loopMetrics.height * 10_000,
			},
			...viewport,
		})

		expect(distantItems).toHaveLength(initialItems.length)
		expect(distantItems.length).toBeGreaterThan(0)
		expect(distantItems.length).toBeLessThanOrEqual(MAX_VISIBLE_TEMPLATE_CANVAS_ITEMS)
		expect(distantItems.every(({ item }) => item.id.includes(":loop:"))).toBe(true)
	})

	it("keeps giant low-scale viewports focused on the nearest looped cards", () => {
		const items = buildTemplateCanvasItems([createTile(1)])
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics(items)
		const viewport = { viewportHeight: 4320, viewportWidth: 7680 }
		const visibleItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: { x: 0, y: 0 },
			scale: SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
			...viewport,
		})
		const visibleItemLimit = getTemplateCanvasVisibleItemLimit({
			scale: SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
			...viewport,
		})
		const viewportCenter = { x: 0, y: 0 }
		const distances = visibleItems.map(
			(item) =>
				Math.pow(item.position.x - viewportCenter.x, 2) +
				Math.pow(item.position.y - viewportCenter.y, 2),
		)

		expect(visibleItems).toHaveLength(visibleItemLimit)
		expect(distances).toEqual([...distances].sort((left, right) => left - right))
	})

	it("uses distinct stable ids for repeated instances", () => {
		const items = buildTemplateCanvasItems([createTile(1), createTile(2), createTile(3)])
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics(items)
		const visibleItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: { x: -loopMetrics.width, y: 0 },
			viewportHeight: 600,
			viewportWidth: 800,
		})
		const ids = visibleItems.map(({ item }) => item.id)
		const renderKeys = visibleItems.map(({ renderKey }) => renderKey)

		expect(new Set(ids).size).toBe(ids.length)
		expect(new Set(renderKeys).size).toBe(renderKeys.length)
		expect(ids.some((id) => id.endsWith(":loop:1:0"))).toBe(true)
	})

	it("reuses render slots when the viewport crosses a loop period", () => {
		const items = buildTemplateCanvasItems([createTile(1), createTile(2), createTile(3)])
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics(items)
		const viewport = { viewportHeight: 600, viewportWidth: 800 }
		const initialItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: { x: 0, y: 0 },
			...viewport,
		})
		const nextPeriodItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: { x: -loopMetrics.width, y: 0 },
			...viewport,
		})

		expect(nextPeriodItems.map(({ renderKey }) => renderKey).sort()).toEqual(
			initialItems.map(({ renderKey }) => renderKey).sort(),
		)
		expect(nextPeriodItems.map(({ item }) => item.id).sort()).not.toEqual(
			initialItems.map(({ item }) => item.id).sort(),
		)
	})

	it("resolves focus to the nearest repeated instance", () => {
		const items = buildTemplateCanvasItems([createTile(1)])
		const item = items[0]
		expect(item).toBeDefined()
		if (!item) throw new Error("Expected one canvas item")
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics([item])
		const focusedItem = getNearestLoopedSlidesTemplateCanvasItem({
			item,
			loopMetrics,
			offset: {
				x: -loopMetrics.width * 20,
				y: loopMetrics.height * 12,
			},
		})

		expect(focusedItem.position).toEqual({
			x: loopMetrics.width * 20,
			y: -loopMetrics.height * 12,
		})
		expect(focusedItem.item.id).toBe("template-1:loop:20:-12")
	})

	it("keeps repeated mixed-size layouts collision free", () => {
		const items = buildTemplateCanvasItems(
			Array.from({ length: 40 }, (_, index) => createTile(index)),
			{
				getItemSize: (_, index) =>
					index % 7 === 0
						? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE
						: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
				getItemSpan: (_, index) =>
					index % 7 === 0
						? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN
						: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
			},
		)
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics(items)
		const visibleItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics,
			offset: { x: -loopMetrics.width / 2, y: -loopMetrics.height / 2 },
			viewportHeight: 1200,
			viewportWidth: 1800,
		})

		visibleItems.forEach((item, itemIndex) => {
			visibleItems.slice(itemIndex + 1).forEach((otherItem) => {
				const horizontalGap =
					Math.abs(item.position.x - otherItem.position.x) -
					(item.size.width + otherItem.size.width) / 2
				const verticalGap =
					Math.abs(item.position.y - otherItem.position.y) -
					(item.size.height + otherItem.size.height) / 2

				expect(
					horizontalGap >= SLIDES_TEMPLATE_CANVAS_GAP_X ||
						verticalGap >= SLIDES_TEMPLATE_CANVAS_GAP_Y,
				).toBe(true)
			})
		})
	})

	it("reports the current loop cycle from the viewport center", () => {
		const items = buildTemplateCanvasItems([createTile(1)])
		const loopMetrics = getSlidesTemplateCanvasLoopMetrics(items)

		expect(
			getSlidesTemplateCanvasLoopCycle({
				loopMetrics,
				offset: { x: 0, y: 0 },
			}),
		).toEqual({ x: 0, y: 0 })
		expect(
			getSlidesTemplateCanvasLoopCycle({
				loopMetrics,
				offset: { x: -loopMetrics.width * 4, y: loopMetrics.height * 3 },
			}),
		).toEqual({ x: 4, y: -3 })
	})

	it("keeps the current loop cell at the same screen position when data changes the period", () => {
		const previousItems = buildTemplateCanvasItems([createTile(1)])
		const nextItems = buildTemplateCanvasItems(
			Array.from({ length: 12 }, (_, index) => createTile(index + 1)),
		)
		const previousLoopMetrics = getSlidesTemplateCanvasLoopMetrics(previousItems)
		const nextLoopMetrics = getSlidesTemplateCanvasLoopMetrics(nextItems)
		const scale = 0.72
		const loopCycle = { x: 7, y: -4 }
		const offset = {
			x: -previousLoopMetrics.width * loopCycle.x * scale,
			y: -previousLoopMetrics.height * loopCycle.y * scale,
		}
		const rebasedOffset = getRebasedSlidesTemplateCanvasOffset({
			nextLoopMetrics,
			offset,
			previousLoopMetrics,
			scale,
		})
		const item = previousItems[0]
		expect(item).toBeDefined()
		if (!item) throw new Error("Expected one canvas item")

		const previousScreenPosition = {
			x: (item.position.x + loopCycle.x * previousLoopMetrics.width) * scale + offset.x,
			y: (item.position.y + loopCycle.y * previousLoopMetrics.height) * scale + offset.y,
		}
		const nextScreenPosition = {
			x: (item.position.x + loopCycle.x * nextLoopMetrics.width) * scale + rebasedOffset.x,
			y: (item.position.y + loopCycle.y * nextLoopMetrics.height) * scale + rebasedOffset.y,
		}

		expect(nextScreenPosition.x).toBeCloseTo(previousScreenPosition.x)
		expect(nextScreenPosition.y).toBeCloseTo(previousScreenPosition.y)
	})
})
