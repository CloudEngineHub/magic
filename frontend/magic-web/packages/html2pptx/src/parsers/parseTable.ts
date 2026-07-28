/**
 * Table parser.
 * Converts HTML <table> elements into PPT table nodes.
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
 * Parse an HTML table into a PPT table node.
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

	// Get rows from the current table, excluding rows from nested tables.
	const tableRows = Array.from(tableElement.rows)
	if (tableRows.length === 0) return null

	// Parse the table structure.
	const { rows, colCount } = parseTableRows(
		tableRows,
		iWindow,
	)
	if (rows.length === 0) return null

	// Calculate column widths.
	const colWidths = calculateColumnWidths(tableElement, colCount, rect.w, config)

	// Calculate row heights.
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
 * Parse table rows.
 */
function parseTableRows(
	tableRows: HTMLTableRowElement[],
	iWindow: Window,
): { rows: PPTTableRow[]; colCount: number } {
	const rows: PPTTableRow[] = []
	let maxOriginalColCount = 0

	// Create the merged-cell tracking matrix.
	const mergeMatrix: Array<Array<{ skip: boolean; rowspan: number; colspan: number }>> = []

	tableRows.forEach((tr, rowIndex) => {
		const cells: PPTTableCell[] = []
		// Only use direct cells from the current row to avoid nested table cells.
		const tdElements = Array.from(tr.cells)

		let colIndex = 0

		// Initialize the merge matrix for the current row.
		if (!mergeMatrix[rowIndex]) {
			mergeMatrix[rowIndex] = []
		}

		tdElements.forEach((td) => {
			// Skip columns occupied by rowspan cells.
			while (mergeMatrix[rowIndex]?.[colIndex]?.skip) {
				colIndex++
			}

			// Handle colspan and rowspan.
			const colspan = parseInt(td.getAttribute("colspan") || "1")
			const rowspan = parseInt(td.getAttribute("rowspan") || "1")
			const cell = parseCellElement(td as HTMLTableCellElement, tr, iWindow)
			if (colspan > 1) cell.options = { ...(cell.options ?? {}), colspan }
			if (rowspan > 1) cell.options = { ...(cell.options ?? {}), rowspan }
			cells.push(cell)

			// Update the merge matrix.
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
 * Parse a table cell element.
 * @param td - Cell element (td/th)
 * @param tr - Row element used for inherited row styles
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
	if (whiteSpace === "nowrap" || whiteSpace === "pre") {
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
 * Parse table cell borders.
 * @param computed - Computed style for the cell
 * @param trComputed - Computed style for the row, used for inherited row borders
 */
function parseCellBorder(
	computed: CSSStyleDeclaration,
	trComputed: CSSStyleDeclaration,
): PPTTableCellBorder | [PPTTableCellBorder, PPTTableCellBorder, PPTTableCellBorder, PPTTableCellBorder] | undefined {
	// Cell borders.
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

	// If the cell has no border, try inheriting from the row.
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

	// No border.
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

	// Build per-side borders, including transparency.
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
		// Add transparency to the border object when needed.
		const transparency = getTransparency(color)
		if (transparency > 0) {
			border.transparency = transparency
		}
		return border
	}

	// Return a single border when all four sides are identical.
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

	// Four different sides: return [top, right, bottom, left].
	return [
		buildBorder(topWidth, topColor, topStyle),
		buildBorder(rightWidth, rightColor, rightStyle),
		buildBorder(bottomWidth, bottomColor, bottomStyle),
		buildBorder(leftWidth, leftColor, leftStyle),
	]
}
