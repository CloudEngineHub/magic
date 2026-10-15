import type { NotificationListItem } from "@/apis/modules/notifications"
import type { InboxIconName, InboxMessage } from "./types"

const ICON_BY_TYPE: Record<string, InboxIconName> = {
	payment_success: "payment",
	points_referral_reward: "points",
	points_manual_reward: "points",
	task_finished: "success",
	task_failed: "alert",
	project_shared: "project",
	file_shared: "file",
	skill_approved: "spark",
	agent_approved: "robot",
	project_invitation: "users",
	agent_invitation: "robot",
	skill_invitation: "spark",
}

export function inboxIconForType(type: string): InboxIconName {
	return ICON_BY_TYPE[type] ?? "share"
}

export function mapNotificationItem(item: NotificationListItem): InboxMessage {
	// Handling an invitation clears its dot even when the API read state lags behind.
	const isHandledAuthorization =
		item.category === "authorization" &&
		(item.action_status === "accepted" || item.action_status === "rejected")
	return {
		id: item.notification_id,
		category: item.category === "authorization" ? "auth" : "system",
		type: item.type,
		template_version: item.template_version,
		payload: item.payload ?? {},
		created_at: item.created_at,
		is_unread: item.read_status === "unread" && !isHandledAuthorization,
		auth_status:
			item.action_status === "pending" ||
			item.action_status === "accepted" ||
			item.action_status === "rejected"
				? item.action_status
				: undefined,
	}
}

export function toApiCategory(tab: "all" | "system" | "auth") {
	if (tab === "auth") return "authorization" as const
	return tab
}
