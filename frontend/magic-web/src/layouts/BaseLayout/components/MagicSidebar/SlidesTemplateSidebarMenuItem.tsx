import type { MouseEventHandler } from "react"
import type { LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import { useSlidesTemplateStatistics } from "@/pages/superMagic/hooks/useSlidesTemplateTotal"
import { formatNumber } from "@/utils/format"
import { cn } from "@/lib/utils"
import {
	isValidTemplateCountTodayGrowth,
	SlidesTemplateCountBadge,
} from "./SlidesTemplateCountBadge"

interface SlidesTemplateSidebarMenuItemProps {
	title: string
	testId: string
	Icon: LucideIcon
	href: string
	collapsed: boolean
	onClick: MouseEventHandler<HTMLAnchorElement>
}

export function SlidesTemplateSidebarMenuItem({
	title,
	testId,
	Icon,
	href,
	collapsed,
	onClick,
}: SlidesTemplateSidebarMenuItemProps) {
	const { t } = useTranslation("sidebar")
	const statistics = useSlidesTemplateStatistics()
	const templateTotal = statistics?.templateTotal
	const templateCountTodayGrowth = statistics?.templateCountTodayGrowth
	const hasTodayGrowth = isValidTemplateCountTodayGrowth(templateCountTodayGrowth)

	const tooltipText = collapsed
		? templateTotal !== undefined
			? hasTodayGrowth
				? t("slidesTemplates.statisticsTooltip", {
						title,
						todayAdded: formatNumber(templateCountTodayGrowth),
						total: formatNumber(templateTotal),
					})
				: t("slidesTemplates.statisticsTooltipWithoutToday", {
						title,
						total: formatNumber(templateTotal),
					})
			: title
		: undefined
	const tooltip = tooltipText
		? {
				children: (
					<div className="text-sm" data-testid="sidebar-content-slides-templates-tooltip">
						{tooltipText}
					</div>
				),
			}
		: undefined

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				tooltip={tooltip}
				data-testid={testId}
				className={
					collapsed
						? "!text-[#ff6a1f] hover:!bg-[#fff2ec] hover:!text-[#ff6a1f]"
						: "text-sidebar-foreground"
				}
			>
				<a href={href} onClick={onClick} className="text-current no-underline">
					<div
						data-slides-template-row
						className="relative flex min-w-0 flex-1 items-center gap-2"
					>
						<Icon data-slides-template-icon className="h-4 w-4 shrink-0" />
						<span
							data-slides-template-label
							className={cn(
								"min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5",
								templateTotal !== undefined ? "shrink" : "flex-1",
							)}
						>
							{title}
						</span>
						{!collapsed && templateTotal !== undefined ? (
							<SlidesTemplateCountBadge
								count={templateTotal}
								todayAdded={templateCountTodayGrowth}
								testId="sidebar-content-slides-templates-count"
							/>
						) : null}
					</div>
				</a>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
