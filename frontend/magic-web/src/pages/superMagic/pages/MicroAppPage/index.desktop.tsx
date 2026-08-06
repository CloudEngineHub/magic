import { useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { useMemoizedFn, useSize } from "ahooks"

import Detail from "@/pages/superMagic/components/Detail"
import { FileActionVisibilityProvider } from "@/pages/superMagic/providers/file-action-visibility-provider"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import useResizablePanel from "@/pages/superMagic/hooks/useResizablePanel"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import TopicResizeHandle from "@/pages/superMagic/pages/TopicPage/components/TopicResizeHandle"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "@/pages/superMagic/pages/TopicPage/hooks/useTopicHistoryLayoutState"
import { cn } from "@/lib/utils"
import PreviewDetailPopup, {
	type PreviewDetail,
	type PreviewDetailPopupRef,
} from "@/pages/superMagicMobile/components/PreviewDetailPopup"
import { getFileType } from "@/pages/superMagic/utils/handleFIle"

import MicroAppDesktopConversationPanels from "./components/MicroAppDesktopConversationPanels"
import MicroAppHeader from "./components/MicroAppHeader"
import MicroAppDesktopRoute from "./components/MicroAppDesktopRoute"
import MicroAppEntryPreview from "./components/MicroAppEntryPreview"
import MicroAppFallbackState from "./components/MicroAppFallbackState"
import MicroAppPageOverlays from "./components/MicroAppPageOverlays"
import MicroAppPageLoadingState from "./components/MicroAppPageLoadingState"
import MicroAppPreviewToolbar from "./components/MicroAppPreviewToolbar"
import MicroAppProjectPanels from "./components/MicroAppProjectPanels"
import MicroAppWorkspaceNav, { type MicroAppWorkspaceView } from "./components/MicroAppWorkspaceNav"
import { useMicroAppMessageFileOpen } from "./hooks/useMicroAppMessageFileOpen"
import { useMicroAppPageController } from "./hooks/useMicroAppPageController"
import { useMicroAppPreviewFiles } from "./hooks/useMicroAppPreviewFiles"
import * as layout from "./layoutConstants"

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
	const [activeView, setActiveView] = useState<MicroAppWorkspaceView>("preview")
	const [previewMode, setPreviewMode] = useState<"desktop" | "phone">("desktop")
	const [previewRefreshKey, setPreviewRefreshKey] = useState(0)
	const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false)
	const [isAIEditActive, setIsAIEditActive] = useState(false)
	const [isDevConsoleActive, setIsDevConsoleActive] = useState(false)
	const [isDevConsoleAvailable, setIsDevConsoleAvailable] = useState(false)
	const aiEditHandlerRef = useRef<(() => void) | null>(null)
	const devConsoleToggleHandlerRef = useRef<(() => void) | null>(null)
	const workspacePanelsRef = useRef<HTMLDivElement>(null)
	const previewDetailPopupRef = useRef<PreviewDetailPopupRef>(null)
	const linkPreviewPopupRef = useRef<PreviewDetailPopupRef>(null)
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
		canPublish,
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
	const {
		previewEntryFile,
		setPreviewEntryFile,
		previewFileOptions,
		activePreviewFileId,
		handlePreviewFileChange,
		handlePreviewOpenFile,
	} = useMicroAppPreviewFiles({ attachmentList, defaultEntryFile })

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
		if (nextView !== "preview") setIsPreviewFullscreen(false)

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
	const setPreviewDetail = useMemoizedFn((detail: unknown) => {
		if (!detail || typeof detail !== "object") return
		previewDetailPopupRef.current?.open(detail as PreviewDetail, attachments, attachmentList)
	})
	const setLinkPreviewDetail = useMemoizedFn((detail: unknown) => {
		if (!detail || typeof detail !== "object") return
		linkPreviewPopupRef.current?.open(detail as PreviewDetail, attachments, attachmentList)
	})
	/** 微应用的长期记忆占满主工作区，文件点击使用弹窗预览，避免打开到不可见的 FilesViewer。 */
	const handleLongMemoryFileClick = useMemoizedFn((fileItem: AttachmentItem) => {
		if (!fileItem.file_id || fileItem.is_directory) return
		setPreviewDetail({
			type: getFileType(fileItem.file_extension || ""),
			currentFileId: String(fileItem.file_id),
			// 保留记忆 scope、项目 ID 和文件 key，确保预览与编辑都使用记忆文件空间。
			data: fileItem,
		} as PreviewDetail)
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
		setIsPreviewFullscreen(false)
		setIsAIEditActive(false)
		setIsDevConsoleActive(false)
		setIsDevConsoleAvailable(false)
	}, [projectId, setIsMessagePanelCollapsed, setPreviewEntryFile])

	useEffect(() => {
		if (!isPreviewFullscreen) return undefined

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setIsPreviewFullscreen(false)
		}

		document.addEventListener("keydown", handleKeyDown)
		return () => document.removeEventListener("keydown", handleKeyDown)
	}, [isPreviewFullscreen])

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
		return <MicroAppFallbackState variant="load" onBack={handleBackToMicroApps} />
	}

	return (
		<FileActionVisibilityProvider>
			<div
				className={cn(
					"flex h-full w-full flex-col rounded-lg border border-border bg-background",
					isPreviewFullscreen ? "overflow-visible" : "overflow-hidden",
				)}
				data-testid="micro-app-page"
			>
				<MicroAppHeader
					selectedProject={selectedProject}
					hasEntries={Boolean(defaultEntryFile)}
					canPublish={canPublish}
					isPublished={isPublished}
					onBack={handleBackToMicroApps}
					onPublish={handleOpenPublishDialog}
					canEdit={canEdit}
					onEdit={handleOpenEditDialog}
					canManageCollaborators={canManageCollaborators}
					onManageCollaborators={handleManageCollaborators}
				/>

				<div
					ref={workspacePanelsRef}
					className={cn(
						"flex min-h-0 flex-1",
						isPreviewFullscreen ? "overflow-visible" : "overflow-hidden",
					)}
				>
					<MicroAppWorkspaceNav
						activeView={activeView}
						databaseDisabled={!selectedProject?.id}
						projectPanelDisabled={!selectedProject?.id}
						hideScheduledTasks={isReadOnly}
						onViewChange={handleWorkspaceViewChange}
					/>

					<main
						className={cn(
							"relative h-full min-w-0 flex-1",
							isPreviewFullscreen ? "overflow-visible" : "overflow-hidden",
						)}
					>
						{/* Use display:none for the inactive view: FilesViewer can set visibility on descendants. */}
						<div
							className={cn(
								"inset-0 min-w-0 overflow-hidden",
								isPreviewFullscreen
									? "fixed z-detail-fullscreen h-dvh w-screen bg-background"
									: "absolute",
								activeView === "preview" || activeView === "files"
									? "flex"
									: "hidden",
							)}
							aria-hidden={activeView !== "preview" && activeView !== "files"}
							data-fullscreen={isPreviewFullscreen ? "true" : "false"}
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
											isFullscreen={isPreviewFullscreen}
											onViewModeChange={setPreviewMode}
											onFileChange={handlePreviewFileChange}
											onRefresh={() => setPreviewRefreshKey((key) => key + 1)}
											onAIEdit={() => aiEditHandlerRef.current?.()}
											onDevConsoleToggle={() =>
												devConsoleToggleHandlerRef.current?.()
											}
											onFullscreenToggle={() =>
												setIsPreviewFullscreen((previous) => !previous)
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
							workspaceName={selectedProject?.workspace_name}
							projectName={selectedProject?.project_name}
							topicId={selectedTopic?.id}
							onLongMemoryFileClick={handleLongMemoryFileClick}
						/>
					</main>

					<MicroAppDesktopConversationPanels
						selectedProject={selectedProject}
						topicStore={conversation.topicStore}
						mentionPanelStore={store.mentionPanelStore}
						projectFilesStore={store.projectFilesStore}
						topicActions={topicActions}
						isMessagePanelCollapsed={isMessagePanelCollapsed}
						isMessagePanelDragging={isDraggingMessagePanel}
						messagePanelWidthPx={messagePanelWidthPx}
						isTopicHistoryPanelOpen={isTopicHistoryPanelOpen}
						onMessagePanelResizeStart={onMessagePanelResizeStart}
						onTerminalTopicStatusChange={checkAttachmentsNowDebounced}
						onToggleConversationPanel={handleToggleMessagePanelCollapse}
						onExpandConversationPanel={() => setIsMessagePanelCollapsed(false)}
						onToggleHistoryPanel={toggleTopicHistoryPanel}
						onCloseHistoryPanel={closeTopicHistoryPanel}
						onSelectDetail={setPreviewDetail}
						onExpandCollapsedPanel={toggleMessagePanelCollapse}
						showConversationLabel={t("microAppPage.header.showConversation")}
					/>
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
			<PreviewDetailPopup
				ref={previewDetailPopupRef}
				setUserSelectDetail={setPreviewDetail}
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				allowEdit={!isReadOnly}
				onOpenNewPopup={(detail, attachmentTree, nextAttachmentList) => {
					linkPreviewPopupRef.current?.open(detail, attachmentTree, nextAttachmentList)
				}}
			/>
			<PreviewDetailPopup
				ref={linkPreviewPopupRef}
				setUserSelectDetail={setLinkPreviewDetail}
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				allowEdit={!isReadOnly}
			/>
		</FileActionVisibilityProvider>
	)
}

const MicroAppPageInnerObserver = observer(MicroAppPageInner)

function MicroAppPageDesktop() {
	return <MicroAppDesktopRoute Content={MicroAppPageInnerObserver} />
}

export default MicroAppPageDesktop
