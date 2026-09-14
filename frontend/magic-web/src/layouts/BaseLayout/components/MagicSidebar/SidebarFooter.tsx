import { cn } from "@/utils/cn"
import type { SidebarFooterProps } from "./types"
import { ActionButtons, UserInfoCard } from "./components"

function SidebarFooter({ collapsed }: SidebarFooterProps) {
	return (
		<div
			data-testid="sidebar-footer-root"
			className={cn(
				"flex w-full shrink-0 flex-col p-2",
				collapsed ? "items-center" : "items-start",
			)}
		>
			<ActionButtons collapsed={collapsed} />
			<div role="separator" className="my-1 w-full border-t border-sidebar-border/60" />
			<UserInfoCard collapsed={collapsed} />
		</div>
	)
}

export default SidebarFooter
