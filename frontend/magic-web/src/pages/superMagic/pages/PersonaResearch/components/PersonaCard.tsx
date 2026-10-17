import { useTranslation } from "react-i18next"
import { Badge } from "@/components/shadcn-ui/badge"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/utils/cn"
import type { InterviewFile, PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"

interface PersonaCardProps {
	persona: PersonaFile
	interviewStatus?: InterviewFile["status"]
	selectable?: boolean
	selected?: boolean
	onSelectedChange?: (selected: boolean) => void
	onOpen: () => void
}

/** Persona summary card used by the study panel and the persona library. */
export default function PersonaCard({
	persona,
	interviewStatus,
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
	const statusLabel = interviewStatus
		? {
				done: t("persona.interviewDone"),
				running: t("persona.interviewRunning"),
				failed: t("persona.interviewFailed"),
			}[interviewStatus]
		: null

	return (
		<div
			className={cn(
				"group relative flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/50",
				selected && "border-primary",
			)}
			data-testid="persona-research-persona-card"
		>
			{selectable ? (
				<Checkbox
					className="absolute right-3 top-3"
					checked={selected}
					onCheckedChange={(value) => onSelectedChange?.(value === true)}
					aria-label={t("persona.select", { name: persona.name })}
				/>
			) : null}
			<button
				type="button"
				className="flex items-start gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onOpen}
			>
				<PersonaAvatar id={persona.id} name={persona.name} />
				<span className="min-w-0 flex-1 pr-6">
					<span className="block truncate text-sm font-medium text-foreground">
						{persona.name}
					</span>
					{persona.tagline ? (
						<span className="line-clamp-2 text-xs text-muted-foreground">
							{persona.tagline}
						</span>
					) : null}
				</span>
			</button>
			<div className="flex flex-wrap gap-1">
				{(persona.tags ?? []).slice(0, 3).map((tag) => (
					<Badge key={tag} variant="secondary" className="font-normal">
						{tag}
					</Badge>
				))}
			</div>
			<div className="flex items-center justify-between text-[11px] text-muted-foreground">
				<span>{tierLabel}</span>
				{statusLabel ? (
					<span
						className={cn(
							interviewStatus === "failed" && "text-destructive",
							interviewStatus === "done" && "text-primary",
						)}
					>
						{statusLabel}
					</span>
				) : null}
			</div>
		</div>
	)
}
