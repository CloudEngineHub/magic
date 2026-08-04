import type { ElementNode } from "../ir/dom"
import type { PPTNodeBase, PPTTextNode, PPTTextRun } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { log, LogLevel } from "../logger"
import { getGlobalTransform, pxToInch, pxToPt } from "../shared/unit"
import {
	hasRenderableText,
	normalizeTextByWhiteSpace,
	parseLineHeightPx,
	transformTextWithFlowContext,
} from "../shared/text-utils"
import { withTransformChainDisabled } from "../shared/transform-measurement"
import { collectTextNodesThroughDisplayContents } from "../shared/text-flow-dom"
import { measureUniformLineAdvance, splitTextNodeByVisualLines } from "./text/layout"
import { resolveTextVerticalAlign } from "./text/alignment"
import { resolveTextStyle } from "./text/style"
export type { TextStyle } from "./text/style"

interface ParseTextNodesOptions {
	/** Kept for API compatibility; visual-line splitting is decided from geometry. */
	mergeVisualLines?: boolean
	/** Full collection map, including zero-geometry display:contents style owners. */
	elementNodeMap?: Map<Element, ElementNode>
}

interface TextLine {
	text: string
	rect: { left: number; right: number; top: number; bottom: number }
}

interface TextFramePx {
	left: number
	top: number
	width: number
	height: number
}

interface ResolvedTextFrame {
	frame: TextFramePx
	usesElementBox: boolean
}

type GlobalTransform = ReturnType<typeof getGlobalTransform>

/**
 * Parse direct text nodes (including display:contents text flow) into editable
 * PowerPoint text boxes.
 *
 * The HTML element box is authoritative for x/y/w/h. Range measurements are
 * used only to recover browser visual lines. Lines that share one horizontal
 * anchor are emitted as soft breaks inside the same PowerPoint shape;
 * discontinuous inline flow is emitted one line per shape.
 */
export function parseTextNodes(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	options: ParseTextNodesOptions = {},
): PPTTextNode[] {
	const { element } = node
	if (!element) return []

	const results: PPTTextNode[] = []
	const doc = element.ownerDocument
	// The package's coordinate contract is CSS px at 96 DPI. slideWidth and
	// slideHeight define the page bounds; they do not independently scale text
	// while shapes/images remain in the same CSS coordinate system.
	const scale = 1
	const transform = getGlobalTransform(node)
	const textScale = transform.textSafe ? Math.abs(transform.scaleX) || 1 : 1
	const textNodes = collectTextNodesThroughDisplayContents(element)
	const usesElementBox = isSoleTextFlowOwner(node, textNodes)

	for (const childNode of textNodes) {

		try {
			const rawText = childNode.textContent ?? ""
			if (!rawText) continue
			const styleNode = resolveTextStyleNode(childNode, node, options.elementNodeMap)
			const style = styleNode.style
			const whiteSpace = style.whiteSpace || node.style.whiteSpace || "normal"
			const textStyle = resolveTextStyle(styleNode, scale)
			const finalFontSize = textStyle.fontSize * textScale
			const measurement = measurePlainTextLayout({
				doc,
				node,
				textNode: childNode,
				textStyle: style,
				usesElementBox,
				transform,
			})
			const { visualLines } = measurement
			if (visualLines.length === 0) continue
			const ownerLineHeightPx = resolveBrowserLineHeightPx(style, visualLines)

			const lineRuns = buildPlainTextLineRuns({
				lines: visualLines,
				whiteSpace,
				textTransform: style.textTransform,
			})
			if (!lineRuns.some((run) => run?.text.length)) continue

			const appendTextNode = ({
				lines,
				text,
				measuredOwnerFrame,
			}: {
				lines: TextLine[]
				text: string | PPTTextRun[]
				measuredOwnerFrame?: TextFramePx
			}) => {
				const resolvedFrame = resolvePlainTextFrame({
					node,
					lines,
					transform,
					textStyle: style,
					usesElementBox,
					measuredOwnerFrame,
					browserLineHeightPx: ownerLineHeightPx,
				})
				const { frame } = resolvedFrame
				const textBase: PPTNodeBase = {
					...base,
					x: pxToInch(frame.left, config),
					y: pxToInch(frame.top, config),
					w: pxToInch(frame.width, config),
					h: pxToInch(frame.height, config),
				}
				if (textBase.w <= 0 || textBase.h <= 0) return

				const lineCount = lines.length
				const lineHeightPx = ownerLineHeightPx * textScale
				const exactLineSpacingPx = resolveExactLineSpacingPx(style, lines)
				const scaledStyle = {
					...textStyle,
					fontSize: finalFontSize,
					transparency: isLayoutPreservingTextHidden(styleNode.element)
						? 100
						: textStyle.transparency,
					lineSpacing: undefined,
					lineSpacingPt:
						lineCount > 1 && exactLineSpacingPx !== undefined
							? pxToPt(exactLineSpacingPx * textScale)
							: undefined,
					margin: resolvedFrame.usesElementBox
						? resolveTextMargins(node, transform)
						: ([0, 0, 0, 0] as [number, number, number, number]),
					valign: resolveTextVerticalAlign({
						node,
						lineCount,
						lineHeightPx,
						frameHeightPx: frame.height,
						verticalInsetsPx: resolvedFrame.usesElementBox
							? resolveVerticalInsetsPx(node, transform)
							: 0,
					}),
				}

				results.push({
					...textBase,
					type: "text",
					text,
					...scaledStyle,
					rotate:
						transform.textSafe && transform.rotation !== 0
							? transform.rotation
							: undefined,
					wrap: false,
				})
			}

			if (
				shouldSplitPlainTextVisualLines({
					enabled: options.mergeVisualLines === true,
					lines: visualLines,
					usesElementBox,
					transform,
					textAlign: textStyle.align,
				})
			) {
				for (let lineIndex = 0; lineIndex < visualLines.length; lineIndex++) {
					const lineRun = lineRuns[lineIndex]
					if (!lineRun?.text) continue
					appendTextNode({ lines: [visualLines[lineIndex]], text: lineRun.text })
				}
				continue
			}

			const runs = buildPlainTextRunsFromLineRuns(lineRuns)
			if (runs.length === 0) continue
			appendTextNode({
				lines: visualLines,
				text: runs.length === 1 ? runs[0].text : runs,
				measuredOwnerFrame: measurement.ownerFrame,
			})
		} catch {
			log(LogLevel.L4, "Range API 异常", { textContent: childNode.textContent })
		}
	}

	return results
}

function measurePlainTextLayout(input: {
	doc: Document
	node: ElementNode
	textNode: Text
	textStyle: Pick<ElementNode["style"], "lineHeight" | "fontSize">
	usesElementBox: boolean
	transform: GlobalTransform
}): { visualLines: TextLine[]; ownerFrame?: TextFramePx } {
	const { doc, node, textNode, textStyle, usesElementBox, transform } = input
	const measureLines = () => splitTextNodeByVisualLines({ doc, textNode })
	if (usesElementBox || !textNode.parentNode) {
		return withTransformChainDisabled(node, () => ({ visualLines: measureLines() }))
	}
	const hasSafeTransform = transform.textSafe && !isIdentityTransform(transform)
	if (hasSafeTransform) {
		return withTransformChainDisabled(node, () => {
			const untransformedNodeRect = node.element.getBoundingClientRect()
			const measurement = measureWrappedTextOwner({
				doc,
				node,
				textNode,
				textStyle,
				measureLines,
			})
			return {
				visualLines: measurement.visualLines,
				ownerFrame: measurement.ownerFrame
					? mapFrameThroughTransform({
							frame: measurement.ownerFrame,
							untransformedNodeRect,
							node,
							transform,
						})
					: undefined,
			}
		})
	}

	return measureWrappedTextOwner({ doc, node, textNode, textStyle, measureLines })
}

function measureWrappedTextOwner(input: {
	doc: Document
	node: ElementNode
	textNode: Text
	textStyle: Pick<ElementNode["style"], "lineHeight" | "fontSize">
	measureLines: () => TextLine[]
}): { visualLines: TextLine[]; ownerFrame?: TextFramePx } {
	const { doc, node, textNode, textStyle, measureLines } = input
	const parent = textNode.parentNode
	if (!parent) return { visualLines: measureLines() }
	const wrapper = doc.createElement("span")
	Object.assign(wrapper.style, {
		display: "inline",
		boxSizing: "content-box",
		margin: "0",
		padding: "0",
		border: "0",
		background: "none",
		position: "static",
		transform: "none",
		font: "inherit",
		fontSize: "inherit",
		fontFamily: "inherit",
		fontWeight: "inherit",
		fontStyle: "inherit",
		lineHeight: "inherit",
		letterSpacing: "inherit",
		whiteSpace: "inherit",
		textTransform: "inherit",
		verticalAlign: "baseline",
	})
	parent.insertBefore(wrapper, textNode)
	wrapper.appendChild(textNode)

	try {
		const visualLines = measureLines()
		const rect = wrapper.getBoundingClientRect()
		const lineHeight = resolveBrowserLineHeightPx(textStyle, visualLines)
		const lineBoxHeight = lineHeight * Math.max(1, visualLines.length)
		const ownerFrame =
			rect.width > 0 && rect.height > 0
				? {
						left: rect.left,
						top: rect.top + (rect.height - lineBoxHeight) / 2,
						width: rect.width,
						height: lineBoxHeight,
					}
				: undefined
		return { visualLines, ownerFrame }
	} finally {
		parent.insertBefore(textNode, wrapper)
		wrapper.remove()
	}
}

/**
 * Map an untransformed direct-text frame to the editable PowerPoint frame.
 * The browser client rect supplies the final transformed element center; the
 * owner offset is transformed as a vector, so the Range AABB is never rotated
 * a second time.
 */
function mapFrameThroughTransform(input: {
	frame: TextFramePx
	untransformedNodeRect: DOMRect
	node: ElementNode
	transform: GlobalTransform
}): TextFramePx {
	const { frame, untransformedNodeRect, node, transform } = input
	const scaleX = Math.abs(transform.scaleX) || 1
	const scaleY = Math.abs(transform.scaleY) || 1
	const radians = transform.rotation * (Math.PI / 180)
	const cos = Math.cos(radians)
	const sin = Math.sin(radians)
	const nodeCenterX = untransformedNodeRect.left + untransformedNodeRect.width / 2
	const nodeCenterY = untransformedNodeRect.top + untransformedNodeRect.height / 2
	const ownerCenterX = frame.left + frame.width / 2
	const ownerCenterY = frame.top + frame.height / 2
	const scaledDx = (ownerCenterX - nodeCenterX) * scaleX
	const scaledDy = (ownerCenterY - nodeCenterY) * scaleY
	const finalNodeCenterX = node.rect.x + node.rect.w / 2
	const finalNodeCenterY = node.rect.y + node.rect.h / 2
	const finalOwnerCenterX = finalNodeCenterX + scaledDx * cos - scaledDy * sin
	const finalOwnerCenterY = finalNodeCenterY + scaledDx * sin + scaledDy * cos
	const width = frame.width * scaleX
	const height = frame.height * scaleY

	return {
		left: finalOwnerCenterX - width / 2,
		top: finalOwnerCenterY - height / 2,
		width,
		height,
	}
}

function buildPlainTextLineRuns(input: {
	lines: TextLine[]
	whiteSpace: string
	textTransform: string
}): Array<PPTTextRun | null> {
	const { lines, whiteSpace, textTransform } = input
	const transformState = { previousIsWord: false }

	return lines.map((line) => {
		const transformedText = transformTextWithFlowContext(
			line.text,
			textTransform,
			transformState,
		)
		const text = normalizeTextByWhiteSpace({
			text: transformedText.replace(/[\r\n]+/g, ""),
			whiteSpace,
		})
		return text ? { text } : null
	})
}

function buildPlainTextRunsFromLineRuns(lineRuns: Array<PPTTextRun | null>): PPTTextRun[] {
	const runs: PPTTextRun[] = []
	for (let lineIndex = 0; lineIndex < lineRuns.length; lineIndex++) {
		const lineRun = lineRuns[lineIndex]
		if (!lineRun) {
			if (lineIndex > 0 || lineRuns.length > 1) {
				runs.push({
					text: "",
					options: lineIndex > 0 ? { softBreakBefore: true } : undefined,
				})
			}
			continue
		}

		runs.push({
			text: lineRun.text,
			options: lineIndex > 0 ? { softBreakBefore: true } : undefined,
		})
	}

	return runs
}

/**
 * A wrapped inline text owner can start its first row after an inline sibling
 * and continue from the container edge on the next row. One PowerPoint text
 * box has only one horizontal anchor, so preserving those rows requires one
 * box per measured visual line. The caller enables this path for inline-rich
 * conversion; legacy callers retain their existing single-box behavior.
 */
function shouldSplitPlainTextVisualLines(input: {
	enabled: boolean
	lines: TextLine[]
	usesElementBox: boolean
	transform: GlobalTransform
	textAlign: "left" | "center" | "right" | "justify" | undefined
}): boolean {
	const { enabled, lines, usesElementBox, transform, textAlign } = input
	if (!enabled || usesElementBox || lines.length < 2) return false
	if (!transform.textSafe || !isIdentityTransform(transform)) return false

	const firstAnchor = resolveVisualLineAnchor(lines[0], textAlign)
	return lines
		.slice(1)
		.some((line) => Math.abs(resolveVisualLineAnchor(line, textAlign) - firstAnchor) > 0.75)
}

function resolveVisualLineAnchor(
	line: TextLine,
	textAlign: "left" | "center" | "right" | "justify" | undefined,
): number {
	if (textAlign === "right") return line.rect.right
	if (textAlign === "center") return (line.rect.left + line.rect.right) / 2
	return line.rect.left
}

function resolvePlainTextFrame(input: {
	node: ElementNode
	lines: TextLine[]
	transform: GlobalTransform
	textStyle: Pick<ElementNode["style"], "lineHeight" | "fontSize">
	usesElementBox: boolean
	measuredOwnerFrame?: TextFramePx
	browserLineHeightPx?: number
}): ResolvedTextFrame {
	const {
		node,
		lines,
		transform,
		textStyle,
		usesElementBox,
		measuredOwnerFrame,
		browserLineHeightPx,
	} = input
	if (!transform.textSafe && usesElementBox) {
		return {
			frame: {
				left: node.rect.x,
				top: node.rect.y,
				width: node.rect.w,
				height: node.rect.h,
			},
			usesElementBox: true,
		}
	}
	const scaleX = Math.abs(transform.scaleX) || 1
	const scaleY = Math.abs(transform.scaleY) || 1
	const transformed =
		Math.abs(transform.rotation) > 0.01 ||
		Math.abs(scaleX - 1) > 0.01 ||
		Math.abs(scaleY - 1) > 0.01

	const untransformedWidth =
		node.layout.layoutWidth ?? (node.layout.offsetWidth || node.rect.w)
	const untransformedHeight =
		node.layout.layoutHeight ?? (node.layout.offsetHeight || node.rect.h)
	const layoutWidth = untransformedWidth * scaleX
	const layoutHeight = untransformedHeight * scaleY
	const centerX = node.rect.x + node.rect.w / 2
	const centerY = node.rect.y + node.rect.h / 2
	const layoutFrame: TextFramePx = transformed
		? {
				left: centerX - layoutWidth / 2,
				top: centerY - layoutHeight / 2,
				width: layoutWidth,
				height: layoutHeight,
			}
		: {
				left: node.rect.x,
				top: node.rect.y,
				width: node.rect.w,
				height: node.rect.h,
			}

	if (usesElementBox) {
		return { frame: layoutFrame, usesElementBox: true }
	}
	if (measuredOwnerFrame) {
		return { frame: measuredOwnerFrame, usesElementBox: false }
	}

	const bounds = unionTextLines(lines)
	if (!bounds) return { frame: layoutFrame, usesElementBox: true }
	const lineHeight =
		(browserLineHeightPx ?? resolveBrowserLineHeightPx(textStyle, lines)) * scaleY
	const height = lineHeight * lines.length
	const measuredTop = bounds.top + (bounds.bottom - bounds.top) / 2 - height / 2
	const canReuseParentLineBox =
		lines.length === 1 &&
		Math.abs(node.rect.h - height) <= 0.5 &&
		Math.abs(node.rect.y - measuredTop) <= 1
	return {
		frame: {
			left: bounds.left,
			top: canReuseParentLineBox ? node.rect.y : measuredTop,
			width: Math.max(0, bounds.right - bounds.left),
			height,
		},
		usesElementBox: false,
	}
}

function resolveBrowserLineHeightPx(
	style: Pick<ElementNode["style"], "lineHeight" | "fontSize">,
	lines: readonly { rect: TextLine["rect"] }[],
): number {
	if (isNormalLineHeight(style.lineHeight)) {
		const measured = measureUniformLineAdvance(lines)
		if (measured !== undefined) return measured
		const firstRect = lines[0]?.rect
		if (firstRect) {
			const rectHeight = firstRect.bottom - firstRect.top
			if (rectHeight > 0) return rectHeight
		}
	}
	return parseLineHeightPx(style.lineHeight, style.fontSize)
}

function resolveExactLineSpacingPx(
	style: Pick<ElementNode["style"], "lineHeight" | "fontSize">,
	lines: readonly { rect: TextLine["rect"] }[],
): number | undefined {
	if (isNormalLineHeight(style.lineHeight)) return measureUniformLineAdvance(lines)
	return parseLineHeightPx(style.lineHeight, style.fontSize)
}

function isNormalLineHeight(lineHeight: string): boolean {
	return !lineHeight || lineHeight === "normal"
}

function isIdentityTransform(transform: {
	rotation: number
	scaleX: number
	scaleY: number
}): boolean {
	return (
		Math.abs(transform.rotation) <= 0.01 &&
		Math.abs(Math.abs(transform.scaleX) - 1) <= 0.01 &&
		Math.abs(Math.abs(transform.scaleY) - 1) <= 0.01
	)
}

function isSoleTextFlowOwner(node: ElementNode, textNodes: Text[]): boolean {
	const whiteSpace = node.style.whiteSpace || "normal"
	if (isAnonymousFlexOrGridTextOwner(node, textNodes, whiteSpace)) return false
	const renderableTextCount = textNodes.filter((textNode) =>
		hasRenderableText({ text: textNode.textContent ?? "", whiteSpace }),
	).length
	if (renderableTextCount !== 1) return false
	if (
		node.children.some(
			(child) =>
				!child.element.textContent?.replace(/\s+/g, "") &&
				child.rect.w > 0 &&
				child.rect.h > 0,
		)
	) {
		return false
	}
	return !node.children.some((child) =>
		hasRenderableText({
			text: child.element.textContent ?? "",
			whiteSpace: child.style.whiteSpace || whiteSpace,
		}),
	)
}

function isAnonymousFlexOrGridTextOwner(
	node: ElementNode,
	textNodes: Text[],
	whiteSpace: string,
): boolean {
	if (!["flex", "inline-flex", "grid", "inline-grid"].includes(node.style.display)) return false
	return textNodes.some((textNode) =>
		hasRenderableText({ text: textNode.textContent ?? "", whiteSpace }),
	)
}

function resolveTextStyleNode(
	textNode: Text,
	root: ElementNode,
	elementNodeMap?: Map<Element, ElementNode>,
): ElementNode {
	let current = textNode.parentElement
	while (current) {
		const mapped = elementNodeMap?.get(current)
		if (mapped) return mapped
		if (current === root.element) break
		current = current.parentElement
	}
	return root
}

function isLayoutPreservingTextHidden(element: Element): boolean {
	const win = element.ownerDocument.defaultView
	if (!win) return false
	if (["hidden", "collapse"].includes(win.getComputedStyle(element).visibility)) return true

	let current: Element | null = element
	let opacity = 1
	while (current) {
		const value = Number.parseFloat(win.getComputedStyle(current).opacity)
		opacity *= Number.isFinite(value) ? value : 1
		if (opacity <= 0) return true
		current = current.parentElement
	}
	return false
}

function unionTextLines(lines: TextLine[]): TextLine["rect"] | null {
	if (lines.length === 0) return null
	return lines.reduce<TextLine["rect"] | null>((bounds, line) => {
		if (!bounds) return { ...line.rect }
		return {
			left: Math.min(bounds.left, line.rect.left),
			right: Math.max(bounds.right, line.rect.right),
			top: Math.min(bounds.top, line.rect.top),
			bottom: Math.max(bounds.bottom, line.rect.bottom),
		}
	}, null)
}

function resolveTextMargins(
	node: ElementNode,
	transform: GlobalTransform,
): [number, number, number, number] {
	const scaleX = transform.textSafe ? Math.abs(transform.scaleX) || 1 : 1
	const scaleY = transform.textSafe ? Math.abs(transform.scaleY) || 1 : 1
	const top = (parseCssPx(node.style.borderTopWidth) + parseCssPx(node.style.paddingTop)) * scaleY
	const right =
		(parseCssPx(node.style.borderRightWidth) + parseCssPx(node.style.paddingRight)) * scaleX
	const bottom =
		(parseCssPx(node.style.borderBottomWidth) + parseCssPx(node.style.paddingBottom)) * scaleY
	const left =
		(parseCssPx(node.style.borderLeftWidth) + parseCssPx(node.style.paddingLeft)) * scaleX
	return [pxToPt(top), pxToPt(right), pxToPt(bottom), pxToPt(left)]
}

function resolveVerticalInsetsPx(node: ElementNode, transform: GlobalTransform): number {
	const scaleY = transform.textSafe ? Math.abs(transform.scaleY) || 1 : 1
	return (
		(parseCssPx(node.style.borderTopWidth) +
			parseCssPx(node.style.paddingTop) +
			parseCssPx(node.style.borderBottomWidth) +
			parseCssPx(node.style.paddingBottom)) *
		scaleY
	)
}

function parseCssPx(value: string): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}
