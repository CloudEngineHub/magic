/** Tags whose inner text is fallback/replaced content, not user-authored copy. */
export const NON_TEXTUAL_ELEMENT_TAGS = new Set([
	"area",
	"audio",
	"base",
	"br",
	"canvas",
	"col",
	"embed",
	"hr",
	"iframe",
	"img",
	"input",
	"link",
	"meta",
	"noscript",
	"object",
	"param",
	"source",
	"track",
	"video",
	"wbr",
])

export function isNonTextualElementTag(tagName: string): boolean {
	return NON_TEXTUAL_ELEMENT_TAGS.has(tagName.toLowerCase())
}

function isSkippedTextHost(element: Element, root: Element): boolean {
	let current: Element | null = element
	while (current && current !== root) {
		if (isNonTextualElementTag(current.tagName)) return true
		current = current.parentElement
	}
	return false
}

/** Text shown when inspecting/selecting an element for AI editing. */
export function getInspectableTextContent(element: Element): string {
	if (isNonTextualElementTag(element.tagName)) return ""

	const ownerDocument = element.ownerDocument
	if (!ownerDocument) return (element.textContent || "").trim()

	const parts: string[] = []
	const walker = ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT)
	let node = walker.nextNode()
	while (node) {
		const textNode = node as Text
		const parent = textNode.parentElement
		if (parent && !isSkippedTextHost(parent, element)) {
			const value = textNode.textContent?.trim()
			if (value) parts.push(value)
		}
		node = walker.nextNode()
	}

	return parts.join(" ").replace(/\s+/g, " ").trim()
}
