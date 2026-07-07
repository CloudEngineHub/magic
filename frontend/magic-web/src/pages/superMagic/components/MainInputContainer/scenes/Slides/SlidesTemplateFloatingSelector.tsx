import { useState, type MouseEvent, type PointerEvent } from "react"
import { ChevronDown, CircleX, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import MagicDropdown from "@/components/base/MagicDropdown"
import MagicPopup from "@/components/base-mobile/MagicPopup"
import { Button } from "@/components/shadcn-ui/button"
import { Label } from "@/components/shadcn-ui/label"
import { cn } from "@/lib/utils"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"
import FilterBar from "../../panels/FilterBar"
import type { FieldItem, OptionItem } from "../../panels/types"
import SlidesTemplatePanelContent from "./SlidesTemplatePanelContent"
import type { SlidesTemplatePanelState } from "./useSlidesTemplatePanelState"

interface SlidesTemplateFloatingSelectorProps {
	title: string
	selectedTemplate: OptionItem | null
	selectedTemplateTitle: string
	simpleFields: FieldItem[]
	slidesState: SlidesTemplatePanelState
	onFilterChange: (filterId: string, value: string) => void
	onTemplateClick: (template: OptionItem) => void
	onTemplateClear: () => void
	readOnly?: boolean
	variant?: ScenePanelVariant
	compact?: boolean
}

function SlidesTemplateFloatingSelector({
	title,
	selectedTemplate,
	selectedTemplateTitle,
	simpleFields,
	slidesState,
	onFilterChange,
	onTemplateClick,
	onTemplateClear,
	readOnly = false,
	variant,
	compact = false,
}: SlidesTemplateFloatingSelectorProps) {
	const { t } = useTranslation("crew/create")
	const [open, setOpen] = useState(false)
	const [hoverDetailsContainer, setHoverDetailsContainer] = useState<HTMLDivElement | null>(null)
	const isMobile = variant === ScenePanelVariant.Mobile
	const isCompactMobile = compact && isMobile

	function handleTemplateClick(template: OptionItem) {
		onTemplateClick(template)
		setOpen(false)
	}

	function handleClear(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
		event.preventDefault()
		event.stopPropagation()
		onTemplateClear()
		setOpen(false)
	}

	const trigger = (
		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={readOnly}
			className={cn(
				"group h-8 max-w-[220px] justify-start rounded-full bg-background px-3 font-normal shadow-xs dark:bg-card",
				!selectedTemplate && "text-muted-foreground",
				isCompactMobile &&
					"h-8 min-h-8 shrink-0 gap-1 border-border bg-card pl-2.5 pr-2 text-foreground shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] dark:bg-card",
			)}
			aria-label={title}
			data-testid="slides-template-floating-selector-trigger"
			onClick={() => setOpen(true)}
		>
			<span className="flex min-w-0 items-center gap-2 truncate">
				{isCompactMobile ? (
					<>
						<span className="whitespace-nowrap text-[11px] text-muted-foreground">
							{title}
						</span>
						<span className="whitespace-nowrap text-[13px] font-medium text-foreground">
							{selectedTemplateTitle || t("playbook.edit.presets.unselected")}
						</span>
					</>
				) : (
					selectedTemplateTitle || t("playbook.edit.presets.unselected")
				)}
			</span>
			<span className="relative inline-flex size-4 shrink-0 items-center justify-center">
				{selectedTemplate && !isCompactMobile ? (
					<span
						role="button"
						tabIndex={0}
						aria-label={t("playbook.edit.presets.clearSelection")}
						onPointerDown={handleClear}
						onClick={handleClear}
					>
						<CircleX className="size-4 text-muted-foreground opacity-50" />
					</span>
				) : (
					<ChevronDown className="size-4 text-muted-foreground opacity-50 transition-opacity" />
				)}
			</span>
		</Button>
	)

	const panelContent = (
		<div
			ref={setHoverDetailsContainer}
			className={cn("relative min-h-0", isMobile && "h-full")}
		>
			<SlidesTemplatePanelContent
				slidesState={slidesState}
				selectedTemplate={selectedTemplate}
				onTemplateClick={handleTemplateClick}
				className={cn(isMobile ? "h-full" : "h-[min(640px,70vh)] min-h-[360px]")}
				toolbarClassName={isMobile ? "px-2 pt-0" : "px-0 pt-0"}
				gridClassName={cn("min-h-0 flex-1", isMobile ? "p-2" : "p-0 pt-1")}
				hoverDetailsContainer={hoverDetailsContainer}
			/>
		</div>
	)

	const selector = isMobile ? (
		<>
			{trigger}
			<MagicPopup
				visible={open}
				onClose={() => setOpen(false)}
				className="rounded-t-[14px] border-0 bg-muted"
				bodyClassName="rounded-t-[14px] border-0 bg-muted p-0 overflow-hidden"
				handlerClassName="bg-muted-foreground mb-1.5 h-1 w-20 rounded-full"
				title={title}
			>
				<div
					className="flex h-[min(640px,calc(100vh-var(--safe-area-inset-top)-var(--safe-area-inset-bottom)-44px))] min-h-0 flex-col gap-2 overflow-hidden bg-muted"
					data-testid="slides-template-floating-selector-mobile-popup"
				>
					<div className="relative flex h-14 shrink-0 flex-row items-center justify-center">
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-card"
							style={{ boxShadow: "0px 8px 25px 0px rgba(0,0,0,0.10)" }}
							aria-label={t("playbook.edit.presets.close")}
							data-testid="slides-template-floating-selector-mobile-close"
						>
							<X className="h-[22px] w-[22px] text-foreground" />
						</button>
						<div className="max-w-[247px] truncate text-center text-lg font-semibold leading-none text-foreground">
							{title}
						</div>
					</div>
					<div className="min-h-0 flex-1 overflow-hidden px-2 pb-4">{panelContent}</div>
				</div>
			</MagicPopup>
		</>
	) : (
		<MagicDropdown
			trigger={["click"]}
			open={open}
			onOpenChange={setOpen}
			popupRender={() => panelContent}
			overlayClassName="w-[min(90vw,760px)] min-w-[360px] overflow-visible rounded-lg border border-border bg-popover p-3 shadow-xl"
		>
			{trigger}
		</MagicDropdown>
	)

	if (isCompactMobile) {
		return (
			<div className="min-w-0 flex-1 overflow-hidden">
				<FilterBar
					filters={simpleFields}
					onFilterChange={onFilterChange}
					variant={variant}
					compact={compact}
					prefix={selector}
					scrollContainerClassName="px-0 justify-start"
				/>
			</div>
		)
	}

	return (
		<div
			className={cn(
				"flex min-w-0 items-center gap-2",
				isMobile && "flex-col items-start gap-1",
			)}
		>
			<Label className="shrink-0 text-sm font-normal text-foreground">{title}</Label>
			{selector}
			{simpleFields.length > 0 ? (
				<div className="min-w-0 flex-1">
					<FilterBar
						filters={simpleFields}
						onFilterChange={onFilterChange}
						variant={variant}
						compact={compact}
						scrollContainerClassName="px-0 justify-start"
					/>
				</div>
			) : null}
		</div>
	)
}

export default SlidesTemplateFloatingSelector
