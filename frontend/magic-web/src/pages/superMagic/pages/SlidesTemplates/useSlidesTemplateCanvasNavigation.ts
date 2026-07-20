import { useCallback, useLayoutEffect, useRef, useState } from "react"
import type { MutableRefObject, RefObject } from "react"
import type {
	TemplateCanvasBounds,
	TemplateCanvasDirection,
	TemplateCanvasInsets,
	TemplateCanvasPoint,
} from "./canvasLayout"
import {
	SLIDES_TEMPLATE_CANVAS_MAX_SCALE,
	SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE,
	SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
	clampTemplateCanvasScale,
} from "./canvasZoom"

const AUTO_LOAD_DIRECTIONS: TemplateCanvasDirection[] = ["left", "right", "up", "down"]
const MAX_SPARSE_CANVAS_SCALE = 1.16
const SPARSE_CANVAS_WIDTH_RATIO = 0.78
const SPARSE_CANVAS_HEIGHT_RATIO = 0.72
const CONTROL_ZOOM_STEP = 0.1
const CONTROL_PAN_VIEWPORT_RATIO = 0.65

interface UseSlidesTemplateCanvasNavigationInput {
	animateToOffset: (nextOffset: TemplateCanvasPoint) => TemplateCanvasPoint
	canvasItemsLength: number
	centerContent?: boolean
	contentBounds: TemplateCanvasBounds
	maybeRequestMore: (directions: TemplateCanvasDirection[]) => boolean
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	scaleRef: MutableRefObject<number>
	setCanvasOffset: (nextOffset: TemplateCanvasPoint) => TemplateCanvasPoint
	stopAnimation: () => void
	viewportInsetsRef: MutableRefObject<Partial<TemplateCanvasInsets> | undefined>
	viewportRef: RefObject<HTMLDivElement | null>
}

export function useSlidesTemplateCanvasNavigation({
	animateToOffset,
	canvasItemsLength,
	centerContent = false,
	contentBounds,
	maybeRequestMore,
	offsetRef,
	scaleRef,
	setCanvasOffset,
	stopAnimation,
	viewportInsetsRef,
	viewportRef,
}: UseSlidesTemplateCanvasNavigationInput) {
	const [canvasScale, setCanvasScale] = useState(SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE)
	const hasEstablishedScaleRef = useRef(false)

	const handleControlZoom = useCallback(
		(nextScale: number) => {
			stopAnimation()
			const currentScale = scaleRef.current
			const resolvedScale = clampTemplateCanvasScale(nextScale)
			if (Math.abs(resolvedScale - currentScale) < 0.001) return

			scaleRef.current = resolvedScale
			hasEstablishedScaleRef.current = true
			setCanvasScale(resolvedScale)
			setCanvasOffset(offsetRef.current)
			if (resolvedScale < currentScale) maybeRequestMore(AUTO_LOAD_DIRECTIONS)
		},
		[maybeRequestMore, offsetRef, scaleRef, setCanvasOffset, stopAnimation],
	)

	const handleResetView = useCallback(() => {
		stopAnimation()
		scaleRef.current = SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE
		hasEstablishedScaleRef.current = true
		setCanvasScale(SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE)
		setCanvasOffset({ x: 0, y: 0 })
	}, [scaleRef, setCanvasOffset, stopAnimation])

	const handleControlMove = useCallback(
		(direction: TemplateCanvasDirection) => {
			const viewport = viewportRef.current
			if (!viewport) return

			stopAnimation()
			const { width, height } = viewport.getBoundingClientRect()
			const currentOffset = offsetRef.current
			setCanvasOffset({
				x:
					currentOffset.x +
					(direction === "left"
						? width * CONTROL_PAN_VIEWPORT_RATIO
						: direction === "right"
							? -width * CONTROL_PAN_VIEWPORT_RATIO
							: 0),
				y:
					currentOffset.y +
					(direction === "up"
						? height * CONTROL_PAN_VIEWPORT_RATIO
						: direction === "down"
							? -height * CONTROL_PAN_VIEWPORT_RATIO
							: 0),
			})
			maybeRequestMore([direction])
		},
		[maybeRequestMore, offsetRef, setCanvasOffset, stopAnimation, viewportRef],
	)

	const handleFocusPoint = useCallback(
		(point: TemplateCanvasPoint) => {
			const viewport = viewportRef.current
			if (!viewport) return false

			stopAnimation()
			const { width, height } = viewport.getBoundingClientRect()
			if (width <= 0 || height <= 0) return false

			const insets = viewportInsetsRef.current
			const scale = scaleRef.current
			animateToOffset({
				x: ((insets?.left ?? 0) - (insets?.right ?? 0)) / 2 - point.x * scale,
				y: ((insets?.top ?? 0) - (insets?.bottom ?? 0)) / 2 - point.y * scale,
			})
			return true
		},
		[animateToOffset, scaleRef, stopAnimation, viewportInsetsRef, viewportRef],
	)
	const handleScaleChange = useCallback((nextScale: number) => {
		hasEstablishedScaleRef.current = true
		setCanvasScale(nextScale)
	}, [])

	useLayoutEffect(() => {
		const viewport = viewportRef.current
		if (!viewport || hasEstablishedScaleRef.current || canvasItemsLength === 0) return

		const { width, height } = viewport.getBoundingClientRect()
		const currentInsets = viewportInsetsRef.current
		const availableWidth = width - (currentInsets?.left ?? 0) - (currentInsets?.right ?? 0)
		const availableHeight = height - (currentInsets?.top ?? 0) - (currentInsets?.bottom ?? 0)
		const contentWidth = contentBounds.maxX - contentBounds.minX
		const contentHeight = contentBounds.maxY - contentBounds.minY
		if (
			availableWidth <= 0 ||
			availableHeight <= 0 ||
			contentWidth <= 0 ||
			contentHeight <= 0
		) {
			return
		}

		const nextScale = Math.max(
			SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE,
			Math.min(
				MAX_SPARSE_CANVAS_SCALE,
				(availableWidth * SPARSE_CANVAS_WIDTH_RATIO) / contentWidth,
				(availableHeight * SPARSE_CANVAS_HEIGHT_RATIO) / contentHeight,
			),
		)
		scaleRef.current = nextScale
		hasEstablishedScaleRef.current = true
		setCanvasScale(nextScale)
		setCanvasOffset(
			centerContent
				? {
						x: -((contentBounds.minX + contentBounds.maxX) / 2) * nextScale,
						y: -((contentBounds.minY + contentBounds.maxY) / 2) * nextScale,
					}
				: { x: 0, y: 0 },
		)
	}, [
		canvasItemsLength,
		centerContent,
		contentBounds,
		scaleRef,
		setCanvasOffset,
		viewportInsetsRef,
		viewportRef,
	])

	return {
		canvasScale,
		canZoomIn: canvasScale < SLIDES_TEMPLATE_CANVAS_MAX_SCALE,
		canZoomOut: canvasScale > SLIDES_TEMPLATE_CANVAS_MIN_SCALE,
		handleControlMove,
		handleFocusPoint,
		handleResetView,
		handleZoomIn: () => handleControlZoom(canvasScale + CONTROL_ZOOM_STEP),
		handleZoomOut: () => handleControlZoom(canvasScale - CONTROL_ZOOM_STEP),
		setCanvasScale: handleScaleChange,
	}
}
