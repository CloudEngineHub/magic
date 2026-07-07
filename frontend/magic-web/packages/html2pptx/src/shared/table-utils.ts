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

	const maxWidth = htmlEl.clientWidth
		- (parseFloat(computed.paddingLeft) || 0)
		- (parseFloat(computed.paddingRight) || 0)

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
 * Prefer explicit widths from <col> elements; if none exist or all are 0,
 * measure the actual rendered widths of first-row cells while expanding colspan.
 * Finally pad to colCount columns and replace zero-width columns with the average width.
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
	const widths: number[] = []

	const colElements = table.querySelectorAll("col")
	if (colElements.length > 0) {
		Array.from(colElements).forEach((col) => {
			const style = col.getAttribute("style") || ""
			const widthMatch = style.match(/width:\s*([\d.]+)(px|%)/)
			if (widthMatch) {
				const value = parseFloat(widthMatch[1])
				const unit = widthMatch[2]
				if (unit === "%") {
					widths.push(pxToInch(tableWidth * value / 100, config))
				} else {
					widths.push(pxToInch(value, config))
				}
			} else {
				widths.push(0)
			}
		})
	}

	if (widths.length === 0 || widths.every((w) => w === 0)) {
		const firstRow = table.rows[0]
		if (firstRow) {
			const cells = Array.from(firstRow.cells)
			const totalWidth = tableWidth
			const cellWidths: number[] = []

			cells.forEach((cell) => {
				const rect = cell.getBoundingClientRect()
				cellWidths.push(rect.width)
			})

			const expandedWidths: number[] = []
			cells.forEach((cell, i) => {
				const colspan = parseInt(cell.getAttribute("colspan") || "1")
				const cellWidth = cellWidths[i] || 0
				const perColWidth = cellWidth / colspan

				for (let c = 0; c < colspan; c++) {
					expandedWidths.push(perColWidth)
				}
			})

			while (expandedWidths.length < colCount) {
				expandedWidths.push(totalWidth / colCount)
			}

			return expandedWidths.map((w) => pxToInch(w, config))
		}
	}

	const tableWidthInch = pxToInch(tableWidth, config)
	const avgWidth = tableWidthInch / colCount

	while (widths.length < colCount) {
		widths.push(avgWidth)
	}

	const nonZeroWidths = widths.filter((w) => w > 0)
	const avgNonZero = nonZeroWidths.length > 0
		? nonZeroWidths.reduce((a, b) => a + b, 0) / nonZeroWidths.length
		: avgWidth

	return widths.map((w) => (w > 0 ? w : avgNonZero))
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

			if (visualOffset > paddingLeftPx + 2) {
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
export function findDeepestTextElement(cell: HTMLTableCellElement, iWindow: Window): Element | null {
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
