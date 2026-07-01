import type { ElementNode } from "../ir/dom"
import type { PPTNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import {
	isCanvasOrSvgElement,
	isImageElement,
	isMediaElement,
	isTableElement,
	isLayoutTable,
} from "../shared/element-predicates"
import { parseImage, parseMedia, parseTable } from "../parsers"

export interface ElementParserContext {
	base: PPTNodeBase
	config: SlideConfig
	iWindow: Window
}

export type ElementParser = (
	node: ElementNode,
	ctx: ElementParserContext,
) => PPTNode | PPTNode[] | null | undefined

export interface ElementParserEntry {
	id: string
	test: (node: ElementNode) => boolean
	parse: ElementParser
}

/**
 * 主元素 parser 注册表：负责 IMG / TABLE / VIDEO|AUDIO / CANVAS|SVG 等
 * "主元素 → 主节点"的派发。
 *
 * 通用样式产物（背景图、形状、边框线、文本）由 elementToNode 内的固定流水
 * 顺序产出，不在此注册（顺序敏感、产物互相影响 zOrder）。
 */
const primaryParsers: ElementParserEntry[] = [
	{
		id: "image",
		test: isImageElement,
		parse: (node, { base, config, iWindow }) =>
			parseImage(node, base, config, iWindow),
	},
	{
		id: "table",
		test: (node) => isTableElement(node) && !isLayoutTable(node),
		parse: (node, { base, config, iWindow }) =>
			parseTable(node, base, config, iWindow),
	},
	{
		id: "media",
		test: isMediaElement,
		parse: (node, { base, config, iWindow }) =>
			parseMedia(node, base, config, iWindow),
	},
	{
		id: "canvas-svg",
		test: isCanvasOrSvgElement,
		parse: () => null,
	},
]

export function dispatchPrimaryParsers(
	node: ElementNode,
	ctx: ElementParserContext,
): PPTNode[] {
	const results: PPTNode[] = []
	for (const entry of primaryParsers) {
		if (!entry.test(node)) continue
		const out = entry.parse(node, ctx)
		if (!out) continue
		if (Array.isArray(out)) results.push(...out)
		else results.push(out)
	}
	return results
}
