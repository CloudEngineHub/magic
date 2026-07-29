// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import type { SlideConfig } from "../src/api/options"
import type { ElementNode } from "../src/ir/dom"
import type { PPTNodeBase, PPTTableNode } from "../src/ir/node"
import { parseTable } from "../src/parsers/parseTable"
import { calculateCellMargin, calculateColumnWidths } from "../src/shared/table-utils"

const config: SlideConfig = {
	htmlWidth: 1920,
	htmlHeight: 1080,
	slideWidth: 20,
	slideHeight: 11.25,
}

afterEach(() => {
	vi.restoreAllMocks()
	document.body.innerHTML = ""
})

describe("table layout", () => {
	it("uses the browser's final rendered column geometry", () => {
		document.body.innerHTML = `
			<table>
				<colgroup><col><col><col><col></colgroup>
				<tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
			</table>
		`
		const table = document.querySelector("table") as HTMLTableElement
		const renderedWidths = [160, 300, 320, 354]
		Array.from(table.querySelectorAll("col")).forEach((col, index) => {
			Object.defineProperty(col, "getBoundingClientRect", {
				configurable: true,
				value: () => ({ width: renderedWidths[index] }) as DOMRect,
			})
		})

		const widths = calculateColumnWidths(table, 4, 1134, config)

		expect(widths).toEqual(renderedWidths.map((width) => width / 96))
	})

	it("distributes the remaining width when only one column has an explicit width", () => {
		document.body.innerHTML = `
			<table>
				<colgroup>
					<col style="width: 160px">
					<col><col><col>
				</colgroup>
				<tr><td>A</td><td>B</td><td>C</td><td>D</td></tr>
			</table>
		`
		const table = document.querySelector("table") as HTMLTableElement

		const widths = calculateColumnWidths(table, 4, 1134, config)

		expect(widths[0]).toBeCloseTo(160 / 96, 8)
		for (const width of widths.slice(1)) {
			expect(width).toBeCloseTo((1134 - 160) / 3 / 96, 8)
		}
		expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(1134 / 96, 8)
	})

	it("treats a declared col span width as the width of each column", () => {
		document.body.innerHTML = `
			<table>
				<colgroup><col span="2" style="width: 200px"><col style="width: 200px"></colgroup>
				<tr><td>A</td><td>B</td><td>C</td></tr>
			</table>
		`
		const table = document.querySelector("table") as HTMLTableElement

		const widths = calculateColumnWidths(table, 3, 600, config)

		expect(widths).toEqual([200 / 96, 200 / 96, 200 / 96])
	})

	it("allows normal white-space to wrap and disables wrapping for nowrap", () => {
		const normal = parseSingleCellTable("normal")
		const nowrap = parseSingleCellTable("nowrap")

		expect(normal.rows[0].cells[0].options?.wrap).toBeUndefined()
		expect(nowrap.rows[0].cells[0].options?.wrap).toBe(false)
	})

	it("keeps centered cell margins symmetric instead of treating centering as indentation", () => {
		document.body.innerHTML = `
			<table><thead><tr>
				<th style="padding: 18px 20px; text-align: center">Core Principle</th>
			</tr></thead></table>
		`
		const cell = document.querySelector("th") as HTMLTableCellElement
		Object.defineProperty(cell, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 100, width: 320 }) as DOMRect,
		})
		vi.spyOn(document, "createRange").mockReturnValue({
			selectNode: vi.fn(),
			getBoundingClientRect: () => ({ left: 198, width: 124 }) as DOMRect,
		} as unknown as Range)

		const margin = calculateCellMargin(cell, window.getComputedStyle(cell))

		expect(margin).toEqual([18 / 96, 20 / 96, 18 / 96, 20 / 96])
	})

	it("continues to infer real indentation for left-aligned cell text", () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td style="padding: 18px 20px; text-align: left">Indented content</td>
			</tr></tbody></table>
		`
		const cell = document.querySelector("td") as HTMLTableCellElement
		Object.defineProperty(cell, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 100, width: 320 }) as DOMRect,
		})
		vi.spyOn(document, "createRange").mockReturnValue({
			selectNode: vi.fn(),
			getBoundingClientRect: () => ({ left: 148, width: 124 }) as DOMRect,
		} as unknown as Range)

		const margin = calculateCellMargin(cell, window.getComputedStyle(cell))

		expect(margin).toEqual([18 / 96, 20 / 96, 18 / 96, 48 / 96])
	})

	it("uses the text node's own alignment when it differs from the cell", () => {
		document.body.innerHTML = `
			<table><tbody><tr>
				<td style="padding: 18px 20px; text-align: left">
					<div style="text-align: center">Nested centered content</div>
				</td>
			</tr></tbody></table>
		`
		const cell = document.querySelector("td") as HTMLTableCellElement
		Object.defineProperty(cell, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ left: 100, width: 320 }) as DOMRect,
		})
		vi.spyOn(document, "createRange").mockReturnValue({
			selectNode: vi.fn(),
			getBoundingClientRect: () => ({ left: 198, width: 124 }) as DOMRect,
		} as unknown as Range)

		const margin = calculateCellMargin(cell, window.getComputedStyle(cell))

		expect(margin).toEqual([18 / 96, 20 / 96, 18 / 96, 20 / 96])
	})

	it("promotes single-run table typography to cell options", () => {
		const parsed = parseSingleCellTable(
			"normal",
			"font-family: 'SF Mono'; font-style: italic; letter-spacing: 2px; color: rgba(20, 40, 60, .5); text-transform: uppercase",
		)
		const cell = parsed.rows[0].cells[0]

		expect(cell.text).toBe("LONG TABLE CELL CONTENT")
		expect(cell.options).toMatchObject({
			fontFace: "SF Mono",
			italic: true,
			charSpacing: 1.5,
			color: "14283C",
			transparency: 50,
		})
	})
})

function parseSingleCellTable(whiteSpace: string, extraStyle = ""): PPTTableNode {
	document.body.innerHTML = `
		<table><colgroup><col style="width: 200px"></colgroup>
			<tr><td style="white-space: ${whiteSpace}; ${extraStyle}">Long table cell content</td></tr>
		</table>
	`
	const table = document.querySelector("table") as HTMLTableElement
	const node = {
		tagName: "TABLE",
		element: table,
		rect: { x: 0, y: 0, w: 200, h: 40 },
	} as unknown as ElementNode
	const base: PPTNodeBase = { type: "", x: 0, y: 0, w: 200 / 96, h: 40 / 96, zOrder: 1 }
	const parsed = parseTable(node, base, config, window)
	if (!parsed || Array.isArray(parsed)) throw new Error("PPTTableNode is required")
	return parsed
}
