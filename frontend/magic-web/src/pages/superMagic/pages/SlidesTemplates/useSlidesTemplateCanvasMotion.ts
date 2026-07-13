import { useReducedMotion } from "framer-motion"
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"
import type { TemplateCanvasDirection, TemplateCanvasPoint } from "./canvasLayout"
import { getDirectionsFromVelocity, getEdgeVelocity, isSameCanvasPoint } from "./canvasInteraction"

export const EDGE_PAN_ACTIVATION_DELAY_MS = 180
const FOCUS_MOVE_DURATION_MS = 520
const FOCUS_EMPHASIS_START_PROGRESS = 0.72

interface UseSlidesTemplateCanvasMotionInput {
	maybeRequestMore: (directions: TemplateCanvasDirection[]) => boolean
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	setCanvasOffset: (nextOffset: TemplateCanvasPoint) => TemplateCanvasPoint
}

export function useSlidesTemplateCanvasMotion({
	maybeRequestMore,
	offsetRef,
	setCanvasOffset,
}: UseSlidesTemplateCanvasMotionInput) {
	const reduceMotion = Boolean(useReducedMotion())
	const frameRef = useRef<number | null>(null)
	const edgeActivationTimerRef = useRef<number | null>(null)
	const velocityRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
	const [isCanvasFocusSettling, setIsCanvasFocusSettling] = useState(false)
	const [isCanvasMoving, setIsCanvasMoving] = useState(false)

	const stopAnimation = useCallback(() => {
		if (edgeActivationTimerRef.current != null) {
			window.clearTimeout(edgeActivationTimerRef.current)
			edgeActivationTimerRef.current = null
		}
		if (frameRef.current != null) {
			cancelAnimationFrame(frameRef.current)
			frameRef.current = null
		}
		velocityRef.current = { x: 0, y: 0 }
		setIsCanvasFocusSettling(false)
		setIsCanvasMoving(false)
	}, [])

	const tick = useCallback(() => {
		const velocity = velocityRef.current
		if (Math.abs(velocity.x) < 0.2 && Math.abs(velocity.y) < 0.2) {
			stopAnimation()
			return
		}

		const previousOffset = offsetRef.current
		const nextOffset = setCanvasOffset({
			x: previousOffset.x + velocity.x,
			y: previousOffset.y + velocity.y,
		})
		const appliedDelta = {
			x: nextOffset.x - previousOffset.x,
			y: nextOffset.y - previousOffset.y,
		}
		if (isSameCanvasPoint(previousOffset, nextOffset)) {
			stopAnimation()
			return
		}

		maybeRequestMore(getDirectionsFromVelocity(appliedDelta))
		frameRef.current = requestAnimationFrame(tick)
	}, [maybeRequestMore, offsetRef, setCanvasOffset, stopAnimation])

	const scheduleEdgeMovement = useCallback(
		(rect: DOMRect, point: { clientX: number; clientY: number }) => {
			const velocity = getEdgeVelocity(rect, point)
			velocityRef.current = velocity
			if (Math.abs(velocity.x) < 0.2 && Math.abs(velocity.y) < 0.2) {
				stopAnimation()
				return
			}

			if (frameRef.current != null || edgeActivationTimerRef.current != null) return

			// 只有指针在边缘短暂停留后才移动，避免离开画布时经过热区造成误触发。
			edgeActivationTimerRef.current = window.setTimeout(() => {
				edgeActivationTimerRef.current = null
				const currentVelocity = velocityRef.current
				if (Math.abs(currentVelocity.x) < 0.2 && Math.abs(currentVelocity.y) < 0.2) return

				setIsCanvasMoving(true)
				frameRef.current = requestAnimationFrame(tick)
			}, EDGE_PAN_ACTIVATION_DELAY_MS)
		},
		[stopAnimation, tick],
	)

	const animateToOffset = useCallback(
		(nextOffset: TemplateCanvasPoint) => {
			stopAnimation()
			const startOffset = offsetRef.current
			const targetOffset = nextOffset
			if (reduceMotion || isSameCanvasPoint(startOffset, targetOffset)) {
				setCanvasOffset(targetOffset)
				return targetOffset
			}

			const startedAt = performance.now()
			let hasReachedFocusSettlingPhase = false
			setIsCanvasMoving(true)

			function animateFrame(now: number) {
				const progress = Math.min(1, (now - startedAt) / FOCUS_MOVE_DURATION_MS)
				const easedProgress = 1 - Math.pow(1 - progress, 4)
				setCanvasOffset({
					x: startOffset.x + (targetOffset.x - startOffset.x) * easedProgress,
					y: startOffset.y + (targetOffset.y - startOffset.y) * easedProgress,
				})
				if (!hasReachedFocusSettlingPhase && progress >= FOCUS_EMPHASIS_START_PROGRESS) {
					hasReachedFocusSettlingPhase = true
					setIsCanvasFocusSettling(true)
				}

				if (progress < 1) {
					frameRef.current = requestAnimationFrame(animateFrame)
					return
				}

				frameRef.current = null
				setIsCanvasMoving(false)
			}

			frameRef.current = requestAnimationFrame(animateFrame)
			return targetOffset
		},
		[offsetRef, reduceMotion, setCanvasOffset, stopAnimation],
	)

	useEffect(() => stopAnimation, [stopAnimation])

	return {
		animateToOffset,
		isCanvasFocusSettling,
		isCanvasMoving,
		scheduleEdgeMovement,
		stopAnimation,
	}
}
