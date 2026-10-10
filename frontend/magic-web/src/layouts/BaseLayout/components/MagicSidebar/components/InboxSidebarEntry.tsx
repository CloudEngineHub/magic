import { observer } from "mobx-react-lite"
import { MessageSquare } from "lucide-react"
import { useTranslation } from "react-i18next"
import { MagicTooltip } from "@/components/base"
import { Button } from "@/components/shadcn-ui/button"
import InboxUnreadBadge from "@/components/business/Inbox/InboxUnreadBadge"
import { inboxStore, openInbox } from "@/components/business/Inbox/store"
import { useInboxBootstrap } from "@/components/business/Inbox/useInboxBootstrap"
import { cn } from "@/utils/cn"

interface InboxSidebarEntryProps {
	collapsed: boolean
}

const InboxSidebarEntry = observer(function InboxSidebarEntry({
	collapsed,
}: InboxSidebarEntryProps) {
	const { t } = useTranslation("sidebar")
	useInboxBootstrap()
	const label = t("footer.inbox")
	const badge = (
		<InboxUnreadBadge label={inboxStore.unreadTotalLabel} testId="inbox-sidebar-badge" />
	)

	return (
		<MagicTooltip title={collapsed ? label : undefined} placement="right">
			<Button
				type="button"
				variant="ghost"
				size={collapsed ? "icon" : "sm"}
				aria-label={label}
				data-testid="inbox-sidebar-entry"
				className={cn(
					"h-8 shrink-0 gap-2 text-[13px] font-normal leading-5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground",
					collapsed ? "relative w-8" : "w-full justify-start px-2",
				)}
				onClick={openInbox}
			>
				<MessageSquare className="size-4" />
				{collapsed ? (
					inboxStore.unreadTotalLabel ? (
						<span className="absolute -right-0.5 -top-0.5">{badge}</span>
					) : null
				) : (
					<>
						<span className="min-w-0 flex-1 truncate text-left">{label}</span>
						{badge}
					</>
				)}
			</Button>
		</MagicTooltip>
	)
})

export default InboxSidebarEntry
