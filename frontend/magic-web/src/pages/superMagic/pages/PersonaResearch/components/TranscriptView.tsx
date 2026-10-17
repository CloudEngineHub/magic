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

/** Chat-style transcript with summary, key findings and quotes on top. */
export default function TranscriptView({
	transcript,
	resolvePersona,
	respondentId,
}: TranscriptViewProps) {
	const { t } = useTranslation("personaResearch")

	return (
		<div className="flex flex-col gap-4" data-testid="persona-research-transcript">
			{transcript.status === "failed" ? (
				<p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
					{t("transcript.failed")}
					{transcript.error ? `：${transcript.error}` : null}
				</p>
			) : null}
			{transcript.summary || transcript.key_findings?.length || transcript.quotes?.length ? (
				<div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm">
					{transcript.summary ? (
						<div>
							<h4 className="mb-1 text-xs font-medium text-muted-foreground">
								{t("transcript.summary")}
							</h4>
							<p className="whitespace-pre-wrap">{transcript.summary}</p>
						</div>
					) : null}
					{transcript.key_findings?.length ? (
						<div>
							<h4 className="mb-1 text-xs font-medium text-muted-foreground">
								{t("transcript.keyFindings")}
							</h4>
							<ul className="list-disc space-y-1 pl-4">
								{transcript.key_findings.map((finding, index) => (
									<li key={index}>{finding}</li>
								))}
							</ul>
						</div>
					) : null}
					{transcript.quotes?.length ? (
						<div>
							<h4 className="mb-1 text-xs font-medium text-muted-foreground">
								{t("transcript.quotes")}
							</h4>
							<ul className="space-y-1">
								{transcript.quotes.map((quote, index) => (
									<li
										key={index}
										className="border-l-2 border-primary pl-2 italic"
									>
										“{quote.text}”
										{quote.theme ? (
											<span className="ml-1 text-xs not-italic text-muted-foreground">
												#{quote.theme}
											</span>
										) : null}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</div>
			) : null}
			<ol className="flex flex-col gap-3">
				{transcript.rounds.map((round, index) => {
					const speakerId = round.speaker ?? round.role ?? ""
					const isModerator = speakerId === "moderator"
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
								"flex gap-2",
								isModerator ? "flex-row-reverse" : "flex-row",
							)}
						>
							{isModerator ? null : (
								<PersonaAvatar
									id={personaId ?? "respondent"}
									name={name}
									className="size-7 text-xs"
								/>
							)}
							<div
								className={cn(
									"flex max-w-[85%] flex-col gap-1",
									isModerator && "items-end",
								)}
							>
								<span className="text-[11px] text-muted-foreground">{name}</span>
								<p
									className={cn(
										"whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
										isModerator ? "bg-primary/10" : "bg-muted",
									)}
								>
									{round.text}
								</p>
							</div>
						</li>
					)
				})}
			</ol>
		</div>
	)
}
