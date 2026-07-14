import type { ElementNode } from "../ir/dom"
import type { PPTNodeBase, PPTBorderLineNode } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { colorToHex, getTransparency } from "../shared/color"
import { hasUniformBorder } from "../shared/element-predicates"
import { pxToInch } from "../shared/unit"

type Side = "top" | "right" | "bottom" | "left"

export function mapBorderStyle(cssStyle: string): "solid" | "dashed" | "dotted" {
	if (cssStyle === "dashed") return "dashed"
	if (cssStyle === "dotted") return "dotted"
	return "solid"
}

export function parseBorderLines(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
): PPTBorderLineNode[] {
	const { style, rect } = node

	if (hasUniformBorder(style)) {
		log(LogLevel.L1, "Uniform border detected, skipping (handled by parseShape)")
		return []
	}

	const lines: PPTBorderLineNode[] = []

	const borders: Array<{
		side: Side
		width: string
		color: string
		style: string
	}> = [
		{ side: "top", width: style.borderTopWidth, color: style.borderTopColor, style: style.borderTopStyle },
		{ side: "right", width: style.borderRightWidth, color: style.borderRightColor, style: style.borderRightStyle },
		{ side: "bottom", width: style.borderBottomWidth, color: style.borderBottomColor, style: style.borderBottomStyle },
		{ side: "left", width: style.borderLeftWidth, color: style.borderLeftColor, style: style.borderLeftStyle },
	]

	for (const border of borders) {
		const widthPx = parseFloat(border.width) || 0
		if (widthPx <= 0 || border.style === "none" || !border.color || border.color === "transparent") {
			continue
		}

		if (getTransparency(border.color) >= 100) {
			continue
		}

		const borderTransparency = getTransparency(border.color)
		const borderColor = colorToHex(border.color)
		const borderWidthInch = pxToInch(widthPx, config)

		lines.push({
			...base,
			type: "borderLine",
			side: border.side,
			line: {
				color: borderColor,
				width: borderWidthInch,
				style: mapBorderStyle(border.style),
				transparency: borderTransparency,
			},
		})
	}

	return lines
}
