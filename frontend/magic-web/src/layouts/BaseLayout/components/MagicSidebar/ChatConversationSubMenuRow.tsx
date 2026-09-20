import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Ellipsis } from "lucide-react"
import { cn } from "@/utils/cn"
import NavigationStatusIcon from "@/pages/superMagic/components/NavigationStatusIcon"
import PinnedTag from "@/pages/superMagic/components/EmptyWorkspacePanel/components/ProjectItem/components/PinnedTag"
import { ProjectStatus } from "@/pages/superMagic/pages/Workspace/types"
import type { ChatConversationListItem } from "@/pages/superMagicMobile/pages/ChatsPage/hooks/useChatConversationList"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { Button } from "@/components/shadcn-ui/button"
import {
	ChatConversationActionIcon,
	chatConversationActionMenuItemClassName,
	chatConversationActionMenuItemDangerClassName,
} from "@/pages/superMagic/utils/chat-conversation-action-icon"

const ROW_CLICK_SUPPRESS_MS = 80

interface ChatConversationSubMenuRowProps {
	item: ChatConversationListItem
	isSelected?: boolean
	moreAriaLabel: string
	pinLabel: string
	renameLabel: string
	saveAsLabel: string
	deleteLabel: string
	onOpen: (item: ChatConversationListItem) => void
	onMenuOpenChange: (open: boolean, item: ChatConversationListItem) => void
	onPin: () => void
	onRename: () => void
	onSaveAsProject: () => void
	onDelete: () => void
}

/** Single chat list row; layout mirrors CollapsedWorkspaceProjectRow for sidebar popover consistency. */
function ChatConversationSubMenuRow({
	item,
	isSelected = false,
	moreAriaLabel,
	pinLabel,
	renameLabel,
	saveAsLabel,
	deleteLabel,
	onOpen,
	onMenuOpenChange,
	onPin,
	onRename,
	onSaveAsProject,
	onDelete,
}: ChatConversationSubMenuRowProps) {
	const { t } = useTranslation("interface")
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isHovered, setIsHovered] = useState(false)
	const suppressRowClickRef = useRef(false)
	const suppressRowClickTimeoutRef = useRef<number | null>(null)

	useEffect(() => {
		/** Clear the delayed reset so list reorders or route switches never leave orphan callbacks behind. */
		return () => {
			if (suppressRowClickTimeoutRef.current !== null) {
				window.clearTimeout(suppressRowClickTimeoutRef.current)
			}
		}
	}, [])

	/** Block row navigation briefly after opening the more menu, same as project rows. */
	function blockRowClickTemporarily() {
		suppressRowClickRef.current = true
		if (suppressRowClickTimeoutRef.current !== null) {
			window.clearTimeout(suppressRowClickTimeoutRef.current)
		}
		suppressRowClickTimeoutRef.current = window.setTimeout(() => {
			suppressRowClickRef.current = false
			suppressRowClickTimeoutRef.current = null
		}, ROW_CLICK_SUPPRESS_MS)
	}

	function handleRowClick() {
		if (isMenuOpen || suppressRowClickRef.current) return
		onOpen(item)
	}

	/** Match project rows: one line with actions expanding only during interaction. */
	return (
		<div className="h-8 w-full rounded-md">
			<div
				className={cn(
					"group/project-row flex h-full w-full min-w-0 items-center rounded-md",
					"focus-within:bg-sidebar-accent hover:bg-sidebar-accent",
					(isSelected || isMenuOpen) && "bg-sidebar-accent",
				)}
				data-selected={isSelected}
				data-testid={`sidebar-chats-submenu-item-${item.id}`}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<button
					type="button"
					className={cn(
						"flex h-full min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm font-normal leading-5 outline-none [-webkit-tap-highlight-color:transparent]",
						"hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none",
					)}
					onClick={handleRowClick}
				>
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 max-w-full items-center gap-1.5">
							<span
								className={cn(
									"min-w-0 max-w-full truncate text-left text-[13px] leading-[18px]",
									isSelected
										? "text-sidebar-accent-foreground"
										: "text-sidebar-foreground",
								)}
							>
								{item.title}
							</span>
							{item.isRunning ? (
								<span
									className="flex shrink-0"
									aria-label={t("accountPanel.timedTasks.running")}
									aria-busy
									data-testid={`sidebar-chats-submenu-item-running-${item.id}`}
								>
									<NavigationStatusIcon
										itemType="project"
										status={ProjectStatus.RUNNING}
										showDefaultIcon={false}
										className={
											isSelected
												? "text-sidebar-accent-foreground"
												: "text-sidebar-foreground"
										}
									/>
								</span>
							) : null}
							{item.isPinned ? (
								<PinnedTag className="h-3 w-3 border-0 bg-transparent p-0" />
							) : null}
						</div>
					</div>
				</button>

				<DropdownMenu
					open={isMenuOpen}
					onOpenChange={(nextOpen) => {
						setIsMenuOpen(nextOpen)
						if (nextOpen) blockRowClickTemporarily()
						onMenuOpenChange(nextOpen, item)
					}}
				>
					<DropdownMenuTrigger asChild>
						{/* Let content fill the row until hover, keyboard focus or an open menu expands actions. */}
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={moreAriaLabel}
							aria-haspopup="menu"
							aria-expanded={isMenuOpen}
							data-state={isMenuOpen ? "open" : "closed"}
							data-project-more-trigger="true"
							data-testid={`sidebar-chats-submenu-more-${item.id}`}
							className={cn(
								"relative h-7 w-0 shrink-0 overflow-hidden bg-transparent p-0 text-sidebar-foreground transition-[width] before:absolute before:inset-0.5 before:rounded-md before:transition-colors group-focus-within/project-row:w-7 no-hover:w-7",
								"hover:bg-transparent hover:before:bg-sidebar-foreground/10 focus-visible:ring-0 focus-visible:before:bg-sidebar-foreground/10 active:before:bg-sidebar-foreground/15 dark:hover:bg-transparent",
								"data-[state=open]:before:bg-sidebar-foreground/10",
								(isHovered || isMenuOpen) && "w-7",
							)}
							onClick={(event) => {
								blockRowClickTemporarily()
								event.stopPropagation()
							}}
							onPointerDown={(event) => {
								blockRowClickTemporarily()
								event.stopPropagation()
							}}
							onMouseDown={(event) => {
								blockRowClickTemporarily()
								event.stopPropagation()
							}}
						>
							<Ellipsis
								className={cn(
									"relative h-4 w-4 transition-opacity group-focus-within/project-row:opacity-100 no-hover:opacity-100",
									isHovered || isMenuOpen ? "opacity-100" : "opacity-0",
								)}
							/>
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-44">
						<DropdownMenuItem
							className={chatConversationActionMenuItemClassName}
							onClick={onPin}
							data-testid="sidebar-chats-submenu-action-pin"
						>
							<ChatConversationActionIcon
								actionKey="pinProject"
								isPinned={item.isPinned}
							/>
							{pinLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							className={chatConversationActionMenuItemClassName}
							onClick={onRename}
							data-testid="sidebar-chats-submenu-action-rename"
						>
							<ChatConversationActionIcon actionKey="rename" />
							{renameLabel}
						</DropdownMenuItem>
						<DropdownMenuItem
							className={chatConversationActionMenuItemClassName}
							onClick={onSaveAsProject}
							data-testid="sidebar-chats-submenu-action-save-as-project"
						>
							<ChatConversationActionIcon actionKey="saveAsProject" />
							{saveAsLabel}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							variant="destructive"
							className={chatConversationActionMenuItemDangerClassName}
							onClick={onDelete}
							data-testid="sidebar-chats-submenu-action-delete"
						>
							<ChatConversationActionIcon actionKey="delete" variant="destructive" />
							{deleteLabel}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	)
}

export default ChatConversationSubMenuRow
