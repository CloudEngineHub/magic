import { useEffect, useState, type RefObject } from "react"

interface UseElementVisibilityOptions {
	enabled?: boolean
	initialVisible?: boolean
	root?: Element | null
	rootRef?: RefObject<Element | null>
	rootMargin?: string
	threshold?: number | number[]
	minimumIntersectionRatio?: number
}

/** Returns whether the referenced element is currently visible in the viewport. */
export function useElementVisibility<T extends HTMLElement>(
	ref: RefObject<T | null>,
	options: UseElementVisibilityOptions = {},
) {
	const {
		enabled = true,
		initialVisible = false,
		root = null,
		rootRef,
		rootMargin = "0px",
		threshold = 0,
		minimumIntersectionRatio = 0,
	} = options
	const [isVisible, setIsVisible] = useState(initialVisible)

	useEffect(() => {
		if (!enabled) {
			setIsVisible(initialVisible)
			return
		}

		const element = ref.current
		if (!element) return
		const observerRoot = rootRef?.current ?? root
		if (rootRef && !observerRoot) return

		if (typeof IntersectionObserver === "undefined") {
			setIsVisible(true)
			return
		}

		const observer = new IntersectionObserver(
			([entry]) => {
				const intersectionRatio =
					entry?.intersectionRatio ?? (entry?.isIntersecting ? 1 : 0)
				setIsVisible(
					Boolean(entry?.isIntersecting) && intersectionRatio >= minimumIntersectionRatio,
				)
			},
			{ root: observerRoot, rootMargin, threshold },
		)
		observer.observe(element)

		return () => observer.disconnect()
	}, [
		enabled,
		initialVisible,
		minimumIntersectionRatio,
		ref,
		root,
		rootMargin,
		rootRef,
		threshold,
	])

	return isVisible
}
