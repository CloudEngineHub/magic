import recentProjectsStore from "@/pages/superMagic/stores/core/recentProjects"
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react"
import { observer } from "mobx-react-lite"
import { Box, Clock3, PanelsTopLeft, UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import { SidebarExpandableItem, SidebarRow } from "@/pages/superMagic/components/SidebarSection"
import type { ProjectBrowserSource } from "@/pages/superMagic/components/WorkspacesMenu/components/WorkspaceProjectsPanel"
import workspaceStore from "@/pages/superMagic/stores/core/workspace"
import { isCollaborationWorkspace } from "@/pages/superMagic/constants"
import { sidebarStore } from "@/stores/layout/SidebarStore"
import { userStore } from "@/models/user"
import { WorkspaceList } from "./WorkspaceList"
import CollapsedWorkspaceMenu from "./CollapsedWorkspaceMenu"
import RecentProjects from "./RecentProjects"

const WorkspaceProjectsPanel = lazy(
	() => import("@/pages/superMagic/components/WorkspacesMenu/components/WorkspaceProjectsPanel"),
)

/** 同一 owner 管理宽窄导航及窗口来源，临时弹层不参与栏目偏好持久化。 */
function ProjectNavigation({ collapsed }: { collapsed: boolean }) {
	const { t } = useTranslation("super")
	const [source, setSource] = useState<ProjectBrowserSource | null>(null)
	const [popover, setPopover] = useState<"recent" | "workspaces" | null>(null)
	const [workspaceBusy, setWorkspaceBusy] = useState(false)
	const [recentBusy, setRecentBusy] = useState(false)
	const [recentVisited, setRecentVisited] = useState(false)
	const userId = userStore.user.userInfo?.user_id
	const organizationCode = userStore.user.organizationCode
	const selectedWorkspace = workspaceStore.selectedWorkspace
	const recentExpanded = sidebarStore.recentProjectsExpanded
	const workspaceIcon = <Box size={16} />
	const recentIcon = <Clock3 size={16} />
	const managerIcon = <PanelsTopLeft size={16} />
	useLayoutEffect(() => {
		sidebarStore.setNavigationIdentity(userId, organizationCode)
		recentProjectsStore.setIdentity(userId, organizationCode)
		setSource(null)
	}, [userId, organizationCode])
	useEffect(() => {
		setPopover(null)
		setWorkspaceBusy(false)
		setRecentBusy(false)
	}, [collapsed, userId, organizationCode])
	useEffect(() => {
		if (recentExpanded) setRecentVisited(true)
	}, [recentExpanded])
	const closePopover = useCallback(() => setPopover(null), [])
	const openManager = (next?: ProjectBrowserSource) => {
		if (workspaceBusy || recentBusy) return
		const workspace =
			selectedWorkspace?.workspace_type === "default"
				? selectedWorkspace
				: workspaceStore.workspaces.find((item) => item.workspace_type === "default")
		setPopover(null)
		setSource(
			next ??
				(!isCollaborationWorkspace(selectedWorkspace) && workspace
					? { type: "workspace", workspace }
					: { type: "collaboration" }),
		)
	}
	return (
		<div className={collapsed ? "shrink-0 p-2" : "flex min-h-0 flex-1 flex-col px-2"}>
			{collapsed ? (
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip={t("sidebarPanels.projectManager")}
							aria-label={t("sidebarPanels.projectManager")}
							disabled={workspaceBusy || recentBusy}
							onClick={() => openManager()}
							data-testid="sidebar-project-manager-icon"
						>
							{managerIcon}
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<Popover
							open={popover === "recent"}
							onOpenChange={(open) => {
								if (!workspaceBusy && !recentBusy)
									setPopover(open ? "recent" : null)
							}}
						>
							<PopoverTrigger asChild>
								{/* React 18 下 SidebarMenuButton 不转发 ref，使用 DOM 节点承接浮层定位。 */}
								<span>
									<SidebarMenuButton
										tooltip={t("projectNavigation.recent")}
										aria-label={t("projectNavigation.recent")}
										disabled={workspaceBusy}
										data-testid="sidebar-recent-projects-icon"
									>
										{recentIcon}
									</SidebarMenuButton>
								</span>
							</PopoverTrigger>
							<PopoverContent
								side="right"
								align="start"
								className="flex h-[360px] max-h-[var(--radix-popover-content-available-height)] w-72 flex-col p-1"
							>
								<div className="shrink-0 px-2 py-2 text-sm font-medium">
									{t("projectNavigation.recent")}
								</div>
								<RecentProjects
									active={popover === "recent"}
									onSelect={closePopover}
									onBusyChange={setRecentBusy}
								/>
							</PopoverContent>
						</Popover>
					</SidebarMenuItem>
					<SidebarMenuItem>
						<CollapsedWorkspaceMenu
							open={popover === "workspaces"}
							onOpenChange={(open) => {
								if (!recentBusy) setPopover(open ? "workspaces" : null)
							}}
							onOpenManager={openManager}
							onBusyChange={setWorkspaceBusy}
							icon={workspaceIcon}
						/>
					</SidebarMenuItem>
				</SidebarMenu>
			) : (
				<>
					<SidebarRow
						label={t("sidebarPanels.projectManager")}
						leading={managerIcon}
						hideChevron
						onClick={() => openManager()}
						testId="sidebar-project-manager"
						className="h-8 shrink-0"
					/>
					<SidebarExpandableItem
						label={t("projectNavigation.recent")}
						leading={recentIcon}
						isExpanded={sidebarStore.recentProjectsExpanded}
						onClick={() => sidebarStore.toggleNavigationSection("recent")}
						testId="sidebar-recent-projects"
						fill
						className={sidebarStore.recentProjectsExpanded ? "flex-[2]" : "shrink-0"}
						header={
							<SidebarRow
								label={t("projectNavigation.recent")}
								leading={recentIcon}
								isExpanded={sidebarStore.recentProjectsExpanded}
								onClick={() => sidebarStore.toggleNavigationSection("recent")}
								testId="sidebar-recent-projects-toggle"
								className="h-8 shrink-0"
							/>
						}
					>
						{(recentVisited || sidebarStore.recentProjectsExpanded) && (
							<RecentProjects active={sidebarStore.recentProjectsExpanded} />
						)}
					</SidebarExpandableItem>
					<WorkspaceList
						icon={workspaceIcon}
						onOpenManager={(workspace) => openManager({ type: "workspace", workspace })}
						beforeItems={
							<SidebarMenuItem>
								<SidebarMenuButton
									isActive={isCollaborationWorkspace(selectedWorkspace)}
									onClick={() => openManager({ type: "collaboration" })}
									data-testid="sidebar-content-share-workspace-button"
								>
									<UsersRound size={16} className="ml-6" />
									<span>{t("workspace.shareWorkspaceName")}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						}
					/>
				</>
			)}
			{source && (
				<Suspense fallback={null}>
					<WorkspaceProjectsPanel
						open
						initialSource={source}
						onClose={() => setSource(null)}
					/>
				</Suspense>
			)}
		</div>
	)
}

export default observer(ProjectNavigation)
