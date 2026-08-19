import type { RefObject } from "react"
import { useLayoutEffect, useState } from "react"

interface CalculateFitScaleOptions {
	intrinsicWidth: number
	intrinsicHeight: number
	layoutWidth: number
	layoutHeight: number
	objectFit?: CSSStyleDeclaration["objectFit"]
}

const DEFAULT_FIT_SCALE = 1

export function calculateFitScale({
	intrinsicWidth,
	intrinsicHeight,
	layoutWidth,
	layoutHeight,
	objectFit = "fill",
}: CalculateFitScaleOptions) {
	if (!intrinsicWidth || !intrinsicHeight || !layoutWidth || !layoutHeight) {
		return DEFAULT_FIT_SCALE
	}

	const widthScale = layoutWidth / intrinsicWidth
	const heightScale = layoutHeight / intrinsicHeight

	switch (objectFit) {
		case "contain":
			return Math.min(widthScale, heightScale)
		case "cover":
			return Math.max(widthScale, heightScale)
		case "none":
			return DEFAULT_FIT_SCALE
		case "scale-down":
			return Math.min(DEFAULT_FIT_SCALE, widthScale, heightScale)
		default:
			// A uniformly sized image has equal ratios. For a stretched image, use the smaller
			// ratio as the single zoom reference so neither axis is reported above its real size.
			return Math.min(widthScale, heightScale)
	}
}

function getImageFitScale(image: HTMLImageElement) {
	return calculateFitScale({
		intrinsicWidth: image.naturalWidth,
		intrinsicHeight: image.naturalHeight,
		layoutWidth: image.clientWidth,
		layoutHeight: image.clientHeight,
		objectFit: getComputedStyle(image).objectFit,
	})
}

function getSvgFitScale(svg: SVGSVGElement, container: HTMLElement) {
	const viewBox = svg.viewBox.baseVal
	const intrinsicWidth =
		viewBox.width ||
		svg.width?.baseVal.value ||
		Number.parseFloat(svg.getAttribute("width") || "")
	const intrinsicHeight =
		viewBox.height ||
		svg.height?.baseVal.value ||
		Number.parseFloat(svg.getAttribute("height") || "")

	return calculateFitScale({
		intrinsicWidth,
		intrinsicHeight,
		// Measure against the viewport instead of the SVG's current layout size.
		// Vector previews change their real width/height while zooming; using those
		// dimensions here would feed the zoomed size back into fitScale.
		layoutWidth: container.clientWidth,
		layoutHeight: container.clientHeight,
		objectFit: "contain",
	})
}

/**
 * Returns the current fit scale when the content has enough intrinsic/layout
 * dimensions to be measured. `undefined` means that the content is still
 * loading (or temporarily absent), so callers can keep the last known value
 * instead of treating the transient state as a real 100% scale.
 */
function measureContentFitScale(container: HTMLElement) {
	const loadedImages = Array.from(container.querySelectorAll("img")).filter(
		(image) => image.naturalWidth > 0 && image.naturalHeight > 0,
	)

	if (loadedImages.length > 0) {
		// Comparison mode can contain multiple images. The highest-resolution image is the
		// most useful source of truth for the original physical dimensions.
		const sourceImage = loadedImages.reduce((largest, image) =>
			image.naturalWidth * image.naturalHeight > largest.naturalWidth * largest.naturalHeight
				? image
				: largest,
		)
		return getImageFitScale(sourceImage)
	}

	const svgs = Array.from(container.querySelectorAll("svg")).filter((svg) => {
		const viewBox = svg.viewBox.baseVal
		return (
			(viewBox.width ||
				svg.width?.baseVal.value ||
				Number.parseFloat(svg.getAttribute("width") || "")) &&
			(viewBox.height ||
				svg.height?.baseVal.value ||
				Number.parseFloat(svg.getAttribute("height") || ""))
		)
	})
	if (svgs.length === 0) return undefined

	const sourceSvg = svgs.reduce((largest, svg) => {
		const size = svg.viewBox.baseVal
		const largestSize = largest.viewBox.baseVal
		return size.width * size.height > largestSize.width * largestSize.height ? svg : largest
	})
	return getSvgFitScale(sourceSvg, container)
}

/** Measures how much the browser's fitted layout scales the original image or SVG. */
const useContentFitScale = (contentRef: RefObject<HTMLElement>) => {
	const [fitScale, setFitScale] = useState(DEFAULT_FIT_SCALE)

	useLayoutEffect(() => {
		const container = contentRef.current
		if (!container) return

		let rafId: number | undefined
		const measure = () => {
			if (rafId !== undefined) cancelAnimationFrame(rafId)
			rafId = requestAnimationFrame(() => {
				const nextScale = measureContentFitScale(container)
				if (nextScale === undefined) return
				setFitScale((currentScale) =>
					Math.abs(currentScale - nextScale) > 0.0001 ? nextScale : currentScale,
				)
			})
		}

		measure()
		container.addEventListener("load", measure, true)

		const resizeObserver = new ResizeObserver(measure)
		const observeMediaElements = () => {
			container.querySelectorAll("img, svg").forEach((element) => {
				resizeObserver.observe(element)
			})
		}

		resizeObserver.observe(container)
		observeMediaElements()

		const mutationObserver = new MutationObserver(() => {
			// Only child insertion/removal needs this rescan. Attribute mutations
			// include the transform style updated during zoom/drag and would cause
			// a layout read + observer churn on every interaction frame.
			observeMediaElements()
			measure()
		})
		mutationObserver.observe(container, {
			childList: true,
			subtree: true,
		})

		return () => {
			if (rafId !== undefined) cancelAnimationFrame(rafId)
			container.removeEventListener("load", measure, true)
			resizeObserver.disconnect()
			mutationObserver.disconnect()
		}
	}, [contentRef])

	return fitScale
}

export default useContentFitScale
