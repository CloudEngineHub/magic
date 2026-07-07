import type { ComputedStyleInfo } from "../ir/dom"

/**
 * Parse background-size and background-position
 * Return pixel coordinates and size relative to the element itself (x, y, w, h)
 */
export function parseBackgroundLayout(
	style: ComputedStyleInfo,
	elemW: number,
	elemH: number
): { x: number; y: number; w: number; h: number } | null {
	const { backgroundSize, backgroundPosition } = style
	if ((!backgroundSize || backgroundSize === "auto") && (!backgroundPosition || backgroundPosition === "0% 0%")) {
		return null
	}

	let w = elemW
	let h = elemH
	let x = 0
	let y = 0

	// 1. Parse background-size
	// Supports: "100% 40%", "50px 50px", "cover", "contain", "auto"
	if (backgroundSize && backgroundSize !== "auto") {
		const parts = backgroundSize.split(" ")
		const wStr = parts[0]
		const hStr = parts[1] || "auto"

		if (wStr === "cover" || wStr === "contain") {
			// Do not handle cover/contain for now; keep the original dimensions
		} else {
			// Parse width
			if (wStr.endsWith("%")) {
				w = (parseFloat(wStr) / 100) * elemW
			} else if (wStr.endsWith("px")) {
				w = parseFloat(wStr)
			}
			
			// Parse height
			if (hStr === "auto") {
				// Preserve aspect ratio? For now, simply use elemH, e.g. when W is 100%
				// If only one value is provided, the second defaults to auto. Images usually preserve ratio, but auto is poorly defined for gradients/shapes
				// The user case is "100% 40%", so focus on that
				h = elemH 
			} else if (hStr.endsWith("%")) {
				h = (parseFloat(hStr) / 100) * elemH
			} else if (hStr.endsWith("px")) {
				h = parseFloat(hStr)
			}
		}
	}

	// 2. Parse background-position
	// Supports: "0 85%", "10px 20px", "center center"
	// Default is "0% 0%"
	if (backgroundPosition) {
		const parts = backgroundPosition.split(" ")
		const xStr = parts[0] || "0%"
		const yStr = parts[1] || "50%" // If there is only one value, the second defaults to center (50%)

		// Parse X
		if (xStr.endsWith("%")) {
			const percent = parseFloat(xStr) / 100
			x = (elemW - w) * percent
		} else if (xStr.endsWith("px")) {
			x = parseFloat(xStr)
		} else if (xStr === "left") {
			x = 0
		} else if (xStr === "right") {
			x = elemW - w
		} else if (xStr === "center") {
			x = (elemW - w) / 2
		}

		// Parse Y
		if (yStr.endsWith("%")) {
			const percent = parseFloat(yStr) / 100
			y = (elemH - h) * percent
		} else if (yStr.endsWith("px")) {
			y = parseFloat(yStr)
		} else if (yStr === "top") {
			y = 0
		} else if (yStr === "bottom") {
			y = elemH - h
		} else if (yStr === "center") {
			y = (elemH - h) / 2
		}
	}

	// If the parsed result matches the original size, return null to indicate no special handling is needed
	if (Math.abs(w - elemW) < 0.1 && Math.abs(h - elemH) < 0.1 && Math.abs(x) < 0.1 && Math.abs(y) < 0.1) {
		return null
	}

	return { x, y, w, h }
}
