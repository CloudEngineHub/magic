import { useEffect, useRef, type MutableRefObject } from "react"
import type { TemplateCanvasDirection, TemplateCanvasPoint } from "./canvasLayout"
import {
	getSlidesTemplateCanvasLoopCycle,
	type SlidesTemplateCanvasLoopMetrics,
} from "./canvasLoop"

const AUTO_LOAD_DIRECTIONS: TemplateCanvasDirection[] = ["left", "right", "up", "down"]

interface UseSlidesTemplateCanvasAutoLoadInput {
	autoLoadSignal: number | string
	enabled: boolean
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	maybeRequestMore: (
		directions: TemplateCanvasDirection[],
		options?: { bypassThrottle?: boolean },
	) => boolean
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	resetKey: string
	scaleRef: MutableRefObject<number>
}

export function useSlidesTemplateCanvasAutoLoad({
	autoLoadSignal,
	enabled,
	loopMetrics,
	maybeRequestMore,
	offsetRef,
	resetKey,
	scaleRef,
}: UseSlidesTemplateCanvasAutoLoadInput) {
	const lastAutoLoadSignalRef = useRef<number | string | null>(null)

	useEffect(() => {
		lastAutoLoadSignalRef.current = null
	}, [resetKey])

	useEffect(() => {
		if (!enabled || lastAutoLoadSignalRef.current === autoLoadSignal) return
		const loopCycle = getSlidesTemplateCanvasLoopCycle({
			loopMetrics,
			offset: offsetRef.current,
			scale: scaleRef.current,
		})
		if (loopCycle.x !== 0 || loopCycle.y !== 0) return

		const frameId = requestAnimationFrame(() => {
			if (maybeRequestMore(AUTO_LOAD_DIRECTIONS, { bypassThrottle: true })) {
				lastAutoLoadSignalRef.current = autoLoadSignal
			}
		})

		return () => cancelAnimationFrame(frameId)
	}, [autoLoadSignal, enabled, loopMetrics, maybeRequestMore, offsetRef, scaleRef])
}
