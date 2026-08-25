import { useSize } from "ahooks"
import i18next from "i18next"
import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import magicToast from "@/components/base/MagicToaster/utils"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { useLocaleText } from "@/pages/superMagic/components/MainInputContainer/panels/hooks/useLocaleText"
import { useSlidesTemplateCatalogState } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplateCatalogState"
import {
	ALL_SLIDES_TEMPLATE_GROUP_KEY,
	toTemplateOption,
} from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/slidesTemplateState"
import { useSlidesTemplateFavorite } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplateFavorite"
import {
	mySlidesTemplateAdapter,
	type MySlidesTemplateAdapter,
} from "@/pages/superMagic/services/mySlidesTemplateAdapter"
import SuperMagicService from "@/pages/superMagic/services"
import SlidesTemplateCanvas, { type SlidesTemplateCanvasHandle } from "./SlidesTemplateCanvas"
import SlidesTemplatesBottomTools from "./SlidesTemplatesBottomTools"
import { getTemplateCoverUrl, getTemplateKey } from "./canvasInteraction"
import {
	getAvailableTemplateColors,
	getSimilarTemplateOptions,
	preserveExistingTemplateOrder,
	reuseUnchangedTemplateOptions,
} from "./templateColorMatching"
import { templateColorToRgba } from "./templateColors"
import {
	clearTemplateColorExtractionBackgroundQueue,
	requestTemplateColorExtraction,
	subscribeTemplateColorExtractionSettled,
} from "./templateColorExtractionStore"
import { useTemplateColorExtractionVersion } from "./useResolvedTemplateColors"
import MySlidesTemplatesEmptyState from "./MySlidesTemplatesEmptyState"
import { MY_SLIDES_TEMPLATES_GROUP_KEY, useMySlidesTemplates } from "./useMySlidesTemplates"

const BOTTOM_TOOLS_OFFSET = 24
// 接口单页上限是 200。固定使用较大的页大小，保证后续 page 分页的 offset 连续，
// 也避免相似颜色筛选为了凑够结果频繁请求小页面。
const CANVAS_TEMPLATE_PAGE_SIZE = 200
const CANVAS_INITIAL_TEMPLATE_TARGET_COUNT = CANVAS_TEMPLATE_PAGE_SIZE * 2
const CANVAS_EDGE_GAP = 40
const SIMILAR_COLOR_TARGET_COUNT = 200
const SIMILAR_COLOR_LOAD_MORE_INTERVAL_MS = 600

export interface SlidesTemplatesPageProps {
	myTemplatesAdapter?: MySlidesTemplateAdapter
}

export function SlidesTemplatesPage({ myTemplatesAdapter }: SlidesTemplatesPageProps) {
	const lt = useLocaleText()
	const slidesState = useSlidesTemplateCatalogState({ pageSize: CANVAS_TEMPLATE_PAGE_SIZE })
	const { loadMore: loadMoreTemplates } = slidesState
	const setCatalogTemplateFavorite = slidesState.setTemplateFavorite
	const [publicSearchValue, setPublicSearchValue] = useState(slidesState.keyword)
	const personalTemplatesAdapter = myTemplatesAdapter ?? mySlidesTemplateAdapter
	const { pendingCodes: favoritePendingCodes, toggleFavorite } =
		useSlidesTemplateFavorite(personalTemplatesAdapter)
	const mySlidesTemplates = useMySlidesTemplates({
		adapter: personalTemplatesAdapter,
		groups: slidesState.groups,
	})
	const loadMoreMyTemplates = mySlidesTemplates.loadMore
	const retryLoadMoreMyTemplates = mySlidesTemplates.retryLoadMore
	const setMyTemplateFavorite = mySlidesTemplates.setTemplateFavorite
	const [selectedTemplate, setSelectedTemplate] = useState<OptionItem | null>(null)
	const [similarColorSource, setSimilarColorSource] = useState<OptionItem | null>(null)
	const [isInlinePreviewOpen, setIsInlinePreviewOpen] = useState(false)
	const isComposingRef = useRef(false)
	const canvasRef = useRef<SlidesTemplateCanvasHandle>(null)
	const bottomToolsRef = useRef<HTMLDivElement | null>(null)
	const templateDetailRequestSeqRef = useRef(0)
	const lastSimilarColorLoadMoreAtRef = useRef(0)
	const visibleTemplateOptionsRef = useRef(slidesState.templateOptions)
	const similarColorSourceKeyRef = useRef("")
	const bottomToolsSize = useSize(bottomToolsRef)
	const searchValue = mySlidesTemplates.isSelected
		? mySlidesTemplates.searchValue
		: publicSearchValue
	const toolbarGroups = mySlidesTemplates.groups
	const hasGroups = toolbarGroups.length > 1
	const isSimilarColorFilterActive = Boolean(similarColorSource)
	const colorExtractionVersion = useTemplateColorExtractionVersion(isSimilarColorFilterActive)
	const isUnfilteredAllTemplatesView =
		!mySlidesTemplates.isSelected &&
		slidesState.selectedGroupKey === ALL_SLIDES_TEMPLATE_GROUP_KEY &&
		slidesState.selectedChildTagCodes.length === 0 &&
		!publicSearchValue.trim() &&
		!slidesState.debouncedKeyword &&
		!similarColorSource
	const isInitialPrefetchPending =
		isUnfilteredAllTemplatesView &&
		slidesState.templateOptions.length >= CANVAS_TEMPLATE_PAGE_SIZE &&
		slidesState.loadedTemplateCount < CANVAS_INITIAL_TEMPLATE_TARGET_COUNT &&
		slidesState.hasMore &&
		!slidesState.isLoadMoreFailed
	const enableInfiniteLoop =
		!searchValue.trim() && !isSimilarColorFilterActive && !isInitialPrefetchPending
	const visibleTemplateOptions = useMemo(() => {
		let nextTemplateOptions = slidesState.templateOptions

		if (similarColorSource) {
			const sourceKey = getTemplateKey(similarColorSource)
			nextTemplateOptions = getSimilarTemplateOptions(
				similarColorSource,
				slidesState.templateOptions,
				colorExtractionVersion,
			)
			if (similarColorSourceKeyRef.current === sourceKey) {
				// 同一次颜色匹配中，已展示模板保持原顺序，新命中项只追加。
				nextTemplateOptions = preserveExistingTemplateOrder(
					visibleTemplateOptionsRef.current,
					nextTemplateOptions,
				)
			}
			// sourceKey 变化时不复用旧顺序，并由 resetKey 创建一套新的颜色匹配布局。
			similarColorSourceKeyRef.current = sourceKey
		} else {
			similarColorSourceKeyRef.current = ""
		}

		const stableTemplateOptions = reuseUnchangedTemplateOptions(
			visibleTemplateOptionsRef.current,
			nextTemplateOptions,
		)
		visibleTemplateOptionsRef.current = stableTemplateOptions
		return stableTemplateOptions
	}, [colorExtractionVersion, similarColorSource, slidesState.templateOptions])
	// 颜色模式只派生当前可见集合，不复制或替换目录数据；模式内追加的分页退出后仍可复用。
	const similarColorTemplateCount = similarColorSource ? visibleTemplateOptions.length : 0
	const similarColorSourceName = similarColorSource
		? (lt(similarColorSource.label) ?? lt(similarColorSource.value) ?? "")
		: ""
	const similarColorSourceColors = similarColorSource
		? getAvailableTemplateColors(similarColorSource)
		: []
	const similarColorAmbient = templateColorToRgba(similarColorSourceColors[0], 0.18)
	const canvasViewportInsets = {
		top: CANVAS_EDGE_GAP,
		right: CANVAS_EDGE_GAP,
		bottom: isInlinePreviewOpen
			? CANVAS_EDGE_GAP
			: (bottomToolsSize?.height ?? 0) + BOTTOM_TOOLS_OFFSET + CANVAS_EDGE_GAP,
		left: CANVAS_EDGE_GAP,
	}
	const loadTemplateDetail = slidesState.loadTemplateDetail
	const handleTemplateDetailLoad = useCallback(
		(template: OptionItem) => {
			const code = typeof template.value === "string" ? template.value : ""
			if (mySlidesTemplates.isSelected) {
				return code
					? personalTemplatesAdapter.loadDetail(code).then(toTemplateOption)
					: Promise.resolve(template)
			}
			return code ? loadTemplateDetail(code) : Promise.resolve(template)
		},
		[loadTemplateDetail, mySlidesTemplates.isSelected, personalTemplatesAdapter],
	)

	useEffect(() => {
		if (mySlidesTemplates.isSelected || isComposingRef.current) return
		setPublicSearchValue(slidesState.keyword)
	}, [mySlidesTemplates.isSelected, slidesState.keyword])

	useEffect(() => {
		if (
			!isUnfilteredAllTemplatesView ||
			slidesState.loadedTemplateCount === 0 ||
			slidesState.templateOptions.length < CANVAS_TEMPLATE_PAGE_SIZE ||
			slidesState.loadedTemplateCount >= CANVAS_INITIAL_TEMPLATE_TARGET_COUNT ||
			!slidesState.hasMore ||
			slidesState.isLoading ||
			slidesState.isRefreshing ||
			slidesState.isLoadingMore ||
			slidesState.isLoadMoreFailed
		) {
			return
		}

		loadMoreTemplates()
	}, [
		isUnfilteredAllTemplatesView,
		loadMoreTemplates,
		publicSearchValue,
		similarColorSource,
		slidesState.debouncedKeyword,
		slidesState.hasMore,
		slidesState.isLoading,
		slidesState.isLoadingMore,
		slidesState.isLoadMoreFailed,
		slidesState.isRefreshing,
		slidesState.loadedTemplateCount,
		slidesState.templateOptions.length,
	])

	const queueMissingTemplateColors = useCallback(() => {
		if (!similarColorSource) return

		slidesState.templateOptions.forEach((template) => {
			if (getAvailableTemplateColors(template).length > 0) return
			requestTemplateColorExtraction(getTemplateCoverUrl(template), "background")
		})
	}, [similarColorSource, slidesState.templateOptions])

	useEffect(() => {
		if (!isSimilarColorFilterActive) {
			clearTemplateColorExtractionBackgroundQueue()
			return
		}

		queueMissingTemplateColors()
		const unsubscribe = subscribeTemplateColorExtractionSettled(queueMissingTemplateColors)

		return () => {
			unsubscribe()
			clearTemplateColorExtractionBackgroundQueue()
		}
	}, [isSimilarColorFilterActive, queueMissingTemplateColors])

	useEffect(() => {
		if (
			!similarColorSource ||
			similarColorTemplateCount >= SIMILAR_COLOR_TARGET_COUNT ||
			!slidesState.hasMore ||
			slidesState.isLoading ||
			slidesState.isRefreshing ||
			slidesState.isLoadingMore ||
			slidesState.isLoadMoreFailed
		) {
			return
		}

		const elapsedMs = Date.now() - lastSimilarColorLoadMoreAtRef.current
		const delayMs = Math.max(0, SIMILAR_COLOR_LOAD_MORE_INTERVAL_MS - elapsedMs)
		const timer = window.setTimeout(() => {
			lastSimilarColorLoadMoreAtRef.current = Date.now()
			loadMoreTemplates()
		}, delayMs)

		return () => window.clearTimeout(timer)
	}, [
		loadMoreTemplates,
		similarColorSource,
		similarColorTemplateCount,
		slidesState.hasMore,
		slidesState.isLoading,
		slidesState.isLoadingMore,
		slidesState.isLoadMoreFailed,
		slidesState.isRefreshing,
	])

	const handleLoadMoreTemplates = useCallback(() => {
		if (mySlidesTemplates.isSelected) {
			if (mySlidesTemplates.isLoadMoreFailed) {
				retryLoadMoreMyTemplates()
				return
			}
			loadMoreMyTemplates()
			return
		}
		if (isSimilarColorFilterActive) return
		loadMoreTemplates()
	}, [
		isSimilarColorFilterActive,
		loadMoreTemplates,
		loadMoreMyTemplates,
		mySlidesTemplates.isLoadMoreFailed,
		mySlidesTemplates.isSelected,
		retryLoadMoreMyTemplates,
	])

	const canvasTemplateOptions = mySlidesTemplates.isSelected
		? mySlidesTemplates.templates
		: isInitialPrefetchPending
			? []
			: visibleTemplateOptions

	const resetKey = mySlidesTemplates.isSelected
		? mySlidesTemplates.resetKey
		: `${slidesState.templateViewRevision}:${
				similarColorSource ? getTemplateKey(similarColorSource) : "all-colors"
			}`

	function handleSearchChange(value: string) {
		setSimilarColorSource(null)
		if (mySlidesTemplates.isSelected) {
			mySlidesTemplates.setSearchValue(value)
			return
		}
		setPublicSearchValue(value)
		if (isComposingRef.current) return

		slidesState.setKeyword(value)
	}

	function handleCompositionStart() {
		isComposingRef.current = true
	}

	function handleCompositionEnd(value: string) {
		setSimilarColorSource(null)
		isComposingRef.current = false
		if (mySlidesTemplates.isSelected) {
			mySlidesTemplates.setSearchValue(value)
			return
		}
		setPublicSearchValue(value)
		slidesState.setKeyword(value)
	}

	function handleClearSearch() {
		setSimilarColorSource(null)
		if (mySlidesTemplates.isSelected) {
			mySlidesTemplates.setSearchValue("")
			return
		}
		setPublicSearchValue("")
		slidesState.setKeyword("")
	}

	function handleClearSelectedTemplate() {
		templateDetailRequestSeqRef.current += 1
		setSelectedTemplate(null)
	}

	function handleTemplateSelect(template: OptionItem) {
		const requestSeq = templateDetailRequestSeqRef.current + 1
		templateDetailRequestSeqRef.current = requestSeq
		setSelectedTemplate(template)
		// 列表接口只携带缩略图，选择模板后再读取详情，避免首屏加载全部预览大图。
		void handleTemplateDetailLoad(template)
			.then((detail) => {
				if (detail && requestSeq === templateDetailRequestSeqRef.current) {
					setSelectedTemplate(detail)
				}
			})
			.catch((error) => {
				console.error("Failed to fetch slides template detail", error)
			})
	}

	function handlePreviewSelectedTemplate() {
		if (!selectedTemplate) return
		canvasRef.current?.openPreview(selectedTemplate)
	}

	function handleFocusRandomTemplate() {
		canvasRef.current?.focusRandomTemplate()
	}

	const handleFindSimilarColors = useCallback((template: OptionItem) => {
		const colors = getAvailableTemplateColors(template)
		if (colors.length === 0) return
		setSimilarColorSource({ ...template, colors })
	}, [])

	const handleOpenProject = useCallback((template: OptionItem) => {
		const project = template.project
		if (!project?.id || !project.directory_id) return

		void SuperMagicService.switchProjectById(project.id, undefined, undefined, {
			slidesTemplateProjectId: project.id,
			slidesTemplateDirectoryId: project.directory_id,
		}).catch((error) => {
			console.error("Failed to open slides template source project", error)
			magicToast.error(i18next.t("mySlidesTemplates.openProjectFailed", { ns: "super" }))
		})
	}, [])

	const handleFavoriteToggle = useCallback(
		(template: OptionItem) => {
			const section = mySlidesTemplates.activeSection
			void toggleFavorite(template, (code, isFavorite, fallbackTemplate) => {
				setCatalogTemplateFavorite(code, isFavorite)
				setMyTemplateFavorite(section, code, isFavorite, fallbackTemplate)
			})
				.then((isFavorite) => {
					if (isFavorite === undefined) return
					magicToast.success(
						i18next.t(
							isFavorite
								? "mySlidesTemplates.favoriteSuccess"
								: "mySlidesTemplates.unfavoriteSuccess",
							{ ns: "super" },
						),
					)
				})
				.catch(() => {
					magicToast.error(i18next.t("mySlidesTemplates.favoriteFailed", { ns: "super" }))
				})
		},
		[
			mySlidesTemplates.activeSection,
			setMyTemplateFavorite,
			setCatalogTemplateFavorite,
			toggleFavorite,
		],
	)

	function handleGroupChange(groupKey: string) {
		if (groupKey === MY_SLIDES_TEMPLATES_GROUP_KEY && mySlidesTemplates.isSelected) return

		templateDetailRequestSeqRef.current += 1
		setSelectedTemplate(null)
		setSimilarColorSource(null)
		if (groupKey === MY_SLIDES_TEMPLATES_GROUP_KEY) {
			mySlidesTemplates.select()
			return
		}
		mySlidesTemplates.leave()
		slidesState.setSelectedGroupKey(groupKey)
	}

	return (
		<div
			className="relative size-full overflow-hidden rounded-lg bg-[#101114]"
			data-testid="slides-templates-page"
		>
			{mySlidesTemplates.emptyStatus ? (
				<MySlidesTemplatesEmptyState
					status={mySlidesTemplates.emptyStatus}
					onRetry={() => void mySlidesTemplates.retry()}
					bottomInset={(bottomToolsSize?.height ?? 0) + BOTTOM_TOOLS_OFFSET}
					section={mySlidesTemplates.activeSection}
				/>
			) : (
				<SlidesTemplateCanvas
					ref={canvasRef}
					enableInfiniteLoop={enableInfiniteLoop}
					initialAlignment={isSimilarColorFilterActive ? "top" : "center"}
					templates={canvasTemplateOptions}
					favoritePendingCodes={favoritePendingCodes}
					selectedTemplate={selectedTemplate}
					onTemplateSelect={handleTemplateSelect}
					hasMore={
						mySlidesTemplates.isSelected
							? mySlidesTemplates.hasMore
							: isSimilarColorFilterActive
								? false
								: slidesState.hasMore
					}
					isLoading={
						mySlidesTemplates.isSelected
							? false
							: slidesState.isLoading || isInitialPrefetchPending
					}
					isLoadingMore={
						mySlidesTemplates.isSelected
							? mySlidesTemplates.isLoadingMore
							: slidesState.isLoadingMore
					}
					isRefreshFailed={
						mySlidesTemplates.isSelected
							? mySlidesTemplates.isLoadMoreFailed
							: slidesState.isRefreshFailed
					}
					isRefreshing={mySlidesTemplates.isSelected ? false : slidesState.isRefreshing}
					onLoadMore={handleLoadMoreTemplates}
					loadMoreSignal={
						mySlidesTemplates.isSelected
							? mySlidesTemplates.loadMoreSignal
							: slidesState.loadedTemplateCount
					}
					onFindSimilarColors={
						mySlidesTemplates.isSelected ? undefined : handleFindSimilarColors
					}
					onFavoriteToggle={handleFavoriteToggle}
					onOpenProject={handleOpenProject}
					onPreviewOpenChange={setIsInlinePreviewOpen}
					onRetryRefresh={
						mySlidesTemplates.isSelected
							? mySlidesTemplates.retryLoadMore
							: slidesState.retryRefresh
					}
					onTemplateDetailLoad={handleTemplateDetailLoad}
					resetKey={resetKey}
					viewportInsets={canvasViewportInsets}
				/>
			)}

			<SlidesTemplatesBottomTools
				bottomOffset={BOTTOM_TOOLS_OFFSET}
				containerRef={bottomToolsRef}
				isInlinePreviewOpen={isInlinePreviewOpen}
				selectedTemplate={selectedTemplate}
				onClearSelectedTemplate={handleClearSelectedTemplate}
				onFindSimilarColors={
					mySlidesTemplates.isSelected ? undefined : handleFindSimilarColors
				}
				onPreviewSelectedTemplate={handlePreviewSelectedTemplate}
				toolbarProps={{
					activeMyTemplatesSection: mySlidesTemplates.activeSection,
					groups: toolbarGroups,
					onClearSearch: handleClearSearch,
					onClearSimilarColors: () => setSimilarColorSource(null),
					onCompositionEnd: handleCompositionEnd,
					onCompositionStart: handleCompositionStart,
					onFocusRandomTemplate: handleFocusRandomTemplate,
					onGroupChange: handleGroupChange,
					onMyTemplatesSectionChange: mySlidesTemplates.setActiveSection,
					onSearchChange: handleSearchChange,
					randomDisabled: canvasTemplateOptions.length === 0,
					searchValue,
					selectedGroupKey: mySlidesTemplates.isSelected
						? MY_SLIDES_TEMPLATES_GROUP_KEY
						: slidesState.selectedGroupKey,
					similarColorAmbient,
					similarColorSourceColors,
					similarColorSourceName,
					showGroups: hasGroups,
					showSimilarColors: Boolean(similarColorSource),
				}}
			/>
		</div>
	)
}

export default observer(SlidesTemplatesPage)
