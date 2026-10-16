import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import { Check, X } from "lucide-react"
import { Link } from "react-router-dom"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import { cn } from "@/utils/cn"
import { RouteName } from "@/routes/constants"
import { getRoutePath } from "@/routes/history/helpers"
import { getInboxProjectId } from "./getInboxProjectId"
import InboxMessageIcon from "./InboxMessageIcon"
import { resolveInboxCopy } from "./resolveInboxCopy"
import { inboxStore } from "./store"
import type { InboxMessage } from "./types"
import { useInboxAuthResultCopy } from "./useInboxMessageCopy"

interface InboxMessageCardProps {
	message: InboxMessage
	mobile?: boolean
}

const InboxMessageCard = observer(function InboxMessageCard({
	message,
	mobile = false,
}: InboxMessageCardProps) {
	const { t } = useTranslation("sidebar")
	const copy = resolveInboxCopy(message, inboxStore.catalog?.templates)
	const result = useInboxAuthResultCopy(message)
	const isPendingAuth = message.category === "auth" && message.auth_status === "pending"
	const acting = Boolean(inboxStore.actingIds[message.id])
	const organization = message.payload.organization_name
	const permission = copy.payload.permission
	const points = message.payload.points
	const projectId = getInboxProjectId(message)
	const projectPath = projectId
		? getRoutePath({
				name: RouteName.SuperWorkspaceProjectState,
				params: { projectId: encodeURIComponent(projectId) },
			})
		: null
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
				"relative flex shrink-0 gap-3 bg-white dark:bg-background",
				// Mobile separators start at the text column; desktop messages are separate cards.
				mobile
					? "px-4 py-[17px] [&+article]:before:absolute [&+article]:before:inset-x-4 [&+article]:before:left-[68px] [&+article]:before:top-0 [&+article]:before:border-t [&+article]:before:border-[#eef0f3] dark:[&+article]:before:border-border"
					: "rounded-[12px] border border-[#ebecef] p-3.5 dark:border-border",
				!mobile && message.is_unread && "border-[#e3e5eb] dark:border-border",
			)}
		>
			<InboxMessageIcon name={copy.icon} mobile={mobile} />
			<div className="min-w-0 flex-1">
				<div className="flex items-start gap-2">
					<strong
						className={cn(
							"min-w-0 flex-1 break-words text-[15px] leading-[1.45] text-[#242832] dark:text-foreground",
							mobile ? "font-semibold" : "font-medium",
						)}
					>
						{copy.title}
					</strong>
					{!mobile && statusLabel ? (
						<span
							className={cn(
								"shrink-0 rounded-full bg-[#f1f2f4] px-1.5 py-0.5 text-[11px] leading-4 text-[#747c8d] dark:bg-muted dark:text-muted-foreground",
								message.auth_status === "accepted" &&
									"bg-[#eaf7f1] text-[#278163] dark:bg-emerald-500/10 dark:text-emerald-400",
							)}
						>
							{statusLabel}
						</span>
					) : null}
					{message.is_unread ? (
						<span
							data-testid={`inbox-unread-dot-${message.id}`}
							className={cn(
								"size-1.5 shrink-0 rounded-full bg-[#f04438]",
								mobile ? "mt-[7px]" : "mt-1.5",
							)}
							aria-hidden
						/>
					) : null}
				</div>
				{points != null && points !== "" ? (
					<div className="mt-[7px] text-base font-medium tabular-nums leading-[1.4] text-[#258263] dark:text-emerald-400">
						{t("inbox.pointsAmount", { amount: `+${String(points)}` })}
					</div>
				) : null}
				<p className="mt-[5px] break-words text-[13px] leading-[1.55] text-[#7a8394] dark:text-muted-foreground">
					{copy.body}
				</p>
				{projectPath && (
					<Link
						to={projectPath}
						className="mt-1.5 inline-block rounded-sm text-[13px] text-primary underline underline-offset-4 hover:text-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						onClick={(event) => {
							// Keep the inbox open in this tab when a modifier opens another tab/window.
							if (
								event.button === 0 &&
								!event.metaKey &&
								!event.ctrlKey &&
								!event.shiftKey &&
								!event.altKey
							) {
								inboxStore.close()
							}
						}}
					>
						{t("inbox.viewProject")}
					</Link>
				)}
				{message.category === "auth" && (organization || permission) ? (
					<div
						className={cn(
							"grid grid-cols-2 gap-x-3 gap-y-1.5 text-[#7a8394] dark:text-muted-foreground",
							mobile
								? "mt-[11px] border-t border-[#eef0f3] pt-2.5 text-xs dark:border-border"
								: "mt-2.5 rounded-[8px] bg-[#f7f8fa] px-2.5 py-[9px] text-[11px] dark:bg-muted",
						)}
					>
						<span>{t("inbox.resource.organization")}</span>
						<span className="break-words text-right font-medium text-foreground">
							{organization == null || organization === ""
								? "-"
								: String(organization)}
						</span>
						<span>{t("inbox.resource.permission")}</span>
						<span className="break-words text-right font-medium text-foreground">
							{permission ?? "-"}
						</span>
					</div>
				) : null}
				{isPendingAuth ? (
					<div className={cn("flex gap-2", mobile ? "mt-[13px]" : "mt-[11px]")}>
						<Button
							size="sm"
							className={cn(
								"rounded-[8px] bg-[#5968df] px-3.5 text-[13px] font-normal text-white hover:bg-[#4f5dce]",
								mobile ? "h-[38px] min-w-24" : "h-[34px] min-w-[70px]",
							)}
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
							className={cn(
								"rounded-[8px] border-[#e0e2e7] px-3.5 text-[13px] font-normal shadow-none dark:border-border",
								mobile ? "h-[38px] min-w-[84px]" : "h-[34px] min-w-[70px]",
							)}
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
						className={cn(
							"mt-[11px] flex items-center gap-1.5 text-xs leading-normal text-[#747c8d] dark:text-muted-foreground",
							message.auth_status === "accepted" &&
								"text-[#278163] dark:text-emerald-400",
						)}
					>
						{message.auth_status === "accepted" ? (
							<Check
								aria-hidden
								className="size-4 shrink-0 rounded-full bg-[#eaf7f1] dark:bg-emerald-500/10"
							/>
						) : message.auth_status === "rejected" ? (
							<X
								aria-hidden
								className="size-4 shrink-0 rounded-full bg-[#f0f1f4] dark:bg-muted"
							/>
						) : null}
						{result}
					</p>
				) : null}
				<div className="mt-[9px] text-[11px] tabular-nums tracking-[0.1px] text-[#9197a4] dark:text-muted-foreground">
					<span>{message.created_at}</span>
				</div>
			</div>
		</article>
	)
})

export default InboxMessageCard
