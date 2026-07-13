import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/lib/utils"
import TemplateGroupSelector from "../../panels/TemplateGroupSelector"
import SlidesPresetGrid from "../../panels/slides-preset/SlidesPresetGrid"
import type { OptionItem } from "../../panels/types"
import { filterSlidesTemplateSelectorGroups } from "./slidesTemplateState"
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
	const [isSearchOpen, setIsSearchOpen] = useState(() => Boolean(slidesState.keyword.trim()))
	const [searchValue, setSearchValue] = useState(slidesState.keyword)
	const [isPreviewOpen, setIsPreviewOpen] = useState(false)
	const searchInputRef = useRef<HTMLInputElement>(null)
	const isComposingRef = useRef(false)
	const selectorGroups = filterSlidesTemplateSelectorGroups(slidesState.groups)
	const hasGroups = selectorGroups.length > 1

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
							onGroupChange={slidesState.setSelectedGroupKey}
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
				className={gridClassName}
				showHoverDetails={showHoverDetails}
				hoverDetailsContainer={hoverDetailsContainer}
			/>
		</div>
	)
}

export default SlidesTemplatePanelContent
