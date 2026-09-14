import recentProjectsStore from "@/pages/superMagic/stores/core/recentProjects"
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useState } from "react"
import { observer } from "mobx-react-lite"
import { Box, Clock3, AppWindow, SquareArrowUpRight, UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
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
	const managerIcon = <AppWindow size={16} />
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
		setPopover(null)
		setSource(next ?? { type: "recent" })
	}
	return (
		<div className="flex h-full min-h-0 flex-1 flex-col">
			<div className={collapsed ? "min-h-0 flex-1" : "flex min-h-0 flex-1 flex-col px-2"}>
				{collapsed ? (
					<ScrollArea
						className="h-full overflow-hidden"
						viewportClassName="overscroll-contain [&>div]:!block"
						hideScrollbar
						scrollShadows
					>
						<SidebarMenu className="p-2">
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
									{/* 少量项目随内容缩短；多项目受窗口比例、阅读上限和屏幕边界共同约束。 */}
									<PopoverContent
										side="right"
										align="start"
										collisionPadding={12}
										className="flex max-h-[min(70dvh,640px,var(--radix-popover-content-available-height))] w-72 flex-col overflow-hidden p-1"
									>
										<div className="flex shrink-0 items-center justify-between gap-2 px-2 py-1 text-sm font-medium">
											<span>{t("projectNavigation.recent")}</span>
											<Button
												type="button"
												variant="ghost"
												size="icon-sm"
												title={t("projectNavigation.openManager")}
												aria-label={t(
													"projectNavigation.openRecentManager",
												)}
												disabled={workspaceBusy || recentBusy}
												onClick={() => openManager({ type: "recent" })}
											>
												<SquareArrowUpRight size={16} />
											</Button>
										</div>
										<RecentProjects
											fitContent
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
						</SidebarMenu>
					</ScrollArea>
				) : (
					<>
						<SidebarExpandableItem
							label={t("projectNavigation.recent")}
							leading={recentIcon}
							isExpanded={sidebarStore.recentProjectsExpanded}
							onClick={() => sidebarStore.toggleNavigationSection("recent")}
							testId="sidebar-recent-projects"
							fill
							className={sidebarStore.recentProjectsExpanded ? "flex-1" : "shrink-0"}
							header={
								<SidebarRow
									label={t("projectNavigation.recent")}
									labelVariant="navigation"
									menuHover
									leading={recentIcon}
									isExpanded={sidebarStore.recentProjectsExpanded}
									onClick={() => sidebarStore.toggleNavigationSection("recent")}
									testId="sidebar-recent-projects-toggle"
									className="h-8 shrink-0 px-2"
								/>
							}
						>
							{(recentVisited || sidebarStore.recentProjectsExpanded) && (
								<RecentProjects active={sidebarStore.recentProjectsExpanded} />
							)}
						</SidebarExpandableItem>
						<WorkspaceList
							icon={workspaceIcon}
							onOpenManager={(workspace) =>
								openManager({ type: "workspace", workspace })
							}
							beforeItems={
								<SidebarMenuItem>
									<SidebarMenuButton
										isActive={isCollaborationWorkspace(selectedWorkspace)}
										className="mb-1 font-normal leading-5 data-[active=true]:font-normal"
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
			</div>
			{!collapsed && (
				<div
					className="shrink-0 border-y border-sidebar-border/60 px-2 py-1"
					data-testid="sidebar-project-manager-dock"
				>
					<SidebarRow
						label={t("sidebarPanels.projectManager")}
						labelVariant="navigation"
						leading={managerIcon}
						hideChevron
						onClick={() => openManager()}
						testId="sidebar-project-manager"
						className="h-8 shrink-0 px-2"
					/>
				</div>
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
