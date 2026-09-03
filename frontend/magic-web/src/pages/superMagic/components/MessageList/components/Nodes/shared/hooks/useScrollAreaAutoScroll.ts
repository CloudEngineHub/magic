import { useCallback, useEffect, useRef, useState } from "react"

const BOTTOM_THRESHOLD = 8

interface UseScrollAreaAutoScrollOptions {
	isStreaming: boolean
}

/**
 * Lightweight auto-scroll for inner ScrollArea containers during streaming.
 *
 * Returns a callback ref to pass as `viewportRef` on <ScrollArea>.
 * While streaming, new content auto-scrolls to the bottom.
 * If the user scrolls up, auto-follow pauses.
 * If the user scrolls back to the bottom, auto-follow resumes.
 */
export function useScrollAreaAutoScroll({ isStreaming }: UseScrollAreaAutoScrollOptions) {
	const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
	const autoFollowRef = useRef(true)
	const previousScrollTopRef = useRef(0)
	const followUpScrollRafRef = useRef<number | null>(null)

	const isAtBottom = useCallback((el: HTMLElement) => {
		return el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD
	}, [])

	const cancelFollowUpScroll = useCallback(() => {
		if (followUpScrollRafRef.current === null) return
		window.cancelAnimationFrame(followUpScrollRafRef.current)
		followUpScrollRafRef.current = null
	}, [])

	const scrollToBottom = useCallback(
		(el: HTMLElement) => {
			cancelFollowUpScroll()

			const applyScroll = () => {
				if (!autoFollowRef.current) return false
				el.scrollTop = el.scrollHeight
				previousScrollTopRef.current = el.scrollTop
				return true
			}

			applyScroll()

			// XMarkdown may update its streaming cache and animated text in later commits.
			// Two trailing frames keep the viewport pinned to the final rendered height.
			followUpScrollRafRef.current = window.requestAnimationFrame(() => {
				if (!applyScroll()) {
					followUpScrollRafRef.current = null
					return
				}

				followUpScrollRafRef.current = window.requestAnimationFrame(() => {
					followUpScrollRafRef.current = null
					applyScroll()
				})
			})
		},
		[cancelFollowUpScroll],
	)

	useEffect(() => {
		if (isStreaming) {
			autoFollowRef.current = true
			if (viewport) scrollToBottom(viewport)
		}
	}, [isStreaming, scrollToBottom, viewport])

	useEffect(() => {
		if (!viewport) return

		const contentWrapper = viewport.firstElementChild as HTMLElement | null
		if (!contentWrapper) return

		const observer = new ResizeObserver(() => {
			if (!autoFollowRef.current) return
			scrollToBottom(viewport)
		})

		observer.observe(contentWrapper)

		return () => {
			observer.disconnect()
			cancelFollowUpScroll()
		}
	}, [cancelFollowUpScroll, scrollToBottom, viewport])

	useEffect(() => {
		if (!viewport) return
		previousScrollTopRef.current = viewport.scrollTop

		const handleScroll = () => {
			const currentScrollTop = viewport.scrollTop
			if (isAtBottom(viewport)) {
				autoFollowRef.current = true
			} else if (currentScrollTop < previousScrollTopRef.current) {
				// Content growth can increase the distance from the bottom without moving scrollTop.
				// Pause only for a real upward movement, so delayed programmatic events stay harmless.
				autoFollowRef.current = false
				cancelFollowUpScroll()
			}
			previousScrollTopRef.current = currentScrollTop
		}

		const handleWheel = (e: WheelEvent) => {
			if (e.deltaY < 0) {
				autoFollowRef.current = false
				cancelFollowUpScroll()
			}
		}

		viewport.addEventListener("scroll", handleScroll, { passive: true })
		viewport.addEventListener("wheel", handleWheel, { passive: true })

		return () => {
			viewport.removeEventListener("scroll", handleScroll)
			viewport.removeEventListener("wheel", handleWheel)
		}
	}, [cancelFollowUpScroll, viewport, isAtBottom])

	useEffect(() => cancelFollowUpScroll, [cancelFollowUpScroll])

	const viewportRef = useCallback((node: HTMLDivElement | null) => {
		setViewport(node)
	}, [])

	return { viewportRef }
}
