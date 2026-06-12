import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Ellipsis } from "lucide-react"
import { cn } from "@/lib/utils"
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
import {
	ChatConversationActionIcon,
	chatConversationActionMenuItemClassName,
	chatConversationActionMenuItemDangerClassName,
} from "@/pages/superMagic/utils/chat-conversation-action-icon"
import { DESKTOP_CHATS_SUBMENU_SHOW_TIME_LABEL } from "./chats-submenu-config"

interface ChatConversationSubMenuRowProps {
	item: ChatConversationListItem
	isSelected?: boolean
	moreAriaLabel: string
	renameLabel: string
	saveAsLabel: string
	deleteLabel: string
	onOpen: (item: ChatConversationListItem) => void
	onMenuOpenChange: (open: boolean, item: ChatConversationListItem) => void
	onRename: () => void
	onSaveAsProject: () => void
	onDelete: () => void
}

/** Single chat list row; layout mirrors CollapsedWorkspaceProjectRow for sidebar popover consistency. */
function ChatConversationSubMenuRow({
	item,
	isSelected = false,
	moreAriaLabel,
	renameLabel,
	saveAsLabel,
	deleteLabel,
	onOpen,
	onMenuOpenChange,
	onRename,
	onSaveAsProject,
	onDelete,
}: ChatConversationSubMenuRowProps) {
	const { t } = useTranslation("interface")
	const [isHovered, setIsHovered] = useState(false)
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const suppressRowClickRef = useRef(false)

	/** Block row navigation briefly after opening the more menu, same as project rows. */
	function blockRowClickTemporarily() {
		suppressRowClickRef.current = true
		setTimeout(() => {
			suppressRowClickRef.current = false
		}, 80)
	}

	function handleRowClick() {
		if (isMenuOpen || suppressRowClickRef.current) return
		onOpen(item)
	}

	return (
		<div className={cn("h-8 w-full rounded-md")}>
			<div
				className={cn(
					"inline-flex h-full w-full items-center gap-2 rounded-md px-2",
					!isSelected && "hover:bg-sidebar-accent",
					isSelected && "bg-sidebar-accent",
				)}
				data-selected={isSelected}
				data-testid={`sidebar-chats-submenu-item-${item.id}`}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
			>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm font-normal leading-5 outline-none"
					onClick={handleRowClick}
				>
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
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 max-w-full items-center gap-1.5">
							<span
								className={cn(
									"min-w-0 max-w-full truncate text-left",
									isSelected
										? "text-sidebar-accent-foreground"
										: "text-sidebar-foreground",
								)}
							>
								{item.title}
							</span>
							{item.isPinned ? <PinnedTag /> : null}
						</div>
					</div>
					{DESKTOP_CHATS_SUBMENU_SHOW_TIME_LABEL ? (
						<span className="shrink-0 text-xs text-muted-foreground">
							{item.timeLabel}
						</span>
					) : null}
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
						<button
							type="button"
							aria-label={moreAriaLabel}
							data-testid={`sidebar-chats-submenu-more-${item.id}`}
							className={cn(
								"flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 transition-opacity hover:bg-sidebar-accent",
								isSelected
									? "text-sidebar-accent-foreground"
									: "text-sidebar-foreground",
								isHovered || isMenuOpen
									? "opacity-100"
									: "pointer-events-none opacity-0",
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
							<Ellipsis className="h-4 w-4" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" className="w-44">
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
