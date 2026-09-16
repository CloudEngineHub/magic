import recentProjectsStore from "@/pages/superMagic/stores/core/recentProjects"
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
} from "react"
import { observer } from "mobx-react-lite"
import { Box, Clock3, AppWindow, SquareArrowUpRight, UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import type { ProjectBrowserSource } from "@/pages/superMagic/components/WorkspacesMenu/components/WorkspaceProjectsPanel"
import workspaceStore from "@/pages/superMagic/stores/core/workspace"
import { isCollaborationWorkspace } from "@/pages/superMagic/constants"
import { sidebarStore } from "@/stores/layout/SidebarStore"
import { userStore } from "@/models/user"
import { WorkspaceList } from "./WorkspaceList"
import CollapsedWorkspaceMenu from "./CollapsedWorkspaceMenu"
import RecentProjects from "./RecentProjects"
import ProjectNavigationTabs from "./ProjectNavigationTabs"

const WorkspaceProjectsPanel = lazy(
	() => import("@/pages/superMagic/components/WorkspacesMenu/components/WorkspaceProjectsPanel"),
)

/** 同一 owner 管理宽窄导航及窗口来源，临时弹层不参与栏目偏好持久化。 */
function ProjectNavigation({
	collapsed,
	apps,
	onBusyChange,
	onSelect,
}: {
	collapsed: boolean
	apps: ReactNode
	onBusyChange?: (busy: boolean) => void
	onSelect?: () => void
}) {
	const { t } = useTranslation("super")
	const [source, setSource] = useState<ProjectBrowserSource | null>(null)
	const [popover, setPopover] = useState<"recent" | "workspaces" | null>(null)
	const [workspaceBusy, setWorkspaceBusy] = useState(false)
	const [recentBusy, setRecentBusy] = useState(false)
	const [recentVisited, setRecentVisited] = useState(false)
	const [createProject, setCreateProject] = useState(false)
	const userId = userStore.user.userInfo?.user_id
	const organizationCode = userStore.user.organizationCode
	const selectedWorkspace = workspaceStore.selectedWorkspace
	const recentExpanded = sidebarStore.recentProjectsExpanded
	const workspaceIcon = <Box size={16} />
	const recentIcon = <Clock3 size={16} />
	const managerIcon = <AppWindow size={16} />
	const scrollRef = useRef<HTMLDivElement>(null)
	const scrollAreaRef = useRef<HTMLDivElement>(null)
	const navigationRef = useRef<HTMLDivElement>(null)
	const scrollKey = `sidebar-scroll:${collapsed ? "collapsed" : sidebarStore.expandedNavigationSection}`
	useLayoutEffect(() => {
		const navigation = navigationRef.current
		if (collapsed || !navigation) return
		const headers = Array.from(
			navigation.querySelectorAll<HTMLElement>("[data-sidebar-navigation-header]"),
		)
		const tabs = headers.find((header) => header.dataset.sidebarNavigationHeader === "tabs")
		// 分类、操作栏、工作区标题逐层吸顶；实际高度同时覆盖搜索态和字号变化，隐藏栏目不占位。
		const measure = () => {
			navigation.style.setProperty(
				"--project-navigation-tabs-height",
				`${tabs?.offsetHeight ?? 0}px`,
			)
			navigation.style.setProperty(
				"--workspace-list-sticky-top",
				`${headers.reduce((height, header) => height + header.offsetHeight, 0)}px`,
			)
		}
		measure()
		const observer = new ResizeObserver(measure)
		headers.forEach((header) => observer.observe(header))
		return () => {
			observer.disconnect()
			navigation.style.removeProperty("--project-navigation-tabs-height")
			navigation.style.removeProperty("--workspace-list-sticky-top")
		}
	}, [collapsed, recentExpanded, userId, organizationCode])
	useLayoutEffect(() => {
		sidebarStore.setNavigationIdentity(userId, organizationCode)
		recentProjectsStore.setIdentity(userId, organizationCode)
		setSource(null)
	}, [userId, organizationCode])
	useLayoutEffect(() => {
		const viewport = scrollRef.current
		if (viewport)
			viewport.scrollTop = sidebarStore.navigationScrollPositions.get(scrollKey) ?? 0
	}, [scrollKey, userId, organizationCode])
	useEffect(() => {
		setPopover(null)
		setWorkspaceBusy(false)
		setRecentBusy(false)
	}, [collapsed, userId, organizationCode])
	useEffect(() => {
		if (recentExpanded) setRecentVisited(true)
	}, [recentExpanded])
	useEffect(() => {
		onBusyChange?.(workspaceBusy || recentBusy || source !== null || popover !== null)
	}, [workspaceBusy, recentBusy, source, popover, onBusyChange])
	useEffect(() => () => onBusyChange?.(false), [onBusyChange])
	const closePopover = useCallback(() => setPopover(null), [])
	const openManager = (next?: ProjectBrowserSource, creating = false) => {
		setPopover(null)
		setCreateProject(creating)
		setSource(next ?? { type: "recent" })
	}
	const handleCreateProject = () =>
		openManager(
			selectedWorkspace?.id &&
				selectedWorkspace.workspace_type === "default" &&
				!isCollaborationWorkspace(selectedWorkspace)
				? { type: "workspace", workspace: selectedWorkspace }
				: { type: "recent" },
			true,
		)
	return (
		<div className="flex h-full min-h-0 flex-1 flex-col" data-sidebar-project-navigation>
			<ScrollArea
				ref={scrollAreaRef}
				viewportRef={scrollRef}
				className="min-h-0 flex-1 overflow-hidden"
				viewportClassName="overscroll-contain [&>div]:!block"
				hideScrollbar
				scrollHints={{
					variant: "both",
					upLabel: t("projectNavigation.scrollUp"),
					downLabel: t("projectNavigation.scrollDown"),
				}}
				viewportProps={{
					"data-workspaces-scroll-container": !collapsed && !recentExpanded,
					onScroll: (event) =>
						sidebarStore.navigationScrollPositions.set(
							scrollKey,
							event.currentTarget.scrollTop,
						),
				}}
				data-testid="sidebar-content-root"
			>
				{apps}
				<div className="mx-2 my-2 h-px bg-sidebar-border/25" />
				<div
					ref={navigationRef}
					className={
						collapsed
							? ""
							: "px-2 [--project-navigation-tabs-height:0px] [--workspace-list-sticky-top:0px]"
					}
				>
					{collapsed ? (
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
					) : (
						<>
							<ProjectNavigationTabs
								disabled={workspaceBusy || recentBusy}
								onOpenManager={() => openManager()}
							/>
							<div
								hidden={!recentExpanded}
								className={recentExpanded ? "flex flex-col" : "hidden"}
							>
								{(recentVisited || sidebarStore.recentProjectsExpanded) && (
									<RecentProjects
										key={JSON.stringify([userId, organizationCode])}
										externalScrollRef={scrollRef}
										active={recentExpanded}
										onBusyChange={setRecentBusy}
										onSelect={onSelect}
										onCreate={handleCreateProject}
									/>
								)}
							</div>
							<WorkspaceList
								scrollRef={scrollRef}
								scrollAreaRef={scrollAreaRef}
								key={JSON.stringify([userId, organizationCode])}
								onBusyChange={setWorkspaceBusy}
								onOpenManager={(workspace) =>
									openManager({ type: "workspace", workspace })
								}
								beforeItems={
									<SidebarMenuItem>
										<SidebarMenuButton
											isActive={isCollaborationWorkspace(selectedWorkspace)}
											disabled={workspaceBusy || recentBusy}
											className="mb-1 text-[13px] font-normal leading-5 data-[active=true]:font-normal"
											onClick={() => openManager({ type: "collaboration" })}
											data-testid="sidebar-content-share-workspace-button"
										>
											<UsersRound
												size={16}
												className="ml-6 text-sidebar-foreground/70"
											/>
											<span>{t("workspace.shareWorkspaceName")}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								}
							/>
						</>
					)}
				</div>
			</ScrollArea>
			{source && (
				<Suspense fallback={null}>
					<WorkspaceProjectsPanel
						open
						initialSource={source}
						initialAction={createProject ? "create-project" : undefined}
						onClose={() => setSource(null)}
					/>
				</Suspense>
			)}
		</div>
	)
}

export default observer(ProjectNavigation)
