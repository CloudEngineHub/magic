import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { getFeaturedSlidesTemplateTag } from "@/pages/superMagic/components/MainInputContainer/panels/slides-preset/templateMeta"
import {
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE,
	SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN,
	SLIDES_TEMPLATE_CANVAS_STEP_X,
	SLIDES_TEMPLATE_CANVAS_STEP_Y,
	getTemplateCanvasBounds,
	type TemplateCanvasBounds,
	type TemplateCanvasItem,
	type TemplateCanvasSize,
	type TemplateCanvasSpan,
} from "./canvasLayout"
import { buildTemplateCanvasTiles, type SlidesTemplateCanvasTile } from "./canvasInteraction"
import {
	getSlidesTemplateCanvasLoopMetrics,
	type SlidesTemplateCanvasLoopItemQuery,
	type SlidesTemplateCanvasLoopMetrics,
} from "./canvasLoop"

const LAYOUT_COLUMNS = 12
const CELL_QUERY_PADDING = 1
const FINITE_LAYOUT_COLUMNS = 3
const MIN_LOOP_SOURCE_TILE_COUNT = LAYOUT_COLUMNS * 3

interface InternalCanvasItem extends TemplateCanvasItem<SlidesTemplateCanvasTile> {
	isFiller: boolean
	sourceTileId: string
}

interface LayoutSnapshot {
	canvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	contentBounds: TemplateCanvasBounds
	loopItemQuery: SlidesTemplateCanvasLoopItemQuery
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	templateBounds: TemplateCanvasBounds
}

function getTileSpan(tile: SlidesTemplateCanvasTile): TemplateCanvasSpan {
	return getFeaturedSlidesTemplateTag(tile.template)
		? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SPAN
		: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SPAN
}

function getTileSize(tile: SlidesTemplateCanvasTile): TemplateCanvasSize {
	return getFeaturedSlidesTemplateTag(tile.template)
		? SLIDES_TEMPLATE_CANVAS_FEATURED_ITEM_SIZE
		: SLIDES_TEMPLATE_CANVAS_DEFAULT_ITEM_SIZE
}

function getCellKey(x: number, y: number) {
	return `${x}:${y}`
}

function hasSameSourcePrefix(
	previousTiles: SlidesTemplateCanvasTile[],
	nextTiles: SlidesTemplateCanvasTile[],
) {
	return (
		nextTiles.length >= previousTiles.length &&
		previousTiles.every((tile, index) => {
			const nextTile = nextTiles[index]
			if (!nextTile) return false
			const previousSpan = getTileSpan(tile)
			const nextSpan = getTileSpan(nextTile)
			return (
				tile.id === nextTile.id &&
				previousSpan.columns === nextSpan.columns &&
				previousSpan.rows === nextSpan.rows
			)
		})
	)
}

function getQueryCellRange(start: number, end: number, step: number, offset = 0) {
	return {
		end: Math.ceil((end - offset) / step) + CELL_QUERY_PADDING,
		start: Math.floor((start - offset) / step) - CELL_QUERY_PADDING,
	}
}

/**
 * 模板墙使用固定列数的完整网格作为循环单元。
 *
 * 每次追加只在已填满区域之后放置新模板，并用现有模板补齐本轮的剩余格子。
 * 因此分页到达不会移动已经展示过的卡片，循环边界也不会出现未占用的空格。
 */
export class SlidesTemplateCanvasLayoutService {
	private canvasItems: InternalCanvasItem[] = []
	private cellItemIndexes = new Map<string, Set<number>>()
	private contentBounds: TemplateCanvasBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
	private fillerCursor = 0
	private fillerSequence = 0
	private filledRowCount = 0
	private loopMetrics: SlidesTemplateCanvasLoopMetrics = getSlidesTemplateCanvasLoopMetrics([])
	private isInfiniteLoopEnabled = false
	private sourceTiles: SlidesTemplateCanvasTile[] = []
	private templateBounds: TemplateCanvasBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
	// 调度回调必须保持引用稳定；分页后变更引用会让画布重置 effect 清空加载去重状态。
	private loopItemQuery: SlidesTemplateCanvasLoopItemQuery = {
		getItemsInWindow: (input) => this.getItemsInWindow(input),
	}

	public synchronize(templates: OptionItem[]): LayoutSnapshot {
		const nextTiles = buildTemplateCanvasTiles(templates)
		const shouldUseInfiniteLoop = nextTiles.length >= MIN_LOOP_SOURCE_TILE_COUNT
		if (
			!hasSameSourcePrefix(this.sourceTiles, nextTiles) ||
			shouldUseInfiniteLoop !== this.isInfiniteLoopEnabled
		) {
			this.reset(nextTiles, shouldUseInfiniteLoop)
		} else {
			this.refreshExistingTileData(nextTiles)
			if (nextTiles.length > this.sourceTiles.length) {
				this.appendSourceTiles(nextTiles.slice(this.sourceTiles.length))
			}
			this.sourceTiles = nextTiles
		}

		return this.getSnapshot()
	}

	private reset(nextTiles: SlidesTemplateCanvasTile[], isInfiniteLoopEnabled: boolean) {
		this.canvasItems = []
		this.cellItemIndexes.clear()
		this.contentBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
		this.fillerCursor = 0
		this.fillerSequence = 0
		this.filledRowCount = 0
		this.isInfiniteLoopEnabled = isInfiniteLoopEnabled
		this.loopMetrics = getSlidesTemplateCanvasLoopMetrics([])
		this.sourceTiles = []
		this.templateBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
		this.appendSourceTiles(nextTiles)
		this.sourceTiles = nextTiles
	}

	private refreshExistingTileData(nextTiles: SlidesTemplateCanvasTile[]) {
		const nextTileById = new Map(nextTiles.map((tile) => [tile.id, tile]))
		let hasChanges = false
		const nextCanvasItems = this.canvasItems.map((canvasItem) => {
			const nextTile = nextTileById.get(canvasItem.sourceTileId)
			if (
				!nextTile ||
				(nextTile.template === canvasItem.item.template &&
					nextTile.imageUrl === canvasItem.item.imageUrl)
			) {
				return canvasItem
			}

			hasChanges = true
			return {
				...canvasItem,
				item: {
					...canvasItem.item,
					imageUrl: nextTile.imageUrl,
					template: nextTile.template,
				},
			}
		})

		if (hasChanges) this.canvasItems = nextCanvasItems
	}

	private appendSourceTiles(nextTiles: SlidesTemplateCanvasTile[]) {
		if (nextTiles.length === 0) return

		const startingRow = this.filledRowCount
		nextTiles.forEach((tile) => this.placeTile(tile, tile.id, startingRow))
		this.sourceTiles = [...this.sourceTiles, ...nextTiles]
		if (this.isInfiniteLoopEnabled) {
			this.fillOpenRows(startingRow)
		} else {
			this.filledRowCount = 0
		}
		this.refreshMetrics()
	}

	private getLayoutColumnCount() {
		// 少量搜索或筛选结果优先按 3 列换行，避免一排卡片横向拉得过长。
		return this.isInfiniteLoopEnabled ? LAYOUT_COLUMNS : FINITE_LAYOUT_COLUMNS
	}

	private fillOpenRows(startingRow: number) {
		if (this.sourceTiles.length === 0) return

		while (!this.areRowsFilled(startingRow, this.getMaxRow())) {
			const maxRow = this.getMaxRow()
			const filler = this.findFillerPlacement(startingRow, maxRow)
			if (!filler) {
				throw new Error("Unable to fill slides template canvas layout rows")
			}

			const fillerNumber = this.fillerSequence
			this.fillerSequence += 1
			this.fillerCursor = (this.fillerCursor + filler.offset + 1) % this.sourceTiles.length
			this.placeTileAt(
				{
					...filler.tile,
					id: `${filler.tile.id}:filler:${fillerNumber}`,
				},
				filler.tile.id,
				filler.grid,
				true,
			)
		}

		this.filledRowCount = this.getMaxRow()
	}

	private placeTile(tile: SlidesTemplateCanvasTile, sourceTileId: string, startingRow: number) {
		const span = getTileSpan(tile)
		const grid = this.findAvailableGridPoint(span, startingRow)
		if (!grid) throw new Error("Unable to find slides template canvas layout position")
		this.placeTileAt(tile, sourceTileId, grid, false)
	}

	private placeTileAt(
		tile: SlidesTemplateCanvasTile,
		sourceTileId: string,
		grid: { x: number; y: number },
		isFiller: boolean,
	) {
		const span = getTileSpan(tile)
		const itemIndex = this.canvasItems.length
		const canvasItem: InternalCanvasItem = {
			grid,
			index: itemIndex,
			item: tile,
			isFiller,
			position: {
				x: (grid.x + (span.columns - 1) / 2) * SLIDES_TEMPLATE_CANVAS_STEP_X,
				y: (grid.y + (span.rows - 1) / 2) * SLIDES_TEMPLATE_CANVAS_STEP_Y,
			},
			size: getTileSize(tile),
			span,
			sourceTileId,
		}

		this.canvasItems.push(canvasItem)
		this.addItemToSpatialIndex(canvasItem, itemIndex)
	}

	private findFillerPlacement(startingRow: number, maxRow: number) {
		for (let offset = 0; offset < this.sourceTiles.length; offset += 1) {
			const tile = this.sourceTiles[(this.fillerCursor + offset) % this.sourceTiles.length]
			if (!tile) continue
			const grid = this.findAvailableGridPoint(getTileSpan(tile), startingRow, maxRow)
			if (grid) return { grid, offset, tile }
		}

		return null
	}

	private findAvailableGridPoint(
		span: TemplateCanvasSpan,
		startingRow: number,
		maxRow = Number.POSITIVE_INFINITY,
	) {
		const layoutColumnCount = this.getLayoutColumnCount()
		for (let y = startingRow; y + span.rows <= maxRow; y += 1) {
			for (let x = 0; x <= layoutColumnCount - span.columns; x += 1) {
				if (!this.canOccupy(x, y, span)) continue
				return { x, y }
			}
		}

		return undefined
	}

	private canOccupy(x: number, y: number, span: TemplateCanvasSpan) {
		for (let row = y; row < y + span.rows; row += 1) {
			for (let column = x; column < x + span.columns; column += 1) {
				if (this.cellItemIndexes.has(getCellKey(column, row))) return false
			}
		}
		return true
	}

	private addItemToSpatialIndex(item: InternalCanvasItem, itemIndex: number) {
		for (let y = item.grid.y; y < item.grid.y + item.span.rows; y += 1) {
			for (let x = item.grid.x; x < item.grid.x + item.span.columns; x += 1) {
				const cellKey = getCellKey(x, y)
				const indexes = this.cellItemIndexes.get(cellKey) ?? new Set<number>()
				indexes.add(itemIndex)
				this.cellItemIndexes.set(cellKey, indexes)
			}
		}
	}

	private areRowsFilled(startingRow: number, maxRow: number) {
		for (let y = startingRow; y < maxRow; y += 1) {
			for (let x = 0; x < LAYOUT_COLUMNS; x += 1) {
				if (!this.cellItemIndexes.has(getCellKey(x, y))) return false
			}
		}
		return true
	}

	private getMaxRow() {
		return this.canvasItems.reduce(
			(maxRow, item) => Math.max(maxRow, item.grid.y + item.span.rows),
			0,
		)
	}

	private refreshMetrics() {
		this.canvasItems = [...this.canvasItems]
		const sourceItems = this.canvasItems.filter((item) => !item.isFiller)
		this.contentBounds = getTemplateCanvasBounds(sourceItems)
		this.templateBounds = getTemplateCanvasBounds(this.canvasItems)
		this.loopMetrics = this.isInfiniteLoopEnabled
			? getSlidesTemplateCanvasLoopMetrics(this.canvasItems)
			: getSlidesTemplateCanvasLoopMetrics([])
	}

	private getItemsInWindow: SlidesTemplateCanvasLoopItemQuery["getItemsInWindow"] = ({
		columnCycle,
		loopMetrics,
		rowCycle,
		windowBounds,
	}) => {
		const localX = getQueryCellRange(
			windowBounds.left - columnCycle * loopMetrics.width,
			windowBounds.right - columnCycle * loopMetrics.width,
			SLIDES_TEMPLATE_CANVAS_STEP_X,
			0,
		)
		const localY = getQueryCellRange(
			windowBounds.top - rowCycle * loopMetrics.height,
			windowBounds.bottom - rowCycle * loopMetrics.height,
			SLIDES_TEMPLATE_CANVAS_STEP_Y,
		)
		const itemIndexes = new Set<number>()

		for (let y = localY.start; y <= localY.end; y += 1) {
			for (let x = localX.start; x <= localX.end; x += 1) {
				this.cellItemIndexes.get(getCellKey(x, y))?.forEach((itemIndex) => {
					itemIndexes.add(itemIndex)
				})
			}
		}

		return Array.from(itemIndexes)
			.sort((left, right) => left - right)
			.map((itemIndex) => this.canvasItems[itemIndex])
			.filter((item): item is InternalCanvasItem => Boolean(item))
	}

	public getSnapshot(): LayoutSnapshot {
		return {
			canvasItems: this.canvasItems,
			contentBounds: this.contentBounds,
			loopItemQuery: this.loopItemQuery,
			loopMetrics: this.loopMetrics,
			templateBounds: this.templateBounds,
		}
	}
}
