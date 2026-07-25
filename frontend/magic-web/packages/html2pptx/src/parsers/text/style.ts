import type { ElementNode } from "../../ir/dom"
import type { PPTTextGradient } from "../../ir/node"
import type { PPTShadow } from "../../ir/style"
import {
	colorToHex,
	getTransparency,
	computeEffectiveOpacity,
	parseGradient,
	mergeGradientStopsWithElementOpacity,
} from "../../shared/color"
import { parseShadow } from "../parseShadow"
import { PX_TO_PT_RATIO } from "../../shared/constants"
import {
	mapFontFamily,
	parseBold,
	parseFontWeight,
	parseLetterSpacing,
	parseLineSpacing,
} from "../../shared/text-utils"
import { pxToPt } from "../../shared/unit"

/** Text style extracted from an element's computed style */
export interface TextStyle {
	fontSize: number
	fontFace: string
	fontWeight: number
	color: string | PPTTextGradient
	bold: boolean
	italic: boolean
	underline: boolean
	/** Strikethrough (text-decoration: line-through) */
	strike?: boolean
	align?: "left" | "center" | "right" | "justify"
	valign?: "top" | "middle" | "bottom"
	transparency?: number
	charSpacing?: number // Character spacing in points
	lineSpacing?: number // Line spacing multiplier
	shadow?: PPTShadow | null
	margin: [number, number, number, number] // [top, right, bottom, left] in points
	outline?: {
		color: string
		size: number
		transparency?: number
	}
}

export function resolveTextStyle(node: ElementNode, scale: number): TextStyle {
	const { style, tagName } = node
	const isSvgTextNode = ["TEXT", "TSPAN", "TEXTPATH"].includes(tagName.toUpperCase())
	const svgComputedFill = isSvgTextNode
		? node.element.ownerDocument?.defaultView
				?.getComputedStyle(node.element)
				.getPropertyValue("fill")
		: ""
	const svgFillColor = isSvgTextNode
		? node.element.namespaceURI === "http://www.w3.org/2000/svg"
			? node.element.getAttribute("fill") || svgComputedFill || style.color
			: style.color
		: style.color

	// Keep fractional point sizes. Flooring here changes browser line metrics
	// (for example 18px becomes 13pt instead of 13.5pt) and can alter wrapping.
	const fontSize = Math.max(0.01, style.fontSize * scale * PX_TO_PT_RATIO)
	const fontWeight = parseFontWeight(style.fontWeight)
	const isBold = parseBold(style.fontWeight)
	const isItalic = style.fontStyle === "italic"
	const isUnderline = style.textDecoration.includes("underline")
	const isStrike = style.textDecoration.includes("line-through")
	const charSpacing = parseLetterSpacing(style.letterSpacing, style.fontSize, scale)
	const lineSpacing = parseLineSpacing(style.lineHeight, style.fontSize)
	const align =
		style.textAlign === "center" || style.textAlign === "right" || style.textAlign === "justify"
			? style.textAlign
			: undefined

	let color: string | PPTTextGradient = colorToHex(svgFillColor)
	let colorTransparency = getTransparency(svgFillColor)
	let shouldApplyNodeTransparency = true
	const elementOpacity = computeEffectiveOpacity(node)

	if (
		style.backgroundImage &&
		style.backgroundImage.includes("gradient") &&
		style.backgroundClip === "text"
	) {
		const gradient = parseGradient(style.backgroundImage)
		if (gradient) {
			color = mergeGradientStopsWithElementOpacity(gradient, elementOpacity)
			colorTransparency = 0
			shouldApplyNodeTransparency = false
		}
	}

	let transparency = colorTransparency

	if (shouldApplyNodeTransparency && transparency === 0 && elementOpacity < 1) {
		transparency = Math.round((1 - elementOpacity) * 100)
	}

	const shadow = parseShadow(style.textShadow)

	let outline = undefined
	const strokeWidth = style.webkitTextStrokeWidth
	const strokeColor = style.webkitTextStrokeColor
	const strokeComposite = style.webkitTextStroke

	let sizePx = 0
	let colorStr = ""

	if (strokeWidth && strokeWidth !== "0px") {
		sizePx = parseFloat(strokeWidth)
		colorStr = strokeColor || "currentcolor"
	} else if (strokeComposite && strokeComposite !== "0px" && strokeComposite !== "none") {
		const parts = strokeComposite.match(/^([\d.]+)px\s+(.+)$/)
		if (parts) {
			sizePx = parseFloat(parts[1])
			colorStr = parts[2]
		}
	}

	if (sizePx > 0 && colorStr) {
		const finalColor = colorToHex(colorStr)
		let outlineTransparency = getTransparency(colorStr)
		if (outlineTransparency === 0 && elementOpacity < 1) {
			outlineTransparency = Math.round((1 - elementOpacity) * 100)
		}
		outline = {
			color: finalColor,
			size: pxToPt(sizePx * scale),
			transparency: outlineTransparency,
		}
	}

	return {
		fontSize,
		fontFace: mapFontFamily(style.fontFamily),
		fontWeight,
		color,
		bold: isBold,
		italic: isItalic,
		underline: isUnderline,
		strike: isStrike,
		align,
		transparency,
		charSpacing,
		lineSpacing,
		shadow,
		margin: [0, 0, 0, 0],
		outline,
	}
}
