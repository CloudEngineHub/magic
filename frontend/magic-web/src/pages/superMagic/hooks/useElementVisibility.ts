import { useEffect, useState, type RefObject } from "react"

interface UseElementVisibilityOptions {
	root?: Element | null
	rootMargin?: string
	threshold?: number | number[]
}

/** Returns whether the referenced element is currently visible in the viewport. */
export function useElementVisibility<T extends HTMLElement>(
	ref: RefObject<T | null>,
	options: UseElementVisibilityOptions = {},
) {
	const [isVisible, setIsVisible] = useState(false)
	const { root = null, rootMargin = "0px", threshold = 0 } = options

	useEffect(() => {
		const element = ref.current
		if (!element) return

		if (typeof IntersectionObserver === "undefined") {
			setIsVisible(true)
			return
		}

		const observer = new IntersectionObserver(
			([entry]) => setIsVisible(Boolean(entry?.isIntersecting)),
			{ root, rootMargin, threshold },
		)
		observer.observe(element)

		return () => observer.disconnect()
	}, [ref, root, rootMargin, threshold])

	return isVisible
}
