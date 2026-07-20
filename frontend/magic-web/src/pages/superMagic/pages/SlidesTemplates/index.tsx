import { MousePointerClick, Palette, Search, X } from "lucide-react"
import { useSize } from "ahooks"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/lib/utils"
import TemplateGroupSelector from "@/pages/superMagic/components/MainInputContainer/panels/TemplateGroupSelector"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { useLocaleText } from "@/pages/superMagic/components/MainInputContainer/panels/hooks/useLocaleText"
import { useSlidesTemplateCatalogState } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplateCatalogState"
import { ALL_SLIDES_TEMPLATE_GROUP_KEY } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/slidesTemplateState"
import SlidesTemplateCanvas, { type SlidesTemplateCanvasHandle } from "./SlidesTemplateCanvas"
import SlidesTemplateColorPalette from "./SlidesTemplateColorPalette"
import SlidesTemplateGlowBorder from "./SlidesTemplateGlowBorder"
import SlidesTemplatePromptDock from "./SlidesTemplatePromptDock"
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

const BOTTOM_TOOLS_OFFSET = 24
// 接口单页上限是 200。固定使用较大的页大小，保证后续 page 分页的 offset 连续，
// 也避免相似颜色筛选为了凑够结果频繁请求小页面。
const CANVAS_TEMPLATE_PAGE_SIZE = 200
const CANVAS_INITIAL_TEMPLATE_TARGET_COUNT = CANVAS_TEMPLATE_PAGE_SIZE * 2
const CANVAS_EDGE_GAP = 40
const SIMILAR_COLOR_TARGET_COUNT = 200
const SIMILAR_COLOR_LOAD_MORE_INTERVAL_MS = 600
const GROUP_SCROLL_CONTROL_CLASS_NAME =
	"[&_button]:border-white/20 [&_button]:bg-zinc-800/[0.86] [&_button]:text-white [&_button]:shadow-[0_4px_14px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] [&_button]:backdrop-blur-lg [&_button:hover]:bg-zinc-700/[0.92]"

function SlidesTemplatesPage() {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const slidesState = useSlidesTemplateCatalogState({ pageSize: CANVAS_TEMPLATE_PAGE_SIZE })
	const { loadMore: loadMoreTemplates } = slidesState
	const [searchValue, setSearchValue] = useState(slidesState.keyword)
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
	const hasGroups = slidesState.groups.length > 1
	const isSimilarColorFilterActive = Boolean(similarColorSource)
	const colorExtractionVersion = useTemplateColorExtractionVersion(isSimilarColorFilterActive)
	const isUnfilteredAllTemplatesView =
		slidesState.selectedGroupKey === ALL_SLIDES_TEMPLATE_GROUP_KEY &&
		slidesState.selectedChildTagCodes.length === 0 &&
		!searchValue.trim() &&
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
			return code ? loadTemplateDetail(code) : Promise.resolve(template)
		},
		[loadTemplateDetail],
	)

	useEffect(() => {
		if (isComposingRef.current) return
		setSearchValue(slidesState.keyword)
	}, [slidesState.keyword])

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
		searchValue,
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
		if (isSimilarColorFilterActive) return
		loadMoreTemplates()
	}, [isSimilarColorFilterActive, loadMoreTemplates])

	// 服务端筛选只有在新结果真正替换后才递增 templateViewRevision。
	// 画布复位必须与这次替换同一帧发生，不能在分类按钮或防抖关键词变化时提前复位旧模板。
	const resetKey = `${slidesState.templateViewRevision}:${
		similarColorSource ? getTemplateKey(similarColorSource) : "all-colors"
	}`

	function handleSearchChange(value: string) {
		setSimilarColorSource(null)
		setSearchValue(value)
		if (isComposingRef.current) return

		slidesState.setKeyword(value)
	}

	function handleCompositionStart() {
		isComposingRef.current = true
	}

	function handleCompositionEnd(value: string) {
		setSimilarColorSource(null)
		isComposingRef.current = false
		setSearchValue(value)
		slidesState.setKeyword(value)
	}

	function handleClearSearch() {
		setSimilarColorSource(null)
		setSearchValue("")
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
		slidesState.setSelectedGroupKey(groupKey)
	}

	return (
		<div
			className="relative size-full overflow-hidden rounded-lg bg-[#101114]"
			data-testid="slides-templates-page"
		>
			<SlidesTemplateCanvas
				ref={canvasRef}
				enableInfiniteLoop={enableInfiniteLoop}
				initialAlignment={isSimilarColorFilterActive ? "top" : "center"}
				templates={isInitialPrefetchPending ? [] : visibleTemplateOptions}
				selectedTemplate={selectedTemplate}
				onTemplateSelect={handleTemplateSelect}
				hasMore={isSimilarColorFilterActive ? false : slidesState.hasMore}
				isLoading={slidesState.isLoading || isInitialPrefetchPending}
				isLoadingMore={slidesState.isLoadingMore}
				isRefreshFailed={slidesState.isRefreshFailed}
				isRefreshing={slidesState.isRefreshing}
				onLoadMore={handleLoadMoreTemplates}
				loadMoreSignal={slidesState.loadedTemplateCount}
				onFindSimilarColors={handleFindSimilarColors}
				onPreviewOpenChange={setIsInlinePreviewOpen}
				onRetryRefresh={slidesState.retryRefresh}
				onTemplateDetailLoad={handleTemplateDetailLoad}
				resetKey={resetKey}
				viewportInsets={canvasViewportInsets}
			/>

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
											onFindSimilarColors={handleFindSimilarColors}
											onPreviewSelectedTemplate={
												handlePreviewSelectedTemplate
											}
											onClearSelectedTemplate={handleClearSelectedTemplate}
										/>
									</motion.div>
								</div>
							</div>

							<div
								className={cn(
									"flex min-w-0 items-center gap-3",
									selectedTemplate && "mt-2.5",
								)}
							>
								<div className="relative min-w-[220px] flex-1">
									<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/[0.45]" />
									<Input
										value={searchValue}
										onChange={(event) => handleSearchChange(event.target.value)}
										onCompositionStart={handleCompositionStart}
										onCompositionEnd={(event) =>
											handleCompositionEnd(event.currentTarget.value)
										}
										placeholder={t(
											"playbook.edit.presets.form.searchPlaceholder",
										)}
										className="h-10 rounded-2xl border-0 bg-white/[0.09] pl-9 pr-9 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.11)] placeholder:text-white/[0.45] focus-visible:ring-white/20"
										data-testid="slides-templates-page-search-input"
									/>
									{searchValue ? (
										<Button
											type="button"
											size="icon"
											variant="ghost"
											className="absolute right-1 top-1/2 size-8 -translate-y-1/2 rounded-full text-white/[0.65] hover:bg-white/10 hover:text-white"
											aria-label={t("playbook.edit.presets.close")}
											onClick={handleClearSearch}
											data-testid="slides-templates-page-search-clear"
										>
											<X className="size-4" />
										</Button>
									) : null}
								</div>
								<Button
									type="button"
									variant="ghost"
									className="group relative isolate h-10 shrink-0 overflow-hidden rounded-2xl border-0 bg-white/[0.075] px-3 text-sm text-white/[0.88] shadow-[0_8px_22px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.12)] hover:bg-white/[0.11] hover:text-white hover:shadow-[0_10px_28px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.16)]"
									aria-label={t("playbook.edit.presets.form.randomTemplate")}
									disabled={slidesState.templateOptions.length === 0}
									onClick={handleFocusRandomTemplate}
									data-testid="slides-templates-page-random-template"
								>
									<SlidesTemplateGlowBorder
										className="opacity-90 group-hover:opacity-100"
										radius={15}
									/>
									<MousePointerClick className="relative z-40 mr-1.5 size-4" />
									<span className="relative z-40">
										{t("playbook.edit.presets.form.randomTemplate")}
									</span>
								</Button>
							</div>

							{similarColorSource ? (
								<div
									className="mt-2.5 flex min-w-0 items-center gap-2 rounded-xl border border-white/[0.12] bg-white/[0.07] px-2.5 py-2 text-white/[0.84] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
									style={
										similarColorAmbient
											? {
													backgroundImage: `radial-gradient(circle at 8% 50%, ${similarColorAmbient}, transparent 34%)`,
												}
											: undefined
									}
									data-testid="slides-templates-page-similar-colors-filter"
								>
									<Palette className="size-4 shrink-0 text-white/[0.72]" />
									<SlidesTemplateColorPalette
										colors={similarColorSourceColors}
										compact
									/>
									<span className="min-w-0 flex-1 truncate text-xs font-medium">
										{t("playbook.edit.presets.form.similarColorsFor", {
											name: similarColorSourceName,
										})}
									</span>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										className="size-7 shrink-0 rounded-full text-white/[0.58] hover:bg-white/10 hover:text-white"
										aria-label={t(
											"playbook.edit.presets.form.clearSimilarColors",
										)}
										onClick={() => {
											setSimilarColorSource(null)
										}}
										data-testid="slides-templates-page-clear-similar-colors"
									>
										<X className="size-3.5" />
									</Button>
								</div>
							) : null}

							{hasGroups ? (
								<TemplateGroupSelector
									groups={slidesState.groups}
									selectedGroupKey={slidesState.selectedGroupKey}
									onGroupChange={handleGroupChange}
									showEmptyGroups
									className="mt-2.5 [&_button:hover]:border-white/[0.18] [&_button:hover]:bg-white/[0.16] [&_button:hover]:text-white [&_button[aria-pressed=true]]:border-white/[0.32] [&_button[aria-pressed=true]]:bg-white/[0.22] [&_button[aria-pressed=true]]:text-white [&_button[aria-pressed=true]]:shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_8px_22px_rgba(0,0,0,0.14)] [&_button]:border-white/[0.10] [&_button]:bg-white/[0.10] [&_button]:text-white/[0.82] [&_button]:shadow-none"
									controlBackground="transparent"
									leftControlClassName={GROUP_SCROLL_CONTROL_CLASS_NAME}
									rightControlClassName={GROUP_SCROLL_CONTROL_CLASS_NAME}
									data-testid="slides-templates-page-group-selector"
								/>
							) : null}
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	)
}

export default observer(SlidesTemplatesPage)
