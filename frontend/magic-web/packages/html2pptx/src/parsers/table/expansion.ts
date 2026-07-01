import type { SlideConfig } from "../../api/options"
import type { PPTNodeBase, PPTShapeNode } from "../../ir/node"
import type { PPTLine } from "../../ir/style"
import type { PPTTableCell } from "../../ir/style"
import { colorToHex, getTransparency, hasVisibleBackground } from "../../shared/color"
import { parseBorderRadius, isFullyRounded, pxToInch } from "../../shared/unit"
import { mapBorderStyle } from "../parseBorder"

export interface ColumnExpansionPlan {
	parts: number
	firstPartPx?: number
}

export interface TableExpansionAnalysis {
	columnPlans: ColumnExpansionPlan[]
	originalColCount: number
	hasExpandedColumns: boolean
}

export interface InlineBadgeInfo {
	badge: HTMLElement
	badgeText: string
	remainingText: string
	firstPartPx: number
}

interface TableLayoutCell {
	cell: HTMLTableCellElement
	rowCellCount: number
	colIndex: number
	rowspan: number
	colspan: number
}

export type ParseTableCell = (
	td: HTMLTableCellElement,
	tr: HTMLTableRowElement,
	iWindow: Window,
) => PPTTableCell

export interface ExpandedBadgeCellResult {
	cells: PPTTableCell[]
	overlays: PPTShapeNode[]
}

export function analyzeTableExpansion(
	tableRows: HTMLTableRowElement[],
	iWindow: Window,
): TableExpansionAnalysis {
	const layout = collectTableLayout(tableRows)

	if (hasUnsafeMergedCells(layout.cells, layout.originalColCount)) {
		return createUnexpandedAnalysis(layout.originalColCount)
	}

	const columnPlans: ColumnExpansionPlan[] = []

	layout.cells.forEach(({ cell, colIndex, colspan }) => {
		if (colspan === 1) {
			const badgeInfo = getInlineBadgeInfo(cell, iWindow)
			if (badgeInfo) {
				const previous = columnPlans[colIndex]
				columnPlans[colIndex] = {
					parts: 2,
					firstPartPx: Math.max(previous?.firstPartPx ?? 0, badgeInfo.firstPartPx),
				}
			} else if (!columnPlans[colIndex]) {
				columnPlans[colIndex] = { parts: 1 }
			}
		}
	})

	for (let i = 0; i < layout.originalColCount; i++) {
		if (!columnPlans[i]) columnPlans[i] = { parts: 1 }
	}

	return {
		columnPlans,
		originalColCount: layout.originalColCount,
		hasExpandedColumns: columnPlans.some((plan) => plan.parts > 1),
	}
}

function collectTableLayout(tableRows: HTMLTableRowElement[]): {
	cells: TableLayoutCell[]
	originalColCount: number
} {
	const cells: TableLayoutCell[] = []
	const mergeMatrix: Array<Array<{ skip: boolean; rowspan: number; colspan: number }>> = []
	let originalColCount = 0

	tableRows.forEach((tr, rowIndex) => {
		if (!mergeMatrix[rowIndex]) mergeMatrix[rowIndex] = []

		const rowCells = Array.from(tr.cells)
		let colIndex = 0
		for (const cell of rowCells) {
			while (mergeMatrix[rowIndex]?.[colIndex]?.skip) colIndex++

			const colspan = parseInt(cell.getAttribute("colspan") || "1")
			const rowspan = parseInt(cell.getAttribute("rowspan") || "1")

			cells.push({
				cell,
				rowCellCount: rowCells.length,
				colIndex,
				rowspan,
				colspan,
			})

			markMergedCells(mergeMatrix, rowIndex, colIndex, rowspan, colspan)
			colIndex += colspan
		}

		originalColCount = Math.max(originalColCount, colIndex)
	})

	return { cells, originalColCount }
}

function hasUnsafeMergedCells(cells: TableLayoutCell[], originalColCount: number): boolean {
	return cells.some((cell) => {
		if (cell.rowspan > 1) return true
		if (cell.colspan <= 1) return false
		return !isFullWidthSingleCell(cell, originalColCount)
	})
}

function isFullWidthSingleCell(cell: TableLayoutCell, originalColCount: number): boolean {
	return (
		cell.rowCellCount === 1 &&
		cell.colIndex === 0 &&
		cell.colspan === originalColCount
	)
}

function createUnexpandedAnalysis(originalColCount: number): TableExpansionAnalysis {
	const columnPlans: ColumnExpansionPlan[] = []
	for (let i = 0; i < originalColCount; i++) {
		columnPlans[i] = { parts: 1 }
	}

	return {
		columnPlans,
		originalColCount,
		hasExpandedColumns: false,
	}
}

export function markMergedCells(
	mergeMatrix: Array<Array<{ skip: boolean; rowspan: number; colspan: number }>>,
	rowIndex: number,
	colIndex: number,
	rowspan: number,
	colspan: number,
): void {
	for (let r = 0; r < rowspan; r++) {
		for (let c = 0; c < colspan; c++) {
			if (r === 0 && c === 0) continue

			const targetRow = rowIndex + r
			const targetCol = colIndex + c

			if (!mergeMatrix[targetRow]) {
				mergeMatrix[targetRow] = []
			}
			mergeMatrix[targetRow][targetCol] = { skip: true, rowspan, colspan }
		}
	}
}

export function getAdjustedColspan(
	columnPlans: ColumnExpansionPlan[],
	originalStart: number,
	originalSpan: number,
): number {
	let total = 0
	for (let i = originalStart; i < originalStart + originalSpan; i++) {
		total += columnPlans[i]?.parts ?? 1
	}
	return Math.max(1, total)
}

export function getInlineBadgeInfo(
	td: HTMLTableCellElement,
	iWindow: Window,
): InlineBadgeInfo | null {
	for (const child of Array.from(td.children)) {
		const badge = child as HTMLElement
		if (!isInlineBadgeElement(badge, iWindow)) continue

		const badgeText = normalizeCellText(badge.textContent || "")
		if (!/^\d{1,3}$/.test(badgeText)) continue

		const remainingText = normalizeCellText(getTextContentExcluding(td, badge))
		if (!remainingText) continue

		const tdStyle = iWindow.getComputedStyle(td)
		const gapPx = getCssLengthPx(tdStyle.columnGap) ?? getCssLengthPx(tdStyle.gap) ?? 0
		const badgeRect = badge.getBoundingClientRect()
		const tdRect = td.getBoundingClientRect()
		const firstPartPx = clamp(
			badgeRect.width + gapPx,
			16,
			Math.max(16, tdRect.width * 0.5),
		)

		return {
			badge,
			badgeText,
			remainingText,
			firstPartPx,
		}
	}

	return null
}

export function parseExpandedBadgeCell(
	td: HTMLTableCellElement,
	tr: HTMLTableRowElement,
	iWindow: Window,
	badgeInfo: InlineBadgeInfo,
	rowspan: number,
	parseCell: ParseTableCell,
	base: PPTNodeBase,
	config: SlideConfig,
): ExpandedBadgeCellResult {
	const baseCell = parseCell(td, tr, iWindow)
	const sharedOptions = omitSpanOptions(baseCell.options)

	const badgeOptions: PPTTableCell["options"] = {
		...sharedOptions,
		align: "center",
		valign: "middle",
		wrap: false,
		margin: 0,
	}
	applyTextStyleOptions(badgeOptions, badgeInfo.badge, iWindow)

	if (rowspan > 1) badgeOptions.rowspan = rowspan

	const textOptions: PPTTableCell["options"] = {
		...sharedOptions,
		align: "left",
		wrap: false,
		margin: 0,
	}
	applyTextStyleOptions(textOptions, td, iWindow)
	if (rowspan > 1) textOptions.rowspan = rowspan

	return {
		cells: [
			{ text: "", options: compactCellOptions(badgeOptions) },
			{ text: badgeInfo.remainingText, options: compactCellOptions(textOptions) },
		],
		overlays: createBadgeOverlayNodes(badgeInfo, base, config, iWindow),
	}
}

export function applyCellSpan(cell: PPTTableCell, colspan: number, rowspan: number): void {
	const options: PPTTableCell["options"] = { ...(cell.options ?? {}) }

	if (colspan > 1) options.colspan = colspan
	else delete options.colspan

	if (rowspan > 1) options.rowspan = rowspan
	else delete options.rowspan

	cell.options = compactCellOptions(options)
}

export function calculateExpandedColumnWidths(
	table: HTMLTableElement,
	originalColCount: number,
	columnPlans: ColumnExpansionPlan[],
	tableWidth: number,
	config: SlideConfig,
): number[] {
	const originalWidths = measureOriginalColumnWidthsPx(table, originalColCount, tableWidth)
	const widthsPx: number[] = []

	for (let i = 0; i < originalColCount; i++) {
		const plan = columnPlans[i] ?? { parts: 1 }
		const originalWidth = originalWidths[i] ?? tableWidth / Math.max(1, originalColCount)

		if (plan.parts <= 1) {
			widthsPx.push(originalWidth)
			continue
		}

		const firstPart = clamp(
			plan.firstPartPx ?? originalWidth * 0.18,
			12,
			Math.max(12, originalWidth * 0.45),
		)
		widthsPx.push(firstPart)
		widthsPx.push(Math.max(12, originalWidth - firstPart))
	}

	return widthsPx.map((width) => pxToInch(width, config))
}

function omitSpanOptions(options: PPTTableCell["options"]): PPTTableCell["options"] {
	const next: PPTTableCell["options"] = { ...(options ?? {}) }
	delete next.colspan
	delete next.rowspan
	return next
}

function compactCellOptions(options: PPTTableCell["options"]): PPTTableCell["options"] | undefined {
	return options && Object.keys(options).length > 0 ? options : undefined
}

function applyTextStyleOptions(
	options: PPTTableCell["options"],
	element: HTMLElement,
	iWindow: Window,
): void {
	if (!options) return

	const style = iWindow.getComputedStyle(element)
	const color = colorToHex(style.color)
	if (color) options.color = color

	const fontSize = Math.round(parseFloat(style.fontSize) * 0.75)
	if (fontSize && fontSize !== 12) options.fontSize = fontSize
	else delete options.fontSize

	const fontWeight = parseInt(style.fontWeight)
	if (fontWeight >= 700 || style.fontWeight === "bold") options.bold = true
	else delete options.bold
}

function createBadgeOverlayNodes(
	badgeInfo: InlineBadgeInfo,
	base: PPTNodeBase,
	config: SlideConfig,
	iWindow: Window,
): PPTShapeNode[] {
	const badge = badgeInfo.badge
	const style = iWindow.getComputedStyle(badge)
	const rect = badge.getBoundingClientRect()
	if (rect.width <= 0 || rect.height <= 0) return []

	const nodeBase: PPTNodeBase = {
		...base,
		x: pxToInch(rect.left, config),
		y: pxToInch(rect.top, config),
		w: pxToInch(rect.width, config),
		h: pxToInch(rect.height, config),
		zOrder: base.zOrder + 1,
	}

	const fill = hasVisibleBackground(style.backgroundColor)
		? {
			type: "solid" as const,
			color: colorToHex(style.backgroundColor),
			transparency: getTransparency(style.backgroundColor),
		}
		: null
	const line = parseBadgeBorder(style, config)
	const radiusPx = parseBorderRadius(style.borderRadius, rect.width, rect.height)
	const isEllipse = isFullyRounded(style.borderRadius, rect.width, rect.height)
	const shapeType = isEllipse ? "ellipse" : radiusPx > 0 ? "roundRect" : "rect"

	return [{
		...nodeBase,
		type: "shape",
		shapeType,
		fill,
		line,
		shadow: null,
		radius: shapeType === "roundRect" ? pxToInch(radiusPx, config) : undefined,
		text: {
			value: badgeInfo.badgeText,
			fontSize: Math.round(parseFloat(style.fontSize) * 0.75) || 12,
			fontFace: normalizeFontFace(style.fontFamily),
			color: colorToHex(style.color),
			bold: parseInt(style.fontWeight) >= 700 || style.fontWeight === "bold",
			italic: style.fontStyle === "italic",
			underline: style.textDecorationLine.includes("underline"),
			strike: style.textDecorationLine.includes("line-through"),
			align: "center",
			valign: "middle",
			wrap: false,
			margin: [0, 0, 0, 0],
		},
	}]
}

function parseBadgeBorder(style: CSSStyleDeclaration, config: SlideConfig): PPTLine | null {
	const widthPx = parseFloat(style.borderTopWidth) || 0
	if (widthPx <= 0 || style.borderTopStyle === "none" || style.borderTopStyle === "hidden") {
		return null
	}
	if (getTransparency(style.borderTopColor) >= 100) return null

	return {
		color: colorToHex(style.borderTopColor),
		width: pxToInch(widthPx, config),
		style: mapBorderStyle(style.borderTopStyle),
		transparency: getTransparency(style.borderTopColor),
	}
}

function normalizeFontFace(fontFamily: string): string {
	const firstFamily = fontFamily.split(",")[0]?.trim()
	return firstFamily?.replace(/^["']|["']$/g, "") || "Arial"
}

function measureOriginalColumnWidthsPx(
	table: HTMLTableElement,
	originalColCount: number,
	tableWidth: number,
): number[] {
	const rows = Array.from(table.rows)
	const exactRow = rows.find((row) => {
		const cells = Array.from(row.cells)
		const spanTotal = cells.reduce(
			(total, cell) => total + parseInt(cell.getAttribute("colspan") || "1"),
			0,
		)
		return spanTotal === originalColCount && cells.every((cell) =>
			parseInt(cell.getAttribute("colspan") || "1") === 1
		)
	})

	const measured = exactRow
		? Array.from(exactRow.cells).map((cell) => cell.getBoundingClientRect().width)
		: measureColumnsFromAnyRow(rows, originalColCount)

	while (measured.length < originalColCount) {
		measured.push(tableWidth / Math.max(1, originalColCount))
	}

	return measured.slice(0, originalColCount).map((width) =>
		width > 0 ? width : tableWidth / Math.max(1, originalColCount),
	)
}

function measureColumnsFromAnyRow(
	rows: HTMLTableRowElement[],
	originalColCount: number,
): number[] {
	for (const row of rows) {
		const widths: number[] = []
		for (const cell of Array.from(row.cells)) {
			const colspan = parseInt(cell.getAttribute("colspan") || "1")
			const perColumnWidth = cell.getBoundingClientRect().width / Math.max(1, colspan)
			for (let i = 0; i < colspan; i++) widths.push(perColumnWidth)
		}

		if (widths.length >= originalColCount && widths.some((width) => width > 0)) {
			return widths
		}
	}

	return []
}

function isInlineBadgeElement(element: HTMLElement, iWindow: Window): boolean {
	const style = iWindow.getComputedStyle(element)
	if (style.display === "none" || style.visibility === "hidden") return false

	const rect = element.getBoundingClientRect()
	if (rect.width <= 0 || rect.height <= 0 || rect.width > 64 || rect.height > 64) return false

	const display = style.display
	const radius = Math.max(
		parseFloat(style.borderTopLeftRadius) || 0,
		parseFloat(style.borderTopRightRadius) || 0,
		parseFloat(style.borderBottomRightRadius) || 0,
		parseFloat(style.borderBottomLeftRadius) || 0,
	)

	return display.includes("flex") || radius > 0 || hasVisibleBackground(style.backgroundColor)
}

function getTextContentExcluding(root: Node, excluded: Node): string {
	if (root === excluded) return ""
	if (root.nodeType === Node.TEXT_NODE) return root.textContent || ""

	let text = ""
	for (const child of Array.from(root.childNodes)) {
		text += getTextContentExcluding(child, excluded)
	}
	return text
}

function normalizeCellText(text: string): string {
	return text.replace(/\s+/g, " ").trim()
}

function getCssLengthPx(value: string): number | null {
	const parsed = parseFloat(value)
	return Number.isFinite(parsed) ? parsed : null
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}
