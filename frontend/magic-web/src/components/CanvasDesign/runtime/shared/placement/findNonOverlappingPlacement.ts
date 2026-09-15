import type { LayerElement } from "../../document/types"
import type { Rect } from "../ids"

/**
 * 与后端 `backend/.../constants.py` 中 `DEFAULT_ELEMENT_SPACING` 一致。
 * Agent / `BaseGenerateCanvasElements._prepare_placeholders` 新建占位符时使用。
 */
export const AGENT_PLACEHOLDER_ELEMENT_SPACING = 200

/**
 * 与后端 `BaseGenerateCanvasElements._max_elements_per_row` 默认一致（子类可覆盖为其它值；前端固定 6）。
 */
export const AGENT_PLACEHOLDER_MAX_PER_ROW = 6

/** 判定「最后一行」时，与最大 `y` 的容差（像素），与后端一致 */
const LAST_ROW_Y_TOLERANCE_PX = 1

/** 在当前 viewport 附近向外搜索空位的圈数 */
export const DEFAULT_VIEWPORT_SEARCH_RINGS = 4

/**
 * 将顶层元素的逻辑框转为轴对齐包围盒（与画布绝对坐标一致；顶层无父时即 absolute_x/y）。
 */
export function layerElementToObstacleRect(element: LayerElement): Rect | null {
	if (!element.width || !element.height) return null
	const w = element.width * (element.scaleX || 1)
	const h = element.height * (element.scaleY || 1)
	return {
		x: element.x || 0,
		y: element.y || 0,
		width: w,
		height: h,
	}
}

export function collectObstacleRects(
	elements: LayerElement[],
	shouldInclude: (element: LayerElement) => boolean,
): Rect[] {
	const rects: Rect[] = []
	for (const el of elements) {
		if (!shouldInclude(el)) continue
		const r = layerElementToObstacleRect(el)
		if (r) rects.push(r)
	}
	return rects
}

function createRect(x: number, y: number, width: number, height: number): Rect {
	return { x, y, width, height }
}

function createRectFromCenter(
	center: { x: number; y: number },
	width: number,
	height: number,
): Rect {
	return createRect(center.x - width / 2, center.y - height / 2, width, height)
}

function isOverlappingWithSpacing(candidate: Rect, obstacle: Rect, spacing: number): boolean {
	return (
		candidate.x < obstacle.x + obstacle.width + spacing &&
		candidate.x + candidate.width > obstacle.x - spacing &&
		candidate.y < obstacle.y + obstacle.height + spacing &&
		candidate.y + candidate.height > obstacle.y - spacing
	)
}

function isRectInsideViewport(rect: Rect, viewportRect: Rect): boolean {
	return (
		rect.x >= viewportRect.x &&
		rect.y >= viewportRect.y &&
		rect.x + rect.width <= viewportRect.x + viewportRect.width &&
		rect.y + rect.height <= viewportRect.y + viewportRect.height
	)
}

function buildSpiralOffsets(maxSearchRings: number): Array<{ dx: number; dy: number }> {
	const offsets: Array<{ dx: number; dy: number }> = [{ dx: 0, dy: 0 }]
	if (maxSearchRings <= 0) return offsets

	let currentX = 0
	let currentY = 0
	let stepLength = 1
	const directions = [
		{ dx: 1, dy: 0 },
		{ dx: 0, dy: 1 },
		{ dx: -1, dy: 0 },
		{ dx: 0, dy: -1 },
	]

	while (Math.max(Math.abs(currentX), Math.abs(currentY)) < maxSearchRings) {
		for (let directionIndex = 0; directionIndex < directions.length; directionIndex++) {
			const direction = directions[directionIndex]
			for (let step = 0; step < stepLength; step++) {
				currentX += direction.dx
				currentY += direction.dy
				if (Math.max(Math.abs(currentX), Math.abs(currentY)) <= maxSearchRings) {
					offsets.push({ dx: currentX, dy: currentY })
				}
			}

			if (directionIndex % 2 === 1) {
				stepLength += 1
			}
		}
	}

	return offsets
}

/**
 * 计算下一个图片/视频占位符左上角，算法对齐后端 `_prepare_placeholders`（单行向右延伸 / 满行换行）。
 *
 * - 空画布：`(0, 0)`
 * - 非空：取全局最大 `y` 定义「最后一行」；若该行元素数 `< maxPerRow`，放在该行最右元素右侧 + spacing；否则新行从 `x=0`、`y = 全局最大底边 + spacing` 开始。
 */
export function findNextImageVideoPlaceholderPosition(
	obstacles: Rect[],
	options?: {
		spacing?: number
		maxPerRow?: number
	},
): { x: number; y: number } {
	const spacing = options?.spacing ?? AGENT_PLACEHOLDER_ELEMENT_SPACING
	const maxPerRow = options?.maxPerRow ?? AGENT_PLACEHOLDER_MAX_PER_ROW

	if (obstacles.length === 0) {
		return { x: 0, y: 0 }
	}

	let maxY = -Infinity
	for (const o of obstacles) {
		maxY = Math.max(maxY, o.y)
	}

	const lastRow = obstacles.filter((o) => Math.abs(o.y - maxY) < LAST_ROW_Y_TOLERANCE_PX)

	let startX: number
	let startY: number

	if (lastRow.length < maxPerRow) {
		let rightmost = lastRow[0]
		for (let i = 1; i < lastRow.length; i++) {
			const o = lastRow[i]
			if (o.x > rightmost.x) {
				rightmost = o
			}
		}
		startX = rightmost.x + rightmost.width + spacing
		startY = maxY
	} else {
		let maxBottom = -Infinity
		for (const o of obstacles) {
			maxBottom = Math.max(maxBottom, o.y + o.height)
		}
		startX = 0
		startY = maxBottom + spacing
	}

	return { x: startX, y: startY }
}

/**
 * 优先在当前 viewport 附近寻找图片/视频占位符位置；找不到时回退到全局末行布局。
 */
export function findNextImageVideoPlaceholderPositionNearViewport(
	obstacles: Rect[],
	options: {
		elementWidth: number
		elementHeight: number
		viewportRect: Rect
		anchor?: { x: number; y: number }
		spacing?: number
		maxPerRow?: number
		maxSearchRings?: number
	},
): { x: number; y: number } {
	const spacing = options.spacing ?? AGENT_PLACEHOLDER_ELEMENT_SPACING
	const anchor = options.anchor ?? {
		x: options.viewportRect.x + options.viewportRect.width / 2,
		y: options.viewportRect.y + options.viewportRect.height / 2,
	}
	const candidateOffsets = buildSpiralOffsets(
		options.maxSearchRings ?? DEFAULT_VIEWPORT_SEARCH_RINGS,
	)
	const stepX = options.elementWidth + spacing
	const stepY = options.elementHeight + spacing

	const resolveCandidate = (requireInsideViewport: boolean): { x: number; y: number } | null => {
		for (const offset of candidateOffsets) {
			const candidateRect = createRectFromCenter(
				{
					x: anchor.x + offset.dx * stepX,
					y: anchor.y + offset.dy * stepY,
				},
				options.elementWidth,
				options.elementHeight,
			)

			if (
				requireInsideViewport &&
				!isRectInsideViewport(candidateRect, options.viewportRect)
			) {
				continue
			}

			const hasOverlap = obstacles.some((obstacle) =>
				isOverlappingWithSpacing(candidateRect, obstacle, spacing),
			)
			if (!hasOverlap) {
				return { x: candidateRect.x, y: candidateRect.y }
			}
		}

		return null
	}

	return (
		resolveCandidate(true) ||
		resolveCandidate(false) ||
		findNextImageVideoPlaceholderPosition(obstacles, {
			spacing,
			maxPerRow: options.maxPerRow,
		})
	)
}

/** 计算批量生成结果组成网格后占据的整体尺寸。 */
function getGridDimensions(
	count: number,
	columns: number,
	elementWidth: number,
	elementHeight: number,
	spacing: number,
): { width: number; height: number; rows: number } {
	const filledColumns = Math.max(1, Math.min(count, columns))
	const rows = Math.max(1, Math.ceil(count / columns))
	return {
		width: filledColumns * elementWidth + Math.max(0, filledColumns - 1) * spacing,
		height: rows * elementHeight + Math.max(0, rows - 1) * spacing,
		rows,
	}
}

/** 从左上角原点按行优先生成一组网格矩形。 */
function createGridRects(
	origin: { x: number; y: number },
	count: number,
	columns: number,
	elementWidth: number,
	elementHeight: number,
	spacing: number,
): Rect[] {
	return Array.from({ length: count }, (_, index) => {
		const col = index % columns
		const row = Math.floor(index / columns)
		return createRect(
			origin.x + col * (elementWidth + spacing),
			origin.y + row * (elementHeight + spacing),
			elementWidth,
			elementHeight,
		)
	})
}

/**
 * 判断候选矩形是否满足视口约束，并与已有障碍物保持 spacing 间距。
 *
 * @param rect - 候选矩形
 * @param obstacles - 障碍矩形
 * @param spacing - 间距
 * @param viewportRect - 视口区域
 * @param requireInsideViewport - 是否要求在视口内
 * @returns 是否可以放置矩形
 */
function canPlaceRect(
	rect: Rect,
	obstacles: Rect[],
	spacing: number,
	viewportRect: Rect,
	requireInsideViewport: boolean,
): boolean {
	if (requireInsideViewport && !isRectInsideViewport(rect, viewportRect)) {
		return false
	}
	return !obstacles.some((obstacle) => isOverlappingWithSpacing(rect, obstacle, spacing))
}

/**
 * 从指定 base 开始按行优先扫描可用网格单元。
 * 会把本次已选位置追加到 occupied，保证同一批结果之间也不互相重叠。
 * @param options - 选项
 * @param options.base - 起始点
 * @param options.count - 生成数量
 * @param options.columns - 列数
 * @param options.elementWidth - 元素宽度
 * @param options.elementHeight - 元素高度
 * @param options.obstacles - 障碍矩形
 * @param options.spacing - 间距
 * @param options.viewportRect - 视口区域
 * @param options.maxSearchRings - 最大搜索圈数
 * @param options.requireInsideViewport - 是否要求在视口内
 * @param options.minRows - 最小行数
 * @returns 可用网格单元
 */
function scanRowMajorGridCells(options: {
	base: { x: number; y: number }
	count: number
	columns: number
	elementWidth: number
	elementHeight: number
	obstacles: Rect[]
	spacing: number
	viewportRect: Rect
	maxSearchRings: number
	requireInsideViewport: boolean
	minRows?: number
}): Rect[] | null {
	const stepX = options.elementWidth + options.spacing
	const stepY = options.elementHeight + options.spacing
	const rects: Rect[] = []
	const occupied = [...options.obstacles]
	// 计算需要扫描的行数
	const rows = Math.max(
		Math.ceil(options.count / options.columns),
		options.maxSearchRings + 1,
		options.minRows ?? 0,
	)

	// 固定从左到右、从上到下补网格单元；已有结果占住前面的格子时，后续结果继续补同一行的下一个空位。
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < options.columns; col++) {
			const rect = createRect(
				options.base.x + col * stepX,
				options.base.y + row * stepY,
				options.elementWidth,
				options.elementHeight,
			)
			if (
				canPlaceRect(
					rect,
					occupied,
					options.spacing,
					options.viewportRect,
					options.requireInsideViewport,
				)
			) {
				rects.push(rect)
				occupied.push(rect)
				if (rects.length === options.count) {
					return rects
				}
			}
		}
	}
	return null
}

type GridRowState = {
	left: number
	top: number
	right: number
	height: number
	count: number
}

/**
 * 把已有矩形按 `y` 聚成行，用来恢复同组生成结果的行结构。
 * 同一行内会记录最左边、最右边和最高元素，便于后续继续向右追加或换行。
 */
function buildGridRowsFromRects(rects: Rect[]): GridRowState[] {
	const sortedRects = rects.slice().sort((a, b) => {
		const deltaY = a.y - b.y
		// 先按 y 从上到下排；如果 y 几乎一样，就按 x 从左到右排。
		if (Math.abs(deltaY) > LAST_ROW_Y_TOLERANCE_PX) {
			return deltaY
		}
		return a.x - b.x
	})
	const rows: GridRowState[] = []
	for (const rect of sortedRects) {
		const currentRow = rows[rows.length - 1]
		// 如果当前行不存在，或者当前元素的 y 与上一行顶部差异较大，就创建新行。
		if (!currentRow || Math.abs(rect.y - currentRow.top) > LAST_ROW_Y_TOLERANCE_PX) {
			rows.push({
				left: rect.x,
				top: rect.y,
				right: rect.x + rect.width,
				height: rect.height,
				count: 1,
			})
			continue
		}
		currentRow.left = Math.min(currentRow.left, rect.x)
		currentRow.top = Math.min(currentRow.top, rect.y)
		currentRow.right = Math.max(currentRow.right, rect.x + rect.width)
		currentRow.height = Math.max(currentRow.height, rect.height)
		currentRow.count += 1
	}
	return rows
}

/**
 * 按“同组历史结果 -> 继续向右 -> 满 6 列换行”的规则生成后续落点。
 * 这条路径只服务于同配置历史结果，所以会优先保持顶部对齐和固定列间距。
 */
function buildRowFlowPositions(options: {
	existingRects: Rect[]
	count: number
	elementWidth: number
	elementHeight: number
	maxColumns: number
	spacing: number
	obstacles: Rect[]
	viewportRect: Rect
}): Rect[] | null {
	if (options.existingRects.length === 0) return null

	const rows = buildGridRowsFromRects(options.existingRects)
	// 无历史图组，直接返回
	if (rows.length === 0) return null

	const isSameRect = (a: Rect, b: Rect): boolean =>
		a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

	//
	const originX = rows.reduce((min, row) => Math.min(min, row.left), rows[0].left)
	const occupied = options.obstacles.filter(
		(obstacle) =>
			!options.existingRects.some((existingRect) => isSameRect(obstacle, existingRect)),
	)
	const existingRects = options.existingRects
	const positions: Rect[] = []
	const currentRow = rows[rows.length - 1]
	let currentTop = currentRow.top
	// 当前行未满时，直接接在最后一个元素右侧；满 6 列则从该组最左侧重新开下一行。
	let currentLeft =
		currentRow.count >= options.maxColumns ? originX : currentRow.right + options.spacing
	let currentHeight = currentRow.height
	let currentCountInRow = currentRow.count

	// 已有结果本身只作为占位历史，不参与后续落点碰撞。
	for (let i = 0; i < options.count; i++) {
		// 换行
		if (currentCountInRow >= options.maxColumns) {
			currentTop += currentHeight + options.spacing
			currentLeft = originX
			currentHeight = 0
			currentCountInRow = 0
		}

		const rect = createRect(
			currentLeft,
			currentTop,
			options.elementWidth,
			options.elementHeight,
		)
		if (!canPlaceRect(rect, occupied, options.spacing, options.viewportRect, false)) {
			return null
		}
		positions.push(rect)
		occupied.push(rect)
		currentLeft = rect.x + rect.width + options.spacing
		currentHeight = Math.max(currentHeight, rect.height)
		currentCountInRow += 1
	}

	return positions
}

/**
 * 围绕视口锚点螺旋扫描整组网格的原点。
 * 这里要求整组 rects 同时可放置，避免一批生成结果被拆散到不同区域。
 */
function scanViewportGridOrigins(options: {
	count: number
	columns: number
	elementWidth: number
	elementHeight: number
	obstacles: Rect[]
	spacing: number
	viewportRect: Rect
	anchor: { x: number; y: number }
	maxSearchRings: number
	requireInsideViewport: boolean
}): Rect[] | null {
	const grid = getGridDimensions(
		options.count,
		options.columns,
		options.elementWidth,
		options.elementHeight,
		options.spacing,
	)
	const stepX = options.elementWidth + options.spacing
	const stepY = options.elementHeight + options.spacing
	// 没有可靠来源图时，以当前视口锚点为中心向外搜索，让生成结果优先出现在用户正在看的区域。
	for (const offset of buildSpiralOffsets(options.maxSearchRings)) {
		const rects = createGridRects(
			{
				x: options.anchor.x + offset.dx * stepX - grid.width / 2,
				y: options.anchor.y + offset.dy * stepY - grid.height / 2,
			},
			options.count,
			options.columns,
			options.elementWidth,
			options.elementHeight,
			options.spacing,
		)
		if (
			rects.every((rect) =>
				canPlaceRect(
					rect,
					options.obstacles,
					options.spacing,
					options.viewportRect,
					options.requireInsideViewport,
				),
			)
		) {
			return rects
		}
	}
	return null
}

/**
 * 为插件生成结果计算批量落点。
 * 搜索顺序：
 * 1. 同配置历史结果，按行流式继续排
 * 2. 来源图右侧，行优先补位
 * 3. 来源图下方，行优先补位
 * 4. 视口中心附近，整组网格搜索
 * 5. 老的末行占位符逻辑兜底
 * 返回值是画布左上角坐标，调用方再按这些位置创建图片元素。
 * @param obstacles - 障碍矩形
 * @param options - 选项
 * @param options.count - 生成数量
 * @param options.elementWidth - 元素宽度
 * @param options.elementHeight - 元素高度
 * @param options.viewportRect - 视口区域
 * @param options.sourceRect - 来源图矩形
 * @param options.existingGridRects - 同配置历史生成图的位置
 * @param options.anchor - 视口中心点
 * @param options.spacing - 间距
 * @param options.maxColumns - 最大列数
 * @param options.maxSearchRings - 最大搜索圈数
 * @returns 落点坐标
 */
export function findGeneratedMediaGridPositions(
	obstacles: Rect[],
	options: {
		count: number
		elementWidth: number
		elementHeight: number
		viewportRect: Rect
		sourceRect?: Rect | null
		existingGridRects?: Rect[]
		anchor?: { x: number; y: number }
		spacing?: number
		maxColumns?: number
		maxSearchRings?: number
	},
): Array<{ x: number; y: number }> {
	const count = Math.max(1, Math.floor(options.count))
	const spacing = options.spacing ?? AGENT_PLACEHOLDER_ELEMENT_SPACING
	const maxColumns = Math.max(1, Math.floor(options.maxColumns ?? 6))
	const maxSearchRings = Math.max(
		0,
		Math.floor(options.maxSearchRings ?? DEFAULT_VIEWPORT_SEARCH_RINGS),
	)
	const columns = maxColumns
	// 视口中心点
	const anchor = options.anchor ?? {
		x: options.viewportRect.x + options.viewportRect.width / 2,
		y: options.viewportRect.y + options.viewportRect.height / 2,
	}

	// 同配置历史输出优先续排：这会把“连续点生成”变成稳定的行流式布局。
	const existingGridRects = options.existingGridRects ?? []
	const existingGridPositions = buildRowFlowPositions({
		existingRects: existingGridRects,
		count,
		elementWidth: options.elementWidth,
		elementHeight: options.elementHeight,
		maxColumns: columns,
		spacing,
		obstacles,
		viewportRect: options.viewportRect,
	})
	if (existingGridPositions) {
		return existingGridPositions.map(({ x, y }) => ({ x, y }))
	}

	// 计算来源图右侧和下方的基点
	const sourceRightBase = options.sourceRect
		? {
				x: options.sourceRect.x + options.sourceRect.width + spacing,
				y: options.sourceRect.y,
			}
		: null
	const sourceBottomBase = options.sourceRect
		? {
				x: options.sourceRect.x,
				y: options.sourceRect.y + options.sourceRect.height + spacing,
			}
		: null

	// 插件结果通常要和来源图做横向对比：先沿来源图右侧按行补位，单张连续生成也能继续补下一列。
	// 来源图附近的网格不受当前 viewport 宽度截断，生成后会自动定位到新元素。
	const buildSearchOptions = (
		base: { x: number; y: number },
		requireInsideViewport: boolean,
	) => ({
		base,
		count,
		columns,
		elementWidth: options.elementWidth,
		elementHeight: options.elementHeight,
		obstacles,
		spacing,
		viewportRect: options.viewportRect,
		maxSearchRings,
		requireInsideViewport,
	})

	// 优先扫描来源图右侧
	const sourceRightRects =
		sourceRightBase && scanRowMajorGridCells(buildSearchOptions(sourceRightBase, false))
	if (sourceRightRects) return sourceRightRects.map(({ x, y }) => ({ x, y }))

	// 优先扫描来源图下方
	const sourceBottomRects =
		sourceBottomBase && scanRowMajorGridCells(buildSearchOptions(sourceBottomBase, false))
	if (sourceBottomRects) return sourceBottomRects.map(({ x, y }) => ({ x, y }))

	// 绕视口中心找一整组网格
	const viewportInsideRects = scanViewportGridOrigins({
		count,
		columns,
		elementWidth: options.elementWidth,
		elementHeight: options.elementHeight,
		obstacles,
		spacing,
		viewportRect: options.viewportRect,
		anchor,
		maxSearchRings,
		requireInsideViewport: true,
	})
	if (viewportInsideRects) return viewportInsideRects.map(({ x, y }) => ({ x, y }))

	// 超出视口时，继续向外搜索
	const viewportOutsideRects = scanViewportGridOrigins({
		count,
		columns,
		elementWidth: options.elementWidth,
		elementHeight: options.elementHeight,
		obstacles,
		spacing,
		viewportRect: options.viewportRect,
		anchor,
		maxSearchRings,
		requireInsideViewport: false,
	})
	if (viewportOutsideRects) return viewportOutsideRects.map(({ x, y }) => ({ x, y }))

	// 兜底保持和旧占位符策略一致，避免极端拥挤场景下找不到落点。
	const fallback = findNextImageVideoPlaceholderPosition(obstacles, {
		spacing,
		maxPerRow: columns,
	})
	// 创建网格矩形
	return createGridRects(
		fallback,
		count,
		columns,
		options.elementWidth,
		options.elementHeight,
		spacing,
	).map(({ x, y }) => ({ x, y }))
}
