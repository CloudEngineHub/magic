import { ChevronRight, Ellipsis, Trash2 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import MagicTooltip from "@/components/base/MagicTooltip"
import dayjs from "@/infrastructure/vendors/dayjs"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import { resolveStudyStatus } from "../services/studyStatus"
import type { StudyFile } from "../types"
import {
	StudyProgressSegments,
	StudyStatusBadge,
	StudyStatusBadgeSkeleton,
} from "./StudyStatusBadge"

interface StudyListItemProps {
	topic: Topic
	onOpen: (topic: Topic) => void
	onDelete: (topic: Topic) => void
}

/**
 * One study row: title with method and scale, outcome (verdict mix or progress), status and
 * relative update time.
 * Studies waiting for the user's answer get a subtle highlight so they are found first.
 */
function StudyListItem({ topic, onOpen, onDelete }: StudyListItemProps) {
	const { t, i18n } = useTranslation("personaResearch")
	// Instance locale, so the row does not inherit another component's global dayjs locale.
	const dayjsLocale = i18n.language.toLowerCase().startsWith("zh") ? "zh-cn" : "en"
	const store = usePersonaResearchStore()
	const study = store.studyFileOf(topic)
	const status = resolveStudyStatus(topic, study)
	const title = store.studyTitleOf(topic) || t("study.untitled")
	const isPersonaBuild = study?.study_type === "persona_build"

	const studyTypeLabel = study?.study_type
		? {
				user_research: t("studyType.userResearch"),
				product_rnd: t("studyType.productRnd"),
				concept_test: t("studyType.conceptTest"),
				fast_insight: t("studyType.fastInsight"),
				panel_only: t("studyType.panelOnly"),
				persona_build: t("studyType.personaBuild"),
			}[study.study_type]
		: null
	const meta = [
		studyTypeLabel,
		study?.limits?.personas && !isPersonaBuild
			? t("study.scale", {
					personas: study.limits.personas,
					rounds: study.limits.interview_rounds ?? 5,
				})
			: null,
	]
		.filter(Boolean)
		.join(" · ")
	const hasVerdicts = Boolean(
		study?.hypotheses?.some(
			(item) => item.verdict !== "pending" && item.verdict !== "insufficient",
		),
	)

	return (
		<li
			className={cn(
				// Columns as in the prototype: study, outcome, status, time, actions.
				"group flex items-center gap-5 px-1 py-3.5 transition-colors hover:bg-muted/40",
				status.kind === "waiting_user" && "bg-amber-500/[0.06]",
			)}
		>
			<button
				type="button"
				className="flex min-w-0 flex-1 flex-col gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={() => onOpen(topic)}
			>
				<span className="truncate text-[14.5px] font-medium text-foreground">{title}</span>
				{store.studyFilesReady ? (
					<span className="truncate text-xs text-muted-foreground">
						{meta ||
							t("study.progress", { done: status.completed, total: status.total })}
					</span>
				) : (
					<Skeleton className="h-3 w-40" />
				)}
			</button>
			{/* Outcome column: verdict mix once concluded, otherwise how far the study got. */}
			<span className="hidden w-44 shrink-0 md:block">
				{!store.studyFilesReady ? (
					<Skeleton className="h-1.5 w-full" />
				) : hasVerdicts && study ? (
					<VerdictSummary study={study} />
				) : isPersonaBuild ? null : (
					<span className="flex flex-col gap-1.5">
						<StudyProgressSegments status={status} className="w-full" />
						<span className="text-xs tabular-nums text-muted-foreground">
							{t("study.progress", { done: status.completed, total: status.total })}
						</span>
					</span>
				)}
			</span>
			<span className="hidden w-20 shrink-0 sm:block">
				{store.studyFilesReady ? (
					<StudyStatusBadge status={status} />
				) : (
					<StudyStatusBadgeSkeleton />
				)}
			</span>
			<span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:block">
				{topic.updated_at ? dayjs(topic.updated_at).locale(dayjsLocale).fromNow() : null}
			</span>
			<DropdownMenu>
				<MagicTooltip title={t("home.moreActions")}>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 opacity-60 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
							aria-label={t("home.moreActions")}
						>
							<Ellipsis className="size-4" />
						</Button>
					</DropdownMenuTrigger>
				</MagicTooltip>
				<DropdownMenuContent align="end">
					<DropdownMenuItem className="text-destructive" onSelect={() => onDelete(topic)}>
						<Trash2 className="size-4" />
						{t("home.delete")}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<ChevronRight
				aria-hidden
				className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
			/>
		</li>
	)
}

/** Verdict mix of a study's hypotheses: what the study concluded, readable from the list. */
function VerdictSummary({ study }: { study: StudyFile }) {
	const { t } = useTranslation("personaResearch")
	const hypotheses = study.hypotheses ?? []
	const supported = hypotheses.filter((item) => item.verdict === "supported").length
	const mixed = hypotheses.filter((item) => item.verdict === "mixed").length
	const refuted = hypotheses.filter((item) => item.verdict === "refuted").length
	if (supported + mixed + refuted === 0) return null
	const parts = [
		{ count: supported, className: "bg-emerald-600", label: t("verdict.supported") },
		{ count: mixed, className: "bg-amber-500", label: t("verdict.mixed") },
		{ count: refuted, className: "bg-rose-500", label: t("verdict.refuted") },
	].filter((part) => part.count > 0)
	return (
		<span className="flex flex-col gap-1.5">
			<span className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
				{parts.map((part) => (
					<span
						key={part.label}
						className={part.className}
						style={{ flexGrow: part.count }}
					/>
				))}
			</span>
			<span className="truncate text-xs text-muted-foreground">
				{parts.map((part) => `${part.count} ${part.label}`).join(" · ")}
			</span>
		</span>
	)
}

export default observer(StudyListItem)
