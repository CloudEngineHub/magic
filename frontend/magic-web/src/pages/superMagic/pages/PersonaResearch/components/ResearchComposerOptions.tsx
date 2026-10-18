import { useState, type KeyboardEvent, type ReactNode } from "react"
import {
	Check,
	ChevronDown,
	PencilLine,
	FlaskConical,
	LayoutTemplate,
	Repeat,
	Settings2,
	UsersRound,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { cn } from "@/utils/cn"
import {
	CUSTOM_METHOD_MAX_LENGTH,
	normalizeCustomMethod,
	PANEL_SIZE_RANGE,
	PANEL_SIZES,
	parseWholeNumber,
	RESEARCH_METHODS,
	ROUND_COUNT_RANGE,
	ROUND_COUNTS,
	type ResearchOptions,
} from "../services/researchOptions"
import { PRESSABLE } from "./surface"

/** Report template choice; `value` null is the default template. */
export interface ReportTemplateOption {
	value: string | null
	templates: { path: string; label: string }[]
	onChange: (path: string | null) => void
	onManage: () => void
}

interface ResearchComposerOptionsProps {
	value: ResearchOptions
	onChange: (value: ResearchOptions) => void
	reportTemplate?: ReportTemplateOption
	/** Extra controls after the three settings, e.g. "pick from the persona library". */
	trailing?: ReactNode
	className?: string
	/** `data-guide-anchor` for the research onboarding; only the home composer passes one. */
	guideAnchor?: string
}

/**
 * Study settings beside the composer: method, panel size, interview rounds and, on the home,
 * the report template. "Auto" leaves the choice to the AI researcher; a fixed value, preset or
 * typed in under "Custom", is sent with the first message and shown on its chip.
 */
export default function ResearchComposerOptions({
	value,
	onChange,
	reportTemplate,
	trailing,
	className,
	guideAnchor,
}: ResearchComposerOptionsProps) {
	const { t } = useTranslation("personaResearch")
	const methodLabel: Record<(typeof RESEARCH_METHODS)[number], string> = {
		auto: t("options.auto"),
		user_research: t("studyType.userResearch"),
		product_rnd: t("studyType.productRnd"),
		concept_test: t("studyType.conceptTest"),
		fast_insight: t("studyType.fastInsight"),
	}
	const panelLabel = (size: number) => t("options.panelValue", { count: size })
	const roundsLabel = (rounds: number) => t("options.roundsValue", { count: rounds })
	const isPresetPanel = (PANEL_SIZES as readonly unknown[]).includes(value.panelSize)
	const isPresetRounds = (ROUND_COUNTS as readonly unknown[]).includes(value.rounds)

	return (
		<div
			className={cn("flex flex-wrap items-center gap-2", className)}
			data-guide-anchor={guideAnchor}
		>
			<OptionMenu
				icon={<FlaskConical className="size-3.5" />}
				label={t("options.method")}
				valueLabel={
					value.method === "custom"
						? (value.customMethod ?? "")
						: methodLabel[value.method]
				}
				active={value.method !== "auto"}
				items={RESEARCH_METHODS.map((method) => ({
					key: method,
					label: methodLabel[method],
					selected: value.method === method,
					onSelect: () => onChange({ ...value, method, customMethod: undefined }),
				}))}
				custom={{
					selected: value.method === "custom",
					current: value.method === "custom" ? value.customMethod : undefined,
					placeholder: t("options.methodCustomPlaceholder"),
					maxLength: CUSTOM_METHOD_MAX_LENGTH,
					validate: () => null,
					onCommit: (draft) => {
						const customMethod = normalizeCustomMethod(draft)
						if (customMethod) onChange({ ...value, method: "custom", customMethod })
					},
				}}
			/>
			<OptionMenu
				icon={<UsersRound className="size-3.5" />}
				label={t("options.panel")}
				valueLabel={
					value.panelSize === "auto" ? t("options.auto") : panelLabel(value.panelSize)
				}
				active={value.panelSize !== "auto"}
				items={PANEL_SIZES.map((size) => ({
					key: String(size),
					label: size === "auto" ? t("options.autoPanel") : panelLabel(size),
					selected: value.panelSize === size,
					onSelect: () => onChange({ ...value, panelSize: size }),
				}))}
				custom={{
					selected: !isPresetPanel,
					current:
						!isPresetPanel && value.panelSize !== "auto"
							? panelLabel(value.panelSize)
							: undefined,
					numeric: true,
					placeholder: t("options.customRange", PANEL_SIZE_RANGE),
					validate: (draft) =>
						parseWholeNumber(draft, PANEL_SIZE_RANGE) === null
							? t("options.panelRangeError", PANEL_SIZE_RANGE)
							: null,
					onCommit: (draft) => {
						const panelSize = parseWholeNumber(draft, PANEL_SIZE_RANGE)
						if (panelSize !== null) onChange({ ...value, panelSize })
					},
				}}
			/>
			<OptionMenu
				icon={<Repeat className="size-3.5" />}
				label={t("options.rounds")}
				title={t("options.roundsTitle")}
				description={t("options.roundsHelp")}
				valueLabel={value.rounds === "auto" ? t("options.auto") : roundsLabel(value.rounds)}
				active={value.rounds !== "auto"}
				items={ROUND_COUNTS.map((rounds) => ({
					key: String(rounds),
					label: rounds === "auto" ? t("options.autoRounds") : roundsLabel(rounds),
					selected: value.rounds === rounds,
					onSelect: () => onChange({ ...value, rounds }),
				}))}
				custom={{
					selected: !isPresetRounds,
					current:
						!isPresetRounds && value.rounds !== "auto"
							? roundsLabel(value.rounds)
							: undefined,
					numeric: true,
					placeholder: t("options.customRange", ROUND_COUNT_RANGE),
					validate: (draft) =>
						parseWholeNumber(draft, ROUND_COUNT_RANGE) === null
							? t("options.roundsRangeError", ROUND_COUNT_RANGE)
							: null,
					onCommit: (draft) => {
						const rounds = parseWholeNumber(draft, ROUND_COUNT_RANGE)
						if (rounds !== null) onChange({ ...value, rounds })
					},
				}}
			/>
			{reportTemplate ? (
				<OptionMenu
					icon={<LayoutTemplate className="size-3.5" />}
					label={t("options.reportTemplate")}
					valueLabel={
						reportTemplate.templates.find((item) => item.path === reportTemplate.value)
							?.label ?? t("options.reportTemplateDefault")
					}
					active={reportTemplate.value !== null}
					items={[
						{
							key: "default",
							label: t("options.reportTemplateDefault"),
							selected: reportTemplate.value === null,
							onSelect: () => reportTemplate.onChange(null),
						},
						...reportTemplate.templates.map((item) => ({
							key: item.path,
							label: item.label,
							selected: reportTemplate.value === item.path,
							onSelect: () => reportTemplate.onChange(item.path),
						})),
					]}
					footer={{
						icon: <Settings2 className="size-4" />,
						label: t("options.manageReportTemplates"),
						onSelect: reportTemplate.onManage,
					}}
				/>
			) : null}
			{trailing}
		</div>
	)
}

interface OptionItem {
	key: string
	label: string
	selected: boolean
	onSelect: () => void
}

/** "Custom" entry under the presets: a small input inside the menu, applied on Enter. */
interface CustomEntry {
	/** The current value is custom (not a preset and not auto). */
	selected: boolean
	/** Current custom value as shown beside "Custom", e.g. "9 人". */
	current?: string
	numeric?: boolean
	placeholder: string
	maxLength?: number
	/** Error text for a non-empty draft, null when it can be applied. */
	validate: (draft: string) => string | null
	onCommit: (draft: string) => void
}

function OptionMenu({
	icon,
	label,
	title = label,
	description,
	valueLabel,
	active,
	items,
	custom,
	footer,
}: {
	icon: ReactNode
	label: string
	/** Menu heading when the chip's short label is not enough, e.g. "rounds per interviewee". */
	title?: string
	/** One quiet line under the heading that explains the setting. */
	description?: string
	valueLabel: string
	active: boolean
	items: OptionItem[]
	custom?: CustomEntry
	/** A link-like action under the choices, e.g. "manage templates". */
	footer?: { icon: ReactNode; label: string; onSelect: () => void }
}) {
	const { t } = useTranslation("personaResearch")
	const [open, setOpen] = useState(false)
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState("")
	const trimmed = draft.trim()
	const error = custom && trimmed ? custom.validate(trimmed) : null
	const canApply = Boolean(custom && trimmed && !error)

	const onOpenChange = (next: boolean) => {
		setOpen(next)
		if (!next) setEditing(false)
	}
	const startEditing = () => {
		setDraft(custom?.selected && !custom.numeric ? (custom.current ?? "") : "")
		setEditing(true)
	}
	const apply = () => {
		if (!custom || !canApply) return
		custom.onCommit(trimmed)
		onOpenChange(false)
	}
	const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		// Keep typing in the input: the menu would otherwise treat keys as typeahead or navigation.
		event.stopPropagation()
		if (event.nativeEvent.isComposing) return
		if (event.key === "Enter") {
			event.preventDefault()
			apply()
		} else if (event.key === "Escape") {
			event.preventDefault()
			setEditing(false)
		}
	}

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label={`${label}: ${valueLabel}`}
					className={cn(
						// Quiet chips inside the composer; a fixed value gets a soft fill, not solid ink.
						// Inset focus ring so a focused chip never paints over its neighbour.
						"inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/25",
						active
							? "bg-muted text-foreground"
							: "text-muted-foreground hover:bg-muted hover:text-foreground",
						PRESSABLE,
					)}
				>
					{icon}
					{/* One word per chip so all settings fit one row: the value once it is set,
					    else the setting's name; the menu header names the setting either way. */}
					<span className={cn("max-w-[10em] truncate", active && "font-medium")}>
						{active ? valueLabel : label}
					</span>
					<ChevronDown className="size-3.5 opacity-60" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className={cn("min-w-40", custom && "w-64")}>
				<DropdownMenuLabel className="flex flex-col gap-0.5 text-xs font-normal">
					<span className="text-muted-foreground">{title}</span>
					{description ? (
						<span className="leading-relaxed text-muted-foreground/80">
							{description}
						</span>
					) : null}
				</DropdownMenuLabel>
				{items.map((item) => (
					<DropdownMenuItem key={item.key} onSelect={item.onSelect}>
						<span className="flex-1">{item.label}</span>
						{item.selected ? <Check className="size-4" /> : null}
					</DropdownMenuItem>
				))}
				{custom ? (
					editing ? (
						<div className="flex flex-col gap-1.5 px-2 pb-1.5 pt-1">
							<div className="flex items-center gap-1.5">
								<Input
									autoFocus
									value={draft}
									onChange={(event) => setDraft(event.target.value)}
									onKeyDown={onInputKeyDown}
									inputMode={custom.numeric ? "numeric" : "text"}
									maxLength={custom.maxLength}
									placeholder={custom.placeholder}
									aria-label={title}
									aria-invalid={Boolean(error)}
									className="h-8 text-xs"
								/>
								<Button
									size="sm"
									className="h-8 px-2.5"
									disabled={!canApply}
									onClick={apply}
								>
									{t("options.customApply")}
								</Button>
							</div>
							{error ? (
								<span className="text-[11px] text-destructive" role="alert">
									{error}
								</span>
							) : null}
						</div>
					) : (
						<DropdownMenuItem
							onSelect={(event) => {
								// Stay open: the input replaces this row.
								event.preventDefault()
								startEditing()
							}}
						>
							<PencilLine className="size-4 text-muted-foreground" />
							<span className="flex-1 truncate">
								{custom.selected && custom.current
									? t("options.customValue", { value: custom.current })
									: t("options.custom")}
							</span>
							{custom.selected ? <Check className="size-4" /> : null}
						</DropdownMenuItem>
					)
				) : null}
				{footer ? (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							className="text-muted-foreground"
							onSelect={footer.onSelect}
						>
							{footer.icon}
							{footer.label}
						</DropdownMenuItem>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
