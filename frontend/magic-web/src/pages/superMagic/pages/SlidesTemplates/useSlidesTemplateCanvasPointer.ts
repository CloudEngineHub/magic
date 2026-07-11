import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	type MouseEvent,
	type MutableRefObject,
	type PointerEvent,
	type RefObject,
} from "react"
import type { TemplateCanvasDirection, TemplateCanvasPoint } from "./canvasLayout"
import {
	CANVAS_DRAG_START_THRESHOLD,
	type CanvasDragState,
	getDirectionsFromVelocity,
	isCanvasDragBlockedTarget,
} from "./canvasInteraction"

interface UseSlidesTemplateCanvasPointerInput {
	isPreviewOpen: boolean
	maybeRequestMore: (directions: TemplateCanvasDirection[]) => boolean
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	onPointerDownStart: () => void
	resetKey: string
	scheduleEdgeMovement: (rect: DOMRect, point: { clientX: number; clientY: number }) => void
	setCanvasOffset: (nextOffset: TemplateCanvasPoint) => TemplateCanvasPoint
	stopAnimation: () => void
	setIsDragging: (isDragging: boolean) => void
	viewportRef: RefObject<HTMLDivElement | null>
}

export function useSlidesTemplateCanvasPointer({
	isPreviewOpen,
	maybeRequestMore,
	offsetRef,
	onPointerDownStart,
	resetKey,
	scheduleEdgeMovement,
	setCanvasOffset,
	setIsDragging,
	stopAnimation,
	viewportRef,
}: UseSlidesTemplateCanvasPointerInput) {
	const dragStateRef = useRef<CanvasDragState | null>(null)
	const suppressClickRef = useRef(false)
	const suppressClickTimeoutRef = useRef<number | null>(null)

	const handlePointerMove = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (isPreviewOpen) return

			const dragState = dragStateRef.current
			if (dragState) {
				if (event.pointerId !== dragState.pointerId) return

				const dragDistanceX = event.clientX - dragState.startClientX
				const dragDistanceY = event.clientY - dragState.startClientY
				const pointerDeltaX = event.clientX - dragState.lastClientX
				const pointerDeltaY = event.clientY - dragState.lastClientY
				if (
					!dragState.hasMoved &&
					Math.hypot(dragDistanceX, dragDistanceY) < CANVAS_DRAG_START_THRESHOLD
				) {
					return
				}

				if (!dragState.hasMoved) {
					dragState.hasMoved = true
					setIsDragging(true)
					viewportRef.current?.setPointerCapture(event.pointerId)
				}

				event.preventDefault()
				const previousOffset = offsetRef.current
				const nextOffset = setCanvasOffset({
					x: previousOffset.x + pointerDeltaX,
					y: previousOffset.y + pointerDeltaY,
				})
				dragState.lastClientX = event.clientX
				dragState.lastClientY = event.clientY
				maybeRequestMore(
					getDirectionsFromVelocity({
						x: nextOffset.x - previousOffset.x,
						y: nextOffset.y - previousOffset.y,
					}),
				)
				return
			}

			if (isCanvasDragBlockedTarget(event.target)) {
				stopAnimation()
				return
			}

			const viewport = viewportRef.current
			if (!viewport) return
			scheduleEdgeMovement(viewport.getBoundingClientRect(), event)
		},
		[
			isPreviewOpen,
			maybeRequestMore,
			offsetRef,
			scheduleEdgeMovement,
			setCanvasOffset,
			setIsDragging,
			stopAnimation,
			viewportRef,
		],
	)

	const handlePointerDown = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (isPreviewOpen) return
			onPointerDownStart()

			const viewport = viewportRef.current
			if (
				!viewport ||
				event.button > 0 ||
				event.isPrimary === false ||
				isCanvasDragBlockedTarget(event.target)
			) {
				return
			}

			stopAnimation()
			dragStateRef.current = {
				hasMoved: false,
				lastClientX: event.clientX,
				lastClientY: event.clientY,
				pointerId: event.pointerId,
				startClientX: event.clientX,
				startClientY: event.clientY,
			}
		},
		[isPreviewOpen, onPointerDownStart, stopAnimation, viewportRef],
	)

	const handlePointerLeave = useCallback(() => {
		stopAnimation()
		if (dragStateRef.current?.hasMoved) return
		dragStateRef.current = null
		setIsDragging(false)
	}, [setIsDragging, stopAnimation])

	const handlePointerRelease = useCallback(
		(event: PointerEvent<HTMLDivElement>) => {
			if (isPreviewOpen) return

			const viewport = viewportRef.current
			const dragState = dragStateRef.current
			if (!dragState || dragState.pointerId !== event.pointerId) return

			if (dragState.hasMoved) {
				suppressClickRef.current = true
				if (suppressClickTimeoutRef.current != null) {
					window.clearTimeout(suppressClickTimeoutRef.current)
				}
				suppressClickTimeoutRef.current = window.setTimeout(() => {
					suppressClickRef.current = false
					suppressClickTimeoutRef.current = null
				}, 0)
			}

			dragStateRef.current = null
			setIsDragging(false)
			if (viewport?.hasPointerCapture(event.pointerId)) {
				viewport.releasePointerCapture(event.pointerId)
			}
		},
		[isPreviewOpen, setIsDragging, viewportRef],
	)

	const handleCanvasClickCapture = useCallback(
		(event: MouseEvent<HTMLDivElement>) => {
			if (isPreviewOpen || !suppressClickRef.current) return

			suppressClickRef.current = false
			if (suppressClickTimeoutRef.current != null) {
				window.clearTimeout(suppressClickTimeoutRef.current)
				suppressClickTimeoutRef.current = null
			}
			event.preventDefault()
			event.stopPropagation()
		},
		[isPreviewOpen],
	)

	useEffect(() => {
		if (!isPreviewOpen) return

		const viewport = viewportRef.current
		const activePointerId = dragStateRef.current?.pointerId
		stopAnimation()
		dragStateRef.current = null
		setIsDragging(false)
		if (activePointerId != null && viewport?.hasPointerCapture(activePointerId)) {
			viewport.releasePointerCapture(activePointerId)
		}
	}, [isPreviewOpen, setIsDragging, stopAnimation, viewportRef])

	useLayoutEffect(() => {
		dragStateRef.current = null
		suppressClickRef.current = false
		setIsDragging(false)
	}, [resetKey, setIsDragging])

	useEffect(() => {
		return () => {
			dragStateRef.current = null
			if (suppressClickTimeoutRef.current != null) {
				window.clearTimeout(suppressClickTimeoutRef.current)
				suppressClickTimeoutRef.current = null
			}
		}
	}, [])

	return {
		handleCanvasClickCapture,
		handlePointerDown,
		handlePointerLeave,
		handlePointerMove,
		handlePointerRelease,
	}
}
