import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function getElementWidth(element: HTMLElement | null) {
	return element?.getBoundingClientRect().width ?? 0
}

export function useMeasuredContainerWidth<Element extends HTMLElement>() {
	const containerRef = useRef<Element | null>(null)
	const [width, setWidth] = useState(0)

	const updateWidth = useCallback(() => {
		const measuredWidth = getElementWidth(containerRef.current)
		setWidth((current) => (Math.abs(current - measuredWidth) < 0.5 ? current : measuredWidth))
	}, [])

	useIsomorphicLayoutEffect(() => {
		const element = containerRef.current
		if (!element) return undefined

		updateWidth()
		let frame = 0
		const handleResize = () => updateWidth()
		window.addEventListener("resize", handleResize)

		if (typeof ResizeObserver === "undefined") {
			updateWidth()
			return () => {
				window.cancelAnimationFrame(frame)
				window.removeEventListener("resize", handleResize)
			}
		}

		const observer = new ResizeObserver(() => {
			window.cancelAnimationFrame(frame)
			frame = window.requestAnimationFrame(() => updateWidth())
		})
		observer.observe(element)

		return () => {
			window.cancelAnimationFrame(frame)
			window.removeEventListener("resize", handleResize)
			observer.disconnect()
		}
	}, [updateWidth])

	return { containerRef, width }
}
