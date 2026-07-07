/**
 * Color utility functions
 */

import type { ElementNode } from "../ir/dom"
import type { PPTTextGradient } from "../ir/node"
import { splitByTopLevelComma } from "./string"

const effectiveOpacityCache = new WeakMap<Element, number>()
const nodeOpacityCache = new WeakMap<ElementNode, number>()

/**
 * Parse RGBA/RGB colors into HEX format without #
 */
export function colorToHex(color: unknown): string {
	if (!color || typeof color !== "string") return "000000"

	if (color.startsWith("#")) {
		const hex = color.slice(1)
		if (hex.length === 3) {
			return hex
				.split("")
				.map((c) => c + c)
				.join("")
				.toUpperCase()
		}
		return hex.toUpperCase().slice(0, 6)
	}

	const rgbaMatch = color.match(/rgba?\(([\d\s,\.]+)\)/)
	if (rgbaMatch) {
		const parts = rgbaMatch[1].split(",").map((s) => parseFloat(s.trim()))
		const [r, g, b] = parts
		return [r, g, b]
			.map((v) =>
				Math.round(Math.max(0, Math.min(255, v)))
					.toString(16)
					.padStart(2, "0"),
			)
			.join("")
			.toUpperCase()
	}

	const namedColors: Record<string, string> = {
		transparent: "000000",
		black: "000000",
		white: "FFFFFF",
		red: "FF0000",
		green: "008000",
		blue: "0000FF",
		yellow: "FFFF00",
		cyan: "00FFFF",
		magenta: "FF00FF",
		gray: "808080",
		grey: "808080",
	}

	const lower = color.toLowerCase()
	if (namedColors[lower]) return namedColors[lower]

	return "000000"
}

/**
 * Extract transparency from a color string (0-100)
 * 0 = fully opaque, 100 = fully transparent
 */
export function getTransparency(color: unknown): number {
	if (!color || typeof color !== "string" || color === "transparent") return 100

	const rgbaMatch = color.match(/rgba\([\d\s,]+,\s*([\d.]+)\)/)
	if (rgbaMatch) {
		const alpha = parseFloat(rgbaMatch[1])
		return Math.round((1 - alpha) * 100)
	}

	return 0
}

/**
 * Extract opacity from a color string (0-1) for shadows
 * 0.0 = fully transparent, 1.0 = fully opaque
 * This is the inverse of transparency used elsewhere in PPT (0-100, 100=fully transparent)
 */
export function getShadowOpacity(color: string): number {
	if (!color || color === "transparent") return 0

	const rgbaMatch = color.match(/rgba\([\d\s,]+,\s*([\d.]+)\)/)
	if (rgbaMatch) {
		const alpha = parseFloat(rgbaMatch[1])
		return Math.max(0, Math.min(1, alpha))
	}

	return 1
}

/**
 * Determine whether a color is visible (not transparent)
 */
export function isVisibleColor(color: string): boolean {
	if (!color) return false
	if (color === "transparent") return false
	if (color === "rgba(0, 0, 0, 0)") return false

	const transparency = getTransparency(color)
	return transparency < 100
}

/**
 * Determine whether there is a visible background color
 */
export function hasVisibleBackground(backgroundColor: string): boolean {
	return isVisibleColor(backgroundColor)
}

/**
 * Parse a CSS opacity value and return a 0-1 number
 */
export function parseOpacityValue(value: string): number {
	const parsed = parseFloat(value)
	if (Number.isNaN(parsed)) return 1
	return Math.max(0, Math.min(1, parsed))
}

/**
 * Calculate cumulative transparency for an element and all ancestors
 */
export function getEffectiveOpacity(element: Element): number {
	const doc = element.ownerDocument
	const win = doc?.defaultView
	if (!doc || !win) return 1
	const cached = effectiveOpacityCache.get(element)
	if (cached !== undefined) return cached

	let opacity = 1
	let current: Element | null = element

	while (current && current !== doc.body && current.parentElement) {
		const currentCached = effectiveOpacityCache.get(current)
		if (currentCached !== undefined) {
			opacity *= currentCached
			break
		}
		const style = win.getComputedStyle(current)
		const elOpacity = parseOpacityValue(style.opacity)
		opacity *= elOpacity
		current = current.parentElement
	}

	effectiveOpacityCache.set(element, opacity)
	return opacity
}

/**
 * Calculate cumulative transparency from the ElementNode tree, reusing style.opacity collected by the collector,
 * avoiding extra getComputedStyle calls
 */
export function computeEffectiveOpacity(node: ElementNode): number {
	const cached = nodeOpacityCache.get(node)
	if (cached !== undefined) return cached

	const selfOpacity = parseOpacityValue(node.style.opacity)
	const parentOpacity = node.parent
		? computeEffectiveOpacity(node.parent)
		: 1

	const effective = selfOpacity * parentOpacity
	nodeOpacityCache.set(node, effective)
	return effective
}



/**
 * Determine whether there is a visible border
 */
export function hasVisibleBorder(
	borderStyle: string,
	borderWidth: string,
	borderColor: string,
): boolean {
	if (borderStyle === "none") return false
	const width = parseFloat(borderWidth)
	if (width <= 0) return false
	return isVisibleColor(borderColor)
}

/**
 * Parse a color with transparency and return HEX plus transparency
 */
export function parseColorWithTransparency(color: string): {
	color: string
	transparency: number
	isValid: boolean
} {
	if (!color || color === "transparent") {
		return { color: "000000", transparency: 100, isValid: false }
	}

	return {
		color: colorToHex(color),
		transparency: getTransparency(color),
		isValid: true,
	}
}

/**
 * Determine whether the background is a gradient
 */
export function isGradientBackground(backgroundImage: string): boolean {
	if (!backgroundImage || backgroundImage === "none") return false
	return backgroundImage.includes("gradient")
}

/**
 * Parse a CSS gradient into PPT gradient format
 */
export function parseGradient(backgroundImage: string): {
	type: "gradient"
	gradientType: "linear" | "radial"
	angle?: number
	style?: "circle" | "ellipse"
	stops: Array<{ position: number; color: string; transparency?: number }>
} | null {
	if (!backgroundImage || backgroundImage === "none") return null

	const linearContent = extractGradientContent(backgroundImage, "linear-gradient")
	if (linearContent) {
		return parseLinearGradient(linearContent)
	}

	const radialContent = extractGradientContent(backgroundImage, "radial-gradient")
	if (radialContent) {
		return parseRadialGradient(radialContent)
	}

	return null
}

/**
 * Extract gradient function content, supporting nested parentheses such as rgb() and rgba()
 */
function extractGradientContent(str: string, funcName: string): string | null {
	const startIndex = str.indexOf(funcName + "(")
	if (startIndex === -1) return null

	const contentStart = startIndex + funcName.length + 1
	let depth = 1
	let i = contentStart

	while (i < str.length && depth > 0) {
		if (str[i] === "(") depth++
		if (str[i] === ")") depth--
		i++
	}

	if (depth === 0) {
		return str.slice(contentStart, i - 1)
	}
	return null
}

/**
 * Parse a linear gradient
 */
function parseLinearGradient(content: string): {
	type: "gradient"
	gradientType: "linear"
	angle: number
	stops: Array<{ position: number; color: string; transparency?: number }>
} {
	const parts = splitByTopLevelComma(content)
	let cssAngle = 180
	let colorStops: string[] = []

	const firstPart = parts[0]
	if (firstPart) {
		const degMatch = firstPart.match(/([\d.]+)deg/)
		if (degMatch) {
			cssAngle = parseFloat(degMatch[1])
			colorStops = parts.slice(1)
		}
		else if (firstPart.startsWith("to ")) {
			cssAngle = directionToAngle(firstPart)
			colorStops = parts.slice(1)
		}
		else {
			colorStops = parts
		}
	}

	const stops = parseColorStops(colorStops)

	return {
		type: "gradient",
		gradientType: "linear",
		angle: cssAngleToPptAngle(cssAngle),
		stops,
	}
}

function cssAngleToPptAngle(cssDeg: number): number {
	const css = ((cssDeg % 360) + 360) % 360
	// CSS: 0=up, 90=right; PPT: 0=right, 90=down
	return (css + 270) % 360
}

/**
 * Parse a radial gradient
 */
function parseRadialGradient(content: string): {
	type: "gradient"
	gradientType: "radial"
	style: "circle" | "ellipse"
	stops: Array<{ position: number; color: string; transparency?: number }>
} {
	const parts = splitByTopLevelComma(content)
	let colorStops: string[] = []
	let style: "circle" | "ellipse" = "ellipse"

	const firstPart = parts[0]
	if (firstPart && (firstPart.includes("circle") || firstPart.includes("ellipse") || firstPart.includes("at "))) {
		if (firstPart.includes("circle")) {
			style = "circle"
		}
		colorStops = parts.slice(1)
	} else {
		colorStops = parts
	}

	const stops = parseColorStops(colorStops)

	return {
		type: "gradient",
		gradientType: "radial",
		style,
		stops,
	}
}

/**
 * Convert direction to angle
 */
function directionToAngle(direction: string): number {
	const dirMap: Record<string, number> = {
		"to top": 0,
		"to right": 90,
		"to bottom": 180,
		"to left": 270,
		"to top right": 45,
		"to right top": 45,
		"to bottom right": 135,
		"to right bottom": 135,
		"to bottom left": 225,
		"to left bottom": 225,
		"to top left": 315,
		"to left top": 315,
	}
	return dirMap[direction] ?? 180
}

/**
 * Parse a color stop
 */
function parseColorStops(parts: string[]): Array<{ position: number; color: string; transparency?: number }> {
	const stops: Array<{ position: number; color: string; transparency?: number }> = []

	parts.forEach((part, index) => {
		const trimmed = part.trim()
		if (!trimmed) return

		const posMatch = trimmed.match(/\s+([\d.]+)%\s*$/)
		let position: number

		if (posMatch) {
			position = parseFloat(posMatch[1]) / 100
		} else {
			position = parts.length > 1 ? index / (parts.length - 1) : 0
		}

		const colorStr = posMatch ? trimmed.replace(/\s+([\d.]+)%\s*$/, "").trim() : trimmed

		const hex = colorToHex(colorStr)
		const transparency = getTransparency(colorStr)

		stops.push({
			position,
			color: hex,
			transparency: transparency > 0 ? transparency : undefined,
		})
	})

	if (stops.length === 0) {
		return [
			{ position: 0, color: "FFFFFF" },
			{ position: 1, color: "000000" },
		]
	}
	if (stops.length === 1) {
		stops.push({ position: 1, color: stops[0].color })
	}

	return stops
}

/**
 * Parse the blur value in a CSS filter in pixels
 */
export function parseBlur(filter: string): number | null {
	if (!filter || filter === "none") return null
	const match = filter.match(/blur\(([\d.]+)px\)/)
	return match ? parseFloat(match[1]) : null
}

/**
 * Extract the first color from a gradient
 * If text uses a gradient, take the first color as the solid color and preserve its transparency
 */
export function extractFirstColorFromGradient(
	backgroundImage: string,
): { color: string; transparency: number } | null {
	const gradient = parseGradient(backgroundImage)
	if (!gradient || !gradient.stops.length) return null

	const firstStop = gradient.stops[0]

	return {
		color: firstStop.color,
		transparency: firstStop.transparency ?? 0,
	}
}

/**
 * Merge the element-level opacity into gradient stop transparency
 */
export function mergeGradientStopsWithElementOpacity(
	gradient: PPTTextGradient,
	elementOpacity: number,
): PPTTextGradient {
	if (elementOpacity >= 1) return gradient

	const normalizedOpacity = Math.max(0, Math.min(1, elementOpacity))
	const stops = gradient.stops.map((stop) => {
		const stopTransparency = stop.transparency ?? 0
		const stopAlpha = 1 - stopTransparency / 100
		const mergedAlpha = stopAlpha * normalizedOpacity
		const mergedTransparency = Math.round((1 - mergedAlpha) * 100)

		return {
			...stop,
			transparency: mergedTransparency > 0 ? mergedTransparency : undefined,
		}
	})

	return {
		...gradient,
		stops,
	}
}
