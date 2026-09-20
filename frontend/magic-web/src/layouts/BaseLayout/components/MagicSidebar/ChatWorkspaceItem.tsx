import { useEffect, useState } from "react"
import { observer } from "mobx-react-lite"
import { ChevronRight, MessageCircle } from "lucide-react"
import { useTranslation } from "react-i18next"
import { sidebarStore } from "@/stores/layout/SidebarStore"
import { cn } from "@/utils/cn"
import ChatsSubMenu from "./ChatsSubMenu"

const CHAT_WORKSPACE_KEY = "sidebar-my-chats"

/** Mount on first expansion, then retain the list/search/page state while collapsed. */
function ChatWorkspaceItem({
	active,
	onBusyChange,
	onSelect,
}: {
	active: boolean
	onBusyChange?: (busy: boolean) => void
	onSelect?: () => void
}) {
	const { t } = useTranslation("sidebar")
	const expanded = sidebarStore.expandedWorkspaces.has(CHAT_WORKSPACE_KEY)
	const [visited, setVisited] = useState(false)
	const [busy, setBusy] = useState(false)
	useEffect(() => {
		if (active && expanded) setVisited(true)
	}, [active, expanded])
	useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])
	useEffect(() => () => onBusyChange?.(false), [onBusyChange])

	return (
		<div className="mb-1 w-full" data-testid="sidebar-my-chats-workspace">
			<button
				type="button"
				className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px] font-normal text-sidebar-foreground hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
				aria-expanded={expanded}
				disabled={busy}
				onClick={() => sidebarStore.toggleWorkspaceExpanded(CHAT_WORKSPACE_KEY)}
				data-testid="sidebar-my-chats-toggle"
			>
				<ChevronRight
					size={16}
					className={cn("shrink-0 transition-transform", expanded && "rotate-90")}
				/>
				<MessageCircle size={16} className="shrink-0 text-muted-foreground" />
				<span className="min-w-0 flex-1 truncate">{t("chats.myChats")}</span>
			</button>
			{/* A bounded child viewport keeps the next workspace reachable, as in project lists. */}
			<div hidden={!expanded} className="pl-6 pt-1">
				{(visited || (active && expanded)) && (
					<ChatsSubMenu
						standalone
						workspace
						active={active && expanded}
						onBusyChange={setBusy}
						onSelect={onSelect}
					/>
				)}
			</div>
		</div>
	)
}

export default observer(ChatWorkspaceItem)
