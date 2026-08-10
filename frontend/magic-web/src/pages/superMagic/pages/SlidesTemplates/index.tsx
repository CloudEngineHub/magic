import { useSize } from "ahooks"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { useLocaleText } from "@/pages/superMagic/components/MainInputContainer/panels/hooks/useLocaleText"
import { useSlidesTemplateCatalogState } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplateCatalogState"
import { ALL_SLIDES_TEMPLATE_GROUP_KEY } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/slidesTemplateState"
import type { MySlidesTemplateAdapter } from "@/pages/superMagic/services/mySlidesTemplateAdapter"
import SlidesTemplateCanvas, { type SlidesTemplateCanvasHandle } from "./SlidesTemplateCanvas"
import SlidesTemplatePromptDock from "./SlidesTemplatePromptDock"
import SlidesTemplatesToolbar from "./SlidesTemplatesToolbar"
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
	const [publicSearchValue, setPublicSearchValue] = useState(slidesState.keyword)
	const mySlidesTemplates = useMySlidesTemplates({
		adapter: myTemplatesAdapter,
		groups: slidesState.groups,
	})
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
	const reduceMotion = useReducedMotion()
	const searchValue = mySlidesTemplates.isSelected
		? mySlidesTemplates.searchValue
		: publicSearchValue
	const hasGroups = mySlidesTemplates.groups.length > 1
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
			if (mySlidesTemplates.isSelected) return Promise.resolve(template)
			const code = typeof template.value === "string" ? template.value : ""
			return code ? loadTemplateDetail(code) : Promise.resolve(template)
		},
		[loadTemplateDetail, mySlidesTemplates.isSelected],
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
		if (mySlidesTemplates.isSelected || isSimilarColorFilterActive) return
		loadMoreTemplates()
	}, [isSimilarColorFilterActive, loadMoreTemplates, mySlidesTemplates.isSelected])

	const canvasTemplateOptions = mySlidesTemplates.isSelected
		? mySlidesTemplates.templates
		: isInitialPrefetchPending
			? []
			: visibleTemplateOptions

	// 服务端筛选只有在新结果真正替换后才递增 templateViewRevision。
	// 画布复位必须与这次替换同一帧发生，不能在分类按钮或防抖关键词变化时提前复位旧模板。
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

	function handleGroupChange(groupKey: string) {
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
				/>
			) : (
				<SlidesTemplateCanvas
					ref={canvasRef}
					enableInfiniteLoop={enableInfiniteLoop}
					initialAlignment={isSimilarColorFilterActive ? "top" : "center"}
					templates={canvasTemplateOptions}
					selectedTemplate={selectedTemplate}
					onTemplateSelect={handleTemplateSelect}
					hasMore={
						mySlidesTemplates.isSelected || isSimilarColorFilterActive
							? false
							: slidesState.hasMore
					}
					isLoading={
						mySlidesTemplates.isSelected
							? false
							: slidesState.isLoading || isInitialPrefetchPending
					}
					isLoadingMore={mySlidesTemplates.isSelected ? false : slidesState.isLoadingMore}
					isRefreshFailed={
						mySlidesTemplates.isSelected ? false : slidesState.isRefreshFailed
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
					onPreviewOpenChange={setIsInlinePreviewOpen}
					onRetryRefresh={slidesState.retryRefresh}
					onTemplateDetailLoad={handleTemplateDetailLoad}
					resetKey={resetKey}
					viewportInsets={canvasViewportInsets}
				/>
			)}

			<AnimatePresence initial={false}>
				{isInlinePreviewOpen ? null : (
					<motion.div
						ref={bottomToolsRef}
						key="bottom-tools-shell"
						initial={reduceMotion ? false : { opacity: 0, y: 42, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 42, scale: 0.98 }}
						transition={
							reduceMotion
								? { duration: 0 }
								: { type: "spring", stiffness: 420, damping: 38, mass: 0.7 }
						}
						className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-6"
						style={{ bottom: BOTTOM_TOOLS_OFFSET }}
					>
						<motion.div
							className={cn(
								"pointer-events-auto flex w-full max-w-3xl flex-col rounded-2xl bg-zinc-950/[0.42] p-2 shadow-[0_12px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl",
							)}
							data-testid="slides-templates-page-bottom-tools"
						>
							<div
								className={cn(
									"relative grid",
									selectedTemplate
										? "grid-rows-[1fr]"
										: "grid-rows-[0fr] transition-none",
								)}
								data-testid="slides-templates-page-prompt-region"
							>
								<div className="min-h-0 overflow-hidden">
									{/* 提前挂载编辑器，首次选择模板时只切换可见性，避免初始化导致整页闪动。 */}
									<motion.div
										initial={false}
										animate={{
											opacity: selectedTemplate ? 1 : 0,
											y: selectedTemplate ? 0 : 6,
										}}
										transition={
											reduceMotion
												? { duration: 0 }
												: {
														duration: 0.14,
														ease: [0.22, 1, 0.36, 1],
													}
										}
										className={cn(
											"flex flex-col",
											!selectedTemplate && "pointer-events-none invisible",
										)}
										aria-hidden={!selectedTemplate}
										data-testid="slides-templates-page-prompt-panel"
									>
										<SlidesTemplatePromptDock
											selectedTemplate={selectedTemplate}
											onFindSimilarColors={
												mySlidesTemplates.isSelected
													? undefined
													: handleFindSimilarColors
											}
											onPreviewSelectedTemplate={
												handlePreviewSelectedTemplate
											}
											onClearSelectedTemplate={handleClearSelectedTemplate}
										/>
									</motion.div>
								</div>
							</div>

							<SlidesTemplatesToolbar
								className={selectedTemplate ? "mt-2.5" : undefined}
								groups={mySlidesTemplates.groups}
								onClearSearch={handleClearSearch}
								onClearSimilarColors={() => setSimilarColorSource(null)}
								onCompositionEnd={handleCompositionEnd}
								onCompositionStart={handleCompositionStart}
								onFocusRandomTemplate={handleFocusRandomTemplate}
								onGroupChange={handleGroupChange}
								onSearchChange={handleSearchChange}
								randomDisabled={canvasTemplateOptions.length === 0}
								searchValue={searchValue}
								selectedGroupKey={
									mySlidesTemplates.isSelected
										? MY_SLIDES_TEMPLATES_GROUP_KEY
										: slidesState.selectedGroupKey
								}
								similarColorAmbient={similarColorAmbient}
								similarColorSourceColors={similarColorSourceColors}
								similarColorSourceName={similarColorSourceName}
								showGroups={hasGroups}
								showSimilarColors={Boolean(similarColorSource)}
							/>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

export default observer(SlidesTemplatesPage)
