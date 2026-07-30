import type { ElementNode } from "../ir/dom"
import type { PPTImageNode, PPTNodeBase } from "../ir/node"
import type { SlideConfig } from "../api/options"
import { computeEffectiveOpacity } from "../shared/color"
import { pxToInch, resolveEffectiveRadius, getGlobalTransform } from "../shared/unit"

/**
 * Parse an image from an IMG tag or background-image.
 */
export function parseImage(
	node: ElementNode,
	base: PPTNodeBase,
	config: SlideConfig,
	iWindow: Window,
): PPTImageNode | null {
	const { tagName, style, element, rect } = node

	// Compute cumulative opacity from the collected ElementNode to avoid another getComputedStyle call.
	const opacity = computeEffectiveOpacity(node)
	const transparency = opacity < 1 ? Math.round((1 - opacity) * 100) : undefined

	const radiusPx = resolveEffectiveRadius(node)
	const radius = radiusPx > 0 ? pxToInch(radiusPx, config) : undefined

	// Correct transform effects, including rotation and scale.
	const { rotation, scaleX, scaleY } = getGlobalTransform(node)

	let finalRect = { ...base }
	let rotate = rotation !== 0 ? rotation : undefined

	// Apply correction whenever rotation or meaningful scale is present.
	if (rotate || Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01) {
		// Use the original layout size multiplied by cumulative scale.
		const realW = node.layout.offsetWidth * scaleX
		const realH = node.layout.offsetHeight * scaleY

		// Calculate the center of the current bounding box.
		const cx = rect.x + rect.w / 2
		const cy = rect.y + rect.h / 2

		// Infer the pre-transform top-left position.
		const x = cx - realW / 2
		const y = cy - realH / 2

		finalRect.x = pxToInch(x, config)
		finalRect.y = pxToInch(y, config)
		finalRect.w = pxToInch(realW, config)
		finalRect.h = pxToInch(realH, config)
	}

	// Handle IMG tags.
	if (tagName === "IMG") {
		const imgElement = element as HTMLImageElement
		const src = imgElement.src || imgElement.getAttribute("src")

		if (!src) return null

		// Map CSS object-fit to PPT sizing to avoid unwanted cropping from the default cover behavior.
		const objectFit = (style.objectFit || "").trim().toLowerCase()
		let sizing: "cover" | "contain" | "stretch" = "stretch"
		if (objectFit === "cover") sizing = "cover"
		else if (objectFit === "contain" || objectFit === "scale-down" || objectFit === "none") sizing = "contain"
		else if (objectFit === "fill" || !objectFit) sizing = "stretch"

		const intrinsicSize = imgElement.naturalWidth > 0 && imgElement.naturalHeight > 0
			? { width: imgElement.naturalWidth, height: imgElement.naturalHeight }
			: undefined

		return {
			...finalRect,
			type: "image",
			src,
			sizing,
			intrinsicSize,
			transparency,
			radius, // Apply corner radius.
			rotate, // Apply rotation.
		}
	}

	// Handle background-image.
	const bgImage = style.backgroundImage
	if (!bgImage || bgImage === "none") return null

	// Skip gradient backgrounds; parseShape handles them.
	if (bgImage.includes("gradient")) return null

	// Extract the image URL from url().
	const urlMatch = bgImage.match(/url\(["']?([^"')]+)["']?\)/)
	if (!urlMatch || !urlMatch[1]) return null

	const src = urlMatch[1]

	// Parse background-size to determine the sizing mode.
	const bgSize = style.backgroundSize
	let sizing: "cover" | "contain" | "stretch" = "cover"
	if (bgSize === "contain") sizing = "contain"
	else if (bgSize === "100% 100%" || bgSize === "stretch") sizing = "stretch"

	return {
		...finalRect,
		type: "image",
		src,
		sizing,
		transparency,
		radius, // Apply corner radius.
		rotate, // Apply rotation.
	}
}
