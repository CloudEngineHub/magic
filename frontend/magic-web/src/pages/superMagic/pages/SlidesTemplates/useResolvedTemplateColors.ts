import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react"
import { normalizeTemplateColors } from "./templateColors"
import {
	getExtractedTemplateColors,
	getTemplateColorExtractionVersion,
	requestTemplateColorExtraction,
	subscribeTemplateColorExtraction,
	subscribeTemplateColorExtractionChanges,
	type TemplateColorExtractionPriority,
} from "./templateColorExtractionStore"

interface UseResolvedTemplateColorsInput {
	colors?: string[]
	enabled?: boolean
	imageUrl?: string
	priority?: TemplateColorExtractionPriority
}

const EMPTY_COLORS: string[] = Object.freeze([]) as string[]

export function useResolvedTemplateColors({
	colors,
	enabled = true,
	imageUrl,
	priority = "background",
}: UseResolvedTemplateColorsInput) {
	const backendColors = useMemo(() => normalizeTemplateColors(colors), [colors])
	const subscribe = useCallback(
		(listener: () => void) => subscribeTemplateColorExtraction(imageUrl, listener),
		[imageUrl],
	)
	const getSnapshot = useCallback(() => getExtractedTemplateColors(imageUrl), [imageUrl])
	const extractedColors = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_COLORS)

	useEffect(() => {
		if (!enabled || backendColors.length > 0) return
		requestTemplateColorExtraction(imageUrl, priority)
	}, [backendColors.length, enabled, imageUrl, priority])

	return backendColors.length > 0 ? backendColors : extractedColors
}

export function useTemplateColorExtractionVersion(enabled: boolean) {
	const subscribe = useCallback(
		(listener: () => void) =>
			enabled ? subscribeTemplateColorExtractionChanges(listener) : () => undefined,
		[enabled],
	)
	const getSnapshot = useCallback(
		() => (enabled ? getTemplateColorExtractionVersion() : 0),
		[enabled],
	)

	return useSyncExternalStore(subscribe, getSnapshot, () => 0)
}
