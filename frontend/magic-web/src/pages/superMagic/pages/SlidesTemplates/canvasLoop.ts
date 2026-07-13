import {
	SLIDES_TEMPLATE_CANVAS_STEP_X,
	SLIDES_TEMPLATE_CANVAS_STEP_Y,
	getTemplateCanvasBounds,
	type TemplateCanvasBounds,
	type TemplateCanvasItem,
	type TemplateCanvasPoint,
} from "./canvasLayout"
import type { SlidesTemplateCanvasTile } from "./canvasInteraction"
import {
	getTemplateCanvasViewportWindow,
	getVisibleTemplateCanvasItems,
	getTemplateCanvasVisibleItemLimit,
} from "./canvasViewport"

export interface SlidesTemplateCanvasLoopMetrics {
	bounds: TemplateCanvasBounds
	columnStride: number
	height: number
	rowStride: number
	width: number
}

interface LoopViewportInput {
	itemQuery?: SlidesTemplateCanvasLoopItemQuery
	items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	offset: TemplateCanvasPoint
	scale?: number
	viewportHeight: number
	viewportWidth: number
}

export interface SlidesTemplateCanvasLoopItemQuery {
	getItemsInWindow: (input: {
		columnCycle: number
		loopMetrics: SlidesTemplateCanvasLoopMetrics
		rowCycle: number
		windowBounds: ReturnType<typeof getTemplateCanvasViewportWindow>
	}) => Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
}

interface NearestLoopedItemInput {
	item: TemplateCanvasItem<SlidesTemplateCanvasTile>
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	offset: TemplateCanvasPoint
	scale?: number
}

interface LoopCycleInput {
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	offset: TemplateCanvasPoint
	scale?: number
}

interface LoopedCanvasItemCandidate {
	columnCycle: number
	distance: number
	item: TemplateCanvasItem<SlidesTemplateCanvasTile>
	order: number
	rowCycle: number
}

const EMPTY_LOOP_METRICS: SlidesTemplateCanvasLoopMetrics = {
	bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
	columnStride: 0,
	height: 0,
	rowStride: 0,
	width: 0,
}

export function getSlidesTemplateCanvasLoopMetrics(
	items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>,
): SlidesTemplateCanvasLoopMetrics {
	if (items.length === 0) return EMPTY_LOOP_METRICS

	let minColumn = Number.POSITIVE_INFINITY
	let maxColumn = Number.NEGATIVE_INFINITY
	let minRow = Number.POSITIVE_INFINITY
	let maxRow = Number.NEGATIVE_INFINITY

	for (const { grid, span } of items) {
		minColumn = Math.min(minColumn, grid.x)
		maxColumn = Math.max(maxColumn, grid.x + span.columns)
		minRow = Math.min(minRow, grid.y)
		maxRow = Math.max(maxRow, grid.y + span.rows)
	}

	const columnStride = Math.max(1, maxColumn - minColumn)
	const rowStride = Math.max(1, maxRow - minRow)

	return {
		bounds: getTemplateCanvasBounds(items),
		columnStride,
		height: rowStride * SLIDES_TEMPLATE_CANVAS_STEP_Y,
		rowStride,
		width: columnStride * SLIDES_TEMPLATE_CANVAS_STEP_X,
	}
}

function getLoopCycleRange(
	windowStart: number,
	windowEnd: number,
	contentStart: number,
	contentEnd: number,
	period: number,
) {
	if (period <= 0) return { end: 0, start: 0 }

	return {
		start: Math.ceil((windowStart - contentEnd) / period),
		end: Math.floor((windowEnd - contentStart) / period),
	}
}

function createLoopedCanvasItem(
	item: TemplateCanvasItem<SlidesTemplateCanvasTile>,
	columnCycle: number,
	rowCycle: number,
	loopMetrics: SlidesTemplateCanvasLoopMetrics,
	renderCycle: TemplateCanvasPoint = { x: columnCycle, y: rowCycle },
) {
	return {
		...item,
		grid: {
			x: item.grid.x + columnCycle * loopMetrics.columnStride,
			y: item.grid.y + rowCycle * loopMetrics.rowStride,
		},
		item: {
			...item.item,
			id: `${item.item.id}:loop:${columnCycle}:${rowCycle}`,
		},
		position: {
			x: item.position.x + columnCycle * loopMetrics.width,
			y: item.position.y + rowCycle * loopMetrics.height,
		},
		renderKey: `${item.item.id}:slot:${columnCycle - renderCycle.x}:${rowCycle - renderCycle.y}`,
	}
}

function isLoopedCanvasItemInWindow(
	item: TemplateCanvasItem<SlidesTemplateCanvasTile>,
	columnCycle: number,
	rowCycle: number,
	loopMetrics: SlidesTemplateCanvasLoopMetrics,
	windowBounds: ReturnType<typeof getTemplateCanvasViewportWindow>,
) {
	const centerX = item.position.x + columnCycle * loopMetrics.width
	const centerY = item.position.y + rowCycle * loopMetrics.height
	const halfWidth = item.size.width / 2
	const halfHeight = item.size.height / 2

	return (
		centerX + halfWidth >= windowBounds.left &&
		centerX - halfWidth <= windowBounds.right &&
		centerY + halfHeight >= windowBounds.top &&
		centerY - halfHeight <= windowBounds.bottom
	)
}

function compareLoopedCanvasItemCandidates(
	left: LoopedCanvasItemCandidate,
	right: LoopedCanvasItemCandidate,
) {
	if (left.distance !== right.distance) return left.distance - right.distance
	return left.order - right.order
}

function siftLoopedCanvasCandidateUp(heap: LoopedCanvasItemCandidate[], index: number) {
	let nextIndex = index
	while (nextIndex > 0) {
		const parentIndex = Math.floor((nextIndex - 1) / 2)
		const parent = heap[parentIndex]
		const candidate = heap[nextIndex]
		if (!parent || !candidate || compareLoopedCanvasItemCandidates(parent, candidate) >= 0) {
			return
		}
		heap[parentIndex] = candidate
		heap[nextIndex] = parent
		nextIndex = parentIndex
	}
}

function siftLoopedCanvasCandidateDown(heap: LoopedCanvasItemCandidate[]) {
	let index = 0
	while (index < heap.length) {
		const leftIndex = index * 2 + 1
		const rightIndex = leftIndex + 1
		let nextIndex = index

		if (
			leftIndex < heap.length &&
			compareLoopedCanvasItemCandidates(
				heap[leftIndex] as LoopedCanvasItemCandidate,
				heap[nextIndex] as LoopedCanvasItemCandidate,
			) > 0
		) {
			nextIndex = leftIndex
		}
		if (
			rightIndex < heap.length &&
			compareLoopedCanvasItemCandidates(
				heap[rightIndex] as LoopedCanvasItemCandidate,
				heap[nextIndex] as LoopedCanvasItemCandidate,
			) > 0
		) {
			nextIndex = rightIndex
		}
		if (nextIndex === index) return

		const current = heap[index]
		heap[index] = heap[nextIndex] as LoopedCanvasItemCandidate
		heap[nextIndex] = current as LoopedCanvasItemCandidate
		index = nextIndex
	}
}

function addLoopedCanvasItemCandidate(
	heap: LoopedCanvasItemCandidate[],
	candidate: LoopedCanvasItemCandidate,
	limit: number,
) {
	if (heap.length < limit) {
		heap.push(candidate)
		siftLoopedCanvasCandidateUp(heap, heap.length - 1)
		return
	}

	const furthestCandidate = heap[0]
	if (
		!furthestCandidate ||
		compareLoopedCanvasItemCandidates(candidate, furthestCandidate) >= 0
	) {
		return
	}
	heap[0] = candidate
	siftLoopedCanvasCandidateDown(heap)
}

export function getLoopedVisibleSlidesTemplateCanvasItems({
	itemQuery,
	items,
	loopMetrics,
	offset,
	scale = 1,
	viewportHeight,
	viewportWidth,
}: LoopViewportInput) {
	if (items.length === 0) return []
	if (loopMetrics.width <= 0 || loopMetrics.height <= 0) {
		return getVisibleTemplateCanvasItems({
			items,
			offset,
			scale,
			viewportHeight,
			viewportWidth,
		})
	}

	const windowBounds = getTemplateCanvasViewportWindow({
		offset,
		scale,
		viewportHeight,
		viewportWidth,
	})
	const columnCycles = getLoopCycleRange(
		windowBounds.left,
		windowBounds.right,
		loopMetrics.bounds.minX,
		loopMetrics.bounds.maxX,
		loopMetrics.width,
	)
	const rowCycles = getLoopCycleRange(
		windowBounds.top,
		windowBounds.bottom,
		loopMetrics.bounds.minY,
		loopMetrics.bounds.maxY,
		loopMetrics.height,
	)
	const candidateLimit = getTemplateCanvasVisibleItemLimit({
		scale,
		viewportHeight,
		viewportWidth,
	})
	const candidates: LoopedCanvasItemCandidate[] = []
	const renderCycle = getSlidesTemplateCanvasLoopCycle({ loopMetrics, offset, scale })
	const windowCenterX = (windowBounds.left + windowBounds.right) / 2
	const windowCenterY = (windowBounds.top + windowBounds.bottom) / 2
	let candidateOrder = 0

	// 只保留最靠近视口中心的候选；低缩放或稀疏数据下也不会为循环副本分配大量对象。
	for (let rowCycle = rowCycles.start; rowCycle <= rowCycles.end; rowCycle += 1) {
		for (
			let columnCycle = columnCycles.start;
			columnCycle <= columnCycles.end;
			columnCycle += 1
		) {
			const cycleItems =
				itemQuery?.getItemsInWindow({
					columnCycle,
					loopMetrics,
					rowCycle,
					windowBounds,
				}) ?? items

			for (const item of cycleItems) {
				if (
					!isLoopedCanvasItemInWindow(
						item,
						columnCycle,
						rowCycle,
						loopMetrics,
						windowBounds,
					)
				) {
					continue
				}
				addLoopedCanvasItemCandidate(
					candidates,
					{
						columnCycle,
						distance:
							Math.pow(
								item.position.x + columnCycle * loopMetrics.width - windowCenterX,
								2,
							) +
							Math.pow(
								item.position.y + rowCycle * loopMetrics.height - windowCenterY,
								2,
							),
						item,
						order: candidateOrder,
						rowCycle,
					},
					candidateLimit,
				)
				candidateOrder += 1
			}
		}
	}

	return candidates
		.sort(compareLoopedCanvasItemCandidates)
		.map(({ columnCycle, item, rowCycle }) =>
			createLoopedCanvasItem(item, columnCycle, rowCycle, loopMetrics, renderCycle),
		)
}

export function getNearestLoopedSlidesTemplateCanvasItem({
	item,
	loopMetrics,
	offset,
	scale = 1,
}: NearestLoopedItemInput) {
	if (loopMetrics.width <= 0 || loopMetrics.height <= 0) return item

	const normalizedScale = Math.max(scale, 0.01)
	const viewportCenter = {
		x: -offset.x / normalizedScale,
		y: -offset.y / normalizedScale,
	}
	const columnCycle = Math.round((viewportCenter.x - item.position.x) / loopMetrics.width)
	const rowCycle = Math.round((viewportCenter.y - item.position.y) / loopMetrics.height)

	return createLoopedCanvasItem(item, columnCycle, rowCycle, loopMetrics)
}

export function getRebasedSlidesTemplateCanvasOffset({
	nextLoopMetrics,
	offset,
	previousLoopMetrics,
	scale = 1,
}: {
	nextLoopMetrics: SlidesTemplateCanvasLoopMetrics
	offset: TemplateCanvasPoint
	previousLoopMetrics: SlidesTemplateCanvasLoopMetrics
	scale?: number
}) {
	if (
		previousLoopMetrics.width <= 0 ||
		previousLoopMetrics.height <= 0 ||
		nextLoopMetrics.width <= 0 ||
		nextLoopMetrics.height <= 0
	) {
		return offset
	}

	const loopCycle = getSlidesTemplateCanvasLoopCycle({
		loopMetrics: previousLoopMetrics,
		offset,
		scale,
	})

	// 新数据改变循环周期时保持当前循环单元的屏幕位置，避免拖拽中封面整体跳变。
	return {
		x: offset.x + loopCycle.x * (previousLoopMetrics.width - nextLoopMetrics.width) * scale,
		y: offset.y + loopCycle.y * (previousLoopMetrics.height - nextLoopMetrics.height) * scale,
	}
}

export function getSlidesTemplateCanvasLoopCycle({
	loopMetrics,
	offset,
	scale = 1,
}: LoopCycleInput) {
	if (loopMetrics.width <= 0 || loopMetrics.height <= 0) return { x: 0, y: 0 }

	const normalizedScale = Math.max(scale, 0.01)
	const viewportCenter = {
		x: -offset.x / normalizedScale,
		y: -offset.y / normalizedScale,
	}

	return {
		x: Math.floor((viewportCenter.x - loopMetrics.bounds.minX) / loopMetrics.width),
		y: Math.floor((viewportCenter.y - loopMetrics.bounds.minY) / loopMetrics.height),
	}
}
