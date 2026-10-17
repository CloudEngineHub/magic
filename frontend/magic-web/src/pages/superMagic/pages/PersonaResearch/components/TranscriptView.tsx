import { useEffect, useRef, useState } from "react"
import {
	BookOpen,
	CircleAlert,
	Lightbulb,
	Mic,
	Quote,
	Sparkles,
	ThumbsUp,
	TriangleAlert,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { cn } from "@/utils/cn"
import { resolveTranscriptQuality, splitInferredSegments } from "../services/researchAnalysis"
import type { DiscussionFile, InterviewFile, PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"
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
}

/**
 * Quality strip and insight card above a chat-style transcript.
 * Moderator questions are numbered so a quote in the report can be traced back to its round;
 * inferred details (persona_chat's "(inferred)" marker) are underlined and explained on hover.
 */
export default function TranscriptView({
	transcript,
	resolvePersona,
	respondentId,
	focusRound = null,
}: TranscriptViewProps) {
	const { t } = useTranslation("personaResearch")
	const listRef = useRef<HTMLOListElement>(null)
	const [flashIndex, setFlashIndex] = useState<number | null>(null)
	const hasInsights =
		Boolean(transcript.summary) ||
		Boolean(transcript.key_findings?.length) ||
		Boolean(transcript.quotes?.length)
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

	return (
		<div className="flex flex-col gap-5" data-testid="persona-research-transcript">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border px-3 py-2 text-[11px] text-muted-foreground">
				{quality?.concrete_stories !== undefined ? (
					<span className="inline-flex items-center gap-1">
						<BookOpen className="size-3.5" />
						{t("quality.stories", { count: quality.concrete_stories })}
					</span>
				) : null}
				<span
					className={cn(
						"inline-flex items-center gap-1",
						isHighInferred && "font-medium text-amber-600 dark:text-amber-400",
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
					<span className="inline-flex items-center gap-1">
						<ThumbsUp className="size-3.5" />
						{t("quality.agreement", { count: quality.agreement_flags })}
					</span>
				) : null}
				<AiSimulatedNote className="ml-auto" />
				{isHighInferred ? (
					<p className="w-full text-amber-700 dark:text-amber-400">
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

			{hasInsights ? (
				<div className="flex flex-col gap-4 rounded-xl border border-border bg-gradient-to-b from-primary/[0.04] to-transparent p-4 text-sm">
					{transcript.summary ? (
						<InsightBlock
							icon={<Sparkles className="size-3.5" />}
							title={t("transcript.summary")}
						>
							<p className="whitespace-pre-wrap leading-6">{transcript.summary}</p>
						</InsightBlock>
					) : null}
					{transcript.key_findings?.length ? (
						<InsightBlock
							icon={<Lightbulb className="size-3.5" />}
							title={t("transcript.keyFindings")}
						>
							<ol className="flex flex-col gap-1.5">
								{transcript.key_findings.map((finding, index) => (
									<li key={index} className="flex gap-2 leading-6">
										<span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
											{index + 1}
										</span>
										<span>{finding}</span>
									</li>
								))}
							</ol>
						</InsightBlock>
					) : null}
					{transcript.quotes?.length ? (
						<InsightBlock
							icon={<Quote className="size-3.5" />}
							title={t("transcript.quotes")}
						>
							<ul className="flex flex-col gap-2">
								{transcript.quotes.map((quote, index) => (
									<li
										key={index}
										className="rounded-lg bg-background px-3 py-2 leading-6 shadow-sm"
									>
										“{quote.text}”
										{quote.theme ? (
											<span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
												{quote.theme}
											</span>
										) : null}
									</li>
								))}
							</ul>
						</InsightBlock>
					) : null}
				</div>
			) : null}

			<ol ref={listRef} className="flex flex-col gap-4">
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
					return (
						<li
							key={index}
							data-round={index}
							className={cn(
								"flex gap-2.5 rounded-2xl duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none",
								isModerator ? "flex-row-reverse" : "flex-row",
								// Brief ring when a quote elsewhere jumps to this round.
								flashIndex === index &&
									"ring-2 ring-primary/50 ring-offset-4 ring-offset-background transition-shadow",
							)}
						>
							{isModerator ? (
								<span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
									<Mic className="size-3.5" />
								</span>
							) : (
								<PersonaAvatar
									id={personaId ?? "respondent"}
									name={name}
									className="size-7 text-xs"
								/>
							)}
							<div
								className={cn(
									"flex max-w-[82%] flex-col gap-1",
									isModerator && "items-end",
								)}
							>
								<span className="text-[11px] text-muted-foreground">
									{isModerator ? `Q${questionIndex} · ${name}` : name}
								</span>
								<p
									className={cn(
										"whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-6",
										isModerator
											? "rounded-tr-sm bg-primary text-primary-foreground"
											: "rounded-tl-sm bg-muted text-foreground",
									)}
								>
									{isModerator ? round.text : <AnswerText text={round.text} />}
								</p>
							</div>
						</li>
					)
				})}
				{transcript.status === "running" ? (
					<li
						className="flex items-center gap-2 pl-9 text-xs text-muted-foreground"
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

/** Respondent text with inferred spans underlined; the "(inferred)" marker itself is hidden. */
function AnswerText({ text }: { text: string }) {
	const { t } = useTranslation("personaResearch")
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
					<span key={index}>{segment.text}</span>
				),
			)}
		</>
	)
}

function InsightBlock({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode
	title: string
	children: React.ReactNode
}) {
	return (
		<section className="flex flex-col gap-2">
			<h4 className="flex items-center gap-1.5 text-xs font-semibold text-primary">
				{icon}
				{title}
			</h4>
			{children}
		</section>
	)
}
