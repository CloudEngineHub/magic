import { useEffect, useRef, useState, type ReactNode } from "react"
import { FileSearch, Info, Link2, MessagesSquare, UsersRound } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { Button } from "@/components/shadcn-ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { FileAccessContext } from "@/pages/superMagic/fileAccess/fileAccessContext"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import { RouteName } from "@/routes/constants"
import { getRoutePath } from "@/routes/history/helpers"
import { cn } from "@/utils/cn"
import { PersonaResearchStoreProvider, usePersonaResearchStore } from "../context"
import PersonaAvatar from "../components/PersonaAvatar"
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
	const report = studyAttachments?.report ?? null
	const documentFile = openedFile ?? report ?? studyAttachments?.plan ?? null

	// Land on the report once it is known; later tab choices are the viewer's.
	const landedOnReportRef = useRef(false)
	useEffect(() => {
		if (!report || landedOnReportRef.current) return
		landedOnReportRef.current = true
		setConsoleTab("report")
	}, [report])

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

	const copyLink = () => {
		navigator.clipboard
			.writeText(window.location.href)
			.then(() => toast.success(t("share.linkCopied")))
			.catch(() => toast.error(t("share.copyFailed")))
	}
	const researchHomeHref =
		getRoutePath({ name: RouteName.PersonaResearch }) ?? window.location.origin

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
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<span className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground">
							<UsersRound className="size-3.5" />
							{t("share.eyebrow")}
						</span>
						<h1
							className={cn(
								"text-balance font-black tracking-tight text-foreground",
								isMobile ? "text-xl" : "text-[30px] leading-tight",
							)}
						>
							{title}
						</h1>
						<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
							{store.studyPersonas.length ? (
								<span className="flex -space-x-1.5">
									{store.studyPersonas.slice(0, 8).map((persona) => (
										<PersonaAvatar
											key={persona.id}
											id={persona.id}
											name={persona.name}
											className="size-6 ring-2 ring-background"
										/>
									))}
								</span>
							) : null}
							{metaChips.length ? <span>{metaChips.join(" · ")}</span> : null}
							{/* The sample note stays on the cover so screenshots keep the AI context. */}
							<span className="inline-flex items-center gap-1">
								<Info className="size-3.5" />
								{t("study.aiDisclaimer")}
							</span>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							className="h-8 gap-1.5"
							onClick={copyLink}
						>
							<Link2 className="size-3.5" />
							{isMobile ? null : t("share.copyLink")}
						</Button>
						<Button size="sm" className="h-8 gap-1.5" asChild>
							{/* Visitors land on the research home (sign-in first when needed). */}
							<a href={researchHomeHref} target="_blank" rel="noreferrer">
								<UsersRound className="size-3.5" />
								{t("share.makeYourOwn")}
							</a>
						</Button>
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
				{/* A finished study needs no phase tracker; the cover facts already say what was done. */}
				{activeView === "results" && !isPersonaBuild && study?.phase !== "done" ? (
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
						reportPane={<ShareDocumentPane file={report} />}
						filesPane={<ShareDocumentPane file={documentFile} />}
						activeFileId={documentFile ? String(documentFile.file_id) : null}
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
