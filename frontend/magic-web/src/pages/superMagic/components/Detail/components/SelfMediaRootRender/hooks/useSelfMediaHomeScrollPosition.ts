import { useCallback, useEffect, useLayoutEffect, useRef } from "react"

interface UseSelfMediaHomeScrollPositionOptions {
	initialScrollTop?: number
	onScrollTopChange?: (scrollTop: number) => void
}

export function useSelfMediaHomeScrollPosition({
	initialScrollTop = 0,
	onScrollTopChange,
}: UseSelfMediaHomeScrollPositionOptions) {
	const viewportRef = useRef<HTMLDivElement | null>(null)

	useLayoutEffect(() => {
		const viewport = viewportRef.current
		if (!viewport) return undefined

		const scrollTop = Math.max(0, initialScrollTop)
		viewport.scrollTop = scrollTop
		const frame = window.requestAnimationFrame(() => {
			if (viewportRef.current) {
				viewportRef.current.scrollTop = scrollTop
			}
		})

		return () => window.cancelAnimationFrame(frame)
	}, [initialScrollTop])

	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport || !onScrollTopChange) return undefined

		const handleScroll = () => onScrollTopChange(viewport.scrollTop)
		viewport.addEventListener("scroll", handleScroll, { passive: true })
		handleScroll()

		return () => viewport.removeEventListener("scroll", handleScroll)
	}, [onScrollTopChange])

	return viewportRef
}

export function useSelfMediaHomeScrollMemory(resetKey: string) {
	const scrollTopRef = useRef(0)
	const resetKeyRef = useRef(resetKey)

	if (resetKeyRef.current !== resetKey) {
		resetKeyRef.current = resetKey
		scrollTopRef.current = 0
	}

	const handleScrollTopChange = useCallback((scrollTop: number) => {
		scrollTopRef.current = scrollTop
	}, [])

	return {
		initialScrollTop: scrollTopRef.current,
		onScrollTopChange: handleScrollTopChange,
	}
}
