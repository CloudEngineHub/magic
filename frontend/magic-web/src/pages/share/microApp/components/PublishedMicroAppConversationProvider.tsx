import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { PanelRightOpen, PanelRightClose } from "lucide-react"
import { useTranslation } from "react-i18next"

import { SuperMagicApi } from "@/apis"
import type { MicroAppRuntimeProject } from "@/apis/modules/superMagic/microApps"
import { createMentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import { AppStoreProvider, useAppStore } from "@/pages/superMagic/pages/MicroAppPage/context"
import AppConversationPanel from "@/pages/superMagic/pages/MicroAppPage/components/AppConversationPanel"
import { ProjectFilesStore } from "@/stores/projectFiles"
import { cn } from "@/utils/cn"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { HostConversationProvider } from "@/pages/superMagic/contexts/HostConversationContext"
import { userStore } from "@/models/user"

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
		const runtimeProjectRef = useRef<ProjectListItem | null>(null)
		const [runtimeProjectState, setRuntimeProjectState] = useState<
			"loading" | "absent" | "ready"
		>("loading")
		const [isOpen, setIsOpen] = useState(false)
		const ensurePromiseRef = useRef<Promise<{
			selectedProject: ProjectListItem
			topicStore: typeof conversation.topicStore
		}> | null>(null)
		const projectFilesStore = useMemo(() => new ProjectFilesStore(), [])
		const mentionPanelStore = useMemo(
			() => createMentionPanelStore(projectFilesStore),
			[projectFilesStore],
		)

		const loadRuntimeProject = useCallback(
			async (project: Pick<MicroAppRuntimeProject, "id">) => {
				await conversation.loadProjectContext(project.id)
				const loadedProject = conversation.selectedProject
				if (!loadedProject) throw new Error("Runtime project could not be loaded")
				projectFilesStore.setSelectedProject(loadedProject)
				setRuntimeProject(loadedProject)
				runtimeProjectRef.current = loadedProject
				setRuntimeProjectState("ready")
			},
			[conversation, projectFilesStore],
		)

		useEffect(() => {
			let cancelled = false
			setRuntimeProjectState("loading")
			void SuperMagicApi.getMicroAppRuntimeProject(appId, { enableErrorMessagePrompt: false })
				.then(async (result) => {
					if (cancelled) return
					if (runtimeProjectRef.current) return
					if (result.exists && result.project) await loadRuntimeProject(result.project)
					else setRuntimeProjectState("absent")
				})
				.catch(() => {
					if (!cancelled) setRuntimeProjectState("absent")
				})
			return () => {
				cancelled = true
				runtimeProjectRef.current = null
				conversation.reset()
				projectFilesStore.setSelectedProject(null)
			}
		}, [appId, conversation, loadRuntimeProject, projectFilesStore])

		const ensureConversation = async () => {
			if (ensurePromiseRef.current) return ensurePromiseRef.current
			if (!userStore.user.authorization?.trim()) throw new Error("Authentication required")
			if (runtimeProject && conversation.selectedProject?.id === runtimeProject.id) {
				return { selectedProject: runtimeProject, topicStore: conversation.topicStore }
			}
			ensurePromiseRef.current = (async () => {
				const result = await SuperMagicApi.ensureMicroAppRuntimeProject(appId)
				await loadRuntimeProject(result.project)
				return { selectedProject: result.project, topicStore: conversation.topicStore }
			})()
			try {
				return await ensurePromiseRef.current
			} finally {
				ensurePromiseRef.current = null
			}
		}

		return (
			<HostConversationProvider
				selectedProject={runtimeProject}
				topicStore={conversation.topicStore}
				ensureConversation={ensureConversation}
			>
				<div className="relative flex h-full min-h-0 w-full overflow-hidden">
					<div className="min-w-0 flex-1">{children}</div>
					{runtimeProjectState === "ready" && isOpen ? (
						<aside
							className="absolute inset-0 z-10 flex min-w-0 flex-col bg-background md:relative md:inset-auto md:w-[360px] md:shrink-0 md:border-l md:border-border"
							data-testid="published-micro-app-conversation-panel"
						>
							<div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
								<span className="text-sm font-medium">
									{t("microAppPage.conversation.title")}
								</span>
								<button
									type="button"
									className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
									onClick={() => setIsOpen(false)}
									aria-label={t("microAppPage.conversation.collapse")}
								>
									<PanelRightClose size={16} />
								</button>
							</div>
							<div className="min-h-0 flex-1">
								<AppConversationPanel
									selectedProject={runtimeProject}
									topicStore={conversation.topicStore}
									mentionPanelStore={mentionPanelStore}
									projectFilesStore={projectFilesStore}
									detailPanelVisible
									onExpandConversationPanel={() => setIsOpen(true)}
								/>
							</div>
						</aside>
					) : runtimeProjectState === "ready" ? (
						<aside className="flex h-full w-10 shrink-0 items-start justify-center border-l border-border bg-background py-2">
							<button
								type="button"
								className={cn(
									"rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
								)}
								onClick={() => setIsOpen(true)}
								aria-label={t("microAppPage.conversation.expand")}
								data-testid="published-micro-app-conversation-expand"
							>
								<PanelRightOpen size={16} />
							</button>
						</aside>
					) : null}
				</div>
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
