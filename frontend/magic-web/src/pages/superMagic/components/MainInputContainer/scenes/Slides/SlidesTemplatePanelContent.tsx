import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronDown, ChevronUp, Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/lib/utils"
import TemplateGroupSelector from "../../panels/TemplateGroupSelector"
import { useLocaleText } from "../../panels/hooks/useLocaleText"
import SlidesPresetGrid from "../../panels/slides-preset/SlidesPresetGrid"
import type { OptionItem } from "../../panels/types"
import { ALL_SLIDES_TEMPLATE_GROUP_KEY } from "./slidesTemplateState"
import type { SlidesTemplatePanelState } from "./useSlidesTemplatePanelState"

interface SlidesTemplatePanelContentProps {
	slidesState: SlidesTemplatePanelState
	selectedTemplate?: OptionItem | null
	onTemplateClick: (template: OptionItem) => void
	className?: string
	toolbarClassName?: string
	gridClassName?: string
	showHoverDetails?: boolean
	hoverDetailsContainer?: HTMLElement | null
}

function SlidesTemplatePanelContent({
	slidesState,
	selectedTemplate,
	onTemplateClick,
	className,
	toolbarClassName,
	gridClassName,
	showHoverDetails = true,
	hoverDetailsContainer,
}: SlidesTemplatePanelContentProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const [isSearchOpen, setIsSearchOpen] = useState(() => Boolean(slidesState.keyword.trim()))
	const [searchValue, setSearchValue] = useState(slidesState.keyword)
	const [isPreviewOpen, setIsPreviewOpen] = useState(false)
	const [isTagGroupsExpanded, setIsTagGroupsExpanded] = useState(false)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const isComposingRef = useRef(false)
	const selectorGroups = slidesState.groups
	const hasGroups = selectorGroups.length > 1
	const hasAdditionalTagGroups = slidesState.tagGroups.length > 1
	const visibleTagGroups = isTagGroupsExpanded
		? slidesState.tagGroups
		: slidesState.tagGroups.slice(0, 1)
	const loadTemplateDetail = slidesState.loadTemplateDetail
	const handlePreviewDetailLoad = useCallback(
		(template: OptionItem) => {
			const code = typeof template.value === "string" ? template.value : ""
			return code ? loadTemplateDetail(code) : Promise.resolve(template)
		},
		[loadTemplateDetail],
	)
	const handlePrimaryGroupChange = useCallback(
		(groupKey: string) => {
			slidesState.setSelectedGroupKey(
				groupKey === slidesState.selectedGroupKey
					? ALL_SLIDES_TEMPLATE_GROUP_KEY
					: groupKey,
			)
		},
		[slidesState.selectedGroupKey, slidesState.setSelectedGroupKey],
	)

	useEffect(() => {
		if (!slidesState.keyword.trim()) return
		setIsSearchOpen(true)
	}, [slidesState.keyword])

	useEffect(() => {
		if (!isSearchOpen) return
		searchInputRef.current?.focus()
	}, [isSearchOpen])

	useEffect(() => {
		if (isComposingRef.current) return
		setSearchValue(slidesState.keyword)
	}, [slidesState.keyword])

	useEffect(() => {
		setIsTagGroupsExpanded(false)
	}, [slidesState.selectedCategoryCode])

	useEffect(() => {
		if (slidesState.selectedChildTagCodes.length === 0) return
		const isSelectedTagInAdditionalGroup = slidesState.tagGroups
			.slice(1)
			.some((group) =>
				group.tags.some((tag) => slidesState.selectedChildTagCodes.includes(tag.code)),
			)
		if (isSelectedTagInAdditionalGroup) setIsTagGroupsExpanded(true)
	}, [slidesState.selectedChildTagCodes, slidesState.tagGroups])

	function handleSearchToggle() {
		if (isSearchOpen) {
			setSearchValue("")
			slidesState.setKeyword("")
			setIsSearchOpen(false)
			return
		}

		setIsSearchOpen(true)
	}

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

	function handleTagGroupsToggle() {
		setIsTagGroupsExpanded((expanded) => !expanded)
	}

	return (
		<div className={cn("flex min-h-0 flex-col gap-3", className)}>
			<div
				className={cn(
					"flex flex-col gap-3 px-4 pt-3",
					toolbarClassName,
					isPreviewOpen
						? "pointer-events-none translate-y-[calc(100%_+_24px)] opacity-0"
						: "translate-y-0 opacity-100",
				)}
				data-testid="slides-template-panel-toolbar"
				aria-hidden={isPreviewOpen}
			>
				<div className="flex min-w-0 items-center gap-2">
					{hasGroups ? (
						<TemplateGroupSelector
							groups={selectorGroups}
							selectedGroupKey={slidesState.selectedGroupKey}
							onGroupChange={handlePrimaryGroupChange}
							controlBackground="transparent"
							showEmptyGroups
							className="flex-1"
						/>
					) : (
						<div className="min-w-0 flex-1" />
					)}
					<Button
						type="button"
						size="icon"
						variant={isSearchOpen ? "outline" : "secondary"}
						className={cn(
							"size-9 shrink-0 rounded-full border border-transparent shadow-xs",
							isSearchOpen && "border-primary bg-background text-primary",
						)}
						aria-label={
							isSearchOpen
								? t("playbook.edit.presets.close")
								: t("playbook.edit.presets.form.searchPlaceholder")
						}
						data-testid="slides-template-search-toggle"
						onClick={handleSearchToggle}
					>
						{isSearchOpen ? <X className="size-4" /> : <Search className="size-4" />}
					</Button>
				</div>
				{slidesState.selectedCategoryCode && slidesState.tagGroups.length > 0 ? (
					<div
						className="flex items-start gap-2"
						data-testid="slides-template-category-tag-filters"
					>
						<div className="flex min-w-0 flex-1 flex-col gap-1.5">
							{visibleTagGroups.map((tagGroup) => (
								<div
									key={tagGroup.code}
									className="flex min-w-0 items-center gap-1.5"
								>
									<span className="shrink-0 text-[11px] leading-4 text-muted-foreground">
										{lt(tagGroup.name_i18n)}
									</span>
									<div className="no-scrollbar flex min-w-0 gap-1.5 overflow-x-auto py-0.5">
										{tagGroup.tags.map((tag) => {
											const isSelected =
												slidesState.selectedChildTagCodes.includes(tag.code)

											return (
												<Button
													key={tag.code}
													type="button"
													variant={isSelected ? "outline" : "secondary"}
													size="sm"
													className={cn(
														"h-7 shrink-0 rounded-full border border-transparent px-2.5 text-xs font-normal shadow-none",
														isSelected &&
															"border-primary bg-background text-primary",
													)}
													aria-pressed={isSelected}
													data-testid={`slides-template-tag-option-${tag.code}`}
													onClick={() =>
														slidesState.setSelectedChildTagCodes(
															isSelected
																? slidesState.selectedChildTagCodes.filter(
																		(tagCode) =>
																			tagCode !== tag.code,
																	)
																: [
																		...slidesState.selectedChildTagCodes,
																		tag.code,
																	],
														)
													}
												>
													{lt(tag.name_i18n)}
												</Button>
											)
										})}
									</div>
								</div>
							))}
						</div>
						{hasAdditionalTagGroups ? (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="ml-auto h-7 shrink-0 gap-1 rounded-full px-2.5 text-xs font-normal text-muted-foreground hover:text-foreground"
								aria-expanded={isTagGroupsExpanded}
								data-testid="slides-template-tag-groups-toggle"
								onClick={handleTagGroupsToggle}
							>
								{t(
									isTagGroupsExpanded
										? "playbook.edit.presets.form.collapseFilters"
										: "playbook.edit.presets.form.moreFilters",
								)}
								{isTagGroupsExpanded ? (
									<ChevronUp className="size-3.5" />
								) : (
									<ChevronDown className="size-3.5" />
								)}
							</Button>
						) : null}
					</div>
				) : null}
				{isSearchOpen ? (
					<Input
						ref={searchInputRef}
						value={searchValue}
						onChange={(event) => handleSearchChange(event.target.value)}
						onCompositionStart={handleCompositionStart}
						onCompositionEnd={(event) =>
							handleCompositionEnd(event.currentTarget.value)
						}
						placeholder={t("playbook.edit.presets.form.searchPlaceholder")}
						className="h-9 rounded-full bg-background text-sm"
						data-testid="slides-template-search-input"
					/>
				) : null}
			</div>
			<SlidesPresetGrid
				templates={slidesState.templateOptions}
				selectedTemplate={selectedTemplate ?? undefined}
				onTemplateClick={onTemplateClick}
				isLoading={slidesState.isLoading}
				isRefreshing={slidesState.isRefreshing}
				hasMore={slidesState.hasMore}
				isLoadingMore={slidesState.isLoadingMore}
				isLoadMoreFailed={slidesState.isLoadMoreFailed}
				onLoadMore={slidesState.loadMore}
				onRetryLoadMore={slidesState.retryLoadMore}
				onPreviewOpenChange={setIsPreviewOpen}
				onPreviewDetailLoad={handlePreviewDetailLoad}
				className={gridClassName}
				showHoverDetails={showHoverDetails}
				hoverDetailsContainer={hoverDetailsContainer}
			/>
		</div>
	)
}

export default SlidesTemplatePanelContent
