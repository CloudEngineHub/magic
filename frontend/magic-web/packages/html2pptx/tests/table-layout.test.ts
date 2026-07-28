// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import type { SlideConfig } from "../src/api/options"
import type { ElementNode } from "../src/ir/dom"
import type { PPTNodeBase, PPTTableNode } from "../src/ir/node"
import { parseTable } from "../src/parsers/parseTable"
import { calculateColumnWidths } from "../src/shared/table-utils"

const config: SlideConfig = {
	htmlWidth: 1920,
	htmlHeight: 1080,
	slideWidth: 20,
	slideHeight: 11.25,
}

afterEach(() => {
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
			expect(width).toBeCloseTo(((1134 - 160) / 3) / 96, 8)
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
})

function parseSingleCellTable(whiteSpace: string): PPTTableNode {
	document.body.innerHTML = `
		<table><colgroup><col style="width: 200px"></colgroup>
			<tr><td style="white-space: ${whiteSpace}">Long table cell content</td></tr>
		</table>
	`
	const table = document.querySelector("table") as HTMLTableElement
	const node = {
		tagName: "TABLE",
		element: table,
		rect: { x: 0, y: 0, w: 200, h: 40 },
	} as ElementNode
	const base: PPTNodeBase = { type: "", x: 0, y: 0, w: 200 / 96, h: 40 / 96, zOrder: 1 }
	const parsed = parseTable(node, base, config, window)
	if (!parsed || Array.isArray(parsed)) throw new Error("PPTTableNode is required")
	return parsed
}
