import type { ReactNode } from "react"
import { Check, ChevronDown, FlaskConical, Repeat, UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
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

interface ResearchComposerOptionsProps {
	value: ResearchOptions
	onChange: (value: ResearchOptions) => void
	/** Extra controls after the three settings, e.g. "pick from the persona library". */
	trailing?: ReactNode
	className?: string
}

/**
 * Study settings beside the composer: method, panel size and interview rounds. "Auto" leaves
 * the choice to the AI researcher; a fixed value is sent with the first message and shown in
 * solid ink so a deliberate setting is easy to spot.
 */
export default function ResearchComposerOptions({
	value,
	onChange,
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
		<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
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
}: {
	icon: ReactNode
	label: string
	valueLabel: string
	active: boolean
	items: OptionItem[]
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs outline-none ring-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring",
						active
							? "bg-foreground text-background ring-foreground"
							: "bg-background text-muted-foreground ring-border hover:bg-muted hover:text-foreground",
						PRESSABLE,
					)}
				>
					{icon}
					<span className={cn(!active && "text-muted-foreground/80")}>{label}</span>
					<span className="font-medium">{valueLabel}</span>
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
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
