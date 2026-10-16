import { observer } from "mobx-react-lite"
import { Mail } from "lucide-react"
import { useTranslation } from "react-i18next"
import { MagicTooltip } from "@/components/base"
import { Button } from "@/components/shadcn-ui/button"
import { inboxStore, openInbox } from "@/components/business/Inbox/store"
import { useInboxBootstrap } from "@/components/business/Inbox/useInboxBootstrap"

interface InboxSidebarEntryProps {
	collapsed: boolean
}

const InboxSidebarEntry = observer(function InboxSidebarEntry({
	collapsed,
}: InboxSidebarEntryProps) {
	const { t } = useTranslation("sidebar")
	useInboxBootstrap()
	const label = t("footer.inbox")

	return (
		<MagicTooltip
			title={label}
			placement={collapsed ? "right" : "top"}
			disabled={inboxStore.visible}
		>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={label}
				data-testid="inbox-sidebar-entry"
				className="relative text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
				onClick={openInbox}
			>
				<Mail className="size-4" />
				{inboxStore.unreadTotalLabel && (
					<span
						aria-hidden="true"
						data-testid="inbox-sidebar-badge"
						className="absolute right-1 top-1 size-2 rounded-full border-2 border-sidebar bg-destructive"
					/>
				)}
			</Button>
		</MagicTooltip>
	)
})

export default InboxSidebarEntry
