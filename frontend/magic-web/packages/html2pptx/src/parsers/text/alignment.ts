import type { ElementNode } from "../../ir/dom"

export type TextVerticalAlign = "top" | "middle" | "bottom"

/**
 * Resolve the vertical anchor inside the text box. External CSS alignment
 * (inline vertical-align or a parent flex/grid alignment) has already moved
 * node.rect and must not be applied a second time inside PowerPoint.
 */
export function resolveTextVerticalAlign(input: {
	node: ElementNode
	lineCount: number
	lineHeightPx: number
	frameHeightPx: number
	verticalInsetsPx?: number
}): TextVerticalAlign {
	const { node, lineCount, lineHeightPx, frameHeightPx, verticalInsetsPx = 0 } = input

	if (node.style.display === "table-cell") {
		const tableCellAlign = mapVerticalValue(node.style.verticalAlign)
		if (tableCellAlign) return tableCellAlign
	}

	const contentHeight = Math.max(0, frameHeightPx - verticalInsetsPx)
	if (lineCount === 1 && contentHeight <= lineHeightPx + 2) return "middle"
	return "top"
}

function mapVerticalValue(value: string): TextVerticalAlign | undefined {
	const normalized = value.toLowerCase()
	if (normalized === "middle" || normalized === "center") return "middle"
	if (normalized === "bottom" || normalized === "text-bottom") return "bottom"
	if (normalized === "top" || normalized === "text-top") return "top"
	return undefined
}
