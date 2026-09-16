import { AppWindow, Box, Clock3 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import { Button } from "@/components/shadcn-ui/button"
import MagicTooltip from "@/components/base/MagicTooltip"
import { sidebarStore } from "@/stores/layout/SidebarStore"

/** 分类始终保留一个选中项；固定短名称为右侧管理器预留空间，完整名称仍用于无障碍说明。 */
function ProjectNavigationTabs({
	disabled,
	onOpenManager,
}: {
	disabled: boolean
	onOpenManager: () => void
}) {
	const { t } = useTranslation("super")
	const recent = t("projectNavigation.recent")
	const workspaces = t("projectNavigation.workspaces")
	return (
		<div
			className="sticky top-0 z-30 flex h-9 items-center gap-2 bg-sidebar px-2 pb-1"
			data-sidebar-navigation-header="tabs"
		>
			<SidebarMenu
				role="group"
				aria-label={t("sidebarPanels.projectManager")}
				className="min-w-0 flex-1 flex-row gap-0.5 rounded-lg bg-sidebar-foreground/[0.06] p-0.5"
			>
				<SidebarMenuItem className="min-w-0 flex-1">
					<SidebarMenuButton
						aria-label={recent}
						aria-pressed={sidebarStore.recentProjectsExpanded}
						isActive={sidebarStore.recentProjectsExpanded}
						disabled={disabled}
						onClick={() => sidebarStore.selectNavigationSection("recent")}
						className="relative h-7 justify-center gap-1.5 px-2 text-[13px] font-normal text-sidebar-foreground/80 focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1 data-[active=true]:bg-background data-[active=true]:font-normal data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-sm dark:data-[active=true]:bg-sidebar-foreground/[0.13]"
						data-testid="sidebar-recent-projects-toggle"
					>
						<Clock3 size={16} />
						<span>{t("projectNavigation.recentShort")}</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem className="min-w-0 flex-1">
					<SidebarMenuButton
						aria-label={workspaces}
						aria-pressed={sidebarStore.workspacesExpanded}
						isActive={sidebarStore.workspacesExpanded}
						disabled={disabled}
						onClick={() => sidebarStore.selectNavigationSection("workspaces")}
						className="relative h-7 justify-center gap-1.5 px-2 text-[13px] font-normal text-sidebar-foreground/80 focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1 data-[active=true]:bg-background data-[active=true]:font-normal data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-sm dark:data-[active=true]:bg-sidebar-foreground/[0.13]"
						data-testid="sidebar-workspaces-toggle"
					>
						<Box size={16} />
						<span>{t("projectNavigation.workspacesShort")}</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
			<MagicTooltip
				title={t("sidebarPanels.projectManager")}
				placement="top"
				disabled={disabled}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={t("sidebarPanels.projectManager")}
					disabled={disabled}
					onClick={onOpenManager}
					data-testid="sidebar-project-manager"
					className="size-7 shrink-0 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1"
				>
					<AppWindow size={16} />
				</Button>
			</MagicTooltip>
		</div>
	)
}

export default observer(ProjectNavigationTabs)
