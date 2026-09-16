import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { PanelRightClose } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SuperMagicApi } from "@/apis"
import type { MicroAppRuntimeProject } from "@/apis/modules/superMagic/microApps"
import { createMentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { MessageHeaderTopicHistoryPanel } from "@/pages/superMagic/components/MessageHeader"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import { AppStoreProvider, useAppStore } from "@/pages/superMagic/pages/MicroAppPage/context"
import AppConversationPanel from "@/pages/superMagic/pages/MicroAppPage/components/AppConversationPanel"
import TopicDesktopPanels from "@/pages/superMagic/pages/TopicPage/components/TopicDesktopPanels"
import {
	TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS,
	useTopicHistoryLayoutState,
} from "@/pages/superMagic/pages/TopicPage/hooks/useTopicHistoryLayoutState"
import { ProjectFilesStore } from "@/stores/projectFiles"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { HostConversationProvider } from "@/pages/superMagic/contexts/HostConversationContext"
import { userStore } from "@/models/user"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import { cn } from "@/utils/cn"

import { FileAccessProvider } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { createSessionFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"

import PublishedMicroAppAttachmentPopover from "./PublishedMicroAppAttachmentPopover"

const RUNTIME_PROJECT_LOAD_SUPERSEDED = "Runtime project load superseded"

interface PublishedMicroAppConversationProviderProps {
	appId: string
	enabled?: boolean
	children: ReactNode
}

interface PublishedMicroAppConversationSurfaceProps {
	appId: string
	children: ReactNode
}

const PublishedMicroAppConversationSurface = observer(
	function PublishedMicroAppConversationSurface({
		appId,
		children,
	}: PublishedMicroAppConversationSurfaceProps) {
		const { t } = useTranslation("super")
		const appStore = useAppStore()
		const { conversation } = appStore
		const [runtimeProject, setRuntimeProject] = useState<ProjectListItem | null>(null)
		const [runtimeProjectState, setRuntimeProjectState] = useState<
			"loading" | "absent" | "ready"
		>("loading")
		const runtimeRequestIdRef = useRef(0)
		const ensurePromiseRef = useRef<Promise<{
			selectedProject: ProjectListItem
			topicStore: typeof conversation.topicStore
		}> | null>(null)
		const ensurePromiseAppIdRef = useRef<string | null>(null)
		const projectFilesStore = useMemo(() => new ProjectFilesStore(), [])
		const mentionPanelStore = useMemo(
			() => createMentionPanelStore(projectFilesStore),
			[projectFilesStore],
		)
		// Runtime attachments belong to the current user, independently of the source share.
		const runtimeFileAccess = useMemo(
			() =>
				createSessionFileAccess({
					projectId: runtimeProject?.id,
					topicId: conversation.topicStore.selectedTopic?.id ?? "",
				}),
			[runtimeProject?.id, conversation.topicStore.selectedTopic?.id],
		)
		const topicActions = useScopedMessageHeaderTopicActions({
			selectedProject: runtimeProject,
			selectedTopic: conversation.topicStore.selectedTopic,
			topicStore: conversation.topicStore,
		})
		const { isTopicHistoryPanelOpen, closeTopicHistoryPanel, toggleTopicHistoryPanel } =
			useTopicHistoryLayoutState({
				storageKey: `${TOPIC_HISTORY_PANEL_OPEN_STORAGE_KEYS.microApp}.published`,
				isEnabled: runtimeProjectState === "ready",
				persistOpenState: false,
			})

		const loadRuntimeProject = useCallback(
			async (project: Pick<MicroAppRuntimeProject, "id">, isCurrent: () => boolean) => {
				await conversation.loadProjectContext(project.id, { isCurrent })
				if (!isCurrent()) return null
				const loadedProject = conversation.selectedProject
				if (!loadedProject) throw new Error("Runtime project could not be loaded")
				projectFilesStore.setSelectedProject(loadedProject)
				try {
					const attachmentResult = await loadProjectAttachments({
						projectId: loadedProject.id,
						// Runtime-project files use the authenticated session. The share token
						// belongs to the published origin project and would force the loader
						// to read share resource files instead of this runtime project.
						enableErrorMessagePrompt: false,
					})
					if (!isCurrent()) return null
					projectFilesStore.setWorkspaceFileTree(attachmentResult.tree, {
						list: attachmentResult.list,
						source: "published-micro-app-runtime",
					})
				} catch (error) {
					if (!isCurrent()) return null
					// File loading should not hide an otherwise valid runtime conversation.
					console.error("Failed to load published micro-app attachments:", error)
					projectFilesStore.setWorkspaceFileTree([])
				}
				setRuntimeProject(loadedProject)
				setRuntimeProjectState("ready")
				return loadedProject
			},
			[conversation, projectFilesStore],
		)

		useEffect(() => {
			// Every appId gets a version so old responses cannot update the new preview.
			const requestId = ++runtimeRequestIdRef.current
			const isCurrent = () => runtimeRequestIdRef.current === requestId
			setRuntimeProject(null)
			setRuntimeProjectState("loading")
			void SuperMagicApi.getMicroAppRuntimeProject(appId, { enableErrorMessagePrompt: false })
				.then(async (result) => {
					if (!isCurrent()) return
					if (result.exists && result.project)
						await loadRuntimeProject(result.project, isCurrent)
					else if (isCurrent()) setRuntimeProjectState("absent")
				})
				.catch(() => {
					if (isCurrent()) setRuntimeProjectState("absent")
				})
			return () => {
				runtimeRequestIdRef.current += 1
				setRuntimeProject(null)
				conversation.reset()
				projectFilesStore.setSelectedProject(null)
			}
		}, [appId, conversation, loadRuntimeProject, projectFilesStore])

		const ensureConversation = async () => {
			if (ensurePromiseRef.current && ensurePromiseAppIdRef.current === appId) {
				return ensurePromiseRef.current
			}
			if (!userStore.user.authorization?.trim()) throw new Error("Authentication required")
			if (runtimeProject && conversation.selectedProject?.id === runtimeProject.id) {
				return { selectedProject: runtimeProject, topicStore: conversation.topicStore }
			}
			const requestId = ++runtimeRequestIdRef.current
			const isCurrent = () => runtimeRequestIdRef.current === requestId
			setRuntimeProject(null)
			setRuntimeProjectState("loading")
			const promise = (async () => {
				const result = await SuperMagicApi.ensureMicroAppRuntimeProject(appId)
				if (!isCurrent()) throw new Error(RUNTIME_PROJECT_LOAD_SUPERSEDED)
				const loadedProject = await loadRuntimeProject(result.project, isCurrent)
				if (!isCurrent() || !loadedProject) throw new Error(RUNTIME_PROJECT_LOAD_SUPERSEDED)
				// Return the hydrated project, not the ensure API stub.
				return { selectedProject: loadedProject, topicStore: conversation.topicStore }
			})()
			ensurePromiseRef.current = promise
			ensurePromiseAppIdRef.current = appId
			try {
				return await promise
			} finally {
				if (ensurePromiseRef.current === promise) {
					ensurePromiseRef.current = null
					ensurePromiseAppIdRef.current = null
				}
			}
		}

		return (
			<HostConversationProvider
				selectedProject={runtimeProject}
				topicStore={conversation.topicStore}
				ensureConversation={ensureConversation}
			>
				<TopicDesktopPanels
					containerClassName="h-full w-full overflow-hidden"
					detailPanelClassName="h-full w-full"
					detailResizeHandleClassName="border-l border-border"
					isDetailPanelFullscreen={false}
					sidebar={null}
					detailPanel={children}
					isReadOnly={runtimeProjectState !== "ready"}
					showProjectSidebar={false}
					showProjectResizeHandle={false}
					autoExpandConversationWhenDetailVisible={false}
					initialConversationPanelCollapsed
					persistConversationPanelState={false}
					conversationResizeHandleGripVariant="dots"
					historyOverlayScope="container"
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
								selectedProject={runtimeProject}
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
					shouldShowDetailPanel
					renderMessagePanel={({
						isConversationPanelCollapsed,
						onToggleConversationPanel,
						onExpandConversationPanel,
						historyTriggerMode,
						isHistoryPanelOpen,
						onToggleHistoryPanel,
					}) => (
						<aside
							className={cn(
								"flex h-full min-h-0 flex-col",
								isConversationPanelCollapsed ? "bg-sidebar" : "bg-background",
							)}
							data-testid="published-micro-app-conversation-panel"
						>
							{!isConversationPanelCollapsed ? (
								<div
									className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3"
									data-testid="published-micro-app-conversation-header"
								>
									<div className="flex min-w-0 items-center gap-1">
										<button
											type="button"
											className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
											onClick={onToggleConversationPanel}
											aria-label={t("microAppPage.conversation.collapse")}
										>
											<PanelRightClose size={16} />
										</button>
										<span className="min-w-0 text-sm font-medium">
											{t("microAppPage.conversation.title")}
										</span>
									</div>
									<div className="flex items-center gap-1">
										<PublishedMicroAppAttachmentPopover
											attachments={projectFilesStore.workspaceFileTree}
										/>
									</div>
								</div>
							) : null}
							<div className="min-h-0 flex-1">
								<FileAccessProvider value={runtimeFileAccess}>
									<AppConversationPanel
										selectedProject={runtimeProject}
										topicStore={conversation.topicStore}
										mentionPanelStore={mentionPanelStore}
										projectFilesStore={projectFilesStore}
										detailPanelVisible
										isConversationPanelCollapsed={isConversationPanelCollapsed}
										onToggleConversationPanel={onToggleConversationPanel}
										onExpandConversationPanel={onExpandConversationPanel}
										hideConversationPanelToggle={!isConversationPanelCollapsed}
										historyTriggerMode={historyTriggerMode}
										isHistoryPanelOpen={isHistoryPanelOpen}
										onToggleHistoryPanel={onToggleHistoryPanel}
										trailingActions={
											isConversationPanelCollapsed ? (
												<PublishedMicroAppAttachmentPopover
													attachments={
														projectFilesStore.workspaceFileTree
													}
												/>
											) : undefined
										}
									/>
								</FileAccessProvider>
							</div>
						</aside>
					)}
				/>
			</HostConversationProvider>
		)
	},
)

function PublishedMicroAppConversationProvider({
	appId,
	enabled = true,
	children,
}: PublishedMicroAppConversationProviderProps) {
	if (!enabled) return <>{children}</>
	return (
		<AppStoreProvider>
			<PublishedMicroAppConversationSurface appId={appId}>
				{children}
			</PublishedMicroAppConversationSurface>
		</AppStoreProvider>
	)
}

export default PublishedMicroAppConversationProvider
