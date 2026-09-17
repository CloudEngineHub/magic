import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"

import { SuperMagicApi } from "@/apis"
import type { MicroAppRuntimeProject } from "@/apis/modules/superMagic/microApps"
import { createMentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { MessageHeaderTopicHistoryPanel } from "@/pages/superMagic/components/MessageHeader"
import { useScopedMessageHeaderTopicActions } from "@/pages/superMagic/hooks/useScopedMessageHeaderTopicActions"
import { AppStoreProvider, useAppStore } from "@/pages/superMagic/pages/MicroAppPage/context"
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

import { FileAccessProvider } from "@/pages/superMagic/fileAccess/FileAccessProvider"
import { createSessionFileAccess } from "@/pages/superMagic/fileAccess/fileAccessContext"

import PublishedMicroAppSidebar, { type PublishedMicroAppPanel } from "./PublishedMicroAppSidebar"
import { useMicroAppAuthentication } from "../hooks/useMicroAppAuthentication"

const RUNTIME_PROJECT_LOAD_SUPERSEDED = "Runtime project load superseded"

interface PublishedMicroAppConversationProviderProps {
	appId: string
	appName?: string
	enabled?: boolean
	children: ReactNode
}

interface PublishedMicroAppConversationSurfaceProps {
	appId: string
	appName?: string
	children: ReactNode
}

const PublishedMicroAppConversationSurface = observer(
	function PublishedMicroAppConversationSurface({
		appId,
		appName,
		children,
	}: PublishedMicroAppConversationSurfaceProps) {
		const [panel, setPanel] = useState<PublishedMicroAppPanel>("conversation")
		const appStore = useAppStore()
		const { conversation } = appStore
		const requireAuthentication = useMicroAppAuthentication()
		const authorization = userStore.user.authorization?.trim() || ""
		const [runtimeProject, setRuntimeProject] = useState<ProjectListItem | null>(null)
		const [runtimeProjectState, setRuntimeProjectState] = useState<
			"loading" | "absent" | "ready"
		>("loading")
		// Fail closed while authentication or the runtime binding is unconfirmed.
		const shouldShowRuntimeSidebar = Boolean(
			authorization && runtimeProject && runtimeProjectState === "ready",
		)
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
			const isCurrent = () =>
				runtimeRequestIdRef.current === requestId &&
				(userStore.user.authorization?.trim() || "") === authorization
			setRuntimeProject(null)
			setRuntimeProjectState(authorization ? "loading" : "absent")
			// Anonymous browsing must not call session APIs, which can trigger a login redirect.
			if (authorization)
				void SuperMagicApi.getMicroAppRuntimeProject(appId, {
					enableErrorMessagePrompt: false,
				})
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
				ensurePromiseRef.current = null
				ensurePromiseAppIdRef.current = null
				setRuntimeProject(null)
				conversation.reset()
				projectFilesStore.setSelectedProject(null)
			}
		}, [appId, authorization, conversation, loadRuntimeProject, projectFilesStore])

		const ensureConversation = async () => {
			const initialRequestId = runtimeRequestIdRef.current
			await requireAuthentication()
			if ((userStore.user.authorization?.trim() || "") !== authorization) {
				throw new Error(RUNTIME_PROJECT_LOAD_SUPERSEDED)
			}
			if (ensurePromiseRef.current && ensurePromiseAppIdRef.current === appId) {
				return ensurePromiseRef.current
			}
			// Authentication is async; the preview may have unmounted while awaiting it.
			if (runtimeRequestIdRef.current !== initialRequestId) {
				throw new Error(RUNTIME_PROJECT_LOAD_SUPERSEDED)
			}
			if (runtimeProject && conversation.selectedProject?.id === runtimeProject.id) {
				return { selectedProject: runtimeProject, topicStore: conversation.topicStore }
			}
			const requestId = ++runtimeRequestIdRef.current
			const isCurrent = () =>
				runtimeRequestIdRef.current === requestId &&
				(userStore.user.authorization?.trim() || "") === authorization
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
				requireAuthentication={requireAuthentication}
			>
				<TopicDesktopPanels
					containerClassName="h-full w-full overflow-hidden"
					detailPanelClassName="h-full w-full"
					detailResizeHandleClassName="border-l border-border"
					isDetailPanelFullscreen={false}
					sidebar={null}
					detailPanel={children}
					isReadOnly={!shouldShowRuntimeSidebar}
					showProjectSidebar={false}
					showProjectResizeHandle={false}
					autoExpandConversationWhenDetailVisible={false}
					initialConversationPanelCollapsed
					collapsedConversationPanelWidth={48}
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
								onExpandConversationPanel={() => {
									setPanel("conversation")
									onExpandConversationPanel()
								}}
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
						<FileAccessProvider value={runtimeFileAccess}>
							<PublishedMicroAppSidebar
								panel={panel}
								onPanelChange={setPanel}
								appId={appId}
								appName={appName}
								ensureProject={ensureConversation}
								onCloseHistory={closeTopicHistoryPanel}
								selectedProject={runtimeProject}
								topicStore={conversation.topicStore}
								mentionPanelStore={mentionPanelStore}
								projectFilesStore={projectFilesStore}
								detailPanelVisible
								isConversationPanelCollapsed={isConversationPanelCollapsed}
								onToggleConversationPanel={onToggleConversationPanel}
								onExpandConversationPanel={onExpandConversationPanel}
								historyTriggerMode={historyTriggerMode}
								isHistoryPanelOpen={isHistoryPanelOpen}
								onToggleHistoryPanel={onToggleHistoryPanel}
							/>
						</FileAccessProvider>
					)}
				/>
			</HostConversationProvider>
		)
	},
)

function PublishedMicroAppConversationProvider({
	appId,
	appName,
	enabled = true,
	children,
}: PublishedMicroAppConversationProviderProps) {
	if (!enabled) return <>{children}</>
	return (
		<AppStoreProvider>
			<PublishedMicroAppConversationSurface key={appId} appId={appId} appName={appName}>
				{children}
			</PublishedMicroAppConversationSurface>
		</AppStoreProvider>
	)
}

export default PublishedMicroAppConversationProvider
