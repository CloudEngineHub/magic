import { SLICE_EPSILON } from "../shared/constants"

/** Minimal node shape needed for slicing, including y/h in inches */
export interface SliceableNode {
	y: number
	h: number
}

export interface SliceByPageHeightInput<T extends SliceableNode> {
	/** Single-page PPT nodes with coordinates in inches */
	nodes: T[]
	/** Single-page height in inches */
	pageHeightInch: number
	/** Total content height in inches, used to determine page count */
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
 * Slice table nodes by row using the absolute coordinate range [pageStart, pageEnd).
 * Return a new table node containing only rows visible on that page, with y translated into page coordinates,
 * or null if that page has no visible rows.
 *
 * Row ownership rule: the row top position (rowStart) determines the owning page:
 * `rowStart >= pageStart && rowStart < pageEnd`.
 * This ensures each row appears on only one page without duplication and that in-page y is always >= 0.
 * Rows crossing a page boundary are clipped by the PPT page bounds at the bottom of their owning page.
 *
 * pptxgenjs table objects are not automatically clipped row-by-row by PPT page bounds,
 * so generation must ensure each page contains only rows owned by that page, otherwise rows may be duplicated or missing.
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

		// Rows are owned by their top position: include a row only when rowStart falls within [pageStart, pageEnd)
		if (rowStart >= pageStart && rowStart < pageEnd) {
			if (firstRowIndex === -1) {
				firstRowIndex = i
				slicedY = rowStart - pageStart // Always >= 0
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
 * Slice nodes vertically by page height:
 * - Regular nodes: each page keeps all nodes intersecting the page interval, with y translated into the current page coordinate system
 * - Table nodes: slice precisely by row, and each page contains only rows owned by that page because pptxgenjs tables do not support automatic page-bound clipping
 * - Do not perform smart searching to avoid cutting elements; keep the rule simple and predictable
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
