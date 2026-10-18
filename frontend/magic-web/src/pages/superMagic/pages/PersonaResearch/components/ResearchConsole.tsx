import { useEffect, useRef, useState, type ReactNode } from "react"
import {
	ChartColumn,
	ClipboardCheck,
	FileText,
	MessagesSquare,
	Mic,
	Target,
	UsersRound,
	type LucideIcon,
} from "lucide-react"
import { useMemoizedFn } from "ahooks"
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
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import type { PersonaFile, QuoteRef } from "../types"
import AnalysisBoard from "./AnalysisBoard"
import HypothesisBoard from "./HypothesisBoard"
import InterviewsPanel from "./InterviewsPanel"
import PersonaAvatar from "./PersonaAvatar"
import PersonaPanel from "./PersonaPanel"
import TranscriptView from "./TranscriptView"
import ValidationPane from "./ValidationPane"

export type ResearchConsoleTab =
	"hypotheses" | "personas" | "interviews" | "discussions" | "analysis" | "files" | "validation"

interface ResearchConsoleProps {
	activeTab: ResearchConsoleTab
	onTabChange: (tab: ResearchConsoleTab) => void
	/** The shared file preview (report and any file clicked in the conversation). */
	filesPane: ReactNode
	/** Interview to show when the tab opens from a persona card. */
	focusedInterviewPersonaId: string | null
	onFocusInterview: (personaId: string | null) => void
	onOpenPersona: (persona: PersonaFile) => void
	/** Opens a study file (desk research, questionnaire CSV) in the shared preview. */
	onOpenFile: (file: AttachmentItem) => void
	/** Moves to the conversation and prefills the "compare real answers" request. */
	onRequestValidationUpload: () => void
	variant: "desktop" | "mobile"
}

type RoundHighlight = { key: string; roundIndex: number; nonce: number }

/**
 * Study outputs panel. Tool calls stay in the conversation; this panel shows the research
 * artifacts: hypotheses, personas, interviews, focus groups, analysis, report/files and
 * real-person validation. Quotes anywhere jump to their transcript round.
 */
function ResearchConsole({
	activeTab,
	onTabChange,
	filesPane,
	focusedInterviewPersonaId,
	onFocusInterview,
	onOpenPersona,
	onOpenFile,
	onRequestValidationUpload,
	variant,
}: ResearchConsoleProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const study = store.study
	const studyAttachments = store.studyAttachments
	const discussions = store.discussions
	const isMobile = variant === "mobile"
	const [activeDiscussionIndex, setActiveDiscussionIndex] = useState(0)
	const [focusRound, setFocusRound] = useState<RoundHighlight | null>(null)

	useEffect(() => {
		if (activeDiscussionIndex >= discussions.length) setActiveDiscussionIndex(0)
	}, [activeDiscussionIndex, discussions.length])

	/**
	 * Opens the transcript a quote came from and highlights its round.
	 * file "discussions/<id>.json" → that focus group; otherwise the persona's interview.
	 */
	const openQuote = useMemoizedFn(
		(quote: Pick<QuoteRef, "persona_id" | "round_index" | "file">) => {
			const file = quote.file ?? ""
			if (file.startsWith("discussions/")) {
				const index = discussions.findIndex((ref) => ref.path.endsWith(file))
				if (index >= 0) {
					setActiveDiscussionIndex(index)
					onTabChange("discussions")
					if (quote.round_index !== undefined) {
						setFocusRound({
							key: `d:${index}`,
							roundIndex: quote.round_index,
							nonce: Date.now(),
						})
					}
					return
				}
			}
			onFocusInterview(quote.persona_id)
			onTabChange("interviews")
			if (quote.round_index !== undefined) {
				setFocusRound({
					key: `i:${quote.persona_id}`,
					roundIndex: quote.round_index,
					nonce: Date.now(),
				})
			}
		},
	)

	const openSources = useMemoizedFn(() => {
		if (studyAttachments?.deskResearch) onOpenFile(studyAttachments.deskResearch)
	})

	const hypotheses = study?.hypotheses ?? []
	const decidedCount = hypotheses.filter((item) => item.verdict !== "pending").length
	const doneInterviews = store.interviews.filter((ref) => ref.data.status === "done").length

	/**
	 * "New content" dots: a tab shows a dot when its count grew since the user last viewed it.
	 * Example: on the personas tab while interviews 3→5 finish, the interviews tab gets a dot.
	 */
	const counts: Record<ResearchConsoleTab, number> = {
		hypotheses: hypotheses.length + decidedCount,
		personas: store.studyPersonas.length,
		interviews: doneInterviews,
		discussions: discussions.length,
		analysis: store.synthesis?.themes.length ?? 0,
		files: studyAttachments?.report ? 1 : 0,
		validation: (studyAttachments?.validation ? 1 : 0) + (store.validationResults ? 1 : 0),
	}
	const seenCountsRef = useRef<Record<ResearchConsoleTab, number> | null>(null)
	if (seenCountsRef.current === null) seenCountsRef.current = { ...counts }
	useEffect(() => {
		if (seenCountsRef.current) seenCountsRef.current[activeTab] = counts[activeTab]
	})
	const hasNew = (tab: ResearchConsoleTab) =>
		tab !== activeTab && counts[tab] > (seenCountsRef.current?.[tab] ?? 0)

	const tabs: { value: ResearchConsoleTab; icon: LucideIcon; label: string; badge?: string }[] = [
		{
			value: "hypotheses",
			icon: Target,
			label: t("console.hypotheses"),
			badge: hypotheses.length ? `${decidedCount}/${hypotheses.length}` : undefined,
		},
		{
			value: "personas",
			icon: UsersRound,
			label: t("console.personas"),
			badge: store.studyPersonas.length ? String(store.studyPersonas.length) : undefined,
		},
		{
			value: "interviews",
			icon: Mic,
			label: t("console.interviews"),
			badge: store.interviews.length
				? `${doneInterviews}/${store.interviews.length}`
				: undefined,
		},
		{
			value: "discussions",
			icon: MessagesSquare,
			label: t("console.discussions"),
			badge: discussions.length ? String(discussions.length) : undefined,
		},
		{
			value: "analysis",
			icon: ChartColumn,
			label: t("console.analysis"),
			badge: store.synthesis?.themes.length
				? String(store.synthesis.themes.length)
				: undefined,
		},
		{ value: "files", icon: FileText, label: t("console.files") },
		{
			value: "validation",
			icon: ClipboardCheck,
			label: t("console.validation"),
			badge: store.validationResults
				? String(store.validationResults.respondent_count)
				: undefined,
		},
	]

	const reportRunning =
		study?.phases.some((phase) => phase.key === "report" && phase.status === "running") ?? false
	const activeDiscussion = discussions[activeDiscussionIndex]

	/** Study documents in reading order; the files tab lists them so they stay reachable. */
	const studyDocuments = [
		{ key: "plan", label: t("console.docPlan"), file: studyAttachments?.plan },
		{ key: "desk", label: t("console.docDeskResearch"), file: studyAttachments?.deskResearch },
		{ key: "report", label: t("console.docReport"), file: studyAttachments?.report },
		{
			key: "validation",
			label: t("console.docValidation"),
			file: studyAttachments?.validation,
		},
	].filter((doc): doc is { key: string; label: string; file: AttachmentItem } =>
		Boolean(doc.file),
	)

	return (
		<Tabs
			value={activeTab}
			onValueChange={(value) => onTabChange(value as ResearchConsoleTab)}
			className="flex h-full min-h-0 flex-col"
			data-testid="persona-research-console"
		>
			<div className="shrink-0 overflow-x-auto border-b border-border px-3 pt-2">
				<TabsList className="h-auto gap-1 bg-transparent p-0">
					{tabs.map(({ value, icon: Icon, label, badge }) => (
						<TabsTrigger
							key={value}
							value={value}
							className={cn(
								"relative gap-1.5 rounded-none border-b-2 border-transparent px-2.5 pb-2 pt-1.5 text-xs text-muted-foreground shadow-none",
								"data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none",
							)}
						>
							<Icon className="size-3.5" />
							{isMobile && value !== activeTab ? null : label}
							{badge ? (
								<span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
									{badge}
								</span>
							) : null}
							{hasNew(value) ? (
								<span
									className="absolute right-0.5 top-1 size-1.5 rounded-full bg-primary"
									aria-label={t("console.newContent")}
								/>
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</div>
			{store.studyFileInvalid ? (
				<p className="mx-3 mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
					{t("console.studyFileInvalid")}
				</p>
			) : null}

			<TabsContent value="hypotheses" className="mt-0 min-h-0 flex-1">
				<HypothesisBoard onOpenQuote={openQuote} onOpenSources={openSources} />
			</TabsContent>

			<TabsContent value="personas" className="mt-0 min-h-0 flex-1">
				<PersonaPanel variant={variant} onOpenPersona={onOpenPersona} />
			</TabsContent>

			<TabsContent value="interviews" className="mt-0 min-h-0 flex-1">
				<InterviewsPanel
					variant={variant}
					focusedPersonaId={focusedInterviewPersonaId}
					onFocus={onFocusInterview}
					focusRound={
						focusRound?.key === `i:${focusedInterviewPersonaId}` ? focusRound : null
					}
				/>
			</TabsContent>

			<TabsContent value="discussions" className="mt-0 min-h-0 flex-1">
				{discussions.length === 0 ? (
					<Empty className="h-full border-0 py-12">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<MessagesSquare />
							</EmptyMedia>
							<EmptyTitle className="text-sm">
								{t("console.discussionsEmptyTitle")}
							</EmptyTitle>
							<EmptyDescription className="text-xs">
								{t("console.discussionsEmpty")}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				) : (
					<div className="flex h-full min-h-0 flex-col">
						<div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
							{discussions.length > 1
								? discussions.map((ref, index) => (
										<Button
											key={ref.fileId}
											size="sm"
											variant={
												index === activeDiscussionIndex
													? "secondary"
													: "ghost"
											}
											className="h-7"
											onClick={() => setActiveDiscussionIndex(index)}
										>
											{t("console.discussionN", { index: index + 1 })}
										</Button>
									))
								: null}
							<span className="flex -space-x-1.5">
								{(activeDiscussion?.data.participants ?? []).map((id) => (
									<PersonaAvatar
										key={id}
										id={id}
										name={store.personaById(id)?.name ?? id}
										className="size-6 border-2 border-background text-[10px]"
									/>
								))}
							</span>
							<span className="text-xs text-muted-foreground">
								{t("console.participants", {
									count: activeDiscussion?.data.participants.length ?? 0,
								})}
							</span>
						</div>
						<ScrollArea className="min-h-0 flex-1">
							<div className="mx-auto max-w-3xl p-4">
								{activeDiscussion ? (
									<TranscriptView
										transcript={activeDiscussion.data}
										resolvePersona={store.personaById}
										focusRound={
											focusRound?.key === `d:${activeDiscussionIndex}`
												? focusRound
												: null
										}
									/>
								) : null}
							</div>
						</ScrollArea>
					</div>
				)}
			</TabsContent>

			<TabsContent value="analysis" className="mt-0 min-h-0 flex-1">
				<AnalysisBoard onOpenQuote={openQuote} onOpenSources={openSources} />
			</TabsContent>

			{/* Keep the file preview mounted so its tabs and renderer caches survive tab switches. */}
			<TabsContent
				value="files"
				forceMount
				className={cn(
					"relative mt-0 flex min-h-0 flex-1 flex-col",
					activeTab !== "files" && "hidden",
				)}
			>
				{studyDocuments.length > 0 ? (
					<div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
						{studyDocuments.map((doc) => (
							<Button
								key={doc.key}
								variant="outline"
								size="sm"
								className="h-7 gap-1.5 px-2.5 text-xs"
								onClick={() => onOpenFile(doc.file)}
							>
								<FileText className="size-3.5" />
								{doc.label}
							</Button>
						))}
					</div>
				) : null}
				<div className="relative min-h-0 flex-1">{filesPane}</div>
				{!studyAttachments?.report && reportRunning ? (
					<div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
						<span className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
							<span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
							{t("console.reportGenerating")}
						</span>
					</div>
				) : null}
			</TabsContent>

			<TabsContent value="validation" className="mt-0 min-h-0 flex-1">
				<ValidationPane
					onRequestUpload={onRequestValidationUpload}
					onOpenFile={onOpenFile}
				/>
			</TabsContent>
		</Tabs>
	)
}

/** Tab bar and card placeholders while the study's files load. */
export function ResearchConsoleSkeleton() {
	return (
		<div className="flex h-full min-h-0 flex-col" aria-busy>
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
				{Array.from({ length: 7 }, (_, index) => (
					<Skeleton key={index} className="h-6 w-16" />
				))}
			</div>
			<div className="flex flex-col gap-3 p-4">
				<Skeleton className="h-16 w-full rounded-xl" />
				{Array.from({ length: 3 }, (_, index) => (
					<Skeleton key={index} className="h-24 w-full rounded-xl" />
				))}
			</div>
		</div>
	)
}

export default observer(ResearchConsole)
