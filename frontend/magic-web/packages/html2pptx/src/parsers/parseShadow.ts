/**
 * Shadow parser.
 * Converts CSS box-shadow into the PPT shadow format.
 */

import type { PPTShadow } from "../ir/style"
import { colorToHex, getShadowOpacity } from "../shared/color"
import { pxToPt } from "../shared/unit"
import { splitByTopLevelComma } from "../shared/string"

/** Parsed CSS shadow result, compatible with box-shadow and text-shadow */
interface CSSShadow {
	inset: boolean
	offsetX: number // px
	offsetY: number // px
	blur: number // px
	spread: number // px; always 0 for text-shadow
	color: string
}

/**
 * Parse CSS box-shadow into PPT shadow format
 * Handle box-shadow and text-shadow uniformly
 * Note: PPT does not support inner shadows, so inset is ignored or treated as outer
 */
export function parseShadow(value: string): PPTShadow | null {
	if (!value || value === "none") return null

	// Parse CSS box-shadow / text-shadow
	const cssShadow = parseCSSShadow(value)
	if (!cssShadow) return null

	// Cartesian coordinates -> polar coordinates
	const { angle, distance } = cartesianToPolar(cssShadow.offsetX, cssShadow.offsetY)

const opacity = getShadowOpacity(cssShadow.color)

	return {
		type: "outer", // Force outer because PPT does not actually support inner shadows
		angle,
		blur: pxToPt(cssShadow.blur),
		offset: pxToPt(distance),
		color: colorToHex(cssShadow.color),
		opacity,
	}
}
/**
 * Parse a CSS shadow string
 * Supported format:
 * - "10px 10px 5px rgba(0,0,0,0.5)"
 * - "inset 2px 2px 4px 0px #000"
 * - "5px 5px 10px 2px red"
 */
function parseCSSShadow(value: string): CSSShadow | null {
	const trimmed = value.trim()
	if (!trimmed || trimmed === "none") return null

	// Check whether there are multiple shadows
	// Iterate all shadows and find the first visible one, not fully transparent and with blur or offset
	const shadows = splitByTopLevelComma(trimmed)
	let targetShadow = shadows[0]

	for (const shadow of shadows) {
		const { color } = extractColor(shadow)
		const opacity = getShadowOpacity(color)
		// Skip shadows that are fully transparent (opacity === 0)
		if (opacity > 0) {
			targetShadow = shadow
			break
		}
	}

	if (!targetShadow) return null

	// Check inset
	const inset = targetShadow.includes("inset")
	const withoutInset = targetShadow.replace(/\binset\b/gi, "").trim()

	// Extract color, which may appear at the beginning or end
	const { color, remaining } = extractColor(withoutInset)

	// Parse numeric parts
	const numbers = remaining.match(/-?[\d.]+px/g)
	if (!numbers || numbers.length < 2) return null

	const values = numbers.map((n) => parseFloat(n))

	return {
		inset,
		offsetX: values[0] || 0,
		offsetY: values[1] || 0,
		blur: values[2] || 0,
		spread: values[3] || 0,
		color: color || "rgba(0,0,0,0.5)",
	}
}


/**
 * Extract color from a string
 */
function extractColor(str: string): { color: string; remaining: string } {
	// Match rgb/rgba
	const rgbMatch = str.match(/rgba?\([^)]+\)/i)
	if (rgbMatch) {
		return {
			color: rgbMatch[0],
			remaining: str.replace(rgbMatch[0], "").trim(),
		}
	}

	// Match HEX
	const hexMatch = str.match(/#[0-9a-fA-F]{3,8}\b/)
	if (hexMatch) {
		return {
			color: hexMatch[0],
			remaining: str.replace(hexMatch[0], "").trim(),
		}
	}

	// Match named colors after numeric values
	const parts = str.split(/\s+/)
	const numericParts: string[] = []
	let colorPart = ""

	for (const part of parts) {
		if (/^-?[\d.]+px$/.test(part)) {
			numericParts.push(part)
		} else if (!colorPart && /^[a-zA-Z]+$/.test(part)) {
			colorPart = part
		}
	}

	return {
		color: colorPart || "black",
		remaining: numericParts.join(" "),
	}
}

/**
 * Convert Cartesian coordinates to polar coordinates
 * @param x - Horizontal offset; positive is right
 * @param y - Vertical offset; positive is down
 * @returns { angle, distance }
 */
function cartesianToPolar(x: number, y: number): { angle: number; distance: number } {
	// Calculate distance
	const distance = Math.sqrt(x * x + y * y)

	// Calculate angle; atan2 returns radians from -pi to pi
	// CSS: positive x is right, positive y is down
	// PPT: 0 degrees points right, clockwise
	let angle = Math.atan2(y, x) * (180 / Math.PI)

	// Convert to 0-360 degrees
	if (angle < 0) angle += 360

	return {
		angle: Math.round(angle),
		distance: Math.round(distance * 100) / 100,
	}
}
