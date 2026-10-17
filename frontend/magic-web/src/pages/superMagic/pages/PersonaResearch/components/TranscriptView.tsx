import { CircleAlert, Lightbulb, Mic, Quote, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import type { DiscussionFile, InterviewFile, PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"

interface TranscriptViewProps {
	transcript: InterviewFile | DiscussionFile
	/** Resolves persona_id / speaker ids to persona cards for names and avatars. */
	resolvePersona: (personaId: string) => PersonaFile | null
	/** Interviews have one respondent; their rounds use role "persona". */
	respondentId?: string
}

/**
 * Insight card (summary, findings, quotes) above a chat-style transcript.
 * Moderator questions are numbered so a quote in the report can be traced back to its round.
 */
export default function TranscriptView({
	transcript,
	resolvePersona,
	respondentId,
}: TranscriptViewProps) {
	const { t } = useTranslation("personaResearch")
	const hasInsights =
		Boolean(transcript.summary) ||
		Boolean(transcript.key_findings?.length) ||
		Boolean(transcript.quotes?.length)
	let questionIndex = 0

	return (
		<div className="flex flex-col gap-5" data-testid="persona-research-transcript">
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

			<ol className="flex flex-col gap-4">
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
							className={cn(
								"flex gap-2.5 duration-300 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none",
								isModerator ? "flex-row-reverse" : "flex-row",
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
									{round.text}
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
