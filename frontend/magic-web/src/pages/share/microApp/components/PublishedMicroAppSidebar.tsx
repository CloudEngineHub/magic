import { lazy, Suspense, useEffect, useRef, useState, type ComponentProps } from "react"
import { observer } from "mobx-react-lite"
import { CalendarClock, MessageSquare, PanelRightClose, Paperclip } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import MagicTooltip from "@/components/base/MagicTooltip"
import AppConversationPanel from "@/pages/superMagic/pages/MicroAppPage/components/AppConversationPanel"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { cn } from "@/utils/cn"
import PublishedMicroAppAttachmentsPanel from "./PublishedMicroAppAttachmentsPanel"

const ScheduledTasksPanel = lazy(
	() =>
		import("@/pages/superMagic/pages/MicroAppPage/components/MicroAppScheduledTasksPanel/MicroAppScheduledTasksPanel"),
)

export type PublishedMicroAppPanel = "conversation" | "attachments" | "tasks"

interface Props extends ComponentProps<typeof AppConversationPanel> {
	panel: PublishedMicroAppPanel
	onPanelChange: (panel: PublishedMicroAppPanel) => void
	appId: string
	appName?: string
	ensureProject: () => Promise<unknown>
	onCloseHistory: () => void
}

const PublishedMicroAppSidebar = observer(function PublishedMicroAppSidebar({
	panel,
	onPanelChange,
	appId,
	appName,
	ensureProject,
	onCloseHistory,
	...conversationProps
}: Props) {
	const { t } = useTranslation("super")
	const [failed, setFailed] = useState(false)
	const pending = useRef(false)
	const requestId = useRef(0)
	const {
		selectedProject,
		projectFilesStore,
		isConversationPanelCollapsed: collapsed,
		onExpandConversationPanel,
		onToggleConversationPanel,
	} = conversationProps

	useEffect(() => {
		// Iframe sends already expand the layout; show the messages even when another panel is selected.
		const showConversation = () => onPanelChange("conversation")
		pubsub.subscribe(PubSubEvents.Expand_Topic_Conversation_Panel, showConversation)
		return () => {
			requestId.current += 1
			pubsub.unsubscribe(PubSubEvents.Expand_Topic_Conversation_Panel, showConversation)
		}
	}, [onPanelChange])

	async function loadProject() {
		if (pending.current || selectedProject) return
		pending.current = true
		const id = ++requestId.current
		setFailed(false)
		try {
			await ensureProject()
		} catch {
			if (id === requestId.current) setFailed(true)
		} finally {
			if (id === requestId.current) pending.current = false
		}
	}

	function selectPanel(next: PublishedMicroAppPanel) {
		onPanelChange(next)
		onCloseHistory()
		onExpandConversationPanel?.()
		void loadProject()
	}

	const entries = [
		{
			value: "conversation" as const,
			label: t("microAppPage.conversation.title"),
			icon: MessageSquare,
		},
		{ value: "attachments" as const, label: t("attachmentList.projectFiles"), icon: Paperclip },
		{ value: "tasks" as const, label: t("scheduleTask.title"), icon: CalendarClock },
	]
	const navigation = (collapsed ? entries.slice(1) : entries).map(
		({ value, label, icon: Icon }) => (
			<MagicTooltip key={value} title={label}>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={label}
					aria-pressed={!collapsed && panel === value}
					className={cn(
						"shrink-0 text-foreground",
						collapsed && "!size-8 !min-h-8 !min-w-8 !rounded-md !p-0",
						!collapsed && panel === value && "bg-accent text-accent-foreground",
					)}
					onClick={() => selectPanel(value)}
					data-testid={`published-micro-app-${value}-button`}
				>
					<Icon size={16} aria-hidden />
				</Button>
			</MagicTooltip>
		),
	)
	const loading = (
		<div
			role="status"
			className="flex h-full items-center justify-center p-4 text-sm text-muted-foreground"
		>
			{t("scheduleTask.contextLoading")}
		</div>
	)

	return (
		<aside
			className={cn(
				"flex h-full min-h-0 flex-col",
				// Scope the roomier header controls to this preview rail; other conversation layouts keep their defaults.
				collapsed
					? "bg-sidebar [--conversation-header-button-size:32px] [--conversation-header-gap:8px] [--conversation-header-padding:8px]"
					: "bg-background",
			)}
			data-testid="published-micro-app-conversation-panel"
		>
			{!collapsed && (
				<div
					className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3"
					data-testid="published-micro-app-conversation-header"
				>
					<span className="min-w-0 truncate text-sm font-medium">
						{entries.find((entry) => entry.value === panel)?.label}
					</span>
					<div className="flex shrink-0 items-center gap-1">
						{navigation}
						<MagicTooltip title={t("microAppPage.conversation.collapse")}>
							<Button
								variant="ghost"
								size="icon-sm"
								aria-label={t("microAppPage.conversation.collapse")}
								onClick={onToggleConversationPanel}
							>
								<PanelRightClose size={16} aria-hidden />
							</Button>
						</MagicTooltip>
					</div>
				</div>
			)}
			{/* Keep the editor mounted across panel switches so drafts and message state survive. */}
			<div
				hidden={!collapsed && (panel !== "conversation" || !selectedProject)}
				className="min-h-0 flex-1"
			>
				<AppConversationPanel
					{...conversationProps}
					onExpandConversationPanel={() => selectPanel("conversation")}
					onToggleConversationPanel={
						collapsed ? () => selectPanel("conversation") : onToggleConversationPanel
					}
					hideConversationPanelToggle={!collapsed}
					trailingActions={
						collapsed ? (
							<div className="flex flex-col items-center gap-2">{navigation}</div>
						) : undefined
					}
				/>
			</div>
			{!collapsed &&
				(!selectedProject ? (
					<div className="min-h-0 flex-1">
						{failed ? (
							<div
								role="alert"
								className="flex h-full flex-col items-center justify-center gap-3 p-4 text-sm"
							>
								<p>{t("microAppPage.conversation.loadFailed")}</p>
								<Button variant="outline" onClick={() => void loadProject()}>
									{t("common.retry")}
								</Button>
							</div>
						) : (
							loading
						)}
					</div>
				) : panel === "attachments" ? (
					<PublishedMicroAppAttachmentsPanel
						attachments={projectFilesStore.workspaceFileTree}
					/>
				) : panel === "tasks" ? (
					<div className="min-h-0 flex-1" data-testid="published-micro-app-tasks-panel">
						<Suspense fallback={loading}>
							<ScheduledTasksPanel
								key={selectedProject.id}
								selectWorkspaceId={selectedProject.workspace_id}
								selectProjectId={selectedProject.id}
								workspaceName={selectedProject.workspace_name}
								projectName={selectedProject.project_name}
								microAppId={appId}
								microAppName={appName}
								compact
							/>
						</Suspense>
					</div>
				) : null)}
		</aside>
	)
})

export default PublishedMicroAppSidebar
