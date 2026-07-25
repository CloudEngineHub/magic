import type { ElementNode, ComputedStyleInfo } from "../ir/dom"
import {
	hasActiveTransform,
	withNeutralizedTransforms,
	type TransformMeasurementTarget,
} from "../shared/transform-measurement"

let idCounter = 0

/**
 * Collect DOM element information
 * Traverse all DOM elements, measure position and size, and collect computed styles
 */
export function collectElements(doc: Document, win: Window): ElementNode[] {
	idCounter = 0
	const allNodes: ElementNode[] = []

	// Use iframe viewport coordinates, matching Range/getClientRects.
	// Subtracting the body origin would shift block elements left relative to text when the body is centered with max-width and mx-auto.

	// Traverse the DOM tree recursively and prune invisible subtrees early
	function traverse(
		element: Element,
		parent: ElementNode | null,
		depth: number,
	): ElementNode | null {
		const rect = element.getBoundingClientRect()
		const computedStyle = win.getComputedStyle(element)

		// display:none means the whole subtree is not rendered, so prune it directly
		if (computedStyle.display === "none") return null

		// display:contents has no layout box, but it can still own inherited text
		// styles. Keep a zero-geometry metadata node in allNodes so rich-text
		// parsing can resolve those styles, while continuing to flatten its
		// element children onto the real layout parent.
		if (element !== doc.body && computedStyle.display === "contents") {
			const styleNode: ElementNode = {
				id: `el-${idCounter++}`,
				tagName: element.tagName,
				element,
				rect: {
					x: rect.left,
					y: rect.top,
					w: 0,
					h: 0,
				},
				layout: {
					offsetWidth: 0,
					offsetHeight: 0,
					layoutWidth: 0,
					layoutHeight: 0,
				},
				style: extractStyles(computedStyle),
				textContent: getDirectTextContent(element),
				children: [],
				parent,
				depth,
				zIndex: parseZIndex(computedStyle.zIndex),
				domOrder: idCounter,
			}
			Array.from(element.children).forEach((child) => {
				const childNode = traverse(child, parent, depth)
				if (childNode && parent) parent.children.push(childNode)
			})
			allNodes.push(styleNode)
			return null
		}

		// Zero-size pruning: skip the whole subtree (display:none / contents are handled above)
		if (element !== doc.body && rect.width === 0 && rect.height === 0) return null

		// Build the node
		const node: ElementNode = {
			id: `el-${idCounter++}`,
			tagName: element.tagName,
			element,
			rect: {
				x: rect.left,
				y: rect.top,
				w: rect.width,
				h: rect.height,
			},
			layout: {
				offsetWidth: (element as HTMLElement).offsetWidth,
				offsetHeight: (element as HTMLElement).offsetHeight,
				layoutWidth: rect.width,
				layoutHeight: rect.height,
			},
			style: extractStyles(computedStyle),
			textContent: getDirectTextContent(element),
			children: [],
			parent,
			depth,
			zIndex: parseZIndex(computedStyle.zIndex),
			domOrder: idCounter, // DOM traversal order; later elements paint above earlier ones
		}

		// Process child elements recursively
		Array.from(element.children).forEach((child) => {
			const childNode = traverse(child, node, depth + 1)
			if (childNode) node.children.push(childNode)
		})

		allNodes.push(node)
		return node
	}

	// Start traversal from the body element, including body itself to capture background color/image and related styles
	traverse(doc.body, null, 0)
	measureLayoutBorderBoxes(allNodes)

	return allNodes
}

/**
 * Fill floating-point border-box sizes before CSS transforms in one layout
 * pass. Neutralizing the complete collected transform set avoids one style
 * mutation/reflow cycle per descendant of a transformed container.
 *
 * `offsetWidth`/`offsetHeight` are integer APIs, while the transformed client
 * rect is an axis-aligned bounding box. The neutralized batch retains CSS
 * transform containing blocks while exposing every element's layout box.
 */
function measureLayoutBorderBoxes(nodes: ElementNode[]): void {
	const transformedElements: TransformMeasurementTarget[] = nodes
		.filter((node) => hasActiveTransform(node.style))
		.map((node) => ({ element: node.element, style: node.style }))
	if (transformedElements.length === 0) return

	withNeutralizedTransforms(transformedElements, () => {
		for (const node of nodes) {
			if (node.style.display === "contents") continue
			const rect = node.element.getBoundingClientRect()
			node.layout.layoutWidth = nonNegativeFiniteOrFallback(
				rect.width,
				node.layout.layoutWidth ?? node.rect.w,
			)
			node.layout.layoutHeight = nonNegativeFiniteOrFallback(
				rect.height,
				node.layout.layoutHeight ?? node.rect.h,
			)
		}
	})
}

function nonNegativeFiniteOrFallback(value: number, fallback: number): number {
	return Number.isFinite(value) && value >= 0 ? value : fallback
}

/**
 * Extract key computed style properties
 */
function extractStyles(style: CSSStyleDeclaration): ComputedStyleInfo {
	return {
		// Background
		backgroundColor: style.backgroundColor,
		backgroundImage: style.backgroundImage,
		backgroundSize: style.backgroundSize,
		backgroundPosition: style.backgroundPosition,
		backgroundRepeat: style.backgroundRepeat,
		backgroundClip: style.backgroundClip,
		objectFit: style.objectFit,
		objectPosition: style.objectPosition,

		// Border
		borderRadius: style.borderRadius,
		borderWidth: style.borderWidth,
		borderColor: style.borderColor,
		borderStyle: style.borderStyle,
		// Per-side borders (use getPropertyValue for compatibility)
		borderTopWidth: style.borderTopWidth,
		borderRightWidth: style.borderRightWidth,
		borderBottomWidth: style.borderBottomWidth,
		borderLeftWidth: style.borderLeftWidth,
		borderTopColor: style.borderTopColor,
		borderRightColor: style.borderRightColor,
		borderBottomColor: style.borderBottomColor,
		borderLeftColor: style.borderLeftColor,
		borderTopStyle: style.borderTopStyle,
		borderRightStyle: style.borderRightStyle,
		borderBottomStyle: style.borderBottomStyle,
		borderLeftStyle: style.borderLeftStyle,

		// Text
		color: style.color,
		fontSize: parseFloat(style.fontSize) || 16,
		fontFamily: normalizeFontFamily(style.fontFamily),
		fontWeight: style.fontWeight,
		fontStyle: style.fontStyle,
		textAlign: style.textAlign,
		textDecoration: style.textDecoration,
		whiteSpace: style.whiteSpace,
		lineHeight: style.lineHeight,
		letterSpacing: style.letterSpacing,
		verticalAlign: style.verticalAlign,
		paddingTop: style.paddingTop,
		paddingRight: style.paddingRight,
		paddingBottom: style.paddingBottom,
		paddingLeft: style.paddingLeft,
		marginTop: style.marginTop,
		marginRight: style.marginRight,
		marginBottom: style.marginBottom,
		marginLeft: style.marginLeft,

		// Layout
		display: style.display,
		contentVisibility: style.getPropertyValue("content-visibility"),
		position: style.position,
		opacity: style.opacity,
		visibility: style.visibility,
		overflow: style.overflow,
		zIndex: style.zIndex,

		// Flex/Grid alignment
		alignItems: style.alignItems,
		justifyContent: style.justifyContent,
		alignContent: style.alignContent,
		alignSelf: style.alignSelf,
		flexDirection: style.flexDirection,

		// Shadow
		boxShadow: style.boxShadow,
		textShadow: style.textShadow,

		// Transform
		transform: style.transform,
		transformOrigin: style.transformOrigin,
		translate: style.getPropertyValue("translate"),
		rotate: style.getPropertyValue("rotate"),
		scale: style.getPropertyValue("scale"),

		// Filter
		filter: style.filter,

		// Clipping
		clipPath: style.clipPath || "none",

		// Text transform
		textTransform: style.textTransform,

		// WebKit-only properties (text-stroke, already declared in lib.dom.d.ts)
		webkitTextStroke: style.webkitTextStroke,
		webkitTextStrokeWidth: style.webkitTextStrokeWidth || undefined,
		webkitTextStrokeColor: style.webkitTextStrokeColor || undefined,
	}
}

/**
 * Get the element's direct text content, excluding child element text
 * Collapse line breaks and extra spaces into a single space, matching browser rendering
 */
function getDirectTextContent(element: Element): string | null {
	let text = ""
	Array.from(element.childNodes).forEach((node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			text += node.textContent || ""
		}
	})
	// Collapse line breaks and extra spaces into one space, matching CSS white-space: normal
	const normalized = text.replace(/\s+/g, " ").trim()
	return normalized || null
}

/**
 * Parse the z-index value
 */
function parseZIndex(value: string): number {
	if (value === "auto") return 0
	return parseInt(value) || 0
}

/**
 * Normalize the font name
 */
function normalizeFontFamily(fontFamily: string): string {
	if (!fontFamily) return "Arial"

	// Take the first font and remove quotes
	const first = fontFamily.split(",")[0].trim()
	return first.replace(/['"]/g, "") || "Arial"
}
