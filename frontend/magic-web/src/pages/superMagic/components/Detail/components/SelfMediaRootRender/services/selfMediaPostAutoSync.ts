import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { ModelItem } from "@/pages/superMagic/components/MessageEditor/types"
import { ScheduledTask } from "@/types/scheduledTask"
import type { SelfMediaPlatform } from "../../../types"
import type { SelfMediaPost } from "../types"
import {
	SELF_MEDIA_POST_PUBLISH_DATA_TOPIC_PATTERN,
	buildFolderMention,
	buildSelfMediaPostPublishDataRefreshContent,
	titleOf,
} from "./selfMediaPostPublishDataRefresh"

export const DEFAULT_SELF_MEDIA_AUTO_SYNC_TIME_CONFIG: ScheduledTask.TimeConfig = {
	type: ScheduledTask.ScheduleType.Daily,
	time: "09:00",
}

export interface BuildSelfMediaPostAutoSyncTaskDataParams {
	workspaceId: string
	projectId: string
	platform: SelfMediaPlatform
	publishedUrl: string
	post: SelfMediaPost
	postDirectoryItem: AttachmentItem
	timeConfig?: ScheduledTask.TimeConfig
	model?: ModelItem | null
	enabled?: 0 | 1
	taskId?: string
}

export function buildSelfMediaPostAutoSyncTaskData({
	workspaceId,
	projectId,
	platform,
	publishedUrl,
	post,
	postDirectoryItem,
	timeConfig = DEFAULT_SELF_MEDIA_AUTO_SYNC_TIME_CONFIG,
	model,
	enabled = 1,
	taskId,
}: BuildSelfMediaPostAutoSyncTaskDataParams): ScheduledTask.UpdateTask {
	const content = buildSelfMediaPostPublishDataRefreshContent({
		platform,
		publishedUrl,
		post,
		postDirectoryItem,
	})
	const folderMention = buildFolderMention(postDirectoryItem)

	return {
		...(taskId ? { id: taskId } : {}),
		task_name: `[文章数据同步] ${titleOf(post)}`,
		workspace_id: workspaceId,
		project_id: projectId,
		topic_id: "",
		time_config: timeConfig,
		enabled,
		message_type: "rich_text",
		deadline: "",
		message_content: {
			content: JSON.stringify(content),
			instructs: [{ value: "plan", instruction: null }],
			extra: {
				super_agent: {
					mentions: [folderMention],
					input_mode: "plan",
					chat_mode: "normal",
					topic_pattern: SELF_MEDIA_POST_PUBLISH_DATA_TOPIC_PATTERN,
					enable_web_search: true,
					...(model ? { model } : {}),
					dynamic_params: {
						message_version: "v2",
					},
				},
			},
		},
	}
}

export async function saveSelfMediaPostAutoSyncTask(
	taskData: ScheduledTask.UpdateTask,
	taskId?: string,
): Promise<string | undefined> {
	const { ScheduledTaskApi } = await import("@/apis")
	if (taskId) {
		await ScheduledTaskApi.updateScheduledTask(taskId, taskData)
		return taskId
	}

	const response = await ScheduledTaskApi.createScheduledTask(taskData)
	return extractScheduledTaskId(response)
}

export async function disableSelfMediaPostAutoSyncTask(
	taskId: string,
	taskData: ScheduledTask.UpdateTask,
) {
	const { ScheduledTaskApi } = await import("@/apis")
	await ScheduledTaskApi.updateScheduledTask(taskId, {
		...taskData,
		id: taskId,
		enabled: 0,
	})
}

function extractScheduledTaskId(response: unknown): string | undefined {
	if (!response || typeof response !== "object") return undefined
	const record = response as Record<string, unknown>
	if (typeof record.id === "string") return record.id
	const data = record.data
	if (
		data &&
		typeof data === "object" &&
		typeof (data as Record<string, unknown>).id === "string"
	) {
		return (data as Record<string, string>).id
	}
	return undefined
}
