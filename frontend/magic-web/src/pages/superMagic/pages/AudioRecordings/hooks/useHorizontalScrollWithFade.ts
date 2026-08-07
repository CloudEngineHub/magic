import { useCallback, useEffect, useRef, useState } from "react"

interface HorizontalScrollFadeState {
	canScrollStart: boolean
	canScrollEnd: boolean
}

/** Centers one item inside its own horizontal scroller without moving scrollable ancestors. */
export function centerHorizontalItemInContainer(container: HTMLElement, item: HTMLElement) {
	const itemCenter = item.offsetLeft + item.offsetWidth / 2
	const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
	container.scrollLeft = Math.max(
		0,
		Math.min(maxScrollLeft, itemCenter - container.clientWidth / 2),
	)
}

/** Tracks horizontal overflow and maps vertical wheel to sideways scroll for pill/meta strips. */
export function useHorizontalScrollWithFade<T extends HTMLElement>() {
	const scrollRef = useRef<T>(null)
	const [fadeState, setFadeState] = useState<HorizontalScrollFadeState>({
		canScrollStart: false,
		canScrollEnd: false,
	})

	/** Recomputes whether left/right edge fades should show based on scroll position. */
	const updateFadeState = useCallback(() => {
		const element = scrollRef.current
		if (!element) return

		const { scrollLeft, scrollWidth, clientWidth } = element
		const maxScrollLeft = scrollWidth - clientWidth
		const hasOverflow = maxScrollLeft > 1

		setFadeState({
			canScrollStart: hasOverflow && scrollLeft > 1,
			canScrollEnd: hasOverflow && scrollLeft < maxScrollLeft - 1,
		})
	}, [])

	useEffect(() => {
		const element = scrollRef.current
		if (!element) return

		updateFadeState()

		/** Converts vertical wheel delta into horizontal scroll when content overflows. */
		const handleWheel = (event: WheelEvent) => {
			if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
			if (element.scrollWidth <= element.clientWidth) return

			const maxScrollLeft = element.scrollWidth - element.clientWidth
			const nextScrollLeft = Math.max(
				0,
				Math.min(maxScrollLeft, element.scrollLeft + event.deltaY),
			)
			// At horizontal boundary, let the outer vertical scroll container consume the wheel.
			if (nextScrollLeft === element.scrollLeft) return

			event.preventDefault()
			element.scrollLeft = nextScrollLeft
		}

		element.addEventListener("scroll", updateFadeState, { passive: true })
		element.addEventListener("wheel", handleWheel, { passive: false })

		const resizeObserver = new ResizeObserver(updateFadeState)
		resizeObserver.observe(element)

		return () => {
			element.removeEventListener("scroll", updateFadeState)
			element.removeEventListener("wheel", handleWheel)
			resizeObserver.disconnect()
		}
	}, [updateFadeState])

	return { scrollRef, ...fadeState, refreshFadeState: updateFadeState }
}
