import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
import { ActionDrawer } from "@/components/shadcn-composed/action-drawer"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import { useLocaleText } from "../../panels/hooks/useLocaleText"
import type { SlidesTemplateTagGroupItem } from "./slidesTemplateState"

interface SlidesTemplateTagGroupSelectProps {
	tagGroup: SlidesTemplateTagGroupItem
	selectedTagCodes: string[]
	onSelectedTagCodesChange: (tagCodes: string[]) => void
}

function SlidesTemplateTagGroupSelect({
	tagGroup,
	selectedTagCodes,
	onSelectedTagCodesChange,
}: SlidesTemplateTagGroupSelectProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const isMobile = useIsMobile()
	const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false)
	const [draftSelectedTagCodes, setDraftSelectedTagCodes] = useState<string[]>([])
	const selectedTagCodeSet = useMemo(() => new Set(selectedTagCodes), [selectedTagCodes])
	const selectedTags = tagGroup.tags.filter((tag) => selectedTagCodeSet.has(tag.code))
	const visibleSelectedTags = selectedTags.slice(0, 3)
	const hiddenSelectedTags = selectedTags.slice(3)
	const groupName = lt(tagGroup.name_i18n)
	const unselectedLabel = t("playbook.edit.presets.unselected")

	function toggleSelectedTag(tagCode: string) {
		onSelectedTagCodesChange(
			selectedTagCodeSet.has(tagCode)
				? selectedTagCodes.filter((code) => code !== tagCode)
				: [...selectedTagCodes, tagCode],
		)
	}

	function handleMobilePanelOpenChange(open: boolean) {
		if (open) setDraftSelectedTagCodes(selectedTagCodes)
		setIsMobilePanelOpen(open)
	}

	function toggleDraftSelectedTag(tagCode: string) {
		setDraftSelectedTagCodes((currentTagCodes) =>
			currentTagCodes.includes(tagCode)
				? currentTagCodes.filter((code) => code !== tagCode)
				: [...currentTagCodes, tagCode],
		)
	}

	const trigger = (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className={cn(
				"h-8 max-w-[32rem] shrink-0 gap-1.5 rounded-lg border-0 bg-transparent px-2.5 text-xs font-normal text-muted-foreground shadow-none hover:border-0 hover:bg-transparent hover:text-foreground dark:hover:bg-transparent",
				selectedTags.length > 0 && "text-foreground",
			)}
			aria-label={`${groupName}: ${
				selectedTags.length === 0
					? unselectedLabel
					: selectedTags.map((tag) => lt(tag.name_i18n)).join(", ")
			}`}
			aria-expanded={isMobile ? isMobilePanelOpen : undefined}
			data-testid={`slides-template-tag-group-trigger-${tagGroup.code}`}
			onClick={isMobile ? () => handleMobilePanelOpenChange(true) : undefined}
		>
			<span className="truncate">
				{groupName}
				{selectedTags.length > 0 ? "：" : null}
			</span>
			{visibleSelectedTags.map((tag) => (
				<span key={tag.code} className="flex min-w-0 items-center">
					<span
						className="max-w-28 truncate rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary"
						data-testid={`slides-template-tag-group-selected-value-${tag.code}`}
					>
						{lt(tag.name_i18n)}
					</span>
				</span>
			))}
			{hiddenSelectedTags.length > 0 ? (
				<MagicTooltip
					title={
						<div
							className="flex flex-col gap-1"
							data-testid={`slides-template-tag-group-overflow-tooltip-${tagGroup.code}`}
						>
							{hiddenSelectedTags.map((tag) => (
								<span key={tag.code}>{lt(tag.name_i18n)}</span>
							))}
						</div>
					}
				>
					<span
						className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 font-medium text-primary-foreground"
						data-testid={`slides-template-tag-group-selected-overflow-${tagGroup.code}`}
					>
						+{hiddenSelectedTags.length}
					</span>
				</MagicTooltip>
			) : null}
			<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
		</Button>
	)

	if (isMobile) {
		const draftSelectedTagCodeSet = new Set(draftSelectedTagCodes)

		return (
			<>
				{trigger}
				<ActionDrawer
					open={isMobilePanelOpen}
					onOpenChange={handleMobilePanelOpenChange}
					title={groupName}
					cancelText={t("playbook.edit.presets.form.cancel")}
					confirmText={t("playbook.edit.presets.form.confirm")}
					onConfirm={() => onSelectedTagCodesChange(draftSelectedTagCodes)}
					contentClassName="gap-1.5"
				>
					<div
						className="flex flex-col gap-1"
						data-testid={`slides-template-tag-mobile-panel-${tagGroup.code}`}
					>
						{tagGroup.tags.map((tag) => {
							const isSelected = draftSelectedTagCodeSet.has(tag.code)

							return (
								<button
									key={tag.code}
									type="button"
									className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm text-foreground hover:bg-accent"
									aria-pressed={isSelected}
									data-testid={`slides-template-tag-mobile-option-${tag.code}`}
									onClick={() => toggleDraftSelectedTag(tag.code)}
								>
									<span
										className={cn(
											"flex size-5 shrink-0 items-center justify-center rounded border border-border bg-background",
											isSelected &&
												"border-primary bg-primary text-primary-foreground",
										)}
									>
										{isSelected ? <Check className="size-3.5" /> : null}
									</span>
									<span className="min-w-0 flex-1 truncate">
										{lt(tag.name_i18n)}
									</span>
								</button>
							)
						})}
					</div>
				</ActionDrawer>
			</>
		)
	}

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-72 w-56 rounded-lg border-border/80 p-1.5 shadow-lg"
				data-testid={`slides-template-tag-dropdown-${tagGroup.code}`}
			>
				{tagGroup.tags.map((tag) => {
					const isSelected = selectedTagCodeSet.has(tag.code)

					return (
						<DropdownMenuCheckboxItem
							key={tag.code}
							checked={isSelected}
							className="min-h-9 cursor-pointer rounded-lg"
							data-testid={`slides-template-tag-option-${tag.code}`}
							onCheckedChange={() => toggleSelectedTag(tag.code)}
							onSelect={(event) => event.preventDefault()}
						>
							{lt(tag.name_i18n)}
						</DropdownMenuCheckboxItem>
					)
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export default SlidesTemplateTagGroupSelect
