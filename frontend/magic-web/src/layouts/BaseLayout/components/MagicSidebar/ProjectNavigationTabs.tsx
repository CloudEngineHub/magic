import { AppWindow } from "lucide-react"
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
			className="sticky top-0 z-30 flex h-8 items-center gap-2 bg-sidebar px-2"
			data-sidebar-navigation-header="tabs"
		>
			<SidebarMenu
				role="group"
				aria-label={t("sidebarPanels.projectManager")}
				className="min-w-0 flex-1 flex-row gap-1"
			>
				<SidebarMenuItem className="min-w-0 flex-1">
					<SidebarMenuButton
						aria-label={recent}
						aria-pressed={sidebarStore.recentProjectsExpanded}
						isActive={sidebarStore.recentProjectsExpanded}
						disabled={disabled}
						onClick={() => sidebarStore.selectNavigationSection("recent")}
						className="relative h-7 justify-center px-2 text-[13px] font-normal text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1 data-[active=true]:bg-sidebar-accent data-[active=true]:font-normal data-[active=true]:text-sidebar-accent-foreground"
						data-testid="sidebar-recent-projects-toggle"
					>
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
						className="relative h-7 justify-center px-2 text-[13px] font-normal text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1 data-[active=true]:bg-sidebar-accent data-[active=true]:font-normal data-[active=true]:text-sidebar-accent-foreground"
						data-testid="sidebar-workspaces-toggle"
					>
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
					className="size-6 shrink-0 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1"
				>
					<AppWindow size={16} strokeWidth={1.5} />
				</Button>
			</MagicTooltip>
		</div>
	)
}

export default observer(ProjectNavigationTabs)
