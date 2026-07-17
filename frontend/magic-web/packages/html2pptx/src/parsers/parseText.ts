import type { ElementNode } from "../ir/dom"
import type { PPTTextNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { pxToInch, getGlobalTransform } from "../shared/unit"
import { DEFAULT_DPI, TEXT_SAFETY_MARGIN_X, TEXT_SAFETY_MARGIN_Y } from "../shared/constants"
import {
	transformText,
	normalizeTextByWhiteSpace,
	hasRenderableText,
	parseLineHeightPx,
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
			// Get the global transform, including parent rotation and scale.
			const { rotation, scaleX, scaleY } = getGlobalTransform(node)
			const transformScale = scaleX
			const rotateAngle = rotation

			// Correct the font size.
			const finalFontSize =
				transformScale !== 1
					? Math.round(textStyle.fontSize * transformScale)
					: textStyle.fontSize

			// Rotated text must stay as one box because Range rects are already axis-aligned after rotation;
			// rotating per-line boxes again in PowerPoint would apply the geometry twice.
			if (options.mergeVisualLines || Math.abs(rotateAngle) > 0.01) {
				let text = normalizeTextByWhiteSpace({
					text: childNode.textContent ?? "",
					whiteSpace,
				})
				if (!hasRenderableText({ text, whiteSpace })) continue

				text = transformText(text, style.textTransform)

				const measurement = measureTextNode(doc, childNode as Text)
				if (!measurement) continue

				const contentBox = resolveTextContentBox(node, {
					rotation,
					scaleX,
					scaleY,
				})
				const hasFlowAlignment =
					style.textAlign === "center" ||
					style.textAlign === "right" ||
					style.textAlign === "justify"
				const hasTransform =
					Math.abs(rotation) > 0.01 ||
					Math.abs(scaleX - 1) > 0.01 ||
					Math.abs(scaleY - 1) > 0.01
				const useFlowWidth =
					hasTransform ||
					measurement.rectCount > 1 ||
					hasFlowAlignment ||
					style.textTransform !== "none"
				const verticalSafety = Math.max(
					TEXT_SAFETY_MARGIN_Y * 2,
					measurement.rectCount * TEXT_SAFETY_MARGIN_Y,
				)
				const estimatedFlowHeight =
					measurement.rectCount *
					parseLineHeightPx(style.lineHeight, style.fontSize) *
					(Math.abs(scaleY) || 1)

				const x = useFlowWidth ? contentBox.left : measurement.bounds.left
				const y = hasTransform
					? contentBox.top
					: Math.min(measurement.bounds.top, contentBox.top)
				const w = Math.max(
					0,
					(useFlowWidth
						? contentBox.right - contentBox.left
						: measurement.bounds.right - measurement.bounds.left) +
						TEXT_SAFETY_MARGIN_X * 2,
				)
				const h = Math.max(
					0,
					(hasTransform
						? Math.max(contentBox.bottom - contentBox.top, estimatedFlowHeight)
						: Math.max(
								contentBox.bottom - contentBox.top,
								measurement.bounds.bottom - measurement.bounds.top,
								estimatedFlowHeight,
							)) + verticalSafety,
				)

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

			const visualLines = splitTextNodeByVisualLines({
				doc,
				textNode: childNode as Text,
			})
			if (visualLines.length === 0) continue

			for (const line of visualLines) {
				let text = normalizeTextByWhiteSpace({
					text: line.text,
					whiteSpace,
				})
				if (!hasRenderableText({ text, whiteSpace })) continue

				text = transformText(text, style.textTransform)

				// After splitting by visual lines, treat each fragment as a single line to avoid applying line-height twice.
				let x = line.rect.left
				let y = line.rect.top
				let w = Math.max(0, line.rect.right - line.rect.left + TEXT_SAFETY_MARGIN_X * 2)
				let h = Math.max(0, line.rect.bottom - line.rect.top + TEXT_SAFETY_MARGIN_Y * 2)

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

interface TextBounds {
	left: number
	right: number
	top: number
	bottom: number
}

function measureTextNode(
	doc: Document,
	textNode: Text,
): { bounds: TextBounds; rectCount: number } | null {
	const raw = textNode.textContent ?? ""
	if (!raw) return null

	const range = doc.createRange()
	range.setStart(textNode, 0)
	range.setEnd(textNode, raw.length)
	const rects = Array.from(range.getClientRects())
	if (rects.length === 0) return null

	const bounds = rects.reduce<TextBounds>(
		(result, rect) => ({
			left: Math.min(result.left, rect.left),
			right: Math.max(result.right, rect.right),
			top: Math.min(result.top, rect.top),
			bottom: Math.max(result.bottom, rect.bottom),
		}),
		{
			left: rects[0].left,
			right: rects[0].right,
			top: rects[0].top,
			bottom: rects[0].bottom,
		},
	)

	return { bounds, rectCount: rects.length }
}

/**
 * Resolve the text container before rotation so PowerPoint receives an unrotated box plus rotate,
 * rather than a browser axis-aligned bounding box that would be rotated a second time.
 */
function resolveTextContentBox(
	node: ElementNode,
	transform: { rotation: number; scaleX: number; scaleY: number },
): TextBounds {
	const { rotation, scaleX, scaleY } = transform
	const absScaleX = Math.abs(scaleX) || 1
	const absScaleY = Math.abs(scaleY) || 1
	const hasTransform =
		Math.abs(rotation) > 0.01 ||
		Math.abs(absScaleX - 1) > 0.01 ||
		Math.abs(absScaleY - 1) > 0.01

	let left = node.rect.x
	let top = node.rect.y
	let width = node.rect.w
	let height = node.rect.h

	if (hasTransform) {
		width = (node.layout.offsetWidth || node.rect.w) * absScaleX
		height = (node.layout.offsetHeight || node.rect.h) * absScaleY
		const centerX = node.rect.x + node.rect.w / 2
		const centerY = node.rect.y + node.rect.h / 2
		left = centerX - width / 2
		top = centerY - height / 2
	}

	const paddingLeft = parseCssPx(node.style.paddingLeft) * absScaleX
	const paddingRight = parseCssPx(node.style.paddingRight) * absScaleX
	const paddingTop = parseCssPx(node.style.paddingTop) * absScaleY
	const paddingBottom = parseCssPx(node.style.paddingBottom) * absScaleY
	const contentLeft = left + paddingLeft
	const contentRight = left + width - paddingRight
	const contentTop = top + paddingTop
	const contentBottom = top + height - paddingBottom

	return {
		left: contentLeft,
		right: Math.max(contentLeft, contentRight),
		top: contentTop,
		bottom: Math.max(contentTop, contentBottom),
	}
}

function parseCssPx(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}
