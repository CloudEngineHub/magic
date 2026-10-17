import { useEffect, useMemo, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { ArrowLeft, Share2 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import { Button } from "@/components/shadcn-ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { DetailRef } from "@/pages/superMagic/components/Detail"
import TopicSharePopover from "@/pages/superMagic/components/TopicSharePopover"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useNavigate } from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { cn } from "@/utils/cn"
import { usePersonaResearchStore } from "../context"
import ResearchConsole, { type ResearchConsoleTab } from "../components/ResearchConsole"
import ResearchConversationPanel, {
	type ResearchConversationPanelRef,
} from "../components/ResearchConversationPanel"
import ResearchFilesPane from "../components/ResearchFilesPane"
import PersonaDetailSheet from "../components/PersonaDetailSheet"
import StudyStepper from "../components/StudyStepper"
import { STUDY_PHASE_KEYS, type PersonaFile } from "../types"

/** Research studio: stepper, conversation on the left, study outputs on the right. */
function ResearchStudioPage() {
	const { t } = useTranslation("personaResearch")
	const { topicId } = useParams<{ topicId?: string }>()
	const navigate = useNavigate()
	const isMobile = useIsMobile()
	const store = usePersonaResearchStore()
	const conversationRef = useRef<ResearchConversationPanelRef>(null)
	const detailRef = useRef<DetailRef>(null)

	const [consoleTab, setConsoleTab] = useState<ResearchConsoleTab>("personas")
	const [mobileView, setMobileView] = useState<"conversation" | "outputs">("conversation")
	const [focusedInterviewId, setFocusedInterviewId] = useState<string | null>(null)
	const [openedPersona, setOpenedPersona] = useState<PersonaFile | null>(null)
	const [userSelectDetail, setUserSelectDetail] = useState<unknown>()
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const [shareOpen, setShareOpen] = useState(false)
	const openedReportVersionRef = useRef<string | null>(null)

	useEffect(() => {
		store.selectStudy(topicId)
	}, [store, topicId])

	const selectedTopic = store.selectedTopic
	const study = store.study
	const studyAttachments = store.studyAttachments
	const report = studyAttachments?.report ?? null

	const showOutputs = useMemoizedFn((tab: ResearchConsoleTab) => {
		setConsoleTab(tab)
		if (isMobile) setMobileView("outputs")
	})

	/** Files from the conversation open in the shared preview tab. */
	const handleFileClick = useMemoizedFn((fileItem?: unknown) => {
		showOutputs("files")
		setUserSelectDetail(undefined)
		// The preview tab is force-mounted; wait one frame so a hidden panel has layout.
		setTimeout(() => detailRef.current?.openFileTab?.(fileItem), 100)
	})

	/** Tool results (search results, browser steps) open as a detail view in the same tab. */
	const handleSelectDetail = useMemoizedFn((detail?: unknown) => {
		showOutputs("files")
		setUserSelectDetail(detail)
	})

	// Open the report once when it first appears (or is rewritten), without stealing focus later.
	useEffect(() => {
		if (!report?.file_id) return
		const key = `${report.file_id}:${report.updated_at ?? ""}`
		if (openedReportVersionRef.current === key) return
		const isFirstAppearance = openedReportVersionRef.current === null
		openedReportVersionRef.current = key
		if (isFirstAppearance && study?.phase !== "report") return
		setTimeout(() => detailRef.current?.openFileTab?.(report), 100)
	}, [report, study?.phase])

	const handleAskPersona = useMemoizedFn((persona: PersonaFile) => {
		setOpenedPersona(null)
		if (isMobile) setMobileView("conversation")
		// Defer until the composer is visible on mobile.
		setTimeout(
			() =>
				conversationRef.current?.fillComposer(
					t("persona.askPrompt", { name: persona.name }),
				),
			50,
		)
	})

	const handleOpenInterview = useMemoizedFn((personaId: string) => {
		setOpenedPersona(null)
		setFocusedInterviewId(personaId)
		showOutputs("interviews")
	})

	const progress = useMemo(() => {
		if (!study) return 0
		return study.phases.filter((phase) => phase.status === "done" || phase.status === "skipped")
			.length
	}, [study])
	const outputsCount = [report, studyAttachments?.validation].filter(Boolean).length

	const title = (selectedTopic && store.studyTitleOf(selectedTopic)) || t("study.untitled")

	if (!selectedTopic) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
				<p className="text-sm text-muted-foreground">{t("study.notFound")}</p>
				<Button
					variant="outline"
					onClick={() => navigate({ name: RouteName.PersonaResearch })}
				>
					{t("study.backHome")}
				</Button>
			</div>
		)
	}

	const header = (
		<div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3">
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					className="size-8"
					aria-label={t("study.backHome")}
					onClick={() => navigate({ name: RouteName.PersonaResearch })}
				>
					<ArrowLeft className="size-4" />
				</Button>
				<h1 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h1>
				<TopicSharePopover
					open={shareOpen}
					onOpenChange={setShareOpen}
					topicId={selectedTopic.id}
					topicTitle={title}
				>
					<Button variant="outline" size="sm">
						<Share2 className="size-4" />
						{isMobile ? null : t("study.share")}
					</Button>
				</TopicSharePopover>
			</div>
			<StudyStepper study={study} compact={isMobile} />
		</div>
	)

	const consoleNode = (
		<ResearchConsole
			activeTab={consoleTab}
			onTabChange={setConsoleTab}
			focusedInterviewPersonaId={focusedInterviewId}
			onFocusInterview={setFocusedInterviewId}
			onOpenPersona={setOpenedPersona}
			variant={isMobile ? "mobile" : "desktop"}
			filesPane={
				<ResearchFilesPane
					ref={detailRef}
					userSelectDetail={userSelectDetail}
					setUserSelectDetail={setUserSelectDetail}
					activeFileId={activeFileId}
					onActiveFileChange={setActiveFileId}
				/>
			}
		/>
	)

	const conversationNode = (
		<ResearchConversationPanel
			ref={conversationRef}
			variant={isMobile ? "mobile" : "desktop"}
			onFileClick={handleFileClick}
			onSelectDetail={handleSelectDetail}
		/>
	)

	const sheet = (
		<PersonaDetailSheet
			persona={openedPersona}
			interview={
				openedPersona
					? (store.interviews.find((ref) => ref.data.persona_id === openedPersona.id)
							?.data ?? null)
					: null
			}
			onOpenChange={(open) => !open && setOpenedPersona(null)}
			onAskPersona={handleAskPersona}
			onOpenInterview={handleOpenInterview}
			side={isMobile ? "bottom" : "right"}
		/>
	)

	if (isMobile) {
		return (
			<div
				className="flex h-full min-h-0 flex-col bg-background"
				data-testid="persona-research-studio"
			>
				{header}
				<div className="shrink-0 px-4 pt-2">
					<Tabs
						value={mobileView}
						onValueChange={(value) => setMobileView(value as typeof mobileView)}
					>
						<TabsList className="w-full">
							<TabsTrigger value="conversation" className="flex-1">
								{t("study.conversation")}
							</TabsTrigger>
							<TabsTrigger value="outputs" className="flex-1">
								{t("study.outputs")}
							</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
				{/* Both views stay mounted so the composer draft and preview tabs survive switching. */}
				<div className={cn("min-h-0 flex-1", mobileView !== "conversation" && "hidden")}>
					{conversationNode}
				</div>
				<div className={cn("min-h-0 flex-1", mobileView !== "outputs" && "hidden")}>
					{consoleNode}
				</div>
				{sheet}
			</div>
		)
	}

	return (
		<div
			className="flex h-full min-h-0 flex-col bg-background"
			data-testid="persona-research-studio"
		>
			{header}
			<div className="flex min-h-0 flex-1">
				{/* Fixed conversation width keeps the composer usable while outputs take the rest. */}
				<div className="flex w-[440px] min-w-[360px] shrink-0 flex-col border-r border-border">
					{conversationNode}
				</div>
				<div className="min-w-0 flex-1">{consoleNode}</div>
			</div>
			<div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-1.5 text-xs text-muted-foreground">
				<span>
					{t("study.progress", { done: progress, total: STUDY_PHASE_KEYS.length })}
				</span>
				<button
					type="button"
					className="hover:text-foreground"
					onClick={() => showOutputs("files")}
				>
					{t("study.outputsCount", { count: outputsCount })}
				</button>
				<button
					type="button"
					className="hover:text-foreground"
					onClick={() => showOutputs("personas")}
				>
					{t("study.personasCount", { count: store.studyPersonas.length })}
				</button>
			</div>
			{sheet}
		</div>
	)
}

export default observer(ResearchStudioPage)
