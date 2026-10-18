import { useEffect, useState, type ReactNode } from "react"
import { FileSearch, MessagesSquare, Sparkles } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { FileAccessContext } from "@/pages/superMagic/fileAccess/fileAccessContext"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { cn } from "@/utils/cn"
import { PersonaResearchStoreProvider, usePersonaResearchStore } from "../context"
import PersonaDetailSheet from "../components/PersonaDetailSheet"
import ResearchConsole, {
	ResearchConsoleSkeleton,
	type ResearchConsoleTab,
} from "../components/ResearchConsole"
import StudyStepper, { StudyStepperSkeleton } from "../components/StudyStepper"
import type { PersonaFile } from "../types"
import ShareDocumentPane from "./ShareDocumentPane"

export interface ResearchShareViewProps {
	topicId: string
	topicName: string
	projectId: string
	projectName: string
	/** Share file list as loaded by the share page: `{ tree, list }`. */
	attachments: { tree?: AttachmentItem[]; list?: AttachmentItem[] }
	access: FileAccessContext
	/** The ordinary conversation replay, kept as the last view. */
	replay: ReactNode
	isMobile: boolean
}

/**
 * Share page for an AI research topic: the study's results first (conclusions, personas,
 * interviews, analysis, report, questionnaire), the conversation replay last. Read-only.
 */
export default function ResearchShareView(props: ResearchShareViewProps) {
	return (
		<PersonaResearchStoreProvider bootstrap={false}>
			<ResearchShareBody {...props} />
		</PersonaResearchStoreProvider>
	)
}

const ResearchShareBody = observer(function ResearchShareBody({
	topicId,
	topicName,
	projectId,
	projectName,
	attachments,
	access,
	replay,
	isMobile,
}: ResearchShareViewProps) {
	const { t } = useTranslation("personaResearch")
	const store = usePersonaResearchStore()
	const [view, setView] = useState<"results" | "replay">("results")
	const [consoleTab, setConsoleTab] = useState<ResearchConsoleTab>("hypotheses")
	const [focusedInterviewId, setFocusedInterviewId] = useState<string | null>(null)
	const [openedPersona, setOpenedPersona] = useState<PersonaFile | null>(null)
	const [openedFile, setOpenedFile] = useState<AttachmentItem | null>(null)

	// The share page loads files in pages; feed the store again whenever the list grows.
	const list = attachments.list
	useEffect(() => {
		if (!list) return
		store.initShare({
			topic: {
				id: topicId,
				topic_name: topicName,
				task_status: TaskStatus.FINISHED,
			} as Topic,
			project: { id: projectId, project_name: projectName } as ProjectListItem,
			tree: attachments.tree ?? [],
			list,
			access,
		})
		// attachments.tree changes together with list.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [access, list, projectId, projectName, store, topicId, topicName])

	const study = store.study
	const studyAttachments = store.studyAttachments
	const isLoading = !list || store.isStudyContentLoading
	// Without study files (the sharer hid the file list) only the replay is meaningful.
	const hasResults = Boolean(study || studyAttachments)
	const activeView = !isLoading && !hasResults ? "replay" : view
	const documentFile = openedFile ?? studyAttachments?.report ?? studyAttachments?.plan ?? null

	const sharedTopic = store.selectedTopic
	const title =
		(sharedTopic && store.studyTitleOf(sharedTopic)) || topicName || t("study.untitled")

	// Persona building has no plan, interviews or report: no phase stepper and no study scale.
	const isPersonaBuild = study?.study_type === "persona_build"
	const metaChips = [
		study?.study_type ? t(`studyType.${camel(study.study_type)}`) : null,
		study?.framework?.length ? study.framework.join(" · ") : null,
		study?.limits?.personas && !isPersonaBuild
			? t("study.scale", {
					personas: study.limits.personas,
					rounds: study.limits.interview_rounds ?? 5,
				})
			: null,
	].filter((chip): chip is string => Boolean(chip))

	const openFile = (file: AttachmentItem) => {
		setOpenedFile(file)
		setConsoleTab("files")
	}

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-background"
			data-testid="persona-research-share"
		>
			<header
				className={cn(
					"flex shrink-0 flex-col gap-3 border-b border-border",
					isMobile ? "px-4 py-3" : "px-6 pb-3 pt-5",
				)}
			>
				<div className="flex flex-wrap items-start gap-3">
					<div className="flex min-w-0 flex-1 flex-col gap-1.5">
						<span className="inline-flex w-fit items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
							<Sparkles className="size-3.5" />
							{t("share.eyebrow")}
						</span>
						<h1
							className={cn(
								"text-balance font-semibold tracking-tight text-foreground",
								isMobile ? "text-lg" : "text-2xl",
							)}
						>
							{title}
						</h1>
						{metaChips.length ? (
							<div className="flex flex-wrap items-center gap-1.5">
								{metaChips.map((chip) => (
									<span
										key={chip}
										className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
									>
										{chip}
									</span>
								))}
								<span className="text-[11px] text-muted-foreground">
									{t("study.aiDisclaimer")}
								</span>
							</div>
						) : null}
					</div>
					{hasResults ? (
						<Tabs
							value={activeView}
							onValueChange={(value) => setView(value as typeof view)}
						>
							<TabsList>
								<TabsTrigger value="results" className="gap-1.5">
									<FileSearch className="size-3.5" />
									{t("share.results")}
								</TabsTrigger>
								<TabsTrigger value="replay" className="gap-1.5">
									<MessagesSquare className="size-3.5" />
									{t("share.replay")}
								</TabsTrigger>
							</TabsList>
						</Tabs>
					) : null}
				</div>
				{activeView === "results" && !isPersonaBuild ? (
					isLoading ? (
						<StudyStepperSkeleton compact={isMobile} />
					) : (
						<StudyStepper study={study} compact={isMobile} />
					)
				) : null}
			</header>

			{!isLoading && !hasResults ? (
				<p className="shrink-0 border-b border-border bg-muted/40 px-6 py-2 text-xs text-muted-foreground">
					{t("share.noStudyFiles")}
				</p>
			) : null}

			<div className="min-h-0 flex-1">
				{activeView === "replay" ? (
					replay
				) : isLoading ? (
					<ResearchConsoleSkeleton />
				) : (
					<ResearchConsole
						activeTab={consoleTab}
						onTabChange={setConsoleTab}
						focusedInterviewPersonaId={focusedInterviewId}
						onFocusInterview={setFocusedInterviewId}
						onOpenPersona={setOpenedPersona}
						onOpenFile={openFile}
						onRequestValidationUpload={() => undefined}
						variant={isMobile ? "mobile" : "desktop"}
						filesPane={<ShareDocumentPane file={documentFile} />}
					/>
				)}
			</div>

			<PersonaDetailSheet
				persona={openedPersona}
				interview={
					openedPersona
						? (store.interviews.find((ref) => ref.data.persona_id === openedPersona.id)
								?.data ?? null)
						: null
				}
				onOpenChange={(open) => !open && setOpenedPersona(null)}
				onOpenInterview={(personaId) => {
					setOpenedPersona(null)
					setFocusedInterviewId(personaId)
					setConsoleTab("interviews")
				}}
				side={isMobile ? "bottom" : "right"}
			/>
		</div>
	)
})

/** "user_research" → "userResearch", matching the studyType locale keys. */
function camel(value: string) {
	return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}
