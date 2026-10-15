import { observer } from "mobx-react-lite"
import { MessageSquare } from "lucide-react"
import { useTranslation } from "react-i18next"
import InboxUnreadBadge from "@/components/business/Inbox/InboxUnreadBadge"
import { inboxStore, openInbox } from "@/components/business/Inbox/store"
import { useInboxBootstrap } from "@/components/business/Inbox/useInboxBootstrap"
import { cn } from "@/utils/cn"

interface InboxMobileSidebarEntryProps {
	testIdPrefix: string
	rowClassName: string
}

const InboxMobileSidebarEntry = observer(function InboxMobileSidebarEntry({
	testIdPrefix,
	rowClassName,
}: InboxMobileSidebarEntryProps) {
	const { t } = useTranslation("sidebar")
	useInboxBootstrap()

	return (
		<button
			type="button"
			onClick={openInbox}
			data-testid={`${testIdPrefix}-nav-inbox`}
			className={cn(rowClassName, "justify-between")}
		>
			<span className="flex min-w-0 items-center gap-2">
				<MessageSquare className="size-4 shrink-0 text-foreground" aria-hidden />
				<span className="leading-6">{t("footer.inbox")}</span>
			</span>
			<InboxUnreadBadge
				label={inboxStore.unreadTotalLabel}
				className="h-5 bg-[#ff3b30] px-[7px]"
				testId="inbox-mobile-entry-badge"
			/>
		</button>
	)
})

export default InboxMobileSidebarEntry
