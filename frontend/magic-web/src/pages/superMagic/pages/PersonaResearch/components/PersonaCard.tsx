import { CircleAlert, CircleCheck, Loader2, Target } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/utils/cn"
import type { InterviewFile, PersonaFile, PersonaTier } from "../types"
import PersonaAvatar from "./PersonaAvatar"
import { CARD_SURFACE } from "./surface"

interface PersonaCardProps {
	persona: PersonaFile
	interviewStatus?: InterviewFile["status"]
	/** First quote from this persona's interview, shown as a teaser once available. */
	quote?: string
	/** Why the current study picked this persona (study panel selection). */
	reason?: string
	selectable?: boolean
	selected?: boolean
	onSelectedChange?: (selected: boolean) => void
	onOpen: () => void
}

/** Ring colour encodes evidence strength so users can judge a persona at a glance. */
export const PERSONA_TIER_RING: Record<PersonaTier, string> = {
	evidence_based: "ring-emerald-500/60",
	imported: "ring-sky-500/60",
	generated: "ring-border",
}

/** Persona summary card used by the study panel and the persona library. */
export default function PersonaCard({
	persona,
	interviewStatus,
	quote,
	reason,
	selectable = false,
	selected = false,
	onSelectedChange,
	onOpen,
}: PersonaCardProps) {
	const { t } = useTranslation("personaResearch")
	const tierLabel = {
		generated: t("persona.tier.generated"),
		evidence_based: t("persona.tier.evidenceBased"),
		imported: t("persona.tier.imported"),
	}[persona.tier]

	return (
		<div
			className={cn(
				CARD_SURFACE,
				"group relative flex h-full flex-col gap-3 p-4 text-left",
				"transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none motion-reduce:transition-none",
				selected ? "ring-2 ring-primary" : "hover:ring-primary/30",
			)}
			data-testid="persona-research-persona-card"
		>
			{selectable ? (
				<Checkbox
					className="absolute right-3 top-3 z-10 bg-background"
					checked={selected}
					onCheckedChange={(value) => onSelectedChange?.(value === true)}
					aria-label={t("persona.select", { name: persona.name })}
				/>
			) : null}
			{/* The whole body opens details; the checkbox above stays a separate control. */}
			<button
				type="button"
				className="flex flex-1 flex-col gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onOpen}
			>
				<span className="flex items-start gap-2.5">
					<PersonaAvatar
						id={persona.id}
						name={persona.name}
						className={cn(
							"size-10 ring-2 ring-offset-2 ring-offset-card",
							PERSONA_TIER_RING[persona.tier],
						)}
					/>
					<span className="min-w-0 flex-1 pr-6">
						<span className="block truncate text-sm font-semibold text-foreground">
							{persona.name}
						</span>
						{persona.tagline ? (
							<span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
								{persona.tagline}
							</span>
						) : null}
					</span>
				</span>
				{reason ? (
					<span className="flex gap-1.5 text-xs leading-5 text-muted-foreground">
						<Target className="mt-0.5 size-3 shrink-0" />
						<span className="line-clamp-1">{reason}</span>
					</span>
				) : null}
				{quote ? (
					<span className="relative rounded-lg bg-muted/60 py-2 pl-3 pr-2.5 text-[13px] leading-5 text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary/30">
						<span className="line-clamp-2">“{quote}”</span>
					</span>
				) : null}
				{persona.tags?.length ? (
					<span className="flex flex-wrap gap-1">
						{persona.tags.slice(0, 2).map((tag) => (
							<span
								key={tag}
								className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
							>
								{tag}
							</span>
						))}
					</span>
				) : null}
			</button>
			<div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
				<span className="rounded-full bg-muted px-2 py-0.5">
					{tierLabel} · {t("persona.aiSimulated")}
				</span>
				{interviewStatus ? <InterviewStatusChip status={interviewStatus} /> : null}
			</div>
		</div>
	)
}

/** Interview progress chip shared by persona cards and the interview list. */
export function InterviewStatusChip({ status }: { status: InterviewFile["status"] }) {
	const { t } = useTranslation("personaResearch")
	if (status === "done") {
		return (
			<span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
				<CircleCheck className="size-3.5" />
				{t("persona.interviewDone")}
			</span>
		)
	}
	if (status === "failed") {
		return (
			<span className="inline-flex items-center gap-1 text-destructive">
				<CircleAlert className="size-3.5" />
				{t("persona.interviewFailed")}
			</span>
		)
	}
	return (
		<span className="inline-flex items-center gap-1 text-primary">
			<Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
			{t("persona.interviewRunning")}
		</span>
	)
}
