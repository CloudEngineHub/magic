import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { ScheduledTask } from "@/types/scheduledTask"
import { serializeScheduledTaskModel } from "@/components/business/AccountSetting/pages/ScheduledTasks/utils"
import { applyMicroAppScheduledTaskContext, formatTaskSchedule } from "../utils"

const t = ((key: string, options?: Record<string, unknown>) => {
	if (key.startsWith("format.weekDay.")) return `weekday-${key.at(-1)}`
	return `${key}:${JSON.stringify(options || {})}`
}) as TFunction

describe("serializeScheduledTaskModel", () => {
	it("keeps only runtime identity and edit-time display fields", () => {
		expect(
			serializeScheduledTaskModel({
				id: "database-id",
				group_id: "group-id",
				model_id: "video-model",
				model_name: "Video model",
				provider_model_id: "provider-model",
				model_description: "Description",
				model_icon: "https://example.com/model.png",
				model_status: "normal",
				sort: 1,
				tags: [],
			}),
		).toEqual({
			model_id: "video-model",
			model_name: "Video model",
			model_icon: "https://example.com/model.png",
		})
	})

	it("omits optional display fields when they are empty", () => {
		expect(
			serializeScheduledTaskModel({
				id: "database-id",
				group_id: "group-id",
				model_id: "image-model",
				model_name: "",
				provider_model_id: "provider-model",
				model_description: "",
				model_icon: "",
				model_status: "normal",
				sort: 0,
			}),
		).toEqual({ model_id: "image-model" })
	})
})

describe("formatTaskSchedule", () => {
	it("formats weekly tasks with a localized weekday", () => {
		expect(
			formatTaskSchedule(
				{
					type: ScheduledTask.ScheduleType.Weekly,
					day: "0",
					time: "09:30",
				},
				t,
			),
		).toBe('scheduleTask.weeklyAt:{"day":"weekday-7","time":"09:30"}')
	})

	it("falls back when the schedule is missing", () => {
		expect(formatTaskSchedule(undefined, t)).toBe("scheduleTask.noSchedule:{}")
	})

	it("forces legacy task payloads to use the micro-app mode", () => {
		const imageModel = { model_id: "image-model" }
		const videoModel = { model_id: "video-model" }
		const task = {
			message_content: {
				content: "{}",
				extra: {
					super_agent: {
						topic_pattern: TopicMode.General,
						chat_mode: "normal",
						image_model: imageModel,
						video_model: videoModel,
					},
				},
			},
			message_type: "rich_text",
			enabled: 1,
			task_name: "Task",
			time_config: { type: ScheduledTask.ScheduleType.Once, time: "10:00" },
			topic_id: "",
			workspace_id: "old-workspace",
			project_id: "old-project",
		}

		expect(
			applyMicroAppScheduledTaskContext(task, {
				workspaceId: "workspace-1",
				projectId: "project-1",
			}),
		).toMatchObject({
			workspace_id: "workspace-1",
			project_id: "project-1",
			message_content: {
				extra: {
					super_agent: {
						topic_pattern: TopicMode.MicroApp,
						chat_mode: "normal",
						image_model: imageModel,
						video_model: videoModel,
					},
				},
			},
		})
	})
})
