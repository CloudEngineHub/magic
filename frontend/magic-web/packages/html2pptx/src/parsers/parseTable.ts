/**
 * 表格解析器
 * 将 HTML <table> 转换为 PPT 表格格式
 */

import type { ElementNode } from "../ir/dom"
import type { PPTNode, PPTTableNode, PPTNodeBase } from "../ir/node"
import type {
	PPTTableRow,
	PPTTableCell,
	PPTTableCellBorder,
	PPTTableTextRun,
} from "../ir/style"
import type { SlideConfig } from "../api/options"
import { colorToHex, getTransparency } from "../shared/color"
import {
	calculateColumnWidths,
	calculateRowHeights,
	calculateCellMargin,
	resolveEffectiveBackgroundColor,
} from "../shared/table-utils"
import { extractCellTextRuns } from "./table/cellText"

/**
 * 解析 HTML 表格为 PPT 表格节点
 */
export function parseTable(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	iWindow: Window,
): PPTTableNode | PPTNode[] | null {
	const { element, rect } = node

	if (element.tagName !== "TABLE") return null

	const tableElement = element as HTMLTableElement

	// 获取当前 table 的行（不包含嵌套 table 的行）
	const tableRows = Array.from(tableElement.rows)
	if (tableRows.length === 0) return null

	// 解析表格结构
	const { rows, colCount } = parseTableRows(
		tableRows,
		iWindow,
	)
	if (rows.length === 0) return null

	// 计算列宽
	const colWidths = calculateColumnWidths(tableElement, colCount, rect.w, config)

	// 计算行高
	const rowHeights = calculateRowHeights(tableRows, config)

	const tableNode: PPTTableNode = {
		...base,
		type: "table",
		rows,
		colWidths,
		rowHeights,
	}

	return tableNode
}

/**
 * 解析表格行
 */
function parseTableRows(
	tableRows: HTMLTableRowElement[],
	iWindow: Window,
): { rows: PPTTableRow[]; colCount: number } {
	const rows: PPTTableRow[] = []
	let maxOriginalColCount = 0

	// 创建合并单元格跟踪矩阵
	const mergeMatrix: Array<Array<{ skip: boolean; rowspan: number; colspan: number }>> = []

	tableRows.forEach((tr, rowIndex) => {
		const cells: PPTTableCell[] = []
		// 只取当前行的直属单元格，避免误取嵌套表格单元格
		const tdElements = Array.from(tr.cells)

		let colIndex = 0

		// 初始化当前行的合并矩阵
		if (!mergeMatrix[rowIndex]) {
			mergeMatrix[rowIndex] = []
		}

		tdElements.forEach((td) => {
			// 跳过被 rowspan 占用的列
			while (mergeMatrix[rowIndex]?.[colIndex]?.skip) {
				colIndex++
			}

			// 处理 colspan 和 rowspan
			const colspan = parseInt(td.getAttribute("colspan") || "1")
			const rowspan = parseInt(td.getAttribute("rowspan") || "1")
			const cell = parseCellElement(td as HTMLTableCellElement, tr, iWindow)
			if (colspan > 1) cell.options = { ...(cell.options ?? {}), colspan }
			if (rowspan > 1) cell.options = { ...(cell.options ?? {}), rowspan }
			cells.push(cell)

			// 更新合并矩阵
			markMergedCells(mergeMatrix, rowIndex, colIndex, rowspan, colspan)

			colIndex += colspan
		})

		maxOriginalColCount = Math.max(maxOriginalColCount, colIndex)
		rows.push({ cells })
	})

	return {
		rows,
		colCount: maxOriginalColCount,
	}
}

function markMergedCells(
	mergeMatrix: Array<Array<{ skip: boolean; rowspan: number; colspan: number }>>,
	rowIndex: number,
	colIndex: number,
	rowspan: number,
	colspan: number,
): void {
	for (let r = rowIndex; r < rowIndex + rowspan; r++) {
		if (!mergeMatrix[r]) mergeMatrix[r] = []
		for (let c = colIndex; c < colIndex + colspan; c++) {
			if (r === rowIndex && c === colIndex) continue
			mergeMatrix[r][c] = { skip: true, rowspan, colspan }
		}
	}
}

/**
 * 解析单元格元素
 * @param td - 单元格元素 (td/th)
 * @param tr - 所在行元素 (用于继承行样式)
 * @param iWindow - iframe window
 */
function parseCellElement(
	td: HTMLTableCellElement,
	tr: HTMLTableRowElement,
	iWindow: Window,
): PPTTableCell {
	const computed = iWindow.getComputedStyle(td)
	const trComputed = iWindow.getComputedStyle(tr)

	const runs = extractCellTextRuns(td, iWindow)
	const hasRichText = runs.length > 1 || runs.some((r) => r.options?.breakLine)

	const options: PPTTableCell["options"] = {}

	const section = tr.parentElement
	const table = tr.closest("table")
	const sectionComputed = section ? iWindow.getComputedStyle(section) : null
	const tableComputed = table ? iWindow.getComputedStyle(table) : null

	const effectiveBgColor = resolveEffectiveBackgroundColor({
		cellBgColor: computed.backgroundColor,
		rowBgColor: trComputed.backgroundColor,
		sectionBgColor: sectionComputed?.backgroundColor,
		tableBgColor: tableComputed?.backgroundColor,
	})

	if (effectiveBgColor) {
		options.fill = colorToHex(effectiveBgColor)
		const transparency = getTransparency(effectiveBgColor)
		if (transparency > 0) {
			options.fillTransparency = transparency
		}
	}

	if (!hasRichText && runs.length > 0) {
		const first = runs[0]
		if (first.options?.color) options.color = first.options.color
		if (first.options?.fontSize) options.fontSize = first.options.fontSize
		if (first.options?.bold) options.bold = true
	}

	const textAlign = computed.textAlign
	if (textAlign === "center" || textAlign === "right") {
		options.align = textAlign
	}

	const verticalAlign = computed.verticalAlign
	if (verticalAlign === "middle" || verticalAlign === "bottom") {
		options.valign = verticalAlign as "middle" | "bottom"
	}

	const margin = calculateCellMargin(td, computed)
	if (margin) {
		options.margin = margin
	}

	const whiteSpace = computed.whiteSpace
	if (whiteSpace === "nowrap" || whiteSpace === "pre" || whiteSpace === "normal") {
		options.wrap = false
	}

	const colspan = parseInt(td.getAttribute("colspan") || "1")
	const rowspan = parseInt(td.getAttribute("rowspan") || "1")
	if (colspan > 1) options.colspan = colspan
	if (rowspan > 1) options.rowspan = rowspan

	const border = parseCellBorder(computed, trComputed)
	if (border) options.border = border

	const text: string | PPTTableTextRun[] = hasRichText
		? runs
		: runs.map((r) => r.text).join("")

	return { text, options: Object.keys(options).length > 0 ? options : undefined }
}

/**
 * 解析单元格边框
 * @param computed - 单元格的计算样式
 * @param trComputed - 行的计算样式 (用于继承行边框)
 */
function parseCellBorder(
	computed: CSSStyleDeclaration,
	trComputed: CSSStyleDeclaration,
): PPTTableCellBorder | [PPTTableCellBorder, PPTTableCellBorder, PPTTableCellBorder, PPTTableCellBorder] | undefined {
	// 单元格边框
	let topWidth = parseFloat(computed.borderTopWidth) || 0
	let rightWidth = parseFloat(computed.borderRightWidth) || 0
	let bottomWidth = parseFloat(computed.borderBottomWidth) || 0
	let leftWidth = parseFloat(computed.borderLeftWidth) || 0

	let topColor = computed.borderTopColor
	let rightColor = computed.borderRightColor
	let bottomColor = computed.borderBottomColor
	let leftColor = computed.borderLeftColor

	let topStyle = computed.borderTopStyle
	let rightStyle = computed.borderRightStyle
	let bottomStyle = computed.borderBottomStyle
	let leftStyle = computed.borderLeftStyle

	// 如果单元格没有边框，尝试从行继承
	const trTopWidth = parseFloat(trComputed.borderTopWidth) || 0
	const trRightWidth = parseFloat(trComputed.borderRightWidth) || 0
	const trBottomWidth = parseFloat(trComputed.borderBottomWidth) || 0
	const trLeftWidth = parseFloat(trComputed.borderLeftWidth) || 0

	if (topWidth === 0 && trTopWidth > 0) {
		topWidth = trTopWidth
		topColor = trComputed.borderTopColor
		topStyle = trComputed.borderTopStyle
	}
	if (rightWidth === 0 && trRightWidth > 0) {
		rightWidth = trRightWidth
		rightColor = trComputed.borderRightColor
		rightStyle = trComputed.borderRightStyle
	}
	if (bottomWidth === 0 && trBottomWidth > 0) {
		bottomWidth = trBottomWidth
		bottomColor = trComputed.borderBottomColor
		bottomStyle = trComputed.borderBottomStyle
	}
	if (leftWidth === 0 && trLeftWidth > 0) {
		leftWidth = trLeftWidth
		leftColor = trComputed.borderLeftColor
		leftStyle = trComputed.borderLeftStyle
	}

	// 没有边框
	if (topWidth === 0 && rightWidth === 0 && bottomWidth === 0 && leftWidth === 0) {
		return undefined
	}

	const mapBorderStyle = (style: string): "solid" | "dash" | "dot" | "none" => {
		switch (style) {
			case "dashed":
				return "dash"
			case "dotted":
				return "dot"
			case "none":
			case "hidden":
				return "none"
			default:
				return "solid"
		}
	}

	// 构建单边边框（支持透明度）
	const buildBorder = (
		width: number,
		color: string,
		style: string,
	): PPTTableCellBorder => {
		if (width <= 0) {
			return { type: "none" }
		}
		const border: PPTTableCellBorder = {
			color: colorToHex(color),
			pt: width * 0.75,
			type: mapBorderStyle(style),
		}
		// 获取透明度并添加到边框对象
		const transparency = getTransparency(color)
		if (transparency > 0) {
			border.transparency = transparency
		}
		return border
	}

	// 如果四边相同，返回单一边框
	if (
		topWidth === rightWidth &&
		rightWidth === bottomWidth &&
		bottomWidth === leftWidth &&
		topColor === rightColor &&
		rightColor === bottomColor &&
		bottomColor === leftColor &&
		topStyle === rightStyle &&
		rightStyle === bottomStyle &&
		bottomStyle === leftStyle
	) {
		return buildBorder(topWidth, topColor, topStyle)
	}

	// 四边不同，返回数组 [top, right, bottom, left]
	return [
		buildBorder(topWidth, topColor, topStyle),
		buildBorder(rightWidth, rightColor, rightStyle),
		buildBorder(bottomWidth, bottomColor, bottomStyle),
		buildBorder(leftWidth, leftColor, leftStyle),
	]
}
