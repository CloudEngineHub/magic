import { useLayoutEffect, type MutableRefObject, type RefObject } from "react"
import type { TemplateCanvasDirection, TemplateCanvasPoint } from "./canvasLayout"
import {
	getNextTemplateCanvasScale,
	getZoomedTemplateCanvasOffset,
	isTrackpadPanWheel,
	normalizeWheelDelta,
} from "./canvasZoom"
import { getDirectionsFromVelocity } from "./canvasInteraction"

const ZOOM_OUT_LOAD_DIRECTIONS: TemplateCanvasDirection[] = ["left", "right", "up", "down"]
const TRACKPAD_PAN_GESTURE_TIMEOUT_MS = 180

interface UseSlidesTemplateCanvasWheelInput {
	enabled?: boolean
	maybeRequestMore: (directions: TemplateCanvasDirection[]) => void
	onScaleChange: (scale: number) => void
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	scaleRef: MutableRefObject<number>
	setCanvasOffset: (nextOffset: TemplateCanvasPoint) => TemplateCanvasPoint
	stopAnimation: () => void
	viewportRef: RefObject<HTMLDivElement | null>
}

export function useSlidesTemplateCanvasWheel({
	enabled = true,
	maybeRequestMore,
	onScaleChange,
	offsetRef,
	scaleRef,
	setCanvasOffset,
	stopAnimation,
	viewportRef,
}: UseSlidesTemplateCanvasWheelInput) {
	useLayoutEffect(() => {
		if (!enabled) return

		const viewport = viewportRef.current
		if (!viewport) return
		let lastTrackpadPanAt = Number.NEGATIVE_INFINITY

		function handleWheel(event: globalThis.WheelEvent) {
			if (event.cancelable) {
				event.preventDefault()
			}
			stopAnimation()

			const now = performance.now()
			const hasActivePanGesture = now - lastTrackpadPanAt <= TRACKPAD_PAN_GESTURE_TIMEOUT_MS
			if (isTrackpadPanWheel(event, hasActivePanGesture)) {
				lastTrackpadPanAt = now
				const previousOffset = offsetRef.current
				const nextOffset = setCanvasOffset({
					x: previousOffset.x - normalizeWheelDelta(event.deltaX, event.deltaMode),
					y: previousOffset.y - normalizeWheelDelta(event.deltaY, event.deltaMode),
				})
				maybeRequestMore(
					getDirectionsFromVelocity({
						x: nextOffset.x - previousOffset.x,
						y: nextOffset.y - previousOffset.y,
					}),
				)
				return
			}
			lastTrackpadPanAt = Number.NEGATIVE_INFINITY

			const currentScale = scaleRef.current
			const nextScale = getNextTemplateCanvasScale(
				currentScale,
				normalizeWheelDelta(event.deltaY, event.deltaMode),
			)
			if (Math.abs(nextScale - currentScale) < 0.001) return

			scaleRef.current = nextScale
			onScaleChange(nextScale)
			setCanvasOffset(
				getZoomedTemplateCanvasOffset({
					clientX: event.clientX,
					clientY: event.clientY,
					currentOffset: offsetRef.current,
					currentScale,
					nextScale,
					viewportRect: viewport.getBoundingClientRect(),
				}),
			)
			if (nextScale < currentScale) {
				maybeRequestMore(ZOOM_OUT_LOAD_DIRECTIONS)
			}
		}

		viewport.addEventListener("wheel", handleWheel, { passive: false })
		return () => viewport.removeEventListener("wheel", handleWheel)
	}, [
		enabled,
		maybeRequestMore,
		onScaleChange,
		offsetRef,
		scaleRef,
		setCanvasOffset,
		stopAnimation,
		viewportRef,
	])
}
