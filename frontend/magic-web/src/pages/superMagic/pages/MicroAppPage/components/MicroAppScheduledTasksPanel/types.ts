import type { ScheduledTask } from "@/types/scheduledTask"

export interface MicroAppScheduledTaskContext {
	workspaceId: string
	projectId: string
	workspaceName?: string
	projectName?: string
	topicId?: string
}

export interface MicroAppScheduledTasksModifyProps {
	mode: "create" | "edit"
	context: MicroAppScheduledTaskContext
	initialValues?: Partial<ScheduledTask.UpdateTask>
	onSubmit?: (values: ScheduledTask.UpdateTask) => void
	onClose?: () => void
}
