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
import SlidesTemplateCanvas, { type SlidesTemplateCanvasHandle } from "./SlidesTemplateCanvas"
import SlidesTemplateColorPalette from "./SlidesTemplateColorPalette"
import SlidesTemplateGlowBorder from "./SlidesTemplateGlowBorder"
import SlidesTemplatePromptDock from "./SlidesTemplatePromptDock"
import { getTemplateCoverUrl, getTemplateKey } from "./canvasInteraction"
import {
	getTemplatePaletteDistance,
	MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE,
	normalizeTemplateColors,
	templateColorToRgba,
} from "./templateColors"
import {
	clearTemplateColorExtractionBackgroundQueue,
	getExtractedTemplateColors,
	requestTemplateColorExtraction,
	subscribeTemplateColorExtractionSettled,
} from "./templateColorExtractionStore"
import { useTemplateColorExtractionVersion } from "./useResolvedTemplateColors"

const BOTTOM_TOOLS_OFFSET = 24
const CANVAS_EDGE_GAP = 40
const CANVAS_TEMPLATE_PAGE_SIZE = 40
const MIN_SIMILAR_COLOR_TEMPLATE_COUNT = 24
const MAX_SIMILAR_COLOR_LOADS = 3
const MAX_SIMILAR_COLOR_CANDIDATE_COUNT = CANVAS_TEMPLATE_PAGE_SIZE * (MAX_SIMILAR_COLOR_LOADS + 1)
const GROUP_SCROLL_CONTROL_CLASS_NAME =
	"[&_button]:border-white/20 [&_button]:bg-zinc-800/[0.86] [&_button]:text-white [&_button]:shadow-[0_4px_14px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] [&_button]:backdrop-blur-lg [&_button:hover]:bg-zinc-700/[0.92]"

function getAvailableTemplateColors(template: OptionItem, cacheVersion?: number) {
	// cacheVersion 仅用于让相似结果在 Worker 写入缓存后重新派生。
	void cacheVersion
	const backendColors = normalizeTemplateColors(template.colors)
	if (backendColors.length > 0) return backendColors
	return getExtractedTemplateColors(getTemplateCoverUrl(template))
}

export function reuseUnchangedTemplateOptions(previous: OptionItem[], next: OptionItem[]) {
	if (
		previous.length === next.length &&
		previous.every((template, index) => template === next[index])
	) {
		return previous
	}
	return next
}

export function preserveExistingTemplateOrder(previous: OptionItem[], next: OptionItem[]) {
	const nextTemplateByKey = new Map(next.map((template) => [getTemplateKey(template), template]))
	const retainedTemplates = previous.flatMap((template) => {
		const nextTemplate = nextTemplateByKey.get(getTemplateKey(template))
		return nextTemplate ? [nextTemplate] : []
	})
	const retainedKeys = new Set(retainedTemplates.map(getTemplateKey))
	return [
		...retainedTemplates,
		...next.filter((template) => !retainedKeys.has(getTemplateKey(template))),
	]
}

export function shouldLoadMoreSimilarColorTemplates({
	loadCount,
	hasMore,
	isLoading,
	isLoadingMore,
	isRefreshing,
	loadedTemplateCount,
	similarTemplateCount,
}: {
	loadCount: number
	hasMore: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshing: boolean
	loadedTemplateCount: number
	similarTemplateCount: number
}) {
	return (
		similarTemplateCount < MIN_SIMILAR_COLOR_TEMPLATE_COUNT &&
		hasMore &&
		!isLoading &&
		!isLoadingMore &&
		!isRefreshing &&
		loadedTemplateCount < MAX_SIMILAR_COLOR_CANDIDATE_COUNT &&
		loadCount < MAX_SIMILAR_COLOR_LOADS
	)
}

function SlidesTemplatesPage() {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const slidesState = useSlidesTemplateCatalogState({ pageSize: CANVAS_TEMPLATE_PAGE_SIZE })
	const [searchValue, setSearchValue] = useState(slidesState.keyword)
	const [selectedTemplate, setSelectedTemplate] = useState<OptionItem | null>(null)
	const [similarColorSource, setSimilarColorSource] = useState<OptionItem | null>(null)
	const [isInlinePreviewOpen, setIsInlinePreviewOpen] = useState(false)
	const isComposingRef = useRef(false)
	const canvasRef = useRef<SlidesTemplateCanvasHandle>(null)
	const bottomToolsRef = useRef<HTMLDivElement | null>(null)
	const visibleTemplateOptionsRef = useRef(slidesState.templateOptions)
	const similarColorSourceKeyRef = useRef("")
	const similarColorLoadCountRef = useRef(0)
	const similarColorLoadSourceKeyRef = useRef("")
	const bottomToolsSize = useSize(bottomToolsRef)
	const reduceMotion = useReducedMotion()
	const hasGroups = slidesState.groups.length > 1
	const isSimilarColorFilterActive = Boolean(similarColorSource)
	const colorCacheVersion = useTemplateColorExtractionVersion(isSimilarColorFilterActive)
	const visibleTemplateOptions = useMemo(() => {
		let nextTemplateOptions = slidesState.templateOptions

		if (similarColorSource) {
			const sourceKey = getTemplateKey(similarColorSource)
			const sourceColors = getAvailableTemplateColors(similarColorSource, colorCacheVersion)
			nextTemplateOptions = slidesState.templateOptions
				.map((template, originalIndex) => ({
					distance:
						getTemplateKey(template) === sourceKey
							? -1
							: getTemplatePaletteDistance(
									sourceColors,
									getAvailableTemplateColors(template, colorCacheVersion),
								),
					originalIndex,
					template,
				}))
				.filter(
					({ distance }) =>
						distance < 0 || distance <= MAX_SIMILAR_TEMPLATE_COLOR_DISTANCE,
				)
				.sort((left, right) => {
					if (left.distance !== right.distance) return left.distance - right.distance
					const sortDifference = (right.template.sort ?? 0) - (left.template.sort ?? 0)
					return sortDifference || left.originalIndex - right.originalIndex
				})
				.map(({ template }) => template)

			if (similarColorSourceKeyRef.current === sourceKey) {
				// 新完成的颜色结果追加到现有布局末尾，避免已有卡片跨列换位。
				nextTemplateOptions = preserveExistingTemplateOrder(
					visibleTemplateOptionsRef.current,
					nextTemplateOptions,
				)
			}
			similarColorSourceKeyRef.current = sourceKey
		} else {
			similarColorSourceKeyRef.current = ""
		}

		const stableTemplateOptions = reuseUnchangedTemplateOptions(
			visibleTemplateOptionsRef.current,
			nextTemplateOptions,
		)
		// 未命中的颜色结果不会改变成员或顺序，继续复用数组可避免画布重建布局。
		visibleTemplateOptionsRef.current = stableTemplateOptions
		return stableTemplateOptions
	}, [colorCacheVersion, similarColorSource, slidesState.templateOptions])
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

	useEffect(() => {
		if (isComposingRef.current) return
		setSearchValue(slidesState.keyword)
	}, [slidesState.keyword])

	const queueMissingTemplateColors = useCallback(() => {
		if (!similarColorSource) return

		slidesState.templateOptions.forEach((template) => {
			if (getAvailableTemplateColors(template).length > 0) return
			requestTemplateColorExtraction(getTemplateCoverUrl(template), "background")
		})
	}, [similarColorSource, slidesState.templateOptions])

	useEffect(() => {
		if (!isSimilarColorFilterActive) return

		// 队列进度只用于继续补充后台任务，不触发模板墙重新渲染。
		queueMissingTemplateColors()
		return subscribeTemplateColorExtractionSettled(queueMissingTemplateColors)
	}, [isSimilarColorFilterActive, queueMissingTemplateColors])

	useEffect(() => {
		if (!isSimilarColorFilterActive) {
			clearTemplateColorExtractionBackgroundQueue()
			return
		}

		return clearTemplateColorExtractionBackgroundQueue
	}, [isSimilarColorFilterActive])

	useEffect(() => {
		const sourceKey = similarColorSource ? getTemplateKey(similarColorSource) : ""
		if (similarColorLoadSourceKeyRef.current === sourceKey) return

		similarColorLoadSourceKeyRef.current = sourceKey
		similarColorLoadCountRef.current = 0
	}, [similarColorSource])

	const canLoadMoreSimilarColorTemplates =
		isSimilarColorFilterActive &&
		shouldLoadMoreSimilarColorTemplates({
			loadCount: similarColorLoadCountRef.current,
			hasMore: slidesState.hasMore,
			isLoading: slidesState.isLoading,
			isLoadingMore: slidesState.isLoadingMore,
			isRefreshing: slidesState.isRefreshing,
			loadedTemplateCount: slidesState.loadedTemplateCount,
			similarTemplateCount: visibleTemplateOptions.length,
		})
	const handleLoadMoreTemplates = useCallback(() => {
		if (!isSimilarColorFilterActive) {
			slidesState.loadMore()
			return
		}
		if (
			!shouldLoadMoreSimilarColorTemplates({
				loadCount: similarColorLoadCountRef.current,
				hasMore: slidesState.hasMore,
				isLoading: slidesState.isLoading,
				isLoadingMore: slidesState.isLoadingMore,
				isRefreshing: slidesState.isRefreshing,
				loadedTemplateCount: slidesState.loadedTemplateCount,
				similarTemplateCount: visibleTemplateOptions.length,
			})
		) {
			return
		}

		similarColorLoadCountRef.current += 1
		slidesState.loadMore()
	}, [
		isSimilarColorFilterActive,
		slidesState.hasMore,
		slidesState.isLoading,
		slidesState.isLoadingMore,
		slidesState.isRefreshing,
		slidesState.loadedTemplateCount,
		slidesState.loadMore,
		visibleTemplateOptions.length,
	])

	useEffect(() => {
		if (!isSimilarColorFilterActive) return
		handleLoadMoreTemplates()
	}, [handleLoadMoreTemplates, isSimilarColorFilterActive])

	const resetKey = `${slidesState.selectedGroupKey}:${slidesState.keyword.trim()}:${
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
		setSelectedTemplate(null)
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
				templates={visibleTemplateOptions}
				selectedTemplate={selectedTemplate}
				onTemplateSelect={setSelectedTemplate}
				hasMore={
					isSimilarColorFilterActive
						? canLoadMoreSimilarColorTemplates
						: slidesState.hasMore
				}
				isLoading={slidesState.isLoading}
				isLoadingMore={slidesState.isLoadingMore}
				isRefreshing={slidesState.isRefreshing}
				onLoadMore={handleLoadMoreTemplates}
				loadMoreSignal={slidesState.loadedTemplateCount}
				onFindSimilarColors={handleFindSimilarColors}
				onPreviewOpenChange={setIsInlinePreviewOpen}
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
								"pointer-events-auto flex w-full flex-col rounded-2xl bg-zinc-950/[0.42] p-2 shadow-[0_12px_36px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-2xl",
								selectedTemplate
									? cn(
											"max-w-4xl",
											reduceMotion
												? "transition-none"
												: "transition-[max-width] duration-150 ease-out",
										)
									: "max-w-3xl transition-none",
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
										onClick={() => setSimilarColorSource(null)}
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
