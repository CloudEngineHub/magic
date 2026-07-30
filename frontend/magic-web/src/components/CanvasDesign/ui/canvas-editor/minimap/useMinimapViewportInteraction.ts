import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type MouseEvent as ReactMouseEvent,
	type PointerEvent as ReactPointerEvent,
} from "react"
import type { Canvas } from "../../../runtime/core/Canvas"
import { hasModKey } from "../../../runtime/interaction/shortcuts/modifierUtils"
import { getViewportCanvasRect } from "../../../runtime/shared/placement/elementUtils"
import {
	isPointInsideMinimapRect,
	unprojectMinimapPoint,
	type MinimapPoint,
	type MinimapSize,
} from "./minimapGeometry"
import type { MinimapRenderLayout } from "./minimapRenderer"

interface MinimapViewportDragState {
	canvas: Canvas
	pointerId: number
	startPoint: MinimapPoint
	startClientPoint: MinimapPoint
	startStagePosition: MinimapPoint
	clickCanvasPoint: MinimapPoint
	canvasScale: number
	minimapScale: number
	hasExceededDragThreshold: boolean
	isViewportGestureActive: boolean
}

interface MinimapWheelGestureState {
	canvas: Canvas
	zoomCanvasPoint: MinimapPoint | null
	endTimeoutId: number | null
}

const MINIMAP_VIEWPORT_DRAG_THRESHOLD = 3
const MINIMAP_WHEEL_GESTURE_END_DELAY = 120

interface UseMinimapViewportInteractionOptions {
	canvas: Canvas | null
	panelRef: { current: HTMLDivElement | null }
	panelSizeRef: { current: MinimapSize }
	renderLayoutRef: { current: MinimapRenderLayout | null }
}

function getMinimapPointerPoint(
	panel: HTMLElement,
	panelSize: MinimapSize,
	clientX: number,
	clientY: number,
): MinimapPoint | null {
	const bounds = panel.getBoundingClientRect()
	if (bounds.width <= 0 || bounds.height <= 0) return null
	return {
		x: ((clientX - bounds.left) * panelSize.width) / bounds.width,
		y: ((clientY - bounds.top) * panelSize.height) / bounds.height,
	}
}

function centerCanvasViewportAtPoint(canvas: Canvas, targetCanvasPoint: MinimapPoint) {
	const viewportRect = getViewportCanvasRect(canvas)
	const canvasScale = canvas.viewportController.getScale()
	if (!Number.isFinite(canvasScale) || canvasScale <= 0) return
	const currentStagePosition = canvas.stage.position()
	const viewportCenter = {
		x: viewportRect.x + viewportRect.width / 2,
		y: viewportRect.y + viewportRect.height / 2,
	}
	emitMinimapViewportGesture(canvas, true)
	try {
		canvas.viewportController.setPosition({
			x: currentStagePosition.x - (targetCanvasPoint.x - viewportCenter.x) * canvasScale,
			y: currentStagePosition.y - (targetCanvasPoint.y - viewportCenter.y) * canvasScale,
		})
	} finally {
		emitMinimapViewportGesture(canvas, false)
	}
}

function emitMinimapViewportGesture(canvas: Canvas, active: boolean) {
	canvas.eventEmitter.emit({
		type: "viewport:gesture",
		data: active
			? { active: true, source: "minimap", pointerCount: 1 }
			: { active: false, source: "minimap" },
	})
}

function beginMinimapViewportGesture(dragState: MinimapViewportDragState) {
	if (dragState.isViewportGestureActive) return
	dragState.isViewportGestureActive = true
	emitMinimapViewportGesture(dragState.canvas, true)
}

function endMinimapViewportGesture(dragState: MinimapViewportDragState) {
	if (!dragState.isViewportGestureActive) return
	dragState.isViewportGestureActive = false
	emitMinimapViewportGesture(dragState.canvas, false)
}

export function useMinimapViewportInteraction({
	canvas,
	panelRef,
	panelSizeRef,
	renderLayoutRef,
}: UseMinimapViewportInteractionOptions) {
	const [isViewportDragging, setIsViewportDragging] = useState(false)
	const viewportDragStateRef = useRef<MinimapViewportDragState | null>(null)
	const wheelGestureStateRef = useRef<MinimapWheelGestureState | null>(null)

	const finishWheelGesture = useCallback(() => {
		const wheelGestureState = wheelGestureStateRef.current
		if (!wheelGestureState) return
		if (wheelGestureState.endTimeoutId !== null) {
			window.clearTimeout(wheelGestureState.endTimeoutId)
		}
		wheelGestureStateRef.current = null
		emitMinimapViewportGesture(wheelGestureState.canvas, false)
	}, [])

	const keepWheelGestureActive = useCallback(
		(nextCanvas: Canvas, zoomCanvasPoint?: MinimapPoint): MinimapWheelGestureState => {
			let wheelGestureState = wheelGestureStateRef.current
			if (wheelGestureState && wheelGestureState.canvas !== nextCanvas) {
				finishWheelGesture()
				wheelGestureState = null
			}

			if (!wheelGestureState) {
				wheelGestureState = {
					canvas: nextCanvas,
					zoomCanvasPoint: zoomCanvasPoint ?? null,
					endTimeoutId: null,
				}
				wheelGestureStateRef.current = wheelGestureState
				emitMinimapViewportGesture(nextCanvas, true)
			} else if (!wheelGestureState.zoomCanvasPoint && zoomCanvasPoint) {
				wheelGestureState.zoomCanvasPoint = zoomCanvasPoint
			}

			if (wheelGestureState.endTimeoutId !== null) {
				window.clearTimeout(wheelGestureState.endTimeoutId)
			}
			wheelGestureState.endTimeoutId = window.setTimeout(() => {
				if (wheelGestureStateRef.current !== wheelGestureState) return
				wheelGestureStateRef.current = null
				wheelGestureState.endTimeoutId = null
				emitMinimapViewportGesture(wheelGestureState.canvas, false)
			}, MINIMAP_WHEEL_GESTURE_END_DELAY)

			return wheelGestureState
		},
		[finishWheelGesture],
	)

	const handlePointerDown = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			event.stopPropagation()
			if (event.button !== 0 || !canvas) return
			finishWheelGesture()
			const layout = renderLayoutRef.current
			const panel = panelRef.current
			if (!layout || !panel) return

			const point = getMinimapPointerPoint(
				panel,
				panelSizeRef.current,
				event.clientX,
				event.clientY,
			)
			if (!point) return
			event.preventDefault()
			const targetCanvasPoint = unprojectMinimapPoint(point, layout.transform)
			if (!targetCanvasPoint) return

			if (
				layout.projectedViewportRect &&
				isPointInsideMinimapRect(point, layout.projectedViewportRect)
			) {
				const canvasScale = canvas.viewportController.getScale()
				if (
					!Number.isFinite(canvasScale) ||
					canvasScale <= 0 ||
					!Number.isFinite(layout.transform.scale) ||
					layout.transform.scale <= 0
				) {
					return
				}
				viewportDragStateRef.current = {
					canvas,
					pointerId: event.pointerId,
					startPoint: point,
					startClientPoint: { x: event.clientX, y: event.clientY },
					startStagePosition: canvas.stage.position(),
					clickCanvasPoint: targetCanvasPoint,
					canvasScale,
					minimapScale: layout.transform.scale,
					hasExceededDragThreshold: false,
					isViewportGestureActive: false,
				}
				if (typeof event.currentTarget.setPointerCapture === "function") {
					event.currentTarget.setPointerCapture(event.pointerId)
				}
				return
			}

			centerCanvasViewportAtPoint(canvas, targetCanvasPoint)
		},
		[canvas, finishWheelGesture, panelRef, panelSizeRef, renderLayoutRef],
	)

	const handlePointerMove = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			event.stopPropagation()
			const dragState = viewportDragStateRef.current
			const panel = panelRef.current
			if (!canvas || !panel || !dragState || dragState.pointerId !== event.pointerId) return

			const point = getMinimapPointerPoint(
				panel,
				panelSizeRef.current,
				event.clientX,
				event.clientY,
			)
			if (!point) return
			event.preventDefault()
			if (!dragState.hasExceededDragThreshold) {
				const clientDeltaX = event.clientX - dragState.startClientPoint.x
				const clientDeltaY = event.clientY - dragState.startClientPoint.y
				if (Math.hypot(clientDeltaX, clientDeltaY) < MINIMAP_VIEWPORT_DRAG_THRESHOLD) {
					return
				}
				dragState.hasExceededDragThreshold = true
				beginMinimapViewportGesture(dragState)
				setIsViewportDragging(true)
			}
			const canvasDeltaX = (point.x - dragState.startPoint.x) / dragState.minimapScale
			const canvasDeltaY = (point.y - dragState.startPoint.y) / dragState.minimapScale
			canvas.viewportController.setPosition({
				x: dragState.startStagePosition.x - canvasDeltaX * dragState.canvasScale,
				y: dragState.startStagePosition.y - canvasDeltaY * dragState.canvasScale,
			})
		},
		[canvas, panelRef, panelSizeRef],
	)

	const finishViewportDrag = useCallback((pointerId: number) => {
		const dragState = viewportDragStateRef.current
		if (dragState?.pointerId !== pointerId) return
		endMinimapViewportGesture(dragState)
		viewportDragStateRef.current = null
		setIsViewportDragging(false)
	}, [])

	const handlePointerEnd = useCallback(
		(event: ReactPointerEvent<HTMLDivElement>) => {
			event.stopPropagation()
			const dragState = viewportDragStateRef.current
			if (
				event.type === "pointerup" &&
				canvas &&
				dragState?.pointerId === event.pointerId &&
				!dragState.hasExceededDragThreshold
			) {
				event.preventDefault()
				centerCanvasViewportAtPoint(canvas, dragState.clickCanvasPoint)
			}
			finishViewportDrag(event.pointerId)
			if (
				typeof event.currentTarget.hasPointerCapture === "function" &&
				event.currentTarget.hasPointerCapture(event.pointerId)
			) {
				event.currentTarget.releasePointerCapture(event.pointerId)
			}
		},
		[canvas, finishViewportDrag],
	)

	const handleClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
		event.preventDefault()
		event.stopPropagation()
	}, [])

	const handleWheel = useCallback(
		(event: WheelEvent) => {
			event.preventDefault()
			event.stopPropagation()
			if (!canvas || viewportDragStateRef.current) return

			if (!hasModKey(event)) {
				if (
					!Number.isFinite(event.deltaX) ||
					!Number.isFinite(event.deltaY) ||
					(event.deltaX === 0 && event.deltaY === 0)
				) {
					return
				}
				keepWheelGestureActive(canvas)
				canvas.viewportController.panByWheelDelta(event.deltaX, event.deltaY, "minimap")
				return
			}

			if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return
			const layout = renderLayoutRef.current
			const panel = panelRef.current
			if (!layout || !panel) return

			const point = getMinimapPointerPoint(
				panel,
				panelSizeRef.current,
				event.clientX,
				event.clientY,
			)
			if (!point) return
			const canvasPoint = unprojectMinimapPoint(point, layout.transform)
			if (!canvasPoint) return

			const wheelGestureState = keepWheelGestureActive(canvas, canvasPoint)
			const wheelAnchor = wheelGestureState.zoomCanvasPoint
			if (!wheelAnchor) return
			canvas.viewportController.zoomByWheelDeltaAtCanvasPoint(
				wheelAnchor,
				-event.deltaY,
				"minimap",
			)
		},
		[canvas, keepWheelGestureActive, panelRef, panelSizeRef, renderLayoutRef],
	)

	useEffect(() => {
		const panel = panelRef.current
		if (!panel) return
		panel.addEventListener("wheel", handleWheel, { passive: false })
		return () => panel.removeEventListener("wheel", handleWheel)
	}, [handleWheel, panelRef])

	useEffect(() => {
		viewportDragStateRef.current = null
		setIsViewportDragging(false)
		return () => {
			const dragState = viewportDragStateRef.current
			if (dragState?.canvas === canvas) {
				endMinimapViewportGesture(dragState)
				viewportDragStateRef.current = null
			}
			const wheelGestureState = wheelGestureStateRef.current
			if (wheelGestureState?.canvas === canvas) {
				finishWheelGesture()
			}
		}
	}, [canvas, finishWheelGesture])

	return {
		isViewportDragging,
		handlePointerDown,
		handlePointerMove,
		handlePointerEnd,
		handleClick,
		finishViewportDrag,
	}
}
