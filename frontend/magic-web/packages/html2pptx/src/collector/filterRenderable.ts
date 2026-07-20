import type { ElementNode } from "../ir/dom"
import { hasVisibleBackground, hasVisibleBorder } from "../shared/color"
import {
	hasDirectTextChild,
	isVisible,
	isTableChildElement,
	isInsideTableCell,
	isTableCellStandaloneGraphicElement,
} from "../shared/element-predicates"
import { hasRenderableTextThroughDisplayContents } from "../shared/text-flow-dom"


/**
 * Determine whether an element has drawable content
 *
 */
function hasRenderableContent(node: ElementNode): boolean {
	const { style, tagName } = node
	const tag = tagName.toUpperCase()
	if (tag === "IMG") return true
	if (tag === "I") return true
	if (tag === "SVG") return true
	if (tag === "TABLE") return true
	if (tag === "VIDEO") return true
	if (tag === "AUDIO") return true
	if (tag === "CANVAS") return true

	if (style.backgroundImage && style.backgroundImage !== "none") return true
	if (hasVisibleBackground(style.backgroundColor)) return true
	if (hasVisibleBorder(style.borderStyle, style.borderWidth, style.borderColor)) return true
	if (hasDirectTextChild(node)) return true
	if (hasRenderableTextThroughDisplayContents(node.element)) return true
	if (style.boxShadow && style.boxShadow !== "none") return true

	return false
}

/**
 * Determine whether a node is inside a layout-table cell, whose descendants should be handled independently
 */
function isInsideLayoutTableCell(node: ElementNode): boolean {
	const el = node.element
	const cell = el.closest?.("td, th")
	if (!cell) return false
	const table = cell.closest("table")
	if (!table) return false
	return table.getAttribute("role") === "presentation" ||
		table.getAttribute("role") === "none" ||
		!!table.querySelector(":scope > * > tr > td > table, :scope > tbody > tr > td > table, :scope > tr > td > table")
}


/**
 * Filter elements that need drawing
 *
 * In the new approach, each element is handled independently:
 * - Inline text elements such as SPAN and STRONG are no longer proxied by parents; they generate their own text boxes
 * - Elements inside tables and cell descendants are handled by TABLE as plain text;
 *   IMG/SVG/CANVAS inside cells still participate in transform separately to avoid losing icons.
 * - Descendants of layout tables (role=presentation or nested tables without borders) are handled independently,
 *   without being constrained by the table-internal filtering logic.
 */
export function filterRenderable(nodes: ElementNode[]): ElementNode[] {
	return nodes.filter((node) => {
		if (isTableChildElement(node)) {
			if (isInsideLayoutTableCell(node)) {
				const tag = node.tagName.toUpperCase()
				if (tag === "TD" || tag === "TH") {
					return isVisible(node) && hasRenderableContent(node)
				}
			}
			return false
		}
		if (isInsideTableCell(node)) {
			if (isInsideLayoutTableCell(node)) {
				return isVisible(node) && hasRenderableContent(node)
			}
			if (
				isTableCellStandaloneGraphicElement(node) &&
				isVisible(node) &&
				hasRenderableContent(node)
			)
				return true
			return false
		}
		return isVisible(node) && hasRenderableContent(node)
	})
}
