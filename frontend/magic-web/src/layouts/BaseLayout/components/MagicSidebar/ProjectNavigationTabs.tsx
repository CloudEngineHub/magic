import { useLayoutEffect, useRef, useState } from "react"
import { Box, Clock3 } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import { sidebarStore } from "@/stores/layout/SidebarStore"

/** 分类仍可全部收起；只缩短放不下的名称，不改变栏目状态或侧栏字号。 */
function ProjectNavigationTabs({ disabled }: { disabled: boolean }) {
	const { t } = useTranslation("super")
	const rootRef = useRef<HTMLDivElement>(null)
	const [compact, setCompact] = useState(false)
	const recent = t("projectNavigation.recent")
	const workspaces = t("projectNavigation.workspaces")
	useLayoutEffect(() => {
		const root = rootRef.current
		if (!root) return
		const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"))
		const labels = Array.from(root.querySelectorAll<HTMLElement>("[data-full-label]"))
		const measure = () => {
			if (!root.clientWidth) return
			setCompact(
				buttons.some((button, index) => {
					const style = getComputedStyle(button)
					const icon = button.querySelector("svg")
					const required =
						labels[index].offsetWidth +
						(icon?.getBoundingClientRect().width ?? 0) +
						parseFloat(style.columnGap) +
						parseFloat(style.paddingLeft) +
						parseFloat(style.paddingRight)
					return required > button.clientWidth
				}),
			)
		}
		measure()
		const observer = new ResizeObserver(measure)
		buttons.forEach((button) => observer.observe(button))
		labels.forEach((label) => observer.observe(label))
		return () => observer.disconnect()
	}, [recent, workspaces])
	return (
		<div ref={rootRef} data-sidebar-navigation-header>
			<SidebarMenu
				role="group"
				aria-label={t("sidebarPanels.projectManager")}
				className="flex-row gap-1"
			>
				<SidebarMenuItem className="min-w-0 flex-1">
					<SidebarMenuButton
						aria-label={recent}
						aria-pressed={sidebarStore.recentProjectsExpanded}
						isActive={sidebarStore.recentProjectsExpanded}
						tooltip={{ children: recent, hidden: !compact, side: "top" }}
						disabled={disabled}
						onClick={() => sidebarStore.toggleNavigationSection("recent")}
						className="relative h-8 justify-center text-sm font-normal focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-0 data-[active=true]:font-normal"
						data-testid="sidebar-recent-projects-toggle"
					>
						<Clock3 size={16} />
						<span>{compact ? t("projectNavigation.recentShort") : recent}</span>
						<span
							data-full-label
							aria-hidden
							className="pointer-events-none invisible absolute w-max whitespace-nowrap"
						>
							{recent}
						</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
				<SidebarMenuItem className="min-w-0 flex-1">
					<SidebarMenuButton
						aria-label={workspaces}
						aria-pressed={sidebarStore.workspacesExpanded}
						isActive={sidebarStore.workspacesExpanded}
						tooltip={{ children: workspaces, hidden: !compact, side: "top" }}
						disabled={disabled}
						onClick={() => sidebarStore.toggleNavigationSection("workspaces")}
						className="relative h-8 justify-center text-sm font-normal focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:ring-0 data-[active=true]:font-normal"
						data-testid="sidebar-workspaces-toggle"
					>
						<Box size={16} />
						<span>{compact ? t("projectNavigation.workspacesShort") : workspaces}</span>
						<span
							data-full-label
							aria-hidden
							className="pointer-events-none invisible absolute w-max whitespace-nowrap"
						>
							{workspaces}
						</span>
					</SidebarMenuButton>
				</SidebarMenuItem>
			</SidebarMenu>
		</div>
	)
}

export default observer(ProjectNavigationTabs)
