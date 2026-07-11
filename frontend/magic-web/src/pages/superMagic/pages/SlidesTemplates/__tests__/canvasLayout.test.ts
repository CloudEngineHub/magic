import { describe, expect, it } from "vitest"
import {
	SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT,
	SLIDES_TEMPLATE_CANVAS_CARD_WIDTH,
	SLIDES_TEMPLATE_CANVAS_COLUMN_OFFSET_Y,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_GAP_X,
	SLIDES_TEMPLATE_CANVAS_GAP_Y,
	buildTemplateCanvasItems,
	constrainTemplateCanvasOffset,
	getTemplateCanvasBounds,
	resolveTemplateCanvasGridIndex,
	resolveTemplateCanvasGridPoint,
	shouldRequestMoreTemplates,
} from "../canvasLayout"
import {
	buildTemplateCanvasTiles,
	getTemplateCoverUrl,
	getTemplatePreviewUrls,
} from "../canvasInteraction"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"

function createTemplate(code: string, previewCount = 0): OptionItem {
	return {
		value: code,
		label: code,
		thumbnail_url: `${code}-cover.png`,
		preview_image_urls: Array.from(
			{ length: previewCount },
			(_, index) => `${code}-page-${index + 1}.png`,
		),
	}
}

describe("slides template canvas layout", () => {
	it("keeps the first template at the center", () => {
		expect(resolveTemplateCanvasGridPoint(0)).toEqual({ x: 0, y: 0 })

		const [firstItem] = buildTemplateCanvasItems(["priority"])
		expect(firstItem?.position).toEqual({ x: 0, y: 0 })
	})

	it("expands template coordinates in four directions around the center", () => {
		const points = Array.from({ length: 9 }, (_, index) =>
			resolveTemplateCanvasGridPoint(index),
		)

		expect(points).toEqual(
			expect.arrayContaining([
				{ x: -1, y: 0 },
				{ x: 1, y: 0 },
				{ x: 0, y: -1 },
				{ x: 0, y: 1 },
			]),
		)
	})

	it("staggers adjacent columns by half a regular card", () => {
		const items = buildTemplateCanvasItems(Array.from({ length: 9 }, (_, index) => index))
		const centerItem = items.find(({ grid }) => grid.x === 0 && grid.y === 0)
		const leftItem = items.find(({ grid }) => grid.x === -1 && grid.y === 0)
		const rightItem = items.find(({ grid }) => grid.x === 1 && grid.y === 0)

		expect(centerItem?.position.y).toBe(0)
		expect(leftItem?.position.y).toBe(SLIDES_TEMPLATE_CANVAS_COLUMN_OFFSET_Y)
		expect(rightItem?.position.y).toBe(SLIDES_TEMPLATE_CANVAS_COLUMN_OFFSET_Y)
	})

	it("maps every grid point back to the same spiral index", () => {
		Array.from({ length: 160 }, (_, index) => {
			expect(resolveTemplateCanvasGridIndex(resolveTemplateCanvasGridPoint(index))).toBe(
				index,
			)
		})
	})

	it("keeps newly loaded templates on a collision-free grid", () => {
		const items = buildTemplateCanvasItems(
			Array.from({ length: 220 }, (_, index) => index),
			{
				getItemSpan: (item) =>
					item % 7 === 0 ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN : undefined,
			},
		)
		const occupiedCells = new Set<string>()

		items.forEach(({ grid, span }) => {
			for (let y = grid.y; y < grid.y + span.rows; y += 1) {
				for (let x = grid.x; x < grid.x + span.columns; x += 1) {
					const cell = `${x}:${y}`
					expect(occupiedCells.has(cell)).toBe(false)
					occupiedCells.add(cell)
				}
			}
		})
	})

	it("aligns featured cards to an exact two-by-two grid area", () => {
		const [featuredItem] = buildTemplateCanvasItems(["featured"], {
			getItemSize: () => SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE,
			getItemSpan: () => SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN,
		})

		expect(featuredItem?.position).toEqual({ x: 0, y: 0 })
		expect(featuredItem?.size).toEqual({
			height: SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT * 2 + SLIDES_TEMPLATE_CANVAS_GAP_Y,
			width: SLIDES_TEMPLATE_CANVAS_CARD_WIDTH * 2 + SLIDES_TEMPLATE_CANVAS_GAP_X,
		})
		expect(featuredItem?.span).toEqual({ columns: 2, rows: 2 })
	})

	it("keeps featured cards aligned while regular columns remain staggered", () => {
		const items = buildTemplateCanvasItems(["regular", "featured"], {
			getItemSize: (item) =>
				item === "featured" ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE : undefined,
			getItemSpan: (item) =>
				item === "featured" ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN : undefined,
		})
		const featuredItem = items.find(({ item }) => item === "featured")

		expect(featuredItem).toBeDefined()
		if (!featuredItem) throw new Error("Expected featured canvas item")
		expect(featuredItem.grid.x).toBe(1)
		expect(featuredItem.position.y).toBe(
			(featuredItem.grid.y + (featuredItem.span.rows - 1) / 2) *
				(SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT + SLIDES_TEMPLATE_CANVAS_GAP_Y),
		)
	})

	it("keeps the configured gap between mixed card sizes", () => {
		const items = buildTemplateCanvasItems(
			Array.from({ length: 40 }, (_, index) => index),
			{
				getItemSize: (item) =>
					item % 7 === 0 ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE : undefined,
				getItemSpan: (item) =>
					item % 7 === 0 ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN : undefined,
			},
		)

		items.forEach((item, itemIndex) => {
			items.slice(itemIndex + 1).forEach((otherItem) => {
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

	it("aligns both columns around a featured card without leaving half-card gaps", () => {
		const items = buildTemplateCanvasItems(
			Array.from({ length: 60 }, (_, index) => index),
			{
				getItemSize: (item) =>
					item === 10 ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE : undefined,
				getItemSpan: (item) =>
					item === 10 ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN : undefined,
			},
		)
		const featuredItem = items[10]
		const featuredTop = featuredItem.position.y - featuredItem.size.height / 2
		const featuredBottom = featuredItem.position.y + featuredItem.size.height / 2

		for (
			let column = featuredItem.grid.x;
			column < featuredItem.grid.x + featuredItem.span.columns;
			column += 1
		) {
			const columnItems = items.filter(
				(item) => item.span.columns === 1 && item.grid.x === column,
			)
			columnItems.forEach((item) => {
				expect(item.position.y).toBe(
					item.grid.y *
						(SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT + SLIDES_TEMPLATE_CANVAS_GAP_Y),
				)
			})
			const itemAbove = columnItems
				.filter((item) => item.position.y + item.size.height / 2 <= featuredTop)
				.sort((left, right) => right.position.y - left.position.y)[0]
			const itemBelow = columnItems
				.filter((item) => item.position.y - item.size.height / 2 >= featuredBottom)
				.sort((left, right) => left.position.y - right.position.y)[0]

			expect(itemAbove).toBeDefined()
			expect(itemBelow).toBeDefined()
			if (!itemAbove || !itemBelow) throw new Error("Expected cards around featured item")
			expect(featuredTop - (itemAbove.position.y + itemAbove.size.height / 2)).toBe(
				SLIDES_TEMPLATE_CANVAS_GAP_Y,
			)
			expect(itemBelow.position.y - itemBelow.size.height / 2 - featuredBottom).toBe(
				SLIDES_TEMPLATE_CANVAS_GAP_Y,
			)
		}

		const staggeredColumnItem = items.find(
			(item) => item.span.columns === 1 && item.grid.x === 1,
		)
		expect(staggeredColumnItem).toBeDefined()
		expect(staggeredColumnItem?.position.y).toBe(
			(staggeredColumnItem?.grid.y ?? 0) *
				(SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT + SLIDES_TEMPLATE_CANVAS_GAP_Y) +
				SLIDES_TEMPLATE_CANVAS_COLUMN_OFFSET_Y,
		)
	})

	it("keeps per-item size in canvas layout and bounds", () => {
		const items = buildTemplateCanvasItems(["regular", "featured"], {
			getItemSize: (item) =>
				item === "featured" ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE : undefined,
			getItemSpan: (item) =>
				item === "featured" ? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN : undefined,
		})

		expect(items[0].size).toEqual(SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE)
		expect(items[0].span).toEqual(SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN)
		expect(items[1].size).toEqual(SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE)
		expect(items[1].span).toEqual(SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN)

		const bounds = getTemplateCanvasBounds(items)
		expect(bounds.minX).toBe(
			Math.min(...items.map((item) => item.position.x - item.size.width / 2)),
		)
		expect(bounds.maxX).toBe(
			Math.max(...items.map((item) => item.position.x + item.size.width / 2)),
		)
		expect(bounds.minY).toBe(
			Math.min(...items.map((item) => item.position.y - item.size.height / 2)),
		)
		expect(bounds.maxY).toBe(
			Math.max(...items.map((item) => item.position.y + item.size.height / 2)),
		)
	})

	it("requests more templates near loaded canvas edges", () => {
		const halfWidth = SLIDES_TEMPLATE_CANVAS_CARD_WIDTH / 2
		const halfHeight = SLIDES_TEMPLATE_CANVAS_CARD_HEIGHT / 2
		const baseInput = {
			bounds: {
				minX: -halfWidth,
				maxX: halfWidth,
				minY: -halfHeight,
				maxY: halfHeight,
			},
			hasMore: true,
			isLoading: false,
			isLoadingMore: false,
			isRefreshing: false,
			threshold: 20,
			viewportHeight: 200,
			viewportWidth: 200,
		}

		expect(
			shouldRequestMoreTemplates({
				...baseInput,
				direction: "left",
				offset: { x: halfWidth - 100, y: 0 },
			}),
		).toBe(true)
		expect(
			shouldRequestMoreTemplates({
				...baseInput,
				direction: "right",
				offset: { x: 100 - halfWidth, y: 0 },
			}),
		).toBe(true)
		expect(
			shouldRequestMoreTemplates({
				...baseInput,
				direction: "up",
				offset: { x: 0, y: halfHeight - 100 },
			}),
		).toBe(true)
		expect(
			shouldRequestMoreTemplates({
				...baseInput,
				direction: "down",
				offset: { x: 0, y: 100 - halfHeight },
			}),
		).toBe(true)
	})

	it("does not request more templates when loading or exhausted", () => {
		const input = {
			bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
			direction: "right" as const,
			offset: { x: 0, y: 0 },
			threshold: 200,
			viewportHeight: 200,
			viewportWidth: 200,
		}

		expect(
			shouldRequestMoreTemplates({
				...input,
				hasMore: false,
				isLoading: false,
				isLoadingMore: false,
				isRefreshing: false,
			}),
		).toBe(false)
		expect(
			shouldRequestMoreTemplates({
				...input,
				hasMore: true,
				isLoading: false,
				isLoadingMore: true,
				isRefreshing: false,
			}),
		).toBe(false)
	})

	it("keeps movement bounded to the configured edge padding", () => {
		expect(
			constrainTemplateCanvasOffset({
				bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
				offset: { x: 1000, y: -1000 },
				padding: 96,
				viewportHeight: 200,
				viewportWidth: 200,
			}),
		).toEqual({ x: 96, y: -96 })
	})

	it("clamps movement to loaded bounds after all templates are loaded", () => {
		const baseInput = {
			bounds: { minX: -100, maxX: 100, minY: -80, maxY: 80 },
			padding: 0,
			viewportHeight: 100,
			viewportWidth: 100,
		}

		expect(
			constrainTemplateCanvasOffset({
				...baseInput,
				offset: { x: 1000, y: -1000 },
			}),
		).toEqual({ x: 50, y: -30 })
		expect(
			constrainTemplateCanvasOffset({
				...baseInput,
				offset: { x: -1000, y: 1000 },
			}),
		).toEqual({ x: -50, y: 30 })
	})

	it("keeps the bottom canvas edge above an obscuring floating toolbar", () => {
		expect(
			constrainTemplateCanvasOffset({
				bounds: { minX: -100, maxX: 100, minY: -300, maxY: 300 },
				insets: { bottom: 160 },
				offset: { x: 0, y: -1000 },
				padding: 0,
				viewportHeight: 600,
				viewportWidth: 600,
			}),
		).toEqual({ x: 0, y: -160 })
	})

	it("centers a short canvas inside the visible area above the bottom inset", () => {
		expect(
			constrainTemplateCanvasOffset({
				bounds: { minX: -100, maxX: 100, minY: -100, maxY: 100 },
				insets: { bottom: 160 },
				offset: { x: 0, y: 0 },
				padding: 0,
				viewportHeight: 600,
				viewportWidth: 600,
			}),
		).toEqual({ x: 0, y: -80 })
	})

	it("keeps every canvas edge inside the configured visible area", () => {
		const baseInput = {
			bounds: { minX: -300, maxX: 300, minY: -300, maxY: 300 },
			insets: { top: 40, right: 40, bottom: 40, left: 40 },
			padding: 0,
			viewportHeight: 600,
			viewportWidth: 600,
		}

		expect(
			constrainTemplateCanvasOffset({
				...baseInput,
				offset: { x: 1000, y: 1000 },
			}),
		).toEqual({ x: 40, y: 40 })
		expect(
			constrainTemplateCanvasOffset({
				...baseInput,
				offset: { x: -1000, y: -1000 },
			}),
		).toEqual({ x: -40, y: -40 })
	})

	it("centers loaded templates when the viewport is larger than the canvas bounds", () => {
		expect(
			constrainTemplateCanvasOffset({
				bounds: { minX: 40, maxX: 140, minY: -20, maxY: 80 },
				offset: { x: 1000, y: -1000 },
				padding: 0,
				viewportHeight: 500,
				viewportWidth: 500,
			}),
		).toEqual({ x: -90, y: -30 })
	})

	it("renders only template covers in the canvas matrix", () => {
		const tiles = buildTemplateCanvasTiles([
			createTemplate("business", 3),
			createTemplate("plan", 2),
		])

		expect(tiles).toHaveLength(2)
		expect(tiles.every((tile) => tile.kind === "cover")).toBe(true)
		expect(tiles.map((tile) => tile.imageUrl)).toEqual(["business-cover.png", "plan-cover.png"])
	})

	it("keeps all preview pages available for the inline preview", () => {
		expect(getTemplatePreviewUrls(createTemplate("business", 3))).toEqual([
			"business-page-1.png",
			"business-page-2.png",
			"business-page-3.png",
		])
	})

	it("keeps one canvas tile per template even when a template has many pages", () => {
		const tiles = buildTemplateCanvasTiles(
			Array.from({ length: 8 }, (_, index) => createTemplate(`template-${index}`, 4)),
		)

		expect(tiles).toHaveLength(8)
		expect(tiles.map((tile) => tile.id)).toEqual(
			Array.from({ length: 8 }, (_, index) => `template-${index}:cover:${index}`),
		)
	})

	it("keeps duplicate template values as separate canvas tiles", () => {
		const tiles = buildTemplateCanvasTiles([
			createTemplate("duplicate-template"),
			createTemplate("duplicate-template"),
		])

		expect(tiles).toHaveLength(2)
		expect(new Set(tiles.map((tile) => tile.id)).size).toBe(2)
	})

	it("uses smaller processed images for canvas cover tiles", () => {
		const coverUrl = getTemplateCoverUrl({
			...createTemplate("tos-template"),
			thumbnail_url:
				"https://bucket.tos-cn-beijing.volces.com/slides/cover.png?x-tos-process=image%2Fresize%2Cw_1920%2Fformat%2Cwebp",
		})

		expect(new URL(coverUrl ?? "").searchParams.get("x-tos-process")).toBe(
			"image/resize,w_720/quality,Q_82/format,webp",
		)
	})
})
