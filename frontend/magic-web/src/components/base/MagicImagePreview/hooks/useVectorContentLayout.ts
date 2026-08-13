import type { RefObject } from "react"
import { useLayoutEffect } from "react"

export function getVectorDisplaySize(svg: SVGSVGElement, scale: number) {
	const viewBox = svg.viewBox.baseVal
	const intrinsicWidth =
		viewBox.width ||
		svg.width?.baseVal.value ||
		Number.parseFloat(svg.getAttribute("width") || "")
	const intrinsicHeight =
		viewBox.height ||
		svg.height?.baseVal.value ||
		Number.parseFloat(svg.getAttribute("height") || "")

	if (!intrinsicWidth || !intrinsicHeight || !Number.isFinite(scale) || scale <= 0) {
		return undefined
	}

	return {
		width: intrinsicWidth * scale,
		height: intrinsicHeight * scale,
	}
}

/**
 * Resize inline SVG content at layout time so the browser redraws vectors at
 * the requested zoom level instead of enlarging a GPU-cached texture.
 */
const useVectorContentLayout = (
	contentRef: RefObject<HTMLElement>,
	enabled: boolean,
	scale: number,
	contentKey: string,
) => {
	useLayoutEffect(() => {
		if (!enabled) return

		const svg = contentRef.current?.querySelector("svg")
		if (!svg) return

		const displaySize = getVectorDisplaySize(svg, scale)
		if (!displaySize) return

		const previousCssText = svg.style.cssText
		svg.style.setProperty("width", `${displaySize.width}px`, "important")
		svg.style.setProperty("height", `${displaySize.height}px`, "important")
		svg.style.setProperty("max-width", "none", "important")
		svg.style.setProperty("max-height", "none", "important")
		svg.style.setProperty("flex", "none")

		return () => {
			svg.style.cssText = previousCssText
		}
	}, [contentKey, contentRef, enabled, scale])
}

export default useVectorContentLayout
