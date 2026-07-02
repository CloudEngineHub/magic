import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Loader2 } from "lucide-react"
import { useDebounceFn, useDeepCompareEffect, useLocalStorageState, useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import useNavigate from "@/routes/hooks/useNavigate"
import useResizablePanel from "@/pages/superMagic/hooks/useResizablePanel"
import TopicResizeHandle from "@/pages/superMagic/pages/TopicPage/components/TopicResizeHandle"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { useAttachmentsPolling } from "@/pages/superMagic/hooks/useAttachmentsPolling"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import {
	releaseAttachmentsRefreshWaitersWithoutFetch,
	withAttachmentsRefreshWaitersResolved,
} from "@/pages/superMagic/services/attachmentsTopicSync"
import {
	FileActionVisibilityProvider,
	HIDE_COPY_MOVE_SHARE_FILE_AND_TOPIC_ACTIONS,
} from "@/pages/superMagic/providers/file-action-visibility-provider"
import { SuperMagicApi } from "@/apis"
import { useDefaultModeModelListRefreshOnMount } from "@/pages/superMagic/hooks"
import { useCreateTopicListener } from "@/pages/superMagic/components/TopicMode"
import { RouteName } from "@/routes/constants"
import { AppStoreProvider, useAppStore } from "./context"
import AppConversationPanel from "./components/AppConversationPanel"
import MicroAppHeader from "./components/MicroAppHeader"
import MicroAppHtmlPreview from "./components/MicroAppHtmlPreview"
import MicroAppPreviewDialog from "./components/MicroAppPreviewDialog"
import {
	collectRootHtmlFiles,
	getAttachmentId,
	resolveSelectedHtmlEntry,
} from "./utils/microAppFiles"

const SIDEBAR_DEFAULT_PX = 280
const SIDEBAR_MIN_PX = 220
const SIDEBAR_MAX_PX = 420
const MESSAGE_PANEL_WIDTH_PX = 360

const MICRO_APP_SIDEBAR_STORAGE_KEY = "MAGIC:micro-app-page-sidebar-width"
const MICRO_APP_SIDEBAR_COLLAPSED_KEY = "MAGIC:micro-app-page-sidebar-collapsed"

function MicroAppPageInner({ projectId }: { projectId: string }) {
	const { t } = useTranslation("super")
	const store = useAppStore()
	const { conversation } = store
	const navigate = useNavigate()
	const [isInitialAttachmentsLoaded, setIsInitialAttachmentsLoaded] = useState(false)
	const [selectedEntryFileId, setSelectedEntryFileId] = useState<string | null>(null)
	const [previewFile, setPreviewFile] = useState<AttachmentItem | null>(null)
	const selectedProject = conversation.selectedProject
	const selectedTopic = conversation.topicStore.selectedTopic
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
		setSelectedEntryFileId(null)
		setPreviewFile(null)
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

	const htmlFiles = useMemo(() => collectRootHtmlFiles(attachmentList), [attachmentList])
	const selectedEntryFile = useMemo(
		() =>
			resolveSelectedHtmlEntry({
				items: attachmentList,
				selectedFileId: selectedEntryFileId,
			}),
		[attachmentList, selectedEntryFileId],
	)

	useEffect(() => {
		if (!isInitialAttachmentsLoaded) return

		const nextEntryId = selectedEntryFile ? getAttachmentId(selectedEntryFile) : null
		if (nextEntryId !== selectedEntryFileId) {
			setSelectedEntryFileId(nextEntryId)
		}
	}, [isInitialAttachmentsLoaded, selectedEntryFile, selectedEntryFileId])

	const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorageState<boolean>(
		MICRO_APP_SIDEBAR_COLLAPSED_KEY,
		{ defaultValue: true },
	)

	const toggleSidebarCollapse = useMemoizedFn(() => {
		setIsSidebarCollapsed((prev) => !prev)
	})

	const {
		width: sidebarWidthPx,
		isDragging: isDraggingSidebar,
		handleMouseDown: onSidebarResizeStart,
	} = useResizablePanel({
		minWidth: SIDEBAR_MIN_PX,
		maxWidth: SIDEBAR_MAX_PX,
		defaultWidth: SIDEBAR_DEFAULT_PX,
		storageKey: MICRO_APP_SIDEBAR_STORAGE_KEY,
		direction: "left",
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

	const handleOpenPreview = useMemoizedFn((fileItem?: AttachmentItem) => {
		if (!fileItem) return
		setPreviewFile(fileItem)
	})

	const topicFilesProps = useMemo(
		() => ({
			attachments,
			setUserSelectDetail: () => undefined,
			onFileClick: handleOpenPreview,
			projectId: selectedProject?.id,
			activeFileId: previewFile?.file_id || selectedEntryFile?.file_id || null,
			selectedTopic,
			onAttachmentsChange: setAttachments,
			allowEdit: true,
			selectedWorkspace: undefined,
			selectedProject,
			projects: [],
			workspaces: [],
			isInProject: true,
		}),
		[
			attachments,
			handleOpenPreview,
			previewFile?.file_id,
			selectedEntryFile?.file_id,
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
		<FileActionVisibilityProvider value={HIDE_COPY_MOVE_SHARE_FILE_AND_TOPIC_ACTIONS}>
			<div
				className="flex h-full w-full overflow-hidden rounded-sm border border-border bg-background"
				data-testid="micro-app-page"
			>
				{!isSidebarCollapsed && (
					<>
						<aside
							className="h-full shrink-0 overflow-hidden border-r border-border bg-background p-2"
							style={{ width: sidebarWidthPx }}
							data-testid="micro-app-file-sidebar"
						>
							<TopicFilesButton {...topicFilesProps} />
						</aside>
						<TopicResizeHandle
							onMouseDown={(event) => onSidebarResizeStart(event)}
							className={isDraggingSidebar ? "before:opacity-100" : undefined}
						/>
					</>
				)}

				<main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
					<MicroAppHeader
						selectedProject={selectedProject}
						htmlFiles={htmlFiles}
						selectedEntryId={
							selectedEntryFile
								? getAttachmentId(selectedEntryFile)
								: selectedEntryFileId
						}
						isSidebarOpen={!isSidebarCollapsed}
						onBack={handleBackToMicroApps}
						onToggleSidebar={toggleSidebarCollapse}
						onEntryChange={setSelectedEntryFileId}
					/>
					<div className="min-h-0 flex-1 overflow-hidden">
						<MicroAppHtmlPreview
							entryFile={selectedEntryFile}
							attachments={attachments}
							attachmentList={attachmentList}
							selectedProject={selectedProject}
							selectedTopic={selectedTopic}
							projectId={selectedProject?.id}
							isLoading={!isInitialAttachmentsLoaded}
							onOpenPreview={handleOpenPreview}
						/>
					</div>
				</main>

				<aside
					className="h-full shrink-0 overflow-hidden border-l border-border bg-background"
					style={{ width: MESSAGE_PANEL_WIDTH_PX }}
					data-testid="micro-app-conversation-panel"
				>
					<AppConversationPanel
						selectedProject={selectedProject}
						topicStore={conversation.topicStore}
						mentionPanelStore={store.mentionPanelStore}
						projectFilesStore={store.projectFilesStore}
						detailPanelVisible
					/>
				</aside>

				<MicroAppPreviewDialog
					open={previewFile != null}
					file={previewFile}
					attachments={attachments}
					attachmentList={attachmentList}
					selectedProject={selectedProject}
					selectedTopic={selectedTopic}
					projectId={selectedProject?.id}
					onOpenChange={(open) => {
						if (!open) setPreviewFile(null)
					}}
				/>
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
