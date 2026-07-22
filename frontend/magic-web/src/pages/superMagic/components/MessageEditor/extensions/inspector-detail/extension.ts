import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { INSPECTOR_DETAIL_TYPE } from "./const"
import type { InspectorDetailAttrs, InspectorDetailOptions } from "./types"
import { InspectorDetailComponent } from "./component"

/**
 * Renders element-inspector context (selector, size, styles, text preview)
 * as a collapsible block inside the message editor.
 */
export const InspectorDetailExtension = Node.create<InspectorDetailOptions>({
	name: INSPECTOR_DETAIL_TYPE,
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,

	addAttributes() {
		return {
			selector: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-selector") ?? "",
				renderHTML: (attrs) => ({ "data-selector": attrs.selector }),
			},
			tagName: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-tag-name") ?? "",
				renderHTML: (attrs) => ({ "data-tag-name": attrs.tagName }),
			},
			size: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-size") ?? "",
				renderHTML: (attrs) => ({ "data-size": attrs.size }),
			},
			computedStyles: {
				default: "{}",
				parseHTML: (el) => el.getAttribute("data-computed-styles") ?? "{}",
				renderHTML: (attrs) => ({ "data-computed-styles": attrs.computedStyles }),
			},
			styleCount: {
				default: 0,
				parseHTML: (el) => Number(el.getAttribute("data-style-count")) || 0,
				renderHTML: (attrs) => ({ "data-style-count": String(attrs.styleCount) }),
			},
			textContent: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-text-content") ?? "",
				renderHTML: (attrs) => ({ "data-text-content": attrs.textContent }),
			},
			elementAttributes: {
				default: "{}",
				parseHTML: (el) => el.getAttribute("data-element-attributes") ?? "{}",
				renderHTML: (attrs) => ({ "data-element-attributes": attrs.elementAttributes }),
			},
			resource: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-resource") ?? "",
				renderHTML: (attrs) => ({ "data-resource": attrs.resource }),
			},
			domContext: {
				default: "{}",
				parseHTML: (el) => el.getAttribute("data-dom-context") ?? "{}",
				renderHTML: (attrs) => ({ "data-dom-context": attrs.domContext }),
			},
			elementHtml: {
				default: "",
				parseHTML: (el) => el.getAttribute("data-element-html") ?? "",
				renderHTML: (attrs) => ({ "data-element-html": attrs.elementHtml }),
			},
			selectorMatchCount: {
				default: -1,
				parseHTML: (el) => {
					const value = el.getAttribute("data-selector-match-count")
					return value === null ? -1 : Number(value)
				},
				renderHTML: (attrs) => ({
					"data-selector-match-count": String(attrs.selectorMatchCount),
				}),
			},
			fileMention: {
				default: null,
				parseHTML: (el) => {
					const raw = el.getAttribute("data-file-mention")
					if (!raw) return null
					try {
						return JSON.parse(raw)
					} catch {
						return null
					}
				},
				renderHTML: (attrs) =>
					attrs.fileMention
						? { "data-file-mention": JSON.stringify(attrs.fileMention) }
						: {},
			},
		}
	},

	parseHTML() {
		return [{ tag: `[data-type="${this.name}"]` }]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"span",
			mergeAttributes({ "data-type": this.name }, HTMLAttributes),
			"[Element Inspector Detail]",
		]
	},

	renderText({ node }) {
		const attrs = node.attrs as InspectorDetailAttrs
		const lines: string[] = []

		if (attrs.title) lines.push(attrs.title)
		if (attrs.selector) lines.push(`selector: ${attrs.selector}`)
		if (attrs.size) lines.push(`size: ${attrs.size}`)

		if (attrs.computedStyles && attrs.computedStyles !== "{}") {
			try {
				const styles = JSON.parse(attrs.computedStyles) as Record<string, string>
				const pairs = Object.entries(styles).map(([k, v]) => `${k}: ${v}`)
				if (pairs.length > 0) lines.push(`computedStyles: ${pairs.join("; ")}`)
			} catch {
				// Fallback: raw value
				lines.push(`computedStyles: ${attrs.computedStyles}`)
			}
		}

		if (attrs.textContent) lines.push(`textContent: "${attrs.textContent}"`)
		if (attrs.resource) lines.push(`resource: ${attrs.resource}`)
		if (attrs.elementAttributes && attrs.elementAttributes !== "{}") {
			lines.push(`elementAttributes: ${attrs.elementAttributes}`)
		}
		if (attrs.domContext && attrs.domContext !== "{}")
			lines.push(`domContext: ${attrs.domContext}`)
		if (attrs.elementHtml) lines.push(`elementHtml: ${attrs.elementHtml}`)
		if (attrs.selectorMatchCount >= 0)
			lines.push(`selectorMatchCount: ${attrs.selectorMatchCount}`)

		return lines.length > 0 ? `${lines.join("\n")}\n` : ""
	},

	addNodeView() {
		return ReactNodeViewRenderer(InspectorDetailComponent)
	},

	addCommands() {
		return {
			insertInspectorDetail:
				(attrs) =>
				({ commands }) => {
					return commands.insertContent({
						type: this.name,
						attrs,
					})
				},
		}
	},
})
