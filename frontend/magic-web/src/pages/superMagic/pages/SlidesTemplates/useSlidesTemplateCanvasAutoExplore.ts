import { useCallback, useEffect } from "react"
import { useSlidesTemplateCanvasIdle } from "./useSlidesTemplateCanvasIdle"

interface UseSlidesTemplateCanvasAutoExploreInput {
	disabled: boolean
	startIdleExploration: () => void
	stopAnimation: () => void
}

export function useSlidesTemplateCanvasAutoExplore({
	disabled,
	startIdleExploration,
	stopAnimation,
}: UseSlidesTemplateCanvasAutoExploreInput) {
	const {
		isIdle,
		markActive: markCanvasActive,
		markInactive: markCanvasInactive,
	} = useSlidesTemplateCanvasIdle({ disabled })

	const handleCanvasActivity = useCallback(() => {
		markCanvasActive()
		stopAnimation()
	}, [markCanvasActive, stopAnimation])

	useEffect(() => {
		if (!isIdle) {
			stopAnimation()
			return
		}

		startIdleExploration()
		return stopAnimation
	}, [isIdle, startIdleExploration, stopAnimation])

	return {
		handleCanvasActivity,
		isIdle,
		markCanvasInactive,
	}
}
