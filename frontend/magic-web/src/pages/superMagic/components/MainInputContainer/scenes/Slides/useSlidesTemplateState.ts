import { useEffect, useMemo, useState } from "react"
import { SuperMagicApi } from "@/apis"
import {
	createSlidesFixedSceneConfig,
	SLIDES_TEMPLATE_PAGE_SIZE,
	type SlidesTemplateItem,
} from "./slidesTemplateState"

export function useSlidesTemplateState(enabled: boolean) {
	const [templates, setTemplates] = useState<SlidesTemplateItem[] | null>(null)
	const [loading, setLoading] = useState(false)

	useEffect(() => {
		if (!enabled) {
			setTemplates(null)
			setLoading(false)
			return
		}

		let cancelled = false
		setTemplates(null)
		setLoading(true)
		SuperMagicApi.getSlidesTemplates({
			page: 1,
			page_size: SLIDES_TEMPLATE_PAGE_SIZE,
		})
			.then((res) => {
				if (cancelled) return
				setTemplates(res.list)
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Failed to fetch slides templates", error)
				setTemplates([])
			})
			.finally(() => {
				if (!cancelled) setLoading(false)
			})

		return () => {
			cancelled = true
		}
	}, [enabled])

	const sceneConfig = useMemo(() => {
		if (!templates) return undefined
		return createSlidesFixedSceneConfig(templates)
	}, [templates])

	return {
		sceneConfig,
		isLoading: enabled && (loading || !templates),
	}
}
