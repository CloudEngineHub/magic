import { useRef, useState } from "react"
import { useSize } from "ahooks"
import {
	ArrowRight,
	ChevronDown,
	ClipboardList,
	Flag,
	Link2,
	ListChecks,
	Quote,
	Target,
	TriangleAlert,
} from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import MagicTooltip from "@/components/base/MagicTooltip"
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
import {
	hypothesisStanceGroups,
	leadQuote,
	quotedPersonaIds,
	sourceRefs,
	type QuoteEvidence,
	type StanceGroup,
	type VoiceStance,
} from "../services/hypothesisVoices"
import type { GuideIssue, HypothesisVerdict, QuoteRef, StudyHypothesis } from "../types"
import PersonaAvatar from "./PersonaAvatar"
import { personaTone } from "./personaPortrait"
import { AgreementBadge, QuoteItem, VerdictBadge } from "./ResearchBadges"
import { VERDICT_ACCENT } from "./surface"

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
	// Width decides whether lead quotes sit beside conclusions; the console panel is resizable,
	// so this follows the board's own width (container queries need Chrome 105+).
	const boardRef = useRef<HTMLDivElement>(null)
	const wide = (useSize(boardRef)?.width ?? 0) >= 720

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
			<div ref={boardRef} className="mx-auto flex max-w-5xl flex-col gap-3.5 px-6 pb-12 pt-6">
				<section
					className={cn(
						"grid gap-6 rounded-xl bg-muted/40 p-5 ring-1 ring-border",
						wide && study.decision && "grid-cols-[minmax(0,1fr)_240px] gap-7",
					)}
				>
					{study.decision ? (
						<div className="flex flex-col gap-1.5">
							<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Flag className="size-3.5" />
								{t("hypothesis.decision")}
							</span>
							<p className="text-pretty text-base font-medium leading-7 text-foreground">
								{study.decision}
							</p>
						</div>
					) : null}
					<VerdictOverview
						hypotheses={hypotheses}
						className={cn(wide && study.decision && "border-l border-border pl-6")}
					/>
				</section>
				<ol className="flex flex-col gap-3.5">
					{hypotheses.map((hypothesis, index) => (
						<HypothesisCard
							key={hypothesis.id}
							hypothesis={hypothesis}
							wide={wide}
							defaultOpen={index === 0}
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

/** Labels and dot colours for stance groups; semantic colours stay separate from persona tones. */
function useStanceLabels() {
	const { t } = useTranslation("personaResearch")
	return {
		support: { label: t("hypothesis.stance.support"), dot: "bg-emerald-600" },
		partial: { label: t("hypothesis.stance.partial"), dot: "bg-amber-500" },
		oppose: { label: t("hypothesis.stance.oppose"), dot: "bg-rose-500" },
		none: { label: t("hypothesis.stance.none"), dot: "bg-muted-foreground/40" },
	} satisfies Record<VoiceStance, { label: string; dot: string }>
}

const HypothesisCard = observer(function HypothesisCard({
	hypothesis,
	wide,
	defaultOpen,
	onOpenQuote,
	onOpenSources,
}: {
	hypothesis: StudyHypothesis
	/** Board is wide enough to put the lead quote beside the conclusion instead of below it. */
	wide: boolean
	defaultOpen: boolean
	onOpenQuote: HypothesisBoardProps["onOpenQuote"]
	onOpenSources?: () => void
}) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const stanceLabels = useStanceLabels()
	// The first card opens with its criteria so readers see how verdicts are judged.
	const [expanded, setExpanded] = useState(defaultOpen)
	const lead = leadQuote(hypothesis)
	const sources = sourceRefs(hypothesis)
	const moreQuotes = (hypothesis.evidence_refs ?? []).filter(
		(ref): ref is QuoteEvidence => ref.kind === "quote" && ref !== lead,
	)
	const panelIds = store.studyPersonas.map((persona) => persona.id)
	const groups: StanceGroup[] = hypothesisStanceGroups(
		hypothesis,
		store.synthesis?.themes ?? [],
		panelIds,
	) ?? [{ stance: "support", personaIds: quotedPersonaIds(hypothesis) }]
	const hasStance = Boolean(
		store.synthesis?.themes.some((theme) => theme.hypothesis_ids?.includes(hypothesis.id)),
	)
	const hasDetails = Boolean(
		hypothesis.support_criteria ||
		hypothesis.refute_criteria ||
		hypothesis.validation?.summary ||
		moreQuotes.length,
	)

	return (
		<li
			className={cn(
				"grid overflow-hidden rounded-2xl bg-card ring-1 ring-border",
				lead && wide && "grid-cols-[minmax(0,1fr)_300px]",
			)}
		>
			<div className="flex min-w-0 flex-col gap-3 px-[22px] pb-[18px] pt-5">
				<div className="flex flex-wrap items-center gap-2">
					<span className="font-mono text-xs text-muted-foreground">{hypothesis.id}</span>
					<VerdictBadge verdict={hypothesis.verdict} />
					{hypothesis.validation ? (
						<span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
							{t("hypothesis.realPeople")}
							<AgreementBadge agreement={hypothesis.validation.verdict} />
						</span>
					) : null}
					<span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
						{sources.length ? (
							<>
								<Link2 className="size-3.5" />
								{t("hypothesis.sourceCount", { count: sources.length })}
							</>
						) : (
							<>
								<TriangleAlert className="size-3.5" />
								{t("hypothesis.aiOnly")}
							</>
						)}
					</span>
					{hasDetails ? (
						<button
							type="button"
							className="ml-auto inline-flex items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
							aria-expanded={expanded}
							onClick={() => setExpanded((open) => !open)}
						>
							{expanded ? t("hypothesis.hideDetails") : t("hypothesis.showDetails")}
							<ChevronDown
								className={cn(
									"size-3.5 transition-transform",
									expanded && "rotate-180",
								)}
							/>
						</button>
					) : null}
				</div>
				<h3 className="text-pretty text-base font-bold leading-7 tracking-tight text-foreground">
					{hypothesis.statement}
				</h3>
				{hypothesis.verdict_reason ? (
					<p className="text-[13.5px] leading-7 text-muted-foreground">
						{hypothesis.verdict_reason}
						{sources.map((ref) => (
							<button
								key={ref}
								type="button"
								disabled={!onOpenSources}
								onClick={onOpenSources}
								className="ml-0.5 align-super font-mono text-[10.5px] leading-none text-sky-700 underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring enabled:hover:text-sky-900 dark:text-sky-400"
							>
								[{ref}]
							</button>
						))}
					</p>
				) : null}
				{groups.some((group) => group.personaIds.length) ? (
					<div className="flex flex-wrap gap-x-5 gap-y-3 pt-0.5">
						{groups.map((group) => (
							<div key={group.stance} className="flex flex-col gap-1.5">
								<span
									className={cn(
										"flex -space-x-1.5",
										(group.stance === "oppose" || group.stance === "none") &&
											"opacity-55 grayscale-[0.6]",
									)}
								>
									{group.personaIds.map((personaId) => {
										const persona = store.personaById(personaId)
										return (
											<MagicTooltip
												key={personaId}
												title={
													persona?.tagline
														? `${persona.name} · ${persona.tagline}`
														: (persona?.name ?? personaId)
												}
											>
												<span className="rounded-full ring-2 ring-card transition-transform hover:z-10 hover:-translate-y-0.5">
													<PersonaAvatar
														id={personaId}
														name={persona?.name ?? personaId}
														className="size-7"
													/>
												</span>
											</MagicTooltip>
										)
									})}
								</span>
								<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
									{hasStance ? (
										<span
											className={cn(
												"size-1.5 rounded-full",
												stanceLabels[group.stance].dot,
											)}
										/>
									) : null}
									{hasStance
										? `${stanceLabels[group.stance].label} ${group.personaIds.length}`
										: t("hypothesis.quotedFrom", {
												count: group.personaIds.length,
											})}
								</span>
							</div>
						))}
					</div>
				) : null}
				{expanded && hasDetails ? (
					<div className="flex flex-col gap-3 text-xs">
						{hypothesis.support_criteria || hypothesis.refute_criteria ? (
							<div className="grid gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border sm:grid-cols-2">
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
						{hypothesis.validation?.summary ? (
							<p className="leading-5 text-foreground">
								<span className="font-medium">
									{t("hypothesis.validationSummary")}
								</span>
								{hypothesis.validation.summary}
							</p>
						) : null}
						{moreQuotes.length ? (
							<div className="flex flex-col gap-1.5">
								<span className="text-muted-foreground">
									{t("hypothesis.moreQuotes", { count: moreQuotes.length })}
								</span>
								{moreQuotes.map((ref, index) => (
									<QuoteItem
										key={index}
										quote={ref}
										personaName={
											store.personaById(ref.persona_id)?.name ??
											ref.persona_id
										}
										onOpen={() => onOpenQuote(ref)}
									/>
								))}
							</div>
						) : null}
					</div>
				) : null}
			</div>
			{lead ? <LeadQuote quote={lead} onOpen={() => onOpenQuote(lead)} /> : null}
		</li>
	)
})

/** The representative quote on its speaker's colour, linking back to the transcript round. */
const LeadQuote = observer(function LeadQuote({
	quote,
	onOpen,
}: {
	quote: QuoteEvidence
	onOpen: () => void
}) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const persona = store.personaById(quote.persona_id)
	const name = persona?.name ?? quote.persona_id
	const { tone } = personaTone(name)
	return (
		<div
			className="flex flex-col gap-3.5 py-5 pl-[34px] pr-[22px] text-white"
			style={{ backgroundColor: tone }}
		>
			<span className="flex items-center gap-1.5 text-[11.5px] text-white/75">
				<Quote className="size-3.5" />
				{t("hypothesis.leadQuote")}
			</span>
			{/* Opening mark hangs outside the text block, as in print pull quotes. */}
			<p className="relative flex-1 text-pretty text-[17px] font-black leading-relaxed before:absolute before:right-full before:content-['“'] after:content-['”']">
				{quote.text}
			</p>
			<span className="flex items-center gap-2 text-[12.5px]">
				<PersonaAvatar
					id={quote.persona_id}
					name={name}
					className="size-[30px] ring-2 ring-white/35"
				/>
				<span className="flex min-w-0 flex-col leading-snug">
					<span className="font-medium">{name}</span>
					<span className="line-clamp-1 text-[11.5px] text-white/70">
						{persona?.tagline ? `${persona.tagline} · ` : ""}
						{t("persona.aiSimulated")}
					</span>
				</span>
			</span>
			<button
				type="button"
				className="inline-flex items-center gap-1 rounded border-t border-white/20 pt-2.5 text-left text-xs text-white/85 outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
				onClick={onOpen}
			>
				{quote.round_index !== undefined
					? t("hypothesis.openRound", { index: quote.round_index + 1 })
					: t("hypothesis.openTranscript")}
				<ArrowRight className="size-3.5" />
			</button>
		</div>
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

/** One glance at the outcome: big counts and a stacked bar, before any card is read. */
function VerdictOverview({
	hypotheses,
	className,
}: {
	hypotheses: StudyHypothesis[]
	className?: string
}) {
	const { t } = useTranslation("personaResearch")
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
	const numberTone: Record<HypothesisVerdict, string> = {
		supported: "text-emerald-700 dark:text-emerald-400",
		mixed: "text-amber-700 dark:text-amber-400",
		refuted: "text-rose-600 dark:text-rose-400",
		insufficient: "text-muted-foreground",
		pending: "text-muted-foreground",
	}

	return (
		<div className={cn("flex flex-col justify-center gap-2", className)}>
			<div className="flex flex-wrap gap-x-5 gap-y-1">
				{counts.map(({ verdict, count }) => (
					<span key={verdict} className="flex flex-col">
						<span
							className={cn(
								"font-mono text-2xl font-medium tabular-nums leading-tight",
								numberTone[verdict],
							)}
						>
							{count}
						</span>
						<span className="text-xs text-muted-foreground">{label[verdict]}</span>
					</span>
				))}
			</div>
			<div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
				{counts.map(({ verdict, count }) => (
					<span
						key={verdict}
						className={cn("h-full", VERDICT_ACCENT[verdict])}
						style={{ flexGrow: count }}
					/>
				))}
			</div>
			<span className="text-[11.5px] leading-5 text-muted-foreground">
				{t("hypothesis.ruleHint")}
			</span>
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
		<div className="bg-card p-3 leading-5">
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
			<div className="text-muted-foreground">{text}</div>
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
