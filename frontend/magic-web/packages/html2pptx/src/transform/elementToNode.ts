import type { ElementNode } from "../ir/dom"
import type { PPTNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { pxToInch } from "../shared/unit"
import {
	hasBackgroundImage,
	hasMultipleGradientBackgrounds,
	isImageElement,
	hasShapeContent,
} from "../shared/element-predicates"
import { calculateZOrder } from "../collector/sortByZOrder"
import {
	parseShape,
	parseFragmentedShapeNodes,
	parseBorderLines,
	parseImage,
	parseTextNodes,
} from "../parsers"
import { dispatchPrimaryParsers } from "../registry/element-registry"

/**
 * Convert an ElementNode into PPTNode objects
 *
 * Node emission strategy:
 *   1) Primary elements (IMG / TABLE / VIDEO|AUDIO / CANVAS|SVG) -> dispatched by element-registry
 *   2) General style artifacts (background image / shape / per-side border / text) -> appended in fixed pipeline order
 *      (order-sensitive, affects zOrder and overlap between artifacts)
 */
export function elementToNode(
	node: ElementNode,
	config: SlideConfig,
	iWindow: Window,
	options: { elementNodeMap?: Map<Element, ElementNode> } = {},
): PPTNode[] {
	const nodes: PPTNode[] = []
	const { rect } = node

	const base: PPTNodeBase = {
		type: "",
		x: pxToInch(rect.x, config),
		y: pxToInch(rect.y, config),
		w: pxToInch(rect.w, config),
		h: pxToInch(rect.h, config),
		zOrder: calculateZOrder(node),
	}

	const primary = dispatchPrimaryParsers(node, { base, config, iWindow })
	if (primary.length > 0) nodes.push(...primary)

	const isMultiGradientBg = hasMultipleGradientBackgrounds(node.style.backgroundImage)
	const hasBgImage = !isMultiGradientBg && hasBackgroundImage(node)

	if (isMultiGradientBg) {
		// The default implementation does not screenshot-fallback multi-gradient backgrounds; extensions can override this.
	} else if (hasBgImage) {
		const bgImageNode = parseImage(node, { ...base, zOrder: base.zOrder - 1 }, config, iWindow)
		if (bgImageNode) nodes.push(bgImageNode)
	}

	if (hasShapeContent(node)) {
		// CSS paint order: background-color < background-image < content
		// When a background image exists, the shape fill needs a lower zOrder
		const shapeZOrder = hasBgImage ? base.zOrder - 2 : (isImageElement(node) ? base.zOrder - 1 : base.zOrder)
		const shapeBase = { ...base, zOrder: shapeZOrder }
		const fragmentedShapeNodes = isMultiGradientBg ? [] : parseFragmentedShapeNodes(node, shapeBase, config)
		if (fragmentedShapeNodes.length > 0) {
			nodes.push(...fragmentedShapeNodes)
		} else {
			const shapeNode = parseShape(node, shapeBase, config, { skipGradient: isMultiGradientBg })
			if (shapeNode) nodes.push(shapeNode)
		}
	}

	const borderLines = parseBorderLines(node, base, config)
	if (borderLines.length > 0) nodes.push(...borderLines)

	const textBase = { ...base, zOrder: base.zOrder + 1 }
	const textNodes = parseTextNodes(node, textBase, config, {
		elementNodeMap: options.elementNodeMap,
	})
	if (textNodes.length > 0) nodes.push(...textNodes)

	return nodes
}

/**
 * Transform elements in batch
 */
export function transformElements(
	elements: ElementNode[],
	config: SlideConfig,
	iWindow: Window,
	_options: {
		textMergeMode?: unknown
		elementNodeMap?: Map<Element, ElementNode>
	} = {},
): PPTNode[] {
	const allNodes: PPTNode[] = []

	for (const el of elements) {
		const nodes = elementToNode(el, config, iWindow, _options)
		allNodes.push(...nodes)
	}

	return allNodes.sort((a, b) => a.zOrder - b.zOrder)
}
