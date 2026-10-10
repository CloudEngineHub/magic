import dayjs, { type Dayjs } from "dayjs"
import type { InboxMessage } from "./types"

export type InboxDateGroup = "today" | "yesterday" | "earlier"

export function getInboxDateGroup(iso: string, now: Dayjs = dayjs()): InboxDateGroup {
	const time = dayjs(iso)
	if (time.isSame(now, "day")) return "today"
	if (time.isSame(now.subtract(1, "day"), "day")) return "yesterday"
	return "earlier"
}

export function groupInboxMessages(messages: InboxMessage[], now: Dayjs = dayjs()) {
	const buckets: Record<InboxDateGroup, InboxMessage[]> = {
		today: [],
		yesterday: [],
		earlier: [],
	}

	messages.forEach((message) => {
		buckets[getInboxDateGroup(message.created_at, now)].push(message)
	})

	return (["today", "yesterday", "earlier"] as const)
		.map((key) => ({ key, messages: buckets[key] }))
		.filter((group) => group.messages.length > 0)
}
