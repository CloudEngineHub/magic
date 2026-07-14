import { ImageIcon, Sparkles, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import MagicDropdown from "@/components/base/MagicDropdown"
import FilterBar from "../../panels/FilterBar"
import { useLocaleText } from "../../panels/hooks/useLocaleText"
import type { FieldItem, OptionItem } from "../../panels/types"
import { isComplexField } from "../../panels/utils"
import SlidesPresetPreviewDialog from "../../panels/slides-preset/SlidesPresetPreviewDialog"

interface SlidesTemplateHomeSelectionPreviewProps {
	filters: FieldItem[]
	onClear?: () => void
	onTemplatePickerContainerChange?: (container: HTMLDivElement | null) => void
	onFilterChange: (filterId: string, value: string) => void
	template?: OptionItem | null
}

function getTemplateCoverUrl(template: OptionItem) {
	return template.thumbnail_url ?? template.preview_image_urls?.[0] ?? template.collage_url
}

export default function SlidesTemplateHomeSelectionPreview({
	filters,
	onClear,
	onTemplatePickerContainerChange,
	onFilterChange,
	template,
}: SlidesTemplateHomeSelectionPreviewProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const templateName = template
		? lt(template.label) || lt(template.value) || String(template.value)
		: ""
	const coverUrl = template ? getTemplateCoverUrl(template) : undefined
	const colors = template?.colors?.slice(0, 5) ?? []
	const simpleFilters = filters.filter((filter) => !isComplexField(filter))
	const [isPreviewOpen, setIsPreviewOpen] = useState(false)
	const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
	const [isTemplatePickerReady, setIsTemplatePickerReady] = useState(true)

	const handleClear = () => {
		setIsTemplatePickerOpen(false)
		setIsTemplatePickerReady(false)
		onClear?.()
		window.setTimeout(() => setIsTemplatePickerReady(true), 0)
	}

	const selectionContent = template ? (
		<div className="flex min-w-[40%] max-w-fit flex-1 items-center gap-3">
			<div className="relative shrink-0">
				<button
					type="button"
					className="group flex aspect-video w-20 items-center justify-center overflow-hidden rounded-lg bg-muted ring-1 ring-inset ring-black/[0.06] transition-shadow hover:ring-black/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-24"
					aria-label={t("playbook.edit.presets.form.preview")}
					onClick={() => setIsPreviewOpen(true)}
					data-testid="slides-template-home-preview-selected-template"
				>
					{coverUrl ? (
						<img
							src={coverUrl}
							alt={templateName}
							className="size-full object-cover"
							decoding="async"
							draggable={false}
						/>
					) : (
						<ImageIcon className="size-4 text-muted-foreground" />
					)}
				</button>
				{onClear ? (
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="absolute -right-1.5 -top-1.5 size-6 rounded-full border border-black/[0.08] bg-white text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
						aria-label={t("playbook.edit.presets.clearSelection")}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.preventDefault()
							event.stopPropagation()
							handleClear()
						}}
						data-testid="slides-template-home-clear-selected-template"
					>
						<X className="size-3.5" />
					</Button>
				) : null}
			</div>

			<button
				type="button"
				className="min-w-0 flex-1 rounded-lg text-left outline-none transition-colors hover:text-foreground/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				aria-label={t("playbook.edit.presets.form.preview")}
				onClick={() => setIsPreviewOpen(true)}
			>
				<p className="truncate text-sm font-medium text-foreground">
					{t("playbook.edit.presets.form.selectedTemplate", { name: templateName })}
				</p>
				{colors.length > 0 ? (
					<div className="mt-1.5 flex items-center gap-1" aria-label={templateName}>
						{colors.map((color) => (
							<span
								key={color}
								className="size-3 rounded-full border border-black/10 shadow-sm"
								style={{ backgroundColor: color }}
							/>
						))}
					</div>
				) : null}
			</button>
		</div>
	) : onTemplatePickerContainerChange && isTemplatePickerReady ? (
		<div className="flex min-w-[240px] flex-1">
			<MagicDropdown
				trigger={["click"]}
				open={isTemplatePickerOpen}
				onOpenChange={setIsTemplatePickerOpen}
				placement="topRight"
				getPopupContainer={() => document.body}
				popupRender={() => (
					<div
						ref={onTemplatePickerContainerChange}
						className="flex h-full min-h-0 flex-col overflow-hidden"
					/>
				)}
				overlayClassName="h-[min(70vh,640px)] w-[min(90vw,760px)] min-w-[360px] overflow-hidden rounded-lg border border-border bg-popover p-3 shadow-xl"
			>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					aria-label={t("playbook.edit.presets.title")}
					data-testid="slides-template-home-choose-template"
				>
					<div className="flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.96),rgba(226,232,240,0.92)_55%,rgba(203,213,225,0.9))] ring-1 ring-inset ring-black/[0.06] sm:w-24">
						<Sparkles className="size-6 text-primary/75" />
					</div>
					<div className="min-w-0 flex-1">
						<p className="whitespace-normal break-words text-sm font-medium leading-5 text-foreground">
							{t("playbook.edit.presets.form.autoSelectTemplate")}
						</p>
					</div>
				</button>
			</MagicDropdown>
		</div>
	) : (
		<div className="flex min-w-0 flex-1 items-center gap-3">
			<div className="flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.96),rgba(226,232,240,0.92)_55%,rgba(203,213,225,0.9))] ring-1 ring-inset ring-black/[0.06] sm:w-24">
				<Sparkles className="size-6 text-primary/75" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="whitespace-normal break-words text-sm font-medium leading-5 text-foreground">
					{t("playbook.edit.presets.form.autoSelectTemplate")}
				</p>
			</div>
		</div>
	)

	return (
		<div
			className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-black/[0.08] bg-white/90 px-3 py-2 shadow-[0_6px_18px_rgba(15,23,42,0.06)] backdrop-blur-xl"
			data-testid="slides-template-home-selected-template"
		>
			{selectionContent}
			<div className="order-last w-full min-w-0 border-t border-black/[0.06] pt-2 md:order-none md:ml-auto md:w-auto md:border-t-0 md:pt-0">
				<FilterBar
					filters={simpleFilters}
					onFilterChange={onFilterChange}
					itemGapClassName="gap-2"
					scrollContainerClassName="justify-start px-0"
				/>
			</div>
			<SlidesPresetPreviewDialog
				template={template ?? null}
				open={isPreviewOpen}
				onOpenChange={setIsPreviewOpen}
			/>
		</div>
	)
}
