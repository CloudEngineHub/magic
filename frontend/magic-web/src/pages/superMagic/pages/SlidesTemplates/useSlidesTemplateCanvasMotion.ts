import { useReducedMotion } from "framer-motion"
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react"
import type { TemplateCanvasDirection, TemplateCanvasPoint } from "./canvasLayout"
import { getSlidesTemplateCanvasIdleExploreVelocity } from "./canvasIdleExplore"
import { getDirectionsFromVelocity, getEdgeVelocity, isSameCanvasPoint } from "./canvasInteraction"

export const EDGE_PAN_ACTIVATION_DELAY_MS = 180
const FOCUS_MOVE_DURATION_MS = 520
const FOCUS_EMPHASIS_START_PROGRESS = 0.72
const MAX_IDLE_EXPLORE_FRAME_DURATION_MS = 64

type CanvasMotionMode = "edge" | "focus" | "idle" | null

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
	const motionModeRef = useRef<CanvasMotionMode>(null)
	const velocityRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
	const [isCanvasFocusSettling, setIsCanvasFocusSettling] = useState(false)
	const [isCanvasIdleExploring, setIsCanvasIdleExploring] = useState(false)
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
		motionModeRef.current = null
		velocityRef.current = { x: 0, y: 0 }
		setIsCanvasFocusSettling(false)
		setIsCanvasIdleExploring(false)
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

				motionModeRef.current = "edge"
				setIsCanvasMoving(true)
				frameRef.current = requestAnimationFrame(tick)
			}, EDGE_PAN_ACTIVATION_DELAY_MS)
		},
		[stopAnimation, tick],
	)

	const startIdleExploration = useCallback(() => {
		if (reduceMotion) return
		if (motionModeRef.current === "idle") return

		stopAnimation()
		motionModeRef.current = "idle"
		const startedAt = performance.now()
		let previousFrameAt = startedAt

		// 空闲时按固定四向环游，既能展示相邻模板，又避免持续向一个方向漂移。
		function exploreFrame(now: number) {
			if (motionModeRef.current !== "idle") return

			const elapsedMs = now - startedAt
			const elapsedSincePreviousFrame = Math.min(
				MAX_IDLE_EXPLORE_FRAME_DURATION_MS,
				Math.max(0, now - previousFrameAt),
			)
			previousFrameAt = now
			const velocity = getSlidesTemplateCanvasIdleExploreVelocity(elapsedMs)
			const previousOffset = offsetRef.current
			const nextOffset = setCanvasOffset({
				x: previousOffset.x + (velocity.x * elapsedSincePreviousFrame) / 1000,
				y: previousOffset.y + (velocity.y * elapsedSincePreviousFrame) / 1000,
			})
			if (isSameCanvasPoint(previousOffset, nextOffset)) {
				stopAnimation()
				return
			}
			maybeRequestMore(
				getDirectionsFromVelocity({
					x: nextOffset.x - previousOffset.x,
					y: nextOffset.y - previousOffset.y,
				}),
			)
			frameRef.current = requestAnimationFrame(exploreFrame)
		}

		setIsCanvasIdleExploring(true)
		setIsCanvasMoving(true)
		frameRef.current = requestAnimationFrame(exploreFrame)
	}, [maybeRequestMore, offsetRef, reduceMotion, setCanvasOffset, stopAnimation])

	const animateToOffset = useCallback(
		(nextOffset: TemplateCanvasPoint) => {
			stopAnimation()
			motionModeRef.current = "focus"
			const startOffset = offsetRef.current
			const targetOffset = nextOffset
			if (reduceMotion || isSameCanvasPoint(startOffset, targetOffset)) {
				setCanvasOffset(targetOffset)
				motionModeRef.current = null
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
				motionModeRef.current = null
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
		isCanvasIdleExploring,
		isCanvasMoving,
		scheduleEdgeMovement,
		startIdleExploration,
		stopAnimation,
	}
}
