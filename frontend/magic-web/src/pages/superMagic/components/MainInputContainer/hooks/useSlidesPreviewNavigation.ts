import { type RefObject, useCallback, useEffect, useState } from "react"

const PREVIEW_PAGE_WHEEL_THRESHOLD = 80
const PREVIEW_PAGE_WHEEL_COOLDOWN_MS = 320
const EDITABLE_TARGET_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

interface UseSlidesPreviewNavigationOptions {
	enabled?: boolean
	initialIndex?: number
	onEscape?: () => void
	onInteraction?: () => void
	pageCount: number
	resetKey?: string
}

interface UseSlidesPreviewWheelNavigationOptions {
	containerRef: RefObject<HTMLElement | null>
	enabled: boolean
	onNext: () => void
	onPrevious: () => void
}

function clampPageIndex(index: number, pageCount: number) {
	if (pageCount <= 0) return 0
	return Math.min(Math.max(index, 0), pageCount - 1)
}

function isEditableTarget(target: EventTarget | null) {
	return target instanceof Element && Boolean(target.closest(EDITABLE_TARGET_SELECTOR))
}

/**
 * 统一模板预览的循环翻页行为。预览打开时由方向键接管翻页，但输入控件仍保留原生键盘行为。
 */
export function useSlidesPreviewNavigation({
	enabled = true,
	initialIndex = 0,
	onEscape,
	onInteraction,
	pageCount,
	resetKey,
}: UseSlidesPreviewNavigationOptions) {
	const safeInitialIndex = clampPageIndex(initialIndex, pageCount)
	const [activeIndex, setActiveIndex] = useState(safeInitialIndex)
	const safeActiveIndex = clampPageIndex(activeIndex, pageCount)
	const canSwitch = pageCount > 1

	useEffect(() => {
		setActiveIndex(safeInitialIndex)
	}, [pageCount, resetKey, safeInitialIndex])

	const goToPage = useCallback(
		(index: number) => {
			if (!pageCount) return
			onInteraction?.()
			setActiveIndex(clampPageIndex(index, pageCount))
		},
		[onInteraction, pageCount],
	)

	const goToPrevious = useCallback(() => {
		if (!canSwitch) return
		onInteraction?.()
		setActiveIndex((currentIndex) => {
			const safeCurrentIndex = clampPageIndex(currentIndex, pageCount)
			return safeCurrentIndex <= 0 ? pageCount - 1 : safeCurrentIndex - 1
		})
	}, [canSwitch, onInteraction, pageCount])

	const goToNext = useCallback(() => {
		if (!canSwitch) return
		onInteraction?.()
		setActiveIndex((currentIndex) => {
			const safeCurrentIndex = clampPageIndex(currentIndex, pageCount)
			return safeCurrentIndex >= pageCount - 1 ? 0 : safeCurrentIndex + 1
		})
	}, [canSwitch, onInteraction, pageCount])

	useEffect(() => {
		if (!enabled || (!canSwitch && !onEscape)) return

		function handleKeyDown(event: KeyboardEvent) {
			if (event.defaultPrevented) return

			if (event.key === "Escape" && onEscape) {
				event.preventDefault()
				event.stopPropagation()
				onEscape()
				return
			}

			if (
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				isEditableTarget(event.target)
			) {
				return
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault()
				event.stopPropagation()
				goToPrevious()
			} else if (event.key === "ArrowRight") {
				event.preventDefault()
				event.stopPropagation()
				goToNext()
			}
		}

		document.addEventListener("keydown", handleKeyDown, true)
		return () => document.removeEventListener("keydown", handleKeyDown, true)
	}, [canSwitch, enabled, goToNext, goToPrevious, onEscape])

	return {
		activeIndex: safeActiveIndex,
		canSwitch,
		goToNext,
		goToPage,
		goToPrevious,
	}
}

/** 统一鼠标滚轮和触控板手势，超过阈值后每次只切换一页，避免惯性滚动连续跳页。 */
export function useSlidesPreviewWheelNavigation({
	containerRef,
	enabled,
	onNext,
	onPrevious,
}: UseSlidesPreviewWheelNavigationOptions) {
	useEffect(() => {
		const container = containerRef.current
		if (!container || !enabled) return

		let accumulatedDelta = 0
		let cooldownTimer: number | null = null

		function handleWheel(event: WheelEvent) {
			if (event.ctrlKey || event.metaKey) return

			const delta =
				Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
			if (Math.abs(delta) < 1) return

			if (event.cancelable) event.preventDefault()
			event.stopPropagation()

			if (cooldownTimer != null) return

			accumulatedDelta += delta
			if (Math.abs(accumulatedDelta) < PREVIEW_PAGE_WHEEL_THRESHOLD) return

			if (accumulatedDelta > 0) onNext()
			else onPrevious()

			accumulatedDelta = 0
			cooldownTimer = window.setTimeout(() => {
				cooldownTimer = null
				accumulatedDelta = 0
			}, PREVIEW_PAGE_WHEEL_COOLDOWN_MS)
		}

		container.addEventListener("wheel", handleWheel, { passive: false })
		return () => {
			container.removeEventListener("wheel", handleWheel)
			if (cooldownTimer != null) window.clearTimeout(cooldownTimer)
		}
	}, [containerRef, enabled, onNext, onPrevious])
}
