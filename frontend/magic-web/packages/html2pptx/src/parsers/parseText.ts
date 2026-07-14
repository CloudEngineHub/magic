import type { ElementNode } from "../ir/dom"
import type { PPTTextNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { pxToInch, getGlobalTransform } from "../shared/unit"
import {
	DEFAULT_DPI,
	TEXT_SAFETY_MARGIN_X,
	TEXT_SAFETY_MARGIN_Y,
} from "../shared/constants"
import {
	transformText,
	normalizeTextByWhiteSpace,
	hasRenderableText,
} from "../shared/text-utils"
import { splitTextNodeByVisualLines } from "./text/layout"
import { resolveTextStyle } from "./text/style"
export type { TextStyle } from "./text/style"

interface ParseTextNodesOptions {
	mergeVisualLines?: boolean
}

/**
 * Parse direct text nodes from an element; each DOM Text Node produces an independent PPT text box.
 *
 * Design principles:
 * - One DOM Text Node maps to one PPT text box.
 * - Styles are inherited from the text node's parent element, which is the current node.
 * - The Range API measures each text node's actual rendered bounds precisely.
 */
export function parseTextNodes(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	options: ParseTextNodesOptions = {},
): PPTTextNode[] {
	const { element, style } = node
	if (!element) return []
	const results: PPTTextNode[] = []
	const doc = element.ownerDocument
	const scale = config.slideWidth / (config.htmlWidth / DEFAULT_DPI)
	const whiteSpace = style.whiteSpace || "normal"

	// Precompute the current element's text style; all direct text nodes share it.
	// Positioning relies entirely on physical x/y coordinates.
	const textStyle = resolveTextStyle(node, scale)

	// Iterate direct child nodes and only process Text Nodes.
	for (const childNode of Array.from(element.childNodes)) {
		if (childNode.nodeType !== Node.TEXT_NODE) continue

		// Use the Range API to measure the rendered position of the text node precisely.
		try {
			const visualLines = splitTextNodeByVisualLines({
				doc,
				textNode: childNode as Text,
			})
			if (visualLines.length === 0) continue

			// Get the global transform, including parent rotation and scale.
			const { rotation, scaleX } = getGlobalTransform(node)
			const transformScale = scaleX
			const rotateAngle = rotation

			// Correct the font size.
			const finalFontSize =
				transformScale !== 1
					? Math.round(textStyle.fontSize * transformScale)
					: textStyle.fontSize

			if (options.mergeVisualLines && visualLines.length > 1) {
				let text = normalizeTextByWhiteSpace({
					text: childNode.textContent ?? "",
					whiteSpace,
				})
				if (!hasRenderableText({ text, whiteSpace })) continue

				text = transformText(text, style.textTransform)

				const bounds = unionVisualLineBounds(visualLines)
				if (!bounds) continue

				const spacingBuffer = textStyle.charSpacing
					? textStyle.charSpacing * text.length * 0.5
					: 0
				const contentLeft = node.rect.x + parseCssPx(style.paddingLeft)
				const contentRight = node.rect.x + node.rect.w - parseCssPx(style.paddingRight)
				const hasFlowAlignment =
					style.textAlign === "center" ||
					style.textAlign === "right" ||
					style.textAlign === "justify"

				let x = hasFlowAlignment && contentRight > contentLeft ? contentLeft : bounds.left
				let y = bounds.top
				let w = Math.max(
					0,
					Math.max(bounds.right, contentRight > x ? contentRight : bounds.right) -
						x +
						TEXT_SAFETY_MARGIN_X * 2 +
						spacingBuffer,
				)
				let h = Math.max(
					0,
					bounds.bottom - bounds.top + TEXT_SAFETY_MARGIN_Y * 2,
				)

				if (Math.abs(rotateAngle) === 90 || Math.abs(rotateAngle) === 270) {
					const cx = x + w / 2
					const cy = y + h / 2
					const temp = w
					w = h
					h = temp
					x = cx - w / 2
					y = cy - h / 2
				}

				const textBase: PPTNodeBase = {
					...base,
					x: pxToInch(x, config),
					y: pxToInch(y, config),
					w: pxToInch(w, config),
					h: pxToInch(h, config),
				}

				if (textBase.w <= 0 || textBase.h <= 0) continue

				results.push({
					...textBase,
					type: "text",
					text,
					...textStyle,
					fontSize: finalFontSize,
					rotate: rotateAngle !== 0 ? rotateAngle : undefined,
					wrap: true,
				})
				continue
			}

			for (const line of visualLines) {
				let text = normalizeTextByWhiteSpace({
					text: line.text,
					whiteSpace,
				})
				if (!hasRenderableText({ text, whiteSpace })) continue

				text = transformText(text, style.textTransform)

				// Add extra width when character spacing is present to avoid unexpected PPT wrapping caused by precision differences.
				const spacingBuffer = textStyle.charSpacing
					? textStyle.charSpacing * text.length * 0.5
					: 0

				// After splitting by visual lines, treat each fragment as a single line to avoid applying line-height twice.
				let x = line.rect.left
				let y = line.rect.top
				let w = Math.max(
					0,
					line.rect.right - line.rect.left + TEXT_SAFETY_MARGIN_X * 2 + spacingBuffer,
				)
				let h = Math.max(
					0,
					line.rect.bottom - line.rect.top + TEXT_SAFETY_MARGIN_Y * 2,
				)

				if (Math.abs(rotateAngle) === 90 || Math.abs(rotateAngle) === 270) {
					const cx = x + w / 2
					const cy = y + h / 2
					const temp = w
					w = h
					h = temp
					x = cx - w / 2
					y = cy - h / 2
				}

				const textBase: PPTNodeBase = {
					...base,
					x: pxToInch(x, config),
					y: pxToInch(y, config),
					w: pxToInch(w, config),
					h: pxToInch(h, config),
				}

				if (textBase.w <= 0 || textBase.h <= 0) continue

				const wrap = false
				results.push({
					...textBase,
					type: "text",
					text,
					...textStyle,
					lineSpacing: undefined,
					fontSize: finalFontSize,
					rotate: rotateAngle !== 0 ? rotateAngle : undefined,
					wrap,
				})
			}
		} catch {
			// Skip this text node if the Range API fails.
			log(LogLevel.L4, "Range API 异常", { textContent: childNode.textContent })
		}
	}

	return results
}

function unionVisualLineBounds(
	visualLines: Array<{ rect: { left: number; right: number; top: number; bottom: number } }>,
): { left: number; right: number; top: number; bottom: number } | null {
	return visualLines.reduce<{ left: number; right: number; top: number; bottom: number } | null>(
		(bounds, line) => {
			if (!bounds) return { ...line.rect }
			return {
				left: Math.min(bounds.left, line.rect.left),
				right: Math.max(bounds.right, line.rect.right),
				top: Math.min(bounds.top, line.rect.top),
				bottom: Math.max(bounds.bottom, line.rect.bottom),
			}
		},
		null,
	)
}

function parseCssPx(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}
