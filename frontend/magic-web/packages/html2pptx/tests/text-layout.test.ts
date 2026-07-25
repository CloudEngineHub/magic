// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import {
	groupRectsByVisualLine,
	measureTextFlow,
	measureTextNodeVisualFragments,
	type TextLayoutRect,
} from "../src/parsers/text/layout"

function rect(left: number, right: number, top: number, bottom: number): TextLayoutRect {
	return { left, right, top, bottom }
}

describe("text flow layout", () => {
	it("keeps a single rendered Text node as one fragment", () => {
		const root = document.createElement("div")
		const textNode = document.createTextNode("单行文本")
		root.append(textNode)

		const layout = measureTextFlow(root, {
			measureRange: () => [rect(10, 74, 20, 40)],
		})

		expect(layout.fragments).toHaveLength(1)
		expect(layout.fragments[0]).toMatchObject({
			text: "单行文本",
			startOffset: 0,
			endOffset: 4,
			rect: rect(10, 74, 20, 40),
		})
		expect(layout.lines).toHaveLength(1)
		expect(layout.lines[0].breakAfter).toBeUndefined()
	})

	it("collects nested styled text and keeps BR as an explicit break", () => {
		const root = document.createElement("div")
		root.innerHTML = "alpha <strong>beta</strong><br><em>gamma</em>"
		const textRects = new Map<Text, TextLayoutRect>()
		const textNodes = Array.from(root.querySelectorAll("strong, em")).map(
			(element) => element.firstChild as Text,
		)
		textRects.set(root.firstChild as Text, rect(0, 38, 6, 18))
		textRects.set(textNodes[0], rect(38, 78, 0, 24))
		textRects.set(textNodes[1], rect(0, 45, 30, 48))

		const layout = measureTextFlow(root, {
			measureRange: (textNode) => {
				const value = textRects.get(textNode)
				return value ? [value] : []
			},
		})

		expect(layout.fragments.map((fragment) => fragment.text)).toEqual([
			"alpha ",
			"beta",
			"gamma",
		])
		expect(layout.fragments[1].styleOwner.tagName).toBe("STRONG")
		expect(layout.lines).toHaveLength(2)
		expect(layout.lines[0].fragments.map((fragment) => fragment.text)).toEqual([
			"alpha ",
			"beta",
		])
		expect(layout.lines[0].breakAfter).toBe("explicit")
		expect(layout.lines[1].fragments[0].text).toBe("gamma")
		expect(layout.lines[0].rect).toEqual(rect(0, 78, 0, 24))
	})

	it("groups different inline rect heights by overlap, not exact top equality", () => {
		const root = document.createElement("div")
		root.innerHTML = "<span>small</span><strong>large</strong><i>next</i>"
		const nodes = Array.from(root.children).map((element) => element.firstChild as Text)
		const values = new Map<Text, TextLayoutRect>([
			[nodes[0], rect(0, 35, 6, 18)],
			[nodes[1], rect(35, 85, 0, 24)],
			[nodes[2], rect(0, 30, 28, 46)],
		])

		const layout = measureTextFlow(root, {
			measureRange: (textNode) => {
				const value = values.get(textNode)
				return value ? [value] : []
			},
		})

		expect(layout.lines).toHaveLength(2)
		expect(layout.lines[0].fragments.map((fragment) => fragment.text)).toEqual([
			"small",
			"large",
		])
		expect(layout.lines[0].breakAfter).toBe("soft")
		expect(layout.lines[1].fragments[0].text).toBe("next")
	})

	it("keeps baseline-aligned mixed font sizes on the same visual line", () => {
		const root = document.createElement("div")
		root.innerHTML = "<span>small</span><strong>large</strong>"
		const nodes = Array.from(root.children).map((element) => element.firstChild as Text)
		const values = new Map<Text, TextLayoutRect>([
			[nodes[0], rect(0, 35, 24, 42)],
			[nodes[1], rect(35, 95, 0, 47)],
		])

		const layout = measureTextFlow(root, {
			measureRange: (textNode) => {
				const value = values.get(textNode)
				return value ? [value] : []
			},
		})

		expect(layout.lines).toHaveLength(1)
		expect(layout.lines[0].fragments.map((fragment) => fragment.text)).toEqual([
			"small",
			"large",
		])
	})

	it("keeps a vertically shifted superscript in the same inline flow", () => {
		const root = document.createElement("div")
		root.innerHTML = "<span>normal</span><sup>2</sup>"
		const nodes = Array.from(root.children).map((element) => element.firstChild as Text)
		const values = new Map<Text, TextLayoutRect>([
			[nodes[0], rect(0, 50, 10, 30)],
			[nodes[1], rect(50, 60, 5, 20)],
		])

		const layout = measureTextFlow(root, {
			measureRange: (textNode) => {
				const value = values.get(textNode)
				return value ? [value] : []
			},
		})

		expect(layout.lines).toHaveLength(1)
		expect(layout.lines[0].fragments.map((fragment) => fragment.text).join("")).toBe(
			"normal2",
		)
	})

	it("separates a wrapped small run even when a tall preceding row contains it", () => {
		const root = document.createElement("div")
		root.innerHTML = "<strong>large</strong><span>next</span>"
		const nodes = Array.from(root.children).map((element) => element.firstChild as Text)
		const values = new Map<Text, TextLayoutRect>([
			[nodes[0], rect(0, 95, 0, 47)],
			[nodes[1], rect(0, 35, 12, 30)],
		])

		const layout = measureTextFlow(root, {
			measureRange: (textNode) => {
				const value = values.get(textNode)
				return value ? [value] : []
			},
		})

		expect(layout.lines).toHaveLength(2)
		expect(layout.lines[0].breakAfter).toBe("soft")
		expect(layout.lines[1].fragments[0].text).toBe("next")
	})

	it("locks a wrapped text node to grapheme-safe DOM offsets", () => {
		const root = document.createElement("div")
		const textNode = document.createTextNode("😀abc")
		root.append(textNode)

		const layout = measureTextNodeVisualFragments({
			textNode,
			styleOwner: root,
			lineTolerancePx: 0.75,
			minimumOverlapRatio: 0.45,
			measureRange: (_node, _start, end) =>
				end <= 2 ? [rect(0, 20, 0, 20)] : [rect(0, 20, 0, 20), rect(0, 25, 20, 40)],
		})

		expect(layout.map((fragment) => fragment.text)).toEqual(["😀", "abc"])
		expect(layout.map((fragment) => [fragment.startOffset, fragment.endOffset])).toEqual([
			[0, 2],
			[2, 5],
		])
	})

	it("finds a Chinese soft-wrap offset with prefix measurements", () => {
		const root = document.createElement("div")
		const textNode = document.createTextNode("中文测试文本")
		root.append(textNode)

		const fragments = measureTextNodeVisualFragments({
			textNode,
			styleOwner: root,
			lineTolerancePx: 0.75,
			minimumOverlapRatio: 0.45,
			measureRange: (_node, _start, end) =>
				end <= 4 ? [rect(0, 64, 0, 24)] : [rect(0, 64, 0, 24), rect(0, 32, 24, 48)],
		})

		expect(fragments.map((fragment) => fragment.text)).toEqual(["中文测试", "文本"])
		expect(fragments[1].startOffset).toBe(4)
	})

	it("does not split a combining grapheme at a visual-line boundary", () => {
		const root = document.createElement("div")
		const textNode = document.createTextNode("e\u0301abc")
		root.append(textNode)

		const fragments = measureTextNodeVisualFragments({
			textNode,
			styleOwner: root,
			lineTolerancePx: 0.75,
			minimumOverlapRatio: 0.45,
			measureRange: (_node, _start, end) =>
				end <= 2 ? [rect(0, 12, 0, 20)] : [rect(0, 12, 0, 20), rect(0, 24, 20, 40)],
		})

		expect(fragments.map((fragment) => fragment.text)).toEqual(["e\u0301", "abc"])
		expect(fragments[1].startOffset).toBe(2)
	})

	it("supports skipped subtrees and consecutive BR lines", () => {
		const root = document.createElement("div")
		root.innerHTML = "a<span data-skip>ignored</span><br><br>b"
		const values = new Map<Text, TextLayoutRect>()
		for (const textNode of Array.from(root.childNodes).filter(
			(node): node is Text => node.nodeType === Node.TEXT_NODE,
		)) {
			values.set(
				textNode,
				textNode.textContent === "a" ? rect(0, 8, 0, 16) : rect(0, 8, 32, 48),
			)
		}

		const layout = measureTextFlow(root, {
			elementPolicy: (element) =>
				element.hasAttribute("data-skip")
					? "skip"
					: element.tagName === "BR"
						? "explicit-break"
						: "traverse",
			measureRange: (textNode) => {
				const value = values.get(textNode)
				return value ? [value] : []
			},
		})

		expect(layout.fragments.map((fragment) => fragment.text)).toEqual(["a", "b"])
		expect(layout.lines).toHaveLength(3)
		expect(layout.lines[0].breakAfter).toBe("explicit")
		expect(layout.lines[1].fragments).toEqual([])
		expect(layout.lines[1].breakAfter).toBe("explicit")
	})

	it("retains collapsed whitespace fragments without a client rect", () => {
		const root = document.createElement("div")
		root.innerHTML = "<span>a</span> <span>b</span>"
		const first = root.children[0].firstChild as Text
		const whitespace = root.childNodes[1] as Text
		const second = root.children[1].firstChild as Text

		const layout = measureTextFlow(root, {
			measureRange: (textNode) => {
				if (textNode === first) return [rect(0, 8, 0, 16)]
				if (textNode === second) return [rect(12, 20, 0, 16)]
				if (textNode === whitespace) return []
				return []
			},
		})

		expect(layout.fragments.map((fragment) => fragment.text)).toEqual(["a", " ", "b"])
		expect(layout.fragments[1].rect).toBeUndefined()
		expect(layout.lines).toHaveLength(1)
		expect(layout.lines[0].fragments.map((fragment) => fragment.text).join("")).toBe("a b")
	})

	it("does not merge adjacent rows when line boxes overlap only slightly", () => {
		expect(groupRectsByVisualLine([rect(0, 20, 0, 20), rect(0, 20, 16, 36)])).toHaveLength(2)
	})

	it("does not merge tightly spaced large-font rows with heavy vertical overlap", () => {
		const rows = groupRectsByVisualLine([
			rect(0, 160, 0, 47),
			rect(0, 160, 20, 67),
			rect(0, 120, 40, 87),
		])

		expect(rows).toEqual([
			rect(0, 160, 0, 47),
			rect(0, 160, 20, 67),
			rect(0, 120, 40, 87),
		])
	})

	it("finds tight-line-height wrap offsets instead of collapsing overlapping rows", () => {
		const root = document.createElement("div")
		const textNode = document.createTextNode("ABCDEFGHIJKL")
		root.append(textNode)
		const allRows = [
			rect(0, 100, 0, 47),
			rect(0, 100, 20, 67),
			rect(0, 100, 40, 87),
		]

		const fragments = measureTextNodeVisualFragments({
			textNode,
			styleOwner: root,
			lineTolerancePx: 0.75,
			minimumOverlapRatio: 0.45,
			measureRange: (_node, _start, end) => {
				if (end <= 4) return [allRows[0]]
				if (end <= 8) return allRows.slice(0, 2)
				return allRows
			},
		})

		expect(fragments.map((fragment) => fragment.text)).toEqual(["ABCD", "EFGH", "IJKL"])
		expect(fragments.map((fragment) => fragment.rect)).toEqual(allRows)
	})
})
