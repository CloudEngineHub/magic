import { Node, mergeAttributes } from "@/infrastructure/editors/tiptap/core"
import { isSafeInlineStyle, isSafeUrlAttribute } from "../../../utils"

export const SafeVideo = Node.create({
	name: "safeVideo",
	priority: 110,
	group: "block",
	atom: true,
	selectable: true,

	addAttributes() {
		return {
			src: {
				default: null,
				parseHTML: (element) => element.getAttribute("src"),
			},
			style: {
				default: null,
				parseHTML: (element) => {
					const style = element.getAttribute("style")
					return style && isSafeInlineStyle(style) ? style : null
				},
			},
		}
	},

	parseHTML() {
		return [
			{
				tag: "video[src]",
				getAttrs: (node) => {
					if (!(node instanceof HTMLElement)) return false
					const src = node.getAttribute("src")
					const style = node.getAttribute("style")
					if (!src || !isSafeUrlAttribute("src", src)) return false
					if (style && !isSafeInlineStyle(style)) return false
					return null
				},
			},
		]
	},

	renderHTML({ HTMLAttributes }) {
		return [
			"video",
			mergeAttributes(HTMLAttributes, {
				controls: "",
				preload: "metadata",
				playsinline: "",
			}),
		]
	},
})
