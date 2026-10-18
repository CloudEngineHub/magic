import type { ReactNode } from "react"
import {
	Check,
	ChevronDown,
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
import { cn } from "@/utils/cn"
import {
	PANEL_SIZES,
	RESEARCH_METHODS,
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
}

/**
 * Study settings beside the composer: method, panel size, interview rounds and, on the home,
 * the report template. "Auto" leaves
 * the choice to the AI researcher; a fixed value is sent with the first message and shown in
 * solid ink so a deliberate setting is easy to spot.
 */
export default function ResearchComposerOptions({
	value,
	onChange,
	reportTemplate,
	trailing,
	className,
}: ResearchComposerOptionsProps) {
	const { t } = useTranslation("personaResearch")
	const methodLabel: Record<(typeof RESEARCH_METHODS)[number], string> = {
		auto: t("options.auto"),
		user_research: t("studyType.userResearch"),
		product_rnd: t("studyType.productRnd"),
		concept_test: t("studyType.conceptTest"),
		fast_insight: t("studyType.fastInsight"),
	}

	return (
		<div className={cn("flex flex-wrap items-center gap-2", className)}>
			<OptionMenu
				icon={<FlaskConical className="size-3.5" />}
				label={t("options.method")}
				valueLabel={methodLabel[value.method]}
				active={value.method !== "auto"}
				items={RESEARCH_METHODS.map((method) => ({
					key: method,
					label: methodLabel[method],
					selected: value.method === method,
					onSelect: () => onChange({ ...value, method }),
				}))}
			/>
			<OptionMenu
				icon={<UsersRound className="size-3.5" />}
				label={t("options.panel")}
				valueLabel={
					value.panelSize === "auto"
						? t("options.auto")
						: t("options.panelValue", { count: value.panelSize })
				}
				active={value.panelSize !== "auto"}
				items={PANEL_SIZES.map((size) => ({
					key: String(size),
					label:
						size === "auto"
							? t("options.autoPanel")
							: t("options.panelValue", { count: size }),
					selected: value.panelSize === size,
					onSelect: () => onChange({ ...value, panelSize: size }),
				}))}
			/>
			<OptionMenu
				icon={<Repeat className="size-3.5" />}
				label={t("options.rounds")}
				valueLabel={
					value.rounds === "auto"
						? t("options.auto")
						: t("options.roundsValue", { count: value.rounds })
				}
				active={value.rounds !== "auto"}
				items={ROUND_COUNTS.map((rounds) => ({
					key: String(rounds),
					label:
						rounds === "auto"
							? t("options.autoRounds")
							: t("options.roundsValue", { count: rounds }),
					selected: value.rounds === rounds,
					onSelect: () => onChange({ ...value, rounds }),
				}))}
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

function OptionMenu({
	icon,
	label,
	valueLabel,
	active,
	items,
	footer,
}: {
	icon: ReactNode
	label: string
	valueLabel: string
	active: boolean
	items: OptionItem[]
	/** A link-like action under the choices, e.g. "manage templates". */
	footer?: { icon: ReactNode; label: string; onSelect: () => void }
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
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
					<span className="text-muted-foreground">{label}</span>
					<span className={cn("max-w-[10em] truncate", active && "font-medium")}>
						{valueLabel}
					</span>
					<ChevronDown className="size-3.5 opacity-60" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-40">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					{label}
				</DropdownMenuLabel>
				{items.map((item) => (
					<DropdownMenuItem key={item.key} onSelect={item.onSelect}>
						<span className="flex-1">{item.label}</span>
						{item.selected ? <Check className="size-4" /> : null}
					</DropdownMenuItem>
				))}
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
