import { Suspense, lazy, useLayoutEffect, useRef, useState, type MouseEvent, type Ref } from "react"
import { useLocation } from "react-router"
import { ChevronRight, Home, LayoutGrid, MessageCircle, UsersRound } from "lucide-react"
import { useTranslation } from "react-i18next"
import slidesTemplateFireIcon from "@/assets/resources/icons/fire.webp"
import { WorkspaceList } from "./WorkspaceList"
import CollapsedWorkspaceMenu from "./CollapsedWorkspaceMenu"
import type { SidebarContentProps } from "./types"
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/shadcn-ui/sidebar"
import workspaceStore from "@/pages/superMagic/stores/core/workspace"
import { isCollaborationWorkspace } from "@/pages/superMagic/constants"
import SuperMagicService from "@/pages/superMagic/services"
import AppsSubMenu from "./AppsSubMenu"
import ChatsSubMenu from "./ChatsSubMenu"
import useNavigate from "@/routes/hooks/useNavigate"
import { RouteName } from "@/routes/constants"
import { getRoutePath, routesPathMatch } from "@/routes/history/helpers"
import Divider from "@/components/other/Divider"
import { useSidebarMarketMenuItems } from "./hooks/useSidebarMarketMenuItems"
import { getClawBrandTranslationValues } from "@/pages/superMagic/utils/clawBrand"
import { observer } from "mobx-react-lite"
import useResourceStatusPolling from "@/pages/superMagic/hooks/useResourceStatusPolling"
import { useNavigateToSuperHome } from "./hooks/useNavigateToSuperHome"
import { isMagicApp } from "@/utils/devices"
import { openAudioRecordingsInMagicApp } from "@/layouts/BaseLayout/utils/magicAppNavigation"
import { useSlidesTemplateTotal } from "@/pages/superMagic/hooks/useSlidesTemplateTotal"
import { useAnimatedNumber } from "@/pages/superMagic/hooks/useAnimatedNumber"
import { formatNumber } from "@/utils/format"
import { cn } from "@/lib/utils"

const CollaborationProjectsPanel = lazy(
	() =>
		import("@/pages/superMagic/components/WorkspacesMenu/components/CollaborationProjectsPanel"),
)

export function canShowSlidesTemplateCount({
	availableWidth,
	iconWidth,
	titleWidth,
	countWidth,
	gap,
}: {
	availableWidth: number
	iconWidth: number
	titleWidth: number
	countWidth: number
	gap: number
}) {
	const requiredWidth = iconWidth + titleWidth + countWidth + gap * 2
	return requiredWidth <= availableWidth + 1
}

function SlidesTemplateCountBadge({
	templateCount,
	testId,
	showCount = true,
	className,
	badgeRef,
}: {
	templateCount: string
	testId?: string
	showCount?: boolean
	className?: string
	badgeRef?: Ref<HTMLSpanElement>
}) {
	return (
		<span
			ref={badgeRef}
			className={cn(
				"flex h-6 shrink-0 items-center gap-1 rounded-full bg-[#fff2ec] px-2 text-sm font-medium tabular-nums leading-none text-[#ff6a1f]",
				className,
			)}
			data-testid={testId}
		>
			<img
				src={slidesTemplateFireIcon}
				alt=""
				aria-hidden="true"
				className="h-4 w-4 object-contain"
			/>
			{showCount && (
				<span
					data-testid={
						testId ? "sidebar-content-slides-templates-count-value" : undefined
					}
				>
					{templateCount}
				</span>
			)}
		</span>
	)
}

function SidebarContent({ collapsed }: SidebarContentProps) {
	const { t } = useTranslation(["sidebar", "super"])
	useResourceStatusPolling()
	const clawBrandValues = getClawBrandTranslationValues()
	const [shareProjectsPanelOpen, setShareProjectsPanelOpen] = useState(false)
	const location = useLocation()
	const workspaces = workspaceStore.workspaces
	const selectedWorkspace = workspaceStore.selectedWorkspace
	const isShareWorkspaceActive = isCollaborationWorkspace(selectedWorkspace)
	const navigate = useNavigate()
	const sidebarMarketMenuItems = useSidebarMarketMenuItems()
	const { superRouteUrl, handleNavigateToSuperHome } = useNavigateToSuperHome()
	const slidesTemplateRowRef = useRef<HTMLDivElement>(null)
	const slidesTemplateTotal = useSlidesTemplateTotal()
	const animatedSlidesTemplateTotal = useAnimatedNumber(slidesTemplateTotal)
	const slidesTemplateTitleRef = useRef<HTMLSpanElement>(null)
	const slidesTemplateCountMeasureRef = useRef<HTMLSpanElement>(null)
	const [shouldShowSlidesTemplateCount, setShouldShowSlidesTemplateCount] = useState(true)
	const slidesTemplateCount =
		animatedSlidesTemplateTotal !== undefined
			? t("slidesTemplates.templateCount", {
					count: formatNumber(animatedSlidesTemplateTotal),
				})
			: null
	const slidesTemplateCountForMeasure =
		slidesTemplateTotal !== undefined
			? t("slidesTemplates.templateCount", {
					count: formatNumber(slidesTemplateTotal),
				})
			: null

	useLayoutEffect(() => {
		const row = slidesTemplateRowRef.current
		const title = slidesTemplateTitleRef.current
		const countBadge = slidesTemplateCountMeasureRef.current
		if (!row || !title || !countBadge || !slidesTemplateCountForMeasure || collapsed) return

		const updateVisibility = () => {
			const rowStyle = window.getComputedStyle(row)
			const gap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap) || 0
			const icon = row.firstElementChild as HTMLElement | null
			const iconWidth = icon?.getBoundingClientRect().width ?? 0
			const titleWidth = title.scrollWidth
			const countWidth = countBadge.getBoundingClientRect().width
			const nextVisible = canShowSlidesTemplateCount({
				availableWidth: row.clientWidth,
				iconWidth,
				titleWidth,
				countWidth,
				gap,
			})

			setShouldShowSlidesTemplateCount((current) =>
				current === nextVisible ? current : nextVisible,
			)
		}

		updateVisibility()
		const resizeObserver = new ResizeObserver(updateVisibility)
		resizeObserver.observe(row)
		resizeObserver.observe(title)
		resizeObserver.observe(countBadge)

		return () => resizeObserver.disconnect()
	}, [collapsed, slidesTemplateCountForMeasure])

	function shouldHandleAnchorClick(event: MouseEvent<HTMLAnchorElement>) {
		return (
			event.button === 0 &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey &&
			!event.altKey
		)
	}

	function handleNavigateToRoute(routeName: RouteName, event: MouseEvent<HTMLAnchorElement>) {
		if (!shouldHandleAnchorClick(event)) return
		event.preventDefault()

		// Magic App should hand audio recordings back to the native recording tab even on desktop UI.
		if (routeName === RouteName.AudioRecordings && isMagicApp) {
			openAudioRecordingsInMagicApp()
			return
		}

		if (routesPathMatch(routeName, location.pathname)) return
		navigate({ name: routeName })
	}

	function renderSidebarMarketMenuItem({
		titleKey,
		routeName,
		testId,
		Icon,
	}: (typeof sidebarMarketMenuItems)[number]) {
		const title =
			titleKey === "sidebar:superLobster.title" ? t(titleKey, clawBrandValues) : t(titleKey)
		const isSlidesTemplateMenuItem = routeName === RouteName.SuperSlidesTemplates
		const templateCount = isSlidesTemplateMenuItem ? slidesTemplateCount : null
		const tooltip = collapsed
			? templateCount
				? {
						children: (
							<div
								className="flex items-center gap-2 text-sm"
								data-testid="sidebar-content-slides-templates-tooltip"
							>
								<span>{title}</span>
								<SlidesTemplateCountBadge templateCount={templateCount} />
							</div>
						),
					}
				: title
			: undefined

		return (
			<SidebarMenuItem key={routeName}>
				<SidebarMenuButton
					asChild
					tooltip={tooltip}
					data-testid={testId}
					className={
						collapsed && isSlidesTemplateMenuItem
							? "!text-[#ff6a1f] hover:!bg-[#fff2ec]  hover:!text-[#ff6a1f]"
							: "text-sidebar-foreground"
					}
				>
					<a
						href={getRoutePath({ name: routeName }) || "#"}
						onClick={(event) => handleNavigateToRoute(routeName, event)}
						className="text-current no-underline"
					>
						{isSlidesTemplateMenuItem ? (
							<div
								ref={slidesTemplateRowRef}
								className="relative flex min-w-0 flex-1 items-center gap-2"
							>
								<Icon className="h-4 w-4 shrink-0" />
								<span
									ref={slidesTemplateTitleRef}
									className={cn(
										"min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5",
										templateCount ? "shrink" : "flex-1",
									)}
								>
									{title}
								</span>
								{templateCount && slidesTemplateCountForMeasure && (
									<>
										{!collapsed && (
											<SlidesTemplateCountBadge
												templateCount={templateCount}
												testId="sidebar-content-slides-templates-count"
												showCount={shouldShowSlidesTemplateCount}
											/>
										)}
										{/* 始终测量完整徽标，不让数值的显示状态反过来影响宽度判断。 */}
										<SlidesTemplateCountBadge
											templateCount={slidesTemplateCountForMeasure}
											badgeRef={slidesTemplateCountMeasureRef}
											className="pointer-events-none invisible absolute left-0 top-0"
										/>
									</>
								)}
							</div>
						) : (
							<>
								<Icon className="h-4 w-4 shrink-0" />
								<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
									{title}
								</span>
							</>
						)}
					</a>
				</SidebarMenuButton>
			</SidebarMenuItem>
		)
	}

	return (
		<div
			className="flex min-h-0 w-full flex-1 touch-pan-y flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
			data-testid="sidebar-content-root"
		>
			<SidebarGroup className="w-full shrink-0 p-2" data-testid="sidebar-content-apps-group">
				<SidebarGroupContent>
					<SidebarMenu>
						<SidebarMenuItem key={RouteName.Super}>
							<SidebarMenuButton
								asChild
								tooltip={collapsed ? t("sidebar:home.title") : undefined}
								data-testid="sidebar-content-home-button"
								className="text-sidebar-foreground"
							>
								<a
									href={superRouteUrl}
									onClick={handleNavigateToSuperHome}
									className="text-current no-underline"
								>
									<Home className="h-4 w-4 shrink-0" />
									<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
										{t("sidebar:home.title")}
									</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
						<SidebarMenuItem>
							<ChatsSubMenu>
								<SidebarMenuButton
									tooltip={collapsed ? t("sidebar:chats.title") : undefined}
									data-testid="sidebar-content-chats-button"
									className="text-sidebar-foreground"
								>
									<MessageCircle className="h-4 w-4 shrink-0" />
									<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
										{t("sidebar:chats.title")}
									</span>
									{!collapsed && (
										<ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground" />
									)}
								</SidebarMenuButton>
							</ChatsSubMenu>
						</SidebarMenuItem>
						{sidebarMarketMenuItems.map(renderSidebarMarketMenuItem)}
						<SidebarMenuItem>
							<AppsSubMenu>
								<SidebarMenuButton
									tooltip={collapsed ? t("appsMenu.apps") : undefined}
									data-testid="sidebar-content-apps-button"
									className="text-sidebar-foreground"
								>
									<LayoutGrid className="h-4 w-4 shrink-0" />
									<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
										{t("appsMenu.apps")}
									</span>
									{!collapsed && (
										<ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground" />
									)}
								</SidebarMenuButton>
							</AppsSubMenu>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup>

			<Divider direction="horizontal" className="mx-auto !w-[calc(100%-16px)] shrink-0" />

			{collapsed ? (
				<CollapsedWorkspaceMenu />
			) : (
				<div className="flex min-h-40 flex-1 flex-col gap-1 overflow-hidden">
					<WorkspaceList />
					<SidebarGroup
						className="w-full flex-1 shrink-0 px-2 py-0"
						data-testid="sidebar-content-share-workspace-group"
					>
						<SidebarGroupContent>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										isActive={isShareWorkspaceActive}
										onClick={() => setShareProjectsPanelOpen(true)}
										data-testid="sidebar-content-share-workspace-button"
										className="text-sidebar-foreground"
									>
										<UsersRound className="ml-6 h-4 w-4 shrink-0" />
										<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
											{t("super:workspace.shareWorkspaceName")}
										</span>
										<ChevronRight className="h-4 w-4 shrink-0 text-sidebar-foreground" />
									</SidebarMenuButton>
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</div>
			)}

			{/* <SidebarGroup className="w-full px-2 py-0">
				<SidebarGroupContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton tooltip={collapsed ? t("agents.aiChat") : undefined}>
								<MessageCircle className="h-4 w-4 shrink-0" />
								<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5 text-sidebar-foreground">
									{t("agents.aiChat")}
								</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroupContent>
			</SidebarGroup> */}

			{shareProjectsPanelOpen && (
				<Suspense fallback={null}>
					<CollaborationProjectsPanel
						open={shareProjectsPanelOpen}
						onClose={() => setShareProjectsPanelOpen(false)}
						onCollaborationProjectClick={(project) =>
							SuperMagicService.switchProjectInDesktop(project)
						}
						workspaces={workspaces}
						selectedWorkspace={selectedWorkspace}
						fetchProjects={(params) => SuperMagicService.project.fetchProjects(params)}
						fetchWorkspaces={(params) =>
							SuperMagicService.workspace.fetchWorkspaces(params)
						}
					/>
				</Suspense>
			)}
		</div>
	)
}

export default observer(SidebarContent)
