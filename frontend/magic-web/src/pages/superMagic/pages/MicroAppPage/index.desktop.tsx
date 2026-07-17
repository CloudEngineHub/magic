import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { File, Loader2, PanelLeftClose, PanelRightOpen } from "lucide-react"
import { useDebounceFn, useDeepCompareEffect, useLocalStorageState, useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import useNavigate from "@/routes/hooks/useNavigate"
import useResizablePanel from "@/pages/superMagic/hooks/useResizablePanel"
import TopicResizeHandle from "@/pages/superMagic/pages/TopicPage/components/TopicResizeHandle"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import Detail, { type DetailRef } from "@/pages/superMagic/components/Detail"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { useAttachmentsPolling } from "@/pages/superMagic/hooks/useAttachmentsPolling"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import {
	normalizeUpdateAttachmentsPayload,
	releaseAttachmentsRefreshWaitersWithoutFetch,
	type SuperMagicUpdateAttachmentsRequest,
	withAttachmentsRefreshWaitersResolved,
} from "@/pages/superMagic/services/attachmentsTopicSync"
import { FileActionVisibilityProvider } from "@/pages/superMagic/providers/file-action-visibility-provider"
import { SuperMagicApi } from "@/apis"
import { useDefaultModeModelListRefreshOnMount } from "@/pages/superMagic/hooks"
import { useCreateTopicListener } from "@/pages/superMagic/components/TopicMode"
import { MessageHeaderTopicHistoryPanel } from "@/pages/superMagic/components/MessageHeader"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import useCollaboratorUpdatePanel from "@/pages/superMagic/components/WithCollaborators/hooks/useCollaboratorUpdatePanel"
import { isReadOnlyProject } from "@/pages/superMagic/utils/permission"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "@/pages/superMagic/pages/TopicPage/hooks/useTopicHistoryLayoutState"
import { TOPIC_HISTORY_PANEL_WIDTH } from "@/pages/superMagic/constants/resizablePanel"
import { RouteName } from "@/routes/constants"
import { AppStoreProvider, useAppStore } from "./context"
import AppConversationPanel from "./components/AppConversationPanel"
import MicroAppHeader from "./components/MicroAppHeader"
import MicroAppPanelToggleButton from "./components/MicroAppPanelToggleButton"
import MicroAppPublishDialog from "./components/MicroAppPublishDialog"
import { resolveDefaultHtmlEntry } from "./utils/microAppFiles"

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

const MicroAppDatabasePanel = lazy(() => import("./components/MicroAppDatabasePanel"))

function MicroAppPageInner({ projectId }: { projectId: string }) {
	const { t } = useTranslation("super")
	const store = useAppStore()
	const { conversation } = store
	const navigate = useNavigate()
	const [isInitialAttachmentsLoaded, setIsInitialAttachmentsLoaded] = useState(false)
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const [userSelectDetail, setUserSelectDetail] = useState<unknown>(null)
	const [isFileTabsCacheLoaded, setIsFileTabsCacheLoaded] = useState(false)
	const [publishDialogOpen, setPublishDialogOpen] = useState(false)
	const [isDatabasePanelOpen, setIsDatabasePanelOpen] = useState(false)
	const detailRef = useRef<DetailRef>(null)
	const defaultEntryOpenedKeyRef = useRef<string | null>(null)
	const selectedProject = conversation.selectedProject
	const selectedTopic = conversation.topicStore.selectedTopic
	const isReadOnly = isReadOnlyProject(selectedProject?.user_role)
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
	const attachments = store.projectFilesStore.workspaceFileTree
	const attachmentList = store.projectFilesStore.workspaceFilesList

	const setAttachments = useMemoizedFn((nextAttachments: AttachmentItem[]) => {
		store.projectFilesStore.setWorkspaceFileTree(nextAttachments)
	})

	useEffect(() => {
		if (projectId && store.projectId !== projectId) {
			store.initFromProjectId(projectId)
		}
	}, [projectId, store])

	useEffect(() => {
		setActiveFileId(null)
		setUserSelectDetail(null)
		setIsFileTabsCacheLoaded(false)
		defaultEntryOpenedKeyRef.current = null
		setPublishDialogOpen(false)
		setIsDatabasePanelOpen(false)
	}, [projectId])

	useDefaultModeModelListRefreshOnMount()
	useCreateTopicListener({
		selectedProject,
		topicStore: conversation.topicStore,
	})

	const updateAttachments = useDebounceFn(
		(pid?: string, callback?: (didLoad: boolean) => void) => {
			if (!pid) {
				store.projectFilesStore.setWorkspaceFileTree([])
				releaseAttachmentsRefreshWaitersWithoutFetch()
				callback?.(false)
				return
			}

			const temporaryToken =
				(window as Window & { temporary_token?: string }).temporary_token || ""
			let didLoad = false

			pubsub.publish(PubSubEvents.Update_Attachments_Loading, true)
			withAttachmentsRefreshWaitersResolved(
				pid,
				SuperMagicApi.getAttachmentsByProjectId({
					projectId: pid,
					temporaryToken,
				})
					.then((res) => {
						const processedData = AttachmentDataProcessor.processAttachmentData(res)
						store.projectFilesStore.setWorkspaceFileTree(processedData.tree)
						store.mentionPanelStore.finishLoadAttachmentsPromise(pid)
						didLoad = true
					})
					.catch((error) => {
						console.error("Failed to fetch micro app attachments:", error)
						store.projectFilesStore.setWorkspaceFileTree([])
					})
					.finally(() => {
						pubsub.publish(PubSubEvents.Update_Attachments_Loading, false)
						callback?.(didLoad)
					}),
			)
		},
		{ wait: 500 },
	).run

	const defaultEntryFile = useMemo(
		() => resolveDefaultHtmlEntry(attachmentList),
		[attachmentList],
	)

	const nonClosableFileIds = useMemo(
		() => (defaultEntryFile?.file_id ? [String(defaultEntryFile.file_id)] : []),
		[defaultEntryFile?.file_id],
	)

	useEffect(() => {
		if (!isInitialAttachmentsLoaded || !isFileTabsCacheLoaded || !defaultEntryFile?.file_id) {
			return
		}

		// FilesViewer restores cached tabs asynchronously. Open the default entry afterwards so
		// index.html is the visible initial tab instead of being overwritten by cache restoration.
		const entryId = String(defaultEntryFile.file_id)
		const openKey = `${projectId}:${entryId}`
		if (defaultEntryOpenedKeyRef.current === openKey) return

		defaultEntryOpenedKeyRef.current = openKey
		setActiveFileId(entryId)
		detailRef.current?.openFileTab(defaultEntryFile)
	}, [defaultEntryFile, isFileTabsCacheLoaded, isInitialAttachmentsLoaded, projectId])

	const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorageState<boolean>(
		MICRO_APP_SIDEBAR_COLLAPSED_KEY,
		{ defaultValue: true },
	)

	const toggleSidebarCollapse = useMemoizedFn(() => {
		setIsSidebarCollapsed((prev) => !prev)
	})

	const [isMessagePanelCollapsed, setIsMessagePanelCollapsed] = useLocalStorageState<boolean>(
		MICRO_APP_MESSAGE_PANEL_COLLAPSED_KEY,
		{ defaultValue: false },
	)

	const toggleMessagePanelCollapse = useMemoizedFn(() => {
		setIsMessagePanelCollapsed((prev) => !prev)
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

	useEffect(() => {
		store.projectFilesStore.setSelectedProject(selectedProject)
		return () => {
			store.projectFilesStore.setSelectedProject(null)
		}
	}, [selectedProject, store.projectFilesStore])

	useAttachmentsPolling({
		projectId: selectedProject?.id,
		onAttachmentsChange: useCallback(
			({ tree, list }: { tree: AttachmentItem[]; list: AttachmentItem[] }) => {
				const processedData = AttachmentDataProcessor.processAttachmentData({ tree, list })
				store.projectFilesStore.setWorkspaceFileTree(processedData.tree)
				setIsInitialAttachmentsLoaded(true)
			},
			[store.projectFilesStore],
		),
		onError: useMemoizedFn((error: unknown) => {
			console.error("Failed to poll micro app attachments:", error)
		}),
	})

	useDeepCompareEffect(() => {
		const pid = selectedProject?.id
		if (!pid) {
			setIsInitialAttachmentsLoaded(false)
			return
		}

		let isActive = true
		setIsInitialAttachmentsLoaded(false)

		store.mentionPanelStore.initLoadAttachments(pid)
		updateAttachments(pid, (didLoad) => {
			if (!isActive || !didLoad) return
			setIsInitialAttachmentsLoaded(true)
		})

		return () => {
			isActive = false
			store.mentionPanelStore.clearInitLoadAttachmentsPromise(pid)
		}
	}, [selectedProject?.id])

	useEffect(() => {
		const handleUpdateAttachments = (
			payloadOrCallback?: SuperMagicUpdateAttachmentsRequest,
		) => {
			const payload = normalizeUpdateAttachmentsPayload(payloadOrCallback)
			const pid = selectedProject?.id
			if (!pid) {
				payload.callback?.()
				releaseAttachmentsRefreshWaitersWithoutFetch()
				return
			}
			updateAttachments(pid, payload.callback)
		}

		pubsub.subscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		}
	}, [selectedProject?.id, updateAttachments])

	const handleOpenFile = useMemoizedFn((fileItem?: AttachmentItem) => {
		if (!fileItem?.file_id) return
		detailRef.current?.openFileTab(fileItem)
	})

	const handleActiveFileChange = useMemoizedFn((fileId: string | null) => {
		setActiveFileId(fileId)
	})

	const topicFilesProps = useMemo(
		() => ({
			attachments,
			setUserSelectDetail: () => undefined,
			onFileClick: handleOpenFile,
			projectId: selectedProject?.id,
			activeFileId,
			selectedTopic,
			onAttachmentsChange: setAttachments,
			allowEdit: !isReadOnly,
			selectedWorkspace: undefined,
			selectedProject,
			projects: [],
			workspaces: [],
			isInProject: true,
		}),
		[
			attachments,
			handleOpenFile,
			activeFileId,
			isReadOnly,
			selectedProject,
			selectedTopic,
			setAttachments,
		],
	)

	const handleBackToMicroApps = useMemoizedFn(() => {
		navigate({
			name: RouteName.MicroApps,
		})
	})

	const handleOpenPublishDialog = useMemoizedFn(() => {
		if (!selectedProject?.id || !defaultEntryFile) return
		setPublishDialogOpen(true)
	})

	const handleToggleDatabasePanel = useMemoizedFn(() => {
		if (!selectedProject?.id) return
		setIsDatabasePanelOpen((current) => !current)
	})

	const handleFileTabsCacheLoaded = useMemoizedFn((loadedProjectId: string) => {
		if (loadedProjectId === selectedProject?.id) {
			setIsFileTabsCacheLoaded(true)
		}
	})

	const { openManageModal, CollaboratorUpdatePanel, canManageCollaborators } =
		useCollaboratorUpdatePanel({
			selectedProject,
		})

	const handleManageCollaborators = useMemoizedFn(() => {
		if (!selectedProject || !canManageCollaborators) return
		openManageModal()
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
				className="flex h-full w-full flex-col overflow-hidden rounded-sm border border-border bg-background"
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
					{!isSidebarCollapsed && (
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
					)}
					{isSidebarCollapsed ? (
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
					) : null}

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

					{!isMessagePanelCollapsed && (
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
					)}
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

				<MicroAppPublishDialog
					open={publishDialogOpen}
					projectId={selectedProject?.id}
					projectName={selectedProject?.project_name}
					onProjectNameChange={(projectName) => {
						if (!selectedProject) return
						conversation.setSelectedProject({
							...selectedProject,
							project_name: projectName,
						})
					}}
					onOpenChange={setPublishDialogOpen}
				/>
				{CollaboratorUpdatePanel}
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
			</div>
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
