// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import { extractCellTextRuns } from "../src/parsers/table/cellText"

afterEach(() => {
	document.body.innerHTML = ""
})

describe("table cell text", () => {
	it("marks a preceding text run for an explicit line break", () => {
		document.body.innerHTML = `<table><tbody><tr><td>Alpha<br>Beta</td></tr></tbody></table>`
		const cell = document.querySelector("td") as HTMLTableCellElement

		const runs = extractCellTextRuns(cell, window)

		expect(runs.map((run) => ({ text: run.text, breakLine: run.options?.breakLine }))).toEqual([
			{ text: "Alpha", breakLine: true },
			{ text: "Beta", breakLine: undefined },
		])
	})

	it("preserves transformed English header styling", () => {
		document.body.innerHTML = `
			<table><thead><tr>
				<th style="font-size: 22px; font-weight: 900; text-align: center">
					核心原则
					<div style="display: block; font-size: 13px; font-family: 'SF Mono'; font-weight: 900; letter-spacing: .1em; color: rgba(251, 248, 241, .5); margin-top: 4px; text-transform: uppercase">Principle</div>
				</th>
			</tr></thead></table>
		`
		const cell = document.querySelector("th") as HTMLTableCellElement

		const runs = extractCellTextRuns(cell, window)
		const english = runs.find((run) => run.text === "PRINCIPLE")

		expect(runs.filter((run) => run.text.length === 0)).toEqual([])
		expect(english).toBeDefined()
		expect(english?.options).toMatchObject({
			fontSize: 10,
			fontFace: "SF Mono",
			bold: true,
			charSpacing: 0.975,
			color: "FBF8F1",
			transparency: 50,
			paraSpaceBefore: 3,
		})
	})
})
