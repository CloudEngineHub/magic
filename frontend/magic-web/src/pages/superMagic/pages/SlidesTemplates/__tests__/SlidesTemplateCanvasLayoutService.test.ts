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

function getGridBounds(items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>) {
	return items.reduce(
		(bounds, item) => ({
			maxColumn: Math.max(bounds.maxColumn, item.grid.x + item.span.columns),
			maxRow: Math.max(bounds.maxRow, item.grid.y + item.span.rows),
			minColumn: Math.min(bounds.minColumn, item.grid.x),
			minRow: Math.min(bounds.minRow, item.grid.y),
		}),
		{
			maxColumn: Number.NEGATIVE_INFINITY,
			maxRow: Number.NEGATIVE_INFINITY,
			minColumn: Number.POSITIVE_INFINITY,
			minRow: Number.POSITIVE_INFINITY,
		},
	)
}

describe("SlidesTemplateCanvasLayoutService", () => {
	it("fills the loop unit while keeping one source item per real template", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const { canvasItems, loopMetrics } = service.synchronize(
			Array.from({ length: 55 }, (_, index) => createTemplate(index + 1, index % 5 === 0)),
		)
		const sourceItems = getSourceItems(canvasItems)
		const occupiedCells = getOccupiedCells(canvasItems)

		expect(sourceItems).toHaveLength(55)
		expect(new Set(sourceItems.map(({ item }) => item.template.value)).size).toBe(55)
		expect(occupiedCells.size).toBe(loopMetrics.columnStride * loopMetrics.rowStride)
		expect(loopMetrics.width).toBeGreaterThan(0)
		expect(loopMetrics.height).toBeGreaterThan(0)
	})

	it("does not show duplicate templates in the centered initial viewport", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const snapshot = service.synchronize(
			Array.from({ length: 200 }, (_, index) => createTemplate(index + 1, index % 11 === 0)),
		)
		const viewportWidth = 1_728
		const viewportHeight = 1_084
		const centerX = (snapshot.contentBounds.minX + snapshot.contentBounds.maxX) / 2
		const centerY = (snapshot.contentBounds.minY + snapshot.contentBounds.maxY) / 2
		const visibleItems = getLoopedVisibleSlidesTemplateCanvasItems({
			itemQuery: snapshot.loopItemQuery,
			items: snapshot.canvasItems,
			loopMetrics: snapshot.loopMetrics,
			offset: {
				x: viewportWidth / 2 - centerX,
				y: viewportHeight / 2 - centerY,
			},
			viewportHeight,
			viewportWidth,
		})
		const visibleTemplateValues = visibleItems.map(({ item }) => item.template.value)

		expect(visibleItems.length).toBeGreaterThan(0)
		expect(new Set(visibleTemplateValues).size).toBe(visibleTemplateValues.length)
	})

	it("spreads a small finite result set across six columns without filler or loop copies", () => {
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
		expect(Math.max(...snapshot.canvasItems.map(({ grid }) => grid.x))).toBe(5)
		expect(new Set(snapshot.canvasItems.map(({ grid }) => grid.y))).toEqual(new Set([0]))
		expect(visibleItems.map(({ item }) => item.id)).toEqual(
			snapshot.canvasItems.map(({ item }) => item.id),
		)
		expect(visibleItems.every(({ renderKey }) => renderKey == null)).toBe(true)
	})

	it("keeps large filtered result sets finite when the loop is disabled", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const snapshot = service.synchronize(
			Array.from({ length: 55 }, (_, index) => createTemplate(index + 1, index % 5 === 0)),
			false,
		)

		expect(snapshot.canvasItems).toHaveLength(55)
		expect(snapshot.loopMetrics.width).toBe(0)
		expect(snapshot.loopMetrics.height).toBe(0)
		expect(snapshot.canvasItems.every(({ item }) => !item.id.includes(":filler:"))).toBe(true)
		expect(
			Math.max(...snapshot.canvasItems.map(({ grid, span }) => grid.x + span.columns)),
		).toBe(6)
	})

	it("uses the full finite width when regular and featured templates are mixed", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const snapshot = service.synchronize(
			Array.from({ length: 12 }, (_, index) =>
				createTemplate(index + 1, index === 0 || index === 6),
			),
		)
		const columnCount = Math.max(
			...snapshot.canvasItems.map(({ grid, span }) => grid.x + span.columns),
		)

		expect(snapshot.loopMetrics.width).toBe(0)
		expect(snapshot.canvasItems).toHaveLength(12)
		expect(columnCount).toBe(6)
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
		expect(getSourceItems(appendedSnapshot.canvasItems)[0]).toBe(
			getSourceItems(initialSnapshot.canvasItems)[0],
		)
		expect(appendedSnapshot.loopItemQuery).toBe(initialSnapshot.loopItemQuery)
	})

	it("uses real appended templates to fill existing gaps before extending the grid", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const firstPage = Array.from({ length: 40 }, (_, index) =>
			createTemplate(index + 1, index % 6 === 0),
		)
		const initialSnapshot = service.synchronize(firstPage)
		const initialSourceItems = getSourceItems(initialSnapshot.canvasItems)
		const initialBounds = getGridBounds(initialSourceItems)
		const initialLocations = new Map(
			initialSourceItems.map((item) => [item.item.id, item.grid]),
		)
		const appendedSnapshot = service.synchronize([
			...firstPage,
			...Array.from({ length: 40 }, (_, index) => createTemplate(index + 41)),
		])
		const appendedSourceItems = getSourceItems(appendedSnapshot.canvasItems).filter(
			({ item }) => Number(String(item.template.value).replace("template-", "")) > 40,
		)

		initialLocations.forEach((grid, itemId) => {
			expect(
				appendedSnapshot.canvasItems.find(({ item }) => item.id === itemId)?.grid,
			).toEqual(grid)
		})
		expect(appendedSourceItems).toHaveLength(40)
		expect(appendedSourceItems.some((item) => item.grid.y < initialBounds.maxRow)).toBe(true)
		expect(getSourceItems(appendedSnapshot.canvasItems)).toHaveLength(80)
		expect(
			new Set(
				getSourceItems(appendedSnapshot.canvasItems).map(({ item }) => item.template.value),
			).size,
		).toBe(80)
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

	it("fills the loop unit when every template is featured", () => {
		const service = new SlidesTemplateCanvasLayoutService()
		const { canvasItems, loopMetrics } = service.synchronize(
			Array.from({ length: 37 }, (_, index) => createTemplate(index + 1, true)),
		)
		const sourceItems = getSourceItems(canvasItems)
		const occupiedCells = getOccupiedCells(canvasItems)

		expect(sourceItems).toHaveLength(37)
		expect(new Set(sourceItems.map(({ item }) => item.template.value)).size).toBe(37)
		expect(occupiedCells.size).toBe(loopMetrics.columnStride * loopMetrics.rowStride)
		expect(loopMetrics.width).toBeGreaterThan(0)
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
