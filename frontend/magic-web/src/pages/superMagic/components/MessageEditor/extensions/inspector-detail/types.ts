import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"

export interface InspectorDetailAttrs {
	/** Title paragraph content (context description shown above detail) */
	title: string
	/** CSS selector path */
	selector: string
	/** Element tag name (e.g. "div", "button") */
	tagName: string
	/** Formatted size string (e.g. "120 × 40 px") */
	size: string
	/** JSON-serialized computed style key-value pairs */
	computedStyles: string
	/** Number of non-trivial style properties */
	styleCount: number
	/** Truncated text content preview */
	textContent: string
	/** JSON-serialized element attributes */
	elementAttributes?: string
	/** Normalized resource URL/path */
	resource?: string
	/** JSON-serialized DOM position and sibling context */
	domContext?: string
	/** Sanitized, truncated outerHTML snippet */
	elementHtml?: string
	/** Number of elements matched by selector */
	selectorMatchCount?: number
	/** Optional source file mention for the inspected HTML file. */
	fileMention?: TiptapMentionAttributes | null
}

export interface InspectorDetailOptions {}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		inspectorDetail: {
			insertInspectorDetail: (attrs: InspectorDetailAttrs) => ReturnType
		}
	}
}
