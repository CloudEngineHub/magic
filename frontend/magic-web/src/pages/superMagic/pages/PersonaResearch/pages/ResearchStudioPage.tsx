import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import {
	ArrowLeft,
	ChevronDown,
	FileSearch,
	Maximize2,
	PanelRightClose,
	PanelRightOpen,
	PencilLine,
	Share2,
} from "lucide-react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { Button } from "@/components/shadcn-ui/button"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/shadcn-ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import MagicTooltip from "@/components/base/MagicTooltip"
import type { DetailRef } from "@/pages/superMagic/components/Detail"
import TopicSharePopover from "@/pages/superMagic/components/TopicSharePopover"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useNavigate } from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { cn } from "@/utils/cn"
import { platformKey } from "@/utils/storage"
import { usePersonaResearchStore } from "../context"
import { useResearchDetailEvents } from "../hooks/useResearchDetailEvents"
import ResearchConsole, {
	ResearchConsoleSkeleton,
	type ResearchConsoleTab,
} from "../components/ResearchConsole"
import ResearchConversationPanel, {
	type ResearchConversationPanelRef,
} from "../components/ResearchConversationPanel"
import ResearchFilesPane from "../components/ResearchFilesPane"
import ResearchReportPane, { type ResearchReportPaneRef } from "../components/ResearchReportPane"
import PersonaDetailSheet from "../components/PersonaDetailSheet"
import StudyStepper, { StudyStepperSkeleton } from "../components/StudyStepper"
import StudyTitleEditor from "../components/StudyTitleEditor"
import {
	StudyProgressSegments,
	StudyStatusBadge,
	StudyStatusBadgeSkeleton,
} from "../components/StudyStatusBadge"
import { resolveStudyStatus } from "../services/studyStatus"
import type { PersonaFile, StudyFile, StudyPhaseKey } from "../types"

/** Which output tab follows each phase while the study runs (clarify stays in the conversation). */
const PHASE_TAB: Partial<Record<StudyFile["phase"], ResearchConsoleTab>> = {
	plan: "hypotheses",
	interview: "personas",
	report: "report",
	validation: "report",
	// Finished studies open on the report, the deliverable a decision maker reads first.
	done: "report",
}

/** Research studio: stepper, conversation on the left, study outputs on the right. */
function ResearchStudioPage() {
	const { t } = useTranslation("personaResearch")
	const { topicId } = useParams<{ topicId?: string }>()
	const navigate = useNavigate()
	const isMobile = useIsMobile()
	const store = usePersonaResearchStore()
	const conversationRef = useRef<ResearchConversationPanelRef>(null)
	const detailRef = useRef<DetailRef>(null)

	const [consoleTab, setConsoleTab] = useState<ResearchConsoleTab>("hypotheses")
	const [mobileView, setMobileView] = useState<"conversation" | "outputs">("conversation")
	const [focusedInterviewId, setFocusedInterviewId] = useState<string | null>(null)
	const [openedPersona, setOpenedPersona] = useState<PersonaFile | null>(null)
	const [userSelectDetail, setUserSelectDetail] = useState<unknown>()
	const [autoDetail, setAutoDetail] = useState<unknown>()
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const [shareOpen, setShareOpen] = useState(false)
	const followedPhaseRef = useRef<string | null>(null)
	const reportPaneRef = useRef<ResearchReportPaneRef>(null)
	const conversationPanelRef = useRef<ImperativePanelHandle>(null)
	const [conversationCollapsed, setConversationCollapsed] = useState(false)
	// Finished studies fold the six-step stepper into a small toggle to give the report room.
	const [stepperOpen, setStepperOpen] = useState(false)

	useEffect(() => {
		store.selectStudy(topicId)
		followedPhaseRef.current = null
		// Tool steps belong to one study's conversation; never carry them into another study.
		setUserSelectDetail(undefined)
		setAutoDetail(undefined)
	}, [store, topicId])

	const selectedTopic = store.selectedTopic
	const study = store.study
	const studyAttachments = store.studyAttachments
	const report = studyAttachments?.report ?? null
	const status = resolveStudyStatus(selectedTopic, study)
	const isContentLoading = store.isStudyContentLoading
	// Persona building has no plan, interviews or report: no phase stepper and no study scale.
	const isPersonaBuild = study?.study_type === "persona_build"
	const reportWriting =
		study?.phases.some((phase) => phase.key === "report" && phase.status === "running") ?? false

	const showOutputs = useMemoizedFn((tab: ResearchConsoleTab) => {
		setConsoleTab(tab)
		if (isMobile) setMobileView("outputs")
	})

	/** Files from the conversation open in the shared preview tab. */
	const openFile = useMemoizedFn((fileItem?: unknown) => {
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

	// An empty files tab is a dead end: the first visit per study opens the report (or the plan
	// before it exists). Later, closing every tab is the user's choice and stays empty.
	const defaultFile = report ?? studyAttachments?.plan ?? null
	const filesOpenedRef = useRef(false)
	useEffect(() => {
		filesOpenedRef.current = false
	}, [topicId])
	useEffect(() => {
		if (consoleTab !== "files" || filesOpenedRef.current) return
		// autoDetail is the conversation's latest tool step, pushed on load even when no tab shows it.
		if (activeFileId || userSelectDetail) {
			filesOpenedRef.current = true
			return
		}
		if (!defaultFile) return
		filesOpenedRef.current = true
		openFile(defaultFile)
	}, [activeFileId, consoleTab, defaultFile, openFile, userSelectDetail])

	// Message cards open previews through pubsub (tool playback, file mentions, citations).
	useResearchDetailEvents({
		detailRef,
		attachmentList: store.attachmentList,
		revealFiles: () => showOutputs("files"),
		setActiveFileId,
		setAutoDetail,
	})

	/**
	 * The output panel follows the study once per phase change (personas when interviews start,
	 * report when it is written). A user's later manual tab choice is kept until the next phase.
	 * On first load the panel jumps to the current phase without replaying earlier ones.
	 */
	useEffect(() => {
		const phase = study?.phase
		if (!phase || followedPhaseRef.current === phase) return
		followedPhaseRef.current = phase
		// A finished study without a report (persona building) opens on what it did produce.
		const tab =
			phase === "done" && !report
				? isPersonaBuild
					? "personas"
					: "hypotheses"
				: PHASE_TAB[phase]
		if (tab && !isMobile) setConsoleTab(tab)
		// Only phase changes move the panel; the report arriving later must not steal focus.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isMobile, study?.phase])

	const toggleConversation = useMemoizedFn(() => {
		const panel = conversationPanelRef.current
		if (!panel) return
		if (panel.isCollapsed()) panel.expand()
		else panel.collapse()
	})

	/** Stepper shortcuts: each finished or running phase opens its own output. */
	const handleStepClick = useMemoizedFn((key: StudyPhaseKey) => {
		const fileByStep: Partial<Record<StudyPhaseKey, AttachmentItem | null | undefined>> = {
			plan: studyAttachments?.plan,
			desk_research: studyAttachments?.deskResearch,
			report: studyAttachments?.report,
		}
		if (key === "clarify") {
			if (isMobile) setMobileView("conversation")
			return
		}
		if (key === "interview") return showOutputs("interviews")
		if (key === "validation") return showOutputs("validation")
		if (key === "report") return showOutputs("report")
		const file = fileByStep[key]
		if (file) openFile(file)
		else showOutputs("files")
	})

	/** Real answers are uploaded as conversation attachments; the agent does the comparison. */
	const handleRequestValidationUpload = useMemoizedFn(() => {
		if (isMobile) setMobileView("conversation")
		setTimeout(() => conversationRef.current?.fillComposer(t("validation.uploadPrompt")), 50)
		toast.info(t("validation.uploadHint"))
	})

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

	const title = (selectedTopic && store.studyTitleOf(selectedTopic)) || t("study.untitled")
	const outputsCount = [report, studyAttachments?.validation].filter(Boolean).length

	if (!selectedTopic) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FileSearch />
					</EmptyMedia>
					<EmptyTitle>{t("study.notFoundTitle")}</EmptyTitle>
					<EmptyDescription>{t("study.notFound")}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button
						variant="outline"
						onClick={() => navigate({ name: RouteName.PersonaResearch })}
					>
						{t("study.backHome")}
					</Button>
				</EmptyContent>
			</Empty>
		)
	}

	const studyTypeLabel = study?.study_type
		? {
				user_research: t("studyType.userResearch"),
				product_rnd: t("studyType.productRnd"),
				concept_test: t("studyType.conceptTest"),
				fast_insight: t("studyType.fastInsight"),
				panel_only: t("studyType.panelOnly"),
				persona_build: t("studyType.personaBuild"),
			}[study.study_type]
		: null
	const metaChips = [
		studyTypeLabel,
		study?.framework?.length ? study.framework.join(" · ") : null,
		study?.limits?.personas && !isPersonaBuild
			? t("study.scale", {
					personas: study.limits.personas,
					rounds: study.limits.interview_rounds ?? 5,
				})
			: null,
	].filter((chip): chip is string => Boolean(chip))

	const header = (
		<div className="flex shrink-0 flex-col gap-3 border-b border-border px-4 pb-3 pt-3">
			<div className="flex items-center gap-2">
				<MagicTooltip title={t("study.backHome")}>
					<Button
						variant="ghost"
						size="icon"
						className="size-8 shrink-0"
						aria-label={t("study.backHome")}
						onClick={() => navigate({ name: RouteName.PersonaResearch })}
					>
						<ArrowLeft className="size-4" />
					</Button>
				</MagicTooltip>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<div className="flex min-w-0 items-center gap-2">
						<StudyTitleEditor
							topicId={selectedTopic.id}
							title={store.studyTitleOf(selectedTopic)}
						/>
						{isContentLoading ? (
							<StudyStatusBadgeSkeleton />
						) : (
							<StudyStatusBadge status={status} />
						)}
						{status.kind === "done" && !isPersonaBuild && !isContentLoading ? (
							<Button
								variant="ghost"
								size="sm"
								className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
								aria-expanded={stepperOpen}
								onClick={() => setStepperOpen((open) => !open)}
							>
								{t("study.progressToggle", {
									done: status.completed,
									total: status.total,
								})}
								<ChevronDown
									className={cn(
										"size-3.5 transition-transform",
										stepperOpen && "rotate-180",
									)}
								/>
							</Button>
						) : null}
					</div>
					{metaChips.length && !isMobile ? (
						<div className="flex flex-wrap items-center gap-1.5">
							{metaChips.map((chip) => (
								<span
									key={chip}
									className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
								>
									{chip}
								</span>
							))}
						</div>
					) : null}
				</div>
				{isMobile ? null : (
					<MagicTooltip
						title={
							conversationCollapsed
								? t("study.expandConversation")
								: t("study.collapseConversation")
						}
					>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 shrink-0"
							aria-label={
								conversationCollapsed
									? t("study.expandConversation")
									: t("study.collapseConversation")
							}
							onClick={toggleConversation}
						>
							{conversationCollapsed ? (
								<PanelRightOpen className="size-4" />
							) : (
								<PanelRightClose className="size-4" />
							)}
						</Button>
					</MagicTooltip>
				)}
				<TopicSharePopover
					// Shared research shows its results from study files; warn before hiding them.
					fileListOffHint={t("share.fileListOffHint")}
					open={shareOpen}
					onOpenChange={setShareOpen}
					topicId={selectedTopic.id}
					topicTitle={title}
				>
					<Button
						variant="outline"
						size={isMobile ? "icon" : "sm"}
						className={cn(isMobile && "size-8")}
						aria-label={t("study.share")}
					>
						<Share2 className="size-4" />
						{isMobile ? null : t("study.share")}
					</Button>
				</TopicSharePopover>
			</div>
			{isContentLoading ? (
				<StudyStepperSkeleton compact={isMobile} />
			) : isPersonaBuild || (status.kind === "done" && !stepperOpen) ? null : (
				<StudyStepper
					study={study}
					compact={isMobile}
					waitingForUser={status.kind === "waiting_user"}
					onStepClick={handleStepClick}
				/>
			)}
		</div>
	)

	const consoleNode = isContentLoading ? (
		<ResearchConsoleSkeleton />
	) : (
		<ResearchConsole
			activeTab={consoleTab}
			onTabChange={setConsoleTab}
			focusedInterviewPersonaId={focusedInterviewId}
			onFocusInterview={setFocusedInterviewId}
			onOpenPersona={setOpenedPersona}
			onOpenFile={openFile}
			onRequestValidationUpload={handleRequestValidationUpload}
			variant={isMobile ? "mobile" : "desktop"}
			activeFileId={activeFileId}
			reportPane={<ResearchReportPane ref={reportPaneRef} generating={reportWriting} />}
			reportActions={
				report ? (
					<>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 px-2 text-xs"
							onClick={() => reportPaneRef.current?.enterFullscreen()}
						>
							<Maximize2 className="size-3.5" />
							{t("report.fullscreen")}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1.5 px-2 text-xs"
							onClick={() => openFile(report)}
						>
							<PencilLine className="size-3.5" />
							{t("report.editDownload")}
						</Button>
					</>
				) : null
			}
			filesPane={
				<ResearchFilesPane
					ref={detailRef}
					userSelectDetail={userSelectDetail}
					autoDetail={autoDetail}
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
			onFileClick={openFile}
			onSelectDetail={handleSelectDetail}
			onAutoDetailChange={setAutoDetail}
			onShowOutputs={showOutputs}
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
							<TabsTrigger value="outputs" className="flex-1 gap-1.5">
								{t("study.outputs")}
								{outputsCount + store.studyPersonas.length > 0 ? (
									<span className="rounded-full bg-primary/10 px-1.5 text-[10px] font-medium text-primary">
										{outputsCount + store.studyPersonas.length}
									</span>
								) : null}
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
			{/* Outputs on the left, conversation on the right; v2 key drops layouts saved in the old order. */}
			<ResizablePanelGroup
				direction="horizontal"
				autoSaveId={platformKey("persona-research-studio-layout-v2")}
				className="min-h-0 flex-1"
			>
				<ResizablePanel id="outputs" order={1} defaultSize={64} minSize={40}>
					{consoleNode}
				</ResizablePanel>
				{/* Wide transparent hit area with a hairline; highlights while hovered or dragged. */}
				<ResizableHandle
					aria-label={t("study.resizePanels")}
					className="w-1.5 bg-transparent after:w-px after:bg-border hover:after:bg-primary/40 focus-visible:after:bg-primary data-[resize-handle-state=drag]:after:bg-primary"
				/>
				<ResizablePanel
					ref={conversationPanelRef}
					id="conversation"
					order={2}
					defaultSize={36}
					minSize={26}
					maxSize={55}
					collapsible
					collapsedSize={0}
					onCollapse={() => setConversationCollapsed(true)}
					onExpand={() => setConversationCollapsed(false)}
				>
					<div className="flex h-full min-h-0 flex-col bg-background">
						{conversationNode}
					</div>
				</ResizablePanel>
			</ResizablePanelGroup>
			<div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
				{isContentLoading ? (
					<>
						<Skeleton className="h-1 w-32" />
						<Skeleton className="h-3 w-14" />
					</>
				) : (
					<>
						<StudyProgressSegments status={status} className="w-32" />
						<span className="tabular-nums">
							{t("study.progress", { done: status.completed, total: status.total })}
						</span>
					</>
				)}
				<span className="h-3 w-px bg-border" aria-hidden />
				<button
					type="button"
					className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => showOutputs("files")}
				>
					{t("study.outputsCount", { count: outputsCount })}
				</button>
				<button
					type="button"
					className="rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onClick={() => showOutputs("personas")}
				>
					{t("study.personasCount", { count: store.studyPersonas.length })}
				</button>
				<span className="ml-auto">{t("study.aiDisclaimer")}</span>
			</div>
			{sheet}
		</div>
	)
}

export default observer(ResearchStudioPage)
