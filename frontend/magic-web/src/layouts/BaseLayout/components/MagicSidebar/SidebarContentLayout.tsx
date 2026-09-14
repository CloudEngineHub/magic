import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import {
	ResizableHandle,
	ResizeGrip,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/shadcn-ui/resizable"
import { sidebarStore } from "@/stores/layout/SidebarStore"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"

/** 应用入口保留完整顺序；高度不足时独立滚动，将剩余高度交给项目导航。 */
function SidebarContentLayout({
	apps,
	children,
	collapsed,
}: {
	apps: ReactNode
	children: ReactNode
	collapsed: boolean
}) {
	const { t } = useTranslation("super")
	const rootRef = useRef<HTMLDivElement>(null)
	const appsRef = useRef<HTMLDivElement>(null)
	const dividerRef = useRef<HTMLDivElement>(null)
	const panelRef = useRef<ImperativePanelHandle>(null)
	const [size, setSize] = useState({ available: 0, content: 0, divider: 0 })
	const savedHeight = sidebarStore.navigationAppsHeight
	useLayoutEffect(() => {
		const root = rootRef.current
		const apps = appsRef.current
		if (!root || !apps) return
		const measure = () =>
			setSize({
				available: root.clientHeight,
				content: apps.getBoundingClientRect().height,
				divider: dividerRef.current?.offsetHeight ?? 0,
			})
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(root)
		observer.observe(apps)
		if (dividerRef.current) observer.observe(dividerRef.current)
		return () => observer.disconnect()
	}, [])
	// 下区预留栏目标题、管理器入口和可用项目行；小窗口按实际空间降低边界。
	const available = Math.max(1, size.available - size.divider)
	const minimum = Math.min(68, available * 0.25)
	const maximum = Math.max(minimum, Math.min(size.content || minimum, available - 160))
	const preferred = collapsed
		? size.content
		: (savedHeight ?? Math.min(size.content, available * 0.32))
	const height = Math.max(minimum, Math.min(maximum, preferred))
	useLayoutEffect(() => {
		if (size.available) panelRef.current?.resize((height / available) * 100)
	}, [height, available, size.available])
	const persist = () => {
		const percent = panelRef.current?.getSize()
		if (!collapsed && percent !== undefined && size.available)
			sidebarStore.setNavigationAppsHeight((percent / 100) * available)
	}
	return (
		<div ref={rootRef} className="min-h-0 flex-1" data-testid="sidebar-content-root">
			<ResizablePanelGroup direction="vertical">
				<ResizablePanel
					ref={panelRef}
					order={1}
					minSize={(minimum / available) * 100}
					maxSize={(maximum / available) * 100}
					defaultSize={32}
				>
					{/* 展开与收起均按真实溢出提示；箭头独占边缘区域，避免覆盖菜单操作。 */}
					<ScrollArea
						className="h-full overflow-hidden"
						viewportClassName="overscroll-contain [&>div]:!block"
						hideScrollbar
						scrollHints={{
							variant: "both",
							upLabel: t("projectNavigation.scrollUp"),
							downLabel: t("projectNavigation.scrollDown"),
						}}
					>
						<div ref={appsRef} className="flow-root">
							{apps}
						</div>
					</ScrollArea>
				</ResizablePanel>
				<ResizableHandle
					disabled={collapsed}
					aria-label={t("projectNavigation.resizeSections")}
					className="group/resize shrink-0 bg-transparent outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[panel-group-direction=vertical]:h-3 [&[data-panel-group-direction=vertical]>div]:rotate-0"
					onDragging={(dragging) => {
						if (!dragging) persist()
					}}
					onKeyUp={persist}
				>
					<div
						ref={dividerRef}
						className="pointer-events-none flex h-3 w-full items-center gap-2 px-2"
					>
						<span className="h-px flex-1 bg-sidebar-border/40" />
						{!collapsed && <ResizeGrip orientation="horizontal" />}
						<span className="h-px flex-1 bg-sidebar-border/40" />
					</div>
				</ResizableHandle>
				<ResizablePanel order={2} minSize={100 - (maximum / available) * 100}>
					{children}
				</ResizablePanel>
			</ResizablePanelGroup>
		</div>
	)
}

export default observer(SidebarContentLayout)
