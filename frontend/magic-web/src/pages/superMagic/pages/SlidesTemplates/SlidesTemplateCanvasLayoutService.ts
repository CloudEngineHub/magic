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
	type TemplateCanvasPoint,
	type TemplateCanvasSize,
	type TemplateCanvasSpan,
} from "./canvasLayout"
import {
	SLIDES_TEMPLATE_CANVAS_FILLER_ID_MARKER,
	buildTemplateCanvasTiles,
	type SlidesTemplateCanvasTile,
} from "./canvasInteraction"
import {
	getSlidesTemplateCanvasLoopMetrics,
	type SlidesTemplateCanvasLoopItemQuery,
	type SlidesTemplateCanvasLoopMetrics,
} from "./canvasLoop"

const LAYOUT_COLUMNS = 12
const CELL_QUERY_PADDING = 1
const FINITE_LAYOUT_COLUMNS = 6
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
 * 分页追加会先移除边界补位项，让真实模板优先使用已有空位，再重新补齐循环边界。
 * 补位模板优先选择原位置距离边界最远的来源，避免同一模板在当前视口内重复出现。
 */
export class SlidesTemplateCanvasLayoutService {
	private canvasItems: InternalCanvasItem[] = []
	private cellItemIndexes = new Map<string, Set<number>>()
	private contentBounds: TemplateCanvasBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
	private fillerSequence = 0
	private loopMetrics: SlidesTemplateCanvasLoopMetrics = getSlidesTemplateCanvasLoopMetrics([])
	private isInfiniteLoopEnabled = false
	private sourceTiles: SlidesTemplateCanvasTile[] = []
	private templateBounds: TemplateCanvasBounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 }
	// 调度回调必须保持引用稳定；分页后变更引用会让画布重置 effect 清空加载去重状态。
	private loopItemQuery: SlidesTemplateCanvasLoopItemQuery = {
		getItemsInWindow: (input) => this.getItemsInWindow(input),
	}

	public synchronize(templates: OptionItem[], enableInfiniteLoop = true): LayoutSnapshot {
		const nextTiles = buildTemplateCanvasTiles(templates)
		const shouldUseInfiniteLoop =
			enableInfiniteLoop && nextTiles.length >= MIN_LOOP_SOURCE_TILE_COUNT
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
		this.fillerSequence = 0
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

		if (this.isInfiniteLoopEnabled) this.removeFillers()
		// 新分页先使用已有布局中的空位，只有放不下时才继续向下扩展。
		nextTiles.forEach((tile) => this.placeTile(tile, tile.id, 0))
		this.sourceTiles = [...this.sourceTiles, ...nextTiles]
		if (this.isInfiniteLoopEnabled) this.fillOpenRows()
		this.refreshMetrics()
	}

	private getLayoutColumnCount() {
		// 有限结果使用半宽网格，充分利用宽屏，同时避免少量模板铺成过长的单行。
		return this.isInfiniteLoopEnabled ? LAYOUT_COLUMNS : FINITE_LAYOUT_COLUMNS
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

	private removeFillers() {
		if (!this.canvasItems.some((item) => item.isFiller)) return

		this.canvasItems = this.canvasItems.filter((item) => !item.isFiller)
		this.rebuildSpatialIndex()
	}

	private rebuildSpatialIndex() {
		this.cellItemIndexes.clear()
		this.canvasItems.forEach((item, itemIndex) => {
			this.addItemToSpatialIndex(item, itemIndex)
		})
	}

	private fillOpenRows() {
		const maxRow = this.getMaxSourceRow()
		if (maxRow <= 0 || this.sourceTiles.length === 0) return

		const usedSourceTileIds = new Set<string>()
		let grid = this.findFirstOpenCell(maxRow)
		while (grid) {
			const tile = this.findBestFillerTile(grid, maxRow, usedSourceTileIds)
			if (!tile) {
				throw new Error("Unable to fill slides template canvas loop boundary")
			}

			usedSourceTileIds.add(tile.id)
			const fillerNumber = this.fillerSequence
			this.fillerSequence += 1
			this.placeTileAt(
				{
					...tile,
					id: `${tile.id}${SLIDES_TEMPLATE_CANVAS_FILLER_ID_MARKER}${fillerNumber}`,
				},
				tile.id,
				grid,
				true,
			)
			grid = this.findFirstOpenCell(maxRow)
		}
	}

	private findFirstOpenCell(maxRow: number) {
		for (let y = 0; y < maxRow; y += 1) {
			for (let x = 0; x < LAYOUT_COLUMNS; x += 1) {
				if (!this.cellItemIndexes.has(getCellKey(x, y))) return { x, y }
			}
		}

		return undefined
	}

	private findBestFillerTile(
		grid: TemplateCanvasPoint,
		maxRow: number,
		usedSourceTileIds: Set<string>,
	) {
		const candidates = this.sourceTiles
			.map((tile) => {
				const span = getTileSpan(tile)
				if (
					grid.x + span.columns > LAYOUT_COLUMNS ||
					grid.y + span.rows > maxRow ||
					!this.canOccupy(grid.x, grid.y, span)
				) {
					return null
				}

				const sourceItem = this.canvasItems.find(
					(item) => !item.isFiller && item.sourceTileId === tile.id,
				)
				if (!sourceItem) return null

				const sourceCenterY = sourceItem.grid.y + (sourceItem.span.rows - 1) / 2
				const fillerCenterY = grid.y + (span.rows - 1) / 2
				const rowDelta = Math.abs(sourceCenterY - fillerCenterY)
				const cyclicRowDistance = Math.min(rowDelta, Math.max(0, maxRow - rowDelta))
				const sourceCenterX = sourceItem.grid.x + (sourceItem.span.columns - 1) / 2
				const fillerCenterX = grid.x + (span.columns - 1) / 2
				const columnDelta = Math.abs(sourceCenterX - fillerCenterX)
				const cyclicColumnDistance = Math.min(
					columnDelta,
					Math.max(0, LAYOUT_COLUMNS - columnDelta),
				)

				return {
					cyclicColumnDistance,
					cyclicRowDistance,
					isUsed: usedSourceTileIds.has(tile.id),
					tile,
				}
			})
			.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))

		return candidates.sort((left, right) => {
			if (left.isUsed !== right.isUsed) return left.isUsed ? 1 : -1
			if (left.cyclicRowDistance !== right.cyclicRowDistance) {
				return right.cyclicRowDistance - left.cyclicRowDistance
			}
			return right.cyclicColumnDistance - left.cyclicColumnDistance
		})[0]?.tile
	}

	private getMaxSourceRow() {
		return this.canvasItems.reduce(
			(maxRow, item) =>
				item.isFiller ? maxRow : Math.max(maxRow, item.grid.y + item.span.rows),
			0,
		)
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
