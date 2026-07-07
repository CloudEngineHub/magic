/**
 * Line-related utility functions
 */

/**
 * Map CSS border styles to PPT dash types
 */
export function mapDashType(style: "solid" | "dashed" | "dotted"): string {
	switch (style) {
		case "dashed":
			return "dash"
		case "dotted":
			return "dot"
		default:
			return "solid"
	}
}
