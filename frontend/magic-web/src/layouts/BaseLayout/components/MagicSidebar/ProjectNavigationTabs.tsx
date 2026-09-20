import { AppWindow, Box, Clock3, MessageCircle } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { SmoothTabs, type Tab } from "@/components/shadcn-ui/smooth-tabs"
import MagicTooltip from "@/components/base/MagicTooltip"
import { sidebarStore } from "@/stores/layout/SidebarStore"

type NavigationSection = "recent" | "workspaces" | "chats"

/** 分类始终保留一个选中项；固定短名称为右侧管理器预留空间，完整名称仍用于无障碍说明。 */
function ProjectNavigationTabs({
	disabled,
	onOpenManager,
}: {
	disabled: boolean
	onOpenManager: () => void
}) {
	const { t } = useTranslation(["super", "sidebar"])
	const recent = t("projectNavigation.recent")
	const workspaces = t("projectNavigation.workspaces")
	const chats = t("sidebar:chats.title")
	const tabs: Tab<NavigationSection>[] = [
		{
			value: "recent",
			label: t("projectNavigation.recentShort"),
			icon: <Clock3 size={16} />,
			tooltip: recent,
			testId: "sidebar-recent-projects-toggle",
		},
		{
			value: "workspaces",
			label: t("projectNavigation.workspacesShort"),
			icon: <Box size={16} />,
			tooltip: workspaces,
			testId: "sidebar-workspaces-toggle",
		},
		{
			value: "chats",
			label: chats,
			icon: <MessageCircle size={16} />,
			testId: "sidebar-chats-toggle",
		},
	]
	return (
		<div
			className="sticky top-0 z-20 flex items-center gap-2 bg-sidebar px-2"
			data-sidebar-navigation-header="tabs"
		>
			{/* Native fieldset disabling preserves the existing busy-state behavior for all tab buttons. */}
			<fieldset
				disabled={disabled}
				role="group"
				aria-label={t("sidebarPanels.projectManager")}
				className="m-0 min-w-0 flex-1 border-0 p-0 [container-name:project-navigation-tabs] [container-type:inline-size]"
			>
				{/* Keep all three labels readable at the default width; narrow tabs omit decorative icons. */}
				<div className="w-full min-w-0">
					<SmoothTabs
						tabs={tabs}
						value={sidebarStore.expandedNavigationSection}
						onChange={sidebarStore.selectNavigationSection}
						variant="background"
						className="h-auto w-full bg-muted p-[3px] [@container_project-navigation-tabs_(max-width:240px)]:[&>button>span:has(svg)]:hidden"
						buttonClassName="h-[28px] min-w-0 px-1 py-0 text-[13px] font-normal focus-visible:bg-sidebar-accent focus-visible:ring-1"
						indicatorClassName="inset-y-[3px] h-[28px]"
						data-testid="sidebar-navigation-tabs"
					/>
				</div>
			</fieldset>
			<div className="shrink-0">
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
						className="!size-[34px] !rounded-[10px] !bg-muted text-sidebar-foreground/80 hover:!bg-muted hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-1"
					>
						<AppWindow size={16} />
					</Button>
				</MagicTooltip>
			</div>
		</div>
	)
}

export default observer(ProjectNavigationTabs)
