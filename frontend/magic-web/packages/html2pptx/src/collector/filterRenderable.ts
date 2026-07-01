import type { ElementNode } from "../ir/dom"
import { hasVisibleBackground, hasVisibleBorder } from "../shared/color"
import {
	hasDirectTextChild,
	isVisible,
	isTableChildElement,
	isInsideTableCell,
	isTableCellStandaloneGraphicElement,
} from "../shared/element-predicates"


/**
 * 判断元素是否有可绘制内容
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
	if (style.boxShadow && style.boxShadow !== "none") return true

	return false
}

/**
 * 判断节点是否位于布局表格的单元格内（布局表格的后代应独立处理）
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
 * 过滤出需要绘制的元素
 *
 * 新方案下每个元素独立处理：
 * - 内联文本元素（SPAN, STRONG 等）不再被父元素"代理"，而是自行生成文本框
 * - 表格内部元素及单元格内后代由 TABLE 统一处理（纯文本）；
 *   单元格内的 IMG/SVG/CANVAS 仍单独参与 transform，避免图标丢失。
 * - 布局表格（role=presentation 或包含嵌套表格且无边框）的后代元素独立处理，
 *   不受"表格内部过滤"逻辑限制。
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
