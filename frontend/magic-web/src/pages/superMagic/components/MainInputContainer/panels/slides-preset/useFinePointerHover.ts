import { useEffect, useState } from "react"

const FINE_POINTER_HOVER_QUERY = "(hover: hover) and (pointer: fine)"

function canUseFinePointerHover() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return false
	}

	const hasTouchPoints =
		typeof window.navigator !== "undefined" && window.navigator.maxTouchPoints > 0

	return !hasTouchPoints && window.matchMedia(FINE_POINTER_HOVER_QUERY).matches
}

export function useFinePointerHover() {
	const [canHover, setCanHover] = useState(canUseFinePointerHover)

	useEffect(() => {
		if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
			return
		}

		const mediaQueryList = window.matchMedia(FINE_POINTER_HOVER_QUERY)
		const updateCanHover = () => {
			setCanHover(canUseFinePointerHover())
		}

		updateCanHover()

		if (typeof mediaQueryList.addEventListener === "function") {
			mediaQueryList.addEventListener("change", updateCanHover)
			return () => {
				mediaQueryList.removeEventListener("change", updateCanHover)
			}
		}

		mediaQueryList.addListener(updateCanHover)
		return () => {
			mediaQueryList.removeListener(updateCanHover)
		}
	}, [])

	return canHover
}
