/**
 * Text updates that can keep non-text children intact.
 * Assigning element.textContent would wipe img/svg/etc.
 */

const PHRASING_TAGS = new Set([
	"a",
	"b",
	"br",
	"code",
	"del",
	"em",
	"font",
	"i",
	"ins",
	"mark",
	"s",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"u",
	"wbr",
])

const SKIPPED_TEXT_HOSTS = new Set(["noscript", "script", "style", "textarea"])

function isDecorativePhrasing(node: Element): boolean {
	const tag = node.tagName.toLowerCase()
	if (tag === "br" || !PHRASING_TAGS.has(tag)) return false
	return !node.textContent?.trim()
}

function shouldPreserveElementChildren(element: Element): boolean {
	return Array.from(element.querySelectorAll("*")).some((node) => {
		const tag = node.tagName.toLowerCase()
		if (SKIPPED_TEXT_HOSTS.has(tag)) return true
		if (!PHRASING_TAGS.has(tag)) return true
		return isDecorativePhrasing(node)
	})
}

function isSkippedTextHost(node: Node): boolean {
	const parent = node.parentElement
	return Boolean(parent?.closest("noscript, script, style, textarea"))
}

function getDirectTextNodes(element: Element): Text[] {
	return Array.from(element.childNodes).filter(
		(node): node is Text => node.nodeType === Node.TEXT_NODE,
	)
}

function findFirstSignificantTextNode(element: Element): Text | null {
	const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	let node = walker.nextNode()
	while (node) {
		if (node.textContent?.trim() && !isSkippedTextHost(node)) return node as Text
		node = walker.nextNode()
	}
	return null
}

function isBlockTextContainer(element: Element): boolean {
	const display = element.ownerDocument.defaultView?.getComputedStyle(element).display
	if (display) return display !== "inline" && display !== "inline-block" && display !== "contents"

	return element.tagName.toLowerCase() === "div"
}

function resolveEditableTextTarget(element: Element): Text | "replace-all" | null {
	const directTextNodes = getDirectTextNodes(element)
	const significant = directTextNodes.filter((node) => node.textContent?.trim())

	if (significant.length > 0 && element.children.length > 0 && isBlockTextContainer(element)) {
		return significant[0]
	}
	if (!shouldPreserveElementChildren(element)) return "replace-all"

	return significant[0] ?? findFirstSignificantTextNode(element)
}

/** Text shown/edited in the style panel for this element. */
export function getEditableTextContent(element: Element): string {
	const target = resolveEditableTextTarget(element)
	if (target === "replace-all") return element.textContent ?? ""
	if (!target) return ""

	const directTextNodes = getDirectTextNodes(element)
	if (directTextNodes.includes(target)) {
		return directTextNodes.map((node) => node.textContent ?? "").join("")
	}

	return target.textContent ?? ""
}

/** Replace editable text without removing preserved element children. */
export function setElementTextContent(element: Element, nextContent: string): void {
	const target = resolveEditableTextTarget(element)
	if (target === "replace-all") {
		// Keep authored inline wrappers and put only the changed characters into their text run.
		const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
		const nodes: Text[] = []
		let node = walker.nextNode()
		while (node) {
			nodes.push(node as Text)
			node = walker.nextNode()
		}
		if (nodes.length) replaceTextRuns(nodes, nextContent)
		else element.appendChild(element.ownerDocument.createTextNode(nextContent))
		return
	}

	if (target) {
		const directTextNodes = getDirectTextNodes(element)
		replaceTextRuns(directTextNodes.includes(target) ? directTextNodes : [target], nextContent)
		return
	}

	element.appendChild(element.ownerDocument.createTextNode(nextContent))
}

/** Full inline text can span several style runs; plain text alone cannot restore their boundaries. */
export function captureEditableTextState(element: Element): {
	textContent: string
	innerHTML?: string
} {
	return {
		textContent: getEditableTextContent(element),
		...(element.children.length && !shouldPreserveElementChildren(element)
			? { innerHTML: element.innerHTML }
			: {}),
	}
}

function replaceTextRuns(nodes: Text[], nextContent: string): void {
	const previous = nodes.map((node) => node.data).join("")
	if (previous === nextContent) return
	let start = 0
	while (
		start < previous.length &&
		start < nextContent.length &&
		previous[start] === nextContent[start]
	)
		start++
	let end = previous.length
	let nextEnd = nextContent.length
	while (end > start && nextEnd > start && previous[end - 1] === nextContent[nextEnd - 1]) {
		end--
		nextEnd--
	}

	// Preserve unchanged prefixes/suffixes in place, including text after an inline highlight.
	let offset = 0
	let inserted = false
	for (const [index, node] of nodes.entries()) {
		const length = node.length
		const localStart = Math.max(0, Math.min(length, start - offset))
		const localEnd = Math.max(localStart, Math.min(length, end - offset))
		const insertHere = !inserted && (start < offset + length || index === nodes.length - 1)
		const replacement = insertHere ? nextContent.slice(start, nextEnd) : ""
		if (insertHere) inserted = true
		if (localEnd > localStart || replacement) {
			node.replaceData(localStart, localEnd - localStart, replacement)
		}
		offset += length
	}
}
