import { useEffect, useRef, useState } from "react"
import { BookOpen, CircleAlert, Sparkles, ThumbsUp, TriangleAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { cn } from "@/utils/cn"
import { resolveTranscriptQuality, splitInferredSegments } from "../services/researchAnalysis"
import { splitHighlights, type HighlightMark } from "../services/transcriptHighlights"
import type { DiscussionFile, InterviewFile, PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"
import { personaTone } from "./personaPortrait"
import { AiSimulatedNote } from "./ResearchBadges"

interface TranscriptViewProps {
	transcript: InterviewFile | DiscussionFile
	/** Resolves persona_id / speaker ids to persona cards for names and avatars. */
	resolvePersona: (personaId: string) => PersonaFile | null
	/** Interviews have one respondent; their rounds use role "persona". */
	respondentId?: string
	/**
	 * Round to scroll to and briefly highlight (index into rounds[]). The nonce re-triggers the
	 * highlight when the same round is opened twice.
	 */
	focusRound?: { roundIndex: number; nonce: number } | null
	/** Quotes cited elsewhere (hypotheses, quote list), highlighted in the speaker's answers. */
	highlights?: (HighlightMark & { personaId: string })[]
	/** "side" leaves summary, findings and quotes to a separate column (TranscriptInsights). */
	insightsPlacement?: "inline" | "side"
}

/**
 * Transcript read as a document: question numbers in a narrow left column, answers set for
 * reading. Quotes used in conclusions are highlighted in the speaker's colour and tagged with
 * their hypothesis; inferred details (persona_chat's "(inferred)" marker) are underlined.
 */
export default function TranscriptView({
	transcript,
	resolvePersona,
	respondentId,
	focusRound = null,
	highlights = [],
	insightsPlacement = "inline",
}: TranscriptViewProps) {
	const { t } = useTranslation("personaResearch")
	const listRef = useRef<HTMLOListElement>(null)
	const [flashIndex, setFlashIndex] = useState<number | null>(null)
	const { quality, inferredRatio, isHighInferred } = resolveTranscriptQuality(transcript)
	let questionIndex = 0

	useEffect(() => {
		if (!focusRound) return
		const node = listRef.current?.querySelector(`[data-round="${focusRound.roundIndex}"]`)
		node?.scrollIntoView({ behavior: "smooth", block: "center" })
		setFlashIndex(focusRound.roundIndex)
		const timer = window.setTimeout(() => setFlashIndex(null), 2400)
		return () => window.clearTimeout(timer)
	}, [focusRound])

	const chip =
		"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-muted-foreground ring-1 ring-border"

	return (
		<div className="flex flex-col gap-5" data-testid="persona-research-transcript">
			<div className="flex flex-wrap items-center gap-1.5">
				{quality?.concrete_stories !== undefined ? (
					<span className={chip}>
						<BookOpen className="size-3.5" />
						{t("quality.stories", { count: quality.concrete_stories })}
					</span>
				) : null}
				<span
					className={cn(
						chip,
						isHighInferred &&
							"font-medium text-amber-700 ring-amber-500/40 dark:text-amber-400",
					)}
				>
					{isHighInferred ? (
						<TriangleAlert className="size-3.5" />
					) : (
						<Sparkles className="size-3.5" />
					)}
					{t("quality.inferred", { percent: Math.round(inferredRatio * 100) })}
				</span>
				{quality?.agreement_flags !== undefined ? (
					<span className={chip}>
						<ThumbsUp className="size-3.5" />
						{t("quality.agreement", { count: quality.agreement_flags })}
					</span>
				) : null}
				<AiSimulatedNote className="ml-1.5" />
				{isHighInferred ? (
					<p className="w-full text-xs text-amber-700 dark:text-amber-400">
						{t("quality.highInferred")}
					</p>
				) : null}
			</div>

			{transcript.status === "failed" ? (
				<p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
					<CircleAlert className="mt-0.5 size-4 shrink-0" />
					<span>
						{t("transcript.failed")}
						{transcript.error ? `：${transcript.error}` : null}
					</span>
				</p>
			) : null}

			{insightsPlacement === "inline" ? (
				<TranscriptInsights
					transcript={transcript}
					className="rounded-xl bg-muted/40 p-4 ring-1 ring-border"
				/>
			) : null}

			<ol ref={listRef} className="flex flex-col border-t border-border">
				{transcript.rounds.map((round, index) => {
					const speakerId = round.speaker ?? round.role ?? ""
					const isModerator = speakerId === "moderator"
					if (isModerator) questionIndex += 1
					const personaId = isModerator
						? null
						: speakerId === "persona"
							? (respondentId ?? null)
							: speakerId
					const persona = personaId ? resolvePersona(personaId) : null
					const name = isModerator
						? t("transcript.moderator")
						: (persona?.name ?? personaId ?? t("transcript.respondent"))
					const marks = personaId
						? highlights.filter((mark) => mark.personaId === personaId)
						: []
					return (
						<li
							key={index}
							data-round={index}
							className={cn(
								"grid grid-cols-[76px_minmax(0,1fr)] gap-x-[18px] rounded-lg duration-300 animate-in fade-in-0 motion-reduce:animate-none",
								isModerator ? "pt-6" : "pt-3",
								// Brief ring when a quote elsewhere jumps to this round.
								flashIndex === index &&
									"ring-2 ring-primary/50 ring-offset-4 ring-offset-background transition-shadow",
							)}
						>
							<span className="flex flex-col pt-0.5 text-xs leading-5 text-muted-foreground">
								{isModerator ? (
									<span className="font-mono text-[11.5px] font-medium text-foreground/70">
										Q{questionIndex}
									</span>
								) : null}
								<span className="flex min-w-0 items-center gap-1.5">
									{/* Group discussions name several speakers; an avatar tells them apart. */}
									{!isModerator && !respondentId ? (
										<PersonaAvatar
											id={personaId ?? "respondent"}
											name={name}
											className="size-4"
										/>
									) : null}
									<span className="truncate">{name}</span>
								</span>
							</span>
							{isModerator ? (
								<p className="whitespace-pre-wrap text-[13.5px] leading-7 text-muted-foreground">
									{round.text}
								</p>
							) : (
								<p className="whitespace-pre-wrap text-[15px] leading-[1.95] text-foreground">
									<AnswerText text={round.text} marks={marks} speaker={name} />
								</p>
							)}
						</li>
					)
				})}
				{transcript.status === "running" ? (
					<li
						className="flex items-center gap-2 pl-[94px] pt-4 text-xs text-muted-foreground"
						aria-live="polite"
					>
						<span className="flex gap-1">
							{[0, 1, 2].map((dot) => (
								<span
									key={dot}
									className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 motion-reduce:animate-none"
									// Staggered bounce reads as "typing"; delay is decorative only.
									style={{ animationDelay: `${dot * 150}ms` }}
								/>
							))}
						</span>
						{t("transcript.inProgress")}
					</li>
				) : null}
			</ol>
		</div>
	)
}

/**
 * Respondent text with cited quotes marked in the speaker's colour (a highlighter stroke over the
 * lower half of the line) and inferred spans underlined; the "(inferred)" marker itself is hidden.
 */
function AnswerText({
	text,
	marks,
	speaker,
}: {
	text: string
	marks: HighlightMark[]
	speaker: string
}) {
	const { t } = useTranslation("personaResearch")
	const { mark } = personaTone(speaker)
	return (
		<>
			{splitInferredSegments(text).map((segment, index) =>
				segment.inferred ? (
					<Tooltip key={index}>
						<TooltipTrigger asChild>
							<span
								tabIndex={0}
								className="cursor-help rounded-sm text-foreground/70 underline decoration-amber-500/70 decoration-dashed underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{segment.text}
							</span>
						</TooltipTrigger>
						<TooltipContent className="max-w-56">
							{t("transcript.inferredHint")}
						</TooltipContent>
					</Tooltip>
				) : (
					<span key={index}>
						{splitHighlights(segment.text, marks).map((part, partIndex) =>
							part.mark ? (
								<span key={partIndex}>
									<mark
										className="rounded-sm bg-transparent text-inherit"
										style={{
											backgroundImage: `linear-gradient(transparent 52%, ${mark} 52%)`,
										}}
									>
										{part.text}
									</mark>
									{part.mark.tag ? (
										<span className="ml-1 rounded bg-foreground px-1 align-[2px] font-mono text-[10px] leading-4 text-background">
											{part.mark.tag}
										</span>
									) : null}
								</span>
							) : (
								<span key={partIndex}>{part.text}</span>
							),
						)}
					</span>
				),
			)}
		</>
	)
}

/** Summary, key findings and memorable quotes of one transcript. */
export function TranscriptInsights({
	transcript,
	className,
}: {
	transcript: InterviewFile | DiscussionFile
	className?: string
}) {
	const { t } = useTranslation("personaResearch")
	const hasInsights =
		Boolean(transcript.summary) ||
		Boolean(transcript.key_findings?.length) ||
		Boolean(transcript.quotes?.length)
	if (!hasInsights) return null
	return (
		<div className={cn("flex flex-col gap-6 text-[13px]", className)}>
			{transcript.summary ? (
				<InsightBlock title={t("transcript.summary")}>
					<p className="whitespace-pre-wrap leading-7 text-muted-foreground">
						{transcript.summary}
					</p>
				</InsightBlock>
			) : null}
			{transcript.key_findings?.length ? (
				<InsightBlock title={t("transcript.keyFindings")}>
					<ol className="flex flex-col gap-2.5">
						{transcript.key_findings.map((finding, index) => (
							<li
								key={index}
								className="grid grid-cols-[18px_1fr] gap-1.5 leading-6 text-muted-foreground"
							>
								<span className="pt-0.5 font-mono text-[11px] text-muted-foreground/70">
									{index + 1}
								</span>
								<span>{finding}</span>
							</li>
						))}
					</ol>
				</InsightBlock>
			) : null}
			{transcript.quotes?.length ? (
				<InsightBlock title={t("transcript.quotes")}>
					<ul className="flex flex-col gap-2">
						{transcript.quotes.map((quote, index) => (
							<li
								key={index}
								className="rounded-lg bg-background py-2.5 pl-6 pr-3 leading-6 ring-1 ring-border"
							>
								<span className="relative font-bold text-foreground before:absolute before:right-full before:content-['“'] after:content-['”']">
									{quote.text}
								</span>
								{quote.theme ? (
									<span className="mt-1.5 block text-[11.5px] text-muted-foreground">
										{quote.theme}
									</span>
								) : null}
							</li>
						))}
					</ul>
				</InsightBlock>
			) : null}
		</div>
	)
}

function InsightBlock({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="text-xs font-medium tracking-wide text-muted-foreground">{title}</h4>
			{children}
		</section>
	)
}
