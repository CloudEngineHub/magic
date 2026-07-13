import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { SuperMagicApi } from "@/apis"
import {
	ALL_SLIDES_TEMPLATE_GROUP_KEY,
	SLIDES_TEMPLATE_CATEGORY_PAGE_SIZE,
	SLIDES_TEMPLATE_IMAGE_PROCESS,
	SLIDES_TEMPLATE_PAGE_SIZE,
	SLIDES_TEMPLATE_TAG_PAGE_SIZE,
	getSlidesTemplateCategoryCodeFromGroupKey,
	getSlidesTemplateTagCodeFromGroupKey,
	groupSlidesTemplates,
	toTemplateOption,
	type SlidesTemplateCategoryItem,
	type SlidesTemplateItem,
	type SlidesTemplateTagItem,
} from "./slidesTemplateState"

const SEARCH_DEBOUNCE_MS = 300

interface UseSlidesTemplateCatalogStateOptions {
	pageSize?: number
}

function mergeTemplates(
	currentTemplates: SlidesTemplateItem[],
	nextTemplates: SlidesTemplateItem[],
) {
	const templateMap = new Map(currentTemplates.map((template) => [template.code, template]))
	nextTemplates.forEach((template) => {
		templateMap.set(template.code, template)
	})
	return Array.from(templateMap.values())
}

export function useSlidesTemplateCatalogState({
	pageSize = SLIDES_TEMPLATE_PAGE_SIZE,
}: UseSlidesTemplateCatalogStateOptions = {}) {
	const [templates, setTemplates] = useState<SlidesTemplateItem[]>([])
	const [categories, setCategories] = useState<SlidesTemplateCategoryItem[]>([])
	const [tags, setTags] = useState<SlidesTemplateTagItem[]>([])
	const [categoryLoadFailed, setCategoryLoadFailed] = useState(false)
	const [tagLoadFailed, setTagLoadFailed] = useState(false)
	const [selectedGroupKey, setSelectedGroupKey] = useState(ALL_SLIDES_TEMPLATE_GROUP_KEY)
	const [keyword, setKeyword] = useState("")
	const [debouncedKeyword, setDebouncedKeyword] = useState("")
	const [page, setPage] = useState(1)
	const [total, setTotal] = useState(0)
	const [isLoading, setIsLoading] = useState(true)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const [hasCheckedAnyTemplate, setHasCheckedAnyTemplate] = useState(false)
	const [hasAnyTemplate, setHasAnyTemplate] = useState(true)
	const requestSeqRef = useRef(0)
	const mountedRef = useRef(true)
	const hasLoadedTemplatesRef = useRef(false)
	const appendRequestInFlightRef = useRef(false)
	const templateRequestKeyRef = useRef<string | null>(null)
	const templateOptionCacheRef = useRef(
		new Map<
			string,
			{ source: SlidesTemplateItem; option: ReturnType<typeof toTemplateOption> }
		>(),
	)

	useEffect(() => {
		mountedRef.current = true

		return () => {
			mountedRef.current = false
		}
	}, [])

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedKeyword(keyword.trim())
		}, SEARCH_DEBOUNCE_MS)

		return () => window.clearTimeout(timer)
	}, [keyword])

	useEffect(() => {
		let cancelled = false

		SuperMagicApi.getSlidesTemplateCategories({
			page: 1,
			page_size: SLIDES_TEMPLATE_CATEGORY_PAGE_SIZE,
		})
			.then((response) => {
				if (cancelled) return
				setCategories(response.list ?? [])
				setCategoryLoadFailed(false)
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Failed to fetch slides template categories", error)
				setCategories([])
				setCategoryLoadFailed(true)
			})

		return () => {
			cancelled = true
		}
	}, [])

	useEffect(() => {
		let cancelled = false

		SuperMagicApi.getSlidesTemplateTags({
			page: 1,
			page_size: SLIDES_TEMPLATE_TAG_PAGE_SIZE,
			...(debouncedKeyword ? { keyword: debouncedKeyword } : {}),
		})
			.then((response) => {
				if (cancelled) return
				setTags(response.list ?? [])
				setTagLoadFailed(false)
			})
			.catch((error) => {
				if (cancelled) return
				console.error("Failed to fetch slides template tags", error)
				setTags([])
				setTagLoadFailed(true)
			})

		return () => {
			cancelled = true
		}
	}, [debouncedKeyword])

	const categoryCodeSet = useMemo(
		() => new Set(categories.map((category) => category.code)),
		[categories],
	)
	const tagCodeSet = useMemo(() => new Set(tags.map((tag) => tag.code)), [tags])
	const selectedCategoryGroupCode = getSlidesTemplateCategoryCodeFromGroupKey(selectedGroupKey)
	const selectedCategoryCode =
		selectedCategoryGroupCode && categoryCodeSet.has(selectedCategoryGroupCode)
			? selectedCategoryGroupCode
			: undefined
	const selectedTagGroupCode = getSlidesTemplateTagCodeFromGroupKey(selectedGroupKey)
	const selectedTagCode =
		selectedTagGroupCode && tagCodeSet.has(selectedTagGroupCode)
			? selectedTagGroupCode
			: undefined

	const fetchTemplates = useCallback(
		async (nextPage: number, mode: "replace" | "append") => {
			if (mode === "append" && appendRequestInFlightRef.current) return

			const isAllTemplatesQuery =
				!debouncedKeyword && !selectedCategoryCode && !selectedTagCode
			const requestKey = JSON.stringify([
				mode,
				nextPage,
				pageSize,
				debouncedKeyword,
				selectedCategoryCode ?? "",
				selectedTagCode ?? "",
			])
			// StrictMode 会重新执行首屏 effect。相同查询仍在进行时复用它，避免重复请求。
			if (templateRequestKeyRef.current === requestKey) return
			templateRequestKeyRef.current = requestKey
			const requestSeq = ++requestSeqRef.current
			if (mode === "replace") {
				appendRequestInFlightRef.current = false
				setPage(1)
				setIsLoadingMore(false)
				if (hasLoadedTemplatesRef.current) {
					setIsRefreshing(true)
				} else {
					setIsLoading(true)
				}
			} else {
				appendRequestInFlightRef.current = true
				setIsLoadingMore(true)
			}

			try {
				const response = await SuperMagicApi.getSlidesTemplates(
					{
						page: nextPage,
						page_size: pageSize,
						...(debouncedKeyword ? { keyword: debouncedKeyword } : {}),
						...(selectedCategoryCode ? { category_code: selectedCategoryCode } : {}),
						...(selectedTagCode
							? { tag_codes: [selectedTagCode], tag_match: "any" as const }
							: {}),
					},
					{
						xMagicImageProcess: SLIDES_TEMPLATE_IMAGE_PROCESS,
					},
				)
				if (!mountedRef.current || requestSeq !== requestSeqRef.current) return

				const nextTemplates = response.list ?? []
				const nextTotal = response.total ?? nextTemplates.length
				setTemplates((currentTemplates) =>
					mode === "replace"
						? nextTemplates
						: mergeTemplates(currentTemplates, nextTemplates),
				)
				setPage(response.page ?? nextPage)
				setTotal(nextTotal)
				if (mode === "replace" && isAllTemplatesQuery) {
					setHasCheckedAnyTemplate(true)
					setHasAnyTemplate(nextTemplates.length > 0)
				}
				hasLoadedTemplatesRef.current = true
			} catch (error) {
				if (!mountedRef.current || requestSeq !== requestSeqRef.current) return
				console.error("Failed to fetch slides templates", error)
				if (mode === "replace" && !hasLoadedTemplatesRef.current) setTemplates([])
			} finally {
				if (templateRequestKeyRef.current === requestKey) {
					templateRequestKeyRef.current = null
				}
				if (mountedRef.current && requestSeq === requestSeqRef.current) {
					if (mode === "append") appendRequestInFlightRef.current = false
					setIsLoading(false)
					setIsRefreshing(false)
					setIsLoadingMore(false)
				}
			}
		},
		[debouncedKeyword, pageSize, selectedCategoryCode, selectedTagCode],
	)

	useEffect(() => {
		fetchTemplates(1, "replace")
	}, [fetchTemplates])

	const groups = useMemo(() => {
		const availableCategories = categoryLoadFailed ? undefined : categories
		const availableTags = tagLoadFailed ? undefined : tags
		return availableCategories || availableTags
			? groupSlidesTemplates(templates, availableCategories ?? [], availableTags ?? [])
			: groupSlidesTemplates(templates)
	}, [categories, categoryLoadFailed, tagLoadFailed, tags, templates])

	useEffect(() => {
		if (groups.some((group) => group.group_key === selectedGroupKey)) return
		setSelectedGroupKey(ALL_SLIDES_TEMPLATE_GROUP_KEY)
	}, [groups, selectedGroupKey])

	const selectedGroup = groups.find((group) => group.group_key === selectedGroupKey)
	const isServerBackedGroup =
		selectedGroupKey === ALL_SLIDES_TEMPLATE_GROUP_KEY ||
		Boolean(selectedCategoryCode) ||
		Boolean(selectedTagCode)
	const serverBackedTemplateOptions = useMemo(() => {
		const cache = templateOptionCacheRef.current
		const activeCodes = new Set<string>()

		const options = templates.map((template) => {
			activeCodes.add(template.code)
			const cached = cache.get(template.code)
			if (cached?.source === template) return cached.option

			const option = toTemplateOption(template)
			cache.set(template.code, { source: template, option })
			return option
		})

		for (const code of cache.keys()) {
			if (!activeCodes.has(code)) cache.delete(code)
		}

		return options
	}, [templates])
	const templateOptions = isServerBackedGroup
		? serverBackedTemplateOptions
		: (selectedGroup?.children ?? [])
	const hasMore = templates.length < total

	const loadMore = useCallback(() => {
		if (
			isLoading ||
			isRefreshing ||
			isLoadingMore ||
			appendRequestInFlightRef.current ||
			!hasMore
		) {
			return
		}
		fetchTemplates(page + 1, "append")
	}, [fetchTemplates, hasMore, isLoading, isLoadingMore, isRefreshing, page])

	return {
		groups,
		hasAnyTemplate,
		hasCheckedAnyTemplate,
		hasMore,
		isLoading,
		isRefreshing,
		isLoadingMore,
		keyword,
		loadMore,
		loadedTemplateCount: templates.length,
		selectedGroupKey,
		setKeyword,
		setSelectedGroupKey,
		templateOptions,
	}
}

export type SlidesTemplateCatalogState = ReturnType<typeof useSlidesTemplateCatalogState>
