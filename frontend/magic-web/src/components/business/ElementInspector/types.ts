/**
 * Element Inspector — shared types
 *
 * A standalone, Chrome-DevTools-style element inspection feature.
 * Independent of DevConsole; can be triggered from any host
 * (DevConsole toolbar, PPT editor, etc.).
 */

// ─── Inspected element info ──────────────────────────────────────────────────

export interface InspectedElementRect {
	top: number
	left: number
	width: number
	height: number
}

/** Box-model dimensions (margin / border / padding) */
export interface BoxModelSides {
	top: number
	right: number
	bottom: number
	left: number
}

export interface InspectedElementDomContext {
	/** Selector of the selected element's direct parent. */
	parentSelector: string
	/** 1-based position among all element children of the direct parent. */
	siblingIndex: number
	/** Number of same-tag siblings under the direct parent. */
	sameTagSiblingCount: number
	/** 1-based position among same-tag siblings; matches nth-of-type semantics. */
	sameTagIndex: number
	/** Compact description of the previous element sibling, when present. */
	previousSibling?: string
	/** Compact description of the next element sibling, when present. */
	nextSibling?: string
}

export interface InspectedElementInfo {
	/** CSS selector path to the element */
	selector: string
	/** Tag name (lowercase) */
	tagName: string
	/** id attribute */
	id: string
	/** CSS class list */
	classList: string[]
	/** Bounding rect relative to iframe viewport */
	rect: InspectedElementRect
	/** Box model (margin) */
	margin: BoxModelSides
	/** Box model (padding) */
	padding: BoxModelSides
	/** Box model (border width) */
	border: BoxModelSides
	/** Key computed styles */
	computedStyles: Record<string, string>
	/** Important attributes */
	attributes: Record<string, string>
	/** Truncated text content */
	textContent: string
	/** Accessible role / aria-label if present */
	accessibleName?: string
	/** Normalized resource URL/path for images, links, media, or posters. */
	resource?: string
	/** DOM position and nearby sibling context. */
	domContext?: InspectedElementDomContext
	/** Sanitized, truncated outerHTML snippet for source matching. */
	elementHtml?: string
	/** Number of elements matched by selector in the inspected document. */
	selectorMatchCount?: number
}

// ─── Message protocol ────────────────────────────────────────────────────────

export const INSPECTOR_MSG = {
	/** parent → iframe: start inspector mode */
	START: "MAGIC_INSPECTOR_START",
	/** parent → iframe: stop inspector mode */
	STOP: "MAGIC_INSPECTOR_STOP",
	/** iframe → parent: element hovered */
	HOVER: "MAGIC_INSPECTOR_HOVER",
	/** iframe → parent: element selected (clicked) */
	SELECT: "MAGIC_INSPECTOR_SELECT",
	/** iframe → parent: hover ended (mouse left all elements) */
	HOVER_END: "MAGIC_INSPECTOR_HOVER_END",
} as const
