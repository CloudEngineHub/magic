import { useState } from "react"
import { ChevronDown, ClipboardList, Flag, ListChecks, Target } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/shadcn-ui/collapsible"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import type { GuideIssue, HypothesisVerdict, QuoteRef, StudyHypothesis } from "../types"
import { AgreementBadge, QuoteItem, SourceChip, VerdictBadge } from "./ResearchBadges"
import { CARD_SURFACE, VERDICT_ACCENT } from "./surface"

interface HypothesisBoardProps {
	onOpenQuote: (quote: Pick<QuoteRef, "persona_id" | "round_index" | "file">) => void
	onOpenSources?: () => void
}

/**
 * Hypotheses first: what the study set out to test, how each one was judged and the evidence
 * behind it. Study design (quota and the interview-guide self-check) is folded below.
 */
function HypothesisBoard({ onOpenQuote, onOpenSources }: HypothesisBoardProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const study = store.study
	const hypotheses = study?.hypotheses ?? []

	if (!study || hypotheses.length === 0) {
		return (
			<Empty className="h-full border-0 py-12">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Target />
					</EmptyMedia>
					<EmptyTitle className="text-sm">{t("hypothesis.emptyTitle")}</EmptyTitle>
					<EmptyDescription className="text-xs">
						{study ? t("hypothesis.emptyLegacy") : t("hypothesis.empty")}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	return (
		<ScrollArea className="h-full">
			<div className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
				{study.decision ? (
					<div className={cn(CARD_SURFACE, "flex items-start gap-3 p-4")}>
						<span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
							<Flag className="size-4" />
						</span>
						<div className="flex flex-col gap-0.5">
							<span className="text-[11px] font-medium text-muted-foreground">
								{t("hypothesis.decision")}
							</span>
							<span className="text-[15px] font-medium leading-6 text-foreground">
								{study.decision}
							</span>
						</div>
					</div>
				) : null}
				<VerdictOverview hypotheses={hypotheses} />
				<ol className="flex flex-col gap-3">
					{hypotheses.map((hypothesis) => (
						<HypothesisCard
							key={hypothesis.id}
							hypothesis={hypothesis}
							onOpenQuote={onOpenQuote}
							onOpenSources={onOpenSources}
						/>
					))}
				</ol>
				<StudyDesign />
			</div>
		</ScrollArea>
	)
}

const HypothesisCard = observer(function HypothesisCard({
	hypothesis,
	onOpenQuote,
	onOpenSources,
}: {
	hypothesis: StudyHypothesis
	onOpenQuote: HypothesisBoardProps["onOpenQuote"]
	onOpenSources?: () => void
}) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	// Collapsed by default: the verdict colour and a one-line reason are enough to scan.
	const [expanded, setExpanded] = useState(false)
	const quotes = (hypothesis.evidence_refs ?? []).filter((ref) => ref.kind === "quote")
	const sources = (hypothesis.evidence_refs ?? []).filter((ref) => ref.kind === "source")

	return (
		<li className={cn(CARD_SURFACE, "relative overflow-hidden")}>
			<span
				aria-hidden
				className={cn("absolute inset-y-0 left-0 w-1", VERDICT_ACCENT[hypothesis.verdict])}
			/>
			<Collapsible open={expanded} onOpenChange={setExpanded}>
				<CollapsibleTrigger asChild>
					<button
						type="button"
						className="flex w-full items-start gap-3 rounded-xl py-4 pl-5 pr-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span className="mt-0.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted-foreground">
							{hypothesis.id}
						</span>
						<span className="flex min-w-0 flex-1 flex-col gap-2">
							<span className="text-sm font-medium leading-6 text-foreground">
								{hypothesis.statement}
							</span>
							<span className="flex flex-wrap items-center gap-1.5">
								<VerdictBadge verdict={hypothesis.verdict} />
								{hypothesis.validation ? (
									<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
										{t("hypothesis.realPeople")}
										<AgreementBadge agreement={hypothesis.validation.verdict} />
									</span>
								) : null}
							</span>
							{!expanded && hypothesis.verdict_reason ? (
								<span className="line-clamp-2 text-xs leading-5 text-muted-foreground">
									{hypothesis.verdict_reason}
								</span>
							) : null}
						</span>
						<ChevronDown
							className={cn(
								"mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
								expanded && "rotate-180",
							)}
						/>
					</button>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<div className="flex flex-col gap-3 border-t border-border/60 pb-4 pl-5 pr-4 pt-3 text-xs">
						{hypothesis.support_criteria || hypothesis.refute_criteria ? (
							<div className="grid gap-2 sm:grid-cols-2">
								{hypothesis.support_criteria ? (
									<Criteria
										tone="support"
										label={t("hypothesis.supportIf")}
										text={hypothesis.support_criteria}
									/>
								) : null}
								{hypothesis.refute_criteria ? (
									<Criteria
										tone="refute"
										label={t("hypothesis.refuteIf")}
										text={hypothesis.refute_criteria}
									/>
								) : null}
							</div>
						) : null}
						{hypothesis.verdict_reason ? (
							<p className="leading-5 text-foreground">
								<span className="font-medium">{t("hypothesis.reason")}</span>
								{hypothesis.verdict_reason}
							</p>
						) : null}
						{hypothesis.validation?.summary ? (
							<p className="leading-5 text-foreground">
								<span className="font-medium">
									{t("hypothesis.validationSummary")}
								</span>
								{hypothesis.validation.summary}
							</p>
						) : null}
						{quotes.length ? (
							<div className="flex flex-col gap-1.5">
								{quotes.map((ref, index) =>
									ref.kind === "quote" ? (
										<QuoteItem
											key={index}
											quote={ref}
											personaName={
												store.personaById(ref.persona_id)?.name ??
												ref.persona_id
											}
											onOpen={() => onOpenQuote(ref)}
										/>
									) : null,
								)}
							</div>
						) : null}
						{sources.length ? (
							<div className="flex flex-wrap gap-1.5">
								{sources.map((ref, index) =>
									ref.kind === "source" ? (
										<SourceChip
											key={index}
											sourceRef={ref.ref}
											onOpen={onOpenSources}
										/>
									) : null,
								)}
							</div>
						) : null}
					</div>
				</CollapsibleContent>
			</Collapsible>
		</li>
	)
})

/** Verdicts in reading order: conclusions first, open questions last. */
const VERDICT_ORDER: HypothesisVerdict[] = [
	"supported",
	"mixed",
	"refuted",
	"insufficient",
	"pending",
]

/** One glance at the outcome: a stacked bar of verdicts with counts, before any card is read. */
function VerdictOverview({ hypotheses }: { hypotheses: StudyHypothesis[] }) {
	const { t } = useTranslation("personaResearch")
	const decided = hypotheses.filter((item) => item.verdict !== "pending").length
	const counts = VERDICT_ORDER.map((verdict) => ({
		verdict,
		count: hypotheses.filter((item) => item.verdict === verdict).length,
	})).filter((item) => item.count > 0)
	const label: Record<HypothesisVerdict, string> = {
		supported: t("verdict.supported"),
		mixed: t("verdict.mixed"),
		refuted: t("verdict.refuted"),
		insufficient: t("verdict.insufficient"),
		pending: t("verdict.pending"),
	}

	return (
		<div className={cn(CARD_SURFACE, "flex flex-col gap-3 p-4")}>
			<div className="flex items-baseline justify-between gap-3">
				<span className="text-sm font-semibold text-foreground">
					{t("hypothesis.progress", { decided, total: hypotheses.length })}
				</span>
				<span className="text-[11px] text-muted-foreground">
					{t("hypothesis.ruleHint")}
				</span>
			</div>
			<div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
				{counts.map(({ verdict, count }) => (
					<span
						key={verdict}
						className={cn("h-full", VERDICT_ACCENT[verdict])}
						style={{ flexGrow: count }}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{counts.map(({ verdict, count }) => (
					<span key={verdict} className="inline-flex items-center gap-1.5">
						<span className={cn("size-2 rounded-full", VERDICT_ACCENT[verdict])} />
						{label[verdict]}
						<span className="font-medium tabular-nums text-foreground">{count}</span>
					</span>
				))}
			</div>
		</div>
	)
}

function Criteria({
	tone,
	label,
	text,
}: {
	tone: "support" | "refute"
	label: string
	text: string
}) {
	return (
		<div
			className={cn(
				"rounded-lg p-2.5 leading-5",
				tone === "support" ? "bg-emerald-500/[0.07]" : "bg-destructive/[0.06]",
			)}
		>
			<div
				className={cn(
					"mb-0.5 text-[11px] font-medium",
					tone === "support"
						? "text-emerald-700 dark:text-emerald-400"
						: "text-destructive",
				)}
			>
				{label}
			</div>
			<div className="text-foreground">{text}</div>
		</div>
	)
}

/** Quota table and interview-guide self-check, collapsed by default to keep hypotheses in focus. */
const StudyDesign = observer(function StudyDesign() {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const quota = store.study?.quota ?? []
	const guideItems = store.study?.guide_review?.items ?? []
	if (quota.length === 0 && guideItems.length === 0) return null

	const issueLabel: Record<GuideIssue, string> = {
		leading: t("guide.leading"),
		double_barreled: t("guide.doubleBarreled"),
		hypothesis_reveal: t("guide.hypothesisReveal"),
		jargon: t("guide.jargon"),
	}
	// Actual personas per segment come from the study panel's selection.
	const actualBySegment = new Map<string, number>()
	for (const item of store.studyPanel?.selection ?? []) {
		if (item.segment)
			actualBySegment.set(item.segment, (actualBySegment.get(item.segment) ?? 0) + 1)
	}

	return (
		<Collapsible className="rounded-xl border border-dashed border-border bg-card/60">
			<CollapsibleTrigger asChild>
				<button
					type="button"
					className="group flex w-full items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ClipboardList className="size-4 text-muted-foreground" />
					{t("design.title")}
					<span className="text-xs font-normal text-muted-foreground">
						{guideItems.length
							? t("design.guideFixed", { count: guideItems.length })
							: ""}
					</span>
					<ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
				</button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="flex flex-col gap-4 px-4 pb-4 text-xs">
					{quota.length ? (
						<section className="flex flex-col gap-2">
							<h4 className="font-medium text-muted-foreground">
								{t("design.quota")}
							</h4>
							<table className="w-full border-collapse">
								<thead>
									<tr className="text-left text-muted-foreground">
										<th className="border-b border-border py-1.5 font-normal">
											{t("design.segment")}
										</th>
										<th className="border-b border-border py-1.5 font-normal">
											{t("design.criteria")}
										</th>
										<th className="border-b border-border py-1.5 text-right font-normal">
											{t("design.planned")}
										</th>
										<th className="border-b border-border py-1.5 text-right font-normal">
											{t("design.actual")}
										</th>
									</tr>
								</thead>
								<tbody>
									{quota.map((row) => {
										const actual = actualBySegment.get(row.segment)
										return (
											<tr key={row.segment}>
												<td className="border-b border-border py-1.5 pr-2">
													{row.segment}
												</td>
												<td className="border-b border-border py-1.5 pr-2 text-muted-foreground">
													{row.criteria}
												</td>
												<td className="border-b border-border py-1.5 text-right tabular-nums">
													{row.count}
												</td>
												<td
													className={cn(
														"border-b border-border py-1.5 text-right tabular-nums",
														actual !== undefined &&
															actual < row.count &&
															"text-amber-600",
													)}
												>
													{actual ?? "—"}
												</td>
											</tr>
										)
									})}
								</tbody>
							</table>
						</section>
					) : null}
					{guideItems.length ? (
						<section className="flex flex-col gap-2">
							<h4 className="flex items-center gap-1.5 font-medium text-muted-foreground">
								<ListChecks className="size-3.5" />
								{t("design.guideReview")}
							</h4>
							<ul className="flex flex-col gap-2">
								{guideItems.map((item, index) => (
									<li
										key={index}
										className="rounded-lg bg-muted/50 p-2.5 leading-5"
									>
										<span className="mb-1 inline-block rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
											{issueLabel[item.issue]}
										</span>
										<p className="text-muted-foreground line-through">
											{item.before}
										</p>
										<p className="text-foreground">{item.after}</p>
									</li>
								))}
							</ul>
						</section>
					) : null}
				</div>
			</CollapsibleContent>
		</Collapsible>
	)
})

export default observer(HypothesisBoard)
