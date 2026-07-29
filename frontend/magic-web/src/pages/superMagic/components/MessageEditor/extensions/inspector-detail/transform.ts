import type { JSONContent } from "@tiptap/core"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import { INSPECTOR_DETAIL_MARKER, INSPECTOR_DETAIL_TYPE } from "./const"

/**
 * Known label prefixes that identify inspector detail lines.
 * Covers both zh_CN and en_US translations.
 */
const KNOWN_LABELS = [
	// zh_CN
	"选择器:",
	"尺寸:",
	"计算样式:",
	"文本内容:",
	"资源信息:",
	"元素属性:",
	"DOM 上下文:",
	"元素片段:",
	"选择器匹配数:",
	// en_US
	"Selector:",
	"Size:",
	"Computed Styles:",
	"Text Content:",
	"Resource:",
	"Element Attributes:",
	"DOM Context:",
	"Element HTML:",
	"Selector Match Count:",
]

function isInspectorDetailLine(text: string): boolean {
	return KNOWN_LABELS.some((label) => text.startsWith(label))
}

function getFirstText(node: JSONContent): string {
	if (node.type === "text" && node.text) return node.text
	if (node.content) {
		for (const child of node.content) {
			const t = getFirstText(child)
			if (t) return t
		}
	}
	return ""
}

function getOnlyMention(node: JSONContent | undefined): TiptapMentionAttributes | null {
	const content = node?.content
	if (node?.type !== "paragraph" || !Array.isArray(content) || content.length !== 1) {
		return null
	}
	const child = content[0]
	return child?.type === "mention" && child.attrs
		? (child.attrs as TiptapMentionAttributes)
		: null
}

function createInspectorParagraph(attrs: ReturnType<typeof extractInspectorAttrs>): JSONContent {
	return {
		type: "paragraph",
		content: [
			{
				type: INSPECTOR_DETAIL_TYPE,
				attrs,
			},
		],
	}
}

function parseInspectorMarker(text: string) {
	let titleText = text.slice(INSPECTOR_DETAIL_MARKER.length)
	let metadataMarkerCount = 0
	while (titleText.startsWith(INSPECTOR_DETAIL_MARKER)) {
		metadataMarkerCount += 1
		titleText = titleText.slice(INSPECTOR_DETAIL_MARKER.length)
	}

	return {
		titleText,
		inlineBefore: Boolean(metadataMarkerCount & 1),
		inlineAfter: Boolean(metadataMarkerCount & 2),
	}
}

/**
 * Extracts inspector detail attributes from consecutive paragraphs.
 */
function extractInspectorAttrs(
	titleText: string,
	paragraphs: JSONContent[],
): {
	title: string
	selector: string
	tagName: string
	size: string
	computedStyles: string
	styleCount: number
	textContent: string
	elementAttributes: string
	resource: string
	domContext: string
	elementHtml: string
	selectorMatchCount: number
	fileMention?: TiptapMentionAttributes | null
} {
	let selector = ""
	let size = ""
	let computedStyles = "{}"
	let styleCount = 0
	let textContent = ""
	let elementAttributes = "{}"
	let resource = ""
	let domContext = "{}"
	let elementHtml = ""
	let selectorMatchCount = -1

	for (const p of paragraphs) {
		const text = getFirstText(p)
		// Match label by checking both locales
		if (
			text.startsWith("选择器: ") ||
			text.startsWith("选择器:") ||
			text.startsWith("Selector: ") ||
			text.startsWith("Selector:")
		) {
			selector = text.replace(/^(选择器|Selector):\s*/, "")
		} else if (
			text.startsWith("尺寸: ") ||
			text.startsWith("尺寸:") ||
			text.startsWith("Size: ") ||
			text.startsWith("Size:")
		) {
			size = text.replace(/^(尺寸|Size):\s*/, "")
		} else if (
			text.startsWith("计算样式: ") ||
			text.startsWith("计算样式:") ||
			text.startsWith("Computed Styles: ") ||
			text.startsWith("Computed Styles:")
		) {
			const raw = text.replace(/^(计算样式|Computed Styles):\s*/, "")
			// Parse "prop: val; prop: val" into JSON object
			const pairs = raw.split("; ").reduce(
				(acc, pair) => {
					const colonIdx = pair.indexOf(": ")
					if (colonIdx > 0) {
						acc[pair.slice(0, colonIdx)] = pair.slice(colonIdx + 2)
					}
					return acc
				},
				{} as Record<string, string>,
			)
			styleCount = Object.keys(pairs).length
			computedStyles = JSON.stringify(pairs)
		} else if (
			text.startsWith("文本内容: ") ||
			text.startsWith("文本内容:") ||
			text.startsWith("Text Content: ") ||
			text.startsWith("Text Content:")
		) {
			textContent = text
				.replace(/^(文本内容|Text Content):\s*/, "")
				.replace(/^"/, "")
				.replace(/"$/, "")
		} else if (text.startsWith("资源信息:") || text.startsWith("Resource:")) {
			resource = text.replace(/^(资源信息|Resource):\s*/, "")
		} else if (text.startsWith("元素属性:") || text.startsWith("Element Attributes:")) {
			elementAttributes = text.replace(/^(元素属性|Element Attributes):\s*/, "") || "{}"
		} else if (text.startsWith("DOM 上下文:") || text.startsWith("DOM Context:")) {
			domContext = text.replace(/^(DOM 上下文|DOM Context):\s*/, "") || "{}"
		} else if (text.startsWith("元素片段:") || text.startsWith("Element HTML:")) {
			elementHtml = text.replace(/^(元素片段|Element HTML):\s*/, "")
		} else if (text.startsWith("选择器匹配数:") || text.startsWith("Selector Match Count:")) {
			selectorMatchCount = Number(
				text.replace(/^(选择器匹配数|Selector Match Count):\s*/, ""),
			)
		}
	}

	// Extract tagName from selector (last tag before any class/id/attr)
	const tagMatch = selector.match(/(?:^|\s|>)\s*([a-z][a-z0-9]*)/i)
	const tagName = tagMatch ? tagMatch[1] : ""

	return {
		title: titleText,
		selector,
		tagName,
		size,
		computedStyles,
		styleCount,
		textContent,
		elementAttributes,
		resource,
		domContext,
		elementHtml,
		selectorMatchCount,
	}
}

/**
 * Transforms JSONContent by detecting inspector-detail text paragraphs
 * (marked with invisible U+2063) and replacing them with a single
 * `inspector-detail` node for collapsible panel rendering.
 *
 * This allows the sent message to remain as plain text paragraphs while
 * the message list renders a rich collapsible panel.
 */
export function transformInspectorContent(doc: JSONContent): JSONContent {
	if (!doc.content || doc.content.length === 0) return doc

	const newContent: JSONContent[] = []
	let i = 0

	while (i < doc.content.length) {
		const node = doc.content[i]
		const text = getFirstText(node)

		// Detect the marker at the start of a paragraph
		if (node.type === "paragraph" && text.startsWith(INSPECTOR_DETAIL_MARKER)) {
			const { titleText, inlineBefore, inlineAfter } = parseInspectorMarker(text)

			// Collect following detail paragraphs
			const detailParagraphs: JSONContent[] = []
			let j = i + 1

			while (j < doc.content.length) {
				const next = doc.content[j]
				const nextText = getFirstText(next)

				// Stop at empty paragraph or non-matching paragraph
				if (
					next.type !== "paragraph" ||
					!next.content ||
					next.content.length === 0 ||
					!isInspectorDetailLine(nextText)
				) {
					break
				}

				detailParagraphs.push(next)
				j++
			}

			if (detailParagraphs.length > 0) {
				// Build inspector-detail node from collected paragraphs
				const attrs = extractInspectorAttrs(titleText, detailParagraphs)

				// Remove preceding plain paragraph if it's a duplicate of the title
				// (old format stored title as a separate paragraph before the marker)
				if (newContent.length > 0) {
					const prev = newContent[newContent.length - 1]
					const fileMention = getOnlyMention(prev)
					if (fileMention) {
						attrs.fileMention = fileMention
						newContent.pop()
					} else if (prev.type === "paragraph" && getFirstText(prev) === titleText) {
						newContent.pop()
					}
				}

				const inspectorNode = createInspectorParagraph(attrs).content?.[0]
				if (!inspectorNode) {
					i = j
					continue
				}

				let targetParagraph: JSONContent
				const previous = newContent[newContent.length - 1]
				if (inlineBefore && previous?.type === "paragraph") {
					targetParagraph = previous
					targetParagraph.content = [...(targetParagraph.content ?? []), inspectorNode]
				} else {
					targetParagraph = createInspectorParagraph(attrs)
					newContent.push(targetParagraph)
				}

				if (inlineAfter && doc.content[j]?.type === "paragraph") {
					targetParagraph.content = [
						...(targetParagraph.content ?? []),
						...(doc.content[j].content ?? []),
					]
					i = j + 1
				} else {
					i = j
				}
			} else {
				// No detail paragraphs found, keep original (strip marker for display)
				newContent.push(node)
				i++
			}
		} else {
			newContent.push(node)
			i++
		}
	}

	return { ...doc, content: newContent }
}

/**
 * Serializes `inspector-detail` nodes back into plain text paragraphs
 * with the invisible marker prefix. This is the inverse of
 * `transformInspectorContent` and is called before sending a message
 * so that the backend/AI receives readable text.
 *
 * The title paragraph includes the marker so that renderers can later
 * detect and re-collapse the content.
 */
export function serializeInspectorContent(
	doc: JSONContent,
	labels: {
		title: string
		selector: string
		size: string
		computedStyles: string
		textContent: string
		elementAttributes: string
		resource: string
		domContext: string
		elementHtml: string
		selectorMatchCount: string
	},
): JSONContent {
	if (!doc.content || doc.content.length === 0) return doc

	const text = (s: string): JSONContent => ({ type: "text", text: s })
	const para = (...content: JSONContent[]): JSONContent => ({
		type: "paragraph",
		content,
	})
	const isInspectorNode = (node: JSONContent | undefined): boolean =>
		node?.type === INSPECTOR_DETAIL_TYPE && Boolean(node.attrs)
	const serializeInspectorNode = (
		node: JSONContent,
		inlinePosition: { before: boolean; after: boolean } = { before: false, after: false },
	): JSONContent[] => {
		const attrs = node.attrs as {
			selector?: string
			size?: string
			computedStyles?: string
			textContent?: string
			elementAttributes?: string
			resource?: string
			domContext?: string
			elementHtml?: string
			selectorMatchCount?: number
			fileMention?: TiptapMentionAttributes | null
		}

		const content: JSONContent[] = []

		if (attrs.fileMention) {
			content.push(para({ type: "mention", attrs: attrs.fileMention }))
		}

		// Title with marker
		const metadataMarkerCount = (inlinePosition.before ? 1 : 0) + (inlinePosition.after ? 2 : 0)
		content.push(
			para(text(`${INSPECTOR_DETAIL_MARKER.repeat(1 + metadataMarkerCount)}${labels.title}`)),
		)

		// Selector
		if (attrs.selector) {
			content.push(para(text(`${labels.selector}: ${attrs.selector}`)))
		}
		if (attrs.selectorMatchCount !== undefined && attrs.selectorMatchCount >= 0) {
			content.push(para(text(`${labels.selectorMatchCount}: ${attrs.selectorMatchCount}`)))
		}
		if (attrs.resource) {
			content.push(para(text(`${labels.resource}: ${attrs.resource}`)))
		}
		if (attrs.elementAttributes && attrs.elementAttributes !== "{}") {
			content.push(para(text(`${labels.elementAttributes}: ${attrs.elementAttributes}`)))
		}
		if (attrs.domContext && attrs.domContext !== "{}") {
			content.push(para(text(`${labels.domContext}: ${attrs.domContext}`)))
		}
		if (attrs.elementHtml) {
			content.push(para(text(`${labels.elementHtml}: ${attrs.elementHtml}`)))
		}

		// Size
		if (attrs.size) {
			content.push(para(text(`${labels.size}: ${attrs.size}`)))
		}

		// Computed styles
		if (attrs.computedStyles && attrs.computedStyles !== "{}") {
			try {
				const styles = JSON.parse(attrs.computedStyles) as Record<string, string>
				const pairs = Object.entries(styles).map(([k, v]) => `${k}: ${v}`)
				if (pairs.length > 0) {
					content.push(para(text(`${labels.computedStyles}: ${pairs.join("; ")}`)))
				}
			} catch {
				// skip malformed styles
			}
		}

		// Text content
		if (attrs.textContent) {
			content.push(para(text(`${labels.textContent}: "${attrs.textContent}"`)))
		}
		return content
	}

	const newContent: JSONContent[] = []

	for (const node of doc.content) {
		if (isInspectorNode(node)) {
			newContent.push(...serializeInspectorNode(node))
		} else if (node.type === "paragraph" && node.content?.some(isInspectorNode)) {
			const paragraphContent = node.content
			for (let index = 0; index < paragraphContent.length; index += 1) {
				const child = paragraphContent[index]
				if (isInspectorNode(child)) {
					newContent.push(
						...serializeInspectorNode(child, {
							before: Boolean(
								index > 0 && !isInspectorNode(paragraphContent[index - 1]),
							),
							after: Boolean(
								index < paragraphContent.length - 1 &&
								!isInspectorNode(paragraphContent[index + 1]),
							),
						}),
					)
				} else {
					newContent.push(para(child))
				}
			}
		} else {
			newContent.push(node)
		}
	}

	return { ...doc, content: newContent }
}
