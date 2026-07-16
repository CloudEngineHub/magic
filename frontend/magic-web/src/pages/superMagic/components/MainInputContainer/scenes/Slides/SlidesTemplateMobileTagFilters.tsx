import { useMemo, useState } from "react"
import { Check, ListFilter, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import { ActionDrawer } from "@/components/shadcn-composed/action-drawer"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import { useLocaleText } from "../../panels/hooks/useLocaleText"
import type { SlidesTemplateTagGroupItem } from "./slidesTemplateState"
import SlidesTemplateTagGroupSelect from "./SlidesTemplateTagGroupSelect"

interface SlidesTemplateMobileTagFiltersProps {
	tagGroups: SlidesTemplateTagGroupItem[]
	selectedTagCodes: string[]
	onSelectedTagCodesChange: (tagCodes: string[]) => void
}

function SlidesTemplateMobileTagFilters({
	tagGroups,
	selectedTagCodes,
	onSelectedTagCodesChange,
}: SlidesTemplateMobileTagFiltersProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const [isPanelOpen, setIsPanelOpen] = useState(false)
	const [draftSelectedTagCodes, setDraftSelectedTagCodes] = useState<string[]>([])
	const [activeTagGroupCode, setActiveTagGroupCode] = useState(tagGroups[0]?.code ?? "")
	const selectedTagCodeSet = useMemo(() => new Set(selectedTagCodes), [selectedTagCodes])
	const draftSelectedTagCodeSet = useMemo(
		() => new Set(draftSelectedTagCodes),
		[draftSelectedTagCodes],
	)
	const activeTagGroup =
		tagGroups.find((tagGroup) => tagGroup.code === activeTagGroupCode) ?? tagGroups[0]
	const panelTitle = t("playbook.edit.presets.form.moreFilters")

	function handlePanelOpenChange(open: boolean) {
		if (open) {
			setDraftSelectedTagCodes(selectedTagCodes)
			const firstSelectedGroup = tagGroups.find((tagGroup) =>
				tagGroup.tags.some((tag) => selectedTagCodeSet.has(tag.code)),
			)
			setActiveTagGroupCode(firstSelectedGroup?.code ?? tagGroups[0]?.code ?? "")
		}
		setIsPanelOpen(open)
	}

	function handleGroupSelectedTagCodesChange(
		tagGroup: SlidesTemplateTagGroupItem,
		nextGroupTagCodes: string[],
	) {
		const groupTagCodeSet = new Set(tagGroup.tags.map((tag) => tag.code))
		const otherGroupTagCodes = selectedTagCodes.filter(
			(tagCode) => !groupTagCodeSet.has(tagCode),
		)
		onSelectedTagCodesChange([...otherGroupTagCodes, ...nextGroupTagCodes])
	}

	function toggleDraftSelectedTag(tagCode: string) {
		setDraftSelectedTagCodes((currentTagCodes) =>
			currentTagCodes.includes(tagCode)
				? currentTagCodes.filter((code) => code !== tagCode)
				: [...currentTagCodes, tagCode],
		)
	}

	return (
		<div
			className="flex min-w-0 items-center gap-2"
			data-testid="slides-template-mobile-tag-filters"
		>
			<HeadlessHorizontalScroll
				className="min-w-0 flex-1"
				scrollContainerClassName="no-scrollbar flex min-w-0 touch-pan-x items-center gap-2 overflow-x-auto overflow-y-hidden py-0.5 pr-1"
				data-testid="slides-template-mobile-tag-filter-scroll"
				renderLeftControl={() => null}
				renderRightControl={() => null}
			>
				{tagGroups.map((tagGroup) => {
					const selectedGroupTagCodes = tagGroup.tags
						.filter((tag) => selectedTagCodeSet.has(tag.code))
						.map((tag) => tag.code)

					return (
						<SlidesTemplateTagGroupSelect
							key={tagGroup.code}
							tagGroup={tagGroup}
							selectedTagCodes={selectedGroupTagCodes}
							onSelectedTagCodesChange={(nextGroupTagCodes) =>
								handleGroupSelectedTagCodesChange(tagGroup, nextGroupTagCodes)
							}
						/>
					)
				})}
			</HeadlessHorizontalScroll>

			<Button
				type="button"
				variant="secondary"
				size="icon"
				className="relative size-8 shrink-0 rounded-full border border-transparent shadow-xs"
				aria-label={panelTitle}
				data-testid="slides-template-mobile-all-filters-trigger"
				onClick={() => handlePanelOpenChange(true)}
			>
				<ListFilter className="size-4" />
				{selectedTagCodes.length > 0 ? (
					<span
						className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
						data-testid="slides-template-mobile-all-filters-count"
					>
						{selectedTagCodes.length}
					</span>
				) : null}
			</Button>

			<ActionDrawer
				open={isPanelOpen}
				onOpenChange={handlePanelOpenChange}
				title={panelTitle}
				className="!h-[min(720px,85dvh)] max-h-[85dvh]"
				cancelText={t("playbook.edit.presets.form.cancel")}
				confirmText={t("playbook.edit.presets.form.confirm")}
				onConfirm={() => onSelectedTagCodesChange(draftSelectedTagCodes)}
				contentClassName="gap-3 overflow-hidden"
			>
				<div className="flex justify-end">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={draftSelectedTagCodes.length === 0}
						className="h-8 gap-1 rounded-full px-2.5 text-xs font-normal text-muted-foreground hover:text-destructive"
						data-testid="slides-template-mobile-all-filters-clear"
						onClick={() => setDraftSelectedTagCodes([])}
					>
						<X className="size-3.5" />
						{t("playbook.edit.presets.clearSelection")}
					</Button>
				</div>

				<div
					className="grid min-h-0 flex-1 grid-cols-[7.5rem_minmax(0,1fr)] gap-3 overflow-hidden"
					data-testid="slides-template-mobile-all-filters-panel"
				>
					<div
						className="no-scrollbar flex min-h-0 flex-col gap-1 overflow-y-auto rounded-lg bg-muted/60 p-1"
						data-testid="slides-template-mobile-all-filters-groups"
					>
						{tagGroups.map((tagGroup) => {
							const isActive = tagGroup.code === activeTagGroup?.code
							const selectedCount = tagGroup.tags.filter((tag) =>
								draftSelectedTagCodeSet.has(tag.code),
							).length

							return (
								<button
									key={tagGroup.code}
									type="button"
									className={cn(
										"flex min-h-10 items-center gap-1 rounded-lg px-2.5 text-left text-sm transition-colors",
										isActive
											? "bg-background font-medium text-foreground shadow-xs"
											: "text-muted-foreground hover:bg-background/70 hover:text-foreground",
									)}
									aria-pressed={isActive}
									data-testid={`slides-template-mobile-all-filters-group-${tagGroup.code}`}
									onClick={() => setActiveTagGroupCode(tagGroup.code)}
								>
									<span className="min-w-0 flex-1 whitespace-normal leading-5">
										{lt(tagGroup.name_i18n)}
									</span>
									{selectedCount > 0 ? (
										<span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
											{selectedCount}
										</span>
									) : null}
								</button>
							)
						})}
					</div>

					<div
						className="no-scrollbar min-h-0 overflow-y-auto pr-1"
						data-testid="slides-template-mobile-all-filters-values"
					>
						<div className="flex flex-wrap content-start gap-2">
							{activeTagGroup?.tags.map((tag) => {
								const isSelected = draftSelectedTagCodeSet.has(tag.code)

								return (
									<button
										key={tag.code}
										type="button"
										className={cn(
											"flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors",
											isSelected
												? "border-primary bg-primary/10 text-primary"
												: "border-border bg-background text-foreground hover:bg-accent",
										)}
										aria-pressed={isSelected}
										data-testid={`slides-template-mobile-all-filters-option-${tag.code}`}
										onClick={() => toggleDraftSelectedTag(tag.code)}
									>
										{isSelected ? <Check className="size-3.5" /> : null}
										<span>{lt(tag.name_i18n)}</span>
									</button>
								)
							})}
						</div>
					</div>
				</div>
			</ActionDrawer>
		</div>
	)
}

export default SlidesTemplateMobileTagFilters
