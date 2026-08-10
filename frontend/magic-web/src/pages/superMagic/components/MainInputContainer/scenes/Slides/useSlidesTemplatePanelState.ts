import { useCallback, useRef } from "react"
import {
	MY_SLIDES_TEMPLATES_GROUP_KEY,
	useMySlidesTemplates,
} from "@/pages/superMagic/pages/SlidesTemplates/useMySlidesTemplates"
import { useSlidesTemplateCatalogState } from "./useSlidesTemplateCatalogState"

const NOOP = () => undefined

export function useSlidesTemplatePanelState() {
	const catalogState = useSlidesTemplateCatalogState()
	const mySlidesTemplates = useMySlidesTemplates({ groups: catalogState.groups })
	const {
		emptyStatus: myTemplatesEmptyStatus,
		groups,
		isSelected: isMyTemplatesSelected,
		leave,
		loadMoreSignal,
		retry: retryMyTemplates,
		searchValue,
		select,
		setSearchValue,
		templates: myTemplates,
	} = mySlidesTemplates
	const {
		loadTemplateDetail: loadCatalogTemplateDetail,
		setKeyword: setCatalogKeyword,
		setSelectedGroupKey: setCatalogSelectedGroupKey,
	} = catalogState
	const isMyTemplatesSelectedRef = useRef(isMyTemplatesSelected)
	isMyTemplatesSelectedRef.current = isMyTemplatesSelected

	const setSelectedGroupKey = useCallback(
		(groupKey: string) => {
			if (groupKey === MY_SLIDES_TEMPLATES_GROUP_KEY) {
				select()
				return
			}

			leave()
			setCatalogSelectedGroupKey(groupKey)
		},
		[leave, select, setCatalogSelectedGroupKey],
	)

	const setKeyword = useCallback(
		(keyword: string) => {
			if (isMyTemplatesSelectedRef.current) {
				setSearchValue(keyword)
				return
			}

			setCatalogKeyword(keyword)
		},
		[setCatalogKeyword, setSearchValue],
	)

	const loadTemplateDetail = useCallback(
		(code: string) => {
			if (isMyTemplatesSelected) {
				return Promise.resolve(
					myTemplates.find((template) => template.value === code) ?? null,
				)
			}

			return loadCatalogTemplateDetail(code)
		},
		[isMyTemplatesSelected, loadCatalogTemplateDetail, myTemplates],
	)

	return {
		...catalogState,
		groups,
		selectedGroupKey: isMyTemplatesSelected
			? MY_SLIDES_TEMPLATES_GROUP_KEY
			: catalogState.selectedGroupKey,
		keyword: isMyTemplatesSelected ? searchValue : catalogState.keyword,
		setKeyword,
		setSelectedGroupKey,
		selectedChildTagCodes: isMyTemplatesSelected ? [] : catalogState.selectedChildTagCodes,
		tagGroups: isMyTemplatesSelected ? [] : catalogState.tagGroups,
		templateOptions: isMyTemplatesSelected ? myTemplates : catalogState.templateOptions,
		total: isMyTemplatesSelected ? myTemplates.length : catalogState.total,
		hasMore: isMyTemplatesSelected ? false : catalogState.hasMore,
		isLoading: isMyTemplatesSelected
			? myTemplatesEmptyStatus === "loading"
			: catalogState.isLoading,
		isRefreshing: isMyTemplatesSelected ? false : catalogState.isRefreshing,
		isLoadingMore: isMyTemplatesSelected ? false : catalogState.isLoadingMore,
		isLoadMoreFailed: isMyTemplatesSelected ? false : catalogState.isLoadMoreFailed,
		isRefreshFailed: isMyTemplatesSelected ? false : catalogState.isRefreshFailed,
		loadMore: isMyTemplatesSelected ? NOOP : catalogState.loadMore,
		retryLoadMore: isMyTemplatesSelected ? NOOP : catalogState.retryLoadMore,
		loadTemplateDetail,
		loadedTemplateCount: isMyTemplatesSelected
			? myTemplates.length
			: catalogState.loadedTemplateCount,
		templateViewRevision: isMyTemplatesSelected
			? loadMoreSignal
			: catalogState.templateViewRevision,
		selectedCategoryCode: isMyTemplatesSelected ? undefined : catalogState.selectedCategoryCode,
		myTemplatesEmptyStatus,
		retryMyTemplates,
	}
}

export type SlidesTemplatePanelState = ReturnType<typeof useSlidesTemplatePanelState>
