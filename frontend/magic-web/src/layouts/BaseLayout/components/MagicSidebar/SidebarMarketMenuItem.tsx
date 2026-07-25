import type { MouseEvent } from "react"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import { RouteName } from "@/routes/constants"
import { getRoutePath } from "@/routes/history/helpers"
import type { SidebarMarketMenuItem as SidebarMarketMenuItemConfig } from "./hooks/useSidebarMarketMenuItems.types"
import { SlidesTemplateSidebarMenuItem } from "./SlidesTemplateSidebarMenuItem"

interface SidebarMarketMenuItemProps {
	item: SidebarMarketMenuItemConfig
	title: string
	collapsed: boolean
	onNavigate: (routeName: RouteName, event: MouseEvent<HTMLAnchorElement>) => void
}

export function SidebarMarketMenuItem({
	item,
	title,
	collapsed,
	onNavigate,
}: SidebarMarketMenuItemProps) {
	const { routeName, testId, Icon } = item
	const href = getRoutePath({ name: routeName }) || "#"
	const handleClick = (event: MouseEvent<HTMLAnchorElement>) => onNavigate(routeName, event)

	if (routeName === RouteName.SuperSlidesTemplates) {
		return (
			<SlidesTemplateSidebarMenuItem
				title={title}
				testId={testId}
				Icon={Icon}
				href={href}
				collapsed={collapsed}
				onClick={handleClick}
			/>
		)
	}

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				tooltip={collapsed ? title : undefined}
				data-testid={testId}
				className="text-sidebar-foreground"
			>
				<a href={href} onClick={handleClick} className="text-current no-underline">
					<Icon className="h-4 w-4 shrink-0" />
					<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5">
						{title}
					</span>
				</a>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
