import { unionRects } from "../../shared/geometry"

export interface VisualLine {
	text: string
	rect: { left: number; right: number; top: number; bottom: number }
}

/**
 * Split one DOM Text Node into visual lines
 *
 * Algorithm: first use getClientRects() on the full Range to get the total line count K,
 * then use binary search to locate each line break, requiring O(K*logN) DOM measurements,
 * instead of the previous per-character O(N) approach.
 */
export function splitTextNodeByVisualLines(input: {
	doc: Document
	textNode: Text
}): VisualLine[] {
	const { doc, textNode } = input
	const raw = textNode.textContent ?? ""
	if (!raw) return []

	const len = raw.length

	const fullRange = doc.createRange()
	fullRange.setStart(textNode, 0)
	fullRange.setEnd(textNode, len)
	const fullRects = Array.from(fullRange.getClientRects())

	if (fullRects.length === 0) return []

	if (fullRects.length === 1) {
		const r = fullRects[0]
		return [{
			text: raw,
			rect: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
		}]
	}

	const lineStarts = findLineBreaks(doc, textNode, len, fullRects.length)
	return buildVisualLines(doc, textNode, raw, lineStarts, len)
}

/**
 * Binary-search the starting character offset of each line
 *
 * For line k (k >= 2), find the smallest endOffset such that
 * Range(0, endOffset).getClientRects().length >= k,
 * then endOffset - 1 is the first character index of line k.
 */
function findLineBreaks(
	doc: Document,
	textNode: Text,
	len: number,
	totalLines: number,
): number[] {
	const starts = [0]

	for (let targetLine = 2; targetLine <= totalLines; targetLine++) {
		let lo = starts[starts.length - 1] + 1
		let hi = len

		while (lo < hi) {
			const mid = (lo + hi) >>> 1
			const range = doc.createRange()
			range.setStart(textNode, 0)
			range.setEnd(textNode, mid)
			if (range.getClientRects().length >= targetLine) {
				hi = mid
			} else {
				lo = mid + 1
			}
		}

		const lineStart = lo > 0 ? lo - 1 : lo
		if (lineStart > starts[starts.length - 1]) {
			starts.push(lineStart)
		}
	}

	return starts
}

/**
 * Create a Range for each line from line start offsets and get its bounding rectangle
 */
function buildVisualLines(
	doc: Document,
	textNode: Text,
	raw: string,
	lineStarts: number[],
	len: number,
): VisualLine[] {
	const lines: VisualLine[] = []

	for (let i = 0; i < lineStarts.length; i++) {
		const start = lineStarts[i]
		const end = i + 1 < lineStarts.length ? lineStarts[i + 1] : len
		if (start >= end) continue

		const range = doc.createRange()
		range.setStart(textNode, start)
		range.setEnd(textNode, end)
		const rects = Array.from(range.getClientRects())

		if (rects.length === 0) continue

		const union = rects.length === 1
			? { left: rects[0].left, right: rects[0].right, top: rects[0].top, bottom: rects[0].bottom }
			: unionRects(rects)

		lines.push({
			text: raw.slice(start, end),
			rect: {
				left: union.left,
				right: union.right,
				top: union.top,
				bottom: union.bottom,
			},
		})
	}

	return lines.sort((a, b) => a.rect.top - b.rect.top)
}
