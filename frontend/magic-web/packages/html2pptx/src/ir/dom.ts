/**
 * DOM collection-layer contract: the intermediate representation extracted from the iframe DOM during collection.
 * Does not depend on any business modules.
 */

/** Computed style information (reduced form) */
export interface ComputedStyleInfo {
	// Background
	backgroundColor: string
	backgroundImage: string
	backgroundSize: string
	backgroundPosition: string
	backgroundRepeat: string
	backgroundClip: string
	objectFit: string
	objectPosition: string

	// Border
	borderRadius: string
	borderWidth: string
	borderColor: string
	borderStyle: string
	// Per-side border
	borderTopWidth: string
	borderRightWidth: string
	borderBottomWidth: string
	borderLeftWidth: string
	borderTopColor: string
	borderRightColor: string
	borderBottomColor: string
	borderLeftColor: string
	borderTopStyle: string
	borderRightStyle: string
	borderBottomStyle: string
	borderLeftStyle: string

	// Text
	color: string
	fontSize: number
	fontFamily: string
	fontWeight: string
	fontStyle: string
	textAlign: string
	textDecoration: string
	whiteSpace: string
	lineHeight: string
	letterSpacing: string
	verticalAlign: string
	paddingTop: string
	paddingRight: string
	paddingBottom: string
	paddingLeft: string
	marginTop: string
	marginRight: string
	marginBottom: string
	marginLeft: string

	// Layout
	display: string
	/** Whether the element subtree is skipped from rendering. */
	contentVisibility?: string
	position: string
	opacity: string
	visibility: string
	overflow: string
	zIndex: string

	// Flex/Grid alignment
	alignItems: string
	justifyContent: string
	alignContent: string
	alignSelf: string
	flexDirection: string

	// Shadow
	boxShadow: string
	textShadow: string

	// Transform
	transform: string
	transformOrigin?: string
	translate?: string
	rotate?: string
	scale?: string

	// Filter
	filter: string

	// Clipping
	clipPath: string

	// Text transform
	textTransform: string

	// WebKit-only properties (text-stroke, aligned with lib.dom.d.ts)
	webkitTextStroke?: string
	webkitTextStrokeWidth?: string
	webkitTextStrokeColor?: string
}

/** DOM element node */
export interface ElementNode {
	/** Unique identifier */
	id: string
	/** Element type */
	tagName: string
	/** Original DOM reference */
	element: Element
	/** Position and size in pixels */
	rect: {
		x: number
		y: number
		w: number
		h: number
	}
	/** Layout size, before transforms */
	layout: {
		offsetWidth: number
		offsetHeight: number
		/** Floating-point border-box dimensions before CSS transforms. */
		layoutWidth?: number
		layoutHeight?: number
	}
	/** Computed styles */
	style: ComputedStyleInfo
	/** Direct text content */
	textContent: string | null
	/** Child elements */
	children: ElementNode[]
	/** Parent element reference */
	parent: ElementNode | null
	/** DOM depth */
	depth: number
	/** z-index value */
	zIndex: number
	/** DOM traversal order for sibling sorting; later elements are above */
	domOrder: number
	/** Paint order attached after sortByZOrder computes it */
	paintOrder?: number
}
