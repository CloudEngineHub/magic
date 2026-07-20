import { lazy, Suspense, useEffect } from "react"
import { useParams } from "react-router"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { File, Loader2, PanelLeftClose, PanelRightOpen } from "lucide-react"
import { useLocalStorageState, useMemoizedFn } from "ahooks"

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

import AppConversationPanel from "./components/AppConversationPanel"
import MicroAppHeader from "./components/MicroAppHeader"
import MicroAppPageOverlays from "./components/MicroAppPageOverlays"
import MicroAppPanelToggleButton from "./components/MicroAppPanelToggleButton"
import { AppStoreProvider } from "./context"
import { useMicroAppPageController } from "./hooks/useMicroAppPageController"

const MicroAppDatabasePanel = lazy(() => import("./components/MicroAppDatabasePanel"))

const SIDEBAR_DEFAULT_PX = 280
const SIDEBAR_MIN_PX = 220
const SIDEBAR_MAX_PX = 420
const MESSAGE_PANEL_DEFAULT_PX = 360
const MESSAGE_PANEL_MIN_PX = 320
const MESSAGE_PANEL_MAX_PX = 560
const COLLAPSED_RAIL_WIDTH_PX = 40

const MICRO_APP_SIDEBAR_STORAGE_KEY = "MAGIC:micro-app-page-sidebar-width"
const MICRO_APP_SIDEBAR_COLLAPSED_KEY = "MAGIC:micro-app-page-sidebar-collapsed"
const MICRO_APP_MESSAGE_PANEL_STORAGE_KEY = "MAGIC:micro-app-page-message-panel-width"
const MICRO_APP_MESSAGE_PANEL_COLLAPSED_KEY = "MAGIC:micro-app-page-message-panel-collapsed"

function MicroAppPageInner({ projectId }: { projectId: string }) {
	const { t } = useTranslation("super")
	const navigate = useNavigate()
	const controller = useMicroAppPageController(projectId)
	const {
		store,
		conversation,
		selectedProject,
		selectedTopic,
		isReadOnly,
		attachments,
		attachmentList,
		activeFileId,
		userSelectDetail,
		setUserSelectDetail,
		defaultEntryFile,
		nonClosableFileIds,
		detailRef,
		topicFilesProps,
		handleActiveFileChange,
		handleBackToMicroApps,
		handleOpenPublishDialog,
		handleToggleDatabasePanel,
		handleFileTabsCacheLoaded,
		publishDialogOpen,
		setPublishDialogOpen,
		isDatabasePanelOpen,
		setIsDatabasePanelOpen,
		CollaboratorUpdatePanel,
		canManageCollaborators,
		handleManageCollaborators,
		handleProjectNameChange,
	} = controller

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

	const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorageState<boolean>(
		MICRO_APP_SIDEBAR_COLLAPSED_KEY,
		{ defaultValue: true },
	)
	const [isMessagePanelCollapsed, setIsMessagePanelCollapsed] = useLocalStorageState<boolean>(
		MICRO_APP_MESSAGE_PANEL_COLLAPSED_KEY,
		{
			defaultValue: false,
		},
	)

	const toggleSidebarCollapse = useMemoizedFn(() => {
		setIsSidebarCollapsed((previous) => !previous)
	})
	const toggleMessagePanelCollapse = useMemoizedFn(() => {
		setIsMessagePanelCollapsed((previous) => !previous)
	})
	const handleToggleMessagePanelCollapse = useMemoizedFn(() => {
		if (!isMessagePanelCollapsed) closeTopicHistoryPanel()
		toggleMessagePanelCollapse()
	})

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
		maxWidth: MESSAGE_PANEL_MAX_PX,
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
					isDatabasePanelOpen={isDatabasePanelOpen}
					onBack={handleBackToMicroApps}
					onToggleDatabasePanel={handleToggleDatabasePanel}
					onPublish={handleOpenPublishDialog}
					canManageCollaborators={canManageCollaborators}
					onManageCollaborators={handleManageCollaborators}
				/>

				<div className="flex min-h-0 flex-1 overflow-hidden">
					{!isSidebarCollapsed ? (
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
										headerTrailingAction={
											<MicroAppPanelToggleButton
												icon={<PanelLeftClose size={16} />}
												label={t("microAppPage.header.hideFiles")}
												testId="micro-app-file-sidebar-collapse"
												side="right"
												onClick={toggleSidebarCollapse}
											/>
										}
									/>
								</div>
							</aside>
							<TopicResizeHandle
								onResizeStart={onSidebarResizeStart}
								className={isDraggingSidebar ? "before:opacity-100" : undefined}
							/>
						</>
					) : (
						<aside
							className="flex h-full shrink-0 justify-center border-r border-border bg-background py-2"
							style={{ width: COLLAPSED_RAIL_WIDTH_PX }}
							data-testid="micro-app-file-sidebar-rail"
						>
							<MicroAppPanelToggleButton
								icon={<File size={16} />}
								label={t("microAppPage.header.showFiles")}
								testId="micro-app-file-sidebar-expand"
								side="right"
								onClick={toggleSidebarCollapse}
							/>
						</aside>
					)}

					<main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
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
							showFallbackWhenEmpty
							nonClosableFileIds={nonClosableFileIds}
							onFileTabsCacheLoaded={handleFileTabsCacheLoaded}
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
				projectId={selectedProject?.id}
				projectName={selectedProject?.project_name}
				publishDialogOpen={publishDialogOpen}
				onPublishDialogOpenChange={setPublishDialogOpen}
				onProjectNameChange={handleProjectNameChange}
				collaboratorPanel={CollaboratorUpdatePanel}
			/>
			{isDatabasePanelOpen ? (
				<Suspense fallback={null}>
					<MicroAppDatabasePanel
						open={isDatabasePanelOpen}
						projectId={selectedProject?.id}
						projectName={selectedProject?.project_name}
						onOpenChange={setIsDatabasePanelOpen}
					/>
				</Suspense>
			) : null}
		</FileActionVisibilityProvider>
	)
}

const MicroAppPageInnerObserver = observer(MicroAppPageInner)

function MicroAppPageDesktop() {
	const { projectId } = useParams<{ projectId: string }>()
	const navigate = useNavigate()

	useEffect(() => {
		if (!projectId) {
			navigate({ name: RouteName.Super, replace: true })
		}
	}, [projectId, navigate])

	if (!projectId) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<AppStoreProvider>
			<MicroAppPageInnerObserver projectId={projectId} />
		</AppStoreProvider>
	)
}

export default MicroAppPageDesktop
