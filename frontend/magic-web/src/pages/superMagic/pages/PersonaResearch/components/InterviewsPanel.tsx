import { useMemo } from "react"
import { ArrowLeft, ChevronLeft, ChevronRight, Mic } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import { resolveTranscriptQuality } from "../services/researchAnalysis"
import type { InterviewFile, PersonaFile } from "../types"
import PersonaAvatar from "./PersonaAvatar"
import { InterviewStatusChip } from "./PersonaCard"
import TranscriptView from "./TranscriptView"

interface InterviewsPanelProps {
	variant: "desktop" | "mobile"
	focusedPersonaId: string | null
	onFocus: (personaId: string | null) => void
	/** Round to scroll to in the focused interview, set when a quote elsewhere is opened. */
	focusRound: { roundIndex: number; nonce: number } | null
}

/** Interview list (with round progress and quality warning) beside the selected transcript. */
function InterviewsPanel({ variant, focusedPersonaId, onFocus, focusRound }: InterviewsPanelProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const interviews = store.interviews
	const isMobile = variant === "mobile"
	const roundLimit = store.study?.limits?.interview_rounds ?? 5
	const byPersona = useMemo(
		() => new Map(interviews.map((ref) => [ref.data.persona_id, ref.data])),
		[interviews],
	)
	const ids = interviews.map((ref) => ref.data.persona_id)
	// Desktop shows the first interview by default; mobile starts on the list.
	const selectedId = focusedPersonaId ?? (isMobile ? null : (ids[0] ?? null))
	const selected = selectedId ? (byPersona.get(selectedId) ?? null) : null
	const selectedIndex = selectedId ? ids.indexOf(selectedId) : -1

	if (interviews.length === 0) {
		return (
			<Empty className="h-full border-0 py-12">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<Mic />
					</EmptyMedia>
					<EmptyTitle className="text-sm">{t("console.interviewsEmptyTitle")}</EmptyTitle>
					<EmptyDescription className="text-xs">
						{t("console.interviewsEmpty")}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		)
	}

	const list = (
		<InterviewList
			items={ids}
			selectedId={isMobile ? null : selectedId}
			roundLimit={roundLimit}
			resolvePersona={store.personaById}
			interviewOf={(id) => byPersona.get(id)}
			onSelect={onFocus}
		/>
	)
	if (isMobile && !selected) return <ScrollArea className="h-full">{list}</ScrollArea>

	return (
		<div className={cn("flex h-full min-h-0", isMobile && "flex-col")}>
			{isMobile ? null : (
				<ScrollArea className="w-56 shrink-0 border-r border-border">{list}</ScrollArea>
			)}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				{selected ? (
					<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
						{isMobile ? (
							<Button
								variant="ghost"
								size="sm"
								className="-ml-2"
								onClick={() => onFocus(null)}
							>
								<ArrowLeft className="size-4" />
								{t("console.backToList")}
							</Button>
						) : (
							<span className="min-w-0 flex-1 truncate text-sm font-medium">
								{store.personaById(selected.persona_id)?.name ??
									selected.persona_id}
							</span>
						)}
						<span className="ml-auto flex items-center gap-1">
							<span className="text-xs tabular-nums text-muted-foreground">
								{selectedIndex + 1}/{ids.length}
							</span>
							<MagicTooltip title={t("console.previous")}>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									aria-label={t("console.previous")}
									disabled={selectedIndex <= 0}
									onClick={() => onFocus(ids[selectedIndex - 1] ?? null)}
								>
									<ChevronLeft className="size-4" />
								</Button>
							</MagicTooltip>
							<MagicTooltip title={t("console.next")}>
								<Button
									variant="ghost"
									size="icon"
									className="size-7"
									aria-label={t("console.next")}
									disabled={selectedIndex >= ids.length - 1}
									onClick={() => onFocus(ids[selectedIndex + 1] ?? null)}
								>
									<ChevronRight className="size-4" />
								</Button>
							</MagicTooltip>
						</span>
					</div>
				) : null}
				<ScrollArea className="min-h-0 flex-1">
					<div className="mx-auto max-w-3xl p-4">
						{selected ? (
							<TranscriptView
								transcript={selected}
								respondentId={selected.persona_id}
								resolvePersona={store.personaById}
								focusRound={focusRound}
							/>
						) : null}
					</div>
				</ScrollArea>
			</div>
		</div>
	)
}

function InterviewList({
	items,
	selectedId,
	roundLimit,
	resolvePersona,
	interviewOf,
	onSelect,
}: {
	items: string[]
	selectedId: string | null
	roundLimit: number
	resolvePersona: (id: string) => PersonaFile | null
	interviewOf: (id: string) => InterviewFile | undefined
	onSelect: (id: string) => void
}) {
	const { t } = useTranslation("personaResearch")
	return (
		<ul className="flex flex-col gap-0.5 p-2">
			{items.map((id) => {
				const persona = resolvePersona(id)
				const interview = interviewOf(id)
				const answered =
					interview?.rounds.filter((round) => round.role === "persona").length ?? 0
				const ratio = Math.min(1, answered / Math.max(1, roundLimit))
				const highInferred = interview
					? resolveTranscriptQuality(interview).isHighInferred
					: false
				return (
					<li key={id}>
						<button
							type="button"
							className={cn(
								"flex w-full flex-col gap-1.5 rounded-lg px-2.5 py-2 text-left outline-none transition-colors",
								"hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
								selectedId === id && "bg-accent",
							)}
							onClick={() => onSelect(id)}
						>
							<span className="flex items-center gap-2">
								<PersonaAvatar
									id={id}
									name={persona?.name ?? id}
									className="size-6 text-[10px]"
								/>
								<span className="min-w-0 flex-1 truncate text-sm">
									{persona?.name ?? id}
								</span>
								{highInferred ? (
									<span className="rounded bg-amber-500/15 px-1 text-[10px] text-amber-700 dark:text-amber-400">
										{t("quality.highInferredShort")}
									</span>
								) : null}
							</span>
							<span className="flex items-center gap-2 pl-8">
								<span className="h-1 flex-1 overflow-hidden rounded-full bg-border">
									<span
										className={cn(
											"block h-full rounded-full transition-[width] duration-500",
											interview?.status === "failed"
												? "bg-destructive"
												: "bg-primary",
										)}
										style={{ width: `${Math.round(ratio * 100)}%` }}
									/>
								</span>
								{interview ? (
									<span className="text-[11px]">
										<InterviewStatusChip status={interview.status} />
									</span>
								) : null}
							</span>
						</button>
					</li>
				)
			})}
		</ul>
	)
}

export default observer(InterviewsPanel)
