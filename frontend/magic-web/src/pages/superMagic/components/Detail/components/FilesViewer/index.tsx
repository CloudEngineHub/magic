import {
	memo,
	useRef,
	useImperativeHandle,
	forwardRef,
	useState,
	useEffect,
	useMemo,
	useCallback,
} from "react"
import { createPortal } from "react-dom"
import { observer } from "mobx-react-lite"
import { IconMenu2, IconX } from "@tabler/icons-react"
import { Tooltip } from "antd"
import magicToast from "@/components/base/MagicToaster/utils"
import { cn } from "@/lib/utils"
import useFullscreenMode from "@/hooks/useFullscreenMode"
import useShareRoute from "@/pages/superMagic/hooks/useShareRoute"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"

// Types
import type { FilesViewerProps, FilesViewerRef, TabItem as TabItemType } from "./types"

// Hooks
import { useFilesViewer } from "./hooks/useFilesViewer"
import { useTabContextMenu } from "./hooks/useTabContextMenu"
import { useTabCache } from "./hooks/useTabCache"

// Components
import TabCache from "./components/TabCache"
import TabItem from "./components/TabItem"
import { TabContextMenu } from "./components/TabContextMenu"
import { useTranslation } from "react-i18next"
import MagicIcon from "@/components/base/MagicIcon"
import MagicSpin from "@/components/base/MagicSpin"
import HeadlessHorizontalScroll from "@/components/base/HeadlessHorizontalScroll"
import DetailEmpty from "../DetailEmpty"
import { FileTabMagicIcon } from "./components/FileTabMagicIcon"
import WebsitePresetMenu from "./components/WebsitePresetMenu"
import CommonWebsitePresetDialog, {
	type CommonWebsitePresetFormValues,
} from "./components/CommonWebsitePresetDialog"
import StablePPTPortalSurface from "./components/StablePPTPortalSurface"
import {
	COMMON_WEBSITE_PRESETS_LIMIT,
	getWebsiteTabData,
	saveCommonWebsitePreset,
} from "./utils/websiteTabs"
import {
	FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_VIEWPORT_CLASS_NAME,
	FILE_VIEWER_FULLSCREEN_SAFE_AREA_CLASS_NAME,
	FILE_VIEWER_FULLSCREEN_VIEWPORT_CLASS_NAME,
	shouldUseFileViewerFullscreenSafeArea,
} from "./utils/fullscreenSafeArea"
import { shouldUsePPTRootRender } from "../../utils/file"

// 获取文件路径用作tooltip的工具函数
const getFileTooltip = (tab: any, unknownFileText: string) => {
	const fileData = tab?.fileData || {}
	const filePath = fileData.relative_file_path || ""

	const name =
		fileData.display_filename ||
		fileData.file_name ||
		fileData.filename ||
		tab?.title ||
		tab?.name ||
		unknownFileText

	if (filePath) {
		const parts = filePath.split("/")
		parts.pop()
		return parts.join("/")
	}

	return name
}

/**
 * FilesViewer - 文件标签页查看器组件
 *
 * @param props - 组件属性
 * @returns JSX.Element
 */
const FilesViewer = memo(
	observer(
		forwardRef<FilesViewerRef, FilesViewerProps>((props, ref) => {
			// Props are passed directly to hook
			const tabAttachments = props.attachments ?? props.attachmentList
			const { t } = useTranslation("super")
			const { isShareRoute } = useShareRoute()
			const isUrlFullscreenMode = useFullscreenMode()
			const isFullscreenMode = Boolean(props.forceFullscreenMode) || isUrlFullscreenMode
			const [expandPanelVisible, setExpandPanelVisible] = useState(false)
			const [commonWebsiteDialogOpen, setCommonWebsiteDialogOpen] = useState(false)
			const [commonWebsiteInitialValues, setCommonWebsiteInitialValues] =
				useState<CommonWebsitePresetFormValues>()
			const tabsContainerRef = useRef<HTMLDivElement>(null)

			// 使用自定义 Hook 管理状态
			const {
				tabs,
				activeTab,
				isRestoringFileTabs,
				isAwaitingProjectAttachments,
				openFileTab,
				openWebsiteTab,
				closeFileTab,
				switchToTab,
				clearAllTabs,
				closeOtherTabs,
				closeTabsToRight,
				getRenderProps,
				fullscreenFileId,
				handleRefresh,
				handleTabDragStart,
				handleTabDragEnd,
				handleTabDragOver,
				handleTabDrop,
				draggedTab,
				dragOverIndex,
				dragDirection,
				openPlaybackTab,
				closePlaybackTab,
				isPlaybackTab,
				openKnowledgeBaseTab,
				closeKnowledgeBaseTab,
				isKnowledgeBaseTab,
				handleFileFullscreen,
				handleExitFullscreen,
				getCheckBeforeClose,
			} = useFilesViewer(props)

			// 使用缓存 Hook
			const {
				addToCache,
				getFromCache,
				removeFromCache,
				clearCache,
				getCacheStats,
				cachedTabIds,
			} = useTabCache({
				maxCacheSize: 10,
				enableCache: !isShareRoute,
				cacheOfficeFiles: true,
			})

			// -----------------注册快捷键-----------------

			// 与系统快捷键冲突，暂时禁用
			// useRegisterShortcut(ShortcutActions.CLOSE_CURRENT_TAB, () => {
			// 	if (activeTab) {
			// 		closeFileTab(activeTab.id)
			// 	}
			// })

			// 暂时禁用
			// useRegisterShortcut(ShortcutActions.CLOSE_OTHER_TABS, () => {
			// 	if (activeTab) {
			// 		closeOtherTabs(activeTab.id)
			// 	}
			// })

			// 与系统快捷键冲突，暂时禁用
			// useRegisterShortcut(ShortcutActions.CLOSE_ALL_TABS, () => {
			// 	clearAllTabs()
			// })
			// -----------------注册快捷键-----------------

			// 处理 tab 关闭时的缓存清理
			const handleTabClose = async (tabId: string) => {
				// Get checkBeforeClose function for this tab/file
				const checkBeforeClose = getCheckBeforeClose(tabId)

				// If tab has checkBeforeClose method, call it first
				if (checkBeforeClose && typeof checkBeforeClose === "function") {
					const canClose = await checkBeforeClose()
					if (!canClose) {
						// User canceled the close operation
						return
					}
				}

				closeFileTab(tabId)
				removeFromCache(tabId)
			}

			// 处理所有 tabs 关闭时的缓存清理
			const handleClearAllTabs = async () => {
				// Check if any tab has unsaved changes
				for (const tab of tabs) {
					if (tab.closeable === false) continue

					const checkBeforeClose = getCheckBeforeClose(tab.id)

					if (checkBeforeClose && typeof checkBeforeClose === "function") {
						const canClose = await checkBeforeClose()
						if (!canClose) {
							// User canceled the operation
							return
						}
					}
				}

				clearAllTabs()
				clearCache()
			}

			// Handle refresh tab action
			const handleRefreshTab = useCallback(
				(tabId: string) => {
					// Switch to the tab first if it's not active
					if (activeTab?.id !== tabId) {
						switchToTab(tabId)
					}
					// Trigger refresh after a short delay to ensure tab is active
					setTimeout(() => {
						handleRefresh()
					}, 100)
				},
				[activeTab, switchToTab, handleRefresh],
			)

			const handleAddWebsiteToCommon = useCallback((tab: TabItemType) => {
				const tabData = getWebsiteTabData(tab)
				setCommonWebsiteInitialValues({
					title: tabData.title,
					url: tabData.url,
					description: tabData.description,
				})
				setCommonWebsiteDialogOpen(true)
			}, [])

			const handleSubmitCommonWebsite = useCallback(
				(values: CommonWebsitePresetFormValues) => {
					const result = saveCommonWebsitePreset(values)
					if (result.status === "saved") {
						magicToast.success(t("fileViewer.website.commonSaved"))
						setCommonWebsiteDialogOpen(false)
						return
					}
					if (result.status === "limit") {
						magicToast.warning(
							t("fileViewer.website.commonLimitReached", {
								count: COMMON_WEBSITE_PRESETS_LIMIT,
							}),
						)
						return
					}
					if (result.status === "exists") {
						magicToast.warning(t("fileViewer.website.commonAlreadyExists"))
						return
					}
					magicToast.warning(t("fileViewer.website.commonSaveFailed"))
				},
				[t],
			)

			// 使用右键菜单 Hook
			const {
				contextMenuState,
				handleContainerContextMenu,
				getContextMenuItems,
				hideContextMenu,
			} = useTabContextMenu({
				tabs,
				actions: {
					closeFileTab: handleTabClose,
					closeOtherTabs,
					closeTabsToRight,
					clearAllTabs: handleClearAllTabs,
					refreshTab: handleRefreshTab,
					addWebsiteToCommon: handleAddWebsiteToCommon,
				},
			})

			// 暴露组件方法
			useImperativeHandle(ref, () => ({
				openFileTab,
				closeFileTab,
				switchToTab,
				clearAllTabs,
				closeOtherTabs,
				closeTabsToRight,
				isFullscreen: !!fullscreenFileId,
				// 暴露缓存相关方法
				getCacheStats,
				clearCache,
				handleRefresh,
				// Playback tab相关方法
				openPlaybackTab,
				closePlaybackTab,
				// Knowledge base tab相关方法
				openKnowledgeBaseTab,
				closeKnowledgeBaseTab,
				// Website tab相关方法
				openWebsiteTab,
			}))

			// Notify parent about fullscreen state changes via callback
			useEffect(() => {
				props.onFullscreenChange?.(Boolean(props.forceFullscreenMode) || !!fullscreenFileId)
			}, [fullscreenFileId, props])

			// 监听activeTab变化，自动滚动到对应位置
			useEffect(() => {
				if (!activeTab || !tabsContainerRef.current || tabs.length === 0) return

				const container = tabsContainerRef.current
				// Tab ids may contain file-path characters that are invalid inside CSS selectors.
				const activeTabElement = Array.from(
					container.querySelectorAll<HTMLElement>("[data-tab-id]"),
				).find((element) => element.dataset.tabId === activeTab.id)

				if (activeTabElement) {
					// 计算目标tab相对于容器的位置
					const targetScrollLeft =
						activeTabElement.offsetLeft -
						container.offsetWidth / 2 +
						activeTabElement.offsetWidth / 2

					// 平滑滚动到目标位置
					container.scrollTo({
						left: Math.max(0, targetScrollLeft),
						behavior: "smooth",
					})
				}
			}, [activeTab, tabs])

			// 渲染tab项
			const renderTabItem = (tab: TabItemType, index: number) => {
				const isActive = activeTab?.id === tab.id
				const isDragging = draggedTab?.id === tab.id
				const isDragOver = dragOverIndex === index
				const isPlayback = isPlaybackTab(tab.id)

				return (
					<TabItem
						key={tab.id}
						tab={tab}
						index={index}
						allTabs={tabs}
						isActive={isActive}
						isDragging={isDragging}
						isDragOver={isDragOver}
						dragDirection={dragDirection || undefined}
						isPlayback={isPlayback}
						contextMenuState={contextMenuState}
						attachments={tabAttachments}
						onSwitchToTab={switchToTab}
						onCloseTab={handleTabClose}
						onDragStart={handleTabDragStart}
						onDragEnd={handleTabDragEnd}
						onDragOver={handleTabDragOver}
						onDrop={handleTabDrop}
					/>
				)
			}

			// 渲染展开面板项
			const renderExpandPanelItem = (tab: any) => {
				const isPlayback = isPlaybackTab(tab.id)
				return (
					<Tooltip
						key={tab.id}
						title={getFileTooltip(tab, t("fileViewer.unknownFile"))}
						placement="right"
						mouseEnterDelay={0.3}
						classNames={{
							root: "max-w-[500px]",
						}}
					>
						<div
							className="flex cursor-pointer items-center gap-1 rounded px-[10px] py-[6px] transition-colors duration-200 hover:bg-black/5"
							onClick={() => {
								switchToTab(tab.id)
								setExpandPanelVisible(false)
							}}
							data-testid="switch-to-tab"
						>
							<FileTabMagicIcon
								tab={tab}
								attachments={tabAttachments}
								isPlayback={isPlayback}
								size={12}
							/>
							<span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-sans text-xs font-normal leading-[1.33] text-foreground/80">
								{tab.title || tab.name}
							</span>
							{tab.closeable ? (
								<div
									className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded transition-colors duration-200 hover:bg-black/10"
									onClick={(e) => {
										e.stopPropagation()
										handleTabClose(tab.id)
									}}
									data-testid="handle-tab-close"
								>
									<IconX />
								</div>
							) : null}
						</div>
					</Tooltip>
				)
			}

			const currentTab = activeTab
			const { isFullscreen, ...otherProps } = getRenderProps(currentTab)
			const effectiveIsFullscreen =
				isFullscreenMode || Boolean(isFullscreen) || fullscreenFileId === currentTab?.id
			const isDocumentFlowFullscreen =
				Boolean(props.documentFlowFullscreen) && effectiveIsFullscreen
			const currentRenderProps = useMemo(
				() => ({
					isFullscreen: effectiveIsFullscreen,
					documentFlowFullscreen: isDocumentFlowFullscreen,
					...otherProps,
				}),
				[effectiveIsFullscreen, isDocumentFlowFullscreen, otherProps],
			)
			const shouldUseSafeAreaFullscreen = shouldUseFileViewerFullscreenSafeArea()
			const currentRenderPropsRef = useRef(currentRenderProps)
			currentRenderPropsRef.current = currentRenderProps
			const currentTabId = currentTab?.id
			const currentRenderCacheKey = useMemo(() => {
				if (!currentTab) return ""

				return [
					currentTab.id,
					currentTab.refreshKey || "",
					currentTab.fileData.file_id || "",
					currentTab.fileData.updated_at || "",
					String(effectiveIsFullscreen),
					String(isDocumentFlowFullscreen),
					String(otherProps.type || ""),
					String(otherProps.updatedAt || ""),
					props.activeFileId || "",
					props.showFileFooter ? "1" : "0",
				].join("|")
			}, [
				currentTab,
				effectiveIsFullscreen,
				isDocumentFlowFullscreen,
				otherProps.type,
				otherProps.updatedAt,
				props.activeFileId,
				props.showFileFooter,
			])
			const shouldShowDetailEmpty =
				props.showFallbackWhenEmpty ||
				(!currentTab && (tabs.length > 0 || Boolean(props.activeFileId)))
			const hasCloseableTabs = tabs.some((tab) => tab.closeable !== false)

			// 缓存当前 tab 的渲染属性
			useEffect(() => {
				if (currentTabId) {
					addToCache(currentTabId, currentRenderPropsRef.current)
				}
			}, [currentTabId, currentRenderCacheKey, addToCache])

			// 判断是否应该渲染某个 tab
			const shouldRenderTab = useCallback(
				(tab: any) => {
					const isActive = activeTab?.id === tab.id
					const isCached = cachedTabIds.includes(tab.id)

					// 只渲染活跃的 tab 和缓存中的 tab
					return isActive || isCached
				},
				[activeTab?.id, cachedTabIds],
			)

			// 渲染活跃和缓存的 tabs。PPTRootRender tabs 会被放入稳定的 body Portal，
			// 避免 FilesViewer 在普通 DOM 与全屏 Portal 间切换时销毁 PPTStore。
			const cachedTabRenders = useMemo(() => {
				const filteredTabs = tabs.filter(shouldRenderTab)

				return filteredTabs.map((tab) => {
					const isActive = activeTab?.id === tab.id
					const cachedProps = getFromCache(tab.id)

					// 如果没有缓存，使用当前 tab 的属性
					const renderProps = isActive
						? currentRenderProps
						: cachedProps || currentRenderProps

					// 判断是否是演示模式tab，如果是则构建playbackProps
					const isPlayback = isPlaybackTab(tab.id)
					const playbackProps = isPlayback
						? {
								disPlayDetail: props.userSelectDetail || props.autoDetail,
								setUserSelectDetail: props.setUserSelectDetail,
								userSelectDetail: props.userSelectDetail,
								attachments: props.attachments,
								attachmentList: props.attachmentList,
								isAwaitingProjectAttachments,
								topicId: props.topicId,
								baseShareUrl: props.baseShareUrl,
								currentTopicStatus: props.currentTopicStatus,
								messages: props.messages,
								autoDetail: props.autoDetail,
								showPlaybackControl: props.showPlaybackControl,
								allowEdit: props.allowEdit,
								selectedTopic: props.selectedTopic,
								selectedProject: props.selectedProject,
								projectId: props.projectId,
								isFileShare: props.isFileShare,
								activeFileId: props.activeFileId,
								onActiveFileChange: props.onActiveFileChange,
								openFileTab: props.openFileTab
									? (fileId: string, path: string) =>
											props.openFileTab?.({
												file_id: fileId,
												relative_file_path: path,
											})
									: undefined,
								getFileViewMode: props.getFileViewMode,
								handleViewModeChange: props.handleViewModeChange,
								onDownload: props.onDownload,
								isFullscreen: fullscreenFileId === tab.id,
								onFullscreenChange: (fs: boolean) => {
									if (fs) {
										handleFileFullscreen(tab.id)
									} else {
										handleExitFullscreen()
									}
								},
							}
						: undefined

					// 判断是否是知识库tab
					const isKbTab = isKnowledgeBaseTab(tab.id)
					const knowledgeBaseData = isKbTab ? (tab as any).data : undefined
					const usesStablePptPortal =
						!props.documentFlowFullscreen &&
						shouldUsePPTRootRender(renderProps.type, renderProps.data)

					return {
						isActive,
						usesStablePptPortal,
						node: (
							<TabCache
								key={tab.id}
								tab={tab as any}
								isActive={isActive}
								renderProps={renderProps}
								onActiveFileChange={props?.onActiveFileChange}
								isFullscreen={effectiveIsFullscreen}
								documentFlowFullscreen={isDocumentFlowFullscreen}
								openFileTab={openFileTab}
								playbackProps={playbackProps}
								hideTabBar={props.hideTabBar}
								knowledgeBaseData={knowledgeBaseData}
								fillPortalSurface={usesStablePptPortal}
							/>
						),
					}
				})
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [
				tabs,
				activeTab?.id,
				getFromCache,
				effectiveIsFullscreen,
				isDocumentFlowFullscreen,
				currentRenderProps,
				props?.onActiveFileChange,
				shouldRenderTab,
				cachedTabIds,
				isPlaybackTab,
				props,
				props.autoDetail,
				props.userSelectDetail,
				openFileTab,
			])
			const inlineCachedTabs = cachedTabRenders
				.filter((entry) => !entry.usesStablePptPortal)
				.map((entry) => entry.node)
			const stablePptCachedTabs = cachedTabRenders
				.filter((entry) => entry.usesStablePptPortal)
				.map((entry) => entry.node)
			const hasActiveStablePptTab = cachedTabRenders.some(
				(entry) => entry.usesStablePptPortal && entry.isActive,
			)
			const hasStablePptTabs = stablePptCachedTabs.length > 0
			const shouldShowStablePptSurface =
				hasActiveStablePptTab && Boolean(currentTab) && !isRestoringFileTabs
			const [stablePptSurfaceAnchor, setStablePptSurfaceAnchor] =
				useState<HTMLDivElement | null>(null)

			const viewer = (
				<div
					className={cn(
						isDocumentFlowFullscreen
							? `flex min-h-dvh flex-col ${FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_VIEWPORT_CLASS_NAME}`
							: cn(
									"flex h-full flex-col",
									effectiveIsFullscreen &&
										FILE_VIEWER_FULLSCREEN_VIEWPORT_CLASS_NAME,
								),
					)}
				>
					<div
						className={cn(
							isDocumentFlowFullscreen
								? "flex min-h-dvh min-w-0 flex-col"
								: "flex h-full min-h-0 min-w-0 flex-col",
							// Fullscreen fixed layers bypass BaseLayoutPc padding, so this shell reapplies safe-area insets.
							effectiveIsFullscreen &&
								!isDocumentFlowFullscreen &&
								shouldUseSafeAreaFullscreen &&
								FILE_VIEWER_FULLSCREEN_SAFE_AREA_CLASS_NAME,
						)}
					>
						{/* Tab Bar — hidden in immersive read-only mode (e.g. audio recording detail) */}
						{tabs.length > 0 && !effectiveIsFullscreen && !props.hideTabBar && (
							<div className="relative flex h-11 items-center bg-accent">
								<HeadlessHorizontalScroll
									className="h-full min-w-0 flex-1"
									controlBackground="rgb(var(--accent-rgb))"
									scrollContainerClassName="no-scrollbar flex h-full w-full items-center overflow-x-auto overflow-y-hidden px-1 gap-0.5"
									scrollContainerRef={tabsContainerRef}
									onScrollContainerContextMenu={handleContainerContextMenu}
								>
									{tabs.map((tab, index) => renderTabItem(tab, index))}
								</HeadlessHorizontalScroll>

								<WebsitePresetMenu onOpenWebsiteTab={openWebsiteTab} />

								{/* 展开按钮 */}
								<DropdownMenu
									open={expandPanelVisible}
									onOpenChange={setExpandPanelVisible}
								>
									<DropdownMenuTrigger asChild>
										<div className="relative mx-1 flex size-7 shrink-0 cursor-pointer select-none items-center justify-center rounded-md transition-all duration-200 hover:bg-black/10">
											<MagicIcon component={IconMenu2} size={18} />
										</div>
									</DropdownMenuTrigger>
									<DropdownMenuContent
										align="end"
										className="max-h-[300px] w-[180px] overflow-y-auto p-1"
									>
										{tabs.map(renderExpandPanelItem)}
									</DropdownMenuContent>
								</DropdownMenu>

								{/* 关闭所有 tab 按钮 */}
								{hasCloseableTabs ? (
									<Tooltip
										title={t("shortcut.closeAllTabs")}
										placement="bottom"
										mouseEnterDelay={0.3}
									>
										<div
											className="relative mr-1 flex size-7 shrink-0 cursor-pointer select-none items-center justify-center rounded-md transition-all duration-200 hover:bg-black/10"
											onClick={handleClearAllTabs}
											data-testid="handle-clear-all-tabs"
										>
											<MagicIcon component={IconX} size={16} />
										</div>
									</Tooltip>
								) : null}
							</div>
						)}

						{/* 右键菜单 */}
						<TabContextMenu
							contextMenuState={contextMenuState}
							getContextMenuItems={getContextMenuItems}
							onClose={hideContextMenu}
						/>
						<CommonWebsitePresetDialog
							open={commonWebsiteDialogOpen}
							mode="add"
							initialValues={commonWebsiteInitialValues}
							onOpenChange={setCommonWebsiteDialogOpen}
							onSubmit={handleSubmitCommonWebsite}
						/>

						{/* Content Area */}
						<div
							className={cn(
								isDocumentFlowFullscreen
									? "flex min-h-dvh flex-col overflow-visible"
									: "flex flex-1 flex-col overflow-hidden",
							)}
						>
							{currentTab ? (
								isRestoringFileTabs ? (
									<div className="flex h-full items-center justify-center">
										<MagicSpin spinning />
									</div>
								) : (
									<>
										{/* Non-PPT tabs keep the existing FilesViewer rendering path. */}
										{inlineCachedTabs}
										{hasActiveStablePptTab ? (
											<div
												ref={setStablePptSurfaceAnchor}
												className="relative min-h-0 flex-1"
												data-files-viewer-ppt-anchor="true"
											/>
										) : null}
									</>
								)
							) : shouldShowDetailEmpty ? (
								<DetailEmpty />
							) : null}
						</div>
					</div>
				</div>
			)

			// Fixed fullscreen layers can be trapped by transformed workspace ancestors, so they
			// need a body portal. PPT TabCache nodes are a stable sibling Portal and survive this
			// inline/body switch; document-flow fullscreen stays in the share document tree.
			const viewerLayer =
				effectiveIsFullscreen &&
				!isDocumentFlowFullscreen &&
				typeof document !== "undefined"
					? createPortal(viewer, document.body)
					: viewer

			return (
				<>
					<StablePPTPortalSurface
						anchor={stablePptSurfaceAnchor}
						borderRadius={
							effectiveIsFullscreen
								? "0px"
								: props.hideTabBar
									? "0.5rem"
									: "0px 0px 0.5rem 0.5rem"
						}
						enabled={Boolean(currentTab) && !isRestoringFileTabs && hasStablePptTabs}
						isFullscreen={effectiveIsFullscreen}
						visible={shouldShowStablePptSurface}
					>
						{stablePptCachedTabs}
					</StablePPTPortalSurface>
					{viewerLayer}
				</>
			)
		}),
	),
)

FilesViewer.displayName = "FilesViewer"

export default FilesViewer

// Export ref type for external usage
export type { FilesViewerRef }
