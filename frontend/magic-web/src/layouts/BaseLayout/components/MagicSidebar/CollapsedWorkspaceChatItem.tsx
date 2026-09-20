import { useEffect, useRef, useState } from "react"
import { ChevronRight, MessageCircle, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { Button } from "@/components/shadcn-ui/button"
import MagicTooltip from "@/components/base/MagicTooltip"
import ChatsSubMenu, { type ChatsSubMenuHandle } from "./ChatsSubMenu"

interface CollapsedWorkspaceChatItemProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	onBusyChange: (busy: boolean) => void
	onSelect: () => void
	keepPopoverOpen?: boolean
}

export default function CollapsedWorkspaceChatItem({
	open,
	onOpenChange,
	onBusyChange,
	onSelect,
	keepPopoverOpen = false,
}: CollapsedWorkspaceChatItemProps) {
	const { t } = useTranslation("sidebar")
	const [busy, setBusy] = useState(false)
	const listRef = useRef<ChatsSubMenuHandle>(null)
	useEffect(() => onBusyChange(busy), [busy, onBusyChange])
	useEffect(() => () => onBusyChange(false), [onBusyChange])

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen && (busy || keepPopoverOpen)) return
				onOpenChange(nextOpen)
			}}
			modal={false}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-8 w-full justify-start gap-2 px-2 font-normal text-sidebar-foreground hover:bg-sidebar-accent/50 focus-visible:bg-sidebar-accent focus-visible:ring-0 data-[state=open]:bg-sidebar-accent"
					data-testid="sidebar-collapsed-my-chats"
				>
					<MessageCircle size={16} className="shrink-0" />
					<span className="min-w-0 flex-1 truncate text-left text-sm leading-5">
						{t("chats.myChats")}
					</span>
					<ChevronRight size={16} className="shrink-0" />
				</Button>
			</PopoverTrigger>
			{/* Match workspace project popovers; mount the list only when this submenu opens. */}
			<PopoverContent
				side="right"
				align="center"
				sideOffset={8}
				collisionPadding={{ top: 12, right: 12, bottom: 32, left: 12 }}
				className="flex max-h-[min(70dvh,640px,var(--radix-popover-content-available-height))] w-[240px] flex-col p-1 shadow-xs"
				data-testid="sidebar-collapsed-my-chats-popover"
			>
				<div className="group/chat-heading flex h-8 shrink-0 items-center rounded-md px-2">
					<span className="min-w-0 flex-1 truncate text-sm font-normal leading-5 text-sidebar-foreground">
						{t("chats.myChats")}
					</span>
					<MagicTooltip title={t("chats.newChat")} disabled={busy}>
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={t("chats.newChat")}
							disabled={busy}
							className="h-7 w-0 shrink-0 overflow-hidden p-0 transition-[width] group-focus-within/chat-heading:w-7 group-hover/chat-heading:w-7 no-hover:w-7"
							onClick={() => void listRef.current?.create()}
							data-testid="sidebar-collapsed-my-chats-add"
						>
							<Plus size={16} />
						</Button>
					</MagicTooltip>
				</div>
				<ChatsSubMenu
					ref={listRef}
					standalone
					workspace
					active={open}
					viewportMaxHeight="min(calc(70dvh - 48px), 592px, calc(var(--radix-popover-content-available-height) - 48px))"
					onBusyChange={setBusy}
					onSelect={onSelect}
				/>
			</PopoverContent>
		</Popover>
	)
}
