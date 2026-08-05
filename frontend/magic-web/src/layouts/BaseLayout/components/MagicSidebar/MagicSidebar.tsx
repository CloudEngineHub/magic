import { useState } from "react"
import { observer } from "mobx-react-lite"
import { sidebarStore } from "@/stores/layout"
import { cn } from "@/lib/utils"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/shadcn-ui/sheet"
import {
	SidebarProvider,
	SidebarHeader as ShadcnSidebarHeader,
	SidebarContent as ShadcnSidebarContent,
	SidebarFooter as ShadcnSidebarFooter,
} from "@/components/shadcn-ui/sidebar"
import MagicSidebarHeader from "./SidebarHeader"
import MagicSidebarContent from "./SidebarContent"
import MagicSidebarFooter from "./SidebarFooter"
import Divider from "@/components/other/Divider"

const MagicSidebar = observer(() => {
	const { collapsed, toggleCollapsed, setCollapsed } = sidebarStore
	const [workspaceDrawerOpen, setWorkspaceDrawerOpen] = useState(false)
	const shouldUseWorkspaceDrawer =
		collapsed && sidebarStore.windowWidth <= sidebarStore.AUTO_COLLAPSE_MIN_VIEWPORT_WIDTH_PX
	const shouldRenderMainSidebarContent = !shouldUseWorkspaceDrawer || !workspaceDrawerOpen

	function handleToggleCollapse() {
		if (shouldUseWorkspaceDrawer) {
			setWorkspaceDrawerOpen(true)
			return
		}

		toggleCollapsed()
	}

	return (
		<SidebarProvider
			open={!collapsed}
			onOpenChange={(open) => setCollapsed(!open)}
			className="h-full min-h-0"
			data-testid="sidebar-provider"
		>
			<div
				className={cn("group/sidebar relative flex h-full w-full flex-col bg-sidebar")}
				data-state={collapsed ? "collapsed" : "expanded"}
				data-collapsible={collapsed ? "icon" : ""}
				data-testid="sidebar"
			>
				<ShadcnSidebarHeader className="shrink-0 p-0" data-testid="sidebar-header">
					<MagicSidebarHeader
						collapsed={collapsed}
						onToggleCollapse={handleToggleCollapse}
					/>
				</ShadcnSidebarHeader>
				<ShadcnSidebarContent
					className="min-h-0 flex-1 gap-0 overflow-hidden p-0 pb-1"
					data-testid="sidebar-content"
				>
					{/* When the narrow-screen drawer is open, its expanded content replaces this
					 * covered rail content so polling, workspace paging, and DOM refs have one owner. */}
					{shouldRenderMainSidebarContent && (
						<MagicSidebarContent collapsed={collapsed} />
					)}
				</ShadcnSidebarContent>
				<Divider direction="horizontal" className="mx-auto !w-[calc(100%-16px)]" />
				<ShadcnSidebarFooter className="shrink-0 p-0" data-testid="sidebar-footer">
					<MagicSidebarFooter collapsed={collapsed} />
				</ShadcnSidebarFooter>
			</div>

			<Sheet open={workspaceDrawerOpen} onOpenChange={setWorkspaceDrawerOpen}>
				<SheetContent
					side="left"
					showClose={false}
					// The transparent dismiss layer must sit below body-portalled sidebar
					// submenus (`z-popup` = 1000), otherwise their items cannot be clicked.
					overlayClassName="!z-[999] bg-transparent"
					className="!inset-y-0 !left-0 !h-full !w-[min(320px,100vw)] !max-w-none !gap-0 border-r"
					data-testid="sidebar-workspace-drawer"
				>
					<SheetTitle className="sr-only">全局侧栏</SheetTitle>
					<SheetDescription className="sr-only">
						低分辨率桌面下的全局导航、工作空间和项目列表
					</SheetDescription>
					<div className="flex h-full min-h-0 flex-col bg-sidebar">
						<MagicSidebarHeader
							collapsed={false}
							onToggleCollapse={() => setWorkspaceDrawerOpen(false)}
						/>
						<div className="flex min-h-0 flex-1">
							<MagicSidebarContent collapsed={false} />
						</div>
						<Divider direction="horizontal" className="mx-auto !w-[calc(100%-16px)]" />
						<MagicSidebarFooter collapsed={false} />
					</div>
				</SheetContent>
			</Sheet>
		</SidebarProvider>
	)
})

export default MagicSidebar
