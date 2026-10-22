import { observer } from "mobx-react-lite"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { Spinner } from "@/components/shadcn-ui/spinner"
import { cn } from "@/utils/cn"
import { groupInboxMessages } from "./groupInboxMessages"
import InboxMessageCard from "./InboxMessageCard"
import { inboxStore } from "./store"
import { useInboxAutoRead } from "./useInboxAutoRead"

const InboxMessageList = observer(function InboxMessageList({
	mobile = false,
}: {
	mobile?: boolean
}) {
	const { t } = useTranslation("sidebar")
	const [root, setRoot] = useState<HTMLDivElement | null>(null)
	const messages = inboxStore.visibleMessages
	const grouped = inboxStore.activeTab === "all"
	const onRead = useCallback((id: Parameters<typeof inboxStore.markRead>[0]) => {
		void inboxStore.markRead(id)
	}, [])
	const revision = `${inboxStore.activeTab}|${messages
		.map((message) => `${message.id}:${message.is_unread}`)
		.join("|")}|${inboxStore.catalog?.catalog_version ?? 0}`

	useInboxAutoRead({
		enabled: Boolean(root) && messages.length > 0,
		root,
		revision,
		onRead,
	})

	return (
		<div
			ref={setRoot}
			data-testid="inbox-feed"
			className={cn(
				"flex min-h-0 flex-1 flex-col overflow-y-auto bg-white dark:bg-background",
				!mobile && "gap-[9px] px-[18px] pb-[26px] pt-4",
			)}
			onScroll={(event) => {
				const node = event.currentTarget
				if (node.scrollHeight - node.scrollTop - node.clientHeight < 96) {
					void inboxStore.loadMore()
				}
			}}
		>
			{inboxStore.listLoading && messages.length === 0 ? (
				<div
					className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground"
					data-testid="inbox-loading"
					role="status"
				>
					<Spinner className="text-muted-foreground" />
					<span>{t("inbox.loading")}</span>
				</div>
			) : messages.length === 0 ? (
				<div
					data-testid="inbox-empty"
					className="flex flex-1 flex-col items-center justify-center p-6 text-sm text-muted-foreground"
				>
					{t("inbox.empty")}
				</div>
			) : grouped ? (
				groupInboxMessages(messages).map((group) => (
					<section
						key={group.key}
						data-testid={`inbox-group-${group.key}`}
						className={cn("shrink-0", !mobile && "flex flex-col gap-[9px]")}
					>
						<div
							className={cn(
								"text-[#8a91a0] dark:text-muted-foreground",
								mobile
									? "bg-[#f7f8fa] px-4 pb-2 pt-3.5 text-xs dark:bg-muted"
									: "px-1 pb-1.5 pt-[3px] text-[13px]",
							)}
						>
							{group.key === "today"
								? t("inbox.groups.today")
								: group.key === "yesterday"
									? t("inbox.groups.yesterday")
									: t("inbox.groups.earlier")}
						</div>
						{group.messages.map((message) => (
							<InboxMessageCard key={message.id} message={message} mobile={mobile} />
						))}
					</section>
				))
			) : (
				messages.map((message) => (
					<InboxMessageCard key={message.id} message={message} mobile={mobile} />
				))
			)}
			{inboxStore.listLoadingMore ? (
				<div
					className="flex items-center justify-center gap-2 px-7 py-4 text-xs text-muted-foreground"
					data-testid="inbox-loading-more"
					role="status"
				>
					<Spinner className="size-4 text-muted-foreground" />
					<span>{t("inbox.loading")}</span>
				</div>
			) : null}
		</div>
	)
})

export default InboxMessageList
