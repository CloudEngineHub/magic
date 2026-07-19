import type { ElementNode } from "../ir/dom"
import type { PPTShapeNode, PPTNodeBase } from "../ir/node"
import type { PPTFill } from "../ir/style"
import type { SlideConfig } from "../api/options"
import { colorToHex, getTransparency, hasVisibleBackground, isGradientBackground, parseGradient, parseBlur } from "../shared/color"
import { hasUniformBorder } from "../shared/element-predicates"
import { pxToInch, parseBorderRadius, isFullyRounded, pxToPt, ptToInch, getGlobalTransform } from "../shared/unit"
import { parseShadow } from "./parseShadow"
import { parseBackgroundLayout } from "./parseBackground"
import { mapBorderStyle } from "./parseBorder"
import { canUseFragmentedBackground, resolveFragmentFill } from "./shape/fragment"
import { parseClipPathPolygon } from "./shape/clipPath"

/**
 * Parse shapes (background color, border, corner radius, gradient)
 */
export interface ParseShapeOptions {
	/** Skip gradient parsing because the gradient is handled by screenshot; keep only solid fill and border */
	skipGradient?: boolean
}

export function parseShape(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	options?: ParseShapeOptions,
): PPTShapeNode | null {
	const { style, rect } = node

	// Check background-clip: text; if text clipping is used, leave the gradient background to text handling
	const bgImage = style.backgroundImage
	const isTextClip = style.backgroundClip === "text"
	// Check for gradient backgrounds, excluding text-clip cases and caller-requested gradient skipping
	const hasGradient = !isTextClip && !options?.skipGradient && isGradientBackground(bgImage)
	// Check for a visible solid fill
	const hasFill = hasVisibleBackground(style.backgroundColor)
	// Check whether all four borders are identical; inconsistent borders are handled by parseBorderLines
	const hasBorder = hasUniformBorder(style)

	// If none exist, do not generate a shape node
	if (!hasFill && !hasBorder && !hasGradient) return null

	// Parse fill
	let fill: PPTFill | null = null

	// Prefer gradient background
	if (hasGradient) {
		const gradient = parseGradient(bgImage)
		if (gradient) {
			// Check whether all stops are opaque
			const hasTransparency = gradient.stops.some((stop) => {
				const transparency = stop.transparency ?? 0
				return transparency > 0
			})

			if (!hasTransparency) {
				// Only consider opacity when the gradient colors themselves have no transparency
				const opacity = parseFloat(style.opacity)
				if (opacity < 1) {
					// Apply opacity only when fully opaque
					const newTransparency = Math.round((1 - opacity) * 100)
					gradient.stops.forEach((stop) => {
						stop.transparency = newTransparency
					})
				}
			}
			fill = gradient
		}
	}

	// Use solid color when there is no gradient
	if (!fill && hasFill) {
		let transparency = getTransparency(style.backgroundColor)

		// If the color itself is opaque but opacity is set, use opacity as transparency
		if (transparency === 0) {
			const opacity = parseFloat(style.opacity)
			if (opacity < 1) {
				transparency = Math.round((1 - opacity) * 100)
			}
		}

		fill = {
			type: "solid" as const,
			color: colorToHex(style.backgroundColor),
			transparency,
		}
	}

	// Parse borders, only handling the all-sides-identical case
	let line = null
	if (hasBorder) {
		// When all sides are identical, use any side; top is used here
		const borderWidthPx = parseFloat(style.borderTopWidth) || 1
		const borderTransparency = getTransparency(style.borderTopColor)
		line = {
			color: colorToHex(style.borderTopColor),
			width: pxToInch(borderWidthPx, config),
			style: mapBorderStyle(style.borderTopStyle),
			transparency: borderTransparency,
		}
	}

	// Parse corner radius
	const radiusPx = parseBorderRadius(style.borderRadius, rect.w, rect.h)
	const radius = pxToInch(radiusPx, config)

	// Determine shape type
	const clipPoints = parseClipPathPolygon(style.clipPath, base.w, base.h)
	let shapeType: "rect" | "roundRect" | "ellipse" | "custGeom" = "rect"
	if (clipPoints) {
		shapeType = "custGeom"
	} else {
		const isEllipse = isFullyRounded(style.borderRadius, rect.w, rect.h)
		if (isEllipse) {
			shapeType = "ellipse"
		} else if (radius > 0) {
			shapeType = "roundRect"
		}
	}

	// Parse shadow
	const shadow = parseShadow(style.boxShadow)

	// Parse blur filter and convert it to soft edges
	const blurPx = parseBlur(style.filter)
	let softEdge = blurPx && blurPx > 0 ? pxToPt(blurPx) : undefined

	let finalRect = { ...base }
	
	const { rotation, scaleX, scaleY } = getGlobalTransform(node)
	let rotate = rotation !== 0 ? rotation : undefined

	// Check for custom background size/position
	// Whether the fill is gradient or solid, background-size/position should apply when set
	let bgLayout = null
	if (hasGradient || hasFill) {
		bgLayout = parseBackgroundLayout(style, node.layout.offsetWidth, node.layout.offsetHeight)
	}

	// Recalculate geometry when background adjustment, rotation, or scale is present
	if (bgLayout || rotate || Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
		const elemW = node.layout.offsetWidth
		const elemH = node.layout.offsetHeight
		
		// Target size before scaling
		const targetW = bgLayout ? bgLayout.w : elemW
		const targetH = bgLayout ? bgLayout.h : elemH
		
		// Target center offset relative to the element top-left before scaling
		const targetCenterX = bgLayout ? bgLayout.x + bgLayout.w / 2 : elemW / 2
		const targetCenterY = bgLayout ? bgLayout.y + bgLayout.h / 2 : elemH / 2
		
		// Element geometry center offset relative to the element top-left
		const elemCenterX = elemW / 2
		const elemCenterY = elemH / 2
		
		// Offset from the element center to the target center
		const dx = targetCenterX - elemCenterX
		const dy = targetCenterY - elemCenterY
		
		// Apply rotation by rotating the offset
		const rad = (rotation || 0) * Math.PI / 180
		const cos = Math.cos(rad)
		const sin = Math.sin(rad)
		
		// Rotated offset after scaling, assuming transform-origin is center
		const scaledDx = dx * scaleX
		const scaledDy = dy * scaleY
		
		const rotatedDx = scaledDx * cos - scaledDy * sin
		const rotatedDy = scaledDx * sin + scaledDy * cos
		
		// Element global center based on bounding rect
		const globalElemCenterX = rect.x + rect.w / 2
		const globalElemCenterY = rect.y + rect.h / 2
		
		// Target global center
		const globalTargetCenterX = globalElemCenterX + rotatedDx
		const globalTargetCenterY = globalElemCenterY + rotatedDy
		
		// Final target size after scaling
		const finalW = targetW * scaleX
		const finalH = targetH * scaleY
		
		finalRect.x = pxToInch(globalTargetCenterX - finalW / 2, config)
		finalRect.y = pxToInch(globalTargetCenterY - finalH / 2, config)
		finalRect.w = pxToInch(finalW, config)
		finalRect.h = pxToInch(finalH, config)
	}

	if (softEdge) {
		// Increase the blur-radius conversion factor to make blur more visible
		// PPT soft edges are weaker than CSS blur, so amplify the factor
		softEdge = Math.min(100, softEdge * 2.5)

		// Expand the shape size
		// Add softEdge size on both left and right
		const expansion = ptToInch(softEdge)
		finalRect.x -= expansion
		finalRect.y -= expansion
		finalRect.w += expansion * 2
		finalRect.h += expansion * 2
	}

	return {
		...finalRect,
		type: "shape",
		shapeType,
		fill,
		line,
		shadow,
		radius: shapeType === "roundRect" && radius > 0 ? radius : undefined,
		points: clipPoints ?? undefined,
		softEdge,
		rotate: rotate !== 0 ? rotate : undefined,
	}
}

/**
 * Generic fragmented-background parsing: when the browser splits an element into multiple render fragments,
 * generate one shape per fragment to avoid merging the background into one large rectangle.
 */
export function parseFragmentedShapeNodes(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
): PPTShapeNode[] {
	const { style, element, rect } = node
	const fill = resolveFragmentFill(style)
	if (!fill) return []

	const clientRects = Array.from(element.getClientRects())
	if (clientRects.length <= 1) return []
	if (!canUseFragmentedBackground(node)) return []

	const elementBounds = element.getBoundingClientRect()
	const offsetX = rect.x - elementBounds.left
	const offsetY = rect.y - elementBounds.top
	const baseRadiusPx = parseBorderRadius(style.borderRadius, rect.w, rect.h)

	return clientRects
		.map((fragment) => {
			if (fragment.width <= 0 || fragment.height <= 0) return null
			const fragmentLayout = parseBackgroundLayout(style, fragment.width, fragment.height)
			const targetX = fragment.left + offsetX + (fragmentLayout?.x ?? 0)
			const targetY = fragment.top + offsetY + (fragmentLayout?.y ?? 0)
			const targetW = fragmentLayout?.w ?? fragment.width
			const targetH = fragmentLayout?.h ?? fragment.height
			if (targetW <= 0 || targetH <= 0) return null

			const radiusPx = Math.min(
				baseRadiusPx,
				Math.min(targetW, targetH) / 2,
			)
			const radius = pxToInch(radiusPx, config)
			const shapeType: "rect" | "roundRect" | "ellipse" =
				radius > 0 ? "roundRect" : "rect"

			const shapeNode: PPTShapeNode = {
				...base,
				type: "shape",
				x: pxToInch(targetX, config),
				y: pxToInch(targetY, config),
				w: pxToInch(targetW, config),
				h: pxToInch(targetH, config),
				shapeType,
				fill,
				line: null,
				shadow: null,
				radius: shapeType === "roundRect" ? radius : undefined,
			}
			return shapeNode
		})
		.filter((shape): shape is PPTShapeNode => shape !== null)
}
