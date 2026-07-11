import { useCallback, useEffect, useRef, useState } from "react"

export const SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS = 3200
export const SLIDES_TEMPLATE_CANVAS_POINTER_ACTIVITY_THRESHOLD = 10

interface UseSlidesTemplateCanvasIdleInput {
	disabled: boolean
}

export function useSlidesTemplateCanvasIdle({ disabled }: UseSlidesTemplateCanvasIdleInput) {
	const [isIdle, setIsIdle] = useState(false)
	const hasInitializedRef = useRef(false)
	const timeoutRef = useRef<number | null>(null)

	const clearIdleTimer = useCallback(() => {
		if (timeoutRef.current == null) return
		window.clearTimeout(timeoutRef.current)
		timeoutRef.current = null
	}, [])

	const markActive = useCallback(() => {
		clearIdleTimer()
		setIsIdle(false)
		if (disabled || document.hidden) return

		timeoutRef.current = window.setTimeout(() => {
			timeoutRef.current = null
			setIsIdle(true)
		}, SLIDES_TEMPLATE_CANVAS_IDLE_DELAY_MS)
	}, [clearIdleTimer, disabled])

	useEffect(() => {
		clearIdleTimer()
		if (disabled) {
			setIsIdle(false)
			return
		}

		if (!hasInitializedRef.current) {
			hasInitializedRef.current = true
			setIsIdle(true)
			return
		}

		markActive()
		return clearIdleTimer
	}, [clearIdleTimer, disabled, markActive])

	useEffect(() => {
		function handleVisibilityChange() {
			markActive()
		}

		function handleWindowBlur() {
			clearIdleTimer()
			setIsIdle(false)
		}

		document.addEventListener("visibilitychange", handleVisibilityChange)
		window.addEventListener("blur", handleWindowBlur)
		window.addEventListener("focus", markActive)
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange)
			window.removeEventListener("blur", handleWindowBlur)
			window.removeEventListener("focus", markActive)
		}
	}, [clearIdleTimer, markActive])

	return { isIdle, markActive }
}
