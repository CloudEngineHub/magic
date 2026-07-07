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
 * 将 ElementNode 转换为 PPTNode 数组
 *
 * 节点产出策略：
 *   1) 主元素（IMG / TABLE / VIDEO|AUDIO / CANVAS|SVG）→ 由 element-registry 派发
 *   2) 通用样式产物（背景图 / 形状 / 单边边框 / 文本）→ 固定流水顺序追加
 *      （顺序敏感，会影响 zOrder 与多产物互相覆盖关系）
 */
export function elementToNode(
	node: ElementNode,
	config: SlideConfig,
	iWindow: Window,
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
		// 默认实现不对多重渐变做截图降级，扩展实现可覆盖该逻辑。
	} else if (hasBgImage) {
		const bgImageNode = parseImage(node, { ...base, zOrder: base.zOrder - 1 }, config, iWindow)
		if (bgImageNode) nodes.push(bgImageNode)
	}

	if (hasShapeContent(node)) {
		// CSS 渲染顺序：background-color < background-image < content
		// 有背景图时，shape (fill) 需要更低的 zOrder
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
	const textNodes = parseTextNodes(node, textBase, config)
	if (textNodes.length > 0) nodes.push(...textNodes)

	return nodes
}

/**
 * 批量转换元素
 */
export function transformElements(
	elements: ElementNode[],
	config: SlideConfig,
	iWindow: Window,
	_options: { textMergeMode?: unknown } = {},
): PPTNode[] {
	const allNodes: PPTNode[] = []

	for (const el of elements) {
		const nodes = elementToNode(el, config, iWindow)
		allNodes.push(...nodes)
	}

	return allNodes.sort((a, b) => a.zOrder - b.zOrder)
}
