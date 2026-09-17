import { useEffect, useState } from "react"

const COMPACT_MODE_MAX_HEIGHT = 760

interface UseConversationCompactModeOptions {
	enabled?: boolean
}

/** Disable sticky conversation rows when a desktop window has limited vertical space. */
export function useConversationCompactMode({
	enabled = true,
}: UseConversationCompactModeOptions = {}) {
	const [isCompactMode, setIsCompactMode] = useState(false)

	useEffect(() => {
		if (!enabled) {
			setIsCompactMode(false)
			return
		}

		const updateCompactMode = () => {
			const next = window.innerHeight < COMPACT_MODE_MAX_HEIGHT
			setIsCompactMode((previous) => (previous === next ? previous : next))
		}

		updateCompactMode()
		window.addEventListener("resize", updateCompactMode)
		return () => window.removeEventListener("resize", updateCompactMode)
	}, [enabled])

	return isCompactMode
}
