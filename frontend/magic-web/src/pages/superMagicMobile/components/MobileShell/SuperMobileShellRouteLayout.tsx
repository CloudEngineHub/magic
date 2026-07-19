import type { ReactNode } from "react"
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"

import SuperMagicService from "@/pages/superMagic/services"
import { MobileSettingsPanel } from "@/layouts/BaseLayoutMobile/components/MobileSettings"
import { useMobileDocumentThemeControl } from "@/pages/superMagicMobile/components/MobileDocumentTheme"
import { MobileSettingsProvider } from "@/pages/superMagicMobile/components/MobileShell/MobileSettingsContext"
import { useSuperMobileShellNavigation } from "@/pages/superMagicMobile/components/MobileShell/hooks/useSuperMobileShellNavigation"

import { MobileShellAppLayout } from "./MobileShellAppLayout"
import MobileShellSidebar from "./MobileShellSidebar"
import type { MobileShellMenuRecentItem } from "./MobileShellMenuContext"
import { useRecentProjectsForMenu } from "./useRecentProjectsForMenu"

export interface SuperMobileShellOutletContext {
	isSidebarOpen: boolean
	openSidebar: () => void
	closeSidebar: () => void
}

const SuperMobileShellOutletContext = createContext<SuperMobileShellOutletContext | null>(null)

/**
 * 部分移动端页面在过渡态或独立渲染场景下会先于父级 Shell 挂载；这里提供非抛错探针，
 * 由页面自行决定是否补一层壳，而保留 useSuperMobileShellOutlet 的严格约束用于常规消费方。
 */
export function useOptionalSuperMobileShellOutlet(): SuperMobileShellOutletContext | null {
	return useContext(SuperMobileShellOutletContext)
}

export function useSuperMobileShellOutlet(): SuperMobileShellOutletContext {
	const ctx = useOptionalSuperMobileShellOutlet()
	if (!ctx) {
		throw new Error("useSuperMobileShellOutlet must be used under SuperMobileShellRouteLayout")
	}
	return ctx
}

export interface SuperMobileShellRouteLayoutProps {
	/** 侧栏主导航当前高亮项，与 `MobileShellMenuContext` 的 `activeView` 一致 */
	activeView: string
	/** 默认使用共享 `MobileShellSidebar`；只有特殊实验页才需要覆盖。 */
	sidebar?: ReactNode
	closeSidebarAriaLabel: string
	testIdPrefix?: string
	/** 主面板区：直接传入页面根节点，或 `<Outlet />` */
	children: ReactNode
}

/**
 * Super 移动端全屏壳：主导航跳转、侧栏开关、`MobileShellAppLayout` 只挂载一次。
 * `children` 为面板内容；侧栏菜单按钮通过 `useSuperMobileShellOutlet().openSidebar` 打开抽屉。
 */
export const SuperMobileShellRouteLayout = observer(function SuperMobileShellRouteLayout(
	props: SuperMobileShellRouteLayoutProps,
) {
	const {
		activeView,
		sidebar,
		closeSidebarAriaLabel,
		testIdPrefix = "mobile-super-shell",
		children,
	} = props

	const [isSidebarOpen, setIsSidebarOpen] = useState(false)
	const [isSettingsOpen, setIsSettingsOpen] = useState(false)
	const pendingNavigationFrameRef = useRef<number[]>([])
	const { recentItems, reloadRecentItems, loadMoreRecentItems, hasMore } =
		useRecentProjectsForMenu()
	const { setSidebarOpen: setDocumentThemeSidebarOpen } = useMobileDocumentThemeControl()

	useEffect(() => {
		setDocumentThemeSidebarOpen(isSidebarOpen)
		return () => setDocumentThemeSidebarOpen(false)
	}, [isSidebarOpen, setDocumentThemeSidebarOpen])

	useEffect(() => {
		return () => {
			pendingNavigationFrameRef.current.forEach((frameId) => cancelAnimationFrame(frameId))
			pendingNavigationFrameRef.current = []
		}
	}, [])

	const shellOutletContext = useMemo<SuperMobileShellOutletContext>(
		() => ({
			isSidebarOpen,
			openSidebar: () => setIsSidebarOpen(true),
			closeSidebar: () => setIsSidebarOpen(false),
		}),
		[isSidebarOpen],
	)

	const runAfterSidebarCloseFrame = useCallback((action: () => void) => {
		pendingNavigationFrameRef.current.forEach((frameId) => cancelAnimationFrame(frameId))
		pendingNavigationFrameRef.current = []

		// Let the closed transform commit and paint before route rendering starts; otherwise React may batch both updates and skip the visible close transition.
		const firstFrameId = requestAnimationFrame(() => {
			const secondFrameId = requestAnimationFrame(() => {
				pendingNavigationFrameRef.current = []
				action()
			})
			pendingNavigationFrameRef.current = [secondFrameId]
		})

		pendingNavigationFrameRef.current = [firstFrameId]
	}, [])

	const navigationValue = useSuperMobileShellNavigation({
		activeView,
		isSidebarOpen,
		setIsSidebarOpen,
		runAfterSidebarCloseFrame,
	})

	/**
	 * 最近项目点击按项目类型分流：
	 * - 对话（isChatProject）→ switchChatProject，进入对话页面
	 * - 普通项目 → switchProjectInMobile，进入项目详情页
	 */
	const handleRecentNavigate = useCallback((item: MobileShellMenuRecentItem) => {
		if (!item.project) {
			setIsSidebarOpen(false)
			return
		}

		setIsSidebarOpen(false)

		if (item.isChatProject) {
			void SuperMagicService.switchChatProject(item.project)
		} else {
			void SuperMagicService.switchProjectInMobile(item.project)
		}
	}, [])

	const menuValue = useMemo(
		() => ({
			activeView,
			navItems: navigationValue.navItems,
			recentItems,
			onNavigate: navigationValue.onNavigate,
			onGoHome: navigationValue.onGoHome,
			onRecentNavigate: handleRecentNavigate,
			reloadRecentItems,
			hasMore,
			loadMoreRecentItems,
		}),
		[
			activeView,
			handleRecentNavigate,
			hasMore,
			loadMoreRecentItems,
			navigationValue.navItems,
			navigationValue.onGoHome,
			navigationValue.onNavigate,
			recentItems,
			reloadRecentItems,
		],
	)
	/** 统一默认侧栏，避免业务页重复实现与维护一整份侧栏 JSX。 */
	const resolvedSidebar = useMemo(
		() => sidebar ?? <MobileShellSidebar testIdPrefix={testIdPrefix} />,
		[sidebar, testIdPrefix],
	)
	const mobileSettingsValue = useMemo(
		() => ({
			isSettingsOpen,
			openSettings: () => setIsSettingsOpen(true),
			closeSettings: () => setIsSettingsOpen(false),
			setSettingsOpen: (open: boolean) => setIsSettingsOpen(open),
		}),
		[isSettingsOpen],
	)

	return (
		<SuperMobileShellOutletContext.Provider value={shellOutletContext}>
			<MobileSettingsProvider value={mobileSettingsValue}>
				<MobileShellAppLayout
					testIdPrefix={testIdPrefix}
					closeSidebarAriaLabel={closeSidebarAriaLabel}
					isSidebarOpen={isSidebarOpen}
					onOpenSidebar={() => setIsSidebarOpen(true)}
					onCloseSidebar={() => setIsSidebarOpen(false)}
					menuValue={menuValue}
					sidebar={resolvedSidebar}
					panel={children}
				/>
				{/* 设置浮层与侧栏同层挂载，共享同一份局部开关状态，避免上下文跨布局丢失。 */}
				<MobileSettingsPanel open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
			</MobileSettingsProvider>
		</SuperMobileShellOutletContext.Provider>
	)
})
