import { memo, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import useFullscreenMode from "@/hooks/useFullscreenMode"
import Render from "../../../Render"
import PlaybackTabContent, { type PlaybackTabContentProps } from "./PlaybackTabContent"
import KnowledgeBaseTabContent from "./KnowledgeBaseTabContent"
import WebsiteIframeTabContent from "./WebsiteIframeTabContent"
import { getWebsiteTabData } from "../utils/websiteTabs"
import type { TabItem } from "../types"
import type { KnowledgeBaseTabData } from "../hooks/useKnowledgeBaseTab"
import { getFileViewerTabType } from "../utils/tabType"
import {
	FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_TAB_CONTENT_CLASS_NAME,
	FILE_VIEWER_FULLSCREEN_BROWSER_TAB_CONTENT_CLASS_NAME,
	FILE_VIEWER_FULLSCREEN_TAB_CONTENT_CLASS_NAME,
	shouldUseFileViewerFullscreenSafeArea,
} from "../utils/fullscreenSafeArea"

type CachedTab = Partial<TabItem> & {
	id: string
	refreshKey?: string
	[key: string]: unknown
}

interface TabCacheProps {
	tab: CachedTab
	isActive: boolean
	renderProps: Record<string, unknown>
	onActiveFileChange?: (fileId: string | null) => void
	isFullscreen?: boolean
	/** Allows the active pure-share tab to contribute height to the document. */
	documentFlowFullscreen?: boolean
	openFileTab?: (fileId: string, autoEdit?: boolean) => void
	playbackProps?: PlaybackTabContentProps
	/** When true, content fills the viewer without reserving tab bar height */
	hideTabBar?: boolean
	knowledgeBaseData?: KnowledgeBaseTabData
	/** The tab is rendered inside a stable surface that already owns its geometry. */
	fillPortalSurface?: boolean
}

/**
 * TabCache - 单个 Tab 的缓存组件
 * 通过 CSS 控制显隐，保持组件实例挂载状态
 */
const TabCache = memo(
	({
		tab,
		isActive,
		renderProps,
		onActiveFileChange,
		isFullscreen,
		documentFlowFullscreen = false,
		openFileTab,
		playbackProps,
		hideTabBar = false,
		knowledgeBaseData,
		fillPortalSurface = false,
	}: TabCacheProps) => {
		const tabType = getFileViewerTabType(tab)
		const isPlaybackTab = tabType === "playback"
		const isWebsite = tabType === "website"
		const isKnowledgeBaseTab = tabType === "knowledge_base"
		const tabContentRef = useRef<HTMLDivElement>(null)
		const isFullscreenMode = useFullscreenMode()

		// 使用 useMemo 缓存渲染属性，避免不必要的重新渲染

		// 处理文件激活状态变化
		const handleActiveFileChange = useCallback(
			(fileId: string | null) => {
				onActiveFileChange?.(fileId)
			},
			[onActiveFileChange],
		)

		// 监听 tab 激活状态变化，当 tab 变为非激活时暂停音频播放
		useEffect(() => {
			if (!isActive && tabContentRef.current) {
				// 查找所有 iframe 元素
				const iframes = tabContentRef.current.querySelectorAll("iframe")
				iframes.forEach((iframe) => {
					try {
						// 向 iframe 发送暂停消息
						iframe.contentWindow?.postMessage(
							{
								type: "tabDeactivated",
							},
							"*",
						)
					} catch (error) {
						console.error("发送 tab 切换消息失败:", error)
					}
				})
			}
		}, [isActive])

		// For playback tab, use isFullscreen from playbackProps; for other tabs, use URL parameter
		const effectiveIsFullscreen = isPlaybackTab
			? playbackProps?.isFullscreen === true
			: isFullscreenMode || isFullscreen
		const fillsViewerWithoutTabBar = hideTabBar && !effectiveIsFullscreen
		const isDocumentFlowFullscreen = documentFlowFullscreen && effectiveIsFullscreen
		// Magic App WebView needs safe-area bounded content, while browsers keep the legacy viewport-fixed layer.
		const fullscreenTabContentClassName = shouldUseFileViewerFullscreenSafeArea()
			? FILE_VIEWER_FULLSCREEN_TAB_CONTENT_CLASS_NAME
			: FILE_VIEWER_FULLSCREEN_BROWSER_TAB_CONTENT_CLASS_NAME

		return (
			<div
				ref={tabContentRef}
				className={cn(
					"left-0 w-full transition-[opacity,visibility] duration-200",
					fillPortalSurface
						? "absolute inset-0 h-full"
						: isDocumentFlowFullscreen && isActive
							? FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_TAB_CONTENT_CLASS_NAME
							: effectiveIsFullscreen
								? fullscreenTabContentClassName
								: fillsViewerWithoutTabBar
									? "absolute top-0 h-full"
									: "absolute top-11 h-[calc(100%-44px)]",
					isPlaybackTab ? "z-[9]" : isActive ? "z-10" : "z-0",
					isActive
						? "pointer-events-auto visible opacity-100"
						: "pointer-events-none invisible opacity-0",
					(isPlaybackTab || isKnowledgeBaseTab) && "bg-white dark:bg-background",
				)}
			>
				{isPlaybackTab && playbackProps ? (
					<PlaybackTabContent {...playbackProps} />
				) : isWebsite ? (
					<WebsiteIframeTabContent {...getWebsiteTabData(tab)} isActive={isActive} />
				) : isKnowledgeBaseTab && knowledgeBaseData ? (
					<KnowledgeBaseTabContent data={knowledgeBaseData} />
				) : (
					<Render
						key={tab.refreshKey || tab.id}
						{...renderProps}
						onActiveFileChange={handleActiveFileChange}
						openFileTab={openFileTab}
						isTabActive={isActive}
					/>
				)}
			</div>
		)
	},
)

TabCache.displayName = "TabCache"

export default TabCache
