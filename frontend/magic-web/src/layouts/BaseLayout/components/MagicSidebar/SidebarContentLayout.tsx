import type { ReactNode } from "react"
import { SidebarMenu } from "@/components/shadcn-ui/sidebar"

/** 首页位于滚动区域之外，应用和项目共享下方的导航视口。 */
function SidebarContentLayout({ home, children }: { home: ReactNode; children: ReactNode }) {
	return (
		<>
			<div className="flex shrink-0 items-center px-2 pt-2">
				<SidebarMenu className="min-w-0 flex-1">{home}</SidebarMenu>
			</div>
			{children}
		</>
	)
}

export default SidebarContentLayout
