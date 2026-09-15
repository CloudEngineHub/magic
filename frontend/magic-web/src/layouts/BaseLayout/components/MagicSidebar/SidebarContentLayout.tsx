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
import { Button } from "@/components/shadcn-ui/button"
import { SidebarMenu } from "@/components/shadcn-ui/sidebar"
import MagicTooltip from "@/components/base/MagicTooltip"
import { ChevronDown } from "lucide-react"
import { cn } from "@/utils/cn"
import { useSidebarSectionSizes } from "./hooks/useSidebarSectionSizes"

/** 应用入口保留完整顺序；高度不足时独立滚动，将剩余高度交给项目导航。 */
function SidebarContentLayout({
	apps,
	children,
	collapsed,
	home,
	busy = false,
	onDraggingChange,
}: {
	apps: ReactNode
	children: ReactNode
	collapsed: boolean
	home: ReactNode
	busy?: boolean
	onDraggingChange?: (dragging: boolean) => void
}) {
	const { t } = useTranslation("super")
	const rootRef = useRef<HTMLDivElement>(null)
	const appsRef = useRef<HTMLDivElement>(null)
	const dividerRef = useRef<HTMLDivElement>(null)
	const panelRef = useRef<ImperativePanelHandle>(null)
	const homeRef = useRef<HTMLDivElement>(null)
	const projectsRef = useRef<HTMLDivElement>(null)
	const draggingRef = useRef(false)
	const dragStartHeight = useRef(0)
	const [expanded, setExpanded] = useState(false)
	const [unmeasuredChoice, setUnmeasuredChoice] = useState<boolean | null>(null)
	const size = useSidebarSectionSizes({
		rootRef,
		appsRef,
		projectsRef,
		dividerRef,
		homeRef,
		collapsed,
		busy,
		section: sidebarStore.expandedNavigationSection,
	})
	const savedHeight = sidebarStore.secondaryAppsHeight
	useLayoutEffect(() => {
		if (!size || collapsed) return
		if (unmeasuredChoice !== null) {
			// 首次尺寸未就绪时也接收手动选择；获得有效尺寸后再保存，自动分配不能撤销这次操作。
			sidebarStore.setSecondaryAppsHeight(
				unmeasuredChoice ? (sidebarStore.lastExpandedAppsHeight ?? size.apps) : 0,
			)
			setUnmeasuredChoice(null)
		} else sidebarStore.initializeSecondaryAppsHeight(size.home)
	}, [size, collapsed, unmeasuredChoice])
	// 下区预留栏目标题、管理器入口和可用项目行；小窗口按实际空间降低边界。
	const available = size?.available ?? 1
	const maximum = size
		? Math.max(0, Math.min(size.apps, available - size.minimumProjects))
		: available
	const automatic = size ? Math.max(0, Math.min(size.apps, available - size.projects)) : 0
	const minimum = size ? Math.min(maximum, size.minimumApp) : 0
	// 自动布局优先项目；手动展开／拖动只受真实可用空间约束，不被后续分页重新关回去。
	const preferred = collapsed
		? (size?.apps ?? 0)
		: (savedHeight ??
			(size?.projectsPending || automatic < (size?.minimumApp ?? 0) ? 0 : automatic))
	const height = Math.max(0, Math.min(maximum, preferred))
	useLayoutEffect(() => {
		if (size && !busy && !draggingRef.current)
			panelRef.current?.resize((height / available) * 100)
	}, [height, available, size, busy])
	const persist = () => {
		const percent = panelRef.current?.getSize()
		if (!collapsed && percent !== undefined && size) {
			if (percent === 0) sidebarStore.collapseSecondaryApps(dragStartHeight.current)
			else sidebarStore.setSecondaryAppsHeight((percent / 100) * available)
		}
	}
	const toggleApps = () => {
		if (!size) {
			setUnmeasuredChoice((open) => !open)
			return
		}
		if (expanded)
			sidebarStore.collapseSecondaryApps(
				((panelRef.current?.getSize() ?? 0) / 100) * available,
			)
		else sidebarStore.setSecondaryAppsHeight(sidebarStore.lastExpandedAppsHeight ?? size.apps)
	}
	const appsExpanded = size ? expanded : unmeasuredChoice === true
	const toggleLabel = appsExpanded
		? t("projectNavigation.collapseApps")
		: t("projectNavigation.expandApps")
	return (
		<>
			<div ref={homeRef} className="flex shrink-0 items-center gap-1 px-2 pb-1 pt-2">
				<SidebarMenu className="min-w-0 flex-1">{home}</SidebarMenu>
				{!collapsed && (
					<MagicTooltip title={toggleLabel} disabled={busy}>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="size-7 shrink-0 text-muted-foreground"
							aria-label={toggleLabel}
							aria-expanded={appsExpanded}
							onClick={toggleApps}
							disabled={busy}
						>
							<ChevronDown className={cn("size-4", appsExpanded && "rotate-180")} />
						</Button>
					</MagicTooltip>
				)}
			</div>
			<div ref={rootRef} className="min-h-0 flex-1" data-testid="sidebar-content-root">
				<ResizablePanelGroup direction="vertical">
					<ResizablePanel
						ref={panelRef}
						order={1}
						collapsible
						collapsedSize={0}
						minSize={(minimum / available) * 100}
						maxSize={(maximum / available) * 100}
						defaultSize={0}
						onResize={(percent) => setExpanded(percent > 0)}
						style={
							!size
								? { flex: "0 1 auto", height: unmeasuredChoice ? "auto" : 0 }
								: undefined
						}
					>
						{/* 展开与收起均按真实溢出提示；箭头独占边缘区域，避免覆盖菜单操作。 */}
						<ScrollArea
							className={cn("h-full overflow-hidden", !appsExpanded && "invisible")}
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
						disabled={collapsed || busy}
						aria-label={t("projectNavigation.resizeSections")}
						className="group/resize shrink-0 bg-transparent outline-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[panel-group-direction=vertical]:h-3 [&[data-panel-group-direction=vertical]>div]:rotate-0"
						onDragging={(dragging) => {
							if (dragging)
								dragStartHeight.current =
									((panelRef.current?.getSize() ?? 0) / 100) * available
							draggingRef.current = dragging
							onDraggingChange?.(dragging)
							if (!dragging) persist()
						}}
						onKeyUp={persist}
						onKeyDownCapture={() => {
							dragStartHeight.current =
								((panelRef.current?.getSize() ?? 0) / 100) * available
						}}
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
						<div ref={projectsRef} className="h-full min-h-0">
							{children}
						</div>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>
		</>
	)
}

export default observer(SidebarContentLayout)
