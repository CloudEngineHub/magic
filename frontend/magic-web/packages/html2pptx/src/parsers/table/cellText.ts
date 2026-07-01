import type { PPTTableTextRun } from "../../ir/style"
import { colorToHex } from "../../shared/color"

export function extractCellTextRuns(container: HTMLElement, win: Window): PPTTableTextRun[] {
	const runs: PPTTableTextRun[] = []
	walkCellNode(container, win, runs)
	return runs
}

function walkCellNode(node: Node, win: Window, runs: PPTTableTextRun[]): void {
	for (const child of Array.from(node.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			const text = child.textContent || ""
			if (text.length === 0) continue
			const normalized = text.replace(/\s+/g, " ")
			if (normalized.length === 0) continue

			const parent = child.parentElement
			if (!parent) continue
			const style = win.getComputedStyle(parent)

			const fontSize = Math.round(parseFloat(style.fontSize) * 0.75)
			const fontWeight = parseInt(style.fontWeight)
			const bold = fontWeight >= 700 || style.fontWeight === "bold"
			const italic = style.fontStyle === "italic"
			const color = colorToHex(style.color)

			const runOptions: PPTTableTextRun["options"] = {}
			if (color) runOptions.color = color
			if (fontSize && fontSize !== 12) runOptions.fontSize = fontSize
			if (bold) runOptions.bold = true
			if (italic) runOptions.italic = true

			runs.push({
				text: normalized,
				options: Object.keys(runOptions).length > 0 ? runOptions : undefined,
			})
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement
			const tag = el.tagName.toUpperCase()

			if (tag === "TABLE") continue

			if (tag === "BR") {
				runs.push({ text: "", options: { breakLine: true } })
				continue
			}

			const display = win.getComputedStyle(el).display
			if (display === "none") continue

			const isBlockFlow = display === "block" || display === "flex" || display === "grid"
			const isInlineFlow = display === "inline-flex" || display === "inline-grid" || display === "inline-block"
			if ((isBlockFlow && !isInlineFlow) || tag === "DIV" || tag === "P") {
				if (runs.length > 0 && !runs[runs.length - 1].options?.breakLine) {
					runs.push({ text: "", options: { breakLine: true } })
				}
				walkCellNode(el, win, runs)
				if (runs.length > 0 && !runs[runs.length - 1].options?.breakLine) {
					runs.push({ text: "", options: { breakLine: true } })
				}
			} else {
				walkCellNode(el, win, runs)
			}
		}
	}
}
