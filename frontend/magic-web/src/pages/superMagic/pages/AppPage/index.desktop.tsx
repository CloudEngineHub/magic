import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "react-router"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { useDebounceFn, useDeepCompareEffect, useLocalStorageState, useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import useNavigate from "@/routes/hooks/useNavigate"
import useResizablePanel from "@/pages/superMagic/hooks/useResizablePanel"
import Detail, { type DetailRef } from "@/pages/superMagic/components/Detail"
import { MessageHeaderTopicHistoryPanel } from "@/pages/superMagic/components/MessageHeader"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { useCompositeDetailPanelController } from "@/pages/superMagic/hooks/useCompositeDetailPanelController"
import { useDeferUntilFileTabsCacheLoaded } from "@/pages/superMagic/hooks/useDeferUntilFileTabsCacheLoaded"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import { useAttachmentsPolling } from "@/pages/superMagic/hooks/useAttachmentsPolling"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import {
	releaseAttachmentsRefreshWaitersWithoutFetch,
	withAttachmentsRefreshWaitersResolved,
} from "@/pages/superMagic/services/attachmentsTopicSync"
import { useTopicFiles } from "@/pages/superMagic/pages/TopicPage/hooks/useTopicFiles"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "@/pages/superMagic/pages/TopicPage/hooks/useTopicHistoryLayoutState"
import {
	FileActionVisibilityProvider,
	HIDE_COPY_MOVE_SHARE_FILE_AND_TOPIC_ACTIONS,
} from "@/pages/superMagic/providers/file-action-visibility-provider"
import { SuperMagicApi } from "@/apis"
import { useDefaultModeModelListRefreshOnMount } from "@/pages/superMagic/hooks"
import { useCreateTopicListener } from "@/pages/superMagic/components/TopicMode"
import { RouteName } from "@/routes/constants"
import CrewEditPanels from "../CrewEdit/components/CrewEditPanels"
import { AppStoreProvider, useAppStore } from "./context"
import AppConversationPanel from "./components/AppConversationPanel"
import AppSidebar from "./components/AppSidebar"

const SIDEBAR_DEFAULT_PX = 280
const SIDEBAR_MIN_PX = 220
const SIDEBAR_MAX_PX = 420
const SIDEBAR_COLLAPSED_PX = 48
const DETAIL_DEFAULT_PX = 688
const DETAIL_MIN_PX = 400
const DETAIL_MAX_PX = 900
const MESSAGE_PANEL_WIDTH_PX = 360

const APP_SIDEBAR_STORAGE_KEY = "MAGIC:app-page-sidebar-width"
const APP_SIDEBAR_COLLAPSED_KEY = "MAGIC:app-page-sidebar-collapsed"
const APP_DETAIL_STORAGE_KEY = "MAGIC:app-page-detail-panel-width"

function AppPageInner({ projectId }: { projectId: string }) {
	const { t } = useTranslation("super")
	const store = useAppStore()
	const { conversation } = store
	const navigate = useNavigate()
	const detailRef = useRef<DetailRef>(null)
	const [userSelectDetail, setUserSelectDetail] = useState<unknown>()
	const [isDetailPanelFullscreen, setIsDetailPanelFullscreen] = useState(false)
	const [isInitialAttachmentsLoaded, setIsInitialAttachmentsLoaded] = useState(false)
	const selectedProject = conversation.selectedProject
	const selectedTopic = conversation.topicStore.selectedTopic
	const topicActions = useScopedMessageHeaderTopicActions({
		selectedProject,
		selectedTopic,
		topicStore: conversation.topicStore,
	})
	const attachments = store.projectFilesStore.workspaceFileTree
	const attachmentList = store.projectFilesStore.workspaceFilesList

	const handleUserSelectDetail = useMemoizedFn((detail: unknown) => {
		setUserSelectDetail(detail)
	})

	const setAttachments = useMemoizedFn((nextAttachments: AttachmentItem[]) => {
		store.projectFilesStore.setWorkspaceFileTree(nextAttachments)
	})

	// Initialize store from projectId
	useEffect(() => {
		if (projectId && store.projectId !== projectId) {
			store.initFromProjectId(projectId)
		}
	}, [projectId, store])

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
						console.error("Failed to fetch app attachments:", error)
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

	const { activeFileId, handleFileClick, topicFilesProps, setActiveFileId } = useTopicFiles({
		selectedProject,
		selectedWorkspace: undefined,
		selectedTopic,
		projects: [],
		workspaces: [],
		attachments,
		setAttachments,
		setUserSelectDetail: handleUserSelectDetail,
		detailRef,
		isReadOnly: false,
	})

	const { shouldShowDetailPanel, topicFilesPropsWithPanel, handleActiveDetailTabChange } =
		useCompositeDetailPanelController({
			detailRef,
			isReadOnly: false,
			activeFileId,
			setActiveFileId,
			handleFileClick,
			topicFilesProps,
			resetDeps: [selectedProject?.id],
			onReset: () => {
				setUserSelectDetail(undefined)
				setIsDetailPanelFullscreen(false)
			},
		})

	const { onFileTabsCacheLoaded } = useDeferUntilFileTabsCacheLoaded(selectedProject?.id)

	const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorageState<boolean>(
		APP_SIDEBAR_COLLAPSED_KEY,
		{ defaultValue: false },
	)

	const toggleSidebarCollapse = useMemoizedFn(() => {
		setIsSidebarCollapsed((prev) => !prev)
	})

	const {
		width: expandedSidebarWidthPx,
		isDragging: isDraggingSidebar,
		handleMouseDown: onSidebarResizeStart,
	} = useResizablePanel({
		minWidth: SIDEBAR_MIN_PX,
		maxWidth: SIDEBAR_MAX_PX,
		defaultWidth: SIDEBAR_DEFAULT_PX,
		storageKey: APP_SIDEBAR_STORAGE_KEY,
		direction: "left",
	})

	const sidebarWidthPx = isSidebarCollapsed ? SIDEBAR_COLLAPSED_PX : expandedSidebarWidthPx

	const {
		width: detailPanelWidthPx,
		isDragging: isDraggingDetail,
		handleMouseDown: onDetailResizeStart,
	} = useResizablePanel({
		minWidth: DETAIL_MIN_PX,
		maxWidth: DETAIL_MAX_PX,
		defaultWidth: DETAIL_DEFAULT_PX,
		storageKey: APP_DETAIL_STORAGE_KEY,
		direction: "left",
	})

	// Sync projectFilesStore.selectedProject
	useEffect(() => {
		store.projectFilesStore.setSelectedProject(selectedProject)
		return () => {
			store.projectFilesStore.setSelectedProject(null)
		}
	}, [selectedProject, store.projectFilesStore])

	// Poll attachments
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
			console.error("Failed to poll app attachments:", error)
		}),
	})

	// Load attachments on project change
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

	// Listen for attachment update events
	useEffect(() => {
		const handleUpdateAttachments = (callback?: () => void) => {
			const pid = selectedProject?.id
			if (!pid) {
				callback?.()
				releaseAttachmentsRefreshWaitersWithoutFetch()
				return
			}
			updateAttachments(pid, callback)
		}

		pubsub.subscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		return () => {
			pubsub.unsubscribe(PubSubEvents.Update_Attachments, handleUpdateAttachments)
		}
	}, [selectedProject?.id, updateAttachments])

	const {
		isTopicHistoryPanelOpen,
		openTopicHistoryPanel,
		closeTopicHistoryPanel,
		toggleTopicHistoryPanel,
	} = useTopicHistoryLayoutState({
		storageKey: TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS.crewEdit,
		isEnabled: true,
	})

	const detailPanel = (
		<div className="flex h-full shrink-0 flex-col overflow-hidden border-x border-border">
			<Detail
				ref={detailRef}
				disPlayDetail={userSelectDetail}
				userSelectDetail={userSelectDetail}
				setUserSelectDetail={handleUserSelectDetail}
				attachments={attachments}
				attachmentList={attachmentList}
				topicId={selectedTopic?.id}
				baseShareUrl={`${window.location.origin}/share`}
				currentTopicStatus={selectedTopic?.task_status}
				messages={[]}
				allowEdit
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				activeFileId={activeFileId}
				onActiveFileChange={setActiveFileId}
				onActiveTabChange={handleActiveDetailTabChange}
				onFullscreenChange={setIsDetailPanelFullscreen}
				onFileTabsCacheLoaded={onFileTabsCacheLoaded}
				projectId={selectedProject?.id}
				showFallbackWhenEmpty
			/>
		</div>
	)

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
					{t("topicFiles.backToHome", "返回首页")}
				</button>
			</div>
		)
	}

	return (
		<FileActionVisibilityProvider value={HIDE_COPY_MOVE_SHARE_FILE_AND_TOPIC_ACTIONS}>
			<div
				className="flex h-full w-full overflow-hidden border border-border rounded-sm"
				data-testid="app-page"
			>
				<CrewEditPanels
					sidebarWidthPx={sidebarWidthPx}
					detailPanelWidthPx={detailPanelWidthPx}
					messagePanelWidthPx={MESSAGE_PANEL_WIDTH_PX}
					showDetailPanel={shouldShowDetailPanel}
					isDetailPanelFullscreen={isDetailPanelFullscreen}
					keepDetailMountedWhenHidden
					historyLayout={{
						isOpen: isTopicHistoryPanelOpen,
						onClose: closeTopicHistoryPanel,
						onToggle: toggleTopicHistoryPanel,
						renderPanel: ({
							isConversationPanelCollapsed,
							onExpandConversationPanel,
							onClose,
							closeButtonRef,
						}) => (
							<MessageHeaderTopicHistoryPanel
								selectedProject={selectedProject}
								topicStore={conversation.topicStore}
								topicActions={topicActions}
								isConversationPanelCollapsed={isConversationPanelCollapsed}
								onExpandConversationPanel={onExpandConversationPanel}
								hideTopicListModeIcon
								onClose={onClose}
								closeButtonRef={closeButtonRef}
							/>
						),
					}}
					onSidebarResizeStart={isSidebarCollapsed ? undefined : onSidebarResizeStart}
					onDetailResizeStart={onDetailResizeStart}
					isDraggingSidebar={isDraggingSidebar}
					isDraggingDetail={isDraggingDetail}
					sidebar={
						<AppSidebar
							selectedProject={selectedProject}
							topicFilesProps={topicFilesPropsWithPanel}
							collapsed={!!isSidebarCollapsed}
							onToggleCollapse={toggleSidebarCollapse}
							onBack={() => navigate({ name: RouteName.Super })}
						/>
					}
					detailPanel={detailPanel}
					messagePanel={
						<AppConversationPanel
							selectedProject={selectedProject}
							topicStore={conversation.topicStore}
							mentionPanelStore={store.mentionPanelStore}
							projectFilesStore={store.projectFilesStore}
							detailPanelVisible={shouldShowDetailPanel}
							historyTriggerMode="layout"
							isHistoryPanelOpen={isTopicHistoryPanelOpen}
							onToggleHistoryPanel={toggleTopicHistoryPanel}
						/>
					}
				/>
			</div>
		</FileActionVisibilityProvider>
	)
}

const AppPageInnerObserver = observer(AppPageInner)

function AppPageDesktop() {
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
			<AppPageInnerObserver projectId={projectId} />
		</AppStoreProvider>
	)
}

export default AppPageDesktop
