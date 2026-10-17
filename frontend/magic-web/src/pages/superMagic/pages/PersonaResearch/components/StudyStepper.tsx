import { Check, Loader2, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import { resolvePhaseStatuses } from "../services/researchFiles"
import type { StudyFile, StudyPhaseKey, StudyPhaseStatus } from "../types"

interface StudyStepperProps {
	study: StudyFile | null
	compact?: boolean
}

/** Six-step research progress driven by study.json; shows all steps pending before the file exists. */
export default function StudyStepper({ study, compact = false }: StudyStepperProps) {
	const { t } = useTranslation("personaResearch")
	const labels: Record<StudyPhaseKey, string> = {
		clarify: t("phase.clarify"),
		plan: t("phase.plan"),
		desk_research: t("phase.deskResearch"),
		interview: t("phase.interview"),
		report: t("phase.report"),
		validation: t("phase.validation"),
	}
	const steps = resolvePhaseStatuses(study)

	return (
		<ol
			className={cn("flex w-full items-center", compact ? "gap-1" : "gap-2")}
			data-testid="persona-research-stepper"
		>
			{steps.map((step, index) => (
				<li key={step.key} className="flex min-w-0 flex-1 items-center gap-2">
					<StepDot status={step.status} index={index} />
					{compact ? null : (
						<span
							className={cn(
								"truncate text-xs",
								step.status === "running"
									? "font-medium text-foreground"
									: "text-muted-foreground",
							)}
						>
							{labels[step.key]}
						</span>
					)}
					{index < steps.length - 1 ? (
						<span
							className={cn(
								"h-px min-w-3 flex-1",
								step.status === "done" ? "bg-primary" : "bg-border",
							)}
						/>
					) : null}
				</li>
			))}
		</ol>
	)
}

function StepDot({ status, index }: { status: StudyPhaseStatus; index: number }) {
	const base = "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px]"
	if (status === "done") {
		return (
			<span className={cn(base, "bg-primary text-primary-foreground")}>
				<Check className="size-3" />
			</span>
		)
	}
	if (status === "running") {
		return (
			<span className={cn(base, "border border-primary text-primary")}>
				<Loader2 className="size-3 animate-spin" />
			</span>
		)
	}
	if (status === "failed") {
		return (
			<span className={cn(base, "bg-destructive text-destructive-foreground")}>
				<X className="size-3" />
			</span>
		)
	}
	return (
		<span
			className={cn(
				base,
				"border border-border text-muted-foreground",
				status === "skipped" && "border-dashed",
			)}
		>
			{index + 1}
		</span>
	)
}
