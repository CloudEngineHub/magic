import type { TFunction } from "i18next"
import { describe, expect, it } from "vitest"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { ScheduledTask } from "@/types/scheduledTask"
import { applyMicroAppScheduledTaskContext, formatTaskSchedule } from "../utils"

const t = ((key: string, options?: Record<string, unknown>) => {
	if (key.startsWith("format.weekDay.")) return `weekday-${key.at(-1)}`
	return `${key}:${JSON.stringify(options || {})}`
}) as TFunction

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
		const task = {
			message_content: {
				content: "{}",
				extra: { super_agent: { topic_pattern: TopicMode.General, chat_mode: "normal" } },
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
				extra: { super_agent: { topic_pattern: TopicMode.MicroApp, chat_mode: "normal" } },
			},
		})
	})
})
