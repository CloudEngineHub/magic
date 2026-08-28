import { snapdom } from "@zumer/snapdom"
import type { InspectedElementRect } from "./types"

interface CaptureOptions {
	iframe: HTMLIFrameElement
	/** Rectangle relative to the iframe's rendered viewport in CSS pixels. */
	selection: InspectedElementRect
	/** Optional rectangle already expressed in the host viewport's visual pixels. */
	viewportSelection?: ScreenRect
}

interface ScreenRect {
	left: number
	top: number
	width: number
	height: number
}

interface CaptureWindowMetrics {
	innerWidth: number
	innerHeight: number
	outerWidth: number
	outerHeight: number
}

interface CaptureSurfaceGeometry {
	width: number
	height: number
	viewportOffsetX: number
	viewportOffsetY: number
}

interface BitmapSize {
	width: number
	height: number
}

type PseudoElementName = "::before" | "::after"

interface MaterializedPseudoElementsCleanup {
	(): void
}

interface PseudoStyleSnapshot {
	content: string
	display: string
	visibility: string
	opacity: string
	backgroundImage: string
	backgroundColor: string
	borderStyle: string
	filter: string
}

/** Keep the screenshot crisp while preserving the drag rectangle's CSS size. */
export const CAPTURE_OUTPUT_SCALE = 2

/** Return whether a pseudo-element contributes visible content or styling. */
export function shouldMaterializePseudoElement(style: PseudoStyleSnapshot): boolean {
	const hasContent = style.content !== "none" && style.content !== "normal"
	const hasVisualLayer =
		style.backgroundImage !== "none" ||
		style.backgroundColor !== "rgba(0, 0, 0, 0)" ||
		style.borderStyle !== "none" ||
		style.filter !== "none"

	return (
		style.display !== "none" &&
		style.visibility !== "hidden" &&
		style.opacity !== "0" &&
		(hasContent || hasVisualLayer)
	)
}

/** Prefer the host drag size so iframe zoom does not change the PNG dimensions. */
export function getCaptureOutputSize(
	selection: InspectedElementRect,
	viewportSelection?: ScreenRect,
	outputScale = CAPTURE_OUTPUT_SCALE,
): BitmapSize {
	return {
		width: Math.max(1, Math.round((viewportSelection?.width ?? selection.width) * outputScale)),
		height: Math.max(
			1,
			Math.round((viewportSelection?.height ?? selection.height) * outputScale),
		),
	}
}

export interface BitmapCropSelection extends InspectedElementRect {
	/** Fallback output dimensions in the source surface's CSS pixels. */
	outputWidth: number
	outputHeight: number
}

/** Resolve the captured surface coordinate system used by getDisplayMedia. */
export function getCaptureSurfaceGeometry(
	displaySurface: string | undefined,
	metrics: CaptureWindowMetrics,
): CaptureSurfaceGeometry {
	if (displaySurface === "window") {
		return {
			width: Math.max(metrics.outerWidth, metrics.innerWidth, 1),
			height: Math.max(metrics.outerHeight, metrics.innerHeight, 1),
			// Browser window captures include the browser chrome. On macOS the
			// viewport is centered horizontally and starts below the toolbar.
			viewportOffsetX: Math.max(0, (metrics.outerWidth - metrics.innerWidth) / 2),
			viewportOffsetY: Math.max(0, metrics.outerHeight - metrics.innerHeight),
		}
	}

	return {
		width: Math.max(metrics.innerWidth, 1),
		height: Math.max(metrics.innerHeight, 1),
		viewportOffsetX: 0,
		viewportOffsetY: 0,
	}
}

/** Convert iframe CSS coordinates to coordinates in a rendered target rectangle. */
export function toRenderedSelection(
	iframe: Pick<HTMLIFrameElement, "clientWidth" | "clientHeight">,
	iframeRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	selection: InspectedElementRect,
): ScreenRect {
	const scaleX = iframeRect.width / Math.max(1, iframe.clientWidth)
	const scaleY = iframeRect.height / Math.max(1, iframe.clientHeight)

	return {
		left: iframeRect.left + selection.left * scaleX,
		top: iframeRect.top + selection.top * scaleY,
		width: selection.width * scaleX,
		height: selection.height * scaleY,
	}
}

/** Prefer the host drag rectangle when the iframe document cannot be read. */
export function resolveCaptureScreenSelection(
	iframe: Pick<HTMLIFrameElement, "clientWidth" | "clientHeight">,
	iframeRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
	selection: InspectedElementRect,
	viewportSelection?: ScreenRect,
): ScreenRect {
	return viewportSelection ?? toRenderedSelection(iframe, iframeRect, selection)
}

/** Convert iframe viewport coordinates into the coordinate system of a snapdom root. */
export function getRootCaptureSelection(
	selection: InspectedElementRect,
	rootRect: Pick<DOMRect, "left" | "top">,
): InspectedElementRect {
	return {
		...selection,
		// Both rectangles are viewport-relative, so scrolling is already
		// reflected in rootRect and must not be added a second time.
		left: selection.left - rootRect.left,
		top: selection.top - rootRect.top,
	}
}

/** Map CSS coordinates to source pixels; the caller may override output size. */
export function toBitmapCropSelection(
	selection: InspectedElementRect,
	bitmap: BitmapSize,
	renderSize: BitmapSize,
): BitmapCropSelection {
	const scaleX = bitmap.width / Math.max(1, renderSize.width)
	const scaleY = bitmap.height / Math.max(1, renderSize.height)

	return {
		left: selection.left * scaleX,
		top: selection.top * scaleY,
		width: selection.width * scaleX,
		height: selection.height * scaleY,
		outputWidth: selection.width,
		outputHeight: selection.height,
	}
}

function resolveCaptureRoot(
	documentBody: HTMLElement,
	selection: InspectedElementRect,
): HTMLElement {
	const roots = Array.from(
		documentBody.querySelectorAll<HTMLElement>(".slide-container, main.ft-canvas, main.slide"),
	)
	if (roots.length === 0) return documentBody

	const centerX = selection.left + selection.width / 2
	const centerY = selection.top + selection.height / 2
	const containingRoot = roots
		.map((root) => ({ root, rect: root.getBoundingClientRect() }))
		.filter(
			({ rect }) =>
				centerX >= rect.left &&
				centerX <= rect.right &&
				centerY >= rect.top &&
				centerY <= rect.bottom,
		)
		.sort((first, second) => {
			const firstArea = first.rect.width * first.rect.height
			const secondArea = second.rect.width * second.rect.height
			return firstArea - secondArea
		})[0]

	return containingRoot?.root ?? roots[0]
}

/**
 * Materialize pseudo-elements before snapdom clones the tree.
 *
 * snapdom can copy simple pseudo-elements, but foreignObject rendering is
 * inconsistent for absolute pseudo-elements with layered backgrounds. PPT
 * slides use those layers for the dark image mask and texture, so preserving
 * them as real children keeps the exported bitmap equal to the browser view.
 */
function materializePseudoElements(root: HTMLElement): MaterializedPseudoElementsCleanup {
	const document = root.ownerDocument
	const view = document.defaultView
	if (!view) return () => undefined

	const materialized: HTMLElement[] = []
	const hiddenAttributes: Array<{
		source: HTMLElement
		attribute: string
		previousValue: string | null
	}> = []
	const style = document.createElement("style")
	style.textContent = `
		[data-element-inspector-pseudo-before]::before,
		[data-element-inspector-pseudo-after]::after {
			content: none !important;
			display: none !important;
		}
	`
	document.head.appendChild(style)

	const restore = () => {
		for (const clone of materialized) clone.remove()
		for (const { source, attribute, previousValue } of hiddenAttributes) {
			if (previousValue === null) source.removeAttribute(attribute)
			else source.setAttribute(attribute, previousValue)
		}
		style.remove()
	}

	try {
		const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))]
		for (const source of elements) {
			for (const name of ["::before", "::after"] satisfies PseudoElementName[]) {
				const computed = view.getComputedStyle(source, name)
				if (!shouldMaterializePseudoElement(computed)) continue
				const hasContent = computed.content !== "none" && computed.content !== "normal"

				const clone = document.createElement("span")
				clone.setAttribute("aria-hidden", "true")
				clone.setAttribute("data-element-inspector-pseudo", name)
				clone.style.pointerEvents = "none"
				for (let index = 0; index < computed.length; index += 1) {
					const property = computed.item(index)
					clone.style.setProperty(
						property,
						computed.getPropertyValue(property),
						computed.getPropertyPriority(property),
					)
				}
				clone.style.content = "normal"
				clone.style.pointerEvents = "none"

				if (
					hasContent &&
					computed.content.startsWith('"') &&
					computed.content.endsWith('"')
				) {
					clone.textContent = computed.content.slice(1, -1)
				}

				const attribute =
					name === "::before"
						? "data-element-inspector-pseudo-before"
						: "data-element-inspector-pseudo-after"
				hiddenAttributes.push({
					source,
					attribute,
					previousValue: source.getAttribute(attribute),
				})
				source.setAttribute(attribute, "true")
				if (name === "::before") source.insertBefore(clone, source.firstChild)
				else source.appendChild(clone)
				materialized.push(clone)
			}
		}
	} catch (error) {
		restore()
		throw error
	}

	return restore
}

function cropCanvas(
	source: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	selection: BitmapCropSelection | InspectedElementRect,
	outputSize?: BitmapSize,
): string {
	const left = Math.max(0, Math.round(selection.left))
	const top = Math.max(0, Math.round(selection.top))
	const width = Math.max(1, Math.min(Math.round(selection.width), sourceWidth - left))
	const height = Math.max(1, Math.min(Math.round(selection.height), sourceHeight - top))
	const outputWidth = Math.max(
		1,
		Math.round(
			outputSize?.width ?? ("outputWidth" in selection ? selection.outputWidth : width),
		),
	)
	const outputHeight = Math.max(
		1,
		Math.round(
			outputSize?.height ?? ("outputHeight" in selection ? selection.outputHeight : height),
		),
	)
	const canvas = document.createElement("canvas")
	canvas.width = outputWidth
	canvas.height = outputHeight
	const context = canvas.getContext("2d")
	if (!context) throw new Error("Canvas 2D context is unavailable")
	context.drawImage(source, left, top, width, height, 0, 0, outputWidth, outputHeight)
	return canvas.toDataURL("image/png")
}

async function captureSameOriginIframe({
	iframe,
	selection,
	viewportSelection,
}: CaptureOptions): Promise<string> {
	const documentBody = iframe.contentDocument?.body
	if (!documentBody) throw new Error("The HTML iframe document is unavailable")
	// PPT previews can contain several stacked sections in the body while only
	// one slide is visible. Select the root containing the drag center so the
	// crop cannot accidentally use the first slide in the document.
	const captureRoot = resolveCaptureRoot(documentBody, selection)
	const rootRect = captureRoot.getBoundingClientRect()
	const renderWidth = Math.max(captureRoot.scrollWidth, captureRoot.offsetWidth, 1)
	const renderHeight = Math.max(captureRoot.scrollHeight, captureRoot.offsetHeight, 1)
	const restorePseudoElements = materializePseudoElements(captureRoot)
	try {
		const result = await snapdom(captureRoot, {
			// Render the selected root at its CSS size so the crop uses the same
			// coordinate system as the inspector rect.
			width: renderWidth,
			height: renderHeight,
			dpr: CAPTURE_OUTPUT_SCALE,
			backgroundColor: "#ffffff",
		})
		// snapdom.toBlob() defaults to SVG. createImageBitmap cannot decode the
		// foreignObject SVG generated for this page, so request a raster PNG here.
		const blob = await result.toBlob({ type: "image/png" })
		const bitmap = await createImageBitmap(blob)
		try {
			const rootSelection = getRootCaptureSelection(selection, rootRect)
			return cropCanvas(
				bitmap,
				bitmap.width,
				bitmap.height,
				toBitmapCropSelection(rootSelection, bitmap, {
					width: renderWidth,
					height: renderHeight,
				}),
				getCaptureOutputSize(selection, viewportSelection),
			)
		} finally {
			bitmap.close()
		}
	} finally {
		restorePseudoElements()
	}
}

async function captureCurrentTab({
	iframe,
	selection,
	viewportSelection,
}: CaptureOptions): Promise<string> {
	if (!navigator.mediaDevices?.getDisplayMedia) {
		throw new Error("Current browser does not support tab screenshots")
	}

	const stream = await navigator.mediaDevices.getDisplayMedia({
		video: {
			displaySurface: "browser",
			preferCurrentTab: true,
			selfBrowserSurface: "include",
			surfaceSwitching: "exclude",
			monitorTypeSurfaces: "exclude",
		} as MediaTrackConstraints,
		audio: false,
	})
	const video = document.createElement("video")
	video.muted = true
	video.playsInline = true
	video.srcObject = stream

	try {
		const track = stream.getVideoTracks()[0]
		const displaySurface = track?.getSettings().displaySurface
		if (displaySurface === "monitor") {
			throw new Error("Please choose the current browser tab or window")
		}

		await video.play()
		await new Promise<void>((resolve) => {
			if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
				resolve()
				return
			}
			video.addEventListener("loadeddata", () => resolve(), { once: true })
		})

		const iframeRect = iframe.getBoundingClientRect()
		const screenSelection = resolveCaptureScreenSelection(
			iframe,
			iframeRect,
			selection,
			viewportSelection,
		)
		const surface = getCaptureSurfaceGeometry(displaySurface, {
			innerWidth: window.innerWidth,
			innerHeight: window.innerHeight,
			outerWidth: window.outerWidth,
			outerHeight: window.outerHeight,
		})
		const scaleX = video.videoWidth / surface.width
		const scaleY = video.videoHeight / surface.height
		return cropCanvas(
			video,
			video.videoWidth,
			video.videoHeight,
			{
				left: (surface.viewportOffsetX + screenSelection.left) * scaleX,
				top: (surface.viewportOffsetY + screenSelection.top) * scaleY,
				width: screenSelection.width * scaleX,
				height: screenSelection.height * scaleY,
			},
			getCaptureOutputSize(selection, viewportSelection),
		)
	} finally {
		stream.getTracks().forEach((track) => track.stop())
		video.srcObject = null
	}
}

/** Capture a selected iframe region, falling back to browser tab capture for cross-origin shells. */
export async function captureIframeRegion(options: CaptureOptions): Promise<string> {
	try {
		return await captureSameOriginIframe(options)
	} catch (error) {
		try {
			return await captureCurrentTab(options)
		} catch (fallbackError) {
			throw new Error(
				fallbackError instanceof Error
					? fallbackError.message
					: error instanceof Error
						? error.message
						: "Unable to capture the selected HTML region",
			)
		}
	}
}
