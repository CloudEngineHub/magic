import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { MutableRefObject, RefObject } from "react"
import type { TemplateCanvasItem, TemplateCanvasPoint } from "./canvasLayout"
import type { SlidesTemplateCanvasTile } from "./canvasInteraction"
import {
	getRebasedSlidesTemplateCanvasOffset,
	getLoopedVisibleSlidesTemplateCanvasItems,
	type SlidesTemplateCanvasLoopMetrics,
} from "./canvasLoop"

interface UseTemplateCanvasVisibleItemsInput {
	canvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	onOffsetRebase: () => void
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	scaleRef: RefObject<number>
	viewportRef: RefObject<HTMLDivElement | null>
}

const FALLBACK_VIEWPORT_WIDTH = 1280
const FALLBACK_VIEWPORT_HEIGHT = 720

function getCanvasItemKey(items: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>) {
	return items.map(({ item }) => item.id).join("|")
}

export function useTemplateCanvasVisibleItems({
	canvasItems,
	loopMetrics,
	onOffsetRebase,
	offsetRef,
	scaleRef,
	viewportRef,
}: UseTemplateCanvasVisibleItemsInput) {
	const canvasItemsRef = useRef(canvasItems)
	const loopMetricsRef = useRef(loopMetrics)
	const visibleKeyRef = useRef("")
	const frameRef = useRef<number | null>(null)
	const [visibleCanvasItems, setVisibleCanvasItems] = useState<
		Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	>([])

	const updateVisibleCanvasItems = useCallback(() => {
		const viewport = viewportRef.current
		const items = canvasItemsRef.current
		if (!viewport) return

		const { width, height } = viewport.getBoundingClientRect()
		const viewportWidth = width > 0 ? width : FALLBACK_VIEWPORT_WIDTH
		const viewportHeight = height > 0 ? height : FALLBACK_VIEWPORT_HEIGHT

		const scale = scaleRef.current
		const nextItems = getLoopedVisibleSlidesTemplateCanvasItems({
			items,
			loopMetrics: loopMetricsRef.current,
			offset: offsetRef.current,
			scale,
			viewportHeight,
			viewportWidth,
		})
		const nextKey = getCanvasItemKey(nextItems)
		if (nextKey === visibleKeyRef.current) return

		visibleKeyRef.current = nextKey
		setVisibleCanvasItems(nextItems)
	}, [offsetRef, scaleRef, viewportRef])

	const scheduleVisibleCanvasItemsUpdate = useCallback(() => {
		if (frameRef.current != null) return

		frameRef.current = requestAnimationFrame(() => {
			frameRef.current = null
			updateVisibleCanvasItems()
		})
	}, [updateVisibleCanvasItems])

	useLayoutEffect(() => {
		const rebasedOffset = getRebasedSlidesTemplateCanvasOffset({
			nextLoopMetrics: loopMetrics,
			offset: offsetRef.current,
			previousLoopMetrics: loopMetricsRef.current,
			scale: scaleRef.current,
		})
		if (rebasedOffset.x !== offsetRef.current.x || rebasedOffset.y !== offsetRef.current.y) {
			offsetRef.current = rebasedOffset
			onOffsetRebase()
		}
		canvasItemsRef.current = canvasItems
		loopMetricsRef.current = loopMetrics
		visibleKeyRef.current = ""
		updateVisibleCanvasItems()
	}, [canvasItems, loopMetrics, onOffsetRebase, offsetRef, scaleRef, updateVisibleCanvasItems])

	useEffect(() => {
		if (typeof window === "undefined") return

		window.addEventListener("resize", scheduleVisibleCanvasItemsUpdate)
		return () => {
			window.removeEventListener("resize", scheduleVisibleCanvasItemsUpdate)
		}
	}, [scheduleVisibleCanvasItemsUpdate])

	useEffect(() => {
		return () => {
			if (frameRef.current != null) {
				cancelAnimationFrame(frameRef.current)
				frameRef.current = null
			}
		}
	}, [])

	return {
		scheduleVisibleCanvasItemsUpdate,
		updateVisibleCanvasItems,
		visibleCanvasItems,
	}
}
