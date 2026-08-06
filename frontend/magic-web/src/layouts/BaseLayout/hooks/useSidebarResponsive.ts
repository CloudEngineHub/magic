import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { sidebarStore } from "@/stores/layout"

const SIDEBAR_RESIZE_KEYS = new Set([
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"End",
	"Home",
])

function convertPercentToPx(sizePercent: number): number {
	return (sizePercent / 100) * window.innerWidth
}

function convertPxToPercentByViewWidth(sizePx: number, viewWidth: number): number {
	if (!viewWidth) return sidebarStore.MIN_WIDTH_PERCENT
	return (sizePx / viewWidth) * 100
}

function getNarrowViewportMinSidebarWidthPx(viewWidth: number): number {
	const narrowMax = 1000
	const narrowMin = 768
	const minWidthAtNarrowMax = 220
	const minWidthAtNarrowMin = 196

	// Keep continuity at 1000px to avoid flicker/jump.
	// Above 1000px we still enforce a 220px floor and let percentage
	// naturally decrease as viewport grows.
	if (viewWidth >= narrowMax) return minWidthAtNarrowMax
	if (viewWidth <= narrowMin) return minWidthAtNarrowMin

	const ratio = (viewWidth - narrowMin) / (narrowMax - narrowMin)
	return minWidthAtNarrowMin + ratio * (minWidthAtNarrowMax - minWidthAtNarrowMin)
}

function getMinSidebarSizePercent(viewWidth: number): number {
	const narrowViewportMinSidebarPercent = convertPxToPercentByViewWidth(
		getNarrowViewportMinSidebarWidthPx(viewWidth),
		viewWidth,
	)
	return Math.max(sidebarStore.MIN_WIDTH_PERCENT, narrowViewportMinSidebarPercent)
}

interface UseSidebarResponsiveParams {
	sidebarPanelRef: RefObject<ImperativePanelHandle>
	initialWidth: number
}

function useSidebarResponsive({ sidebarPanelRef, initialWidth }: UseSidebarResponsiveParams) {
	const isUserResizingRef = useRef(false)
	const hasPendingUserResizeRef = useRef(false)
	const keyboardResizeTimerRef = useRef<number>()
	const expandedSidebarWidthPxRef = useRef(convertPercentToPx(initialWidth))
	const expandedSidebarSizePercentRef = useRef(initialWidth)
	const prevWindowWidthRef = useRef(window.innerWidth)
	const [minSidebarSizePercent, setMinSidebarSizePercent] = useState(() =>
		getMinSidebarSizePercent(window.innerWidth),
	)

	const getExpandedSidebarSizePercent = useCallback((viewWidth: number) => {
		const minMainPx = sidebarStore.getMinMainContentWidthPx(viewWidth)
		const maxSidebarPercent = Math.max(
			sidebarStore.MIN_WIDTH_PERCENT,
			100 - (minMainPx / viewWidth) * 100,
		)
		const minSidebarPercent = getMinSidebarSizePercent(viewWidth)
		const desiredPercent = convertPxToPercentByViewWidth(
			expandedSidebarWidthPxRef.current,
			viewWidth,
		)
		return Math.max(
			minSidebarPercent,
			Math.min(maxSidebarPercent, sidebarStore.MAX_WIDTH_PERCENT, desiredPercent),
		)
	}, [])

	const syncSidebarByViewport = useCallback(
		(isShrinking: boolean) => {
			const viewWidth = window.innerWidth
			const autoCollapseThreshold = sidebarStore.getAutoCollapseThresholdPx(
				viewWidth,
				expandedSidebarWidthPxRef.current,
			)
			if (viewWidth <= autoCollapseThreshold) {
				// Only auto-collapse when the window is shrinking, not when expanding
				if (isShrinking && !sidebarStore.collapsed) sidebarStore.setCollapsed(true)
				return
			}
			if (sidebarStore.collapsed || !sidebarPanelRef.current) return

			const nextSizePercent = getExpandedSidebarSizePercent(viewWidth)
			sidebarPanelRef.current.resize(nextSizePercent)
			sidebarStore.setWidth(nextSizePercent)
		},
		[getExpandedSidebarSizePercent, sidebarPanelRef],
	)

	useEffect(() => {
		function handleResize() {
			const currentWidth = window.innerWidth
			const isShrinking = currentWidth < prevWindowWidthRef.current
			prevWindowWidthRef.current = currentWidth
			setMinSidebarSizePercent(getMinSidebarSizePercent(currentWidth))
			syncSidebarByViewport(isShrinking)
		}

		// A narrow desktop must start in the compact navigation state. The sidebar
		// can still be expanded manually afterwards; we only run this automatic
		// collapse when the layout is first mounted or the viewport shrinks.
		syncSidebarByViewport(true)
		window.addEventListener("resize", handleResize)

		return () => {
			window.removeEventListener("resize", handleResize)
		}
	}, [syncSidebarByViewport])

	useEffect(() => {
		return () => {
			if (keyboardResizeTimerRef.current) {
				window.clearTimeout(keyboardResizeTimerRef.current)
			}
			if (hasPendingUserResizeRef.current) {
				sidebarStore.setWidth(expandedSidebarSizePercentRef.current)
			}
			sidebarStore.persistWidth()
		}
	}, [])

	const commitPendingUserResize = useCallback(() => {
		if (!hasPendingUserResizeRef.current) return

		sidebarStore.setWidth(expandedSidebarSizePercentRef.current)
		hasPendingUserResizeRef.current = false
	}, [])

	const scheduleKeyboardResizeCommit = useCallback(() => {
		if (keyboardResizeTimerRef.current) {
			window.clearTimeout(keyboardResizeTimerRef.current)
		}

		keyboardResizeTimerRef.current = window.setTimeout(() => {
			commitPendingUserResize()
			isUserResizingRef.current = false
			keyboardResizeTimerRef.current = undefined
		}, 100)
	}, [commitPendingUserResize])

	const handleSidebarResize = useCallback(
		(sizePercent: number) => {
			if (sidebarStore.collapsed || !isUserResizingRef.current) return

			expandedSidebarSizePercentRef.current = sizePercent
			expandedSidebarWidthPxRef.current = convertPercentToPx(sizePercent)
			hasPendingUserResizeRef.current = true

			// Pointer dragging has an explicit end event. Keyboard resizing uses a
			// short debounce because the panel library does not expose a key-resize end event.
			if (keyboardResizeTimerRef.current) {
				scheduleKeyboardResizeCommit()
				isUserResizingRef.current = false
			}
		},
		[scheduleKeyboardResizeCommit],
	)

	const handleSidebarDragging = useCallback(
		(isDragging: boolean) => {
			if (keyboardResizeTimerRef.current) {
				window.clearTimeout(keyboardResizeTimerRef.current)
				keyboardResizeTimerRef.current = undefined
			}

			isUserResizingRef.current = isDragging
			if (!isDragging) commitPendingUserResize()
		},
		[commitPendingUserResize],
	)

	const handleSidebarResizeKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (!SIDEBAR_RESIZE_KEYS.has(event.key)) return false

			isUserResizingRef.current = true
			scheduleKeyboardResizeCommit()
			return true
		},
		[scheduleKeyboardResizeCommit],
	)

	return {
		getExpandedSidebarSizePercent,
		handleSidebarDragging,
		handleSidebarResize,
		handleSidebarResizeKeyDown,
		minSidebarSizePercent,
	}
}

export default useSidebarResponsive
