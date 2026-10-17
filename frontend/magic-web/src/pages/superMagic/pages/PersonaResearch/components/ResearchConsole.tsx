import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
	ArrowLeft,
	ChevronLeft,
	ChevronRight,
	ClipboardCheck,
	FileText,
	MessagesSquare,
	Mic,
	UsersRound,
	type LucideIcon,
} from "lucide-react"
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
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import type { InterviewFile, PersonaFile } from "../types"
import MarkdownFilePane from "./MarkdownFilePane"
import PersonaAvatar from "./PersonaAvatar"
import PersonaCard, { InterviewStatusChip } from "./PersonaCard"
import TranscriptView from "./TranscriptView"

export type ResearchConsoleTab = "personas" | "interviews" | "discussions" | "files" | "validation"

interface ResearchConsoleProps {
	activeTab: ResearchConsoleTab
	onTabChange: (tab: ResearchConsoleTab) => void
	/** The shared file preview (report and any file clicked in the conversation). */
	filesPane: ReactNode
	/** Interview to show when the tab opens from a persona card. */
	focusedInterviewPersonaId: string | null
	onFocusInterview: (personaId: string | null) => void
	onOpenPersona: (persona: PersonaFile) => void
	variant: "desktop" | "mobile"
}

/**
 * Study outputs panel. Tool calls stay in the conversation; this panel only shows the
 * research artifacts: personas, interviews, focus groups, report/files and the questionnaire.
 */
function ResearchConsole({
	activeTab,
	onTabChange,
	filesPane,
	focusedInterviewPersonaId,
	onFocusInterview,
	onOpenPersona,
	variant,
}: ResearchConsoleProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const personas = store.studyPersonas
	const interviews = store.interviews
	const discussions = store.discussions
	const study = store.study
	const studyAttachments = store.studyAttachments
	const validationFile = studyAttachments?.validation ?? null
	const roundLimit = study?.limits?.interview_rounds ?? 5
	const isMobile = variant === "mobile"
	const [activeDiscussionIndex, setActiveDiscussionIndex] = useState(0)

	const interviewByPersona = useMemo(
		() => new Map(interviews.map((ref) => [ref.data.persona_id, ref.data])),
		[interviews],
	)
	const doneCount = interviews.filter((ref) => ref.data.status === "done").length
	const interviewIds = interviews.map((ref) => ref.data.persona_id)

	// Desktop shows the first interview by default; mobile starts on the list.
	const selectedInterviewId =
		focusedInterviewPersonaId ?? (isMobile ? null : (interviewIds[0] ?? null))
	const selectedInterview = selectedInterviewId
		? (interviewByPersona.get(selectedInterviewId) ?? null)
		: null
	const selectedIndex = selectedInterviewId ? interviewIds.indexOf(selectedInterviewId) : -1

	useEffect(() => {
		if (activeDiscussionIndex >= discussions.length) setActiveDiscussionIndex(0)
	}, [activeDiscussionIndex, discussions.length])

	/**
	 * "New content" dots: a tab shows a dot when its count grew since the user last viewed it.
	 * Example: on the personas tab while interviews 3→5 finish, the interviews tab gets a dot.
	 */
	const counts: Record<ResearchConsoleTab, number> = {
		personas: personas.length,
		interviews: doneCount,
		discussions: discussions.length,
		files: studyAttachments?.report ? 1 : 0,
		validation: validationFile ? 1 : 0,
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
			value: "personas",
			icon: UsersRound,
			label: t("console.personas"),
			badge: personas.length ? String(personas.length) : undefined,
		},
		{
			value: "interviews",
			icon: Mic,
			label: t("console.interviews"),
			badge: interviews.length ? `${doneCount}/${interviews.length}` : undefined,
		},
		{
			value: "discussions",
			icon: MessagesSquare,
			label: t("console.discussions"),
			badge: discussions.length ? String(discussions.length) : undefined,
		},
		{ value: "files", icon: FileText, label: t("console.files") },
		{ value: "validation", icon: ClipboardCheck, label: t("console.validation") },
	]

	const phaseRunning = (key: string) =>
		study?.phases.some((phase) => phase.key === key && phase.status === "running") ?? false

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

			<TabsContent value="personas" className="mt-0 min-h-0 flex-1">
				<ScrollArea className="h-full">
					{personas.length === 0 ? (
						phaseRunning("interview") ? (
							<CardSkeletonGrid isMobile={isMobile} />
						) : (
							<ConsoleEmpty
								icon={UsersRound}
								title={t("console.personasEmptyTitle")}
								text={t("console.personasEmpty")}
							/>
						)
					) : (
						<div
							className={cn(
								"grid gap-3 p-4",
								isMobile
									? "grid-cols-1"
									: "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
							)}
						>
							{personas.map((persona) => {
								const interview = interviewByPersona.get(persona.id)
								return (
									<PersonaCard
										key={persona.id}
										persona={persona}
										interviewStatus={interview?.status}
										quote={interview?.quotes?.[0]?.text}
										onOpen={() => onOpenPersona(persona)}
									/>
								)
							})}
						</div>
					)}
				</ScrollArea>
			</TabsContent>

			<TabsContent value="interviews" className="mt-0 min-h-0 flex-1">
				{interviews.length === 0 ? (
					<ConsoleEmpty
						icon={Mic}
						title={t("console.interviewsEmptyTitle")}
						text={t("console.interviewsEmpty")}
					/>
				) : isMobile && !selectedInterview ? (
					<ScrollArea className="h-full">
						<InterviewList
							items={interviewIds}
							selectedId={null}
							roundLimit={roundLimit}
							resolvePersona={store.personaById}
							interviewOf={(id) => interviewByPersona.get(id)}
							onSelect={onFocusInterview}
						/>
					</ScrollArea>
				) : (
					<div className={cn("flex h-full min-h-0", isMobile && "flex-col")}>
						{isMobile ? null : (
							<ScrollArea className="w-56 shrink-0 border-r border-border">
								<InterviewList
									items={interviewIds}
									selectedId={selectedInterviewId}
									roundLimit={roundLimit}
									resolvePersona={store.personaById}
									interviewOf={(id) => interviewByPersona.get(id)}
									onSelect={onFocusInterview}
								/>
							</ScrollArea>
						)}
						<div className="flex min-h-0 min-w-0 flex-1 flex-col">
							{selectedInterview ? (
								<div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
									{isMobile ? (
										<Button
											variant="ghost"
											size="sm"
											className="-ml-2"
											onClick={() => onFocusInterview(null)}
										>
											<ArrowLeft className="size-4" />
											{t("console.backToList")}
										</Button>
									) : (
										<span className="min-w-0 flex-1 truncate text-sm font-medium">
											{store.personaById(selectedInterview.persona_id)
												?.name ?? selectedInterview.persona_id}
										</span>
									)}
									<span className="ml-auto flex items-center gap-1">
										<span className="text-xs tabular-nums text-muted-foreground">
											{selectedIndex + 1}/{interviewIds.length}
										</span>
										<MagicTooltip title={t("console.previous")}>
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												aria-label={t("console.previous")}
												disabled={selectedIndex <= 0}
												onClick={() =>
													onFocusInterview(
														interviewIds[selectedIndex - 1] ?? null,
													)
												}
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
												disabled={selectedIndex >= interviewIds.length - 1}
												onClick={() =>
													onFocusInterview(
														interviewIds[selectedIndex + 1] ?? null,
													)
												}
											>
												<ChevronRight className="size-4" />
											</Button>
										</MagicTooltip>
									</span>
								</div>
							) : null}
							<ScrollArea className="min-h-0 flex-1">
								<div className="mx-auto max-w-3xl p-4">
									{selectedInterview ? (
										<TranscriptView
											transcript={selectedInterview}
											respondentId={selectedInterview.persona_id}
											resolvePersona={store.personaById}
										/>
									) : null}
								</div>
							</ScrollArea>
						</div>
					</div>
				)}
			</TabsContent>

			<TabsContent value="discussions" className="mt-0 min-h-0 flex-1">
				{discussions.length === 0 ? (
					<ConsoleEmpty
						icon={MessagesSquare}
						title={t("console.discussionsEmptyTitle")}
						text={t("console.discussionsEmpty")}
					/>
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
								{(discussions[activeDiscussionIndex]?.data.participants ?? []).map(
									(id) => (
										<PersonaAvatar
											key={id}
											id={id}
											name={store.personaById(id)?.name ?? id}
											className="size-6 border-2 border-background text-[10px]"
										/>
									),
								)}
							</span>
							<span className="text-xs text-muted-foreground">
								{t("console.participants", {
									count:
										discussions[activeDiscussionIndex]?.data.participants
											.length ?? 0,
								})}
							</span>
						</div>
						<ScrollArea className="min-h-0 flex-1">
							<div className="mx-auto max-w-3xl p-4">
								{discussions[activeDiscussionIndex] ? (
									<TranscriptView
										transcript={discussions[activeDiscussionIndex].data}
										resolvePersona={store.personaById}
									/>
								) : null}
							</div>
						</ScrollArea>
					</div>
				)}
			</TabsContent>

			{/* Keep the file preview mounted so its tabs and renderer caches survive tab switches. */}
			<TabsContent
				value="files"
				forceMount
				className={cn("relative mt-0 min-h-0 flex-1", activeTab !== "files" && "hidden")}
			>
				{filesPane}
				{!studyAttachments?.report && phaseRunning("report") ? (
					<div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3">
						<span className="flex items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
							<span className="size-1.5 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
							{t("console.reportGenerating")}
						</span>
					</div>
				) : null}
			</TabsContent>

			<TabsContent value="validation" className="mt-0 min-h-0 flex-1">
				{validationFile ? (
					<ScrollArea className="h-full">
						<div className="mx-auto max-w-3xl p-5">
							<MarkdownFilePane file={validationFile} copyable />
						</div>
					</ScrollArea>
				) : (
					<ConsoleEmpty
						icon={ClipboardCheck}
						title={t("console.validationEmptyTitle")}
						text={t("console.validationEmpty")}
					/>
				)}
			</TabsContent>
		</Tabs>
	)
}

function ConsoleEmpty({
	icon: Icon,
	title,
	text,
}: {
	icon: LucideIcon
	title: string
	text: string
}) {
	return (
		<Empty className="h-full border-0 py-12">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon />
				</EmptyMedia>
				<EmptyTitle className="text-sm">{title}</EmptyTitle>
				<EmptyDescription className="text-xs">{text}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	)
}

/** Placeholder cards while personas are being built, so the layout does not jump. */
function CardSkeletonGrid({ isMobile }: { isMobile: boolean }) {
	return (
		<div
			className={cn(
				"grid gap-3 p-4",
				isMobile ? "grid-cols-1" : "grid-cols-[repeat(auto-fill,minmax(200px,1fr))]",
			)}
			aria-busy
		>
			{Array.from({ length: isMobile ? 3 : 6 }, (_, index) => (
				<div
					key={index}
					className="flex flex-col gap-3 rounded-xl border border-border p-3.5"
				>
					<div className="flex items-center gap-2.5">
						<Skeleton className="size-10 rounded-full" />
						<div className="flex flex-1 flex-col gap-1.5">
							<Skeleton className="h-3.5 w-1/2" />
							<Skeleton className="h-3 w-3/4" />
						</div>
					</div>
					<Skeleton className="h-3 w-2/3" />
				</div>
			))}
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
	return (
		<ul className="flex flex-col gap-0.5 p-2">
			{items.map((id) => {
				const persona = resolvePersona(id)
				const interview = interviewOf(id)
				const answered =
					interview?.rounds.filter((round) => round.role === "persona").length ?? 0
				const ratio = Math.min(1, answered / Math.max(1, roundLimit))
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

export default observer(ResearchConsole)
