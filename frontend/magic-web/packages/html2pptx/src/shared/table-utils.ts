/**
 * Table utility functions
 * Provide helper calculations used during table parsing
 */

import type { SlideConfig } from "../api/options"
import { hasVisibleBackground } from "./color"
import { pxToInch } from "./unit"

/**
 * Get visible text truncated by text-overflow: ellipsis
 *
 * When an element has both overflow:hidden and text-overflow:ellipsis and
 * its content actually overflows, clone a hidden container with the same styles and use real browser layout
 * to binary-search the maximum number of characters that fit, then append an ellipsis.
 *
 * Compared with Canvas measureText, this correctly reflects padding, border,
 * letter-spacing, font kerning, and all other CSS effects on text width.
 */
export function getEllipsisText(
	el: Element,
	fullText: string,
	computed: CSSStyleDeclaration,
): string {
	if (!fullText) return fullText

	const textOverflow = computed.textOverflow
	const overflow = computed.overflow
	const whiteSpace = computed.whiteSpace

	const isEllipsis =
		textOverflow === "ellipsis" &&
		(overflow === "hidden" || overflow === "clip") &&
		(whiteSpace === "nowrap" || whiteSpace === "pre")

	if (!isEllipsis) return fullText

	const htmlEl = el as HTMLElement
	if (htmlEl.scrollWidth <= htmlEl.clientWidth) return fullText

	const doc = el.ownerDocument
	const probe = doc.createElement("span")

	probe.style.cssText = `
		position: absolute;
		visibility: hidden;
		pointer-events: none;
		font: ${computed.font};
		letter-spacing: ${computed.letterSpacing};
		word-spacing: ${computed.wordSpacing};
		white-space: nowrap;
	`

	const container = htmlEl.offsetParent ?? doc.body
	container.appendChild(probe)

	const maxWidth =
		htmlEl.clientWidth -
		(parseFloat(computed.paddingLeft) || 0) -
		(parseFloat(computed.paddingRight) || 0)

	const ellipsis = "…"

	try {
		probe.textContent = ellipsis
		const ellipsisW = probe.getBoundingClientRect().width

		let lo = 0
		let hi = fullText.length

		while (lo < hi) {
			const mid = Math.ceil((lo + hi) / 2)
			probe.textContent = fullText.slice(0, mid)
			const textW = probe.getBoundingClientRect().width + ellipsisW
			if (textW <= maxWidth) lo = mid
			else hi = mid - 1
		}

		if (lo >= fullText.length) return fullText
		if (lo === 0) return ellipsis
		return fullText.slice(0, lo) + ellipsis
	} finally {
		container.removeChild(probe)
	}
}

/**
 * Calculate table column widths in inches
 *
 * Prefer the browser's rendered column widths because they already include CSS table layout.
 * Fall back to explicit <col> widths and rendered first-row cells, then distribute any
 * unresolved width across the remaining columns. The result always matches tableWidth.
 *
 * @param table - HTML table element
 * @param colCount - Column count
 * @param tableWidth - Total table width in px
 * @param config - Slide configuration used for px-to-inch conversion
 */
export function calculateColumnWidths(
	table: HTMLTableElement,
	colCount: number,
	tableWidth: number,
	config: SlideConfig,
): number[] {
	if (colCount <= 0) return []

	const renderedColWidths = getRenderedColWidths(table, colCount)
	if (hasCompleteWidths(renderedColWidths, colCount)) {
		return normalizeColumnWidths(renderedColWidths, tableWidth).map((width) =>
			pxToInch(width, config),
		)
	}

	const renderedCellWidths = getFirstRowColumnWidths(table, colCount)
	if (
		hasCompleteWidths(renderedCellWidths, colCount) &&
		firstRowHasOnlySingleColumnCells(table)
	) {
		return normalizeColumnWidths(renderedCellWidths, tableWidth).map((width) =>
			pxToInch(width, config),
		)
	}

	const declaredWidths = getDeclaredColWidths(table, colCount, tableWidth)
	const widths = Array.from(
		{ length: colCount },
		(_, index) =>
			declaredWidths[index] || renderedColWidths[index] || renderedCellWidths[index] || 0,
	)

	const resolvedTotal = widths.reduce((sum, width) => sum + width, 0)
	const unresolvedCount = widths.filter((width) => width <= 0).length
	if (unresolvedCount > 0) {
		const remainingWidth = Math.max(0, tableWidth - resolvedTotal)
		const fallbackWidth =
			remainingWidth > 0 ? remainingWidth / unresolvedCount : tableWidth / colCount
		for (let index = 0; index < widths.length; index++) {
			if (widths[index] <= 0) widths[index] = fallbackWidth
		}
	}

	return normalizeColumnWidths(widths, tableWidth).map((width) => pxToInch(width, config))
}

function getRenderedColWidths(table: HTMLTableElement, colCount: number): number[] {
	const widths: number[] = []
	for (const col of getTableColumnElements(table)) {
		const span = col.span || 1
		const renderedWidth = col.getBoundingClientRect().width
		const perColumnWidth = renderedWidth > 0 ? renderedWidth / span : 0
		for (let index = 0; index < span && widths.length < colCount; index++) {
			widths.push(perColumnWidth)
		}
		if (widths.length >= colCount) break
	}
	return widths
}

function getDeclaredColWidths(
	table: HTMLTableElement,
	colCount: number,
	tableWidth: number,
): number[] {
	const widths: number[] = []
	for (const col of getTableColumnElements(table)) {
		const style = col.getAttribute("style") || ""
		const widthValue = style.match(/(?:^|;)\s*width:\s*([\d.]+)(px|%)/i)
		const span = col.span || 1
		let perColumnWidth = 0
		if (widthValue) {
			const value = parseFloat(widthValue[1])
			perColumnWidth = widthValue[2] === "%" ? (tableWidth * value) / 100 : value
		}
		for (let index = 0; index < span && widths.length < colCount; index++) {
			widths.push(perColumnWidth)
		}
		if (widths.length >= colCount) break
	}
	return widths
}

function getFirstRowColumnWidths(table: HTMLTableElement, colCount: number): number[] {
	const firstRow = table.rows[0]
	if (!firstRow) return []

	const widths: number[] = []
	for (const cell of Array.from(firstRow.cells)) {
		const colspan = cell.colSpan || 1
		const renderedWidth = cell.getBoundingClientRect().width
		const perColumnWidth = renderedWidth > 0 ? renderedWidth / colspan : 0
		for (let index = 0; index < colspan && widths.length < colCount; index++) {
			widths.push(perColumnWidth)
		}
		if (widths.length >= colCount) break
	}
	return widths
}

function hasCompleteWidths(widths: number[], colCount: number): boolean {
	return widths.length >= colCount && widths.slice(0, colCount).every((width) => width > 0)
}

function firstRowHasOnlySingleColumnCells(table: HTMLTableElement): boolean {
	const firstRow = table.rows[0]
	return Boolean(firstRow) && Array.from(firstRow.cells).every((cell) => cell.colSpan === 1)
}

function getTableColumnElements(table: HTMLTableElement): HTMLTableColElement[] {
	const columns: HTMLTableColElement[] = []
	for (const child of Array.from(table.children)) {
		if (child.tagName === "COL") {
			columns.push(child as HTMLTableColElement)
			continue
		}
		if (child.tagName !== "COLGROUP") continue
		for (const col of Array.from(child.children)) {
			if (col.tagName === "COL") columns.push(col as HTMLTableColElement)
		}
	}
	return columns
}

function normalizeColumnWidths(widths: number[], tableWidth: number): number[] {
	const normalized = widths.map((width) => Math.max(0, width))
	const totalWidth = normalized.reduce((sum, width) => sum + width, 0)
	if (tableWidth <= 0 || totalWidth <= 0) return normalized
	const scale = tableWidth / totalWidth
	return normalized.map((width) => width * scale)
}

/**
 * Calculate table row heights in inches
 *
 * Converted directly from each rendered row height.
 *
 * @param tableRows - Array of table row elements
 * @param config - Slide configuration used for px-to-inch conversion
 */
export function calculateRowHeights(
	tableRows: HTMLTableRowElement[],
	config: SlideConfig,
): number[] {
	return tableRows.map((tr) => {
		const rect = tr.getBoundingClientRect()
		return pxToInch(rect.height, config)
	})
}

/**
 * Calculate table cell margins in inches
 *
 * Besides reading CSS padding, also detect the actual left offset of text nodes,
 * to handle extra text indentation caused by icons and similar elements inside cells.
 *
 * @param td - Cell element
 * @param computed - Computed style for the cell
 * @returns [top, right, bottom, left] or undefined when all values are 0
 */
export function calculateCellMargin(
	td: HTMLTableCellElement,
	computed: CSSStyleDeclaration,
): [number, number, number, number] | undefined {
	const paddingTopPx = parseFloat(computed.paddingTop) || 0
	const paddingRightPx = parseFloat(computed.paddingRight) || 0
	const paddingBottomPx = parseFloat(computed.paddingBottom) || 0
	const paddingLeftPx = parseFloat(computed.paddingLeft) || 0

	let marginLeftPx = paddingLeftPx
	let marginRightPx = paddingRightPx
	const borderLeftWidth = parseFloat(computed.borderLeftWidth) || 0
	const borderRightWidth = parseFloat(computed.borderRightWidth) || 0
	const tdRect = td.getBoundingClientRect()
	const W_inner = Math.max(0, tdRect.width - borderLeftWidth - borderRightWidth)
	const gapPx = 2

	const graphics = td.querySelectorAll("img, svg")

	let textSpanL: number | null = null
	let textSpanR: number | null = null

	const textNode = findFirstTextNode(td)
	if (textNode) {
		try {
			const range = td.ownerDocument.createRange()
			range.selectNode(textNode)
			const textRect = range.getBoundingClientRect()

			const visualOffset = textRect.left - tdRect.left - borderLeftWidth
			const textParent = textNode.parentElement
			const textComputed = textParent
				? (td.ownerDocument.defaultView?.getComputedStyle(textParent) ?? computed)
				: computed

			// A centered or right-aligned text range naturally starts far from the cell's
			// left edge. Treating that offset as extra padding makes PowerPoint center the
			// text again inside an already shifted content box. Only infer indentation when
			// the browser actually lays the text out from the left side.
			if (isVisuallyLeftAligned(textComputed) && visualOffset > paddingLeftPx + 2) {
				marginLeftPx = Math.max(marginLeftPx, visualOffset)
			}
			if (textRect.width > 0.5) {
				textSpanL = visualOffset
				textSpanR = visualOffset + textRect.width
			}
		} catch {
			// Ignore Range errors
		}
	}

	if (graphics.length > 0) {
		for (const el of Array.from(graphics)) {
			const r = el.getBoundingClientRect()
			if (r.width < 1 || r.height < 1) continue
			const relL = r.left - tdRect.left - borderLeftWidth
			const relR = r.right - tdRect.left - borderLeftWidth
			if (textSpanL !== null && textSpanR !== null) {
				const tL = textSpanL
				const tR = textSpanR
				if (relR <= tL + gapPx) {
					marginLeftPx = Math.max(marginLeftPx, relR + gapPx)
				} else if (relL >= tR - gapPx) {
					marginRightPx = Math.max(marginRightPx, W_inner - relL + gapPx)
				} else {
					const mid = (tL + tR) / 2
					if (relL >= mid) {
						marginRightPx = Math.max(marginRightPx, W_inner - relL + gapPx)
					} else {
						marginLeftPx = Math.max(marginLeftPx, relR + gapPx)
					}
				}
			} else {
				const center = relL + (relR - relL) / 2
				if (center <= W_inner / 2) {
					marginLeftPx = Math.max(marginLeftPx, relR + gapPx)
				} else {
					marginRightPx = Math.max(marginRightPx, W_inner - relL + gapPx)
				}
			}
		}
	}

	const top = pxToInch(paddingTopPx)
	const right = pxToInch(marginRightPx)
	const bottom = pxToInch(paddingBottomPx)
	const left = pxToInch(marginLeftPx)

	if (top === 0 && right === 0 && bottom === 0 && left === 0) return undefined

	return [top, right, bottom, left]
}

function isVisuallyLeftAligned(computed: CSSStyleDeclaration): boolean {
	const textAlign = computed.textAlign.trim().toLowerCase()
	const direction = computed.direction.trim().toLowerCase()

	if (textAlign.includes("center")) return false
	if (textAlign.endsWith("right")) return false
	if (textAlign === "start") return direction !== "rtl"
	if (textAlign === "end") return direction === "rtl"

	// Preserve the existing indentation inference for left, justify and unknown
	// browser values. Their first rendered line starts at the left content edge.
	return true
}

/**
 * Recursively find the first non-empty text node inside an element
 *
 * Used by calculateCellMargin to locate the actual rendered text position.
 *
 * @param element - Starting element
 */
export function findFirstTextNode(element: Element): Node | null {
	for (const child of Array.from(element.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			if (child.textContent?.trim()) return child
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const found = findFirstTextNode(child as Element)
			if (found) return found
		}
	}
	return null
}

/**
 * Resolve the cell background-color inheritance chain
 *
 * Check in priority order: cell -> row -> section (thead/tbody/tfoot) -> table,
 * returning the first visible background color, or null if all are transparent.
 *
 * @param input - backgroundColor values for each level
 */
export function resolveEffectiveBackgroundColor(input: {
	cellBgColor: string
	rowBgColor: string
	sectionBgColor?: string
	tableBgColor?: string
}): string | null {
	const { cellBgColor, rowBgColor, sectionBgColor, tableBgColor } = input
	if (hasVisibleBackground(cellBgColor)) return cellBgColor
	if (hasVisibleBackground(rowBgColor)) return rowBgColor
	if (sectionBgColor && hasVisibleBackground(sectionBgColor)) return sectionBgColor
	if (tableBgColor && hasVisibleBackground(tableBgColor)) return tableBgColor
	return null
}

/**
 * Find the deepest text-style element under a cell
 *
 * Walk down the single-visible-child chain and return the final element reached.
 * Used to read text styles from the element that actually wraps the text, rather than from td itself
 * (color, font size, bold, and related styles).
 *
 * For example, `<td><div class="text-orange-500">P0</div></td>`
 * returns `<div>`, allowing parseTable to read orange and related styles.
 *
 * If the cell has multiple child elements or contains direct text, return null,
 * so the caller falls back to using the td styles.
 *
 * @param cell - Table cell element
 * @param iWindow - iframe window used to get computed styles
 */
export function findDeepestTextElement(
	cell: HTMLTableCellElement,
	iWindow: Window,
): Element | null {
	let current: Element = cell
	while (true) {
		const visibleChildren = Array.from(current.children).filter((child) => {
			const s = iWindow.getComputedStyle(child)
			return s.display !== "none" && s.visibility !== "hidden"
		})
		if (visibleChildren.length !== 1) break
		current = visibleChildren[0]
	}
	return current === cell ? null : current
}
