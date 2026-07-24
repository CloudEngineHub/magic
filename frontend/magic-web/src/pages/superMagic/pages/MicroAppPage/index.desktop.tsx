import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Loader2, PanelRightOpen } from "lucide-react"
import { useLocalStorageState, useMemoizedFn, useSize } from "ahooks"

import Detail from "@/pages/superMagic/components/Detail"
import { FileActionVisibilityProvider } from "@/pages/superMagic/providers/file-action-visibility-provider"
import { MessageHeaderTopicHistoryPanel } from "@/pages/superMagic/components/MessageHeader"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import { TOPIC_HISTORY_PANEL_WIDTH } from "@/pages/superMagic/constants/resizablePanel"
import useResizablePanel from "@/pages/superMagic/hooks/useResizablePanel"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import TopicResizeHandle from "@/pages/superMagic/pages/TopicPage/components/TopicResizeHandle"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "@/pages/superMagic/pages/TopicPage/hooks/useTopicHistoryLayoutState"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import { cn } from "@/lib/utils"

import AppConversationPanel from "./components/AppConversationPanel"
import MicroAppHeader from "./components/MicroAppHeader"
import MicroAppEntryPreview from "./components/MicroAppEntryPreview"
import MicroAppPageOverlays from "./components/MicroAppPageOverlays"
import MicroAppPanelToggleButton from "./components/MicroAppPanelToggleButton"
import MicroAppPreviewToolbar from "./components/MicroAppPreviewToolbar"
import MicroAppWorkspaceNav, { type MicroAppWorkspaceView } from "./components/MicroAppWorkspaceNav"
import { AppStoreProvider } from "./context"
import { useMicroAppPageController } from "./hooks/useMicroAppPageController"
import { useMicroAppProjectResolver } from "./hooks/useMicroAppProjectResolver"
import { collectHtmlFiles, getAttachmentId } from "./utils/microAppFiles"

const MicroAppDatabasePanel = lazy(() => import("./components/MicroAppDatabasePanel"))

const SIDEBAR_DEFAULT_PX = 280
const SIDEBAR_MIN_PX = 220
const SIDEBAR_MAX_PX = 420
const MESSAGE_PANEL_DEFAULT_PX = 360
const MESSAGE_PANEL_MIN_PX = 320
const MESSAGE_PANEL_MAX_WIDTH_RATIO = 0.5
const COLLAPSED_RAIL_WIDTH_PX = 40

const MICRO_APP_SIDEBAR_STORAGE_KEY = "MAGIC:micro-app-page-sidebar-width"
const MICRO_APP_MESSAGE_PANEL_STORAGE_KEY = "MAGIC:micro-app-page-message-panel-width"
const MICRO_APP_MESSAGE_PANEL_COLLAPSED_KEY = "MAGIC:micro-app-page-message-panel-collapsed"

function getPreviewPath(
	entryFile: {
		file_name?: string
		filename?: string
		display_filename?: string
		relative_file_path?: string
	} | null,
) {
	if (!entryFile) return "/"

	const fileName =
		entryFile.display_filename || entryFile.file_name || entryFile.filename || "index.html"
	const relativePath = entryFile.relative_file_path || fileName
	const normalizedPath = relativePath.replace(/^\/+/, "")

	return /^index\.html?$/i.test(normalizedPath) ? "/" : `/${normalizedPath}`
}

function MicroAppPageInner({ appId, projectId }: { appId: string; projectId: string }) {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const [activeView, setActiveView] = useState<MicroAppWorkspaceView>("preview")
	const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop")
	const [previewRefreshKey, setPreviewRefreshKey] = useState(0)
	const [isAIEditActive, setIsAIEditActive] = useState(false)
	const aiEditHandlerRef = useRef<(() => void) | null>(null)
	const workspacePanelsRef = useRef<HTMLDivElement>(null)
	const workspacePanelsSize = useSize(workspacePanelsRef)
	const workspaceWidthPx = workspacePanelsSize?.width || window.innerWidth
	const messagePanelMaxWidthPx = Math.max(
		MESSAGE_PANEL_MIN_PX,
		Math.floor(workspaceWidthPx * MESSAGE_PANEL_MAX_WIDTH_RATIO),
	)
	const controller = useMicroAppPageController(appId, projectId)
	const {
		store,
		conversation,
		selectedProject,
		selectedTopic,
		hasRunningTopic,
		isReadOnly,
		canRename,
		attachments,
		attachmentList,
		activeFileId,
		userSelectDetail,
		setUserSelectDetail,
		defaultEntryFile,
		detailRef,
		topicFilesProps,
		handleActiveFileChange,
		handleBackToMicroApps,
		handleOpenPublishDialog,
		handleFileTabsCacheLoaded,
		publishDialogOpen,
		setPublishDialogOpen,
		renameDialogOpen,
		setRenameDialogOpen,
		renameSubmitting,
		CollaboratorUpdatePanel,
		canManageCollaborators,
		handleManageCollaborators,
		handleProjectNameChange,
		handleRenameProject,
	} = controller
	const [previewEntryFile, setPreviewEntryFile] = useState(defaultEntryFile)
	const previewHtmlFiles = useMemo(() => collectHtmlFiles(attachmentList), [attachmentList])
	const previewFileOptions = useMemo(
		() =>
			previewHtmlFiles.map((file) => ({
				id: getAttachmentId(file),
				path: getPreviewPath(file),
			})),
		[previewHtmlFiles],
	)
	const activePreviewFileId = previewEntryFile ? getAttachmentId(previewEntryFile) : undefined

	const topicActions = useScopedMessageHeaderTopicActions({
		selectedProject,
		selectedTopic,
		topicStore: conversation.topicStore,
	})
	const { isTopicHistoryPanelOpen, closeTopicHistoryPanel, toggleTopicHistoryPanel } =
		useTopicHistoryLayoutState({
			storageKey: TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS.microApp,
			isEnabled: !isReadOnly,
		})

	const [isMessagePanelCollapsed, setIsMessagePanelCollapsed] = useLocalStorageState<boolean>(
		MICRO_APP_MESSAGE_PANEL_COLLAPSED_KEY,
		{
			defaultValue: false,
		},
	)

	const toggleMessagePanelCollapse = useMemoizedFn(() => {
		setIsMessagePanelCollapsed((previous) => !previous)
	})
	const handleToggleMessagePanelCollapse = useMemoizedFn(() => {
		if (!isMessagePanelCollapsed) closeTopicHistoryPanel()
		toggleMessagePanelCollapse()
	})
	const handleWorkspaceViewChange = useMemoizedFn((nextView: MicroAppWorkspaceView) => {
		setActiveView(nextView)
		if (nextView === "preview" && defaultEntryFile) {
			setPreviewEntryFile(defaultEntryFile)
			detailRef.current?.openFileTab(defaultEntryFile)
		}
	})
	const handlePreviewFileChange = useMemoizedFn((fileId: string) => {
		const nextFile = previewHtmlFiles.find((item) => getAttachmentId(item) === fileId)
		if (nextFile) setPreviewEntryFile(nextFile)
	})
	const handlePreviewOpenFile = useMemoizedFn((fileItem?: unknown) => {
		const nextFile = fileItem as typeof defaultEntryFile
		if (!nextFile) return

		const nextFileId = getAttachmentId(nextFile)
		const matchedFile = previewHtmlFiles.find((item) => getAttachmentId(item) === nextFileId)
		setPreviewEntryFile(matchedFile || nextFile)
	})
	const handleRegisterAIEdit = useMemoizedFn((handler: (() => void) | null) => {
		aiEditHandlerRef.current = handler
	})

	useEffect(() => {
		setActiveView("preview")
		setPreviewEntryFile(null)
		setPreviewMode("desktop")
		setPreviewRefreshKey(0)
		setIsAIEditActive(false)
	}, [projectId])

	useEffect(() => {
		if (defaultEntryFile && !previewEntryFile?.file_id) {
			setPreviewEntryFile(defaultEntryFile)
		}
	}, [defaultEntryFile, previewEntryFile?.file_id])

	useEffect(() => {
		if (activeView === "files" && defaultEntryFile) {
			detailRef.current?.openFileTab(defaultEntryFile)
		}
	}, [activeView, defaultEntryFile, detailRef])

	const {
		width: sidebarWidthPx,
		isDragging: isDraggingSidebar,
		handleResizeStart: onSidebarResizeStart,
	} = useResizablePanel({
		minWidth: SIDEBAR_MIN_PX,
		maxWidth: SIDEBAR_MAX_PX,
		defaultWidth: SIDEBAR_DEFAULT_PX,
		storageKey: MICRO_APP_SIDEBAR_STORAGE_KEY,
		direction: "left",
	})
	const {
		width: messagePanelWidthPx,
		isDragging: isDraggingMessagePanel,
		handleResizeStart: onMessagePanelResizeStart,
	} = useResizablePanel({
		minWidth: MESSAGE_PANEL_MIN_PX,
		maxWidth: messagePanelMaxWidthPx,
		defaultWidth: MESSAGE_PANEL_DEFAULT_PX,
		storageKey: MICRO_APP_MESSAGE_PANEL_STORAGE_KEY,
		direction: "right",
	})

	if (store.initLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (store.initError) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-4">
				<p className="text-sm text-destructive">{store.initError}</p>
				<button
					type="button"
					className="text-sm text-primary hover:underline"
					onClick={() => navigate({ name: RouteName.Super })}
				>
					{t("microAppPage.header.backToApps")}
				</button>
			</div>
		)
	}

	return (
		<FileActionVisibilityProvider>
			<div
				className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-background"
				data-testid="micro-app-page"
			>
				<MicroAppHeader
					selectedProject={selectedProject}
					hasEntries={Boolean(defaultEntryFile)}
					onBack={handleBackToMicroApps}
					onPublish={handleOpenPublishDialog}
					canRename={canRename}
					onRename={() => setRenameDialogOpen(true)}
					canManageCollaborators={canManageCollaborators}
					onManageCollaborators={handleManageCollaborators}
				/>

				<div ref={workspacePanelsRef} className="flex min-h-0 flex-1 overflow-hidden">
					<MicroAppWorkspaceNav
						activeView={activeView}
						databaseDisabled={!selectedProject?.id}
						onViewChange={handleWorkspaceViewChange}
					/>

					<main className="relative h-full min-w-0 flex-1 overflow-hidden">
						{/* Use display:none for the inactive view: FilesViewer can set visibility on descendants. */}
						<div
							className={cn(
								"absolute inset-0 min-w-0 overflow-hidden",
								activeView === "database" ? "hidden" : "flex",
							)}
							aria-hidden={activeView === "database"}
							data-testid="micro-app-preview-workspace"
						>
							{activeView === "files" ? (
								<>
									<aside
										className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-background"
										style={{ width: sidebarWidthPx }}
										data-testid="micro-app-file-sidebar"
									>
										<div className="min-h-0 flex-1 overflow-hidden py-1">
											<TopicFilesButton
												{...topicFilesProps}
												title={t("microAppPage.header.codeFiles")}
											/>
										</div>
									</aside>
									<TopicResizeHandle
										onResizeStart={onSidebarResizeStart}
										className={
											isDraggingSidebar ? "before:opacity-100" : undefined
										}
									/>
								</>
							) : null}

							<div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
								{activeView === "preview" ? (
									<>
										<MicroAppPreviewToolbar
											viewMode={previewMode}
											activeFileId={activePreviewFileId}
											htmlFiles={previewFileOptions}
											allowEdit={!isReadOnly && Boolean(previewEntryFile)}
											aiEditActive={isAIEditActive}
											onViewModeChange={setPreviewMode}
											onFileChange={handlePreviewFileChange}
											onRefresh={() => setPreviewRefreshKey((key) => key + 1)}
											onAIEdit={() => aiEditHandlerRef.current?.()}
										/>
										<div className="min-h-0 flex-1 overflow-hidden">
											<MicroAppEntryPreview
												entryFile={previewEntryFile}
												attachments={attachments}
												attachmentList={attachmentList}
												selectedProject={selectedProject}
												allowEdit={!isReadOnly}
												onOpenFile={handlePreviewOpenFile}
												viewMode={previewMode}
												refreshKey={previewRefreshKey}
												onRegisterAIEdit={handleRegisterAIEdit}
												onAIEditActiveChange={setIsAIEditActive}
												isBuilding={hasRunningTopic}
											/>
										</div>
									</>
								) : (
									<Detail
										className="my-2"
										ref={detailRef}
										disPlayDetail={userSelectDetail}
										userSelectDetail={userSelectDetail}
										setUserSelectDetail={setUserSelectDetail}
										attachments={attachments}
										attachmentList={attachmentList}
										topicId={selectedTopic?.id}
										baseShareUrl={`${window.location.origin}/share`}
										currentTopicStatus={selectedTopic?.task_status}
										messages={[]}
										allowEdit={!isReadOnly}
										selectedTopic={selectedTopic}
										selectedProject={selectedProject}
										activeFileId={activeFileId}
										onActiveFileChange={handleActiveFileChange}
										projectId={selectedProject?.id}
										showFileHeader
										showFileFooter={false}
										showFallbackWhenEmpty
										onFileTabsCacheLoaded={handleFileTabsCacheLoaded}
									/>
								)}
							</div>
						</div>

						<div
							className={cn(
								"absolute inset-0 overflow-hidden",
								activeView !== "database" && "hidden",
							)}
							aria-hidden={activeView !== "database"}
							data-testid="micro-app-database-workspace"
						>
							<Suspense fallback={null}>
								<MicroAppDatabasePanel
									active={activeView === "database"}
									projectId={selectedProject?.id}
									projectName={selectedProject?.project_name}
									projectRole={selectedProject?.user_role}
								/>
							</Suspense>
						</div>
					</main>

					{!isMessagePanelCollapsed ? (
						<>
							<TopicResizeHandle
								onResizeStart={onMessagePanelResizeStart}
								className={
									isDraggingMessagePanel ? "before:opacity-100" : undefined
								}
							/>
							<aside
								className="h-full shrink-0 overflow-hidden border-l border-border bg-background"
								style={{ width: messagePanelWidthPx }}
								data-testid="micro-app-conversation-panel"
							>
								<AppConversationPanel
									selectedProject={selectedProject}
									topicStore={conversation.topicStore}
									mentionPanelStore={store.mentionPanelStore}
									projectFilesStore={store.projectFilesStore}
									detailPanelVisible
									isConversationPanelCollapsed={isMessagePanelCollapsed}
									onToggleConversationPanel={handleToggleMessagePanelCollapse}
									onExpandConversationPanel={() =>
										setIsMessagePanelCollapsed(false)
									}
									historyTriggerMode="layout"
									isHistoryPanelOpen={isTopicHistoryPanelOpen}
									onToggleHistoryPanel={toggleTopicHistoryPanel}
								/>
							</aside>
						</>
					) : null}
					{isTopicHistoryPanelOpen && !isMessagePanelCollapsed ? (
						<aside
							className="h-full min-w-0 shrink-0 overflow-hidden border-l border-border bg-background"
							style={{ width: TOPIC_HISTORY_PANEL_WIDTH }}
							data-testid="micro-app-topic-history-panel"
						>
							<MessageHeaderTopicHistoryPanel
								selectedProject={selectedProject}
								topicStore={conversation.topicStore}
								topicActions={topicActions}
								isConversationPanelCollapsed={isMessagePanelCollapsed}
								onExpandConversationPanel={() => setIsMessagePanelCollapsed(false)}
								onClose={closeTopicHistoryPanel}
							/>
						</aside>
					) : null}
					{isMessagePanelCollapsed ? (
						<aside
							className="flex h-full shrink-0 justify-center border-l border-border bg-background py-2"
							style={{ width: COLLAPSED_RAIL_WIDTH_PX }}
							data-testid="micro-app-conversation-rail"
						>
							<MicroAppPanelToggleButton
								icon={<PanelRightOpen size={16} />}
								label={t("microAppPage.header.showConversation")}
								testId="micro-app-conversation-expand"
								side="left"
								onClick={toggleMessagePanelCollapse}
							/>
						</aside>
					) : null}
				</div>
			</div>

			<MicroAppPageOverlays
				appId={appId}
				projectName={selectedProject?.project_name}
				publishDialogOpen={publishDialogOpen}
				onPublishDialogOpenChange={setPublishDialogOpen}
				onProjectNameChange={handleProjectNameChange}
				renameDialogOpen={renameDialogOpen}
				renameSubmitting={renameSubmitting}
				onRenameDialogOpenChange={setRenameDialogOpen}
				onRenameProject={handleRenameProject}
				collaboratorPanel={CollaboratorUpdatePanel}
			/>
		</FileActionVisibilityProvider>
	)
}

const MicroAppPageInnerObserver = observer(MicroAppPageInner)

function MicroAppPageDesktop() {
	const { appId = "" } = useParams<{ appId: string }>()
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const { projectId, loading, error } = useMicroAppProjectResolver(appId)

	useEffect(() => {
		if (!appId) {
			navigate({ name: RouteName.Super, replace: true })
		}
	}, [appId, navigate])

	if (!appId || loading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	if (error || !projectId) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-4">
				<p className="text-sm text-destructive">
					{error?.message || t("microAppPage.errors.loadFailed")}
				</p>
				<button
					type="button"
					className="text-sm text-primary hover:underline"
					onClick={() => navigate({ name: RouteName.MicroApps })}
				>
					{t("microAppPage.header.backToApps")}
				</button>
			</div>
		)
	}

	return (
		<AppStoreProvider>
			<MicroAppPageInnerObserver appId={appId} projectId={projectId} />
		</AppStoreProvider>
	)
}

export default MicroAppPageDesktop
