import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import TemplateGroupSelector from "../../panels/TemplateGroupSelector"
import SlidesPresetGrid from "../../panels/slides-preset/SlidesPresetGrid"
import type { OptionItem } from "../../panels/types"
import { ALL_SLIDES_TEMPLATE_GROUP_KEY } from "./slidesTemplateState"
import {
	SlidesTemplatePrimaryFiltersSkeleton,
	SlidesTemplateTagFiltersSkeleton,
} from "./SlidesTemplateFilterSkeleton"
import SlidesTemplateTagGroupSelect from "./SlidesTemplateTagGroupSelect"
import SlidesTemplateMobileTagFilters from "./SlidesTemplateMobileTagFilters"
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
	disableEntryAnimation?: boolean
	onPreviewOpenChange?: (open: boolean) => void
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
	disableEntryAnimation = false,
	onPreviewOpenChange,
}: SlidesTemplatePanelContentProps) {
	const { t } = useTranslation("crew/create")
	const isMobile = useIsMobile()
	const [isSearchOpen, setIsSearchOpen] = useState(() => Boolean(slidesState.keyword.trim()))
	const [searchValue, setSearchValue] = useState(slidesState.keyword)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const isComposingRef = useRef(false)
	const selectorGroups = slidesState.groups
	const selectedGroupKey = slidesState.selectedGroupKey
	const setSelectedGroupKey = slidesState.setSelectedGroupKey
	const hasGroups = selectorGroups.length > 1
	const hasSelectedChildTags = slidesState.selectedChildTagCodes.length > 0
	const selectedChildTagCodeSet = useMemo(
		() => new Set(slidesState.selectedChildTagCodes),
		[slidesState.selectedChildTagCodes],
	)
	const loadTemplateDetail = slidesState.loadTemplateDetail
	const handlePreviewDetailLoad = useCallback(
		(template: OptionItem) => {
			const code = typeof template.value === "string" ? template.value : ""
			return code ? loadTemplateDetail(code) : Promise.resolve(template)
		},
		[loadTemplateDetail],
	)
	const handlePreviewOpenChange = useCallback(
		(open: boolean) => {
			onPreviewOpenChange?.(open)
		},
		[onPreviewOpenChange],
	)
	const handlePrimaryGroupChange = useCallback(
		(groupKey: string) => {
			setSelectedGroupKey(
				groupKey === selectedGroupKey ? ALL_SLIDES_TEMPLATE_GROUP_KEY : groupKey,
			)
		},
		[selectedGroupKey, setSelectedGroupKey],
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

	return (
		<div className={cn("flex min-h-0 flex-col", className)}>
			<div
				className={cn(
					"flex translate-y-0 flex-col gap-3 px-4 pt-3 opacity-100",
					toolbarClassName,
				)}
				data-testid="slides-template-panel-toolbar"
			>
				<div className="flex min-w-0 items-center gap-2">
					{slidesState.isPrimaryFilterLoading ? (
						<SlidesTemplatePrimaryFiltersSkeleton />
					) : hasGroups ? (
						<TemplateGroupSelector
							groups={selectorGroups}
							selectedGroupKey={slidesState.selectedGroupKey}
							onGroupChange={handlePrimaryGroupChange}
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
				{slidesState.isTagFilterLoading ? (
					<SlidesTemplateTagFiltersSkeleton isMobile={isMobile} />
				) : slidesState.tagGroups.length > 0 ? (
					<div data-testid="slides-template-category-tag-filters">
						{isMobile ? (
							<SlidesTemplateMobileTagFilters
								tagGroups={slidesState.tagGroups}
								selectedTagCodes={slidesState.selectedChildTagCodes}
								onSelectedTagCodesChange={slidesState.setSelectedChildTagCodes}
							/>
						) : (
							<div className="flex min-w-0 items-start gap-2">
								<div
									className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-0.5"
									data-testid="slides-template-tag-groups"
								>
									{slidesState.tagGroups.map((tagGroup) => {
										const selectedGroupTagCodes = tagGroup.tags
											.filter((tag) => selectedChildTagCodeSet.has(tag.code))
											.map((tag) => tag.code)

										return (
											<SlidesTemplateTagGroupSelect
												key={tagGroup.code}
												tagGroup={tagGroup}
												selectedTagCodes={selectedGroupTagCodes}
												onSelectedTagCodesChange={(nextGroupTagCodes) => {
													const groupTagCodeSet = new Set(
														tagGroup.tags.map((tag) => tag.code),
													)
													const otherGroupTagCodes =
														slidesState.selectedChildTagCodes.filter(
															(tagCode) =>
																!groupTagCodeSet.has(tagCode),
														)
													slidesState.setSelectedChildTagCodes([
														...otherGroupTagCodes,
														...nextGroupTagCodes,
													])
												}}
											/>
										)
									})}
								</div>
								{hasSelectedChildTags ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="mt-0.5 h-8 shrink-0 gap-1 rounded-full px-2.5 text-xs font-normal text-muted-foreground hover:text-destructive"
										data-testid="slides-template-tag-clear-selection"
										onClick={() => slidesState.setSelectedChildTagCodes([])}
									>
										<X className="size-3.5" />
										{t("playbook.edit.presets.clearSelection")}
									</Button>
								) : null}
							</div>
						)}
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
				onPreviewOpenChange={handlePreviewOpenChange}
				onPreviewDetailLoad={handlePreviewDetailLoad}
				className={gridClassName}
				showHoverDetails={showHoverDetails}
				hoverDetailsContainer={hoverDetailsContainer}
				disableEntryAnimation={disableEntryAnimation}
				disableContentVisibility={isMobile}
			/>
		</div>
	)
}

export default SlidesTemplatePanelContent
