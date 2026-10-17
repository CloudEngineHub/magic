import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import type { PersonaFile } from "../types"
import MarkdownFilePane from "./MarkdownFilePane"
import PersonaAvatar from "./PersonaAvatar"
import PersonaCard from "./PersonaCard"
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
	const validationFile = store.studyAttachments?.validation ?? null
	const interviewByPersona = useMemo(
		() => new Map(interviews.map((ref) => [ref.data.persona_id, ref.data])),
		[interviews],
	)
	const doneCount = interviews.filter((ref) => ref.data.status === "done").length
	const [activeDiscussionIndex, setActiveDiscussionIndex] = useState(0)
	const isMobile = variant === "mobile"

	// Desktop shows the first interview by default; mobile starts on the list.
	const selectedInterviewId =
		focusedInterviewPersonaId ?? (isMobile ? null : (interviews[0]?.data.persona_id ?? null))
	const selectedInterview = selectedInterviewId
		? (interviewByPersona.get(selectedInterviewId) ?? null)
		: null

	useEffect(() => {
		if (activeDiscussionIndex >= discussions.length) setActiveDiscussionIndex(0)
	}, [activeDiscussionIndex, discussions.length])

	const emptyHint = (text: string) => (
		<p className="p-6 text-center text-sm text-muted-foreground">{text}</p>
	)

	return (
		<Tabs
			value={activeTab}
			onValueChange={(value) => onTabChange(value as ResearchConsoleTab)}
			className="flex h-full min-h-0 flex-col"
			data-testid="persona-research-console"
		>
			<div className="shrink-0 overflow-x-auto px-3 pt-3">
				<TabsList>
					<TabsTrigger value="personas">
						{t("console.personas")}
						{personas.length > 0 ? ` ${personas.length}` : ""}
					</TabsTrigger>
					<TabsTrigger value="interviews">
						{t("console.interviews")}
						{interviews.length > 0 ? ` ${doneCount}/${interviews.length}` : ""}
					</TabsTrigger>
					<TabsTrigger value="discussions">
						{t("console.discussions")}
						{discussions.length > 0 ? ` ${discussions.length}` : ""}
					</TabsTrigger>
					<TabsTrigger value="files">{t("console.files")}</TabsTrigger>
					<TabsTrigger value="validation">{t("console.validation")}</TabsTrigger>
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
						emptyHint(t("console.personasEmpty"))
					) : (
						<div
							className={cn(
								"grid gap-3 p-3",
								isMobile
									? "grid-cols-1"
									: "grid-cols-[repeat(auto-fill,minmax(180px,1fr))]",
							)}
						>
							{personas.map((persona) => (
								<PersonaCard
									key={persona.id}
									persona={persona}
									interviewStatus={interviewByPersona.get(persona.id)?.status}
									onOpen={() => onOpenPersona(persona)}
								/>
							))}
						</div>
					)}
				</ScrollArea>
			</TabsContent>

			<TabsContent value="interviews" className="mt-0 min-h-0 flex-1">
				{interviews.length === 0 ? (
					emptyHint(t("console.interviewsEmpty"))
				) : isMobile && !selectedInterview ? (
					<ScrollArea className="h-full">
						<InterviewList
							items={interviews.map((ref) => ref.data.persona_id)}
							selectedId={null}
							resolvePersona={store.personaById}
							statusOf={(id) => interviewByPersona.get(id)?.status}
							onSelect={onFocusInterview}
						/>
					</ScrollArea>
				) : (
					<div className={cn("flex h-full min-h-0", isMobile && "flex-col")}>
						{isMobile ? (
							<div className="shrink-0 px-3 pt-2">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => onFocusInterview(null)}
								>
									<ArrowLeft className="size-4" />
									{t("console.backToList")}
								</Button>
							</div>
						) : (
							<ScrollArea className="w-48 shrink-0 border-r border-border">
								<InterviewList
									items={interviews.map((ref) => ref.data.persona_id)}
									selectedId={selectedInterviewId}
									resolvePersona={store.personaById}
									statusOf={(id) => interviewByPersona.get(id)?.status}
									onSelect={onFocusInterview}
								/>
							</ScrollArea>
						)}
						<ScrollArea className="min-h-0 flex-1">
							<div className="p-3">
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
				)}
			</TabsContent>

			<TabsContent value="discussions" className="mt-0 min-h-0 flex-1">
				{discussions.length === 0 ? (
					emptyHint(t("console.discussionsEmpty"))
				) : (
					<div className="flex h-full min-h-0 flex-col">
						{discussions.length > 1 ? (
							<div className="flex shrink-0 gap-2 px-3 pt-2">
								{discussions.map((ref, index) => (
									<Button
										key={ref.fileId}
										size="sm"
										variant={
											index === activeDiscussionIndex ? "secondary" : "ghost"
										}
										onClick={() => setActiveDiscussionIndex(index)}
									>
										{t("console.discussionN", { index: index + 1 })}
									</Button>
								))}
							</div>
						) : null}
						<ScrollArea className="min-h-0 flex-1">
							<div className="p-3">
								{discussions[activeDiscussionIndex] ? (
									<>
										<div className="mb-3 flex flex-wrap items-center gap-2">
											{discussions[
												activeDiscussionIndex
											].data.participants.map((id) => {
												const persona = store.personaById(id)
												return (
													<span
														key={id}
														className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
													>
														<PersonaAvatar
															id={id}
															name={persona?.name ?? id}
															className="size-4 text-[9px]"
														/>
														{persona?.name ?? id}
													</span>
												)
											})}
										</div>
										<TranscriptView
											transcript={discussions[activeDiscussionIndex].data}
											resolvePersona={store.personaById}
										/>
									</>
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
				className={cn("mt-0 min-h-0 flex-1", activeTab !== "files" && "hidden")}
			>
				{filesPane}
			</TabsContent>

			<TabsContent value="validation" className="mt-0 min-h-0 flex-1">
				{validationFile ? (
					<ScrollArea className="h-full">
						<div className="p-4">
							<MarkdownFilePane file={validationFile} copyable />
						</div>
					</ScrollArea>
				) : (
					emptyHint(t("console.validationEmpty"))
				)}
			</TabsContent>
		</Tabs>
	)
}

function InterviewList({
	items,
	selectedId,
	resolvePersona,
	statusOf,
	onSelect,
}: {
	items: string[]
	selectedId: string | null
	resolvePersona: (id: string) => PersonaFile | null
	statusOf: (id: string) => "done" | "running" | "failed" | undefined
	onSelect: (id: string) => void
}) {
	const { t } = useTranslation("personaResearch")
	return (
		<ul className="flex flex-col gap-1 p-2">
			{items.map((id) => {
				const persona = resolvePersona(id)
				const status = statusOf(id)
				return (
					<li key={id}>
						<button
							type="button"
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
								selectedId === id && "bg-accent",
							)}
							onClick={() => onSelect(id)}
						>
							<PersonaAvatar
								id={id}
								name={persona?.name ?? id}
								className="size-6 text-xs"
							/>
							<span className="min-w-0 flex-1 truncate">{persona?.name ?? id}</span>
							<span
								className={cn(
									"text-[11px] text-muted-foreground",
									status === "failed" && "text-destructive",
								)}
							>
								{status === "done"
									? t("persona.interviewDone")
									: status === "failed"
										? t("persona.interviewFailed")
										: t("persona.interviewRunning")}
							</span>
						</button>
					</li>
				)
			})}
		</ul>
	)
}

export default observer(ResearchConsole)
