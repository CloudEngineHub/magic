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
	}
}
