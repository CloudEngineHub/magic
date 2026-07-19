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
 * Primary-element parser registry: handles IMG / TABLE / VIDEO|AUDIO / CANVAS|SVG and similar elements
 * for primary-element to primary-node dispatch.
 *
 * General style artifacts (background images, shapes, border lines, text) are emitted by the fixed pipeline inside elementToNode,
 * and are not registered here because ordering matters and artifacts affect one another's zOrder.
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
