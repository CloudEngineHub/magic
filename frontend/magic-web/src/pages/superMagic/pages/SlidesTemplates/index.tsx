import { Search, X } from "lucide-react"
import { useSize } from "ahooks"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { observer } from "mobx-react-lite"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/lib/utils"
import TemplateGroupSelector from "@/pages/superMagic/components/MainInputContainer/panels/TemplateGroupSelector"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { useSlidesTemplateCatalogState } from "@/pages/superMagic/components/MainInputContainer/scenes/Slides/useSlidesTemplateCatalogState"
import SlidesTemplateCanvas, { type SlidesTemplateCanvasHandle } from "./SlidesTemplateCanvas"
import SlidesTemplatePromptDock from "./SlidesTemplatePromptDock"

const BOTTOM_TOOLS_OFFSET = 24
const CANVAS_EDGE_GAP = 40
const CANVAS_TEMPLATE_PAGE_SIZE = 40
const GROUP_SCROLL_CONTROL_CLASS_NAME =
	"[&_button]:border-white/20 [&_button]:bg-zinc-800/[0.86] [&_button]:text-white [&_button]:shadow-[0_4px_14px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.12)] [&_button]:backdrop-blur-lg [&_button:hover]:bg-zinc-700/[0.92]"

function SlidesTemplatesPage() {
	const { t } = useTranslation("crew/create")
	const slidesState = useSlidesTemplateCatalogState({ pageSize: CANVAS_TEMPLATE_PAGE_SIZE })
	const [searchValue, setSearchValue] = useState(slidesState.keyword)
	const [selectedTemplate, setSelectedTemplate] = useState<OptionItem | null>(null)
	const [isInlinePreviewOpen, setIsInlinePreviewOpen] = useState(false)
	const isComposingRef = useRef(false)
	const canvasRef = useRef<SlidesTemplateCanvasHandle>(null)
	const bottomToolsRef = useRef<HTMLDivElement | null>(null)
	const bottomToolsSize = useSize(bottomToolsRef)
	const reduceMotion = useReducedMotion()
	const hasGroups = slidesState.groups.length > 1
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

	const resetKey = `${slidesState.selectedGroupKey}:${slidesState.keyword.trim()}`

	function handleSearchChange(value: string) {
		setSearchValue(value)
		if (isComposingRef.current) return

		slidesState.setKeyword(value)
	}

	function handleCompositionStart() {
		isComposingRef.current = true
	}

	function handleCompositionEnd(value: string) {
		isComposingRef.current = false
		setSearchValue(value)
		slidesState.setKeyword(value)
	}

	function handleClearSearch() {
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

	return (
		<div
			className="relative size-full overflow-hidden rounded-lg bg-[#101114]"
			data-testid="slides-templates-page"
		>
			<SlidesTemplateCanvas
				ref={canvasRef}
				templates={slidesState.templateOptions}
				selectedTemplate={selectedTemplate}
				onTemplateSelect={setSelectedTemplate}
				hasMore={slidesState.hasMore}
				isLoading={slidesState.isLoading}
				isLoadingMore={slidesState.isLoadingMore}
				isRefreshing={slidesState.isRefreshing}
				onLoadMore={slidesState.loadMore}
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
									"grid",
									selectedTemplate
										? cn(
												"grid-rows-[1fr]",
												reduceMotion
													? "transition-none"
													: "transition-[grid-template-rows] duration-150 ease-out",
											)
										: "grid-rows-[0fr] transition-none",
								)}
								data-testid="slides-templates-page-prompt-region"
							>
								<div className="min-h-0 overflow-hidden">
									{selectedTemplate ? (
										<motion.div
											key="prompt-panel"
											initial={reduceMotion ? false : { opacity: 0, y: 6 }}
											animate={{ opacity: 1, y: 0 }}
											transition={
												reduceMotion
													? { duration: 0 }
													: {
															duration: 0.14,
															ease: [0.22, 1, 0.36, 1],
														}
											}
											className="flex flex-col"
											data-testid="slides-templates-page-prompt-panel"
										>
											<SlidesTemplatePromptDock
												selectedTemplate={selectedTemplate}
												onPreviewSelectedTemplate={
													handlePreviewSelectedTemplate
												}
												onClearSelectedTemplate={
													handleClearSelectedTemplate
												}
											/>
										</motion.div>
									) : null}
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
										className="h-10 rounded-xl border-0 bg-white/[0.09] pl-9 pr-9 text-sm text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.11)] placeholder:text-white/[0.45] focus-visible:ring-white/20"
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
							</div>

							{hasGroups ? (
								<TemplateGroupSelector
									groups={slidesState.groups}
									selectedGroupKey={slidesState.selectedGroupKey}
									onGroupChange={slidesState.setSelectedGroupKey}
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
