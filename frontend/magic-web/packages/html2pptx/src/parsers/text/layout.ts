export interface TextLayoutRect {
	left: number
	right: number
	top: number
	bottom: number
}

export interface VisualLine {
	text: string
	rect: TextLayoutRect
}

/** A DOM text fragment that occupies one browser visual line. */
export interface TextFlowFragment {
	text: string
	textNode: Text
	startOffset: number
	endOffset: number
	/** The element whose computed text style applies to this fragment. */
	styleOwner: Element
	/** Missing when the text is not rendered (for example, collapsed whitespace). */
	rect?: TextLayoutRect
}

export type TextFlowLineBreak = "soft" | "explicit"

export interface TextFlowLine {
	fragments: TextFlowFragment[]
	/** Union of all rendered fragments on this visual line. */
	rect?: TextLayoutRect
	/**
	 * `soft` means browser wrapping; `explicit` means a BR (or a caller supplied
	 * boundary). The final line has no breakAfter.
	 */
	breakAfter?: TextFlowLineBreak
	breakElement?: Element
	breakStyleOwner?: Element
}

export interface TextFlowLayout {
	/** All fragments in DOM order, including unmeasured/collapsed fragments. */
	fragments: TextFlowFragment[]
	lines: TextFlowLine[]
}

export type TextFlowElementPolicy = "traverse" | "skip" | "explicit-break" | "boundary"

export interface CollectTextFlowOptions {
	/**
	 * Controls descendant handling. The default traverses every element except
	 * BR, which is emitted as an explicit break. Callers can skip independently
	 * exported block/replaced elements, or use `boundary` to traverse a block
	 * while placing explicit breaks around it.
	 */
	elementPolicy?: (
		element: Element,
		root: Element,
		defaultPolicy: TextFlowElementPolicy,
	) => TextFlowElementPolicy | undefined
	resolveStyleOwner?: (textNode: Text, root: Element) => Element
	resolveBreakStyleOwner?: (breakElement: Element, root: Element) => Element
}

export type TextRangeMeasurer = (
	textNode: Text,
	startOffset: number,
	endOffset: number,
) => readonly TextLayoutRect[]

export interface MeasureTextFlowOptions extends CollectTextFlowOptions {
	/** Injectable for tests; production defaults to Range.getClientRects(). */
	measureRange?: TextRangeMeasurer
	/** Pixel tolerance used when rects from different inline styles share a line. */
	lineTolerancePx?: number
	/** Required overlap against the smaller rect for considering two rects co-linear. */
	minimumOverlapRatio?: number
}

export interface TextFlowTextSource {
	kind: "text"
	textNode: Text
	styleOwner: Element
}

export interface TextFlowBreakSource {
	kind: "break"
	element: Element
	styleOwner: Element
	reason: "explicit" | "boundary"
}

export type TextFlowSource = TextFlowTextSource | TextFlowBreakSource

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const DEFAULT_LINE_TOLERANCE_PX = 0.75
const DEFAULT_MINIMUM_OVERLAP_RATIO = 0.45

/**
 * Collect the text-flow sources below `root` in DOM order.
 *
 * This deliberately does not make display/replaced-element decisions. The
 * caller owns those decisions through `elementPolicy`, because the same DOM
 * subtree may be a standalone PPT node in one parser and part of a text flow
 * in another.
 */
export function collectTextFlowSources(
	root: Element,
	options: CollectTextFlowOptions = {},
): TextFlowSource[] {
	const sources: TextFlowSource[] = []

	const resolveTextOwner = options.resolveStyleOwner ?? defaultTextStyleOwner
	const resolveBreakOwner = options.resolveBreakStyleOwner ?? defaultBreakStyleOwner

	const pushBreak = (element: Element, reason: "explicit" | "boundary") => {
		sources.push({
			kind: "break",
			element,
			styleOwner: resolveBreakOwner(element, root),
			reason,
		})
	}

	const visit = (parent: Node): void => {
		for (const child of Array.from(parent.childNodes)) {
			if (child.nodeType === TEXT_NODE) {
				const textNode = child as Text
				if ((textNode.textContent ?? "").length === 0) continue
				sources.push({
					kind: "text",
					textNode,
					styleOwner: resolveTextOwner(textNode, root),
				})
				continue
			}

			if (child.nodeType !== ELEMENT_NODE) continue
			const element = child as Element
			const fallbackPolicy = defaultElementPolicy(element)
			const policy = options.elementPolicy?.(element, root, fallbackPolicy) ?? fallbackPolicy

			if (policy === "skip") continue
			if (policy === "explicit-break") {
				pushBreak(element, "explicit")
				continue
			}
			if (policy === "boundary") pushBreak(element, "boundary")
			visit(element)
			if (policy === "boundary") pushBreak(element, "boundary")
		}
	}

	visit(root)
	return sources
}

/**
 * Measure a complete inline text flow and group styled fragments into the
 * browser's visual lines. Range is used only for rendered line geometry; DOM
 * offsets and style ownership remain attached to every fragment.
 */
export function measureTextFlow(
	root: Element,
	options: MeasureTextFlowOptions = {},
): TextFlowLayout {
	const sources = collectTextFlowSources(root, options)
	const measureRange = options.measureRange ?? measureTextRange
	const lineOptions: Required<
		Pick<MeasureTextFlowOptions, "lineTolerancePx" | "minimumOverlapRatio">
	> = {
		lineTolerancePx: options.lineTolerancePx ?? DEFAULT_LINE_TOLERANCE_PX,
		minimumOverlapRatio: options.minimumOverlapRatio ?? DEFAULT_MINIMUM_OVERLAP_RATIO,
	}

	const fragments: TextFlowFragment[] = []
	const lines: TextFlowLine[] = []
	let currentLine: TextFlowLine | undefined

	const finishCurrentLine = (
		breakAfter?: TextFlowLineBreak,
		breakSource?: TextFlowBreakSource,
	): void => {
		if (!currentLine) {
			if (breakAfter !== "explicit") return
			lines.push({
				fragments: [],
				breakAfter,
				breakElement: breakSource?.element,
				breakStyleOwner: breakSource?.styleOwner,
			})
			return
		}

		currentLine.breakAfter = breakAfter
		if (breakSource) {
			currentLine.breakElement = breakSource.element
			currentLine.breakStyleOwner = breakSource.styleOwner
		}
		lines.push(currentLine)
		currentLine = undefined
	}

	for (const source of sources) {
		if (source.kind === "break") {
			finishCurrentLine("explicit", source)
			continue
		}

		const measured = measureTextNodeVisualFragments({
			textNode: source.textNode,
			styleOwner: source.styleOwner,
			measureRange,
			...lineOptions,
		})

		for (const fragment of measured) {
			fragments.push(fragment)

			if (!currentLine) {
				currentLine = {
					fragments: [fragment],
					rect: fragment.rect ? { ...fragment.rect } : undefined,
				}
				continue
			}

			if (
				fragment.rect &&
				currentLine.rect &&
				!belongsToVisualLine(fragment.rect, currentLine, lineOptions)
			) {
				finishCurrentLine("soft")
				currentLine = {
					fragments: [fragment],
					rect: { ...fragment.rect },
				}
				continue
			}

			currentLine.fragments.push(fragment)
			if (fragment.rect) {
				currentLine.rect = currentLine.rect
					? unionTextLayoutRects(currentLine.rect, fragment.rect)
					: { ...fragment.rect }
			}
		}
	}

	finishCurrentLine()
	return { fragments, lines }
}

/**
 * Split one DOM Text Node into visual lines.
 *
 * Kept as the compatibility API for the legacy text parser. The implementation
 * now uses geometric line grouping rather than assuming every client rect has
 * exactly the same top coordinate on a line.
 */
export function splitTextNodeByVisualLines(input: { doc: Document; textNode: Text }): VisualLine[] {
	const { doc, textNode } = input
	const styleOwner = textNode.parentElement ?? doc.documentElement
	return measureTextNodeVisualFragments({
		textNode,
		styleOwner,
		measureRange: (node, startOffset, endOffset) =>
			measureTextRange(node, startOffset, endOffset, doc),
		lineTolerancePx: DEFAULT_LINE_TOLERANCE_PX,
		minimumOverlapRatio: DEFAULT_MINIMUM_OVERLAP_RATIO,
	})
		.filter((fragment): fragment is TextFlowFragment & { rect: TextLayoutRect } =>
			Boolean(fragment.rect),
		)
		.map((fragment) => ({ text: fragment.text, rect: fragment.rect }))
}

interface MeasureTextNodeVisualFragmentsInput {
	textNode: Text
	styleOwner: Element
	measureRange: TextRangeMeasurer
	lineTolerancePx: number
	minimumOverlapRatio: number
}

/** Measure one Text node while retaining the exact DOM offsets for each row. */
export function measureTextNodeVisualFragments(
	input: MeasureTextNodeVisualFragmentsInput,
): TextFlowFragment[] {
	const { textNode, styleOwner, measureRange, lineTolerancePx, minimumOverlapRatio } = input
	const raw = textNode.textContent ?? ""
	if (!raw) return []

	const groupingOptions = { lineTolerancePx, minimumOverlapRatio }
	const fullRects = normalizeRects(measureRange(textNode, 0, raw.length))
	const visualRows = groupRectsByVisualLine(fullRects, groupingOptions)

	if (visualRows.length === 0) {
		return [
			{
				text: raw,
				textNode,
				startOffset: 0,
				endOffset: raw.length,
				styleOwner,
			},
		]
	}

	if (visualRows.length === 1) {
		return [
			{
				text: raw,
				textNode,
				startOffset: 0,
				endOffset: raw.length,
				styleOwner,
				rect: visualRows[0],
			},
		]
	}

	const lineStarts = findVisualLineStarts({
		textNode,
		textLength: raw.length,
		totalLines: visualRows.length,
		measureRange,
		groupingOptions,
	})
	const fragments: TextFlowFragment[] = []

	for (let index = 0; index < visualRows.length; index++) {
		const startOffset = lineStarts[index]
		const endOffset = lineStarts[index + 1] ?? raw.length
		if (startOffset === undefined || startOffset >= endOffset) continue
		fragments.push({
			text: raw.slice(startOffset, endOffset),
			textNode,
			startOffset,
			endOffset,
			styleOwner,
			rect: visualRows[index],
		})
	}

	// If a browser returns unusual non-monotonic prefix rects (for example, an
	// exotic bidi layout), retain the unmatched tail instead of dropping text.
	const consumedOffset = fragments[fragments.length - 1]?.endOffset ?? 0
	if (consumedOffset < raw.length) {
		fragments.push({
			text: raw.slice(consumedOffset),
			textNode,
			startOffset: consumedOffset,
			endOffset: raw.length,
			styleOwner,
			rect: visualRows[Math.min(fragments.length, visualRows.length - 1)],
		})
	}

	return fragments
}

interface LineGroupingOptions {
	lineTolerancePx: number
	minimumOverlapRatio: number
}

/** Group client rects without relying on exact `top` equality. */
export function groupRectsByVisualLine(
	rects: readonly TextLayoutRect[],
	options: Partial<LineGroupingOptions> = {},
): TextLayoutRect[] {
	const resolved: LineGroupingOptions = {
		lineTolerancePx: options.lineTolerancePx ?? DEFAULT_LINE_TOLERANCE_PX,
		minimumOverlapRatio: options.minimumOverlapRatio ?? DEFAULT_MINIMUM_OVERLAP_RATIO,
	}
	const rows: Array<{ rect: TextLayoutRect; members: TextLayoutRect[] }> = []

	for (const rect of normalizeRects(rects)) {
		const current = rows[rows.length - 1]
		if (current && canAppendRectToVisualLine(current, rect, resolved)) {
			current.members.push(rect)
			current.rect = unionTextLayoutRects(current.rect, rect)
			continue
		}
		rows.push({ rect: { ...rect }, members: [rect] })
	}

	return rows.map((row) => row.rect)
}

/**
 * Recover the browser's line advance from adjacent visual-line rectangles.
 * Top and bottom deltas must agree so mixed glyph bounds are not mistaken for
 * a CSS line box measurement.
 */
export function measureUniformLineAdvance(
	lines: readonly { rect?: TextLayoutRect }[],
	tolerancePx = 1,
): number | undefined {
	if (lines.length < 2) return undefined
	const advances: number[] = []
	for (let index = 1; index < lines.length; index++) {
		const previous = lines[index - 1].rect
		const current = lines[index].rect
		if (!previous || !current) return undefined
		const topDelta = current.top - previous.top
		const bottomDelta = current.bottom - previous.bottom
		if (topDelta <= 0 || bottomDelta <= 0 || Math.abs(topDelta - bottomDelta) > tolerancePx) {
			return undefined
		}
		advances.push((topDelta + bottomDelta) / 2)
	}
	const first = advances[0]
	if (advances.some((advance) => Math.abs(advance - first) > tolerancePx)) return undefined
	return advances.reduce((sum, advance) => sum + advance, 0) / advances.length
}

function findVisualLineStarts(input: {
	textNode: Text
	textLength: number
	totalLines: number
	measureRange: TextRangeMeasurer
	groupingOptions: LineGroupingOptions
}): number[] {
	const { textNode, textLength, totalLines, measureRange, groupingOptions } = input
	const raw = textNode.textContent ?? ""
	const boundaries = getGraphemeBoundaries(raw)
	const starts = [0]
	const lineCountCache = new Map<number, number>()

	const countLinesAt = (endOffset: number): number => {
		const cached = lineCountCache.get(endOffset)
		if (cached !== undefined) return cached
		const count = groupRectsByVisualLine(
			measureRange(textNode, 0, endOffset),
			groupingOptions,
		).length
		lineCountCache.set(endOffset, count)
		return count
	}

	let previousBoundaryIndex = 0
	for (let targetLine = 2; targetLine <= totalLines; targetLine++) {
		let low = Math.max(previousBoundaryIndex + 1, 1)
		let high = boundaries.length - 1

		while (low < high) {
			const middle = (low + high) >>> 1
			if (countLinesAt(boundaries[middle]) >= targetLine) high = middle
			else low = middle + 1
		}

		if (countLinesAt(boundaries[low]) < targetLine) break
		const startBoundaryIndex = Math.max(0, low - 1)
		const startOffset = boundaries[startBoundaryIndex]
		if (startOffset <= starts[starts.length - 1]) break
		starts.push(startOffset)
		previousBoundaryIndex = startBoundaryIndex
	}

	// The final boundary is always the raw UTF-16 length, but use the explicit
	// parameter to make the invariant visible and safe for injected measurers.
	if (boundaries[boundaries.length - 1] !== textLength) boundaries.push(textLength)
	return starts
}

function belongsToVisualLine(
	rect: TextLayoutRect,
	line: TextFlowLine,
	options: LineGroupingOptions,
): boolean {
	const members = line.fragments.flatMap((fragment) => (fragment.rect ? [fragment.rect] : []))
	if (!line.rect || members.length === 0) return true
	return canAppendRectToVisualLine({ rect: line.rect, members }, rect, options)
}

interface VisualLineRectGroup {
	rect: TextLayoutRect
	members: TextLayoutRect[]
}

/**
 * Range rectangles are returned in DOM order. A large font with a small
 * line-height can make adjacent rows overlap vertically, so overlap alone is
 * not proof that two rectangles share a line. A horizontal overlap normally
 * means that inline flow restarted on the next row; true same-line inline
 * fragments normally continue before/after one another on the inline axis.
 */
function canAppendRectToVisualLine(
	line: VisualLineRectGroup,
	rect: TextLayoutRect,
	options: LineGroupingOptions,
): boolean {
	const compatibleMembers = line.members.filter((member) =>
		areRectsOnSameVisualLine(member, rect, options),
	)
	if (compatibleMembers.length === 0) return false

	const restartsInlineFlow = line.members.some((member) =>
		hasMeaningfulHorizontalOverlap(member, rect, options.lineTolerancePx),
	)
	if (!restartsInlineFlow) return true

	// A shared top, bottom, or center is a reliable line anchor. This preserves
	// centered/baseline-aligned mixed-size spans even if effects make their
	// horizontal rectangles overlap slightly.
	return compatibleMembers.some((member) =>
		hasSharedVerticalAnchor(member, rect, options.lineTolerancePx),
	)
}

function areRectsOnSameVisualLine(
	a: TextLayoutRect,
	b: TextLayoutRect,
	options: LineGroupingOptions,
): boolean {
	const heightA = Math.max(0, a.bottom - a.top)
	const heightB = Math.max(0, b.bottom - b.top)
	if (heightA === 0 || heightB === 0) {
		return Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) <= options.lineTolerancePx
	}
	if (hasSharedVerticalAnchor(a, b, options.lineTolerancePx)) return true

	const smallerHeight = Math.min(heightA, heightB)
	const overlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
	const overlapRatio = overlap / smallerHeight
	if (overlapRatio >= options.minimumOverlapRatio) return true

	const centerA = (a.top + a.bottom) / 2
	const centerB = (b.top + b.bottom) / 2
	const centerTolerance = smallerHeight * 0.25 + options.lineTolerancePx
	return Math.abs(centerA - centerB) <= centerTolerance
}

function hasSharedVerticalAnchor(
	a: TextLayoutRect,
	b: TextLayoutRect,
	tolerancePx: number,
): boolean {
	const centerA = (a.top + a.bottom) / 2
	const centerB = (b.top + b.bottom) / 2
	return (
		Math.abs(a.top - b.top) <= tolerancePx ||
		Math.abs(a.bottom - b.bottom) <= tolerancePx ||
		Math.abs(centerA - centerB) <= tolerancePx
	)
}

function hasMeaningfulHorizontalOverlap(
	a: TextLayoutRect,
	b: TextLayoutRect,
	tolerancePx: number,
): boolean {
	return Math.min(a.right, b.right) - Math.max(a.left, b.left) > tolerancePx
}

function getGraphemeBoundaries(text: string): number[] {
	const boundaries = [0]
	if (typeof Intl.Segmenter === "function") {
		const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
		for (const segment of segmenter.segment(text)) {
			if (segment.index > boundaries[boundaries.length - 1]) boundaries.push(segment.index)
		}
		if (boundaries[boundaries.length - 1] !== text.length) boundaries.push(text.length)
		return boundaries
	}

	let offset = 0
	for (const codePoint of text) {
		offset += codePoint.length
		boundaries.push(offset)
	}
	return boundaries
}

function measureTextRange(
	textNode: Text,
	startOffset: number,
	endOffset: number,
	doc: Document = textNode.ownerDocument,
): TextLayoutRect[] {
	if (startOffset >= endOffset) return []
	const range = doc.createRange()
	range.setStart(textNode, startOffset)
	range.setEnd(textNode, endOffset)
	return normalizeRects(Array.from(range.getClientRects()))
}

function normalizeRects(rects: readonly TextLayoutRect[]): TextLayoutRect[] {
	return rects
		.map((rect) => ({
			left: rect.left,
			right: rect.right,
			top: rect.top,
			bottom: rect.bottom,
		}))
		.filter(
			(rect) =>
				Number.isFinite(rect.left) &&
				Number.isFinite(rect.right) &&
				Number.isFinite(rect.top) &&
				Number.isFinite(rect.bottom),
		)
}

function unionTextLayoutRects(a: TextLayoutRect, b: TextLayoutRect): TextLayoutRect {
	return {
		left: Math.min(a.left, b.left),
		right: Math.max(a.right, b.right),
		top: Math.min(a.top, b.top),
		bottom: Math.max(a.bottom, b.bottom),
	}
}

function defaultElementPolicy(element: Element): TextFlowElementPolicy {
	return element.tagName.toUpperCase() === "BR" ? "explicit-break" : "traverse"
}

function defaultTextStyleOwner(textNode: Text, root: Element): Element {
	return textNode.parentElement ?? root
}

function defaultBreakStyleOwner(breakElement: Element, root: Element): Element {
	return breakElement.parentElement ?? root
}
