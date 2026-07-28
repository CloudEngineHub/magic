import { useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { PanelRightOpen } from "lucide-react"
import { useMemoizedFn, useSize } from "ahooks"

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
import MicroAppDesktopRoute from "./components/MicroAppDesktopRoute"
import MicroAppEntryPreview from "./components/MicroAppEntryPreview"
import MicroAppPageOverlays from "./components/MicroAppPageOverlays"
import MicroAppPageLoadingState from "./components/MicroAppPageLoadingState"
import MicroAppPanelToggleButton from "./components/MicroAppPanelToggleButton"
import MicroAppPreviewToolbar from "./components/MicroAppPreviewToolbar"
import MicroAppProjectPanels from "./components/MicroAppProjectPanels"
import MicroAppWorkspaceNav, { type MicroAppWorkspaceView } from "./components/MicroAppWorkspaceNav"
import { useMicroAppMessageFileOpen } from "./hooks/useMicroAppMessageFileOpen"
import { useMicroAppPageController } from "./hooks/useMicroAppPageController"
import * as layout from "./layoutConstants"
import { collectHtmlFiles, getAttachmentId, getMicroAppPreviewPath } from "./utils/microAppFiles"

function MicroAppPageInner({
	appId,
	projectId,
	isPublished,
	onPublishStatusChange,
}: {
	appId: string
	projectId: string
	isPublished: boolean
	onPublishStatusChange: (published: boolean) => void
}) {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const [activeView, setActiveView] = useState<MicroAppWorkspaceView>("preview")
	const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop")
	const [previewRefreshKey, setPreviewRefreshKey] = useState(0)
	const [isAIEditActive, setIsAIEditActive] = useState(false)
	const [isDevConsoleActive, setIsDevConsoleActive] = useState(false)
	const [isDevConsoleAvailable, setIsDevConsoleAvailable] = useState(false)
	const aiEditHandlerRef = useRef<(() => void) | null>(null)
	const devConsoleToggleHandlerRef = useRef<(() => void) | null>(null)
	const workspacePanelsRef = useRef<HTMLDivElement>(null)
	const workspacePanelsSize = useSize(workspacePanelsRef)
	const workspaceWidthPx = workspacePanelsSize?.width || window.innerWidth
	const messagePanelMaxWidthPx = Math.max(
		layout.MESSAGE_PANEL_MIN_PX,
		Math.floor(workspaceWidthPx * layout.MESSAGE_PANEL_MAX_WIDTH_RATIO),
	)
	const controller = useMicroAppPageController(appId, projectId)
	const {
		store,
		conversation,
		selectedProject,
		selectedTopic,
		hasRunningTopic,
		isReadOnly,
		canEdit,
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
		checkAttachmentsNowDebounced,
		publishDialogOpen,
		setPublishDialogOpen,
		editDialogOpen,
		setEditDialogOpen,
		editSubmitting,
		CollaboratorUpdatePanel,
		canManageCollaborators,
		handleManageCollaborators,
		handleProjectNameChange,
		captureCoverReady,
		handleCaptureCover,
		handleEditMicroApp,
	} = controller
	const [previewEntryFile, setPreviewEntryFile] = useState(defaultEntryFile)
	const previewHtmlFiles = useMemo(() => collectHtmlFiles(attachmentList), [attachmentList])
	const previewFileOptions = useMemo(
		() =>
			previewHtmlFiles.map((file) => ({
				id: getAttachmentId(file),
				path: getMicroAppPreviewPath(file),
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

	// 折叠仅用于当前详情页的临时布局，重新进入微应用时始终展示对话上下文。
	const [isMessagePanelCollapsed, setIsMessagePanelCollapsed] = useState(false)
	// 数据表格需要更宽的工作区；只恢复系统自动收起的状态，不覆盖用户手动操作。
	const messagePanelCollapsedBeforeDatabaseRef = useRef(false)
	const databaseAutoCollapsedRef = useRef(false)

	const toggleMessagePanelCollapse = useMemoizedFn(() => {
		if (activeView === "database") databaseAutoCollapsedRef.current = false
		setIsMessagePanelCollapsed((previous) => !previous)
	})
	const handleToggleMessagePanelCollapse = useMemoizedFn(() => {
		if (!isMessagePanelCollapsed) closeTopicHistoryPanel()
		toggleMessagePanelCollapse()
	})
	const handleWorkspaceViewChange = useMemoizedFn((nextView: MicroAppWorkspaceView) => {
		if (activeView === "database" && nextView !== "database") {
			if (databaseAutoCollapsedRef.current) {
				setIsMessagePanelCollapsed(messagePanelCollapsedBeforeDatabaseRef.current)
			}
			databaseAutoCollapsedRef.current = false
		}

		if (activeView !== "database" && nextView === "database") {
			messagePanelCollapsedBeforeDatabaseRef.current = Boolean(isMessagePanelCollapsed)
			if (!isMessagePanelCollapsed) {
				closeTopicHistoryPanel()
				setIsMessagePanelCollapsed(true)
				databaseAutoCollapsedRef.current = true
			}
		}

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
	const handleRegisterDevConsoleToggle = useMemoizedFn((handler: (() => void) | null) => {
		devConsoleToggleHandlerRef.current = handler
		setIsDevConsoleAvailable(Boolean(handler))
	})
	const handleOpenEditDialog = useMemoizedFn(() => {
		setEditDialogOpen(true)
	})
	const showFilesView = useMemoizedFn(() => {
		setActiveView("files")
	})

	useMicroAppMessageFileOpen({
		attachmentList,
		detailRef,
		isFilesViewActive: activeView === "files",
		showFilesView,
	})

	useEffect(() => {
		messagePanelCollapsedBeforeDatabaseRef.current = false
		databaseAutoCollapsedRef.current = false
		setIsMessagePanelCollapsed(false)
		setActiveView("preview")
		setPreviewEntryFile(null)
		setPreviewMode("desktop")
		setPreviewRefreshKey(0)
		setIsAIEditActive(false)
		setIsDevConsoleActive(false)
		setIsDevConsoleAvailable(false)
	}, [projectId, setIsMessagePanelCollapsed])

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
		minWidth: layout.SIDEBAR_MIN_PX,
		maxWidth: layout.SIDEBAR_MAX_PX,
		defaultWidth: layout.SIDEBAR_DEFAULT_PX,
		storageKey: layout.MICRO_APP_SIDEBAR_STORAGE_KEY,
		direction: "left",
	})
	const {
		width: messagePanelWidthPx,
		isDragging: isDraggingMessagePanel,
		handleResizeStart: onMessagePanelResizeStart,
	} = useResizablePanel({
		minWidth: layout.MESSAGE_PANEL_MIN_PX,
		maxWidth: messagePanelMaxWidthPx,
		defaultWidth: layout.MESSAGE_PANEL_DEFAULT_PX,
		storageKey: layout.MICRO_APP_MESSAGE_PANEL_STORAGE_KEY,
		direction: "right",
	})

	if (store.initLoading) {
		return <MicroAppPageLoadingState testId="micro-app-project-loading" />
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
					isPublished={isPublished}
					onBack={handleBackToMicroApps}
					onPublish={handleOpenPublishDialog}
					canEdit={canEdit}
					onEdit={handleOpenEditDialog}
					canManageCollaborators={canManageCollaborators}
					onManageCollaborators={handleManageCollaborators}
				/>

				<div ref={workspacePanelsRef} className="flex min-h-0 flex-1 overflow-hidden">
					<MicroAppWorkspaceNav
						activeView={activeView}
						databaseDisabled={!selectedProject?.id}
						projectPanelDisabled={!selectedProject?.id}
						hideScheduledTasks={isReadOnly}
						onViewChange={handleWorkspaceViewChange}
					/>

					<main className="relative h-full min-w-0 flex-1 overflow-hidden">
						{/* Use display:none for the inactive view: FilesViewer can set visibility on descendants. */}
						<div
							className={cn(
								"absolute inset-0 min-w-0 overflow-hidden",
								activeView === "preview" || activeView === "files"
									? "flex"
									: "hidden",
							)}
							aria-hidden={activeView !== "preview" && activeView !== "files"}
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
											devConsoleActive={isDevConsoleActive}
											devConsoleAvailable={isDevConsoleAvailable}
											onViewModeChange={setPreviewMode}
											onFileChange={handlePreviewFileChange}
											onRefresh={() => setPreviewRefreshKey((key) => key + 1)}
											onAIEdit={() => aiEditHandlerRef.current?.()}
											onDevConsoleToggle={() =>
												devConsoleToggleHandlerRef.current?.()
											}
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
												storageMarkerId={defaultEntryFile?.file_id}
												onRegisterAIEdit={handleRegisterAIEdit}
												onAIEditActiveChange={setIsAIEditActive}
												onRegisterDevConsoleToggle={
													handleRegisterDevConsoleToggle
												}
												onDevConsoleActiveChange={setIsDevConsoleActive}
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

						<MicroAppProjectPanels
							activeView={activeView}
							projectId={selectedProject?.id}
							projectRole={selectedProject?.user_role}
							workspaceId={selectedProject?.workspace_id}
							topicId={selectedTopic?.id}
						/>
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
									onTerminalTopicStatusChange={checkAttachmentsNowDebounced}
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
							style={{ width: layout.COLLAPSED_RAIL_WIDTH_PX }}
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
				onPublishStatusChange={onPublishStatusChange}
				onProjectNameChange={handleProjectNameChange}
				editDialogOpen={editDialogOpen}
				editSubmitting={editSubmitting}
				onEditDialogOpenChange={setEditDialogOpen}
				onEditMicroApp={handleEditMicroApp}
				onCaptureCover={captureCoverReady ? handleCaptureCover : undefined}
				collaboratorPanel={CollaboratorUpdatePanel}
			/>
		</FileActionVisibilityProvider>
	)
}

const MicroAppPageInnerObserver = observer(MicroAppPageInner)

function MicroAppPageDesktop() {
	return <MicroAppDesktopRoute Content={MicroAppPageInnerObserver} />
}

export default MicroAppPageDesktop
