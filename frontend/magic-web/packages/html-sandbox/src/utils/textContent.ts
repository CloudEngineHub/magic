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

function getDirectTextContent(element: Element): string {
	return getDirectTextNodes(element)
		.map((node) => node.textContent ?? "")
		.join("")
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

/** Text shown/edited in the style panel for this element. */
export function getEditableTextContent(element: Element): string {
	if (!shouldPreserveElementChildren(element)) return element.textContent ?? ""
	return getDirectTextContent(element)
}

/** Replace editable text without removing preserved element children. */
export function setElementTextContent(element: Element, nextContent: string): void {
	if (!shouldPreserveElementChildren(element)) {
		element.textContent = nextContent
		return
	}

	const directTextNodes = getDirectTextNodes(element)
	const significant = directTextNodes.filter((node) => node.textContent?.trim())
	const target = significant[0] ?? directTextNodes[0]
	if (target) {
		target.textContent = nextContent
		for (const node of directTextNodes) {
			if (node !== target) node.remove()
		}
		return
	}

	const descendantText = findFirstSignificantTextNode(element)
	if (descendantText) {
		descendantText.textContent = nextContent
		return
	}

	element.appendChild(element.ownerDocument.createTextNode(nextContent))
}
