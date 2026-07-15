import { ImageIcon, MousePointerClick, X } from "lucide-react"
import { useEffect, useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import MagicDropdown from "@/components/base/MagicDropdown"
import { cn } from "@/lib/utils"
import { useResolvedTemplateColors } from "@/pages/superMagic/pages/SlidesTemplates/useResolvedTemplateColors"
import {
	hasSlidesTemplateRandomDragType,
	SLIDES_TEMPLATE_RANDOM_DRAG_END_EVENT,
	SLIDES_TEMPLATE_RANDOM_DRAG_START_EVENT,
} from "../../constants"
import FilterBar from "../../panels/FilterBar"
import { useLocaleText } from "../../panels/hooks/useLocaleText"
import type { FieldItem, OptionItem } from "../../panels/types"
import { isComplexField } from "../../panels/utils"
import SlidesPresetPreviewDialog from "../../panels/slides-preset/SlidesPresetPreviewDialog"
import AIAutoSelectVisual from "./AIAutoSelectVisual"

interface SlidesTemplateHomeSelectionPreviewProps {
	filters: FieldItem[]
	onClear?: () => void
	onRandomTemplateRequest?: () => void
	onTemplatePickerContainerChange?: (container: HTMLDivElement | null) => void
	onFilterChange: (filterId: string, value: string) => void
	template?: OptionItem | null
	className?: string
}

function getTemplateCoverUrl(template: OptionItem) {
	return template.thumbnail_url ?? template.preview_image_urls?.[0] ?? template.collage_url
}

export default function SlidesTemplateHomeSelectionPreview({
	filters,
	onClear,
	onRandomTemplateRequest,
	onTemplatePickerContainerChange,
	onFilterChange,
	template,
	className,
}: SlidesTemplateHomeSelectionPreviewProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const templateName = template
		? lt(template.label) || lt(template.value) || String(template.value)
		: ""
	const coverUrl = template ? getTemplateCoverUrl(template) : undefined
	const colors = useResolvedTemplateColors({
		colors: template?.colors,
		enabled: Boolean(template),
		imageUrl: coverUrl,
		priority: "interactive",
	})
	const simpleFilters = filters.filter((filter) => !isComplexField(filter))
	const [isPreviewOpen, setIsPreviewOpen] = useState(false)
	const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
	const [isTemplatePickerReady, setIsTemplatePickerReady] = useState(true)
	const [isRandomDragActive, setIsRandomDragActive] = useState(false)
	const [isRandomDropActive, setIsRandomDropActive] = useState(false)
	const randomDragDepthRef = useRef(0)

	useEffect(() => {
		if (!onRandomTemplateRequest) return

		const handleRandomDragStart = () => setIsRandomDragActive(true)
		const handleRandomDragEnd = () => {
			randomDragDepthRef.current = 0
			setIsRandomDragActive(false)
			setIsRandomDropActive(false)
		}

		window.addEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_START_EVENT, handleRandomDragStart)
		window.addEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_END_EVENT, handleRandomDragEnd)
		return () => {
			window.removeEventListener(
				SLIDES_TEMPLATE_RANDOM_DRAG_START_EVENT,
				handleRandomDragStart,
			)
			window.removeEventListener(SLIDES_TEMPLATE_RANDOM_DRAG_END_EVENT, handleRandomDragEnd)
		}
	}, [onRandomTemplateRequest])

	const handleClear = () => {
		setIsTemplatePickerOpen(false)
		setIsTemplatePickerReady(false)
		onClear?.()
		window.setTimeout(() => setIsTemplatePickerReady(true), 0)
	}

	const isRandomTemplateDrag = (event: DragEvent<HTMLDivElement>) =>
		hasSlidesTemplateRandomDragType(event.dataTransfer)

	const handleRandomDragEnter = (event: DragEvent<HTMLDivElement>) => {
		if (!onRandomTemplateRequest || !isRandomTemplateDrag(event)) return
		event.preventDefault()
		randomDragDepthRef.current += 1
		setIsRandomDropActive(true)
	}

	const handleRandomDragOver = (event: DragEvent<HTMLDivElement>) => {
		if (!onRandomTemplateRequest || !isRandomTemplateDrag(event)) return
		event.preventDefault()
		event.dataTransfer.dropEffect = "copy"
	}

	const handleRandomDragLeave = (event: DragEvent<HTMLDivElement>) => {
		if (!onRandomTemplateRequest || !isRandomTemplateDrag(event)) return
		randomDragDepthRef.current = Math.max(0, randomDragDepthRef.current - 1)
		if (randomDragDepthRef.current === 0) setIsRandomDropActive(false)
	}

	const handleRandomDrop = (event: DragEvent<HTMLDivElement>) => {
		if (!onRandomTemplateRequest || !isRandomTemplateDrag(event)) return
		event.preventDefault()
		randomDragDepthRef.current = 0
		setIsRandomDragActive(false)
		setIsRandomDropActive(false)
		onRandomTemplateRequest()
	}

	const selectionContent = template ? (
		<div className="flex min-w-[40%] max-w-fit flex-1 items-center gap-3 overflow-hidden">
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
								title={color}
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
					className="group relative flex min-h-[70px] min-w-0 flex-1 items-center overflow-hidden rounded-lg px-4 text-left outline-none transition-shadow hover:shadow-[0_4px_16px_rgba(139,92,246,0.1)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
					aria-label={t("playbook.edit.presets.title")}
					data-testid="slides-template-home-choose-template"
				>
					<AIAutoSelectVisual />
					<div className="relative z-10 min-w-0 flex-1">
						<p className="whitespace-normal break-words text-sm font-medium leading-5 text-slate-900 transition-colors group-hover:text-violet-950">
							{t("playbook.edit.presets.form.selectOrAutoSelectTemplate")}
						</p>
					</div>
				</button>
			</MagicDropdown>
		</div>
	) : (
		<div className="relative flex min-h-[70px] min-w-0 flex-1 items-center overflow-hidden px-4">
			<AIAutoSelectVisual />
			<div className="relative z-10 min-w-0">
				<p className="whitespace-normal break-words text-sm font-medium leading-5 text-slate-900">
					{t("playbook.edit.presets.form.autoSelectTemplate")}
				</p>
			</div>
			{onRandomTemplateRequest ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="relative z-10 ml-3 h-8 shrink-0 gap-1.5 rounded-full border-violet-200/80 bg-white/75 px-3 text-xs font-medium text-violet-700 shadow-sm backdrop-blur-sm hover:border-violet-300 hover:bg-white hover:text-violet-900"
					aria-label={t("playbook.edit.presets.form.randomSelectTemplate")}
					onClick={onRandomTemplateRequest}
					data-testid="slides-template-home-random-template"
				>
					<MousePointerClick className="size-3.5" />
					{t("playbook.edit.presets.form.randomSelectTemplate")}
				</Button>
			) : null}
		</div>
	)

	return (
		<div
			className={cn(
				"relative flex min-w-0 flex-wrap items-center rounded-xl border bg-white/90 shadow-[0_6px_18px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-200",
				template ? "gap-3 px-3 py-2" : "gap-0 overflow-hidden",
				isRandomDropActive
					? "scale-[1.01] border-violet-400 shadow-[0_12px_32px_rgba(124,58,237,0.2)] ring-2 ring-violet-300/40"
					: isRandomDragActive
						? "border-violet-300 bg-violet-50/30 shadow-[0_10px_28px_rgba(124,58,237,0.12)] ring-1 ring-violet-200/70"
						: "border-black/[0.08]",
				className,
			)}
			data-testid="slides-template-home-selected-template"
			data-random-drag-active={isRandomDragActive}
			data-random-drop-active={isRandomDropActive}
			onDragEnter={handleRandomDragEnter}
			onDragOver={handleRandomDragOver}
			onDragLeave={handleRandomDragLeave}
			onDrop={handleRandomDrop}
		>
			{isRandomDragActive ? (
				<div
					className={cn(
						"pointer-events-none absolute inset-1 z-20 rounded-lg border-2 transition-colors duration-150",
						isRandomDropActive
							? "border-violet-500 bg-violet-100/15"
							: "border-dashed border-violet-300/80",
					)}
					data-testid="slides-template-random-drag-feedback"
				/>
			) : null}
			{selectionContent}
			<div
				className={`order-last w-full min-w-0 border-t border-black/[0.06] md:order-none md:ml-auto md:w-auto md:border-t-0 ${
					template ? "pt-2 md:pt-0" : "px-3 py-2 md:py-0 md:pl-2 md:pr-3"
				}`}
			>
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
