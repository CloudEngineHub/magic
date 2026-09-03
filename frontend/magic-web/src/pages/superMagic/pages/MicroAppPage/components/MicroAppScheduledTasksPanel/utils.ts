import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { ScheduledTask } from "@/types/scheduledTask"
import type { MicroAppScheduledTaskContext } from "./types"

export { formatTaskSchedule } from "@/pages/superMagic/components/ScheduledTasks/utils"

/** Keeps every micro-app task submission bound to its owning workspace and project. */
export function applyMicroAppScheduledTaskContext(
	task: ScheduledTask.UpdateTask,
	context: MicroAppScheduledTaskContext,
): ScheduledTask.UpdateTask {
	return {
		...task,
		workspace_id: context.workspaceId,
		project_id: context.projectId,
		message_content: {
			...task.message_content,
			extra: {
				...task.message_content.extra,
				super_agent: {
					...task.message_content.extra?.super_agent,
					topic_pattern: TopicMode.MicroApp,
				},
			},
		},
	}
}
