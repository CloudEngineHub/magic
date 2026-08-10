import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type {
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { FEATURED_SLIDES_TEMPLATE_TAG_CODE } from "@/pages/superMagic/components/MainInputContainer/panels/slides-preset/templateMeta"
import { createSlidesTemplateTagGroupKey } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/slidesTemplateState"
import {
	mySlidesTemplateAdapter,
	type MySlidesTemplate,
	type MySlidesTemplateAdapter,
} from "@/pages/superMagic/services/mySlidesTemplateAdapter"

export const MY_SLIDES_TEMPLATES_GROUP_KEY = "__my_slides_templates__"

export type MySlidesTemplatesEmptyStatus = "empty" | "error" | "loading" | "unavailable"

interface MySlidesTemplatesState {
	status: "error" | "idle" | "loading" | "success" | "unavailable"
	templates: OptionItem[]
	revision: number
}

interface UseMySlidesTemplatesOptions {
	adapter?: MySlidesTemplateAdapter
	groups: OptionGroup[]
}

function toMySlidesTemplateOption(template: MySlidesTemplate): OptionItem {
	return {
		value: template.id,
		label: template.name,
		description: template.description,
		thumbnail_url: template.thumbnailUrl,
		collage_url: template.collageUrl,
		preview_url: template.previewUrl,
		preview_image_urls: template.previewImageUrls,
	}
}

export function useMySlidesTemplates({
	adapter = mySlidesTemplateAdapter,
	groups,
}: UseMySlidesTemplatesOptions) {
	const { t } = useTranslation("super")
	const [isSelected, setIsSelected] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const [state, setState] = useState<MySlidesTemplatesState>(() => ({
		status: adapter.enabled ? "idle" : "unavailable",
		templates: [],
		revision: 0,
	}))
	const requestSeqRef = useRef(0)

	const load = useCallback(
		async (keyword: string) => {
			if (!adapter.enabled) {
				setState((current) => ({ ...current, status: "unavailable" }))
				return
			}

			const requestSeq = requestSeqRef.current + 1
			requestSeqRef.current = requestSeq
			setState((current) => ({ ...current, status: "loading" }))

			try {
				const result = await adapter.listMine({
					page: 1,
					pageSize: 40,
					keyword: keyword.trim() || undefined,
				})
				if (requestSeq !== requestSeqRef.current) return
				setState((current) => ({
					status: "success",
					templates: result.items.map(toMySlidesTemplateOption),
					revision: current.revision + 1,
				}))
			} catch {
				if (requestSeq !== requestSeqRef.current) return
				setState((current) => ({ ...current, status: "error" }))
			}
		},
		[adapter],
	)

	useEffect(() => {
		if (!isSelected) return
		if (!adapter.enabled) {
			void load(searchValue)
			return
		}

		const delay = requestSeqRef.current === 0 ? 0 : 300
		const timer = window.setTimeout(() => {
			void load(searchValue)
		}, delay)
		return () => window.clearTimeout(timer)
	}, [adapter.enabled, isSelected, load, searchValue])

	const templateGroups = useMemo(() => {
		const nextGroups = [...groups]
		const featuredGroupIndex = nextGroups.findIndex(
			(group) =>
				group.group_key ===
				createSlidesTemplateTagGroupKey(FEATURED_SLIDES_TEMPLATE_TAG_CODE),
		)
		nextGroups.splice(featuredGroupIndex >= 0 ? featuredGroupIndex : 1, 0, {
			group_key: MY_SLIDES_TEMPLATES_GROUP_KEY,
			group_name: t("mySlidesTemplates.entry"),
			children: state.templates,
		})
		return nextGroups
	}, [groups, state.templates, t])
	const leave = useCallback(() => setIsSelected(false), [])
	const select = useCallback(() => setIsSelected(true), [])
	const retry = useCallback(() => load(searchValue), [load, searchValue])

	const emptyStatus: MySlidesTemplatesEmptyStatus | null = (() => {
		if (!isSelected) return null
		if (state.status === "idle" || (state.status === "loading" && !state.templates.length)) {
			return "loading"
		}
		if (state.status === "error") return "error"
		if (state.status === "unavailable") return "unavailable"
		return state.templates.length === 0 ? "empty" : null
	})()

	return {
		emptyStatus,
		groups: templateGroups,
		isSelected,
		leave,
		loadMoreSignal: state.revision,
		resetKey: `my:${state.revision}`,
		retry,
		searchValue,
		select,
		setSearchValue,
		templates: state.templates,
	}
}
