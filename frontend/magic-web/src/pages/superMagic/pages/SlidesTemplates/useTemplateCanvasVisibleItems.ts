import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import type { TemplateCanvasItem, TemplateCanvasPoint } from "./canvasLayout"
import type { SlidesTemplateCanvasTile } from "./canvasInteraction"
import { getVisibleTemplateCanvasItems } from "./canvasViewport"

interface UseTemplateCanvasVisibleItemsInput {
	canvasItems: Array<TemplateCanvasItem<SlidesTemplateCanvasTile>>
	offsetRef: RefObject<TemplateCanvasPoint>
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
	offsetRef,
	scaleRef,
	viewportRef,
}: UseTemplateCanvasVisibleItemsInput) {
	const canvasItemsRef = useRef(canvasItems)
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
		const nextItems = getVisibleTemplateCanvasItems({
			items,
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
		canvasItemsRef.current = canvasItems
		visibleKeyRef.current = ""
		updateVisibleCanvasItems()
	}, [canvasItems, updateVisibleCanvasItems])

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
