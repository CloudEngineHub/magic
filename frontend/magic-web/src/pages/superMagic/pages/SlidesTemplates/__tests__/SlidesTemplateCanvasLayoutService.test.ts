import { describe, expect, it, vi } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN, type TemplateCanvasItem } from "../canvasLayout"
import { SlidesTemplateCanvasLayoutService } from "../SlidesTemplateCanvasLayoutService"
import type { SlidesTemplateCanvasTile } from "../canvasInteraction"
import { getLoopedVisibleSlidesTemplateCanvasItems } from "../canvasLoop"

function createTemplate(index: number, featured = false): OptionItem {
	return {
		label: `Template ${index}`,
		thumbnail_url: `https://example.com/${index}.png`,
		value: `template-${index}`,
		...(featured
			? {
					tags: [
						{
							code: "featured",
							id: `featured-${index}`,
							name_i18n: { en_US: "Featured", zh_CN: "精选" },
						},
					],
				}
			: {}),
	}
}

function getOccupiedCells(items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>) {
	const cells = new Set<string>()
	items.forEach(({ grid, span }) => {
		for (let y = grid.y; y < grid.y + span.rows; y += 1) {
			for (let x = grid.x; x < grid.x + span.columns; x += 1) {
				cells.add(`${x}:${y}`)
			}
		}
	})
	return cells
}

function getSourceItems(items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>) {
	return items.filter(({ item }) => !item.id.includes(":filler:"))
}

describe("SlidesTemplateCanvasLayoutService", () => {
	it("fills every cell of the finite loop unit with mixed card spans", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const { canvasItems, loopMetrics } = service.synchronize(
			Array.from({ length: 55 }, (_, index) => createTemplate(index + 1, index % 5 === 0)),
		)
		const occupiedCells = getOccupiedCells(canvasItems)

		for (let y = 0; y < loopMetrics.rowStride; y += 1) {
			for (let x = 0; x < loopMetrics.columnStride; x += 1) {
				expect(occupiedCells.has(`${x}:${y}`)).toBe(true)
			}
		}
	})

	it("keeps a small result set finite in multiple rows without filler or loop copies", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const snapshot = service.synchronize(
			Array.from({ length: 6 }, (_, index) => createTemplate(index + 1)),
		)
		const visibleItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items: snapshot.canvasItems,
			loopMetrics: snapshot.loopMetrics,
			offset: { x: -500, y: 0 },
			viewportHeight: 600,
			viewportWidth: 2_000,
		})

		expect(snapshot.canvasItems).toHaveLength(6)
		expect(snapshot.loopMetrics.width).toBe(0)
		expect(visibleItems).toHaveLength(6)
		expect(Math.max(...snapshot.canvasItems.map(({ grid }) => grid.x))).toBe(2)
		expect(new Set(snapshot.canvasItems.map(({ grid }) => grid.y))).toEqual(new Set([0, 1]))
		expect(visibleItems.map(({ item }) => item.id)).toEqual(
			snapshot.canvasItems.map(({ item }) => item.id),
		)
		expect(visibleItems.every(({ renderKey }) => renderKey == null)).toBe(true)
	})

	it("keeps existing source card coordinates when a page is appended", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const firstPage = Array.from({ length: 40 }, (_, index) =>
			createTemplate(index + 1, index % 6 === 0),
		)
		const initialSnapshot = service.synchronize(firstPage)
		const initialLocations = new Map(
			getSourceItems(initialSnapshot.canvasItems).map((item) => [
				item.item.id,
				{ grid: item.grid, position: item.position },
			]),
		)
		const appendedSnapshot = service.synchronize([
			...firstPage,
			...Array.from({ length: 40 }, (_, index) =>
				createTemplate(index + 41, index % 4 === 0),
			),
		])

		initialLocations.forEach((location, itemId) => {
			const item = appendedSnapshot.canvasItems.find(({ item: tile }) => tile.id === itemId)
			expect(item?.grid).toEqual(location.grid)
			expect(item?.position).toEqual(location.position)
		})
		expect(appendedSnapshot.canvasItems[0]).toBe(initialSnapshot.canvasItems[0])
		expect(appendedSnapshot.loopItemQuery).toBe(initialSnapshot.loopItemQuery)
	})

	it("switches back to the full loop grid once the result set reaches the loop threshold", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const finiteSnapshot = service.synchronize(
			Array.from({ length: 35 }, (_, index) => createTemplate(index + 1)),
		)
		const loopSnapshot = service.synchronize(
			Array.from({ length: 36 }, (_, index) => createTemplate(index + 1)),
		)

		expect(finiteSnapshot.loopMetrics.width).toBe(0)
		expect(loopSnapshot.loopMetrics.width).toBeGreaterThan(0)
		expect(Math.max(...loopSnapshot.canvasItems.map(({ grid }) => grid.x))).toBeGreaterThan(2)
	})

	it("fills a loop unit when every template is featured", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const { canvasItems, loopMetrics } = service.synchronize(
			Array.from({ length: 37 }, (_, index) => createTemplate(index + 1, true)),
		)
		const occupiedCells = getOccupiedCells(canvasItems)

		for (let y = 0; y < loopMetrics.rowStride; y += 1) {
			for (let x = 0; x < loopMetrics.columnStride; x += 1) {
				expect(occupiedCells.has(`${x}:${y}`)).toBe(true)
			}
		}
	})

	it("keeps featured cards at the configured two-by-two size", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const { canvasItems } = service.synchronize([createTemplate(1, true), createTemplate(2)])
		const featuredItem = canvasItems.find(({ item }) => item.template.value === "template-1")

		expect(featuredItem?.span).toEqual(SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN)
	})

	it("rebuilds when a template changes between regular and featured", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		service.synchronize([createTemplate(1)])
		const { canvasItems } = service.synchronize([createTemplate(1, true)])

		expect(canvasItems[0]?.span).toEqual(SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN)
	})

	it("uses the spatial index instead of returning every loaded card for a viewport query", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const { canvasItems, loopItemQuery, loopMetrics } = service.synchronize(
			Array.from({ length: 400 }, (_, index) => createTemplate(index + 1, index % 9 === 0)),
		)
		const candidates = loopItemQuery.getItemsInWindow({
			columnCycle: 0,
			loopMetrics,
			rowCycle: 0,
			windowBounds: { bottom: 600, left: -600, right: 600, top: -600 },
		})

		expect(candidates.length).toBeGreaterThan(0)
		expect(candidates.length).toBeLessThan(canvasItems.length)
	})

	it("passes indexed candidates into the loop renderer", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const snapshot = service.synchronize(
			Array.from({ length: 240 }, (_, index) => createTemplate(index + 1, index % 7 === 0)),
		)
		const getItemsInWindow = vi.fn(snapshot.loopItemQuery.getItemsInWindow)
		const visibleItems = getLoopedVisibleSlidesTemplateCanvasItems({
			itemQuery: { getItemsInWindow },
			items: snapshot.canvasItems,
			loopMetrics: snapshot.loopMetrics,
			offset: { x: 0, y: 0 },
			viewportHeight: 600,
			viewportWidth: 800,
		})

		expect(getItemsInWindow).toHaveBeenCalled()
		expect(visibleItems.length).toBeGreaterThan(0)
		expect(visibleItems.length).toBeLessThan(snapshot.canvasItems.length)
	})
})
