// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import type { SlideConfig } from "../src/api/options"
import { collectElements, filterRenderable } from "../src/collector"
import type { ElementNode } from "../src/ir/dom"
import { parseTextNodes } from "../src/parsers/parseText"
import {
	canMergeAsInlineRichText,
	parseRichTextNodes,
} from "../enterprise/src/parsers/parseRichText"

const config: SlideConfig = {
	htmlWidth: 1920,
	htmlHeight: 1080,
	slideWidth: 20,
	slideHeight: 11.25,
}

const originalGetClientRects = Range.prototype.getClientRects

afterEach(() => {
	vi.restoreAllMocks()
	Object.defineProperty(Range.prototype, "getClientRects", {
		configurable: true,
		value: originalGetClientRects,
	})
	document.body.innerHTML = ""
})

describe("enterprise rich-text geometry", () => {
	it("uses the HTML owner box instead of Range glyph bounds", () => {
		document.body.innerHTML = "<span>计数器机制</span>"
		const element = document.body.firstElementChild as HTMLSpanElement
		const node = createElementNode(element, {
			x: 197,
			y: 465,
			w: 100,
			h: 28,
		})
		installRangeMeasurer(() => [rect(197, 467, 297, 490)])

		const result = parseRichTextNodes(
			node,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{ elementNodeMap: new Map([[element, node]]) },
		)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			x: 197 / 96,
			y: 465 / 96,
			w: 100 / 96,
			h: 28 / 96,
			wrap: false,
			valign: "middle",
			margin: [0, 0, 0, 0],
		})
		expect(result[0].lineSpacing).toBeUndefined()
		expect(result[0].lineSpacingPt).toBeUndefined()
		expect(result[0].text).toEqual([expect.objectContaining({ text: "计数器机制" })])

		const narrowSlide = parseRichTextNodes(
			node,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			{ ...config, slideWidth: 10 },
			{ elementNodeMap: new Map([[element, node]]) },
		)[0]
		expect(narrowSlide.x).toBe(197 / 96)
		expect(narrowSlide.w).toBe(100 / 96)
		expect(narrowSlide.fontSize).toBe(15)
	})

	it("keeps two browser lines in one box with an explicit soft break", () => {
		const text = "alpha beta gamma delta"
		document.body.innerHTML = `<span>${text}</span>`
		const element = document.body.firstElementChild as HTMLSpanElement
		const node = createElementNode(
			element,
			{ x: 30, y: 40, w: 120, h: 56 },
			{ lineHeight: "28px", fontSize: 20 },
		)
		const breakOffset = "alpha beta ".length
		installRangeMeasurer((range) => {
			const end = range.endOffset
			if (end <= breakOffset) return [rect(30, 42, 130, 65)]
			return [rect(30, 42, 130, 65), rect(30, 70, 132, 93)]
		})

		const result = parseRichTextNodes(
			node,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{ elementNodeMap: new Map([[element, node]]) },
		)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			x: 30 / 96,
			y: 40 / 96,
			w: 120 / 96,
			h: 56 / 96,
			wrap: false,
			valign: "top",
			lineSpacingPt: 21,
		})
		const runs = result[0].text
		expect(Array.isArray(runs)).toBe(true)
		if (!Array.isArray(runs)) throw new Error("rich text runs expected")
		expect(runs).toHaveLength(2)
		expect(runs[0].text.trim()).toBe("alpha beta")
		expect(runs[1].text.trim()).toBe("gamma delta")
		expect(runs[1].options?.softBreakBefore).toBe(true)
	})

	it("measures normal line-height from browser visual-line advances", () => {
		document.body.innerHTML = "<div>ABCDEFGH</div>"
		const element = document.body.firstElementChild as HTMLDivElement
		const node = createElementNode(
			element,
			{ x: 30, y: 40, w: 100, h: 46 },
			{ display: "block", lineHeight: "normal", fontSize: 20 },
		)
		installRangeMeasurer((range) =>
			range.endOffset <= 4
				? [rect(30, 40, 90, 62)]
				: [rect(30, 40, 90, 62), rect(30, 63, 92, 85)],
		)
		const base = { type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 }

		const plain = parseTextNodes(node, base, config)[0]
		const rich = parseRichTextNodes(node, base, config, {
			elementNodeMap: new Map([[element, node]]),
		})[0]

		expect(plain.lineSpacingPt).toBe(17.25)
		expect(rich.lineSpacingPt).toBe(17.25)
	})

	it("keeps ordinary single-line text at the top of a tall block", () => {
		document.body.innerHTML = "<div>Top aligned</div>"
		const element = document.body.firstElementChild as HTMLDivElement
		const node = createElementNode(
			element,
			{ x: 20, y: 30, w: 200, h: 100 },
			{ display: "block", lineHeight: "28px" },
		)
		installRangeMeasurer(() => [rect(20, 32, 120, 55)])

		const result = parseRichTextNodes(
			node,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{ elementNodeMap: new Map([[element, node]]) },
		)

		expect(result[0].valign).toBe("top")
	})

	it("does not apply parent flex alignment inside the child text box twice", () => {
		document.body.innerHTML = "<div><div>Child text</div></div>"
		const parent = document.body.firstElementChild as HTMLDivElement
		const child = parent.firstElementChild as HTMLDivElement
		const childNode = createElementNode(
			child,
			{ x: 20, y: 80, w: 200, h: 100 },
			{ display: "block", lineHeight: "20px" },
		)
		const parentNode = createElementNode(
			parent,
			{ x: 20, y: 30, w: 200, h: 200 },
			{ display: "flex", alignItems: "center" },
			[childNode],
		)
		childNode.parent = parentNode
		installRangeMeasurer(() => [rect(20, 82, 100, 99)])

		const result = parseRichTextNodes(
			childNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{
				elementNodeMap: new Map([
					[parent, parentNode],
					[child, childNode],
				]),
			},
		)

		expect(result[0].y * 96).toBe(80)
		expect(result[0].valign).toBe("top")
	})

	it("does not let a flex row consume the text beside an independent icon", () => {
		document.body.innerHTML = "<div><i><img></i><span>计数器机制</span></div>"
		const row = document.body.firstElementChild as HTMLDivElement
		const icon = row.children[0] as HTMLElement
		const label = row.children[1] as HTMLSpanElement
		const iconNode = createElementNode(icon, { x: 167, y: 470, w: 18, h: 18 })
		const labelNode = createElementNode(
			label,
			{ x: 197, y: 465, w: 100, h: 28 },
			{ display: "inline" },
		)
		const rowNode = createElementNode(
			row,
			{ x: 167, y: 465, w: 752, h: 28 },
			{ display: "flex" },
			[iconNode, labelNode],
		)
		iconNode.parent = rowNode
		labelNode.parent = rowNode

		expect(canMergeAsInlineRichText(rowNode)).toBe(false)
		expect(canMergeAsInlineRichText(labelNode)).toBe(true)
	})

	it("uses measured text geometry for an anonymous flex text item", () => {
		document.body.innerHTML = '<div style="display:flex;justify-content:flex-end">Aligned</div>'
		const row = document.body.firstElementChild as HTMLDivElement
		const rowNode = createElementNode(
			row,
			{ x: 10, y: 10, w: 200, h: 40 },
			{
				display: "flex",
				justifyContent: "flex-end",
				fontSize: 20,
				lineHeight: "28px",
			},
		)
		installRangeMeasurer(() => [rect(150, 18, 210, 41)])

		expect(canMergeAsInlineRichText(rowNode)).toBe(false)
		const result = parseTextNodes(
			rowNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
		)

		expect(result).toHaveLength(1)
		expect(result[0].x * 96).toBe(150)
		expect(result[0].w * 96).toBe(60)
		expect(result[0].margin).toEqual([0, 0, 0, 0])
	})

	it("does not merge across a replaced element nested inside a text-bearing span", () => {
		document.body.innerHTML = "<p>A<span>B<img>C</span>D</p>"
		const paragraph = document.body.firstElementChild as HTMLParagraphElement
		const span = paragraph.firstElementChild as HTMLSpanElement
		const image = span.firstElementChild as HTMLImageElement
		const imageNode = createElementNode(image, { x: 40, y: 10, w: 24, h: 20 })
		const spanNode = createElementNode(
			span,
			{ x: 20, y: 10, w: 80, h: 28 },
			{ display: "inline" },
			[imageNode],
		)
		const paragraphNode = createElementNode(
			paragraph,
			{ x: 10, y: 10, w: 180, h: 28 },
			{ display: "block" },
			[spanNode],
		)
		imageNode.parent = spanNode
		spanNode.parent = paragraphNode

		expect(canMergeAsInlineRichText(paragraphNode)).toBe(false)
		expect(canMergeAsInlineRichText(spanNode)).toBe(false)
	})

	it("skips display-none text and preserves hidden inline advance widths", () => {
		document.body.innerHTML =
			'<div>visible<span style="display:none"><b>secret</b></span><span style="visibility:hidden">ghost</span><span style="opacity:0"><b>transparent</b></span>end</div>'
		const root = document.body.firstElementChild as HTMLDivElement
		const visibilityHidden = root.children[1] as HTMLSpanElement
		const hiddenNode = createElementNode(
			visibilityHidden,
			{ x: 60, y: 10, w: 40, h: 20 },
			{ visibility: "hidden" },
		)
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 180, h: 28 },
			{ display: "block" },
			[hiddenNode],
		)
		hiddenNode.parent = rootNode
		installRangeMeasurer((range) => {
			const text = range.startContainer.textContent ?? ""
			if (text === "visible") return [rect(10, 12, 55, 35)]
			if (text === "end") return [rect(55, 12, 80, 35)]
			return [rect(80, 12, 120, 35)]
		})

		const result = parseRichTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{
				elementNodeMap: new Map([
					[root, rootNode],
					[visibilityHidden, hiddenNode],
				]),
			},
		)

		expect(result).toHaveLength(1)
		const runs = result[0].text
		expect(Array.isArray(runs)).toBe(true)
		if (!Array.isArray(runs)) throw new Error("rich text runs expected")
		expect(runs.map((run) => run.text).join("")).toBe("visibleghosttransparentend")
		expect(runs.find((run) => run.text.includes("ghost"))?.options?.transparency).toBe(100)
		expect(runs.find((run) => run.text.includes("transparent"))?.options?.transparency).toBe(
			100,
		)
		expect(runs.find((run) => run.text === "visible")?.options?.transparency).toBeUndefined()
		expect(runs.find((run) => run.text === "end")?.options?.transparency).toBeUndefined()
	})

	it("does not export a content-visibility-hidden rich-text root", () => {
		document.body.innerHTML = "<div>hidden subtree</div>"
		const root = document.body.firstElementChild as HTMLDivElement
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 180, h: 28 },
			{ display: "block", contentVisibility: "hidden" },
		)
		installRangeMeasurer(() => [rect(10, 12, 120, 35)])

		expect(
			parseRichTextNodes(
				rootNode,
				{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
				config,
				{ elementNodeMap: new Map([[root, rootNode]]) },
			),
		).toEqual([])
	})

	it("collects display-contents style owners without drawing them independently", () => {
		document.body.innerHTML =
			'<div style="display:flex;justify-content:flex-end"><span style="display:contents;color:rgb(255, 0, 0)">red</span></div>'
		const root = document.body.firstElementChild as HTMLDivElement
		const contents = root.firstElementChild as HTMLSpanElement
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
			this: HTMLElement,
		) {
			if (this === document.body) return rect(0, 0, 500, 500)
			if (this === root) return rect(10, 10, 110, 38)
			return rect(0, 0, 0, 0)
		})

		const collected = collectElements(document, window)
		const rootNode = collected.find((node) => node.element === root)
		const contentsNode = collected.find((node) => node.element === contents)
		expect(rootNode).toBeDefined()
		expect(contentsNode).toMatchObject({
			rect: { w: 0, h: 0 },
			style: { display: "contents", color: "rgb(255, 0, 0)" },
			parent: rootNode,
		})
		expect(rootNode?.children).not.toContain(contentsNode)
		const renderableElements = filterRenderable(collected).map((node) => node.element)
		expect(renderableElements).toContain(root)
		expect(renderableElements).not.toContain(contents)
		if (!rootNode) throw new Error("root node expected")

		installRangeMeasurer(() => [rect(85, 12, 110, 35)])
		const elementNodeMap = new Map(collected.map((node) => [node.element, node]))

		expect(canMergeAsInlineRichText(rootNode)).toBe(false)
		const result = parseTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{ elementNodeMap },
		)

		expect(result[0].text).toBe("red")
		expect(result[0].color).toBe("FF0000")
		expect(result[0].x * 96).toBe(85)
		expect(result[0].w * 96).toBe(25)
		expect(result[0].margin).toEqual([0, 0, 0, 0])
	})

	it("exports display-contents text independently beside a visual flex child", () => {
		document.body.innerHTML =
			'<div style="display:flex"><i></i><span style="display:contents;color:rgb(255, 0, 0);font-size:40px;line-height:48px">label</span></div>'
		const root = document.body.firstElementChild as HTMLDivElement
		const icon = root.firstElementChild as HTMLElement
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
			this: HTMLElement,
		) {
			if (this === document.body) return rect(0, 0, 500, 500)
			if (this === root) return rect(10, 10, 210, 50)
			if (this === icon) return rect(10, 10, 30, 30)
			return rect(0, 0, 0, 0)
		})
		installRangeMeasurer(() => [rect(40, 12, 125, 56)])

		const collected = collectElements(document, window)
		const rootNode = collected.find((node) => node.element === root)
		if (!rootNode) throw new Error("flex root node expected")
		const elementNodeMap = new Map(collected.map((node) => [node.element, node]))

		expect(canMergeAsInlineRichText(rootNode)).toBe(false)
		const result = parseTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{ elementNodeMap },
		)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({ text: "label", color: "FF0000", fontSize: 30 })
		expect(result[0].x * 96).toBe(40)
		expect(result[0].w * 96).toBe(85)
		expect(result[0].h * 96).toBe(48)
	})

	it("keeps a collapsed space between differently styled runs", () => {
		document.body.innerHTML = "<div><strong>Hello</strong> <em>world</em></div>"
		const root = document.body.firstElementChild as HTMLDivElement
		const strong = root.children[0] as HTMLElement
		const emphasis = root.children[1] as HTMLElement
		const strongNode = createElementNode(
			strong,
			{ x: 10, y: 10, w: 45, h: 28 },
			{ display: "inline", fontWeight: "700" },
		)
		const emphasisNode = createElementNode(
			emphasis,
			{ x: 59, y: 10, w: 42, h: 28 },
			{ display: "inline", fontStyle: "italic" },
		)
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 100, h: 28 },
			{ display: "block" },
			[strongNode, emphasisNode],
		)
		strongNode.parent = rootNode
		emphasisNode.parent = rootNode
		installRangeMeasurer((range) => {
			const text = range.startContainer.textContent ?? ""
			if (text === "Hello") return [rect(10, 12, 55, 35)]
			if (text === "world") return [rect(59, 12, 101, 35)]
			return []
		})

		const result = parseRichTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{
				elementNodeMap: new Map([
					[root, rootNode],
					[strong, strongNode],
					[emphasis, emphasisNode],
				]),
			},
		)

		const runs = result[0].text
		expect(Array.isArray(runs)).toBe(true)
		if (!Array.isArray(runs)) throw new Error("rich text runs expected")
		expect(runs.map((run) => run.text).join("")).toBe("Hello world")
		expect(runs.some((run) => run.text === " ")).toBe(true)
	})

	it("honors descendant pre whitespace and does not collapse non-breaking spaces", () => {
		document.body.innerHTML = '<div>A<span style="white-space:pre">  B\u00a0C</span>D</div>'
		const root = document.body.firstElementChild as HTMLDivElement
		const span = root.firstElementChild as HTMLSpanElement
		const spanNode = createElementNode(
			span,
			{ x: 20, y: 10, w: 70, h: 28 },
			{ display: "inline", whiteSpace: "pre" },
		)
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 100, h: 28 },
			{ display: "block", whiteSpace: "normal" },
			[spanNode],
		)
		spanNode.parent = rootNode
		installRangeMeasurer((range) => {
			const text = range.startContainer.textContent ?? ""
			if (text === "A") return [rect(10, 12, 18, 35)]
			if (text === "D") return [rect(90, 12, 98, 35)]
			return [rect(18, 12, 90, 35)]
		})

		const result = parseRichTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{
				elementNodeMap: new Map([
					[root, rootNode],
					[span, spanNode],
				]),
			},
		)

		const runs = result[0].text
		expect(Array.isArray(runs)).toBe(true)
		if (!Array.isArray(runs)) throw new Error("rich text runs expected")
		expect(runs.map((run) => run.text).join("")).toBe("A  B\u00a0CD")
	})

	it("does not capitalize a word again at a soft visual-line boundary", () => {
		document.body.innerHTML = "<div>abcdef</div>"
		const root = document.body.firstElementChild as HTMLDivElement
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 60, h: 40 },
			{ display: "block", textTransform: "capitalize", lineHeight: "20px" },
		)
		installRangeMeasurer((range) =>
			range.endOffset <= 3
				? [rect(10, 10, 50, 30)]
				: [rect(10, 10, 50, 30), rect(10, 30, 50, 50)],
		)

		const result = parseTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
		)[0]

		expect(Array.isArray(result.text)).toBe(true)
		if (!Array.isArray(result.text)) throw new Error("visual-line runs expected")
		expect(result.text.map((run) => run.text)).toEqual(["Abc", "def"])
	})

	it("keeps capitalize word state across styled inline fragments", () => {
		document.body.innerHTML = "<div><span>abc</span><em>def</em></div>"
		const root = document.body.firstElementChild as HTMLDivElement
		const span = root.children[0] as HTMLSpanElement
		const emphasis = root.children[1] as HTMLElement
		const spanNode = createElementNode(
			span,
			{ x: 10, y: 10, w: 30, h: 28 },
			{ display: "inline", textTransform: "capitalize" },
		)
		const emphasisNode = createElementNode(
			emphasis,
			{ x: 40, y: 10, w: 30, h: 28 },
			{ display: "inline", textTransform: "capitalize", fontStyle: "italic" },
		)
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 60, h: 28 },
			{ display: "block", textTransform: "capitalize" },
			[spanNode, emphasisNode],
		)
		spanNode.parent = rootNode
		emphasisNode.parent = rootNode
		installRangeMeasurer((range) =>
			(range.startContainer.textContent ?? "") === "abc"
				? [rect(10, 12, 40, 35)]
				: [rect(40, 12, 70, 35)],
		)

		const result = parseRichTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{
				elementNodeMap: new Map([
					[root, rootNode],
					[span, spanNode],
					[emphasis, emphasisNode],
				]),
			},
		)[0]

		expect(Array.isArray(result.text)).toBe(true)
		if (!Array.isArray(result.text)) throw new Error("rich text runs expected")
		expect(result.text.map((run) => run.text).join("")).toBe("Abcdef")
	})

	it("does not force the root line height onto mixed-size visual lines", () => {
		document.body.innerHTML = "<div>small<br><span>BIG</span><br>small</div>"
		const root = document.body.firstElementChild as HTMLDivElement
		const big = root.querySelector("span") as HTMLSpanElement
		const bigNode = createElementNode(
			big,
			{ x: 10, y: 30, w: 70, h: 48 },
			{ display: "inline", fontSize: 40, lineHeight: "48px" },
		)
		const rootNode = createElementNode(
			root,
			{ x: 10, y: 10, w: 200, h: 88 },
			{ display: "block", fontSize: 16, lineHeight: "20px" },
			[bigNode],
		)
		bigNode.parent = rootNode
		installRangeMeasurer((range) => {
			const text = range.startContainer.textContent ?? ""
			if (text === "BIG") return [rect(10, 32, 79, 76)]
			return text === "small" && range.startContainer === root.firstChild
				? [rect(10, 11, 48, 28)]
				: [rect(10, 79, 48, 96)]
		})

		const result = parseRichTextNodes(
			rootNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{
				elementNodeMap: new Map([
					[root, rootNode],
					[big, bigNode],
				]),
			},
		)

		expect(result).toHaveLength(1)
		expect(result[0].lineSpacingPt).toBeUndefined()
	})

	it("uses a zero-margin CSS line box for direct text beside a padded icon", () => {
		document.body.innerHTML = "<div><i></i>Video label</div>"
		const row = document.body.firstElementChild as HTMLDivElement
		const icon = row.firstElementChild as HTMLElement
		const iconNode = createElementNode(icon, { x: 1290, y: 187, w: 24, h: 24 })
		const rowNode = createElementNode(
			row,
			{ x: 1276.5, y: 171, w: 303, h: 58 },
			{
				display: "flex",
				fontSize: 24,
				lineHeight: "33px",
				paddingTop: "12px",
				paddingRight: "20px",
				paddingBottom: "12px",
				paddingLeft: "20px",
				borderBottomWidth: "1px",
			},
			[iconNode],
		)
		iconNode.parent = rowNode
		installRangeMeasurer(() => [rect(1324, 186, 1450, 212)])

		const result = parseTextNodes(
			rowNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
			{ mergeVisualLines: true },
		)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			x: 1324 / 96,
			y: 182.5 / 96,
			w: 126 / 96,
			h: 33 / 96,
			margin: [0, 0, 0, 0],
			wrap: false,
			valign: "middle",
		})
	})

	it("does not give every direct text fragment the full parent box", () => {
		document.body.innerHTML = "<p>Hello <strong>world</strong>!</p>"
		const paragraph = document.body.firstElementChild as HTMLParagraphElement
		const strong = paragraph.firstElementChild as HTMLElement
		const strongNode = createElementNode(strong, { x: 60, y: 10, w: 40, h: 28 })
		const paragraphNode = createElementNode(
			paragraph,
			{ x: 10, y: 10, w: 200, h: 28 },
			{ display: "block" },
			[strongNode],
		)
		strongNode.parent = paragraphNode
		installRangeMeasurer((range) =>
			(range.startContainer.textContent ?? "").includes("Hello")
				? [rect(10, 12, 60, 35)]
				: [rect(100, 12, 110, 35)],
		)

		const result = parseTextNodes(
			paragraphNode,
			{ type: "", x: 0, y: 0, w: 0, h: 0, zOrder: 3 },
			config,
		)

		expect(result).toHaveLength(2)
		expect(result.map((node) => [node.x * 96, node.w * 96])).toEqual([
			[10, 50],
			[100, 10],
		])
		expect(result.every((node) => node.h * 96 === 28)).toBe(true)
		expect(result.every((node) => node.margin?.every((value) => value === 0))).toBe(true)
	})
})

function installRangeMeasurer(measure: (range: Range) => DOMRect[]): void {
	Object.defineProperty(Range.prototype, "getClientRects", {
		configurable: true,
		value(this: Range) {
			return measure(this)
		},
	})
}

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
	return {
		left,
		top,
		right,
		bottom,
		x: left,
		y: top,
		width: right - left,
		height: bottom - top,
		toJSON: () => ({}),
	} as DOMRect
}

function createElementNode(
	element: Element,
	rectValue: { x: number; y: number; w: number; h: number },
	styleOverrides: Partial<ElementNode["style"]> = {},
	children: ElementNode[] = [],
): ElementNode {
	return {
		id: `test-${element.tagName.toLowerCase()}`,
		tagName: element.tagName,
		element,
		rect: rectValue,
		layout: { offsetWidth: rectValue.w, offsetHeight: rectValue.h },
		style: {
			backgroundColor: "rgba(0, 0, 0, 0)",
			backgroundImage: "none",
			backgroundSize: "auto",
			backgroundPosition: "0% 0%",
			backgroundRepeat: "repeat",
			backgroundClip: "border-box",
			objectFit: "fill",
			objectPosition: "50% 50%",
			borderRadius: "0px",
			borderWidth: "0px",
			borderColor: "rgb(0, 0, 0)",
			borderStyle: "none",
			borderTopWidth: "0px",
			borderRightWidth: "0px",
			borderBottomWidth: "0px",
			borderLeftWidth: "0px",
			borderTopColor: "rgb(0, 0, 0)",
			borderRightColor: "rgb(0, 0, 0)",
			borderBottomColor: "rgb(0, 0, 0)",
			borderLeftColor: "rgb(0, 0, 0)",
			borderTopStyle: "none",
			borderRightStyle: "none",
			borderBottomStyle: "none",
			borderLeftStyle: "none",
			color: "rgb(0, 0, 0)",
			fontSize: 20,
			fontFamily: "Arial",
			fontWeight: "400",
			fontStyle: "normal",
			textAlign: "start",
			textDecoration: "none",
			whiteSpace: "normal",
			lineHeight: "28px",
			letterSpacing: "normal",
			verticalAlign: "baseline",
			paddingTop: "0px",
			paddingRight: "0px",
			paddingBottom: "0px",
			paddingLeft: "0px",
			marginTop: "0px",
			marginRight: "0px",
			marginBottom: "0px",
			marginLeft: "0px",
			display: "inline",
			position: "static",
			opacity: "1",
			visibility: "visible",
			overflow: "visible",
			zIndex: "auto",
			alignItems: "normal",
			justifyContent: "normal",
			alignContent: "normal",
			alignSelf: "auto",
			flexDirection: "row",
			boxShadow: "none",
			textShadow: "none",
			transform: "none",
			filter: "none",
			clipPath: "none",
			textTransform: "none",
			...styleOverrides,
		},
		textContent: element.textContent,
		children,
		parent: null,
		depth: 1,
		zIndex: 0,
		domOrder: 1,
	}
}
