import type { ScheduledTask } from "@/types/scheduledTask"

export function extractChatTopicIdFromExecuteResult(
	response: ScheduledTask.ExecuteResult | null | undefined,
): string | null {
	const chatTopicId = response?.result?.seq?.message?.topic_id?.trim()
	return chatTopicId || null
}
