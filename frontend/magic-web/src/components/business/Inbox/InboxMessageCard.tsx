import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import { cn } from "@/utils/cn"
import InboxMessageIcon from "./InboxMessageIcon"
import { resolveInboxCopy } from "./resolveInboxCopy"
import { inboxStore } from "./store"
import type { InboxMessage } from "./types"
import { useInboxAuthResultCopy } from "./useInboxMessageCopy"

interface InboxMessageCardProps {
	message: InboxMessage
}

const InboxMessageCard = observer(function InboxMessageCard({ message }: InboxMessageCardProps) {
	const { t } = useTranslation("sidebar")
	const copy = resolveInboxCopy(message, inboxStore.catalog?.templates)
	const result = useInboxAuthResultCopy(message)
	const isPendingAuth = message.category === "auth" && message.auth_status === "pending"
	const acting = Boolean(inboxStore.actingIds[message.id])
	const organization = message.payload.organization_name
	const permission = copy.payload.permission
	const points = message.payload.points
	const statusLabel =
		message.auth_status === "accepted"
			? t("inbox.meta.accepted")
			: message.auth_status === "rejected"
				? t("inbox.meta.rejected")
				: message.auth_status === "pending"
					? t("inbox.meta.pending")
					: null

	async function handleAuth(status: "accepted" | "rejected") {
		const outcome = await inboxStore.respondAuth(message.id, status)
		if (!outcome) return
		if (outcome.ok && outcome.expired) {
			magicToast.info(t("inbox.toast.expired"))
			return
		}
		if (outcome.ok) {
			magicToast.info(
				status === "accepted" ? t("inbox.toast.accepted") : t("inbox.toast.rejected"),
			)
			return
		}
		if (outcome.withdrawn) magicToast.info(t("inbox.toast.withdrawn"))
	}

	return (
		<article
			data-testid={`inbox-message-${message.id}`}
			data-inbox-id={message.id}
			data-inbox-category={message.category}
			data-inbox-unread={message.is_unread ? "true" : "false"}
			className={cn(
				"flex gap-3 border-b border-border px-4 py-3",
				message.is_unread && "bg-muted/40",
			)}
		>
			<InboxMessageIcon name={copy.icon} />
			<div className="min-w-0 flex-1">
				<div className="flex items-start gap-2">
					<strong className="min-w-0 flex-1 text-sm font-medium text-foreground">
						{copy.title}
					</strong>
					{message.is_unread ? (
						<span
							data-testid={`inbox-unread-dot-${message.id}`}
							className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive"
							aria-hidden
						/>
					) : null}
				</div>
				{points != null && points !== "" ? (
					<div className="mt-1 text-sm font-medium text-amber-600">
						{t("inbox.pointsAmount", { amount: `+${String(points)}` })}
					</div>
				) : null}
				<p className="mt-1 text-sm leading-5 text-muted-foreground">{copy.body}</p>
				{message.category === "auth" && (organization || permission) ? (
					<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
						<span>{t("inbox.resource.organization")}</span>
						<span className="font-medium text-foreground">
							{organization == null || organization === ""
								? "-"
								: String(organization)}
						</span>
						<span>{t("inbox.resource.permission")}</span>
						<span className="font-medium text-foreground">{permission ?? "-"}</span>
					</div>
				) : null}
				{isPendingAuth ? (
					<div className="mt-3 flex gap-2">
						<Button
							size="sm"
							disabled={acting}
							data-testid={`inbox-accept-${message.id}`}
							onClick={() => {
								void handleAuth("accepted")
							}}
						>
							{t("inbox.auth.accept")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={acting}
							data-testid={`inbox-reject-${message.id}`}
							onClick={() => {
								void handleAuth("rejected")
							}}
						>
							{t("inbox.auth.reject")}
						</Button>
					</div>
				) : null}
				{result ? (
					<p
						data-testid={`inbox-result-${message.id}`}
						className="mt-2 text-sm text-muted-foreground"
					>
						{result}
					</p>
				) : null}
				<div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
					<span>{message.created_at}</span>
					{statusLabel ? <span>{statusLabel}</span> : null}
				</div>
			</div>
		</article>
	)
})

export default InboxMessageCard
