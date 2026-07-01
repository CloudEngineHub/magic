import { SLICE_EPSILON } from "../shared/constants"

/** 切片所需的最小节点形状（含 y/h，单位英寸） */
export interface SliceableNode {
	y: number
	h: number
}

export interface SliceByPageHeightInput<T extends SliceableNode> {
	/** 单页 PPT 节点（坐标单位为英寸） */
	nodes: T[]
	/** 单页高度（英寸） */
	pageHeightInch: number
	/** 内容总高度（英寸），用于决定页数 */
	totalHeightInch: number
}

interface SliceableTableNode extends SliceableNode {
	type: 'table'
	rows: unknown[]
	rowHeights: number[]
}

function isSliceableTable(node: SliceableNode): node is SliceableTableNode {
	const n = node as unknown as Record<string, unknown>
	return n['type'] === 'table' && Array.isArray(n['rowHeights']) && Array.isArray(n['rows'])
}

/**
 * 对表格节点按绝对坐标范围 [pageStart, pageEnd) 做行级切割。
 * 返回仅包含该页可见行的新表格节点（y 已平移到页面坐标系），
 * 若该页无可见行则返回 null。
 *
 * 行归属规则：以行的顶部位置（rowStart）决定归属页，即
 * `rowStart >= pageStart && rowStart < pageEnd`。
 * 这确保每行只出现在一个页面（不重复），且页内 y 坐标始终 ≥ 0。
 * 跨页边界的行会在所属页的底部被 PPT 页面边界裁切。
 *
 * pptxgenjs 表格对象不会被 PPT 页面边界自动按行裁切，
 * 必须在生成阶段就确保每页只包含属于该页的行，否则会出现行重复或缺失。
 */
function sliceTableByPage<T extends SliceableTableNode>(
	node: T,
	pageStart: number,
	pageEnd: number,
): T | null {
	let cumY = node.y
	let firstRowIndex = -1
	let lastRowIndex = -1
	let slicedY = 0

	for (let i = 0; i < node.rowHeights.length; i++) {
		const rowStart = cumY
		cumY += node.rowHeights[i]

		// 行按其顶部位置归属：rowStart 落在 [pageStart, pageEnd) 区间内才纳入本页
		if (rowStart >= pageStart && rowStart < pageEnd) {
			if (firstRowIndex === -1) {
				firstRowIndex = i
				slicedY = rowStart - pageStart // 始终 >= 0
			}
			lastRowIndex = i
		}
	}

	if (firstRowIndex === -1) return null

	const slicedRowHeights = node.rowHeights.slice(firstRowIndex, lastRowIndex + 1)
	return {
		...node,
		y: slicedY,
		h: slicedRowHeights.reduce((a, b) => a + b, 0),
		rows: node.rows.slice(firstRowIndex, lastRowIndex + 1),
		rowHeights: slicedRowHeights,
	} as T
}

/**
 * 按页高对节点做垂直切片：
 * - 普通节点：每页保留所有与页面区间相交的节点，y 平移到当前页坐标系
 * - 表格节点：按行做精确切割，每页只包含属于该页的行（pptxgenjs 表格不支持页面边界自动裁切）
 * - 不做"避免切断元素"的智能搜索，保持规则简单且可预测
 */
export function sliceByPageHeight<T extends SliceableNode>({
	nodes,
	pageHeightInch,
	totalHeightInch,
}: SliceByPageHeightInput<T>): T[][] {
	if (pageHeightInch <= 0) return [nodes]

	const pageCount = Math.max(1, Math.ceil(totalHeightInch / pageHeightInch - SLICE_EPSILON))
	if (pageCount === 1) return [nodes]

	const pages: T[][] = Array.from({ length: pageCount }, () => [])

	for (const node of nodes) {
		const top = node.y
		const bottom = node.y + node.h
		const startPage = clampPageIndex(Math.floor(top / pageHeightInch), pageCount)
		const endPage = clampPageIndex(
			Math.floor((bottom - SLICE_EPSILON) / pageHeightInch),
			pageCount,
		)

		for (let p = startPage; p <= endPage; p++) {
			const pageStart = p * pageHeightInch
			const pageEnd = (p + 1) * pageHeightInch

			if (isSliceableTable(node)) {
				const sliced = sliceTableByPage(node, pageStart, pageEnd)
				if (sliced) pages[p].push(sliced as unknown as T)
			} else {	
				pages[p].push({
					...node,
					y: node.y - p * pageHeightInch,
				})
			}
		}
	}

	return pages
}

function clampPageIndex(index: number, pageCount: number): number {
	if (index < 0) return 0
	if (index >= pageCount) return pageCount - 1
	return index
}
