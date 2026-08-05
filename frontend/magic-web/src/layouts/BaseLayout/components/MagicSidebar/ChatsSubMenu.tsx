import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { Loader2, MessageCirclePlus, RefreshCw, Search } from "lucide-react"
import { MagicDropdown } from "@/components/base"
import SuperMagicService from "@/pages/superMagic/services"
import { roleStore } from "@/pages/superMagic/stores"
import projectStore from "@/pages/superMagic/stores/core/project"
import { RouteName } from "@/routes/constants"
import { routesPathMatch } from "@/routes/history/helpers"
import { resolveProjectModeForCreate } from "@/services/superMagic/DefaultAgentSelectionService"
import { useChatWorkspace } from "@/pages/superMagic/hooks/useChatWorkspace"
import { useAutoLoadMoreSentinel } from "@/pages/superMagic/hooks/useAutoLoadMoreSentinel"
import { useChatConversationList } from "@/pages/superMagicMobile/pages/ChatsPage/hooks/useChatConversationList"
import type { ChatConversationListItem } from "@/pages/superMagicMobile/pages/ChatsPage/hooks/useChatConversationList"
import { useDesktopChatProjectActions } from "@/pages/superMagic/hooks/useDesktopChatProjectActions"
import magicToast from "@/components/base/MagicToaster/utils"
import { Input } from "@/components/shadcn-ui/input"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Skeleton } from "@/components/shadcn-ui/skeleton"
import { cn } from "@/lib/utils"
import {
	DESKTOP_CHATS_SUBMENU_LIST_MAX_HEIGHT_PX,
	DESKTOP_CHATS_SUBMENU_POPUP_WIDTH_PX,
} from "./chats-submenu-config"
import ChatConversationSubMenuRow from "./ChatConversationSubMenuRow"

type ChatsSubMenuProps = {
	children: ReactNode
	visible?: boolean
}

const CHAT_SUBMENU_SKELETON_WIDTHS = ["w-[82%]", "w-[68%]", "w-[74%]", "w-[58%]", "w-[88%]"]

/** Renders one loading row with staggered widths so the chat list skeleton resembles real titles. */
function renderChatSubMenuSkeletonRow(widthClassName: string, index: number) {
	return (
		<div
			key={widthClassName}
			className="flex h-8 w-full items-center gap-2 rounded-md px-2"
			data-testid="sidebar-chats-submenu-skeleton-item"
		>
			<Skeleton className="size-4 shrink-0 rounded-full" />
			<Skeleton
				className={cn("h-4 rounded-sm", widthClassName)}
				style={{ animationDelay: `${index * 80}ms` }}
			/>
		</div>
	)
}

/** Desktop sidebar chat list popup; shell and rows align with workspace/project nested popovers. */
function ChatsSubMenu({ children, visible = true }: ChatsSubMenuProps) {
	const { t } = useTranslation(["sidebar", "super", "common", "interface"])
	const location = useLocation()
	const [open, setOpen] = useState(false)
	const [isCreatingChat, setIsCreatingChat] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const isCreatingChatRef = useRef(false)
	const isRefreshingRef = useRef(false)
	const listScrollViewportRef = useRef<HTMLDivElement | null>(null)
	const { chatWorkspace, createProjectInChatWorkspace, ensureChatWorkspace } = useChatWorkspace()
	const currentRole = roleStore.currentRole
	const {
		items,
		isInitialChatListLoading,
		isLoadingMore,
		searchValue,
		setSearchValue,
		isEmpty,
		hasMore,
		loadMore,
		reload,
		optimisticUpdatePin,
	} = useChatConversationList()

	/** Highlight the open chat only on the chat detail route; avoid stale selection on other pages. */
	const isChatRouteActive = routesPathMatch(RouteName.SuperChatProjectState, location.pathname)
	const activeConversationProjectId = isChatRouteActive
		? projectStore.selectedProject?.id
		: undefined

	/** Mirror mobile InfiniteScroll: append the next page when the sentinel enters view. */
	const handleAutoLoadMore = useMemoizedFn(() => {
		void loadMore()
	})
	const loadMoreSentinelRef = useAutoLoadMoreSentinel({
		rootRef: listScrollViewportRef,
		disabled: !hasMore || isLoadingMore || items.length === 0,
		onLoadMore: handleAutoLoadMore,
	})

	/** Refresh on open so sidebar order matches the latest mobile ChatsPage snapshot. */
	const handleSubMenuOpenChange = useMemoizedFn((nextOpen: boolean) => {
		setOpen(nextOpen)
		if (nextOpen) void reload({ silent: true })
	})

	/** Manual refresh mirrors mobile pull-to-refresh without replacing the visible list with skeleton. */
	const handleRefreshList = useMemoizedFn(async () => {
		if (isRefreshingRef.current) return

		isRefreshingRef.current = true
		setIsRefreshing(true)

		try {
			await reload({ silent: true })
		} finally {
			isRefreshingRef.current = false
			setIsRefreshing(false)
		}
	})
	const { projectActions, projectActionComponents, updateCurrentActionItem } =
		useDesktopChatProjectActions({
			actionContext: "list",
			onProjectPinStateChanged: optimisticUpdatePin,
			onProjectChanged: () => reload({ silent: true }),
		})
	const projectActionMap = useMemo(
		() => new Map(projectActions.map((action) => [action.key, action])),
		[projectActions],
	)

	useEffect(() => {
		if (!visible) setOpen(false)
	}, [visible])

	/** Open a chat detail route using the shared chat project switcher. */
	const handleOpenConversation = useMemoizedFn(async (item: ChatConversationListItem) => {
		setOpen(false)
		const resolvedChatWorkspace = chatWorkspace ?? (await ensureChatWorkspace())
		await SuperMagicService.switchChatProject(item.project, null, {
			chatWorkspace: resolvedChatWorkspace,
		})
	})

	/** Create a new chat project with the current home role/mode selection. */
	const handleCreateChat = useMemoizedFn(async () => {
		if (isCreatingChatRef.current) return

		isCreatingChatRef.current = true
		setIsCreatingChat(true)

		try {
			const createdProject = await createProjectInChatWorkspace({
				projectMode: resolveProjectModeForCreate(currentRole),
			})

			if (!createdProject?.project || !createdProject.topic) {
				magicToast.error(t("super:hierarchicalWorkspacePopup.createProjectFailed"))
				return
			}

			setOpen(false)
			await reload({ silent: true })
			const resolvedChatWorkspace = chatWorkspace ?? (await ensureChatWorkspace())
			await SuperMagicService.switchChatProject(
				createdProject.project,
				createdProject.topic,
				{
					chatWorkspace: resolvedChatWorkspace,
				},
			)
		} catch {
			magicToast.error(t("super:hierarchicalWorkspacePopup.createProjectFailed"))
		} finally {
			isCreatingChatRef.current = false
			setIsCreatingChat(false)
		}
	})

	/** Sync project context then run the mapped sidebar list action. */
	const runProjectAction = useMemoizedFn(
		(actionKey: "pinProject" | "rename" | "saveAsProject" | "delete") => {
			projectActionMap.get(actionKey)?.onClick?.()
		},
	)

	const handleRowMenuOpenChange = useMemoizedFn(
		(nextOpen: boolean, item: ChatConversationListItem) => {
			if (nextOpen) updateCurrentActionItem(item.project)
		},
	)

	/** Render loading, empty, loaded rows, and the infinite-scroll sentinel in one scroll viewport. */
	const renderListContent = () => (
		<div className="mx-1 box-border w-full space-y-1 pr-1">
			{isInitialChatListLoading ? (
				<div className="flex flex-col gap-1" data-testid="sidebar-chats-submenu-skeleton">
					{CHAT_SUBMENU_SKELETON_WIDTHS.map(renderChatSubMenuSkeletonRow)}
				</div>
			) : null}

			{!isInitialChatListLoading && isEmpty ? (
				<div
					className="px-2 py-6 text-center text-sm text-muted-foreground"
					data-testid="sidebar-chats-submenu-empty"
				>
					{t("sidebar:chats.empty")}
				</div>
			) : null}

			{items.map((item) => (
				<ChatConversationSubMenuRow
					key={item.id}
					item={item}
					isSelected={activeConversationProjectId === item.id}
					moreAriaLabel={t("sidebar:appsMenu.more")}
					pinLabel={projectActionMap.get("pinProject")?.label || t("super:chat.pinChat")}
					renameLabel={
						projectActionMap.get("rename")?.label || t("super:chat.renameChat")
					}
					saveAsLabel={
						projectActionMap.get("saveAsProject")?.label ||
						t("super:chat.saveAsProject")
					}
					deleteLabel={
						projectActionMap.get("delete")?.label || t("super:chat.deleteChat")
					}
					onOpen={(targetItem) => void handleOpenConversation(targetItem)}
					onMenuOpenChange={handleRowMenuOpenChange}
					onPin={() => runProjectAction("pinProject")}
					onRename={() => runProjectAction("rename")}
					onSaveAsProject={() => runProjectAction("saveAsProject")}
					onDelete={() => runProjectAction("delete")}
				/>
			))}

			{items.length > 0 && hasMore ? (
				<div
					ref={loadMoreSentinelRef}
					className="flex h-8 items-center justify-center py-1"
					data-testid="sidebar-chats-submenu-load-more-sentinel"
				>
					{isLoadingMore ? (
						<Loader2
							className="size-4 animate-spin text-muted-foreground"
							data-testid="sidebar-chats-submenu-load-more-loading"
						/>
					) : null}
				</div>
			) : null}
		</div>
	)

	/** Compose the fixed popup chrome around a separately scrollable conversation list. */
	const renderPopup = () => (
		<div
			className="flex flex-col gap-1 rounded-md border border-border bg-popover p-1 shadow-xs"
			style={{ width: DESKTOP_CHATS_SUBMENU_POPUP_WIDTH_PX }}
			data-testid="sidebar-chats-submenu-popup"
		>
			{/* Header + search stay fixed; only the list below scrolls. */}
			<div className="flex shrink-0 flex-col gap-1">
				<div className="flex items-center justify-between gap-2 rounded-md px-2 py-0.5">
					<span className="min-w-0 truncate text-sm font-normal leading-5 text-sidebar-foreground">
						{t("sidebar:chats.title")}
					</span>
					<div className="flex shrink-0 items-center gap-0.5">
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="!size-7 shrink-0"
							onClick={() => void handleRefreshList()}
							disabled={isRefreshing}
							aria-label={t("sidebar:chats.refresh")}
							data-testid="sidebar-chats-submenu-refresh-button"
						>
							<RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							className="!size-7 shrink-0"
							onClick={() => void handleCreateChat()}
							disabled={isCreatingChat}
							aria-label={t("sidebar:chats.newChat")}
							data-testid="sidebar-chats-submenu-new-chat-button"
						>
							{isCreatingChat ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<MessageCirclePlus className="size-4" />
							)}
						</Button>
					</div>
				</div>

				<div className="pb-1 pl-1 pr-2">
					<div className="relative w-full">
						<Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={searchValue}
							onChange={(event) => setSearchValue(event.target.value)}
							placeholder={t("super:chatList.searchPlaceholder")}
							className="h-8 w-full pl-7 text-sm"
							data-testid="sidebar-chats-submenu-search-input"
						/>
					</div>
				</div>
			</div>

			<ScrollArea
				viewportRef={listScrollViewportRef}
				className="w-full shrink-0 [&_[data-slot='scroll-area-scrollbar']]:-mr-1 [&_[data-slot='scroll-area-viewport']>div]:!block [&_[data-slot='scroll-area-viewport']>div]:pr-2"
				style={{
					height: `min(${DESKTOP_CHATS_SUBMENU_LIST_MAX_HEIGHT_PX}px, calc(100vh - 140px))`,
					maxHeight: `min(${DESKTOP_CHATS_SUBMENU_LIST_MAX_HEIGHT_PX}px, calc(100vh - 140px))`,
				}}
			>
				{renderListContent()}
			</ScrollArea>

			{projectActionComponents}
		</div>
	)

	return (
		<MagicDropdown
			placement="rightTop"
			popupRender={renderPopup}
			open={open}
			onOpenChange={handleSubMenuOpenChange}
			overlayClassName="p-0"
			trigger={["click"]}
		>
			<span className="inline-flex w-full" data-testid="sidebar-chats-submenu-trigger">
				{children}
			</span>
		</MagicDropdown>
	)
}

export default observer(ChatsSubMenu)
