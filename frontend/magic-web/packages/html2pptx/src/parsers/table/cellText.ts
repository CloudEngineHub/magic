import type { PPTTableTextRun } from "../../ir/style"
import { colorToHex, getTransparency } from "../../shared/color"
import { mapFontFamily, parseLetterSpacing, transformText } from "../../shared/text-utils"
import { pxToPt } from "../../shared/unit"

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

			const fontSizePx = parseFloat(style.fontSize)
			const fontSize = Math.round(fontSizePx * 0.75)
			const fontWeight = parseInt(style.fontWeight)
			const bold = fontWeight >= 700 || style.fontWeight === "bold"
			const italic = style.fontStyle === "italic"
			const color = colorToHex(style.color)
			const transparency = getTransparency(style.color)
			const fontFace = style.fontFamily ? mapFontFamily(style.fontFamily) : undefined
			const charSpacing = parseLetterSpacing(style.letterSpacing, fontSizePx, 1)
			const transformed = transformText(normalized, style.textTransform)

			const runOptions: PPTTableTextRun["options"] = {}
			if (color) runOptions.color = color
			if (fontSize && fontSize !== 12) runOptions.fontSize = fontSize
			if (fontFace) runOptions.fontFace = fontFace
			if (bold) runOptions.bold = true
			if (italic) runOptions.italic = true
			if (charSpacing !== undefined) runOptions.charSpacing = charSpacing
			if (transparency > 0) runOptions.transparency = transparency

			runs.push({
				text: transformed,
				options: Object.keys(runOptions).length > 0 ? runOptions : undefined,
			})
		} else if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as HTMLElement
			const tag = el.tagName.toUpperCase()

			if (tag === "TABLE") continue

			if (tag === "BR") {
				if (!markLastTextRunAsParagraphEnd(runs)) {
					// A leading or consecutive BR needs its own empty paragraph. Keeping
					// that run separate avoids attaching duplicate paragraph properties
					// to a paragraph that already contains text.
					runs.push({ text: "", options: { breakLine: true } })
				}
				continue
			}

			const style = win.getComputedStyle(el)
			const display = style.display
			if (display === "none") continue

			const isBlockFlow = display === "block" || display === "flex" || display === "grid"
			const isInlineFlow =
				display === "inline-flex" || display === "inline-grid" || display === "inline-block"
			if ((isBlockFlow && !isInlineFlow) || tag === "DIV" || tag === "P") {
				markLastTextRunAsParagraphEnd(runs)
				const contentStartIndex = runs.length
				walkCellNode(el, win, runs)
				applyBlockSpacing(runs, contentStartIndex, style.marginTop)
				markLastTextRunAsParagraphEnd(runs, contentStartIndex)
			} else {
				walkCellNode(el, win, runs)
			}
		}
	}
}

function markLastTextRunAsParagraphEnd(runs: PPTTableTextRun[], startIndex = 0): boolean {
	for (let index = runs.length - 1; index >= startIndex; index--) {
		const run = runs[index]
		if (run.text.length === 0) continue
		if (run.options?.breakLine) return false
		run.options = { ...run.options, breakLine: true }
		return true
	}
	return false
}

function applyBlockSpacing(
	runs: PPTTableTextRun[],
	contentStartIndex: number,
	marginTop: string,
): void {
	const marginTopPx = parseFloat(marginTop)
	if (!Number.isFinite(marginTopPx) || marginTopPx <= 0) return

	const firstTextRun = runs.slice(contentStartIndex).find((run) => run.text.length > 0)
	if (!firstTextRun) return

	firstTextRun.options = {
		...firstTextRun.options,
		paraSpaceBefore: pxToPt(marginTopPx),
	}
}
