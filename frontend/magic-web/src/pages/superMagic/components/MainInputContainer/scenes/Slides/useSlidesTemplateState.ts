import { useMemo } from "react"
import { createSlidesFixedSceneConfig } from "./slidesTemplateState"

export function useSlidesTemplateState(enabled: boolean) {
	const sceneConfig = useMemo(() => {
		if (!enabled) return undefined
		return createSlidesFixedSceneConfig()
	}, [enabled])

	return {
		sceneConfig,
		isLoading: false,
	}
}
