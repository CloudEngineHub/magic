import { useCallback, useEffect, useState } from "react"

const COMPACT_ENTER_SCROLL_TOP = 56
const COMPACT_EXIT_SCROLL_TOP = 12
const MIN_STABLE_SCROLL_RANGE = 220

function hasStableScrollRange(viewportElement: HTMLDivElement) {
	const { clientHeight, scrollHeight } = viewportElement
	if (clientHeight <= 0 || scrollHeight <= 0) {
		return true
	}

	return scrollHeight - clientHeight >= MIN_STABLE_SCROLL_RANGE
}

export function useStepHeaderCompact(currentStep: number, showTemplateSelector: boolean) {
	const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null)
	const [isCompact, setIsCompact] = useState(false)

	const setViewportRef = useCallback((node: HTMLDivElement | null) => {
		setViewportElement(node)
	}, [])

	useEffect(() => {
		if (!viewportElement) return

		const updateHeaderDensity = () => {
			const scrollTop = viewportElement.scrollTop
			const canCompact = hasStableScrollRange(viewportElement)

			setIsCompact((currentIsCompact) => {
				if (!canCompact) {
					return false
				}
				if (currentIsCompact) {
					return scrollTop > COMPACT_EXIT_SCROLL_TOP
				}
				return scrollTop >= COMPACT_ENTER_SCROLL_TOP
			})
		}

		updateHeaderDensity()
		viewportElement.addEventListener("scroll", updateHeaderDensity, { passive: true })

		return () => {
			viewportElement.removeEventListener("scroll", updateHeaderDensity)
		}
	}, [currentStep, showTemplateSelector, viewportElement])

	return {
		isCompact,
		setViewportRef,
	}
}
