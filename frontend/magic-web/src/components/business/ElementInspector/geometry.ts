import type { InspectedElementRect } from "./types"

interface RectLike {
	top: number
	left: number
	width: number
	height: number
}

interface SizeLike {
	width: number
	height: number
}

interface InspectorOverlayGeometry {
	iframeRect: RectLike
	iframeSize: SizeLike
	containerRect: RectLike
	containerSize: SizeLike
	fallbackScale: number
}

interface InspectorOverlayScale {
	x: number
	y: number
}

function getAxisGeometry(
	iframeVisualSize: number,
	iframeLayoutSize: number,
	containerVisualSize: number,
	containerLayoutSize: number,
	fallbackScale: number,
) {
	// The overlay is positioned inside the container's transformed coordinate system.
	// Divide the iframe's visual scale by the container's visual scale so a shared
	// phone-shell transform is not applied twice. Use the caller's scale only when
	// layout measurements are unavailable during initial or detached rendering.
	const containerScale =
		containerVisualSize > 0 && containerLayoutSize > 0
			? containerVisualSize / containerLayoutSize
			: null
	const iframeScale =
		iframeVisualSize > 0 && iframeLayoutSize > 0 ? iframeVisualSize / iframeLayoutSize : null

	return {
		containerScale: containerScale ?? 1,
		relativeScale:
			containerScale !== null && iframeScale !== null
				? iframeScale / containerScale
				: fallbackScale,
	}
}

function getOverlayAxes(geometry: InspectorOverlayGeometry) {
	return {
		horizontal: getAxisGeometry(
			geometry.iframeRect.width,
			geometry.iframeSize.width,
			geometry.containerRect.width,
			geometry.containerSize.width,
			geometry.fallbackScale,
		),
		vertical: getAxisGeometry(
			geometry.iframeRect.height,
			geometry.iframeSize.height,
			geometry.containerRect.height,
			geometry.containerSize.height,
			geometry.fallbackScale,
		),
	}
}

export function getInspectorOverlayScale(
	geometry: InspectorOverlayGeometry,
): InspectorOverlayScale {
	const { horizontal, vertical } = getOverlayAxes(geometry)

	return { x: horizontal.relativeScale, y: vertical.relativeScale }
}

export function toInspectorOverlayRect(
	rect: InspectedElementRect,
	geometry: InspectorOverlayGeometry,
): InspectedElementRect {
	const { horizontal, vertical } = getOverlayAxes(geometry)

	return {
		left:
			(geometry.iframeRect.left - geometry.containerRect.left) / horizontal.containerScale +
			rect.left * horizontal.relativeScale,
		top:
			(geometry.iframeRect.top - geometry.containerRect.top) / vertical.containerScale +
			rect.top * vertical.relativeScale,
		width: rect.width * horizontal.relativeScale,
		height: rect.height * vertical.relativeScale,
	}
}
