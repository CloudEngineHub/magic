import type { SlideConfig } from "../api/options"
import type { ElementNode } from "../ir/dom"
import { log, LogLevel } from "../logger"
import { DEFAULT_DPI } from "./constants"

/** PowerPoint single-page size limit: 56 inches = 5376 px at 96 DPI */
export const MAX_PPT_PAGE_INCH = 56
export const MAX_PPT_PAGE_PX = MAX_PPT_PAGE_INCH * DEFAULT_DPI

/** Default configuration */
export const DEFAULT_CONFIG: SlideConfig = {
	htmlWidth: 1920,
	htmlHeight: 1080,
	slideWidth: 1920 / DEFAULT_DPI,  // 20 inches
	slideHeight: 1080 / DEFAULT_DPI, // 11.25 inches
}

/**
 * Convert pixels to inches directly at 96 DPI
 * HTML pixels map to PPT inches at a 1:1 proportional scale
 *
 * For example: 96px -> 1 inch, 192px -> 2 inches
 */
export function pxToInch(px: number, _config?: SlideConfig): number {
	return px / DEFAULT_DPI
}

/**
 * Convert inches to pixels
 */
export function inchToPx(inch: number, _config?: SlideConfig): number {
	return inch * DEFAULT_DPI
}

/**
 * Parse CSS size values, supporting px, %, em, rem, vw, vh, and related units
 */
export function parseCSSSize(
	value: string,
	containerSize: number,
	viewportWidth: number = 1920,
	viewportHeight: number = 1080,
): number {
	if (!value || value === "auto") return 0

	const match = value.match(/([\d.]+)(px|%|em|rem|vw|vh|vmin|vmax)?/)
	if (!match) return 0

	const num = parseFloat(match[1])
	const unit = match[2] || "px"

	switch (unit) {
		case "px":
			return num
		case "%":
			return (containerSize * num) / 100
		case "em":
		case "rem":
			return num * 16 // Assume a base font size of 16px
		case "vw":
			return (viewportWidth * num) / 100
		case "vh":
			return (viewportHeight * num) / 100
		case "vmin":
			return (Math.min(viewportWidth, viewportHeight) * num) / 100
		case "vmax":
			return (Math.max(viewportWidth, viewportHeight) * num) / 100
		default:
			return num
	}
}

/**
 * Parse border-radius and return a pixel value
 * For multi-value radii, return the smallest non-zero value to avoid huge corners
 */
export function parseBorderRadius(
	value: string,
	width: number,
	height: number,
): number {
	if (!value || value === "0px") return 0

	const matches = value.match(/([\d.]+)(px|%|em|rem)?/g)
	if (!matches) return 0

	let minRadius = Number.MAX_VALUE
	let found = false

	for (const match of matches) {
		const m = match.match(/([\d.]+)(px|%|em|rem)?/)
		if (!m) continue

		const num = parseFloat(m[1])
		const unit = m[2] || "px"
		let px = 0

		if (unit === "%") {
			px = (Math.min(width, height) * num) / 100
		} else if (unit === "em" || unit === "rem") {
			px = num * 16
		} else {
			px = num
		}

		if (px > 0) {
			minRadius = Math.min(minRadius, px)
			found = true
		}
	}

	return found ? minRadius : 0
}

/**
 * Resolve the effective corner radius of an element in pixels
 * Prefer the element's own border-radius; if it is 0, inherit the clipping effect from a parent with overflow:hidden and border-radius
 * Used so child elements such as images get the correct radius when clipped by a parent container, such as avatar containers
 */
export function resolveEffectiveRadius(node: {
	style: { borderRadius: string; overflow?: string }
	rect: { w: number; h: number }
	parent?: { style: { borderRadius: string; overflow?: string }; rect: { w: number; h: number } } | null
}): number {
	let radiusPx = parseBorderRadius(node.style.borderRadius, node.rect.w, node.rect.h)
	if (radiusPx === 0 && node.parent) {
		const parent = node.parent
		const overflow = parent.style.overflow
		if ((overflow === "hidden" || overflow === "clip") && parent.style.borderRadius) {
			const parentRadius = parseBorderRadius(
				parent.style.borderRadius,
				parent.rect.w,
				parent.rect.h,
			)
			if (parentRadius > 0) {
				radiusPx = Math.min(parentRadius, Math.min(node.rect.w, node.rect.h) / 2)
			}
		}
	}
	return radiusPx
}

/**
 * Determine whether an ellipse shape should be used
 * Use an ellipse only when the element is nearly square and border-radius >= 50%
 * Long elements should use roundRect (pill shape) even with large corner radii
 */
export function isFullyRounded(
	borderRadius: string,
	width: number,
	height: number,
): boolean {
	if (!borderRadius || borderRadius === "0px") return false

	const aspectRatio = width / height
	const isSquareish = aspectRatio >= 0.7 && aspectRatio <= 1.43

	if (!isSquareish) return false

	const match = borderRadius.match(/([\d.]+)(px|%|em|rem)?/)
	if (!match) return false

	const num = parseFloat(match[1])
	const unit = match[2] || "px"

	if (unit === "%") {
		return num >= 50
	}

	const minHalf = Math.min(width, height) / 2
	let radiusPx = num
	if (unit === "em" || unit === "rem") {
		radiusPx = num * 16
	}

	return radiusPx >= minHalf
}

/**
 * Convert inches to points
 */
export function inchToPt(inch: number): number {
	return inch * 72
}

/**
 * Convert points to inches
 */
export function ptToInch(pt: number): number {
	return pt / 72
}

/**
 * Convert pixels to points
 * 1 inch = 96 px = 72 pt, so pt = px * 0.75
 */
export function pxToPt(px: number): number {
	return px * 0.75
}

/**
 * Recursively get the cumulative transform for an element, including rotation angle and scale
 * @param node Element node
 */
export function getGlobalTransform(
	node: ElementNode,
): { rotation: number; scaleX: number; scaleY: number } {
	let rotation = 0
	let scaleX = 1
	let scaleY = 1
	let current: ElementNode | null = node

	while (current) {
		const style = current.style ?? (current.element && (current.element as HTMLElement).style)
		const transform = style?.transform

		if (transform && transform !== "none") {
			try {
				const m = new DOMMatrix(transform)
				const angle = Math.round(Math.atan2(m.b, m.a) * (180 / Math.PI))
				rotation += angle
				const sx = Math.sqrt(m.a * m.a + m.b * m.b)
				const sy = Math.sqrt(m.c * m.c + m.d * m.d)
				scaleX *= sx
				scaleY *= sy
			} catch (e) {
				log(LogLevel.L3, "Invalid transform matrix", { error: String(e) })
			}
		}
		current = current.parent
	}

	return { rotation, scaleX, scaleY }
}
