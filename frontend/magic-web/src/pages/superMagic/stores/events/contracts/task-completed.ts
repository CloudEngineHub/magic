import type { SuperMagicEventMeta } from "../common"

/** A task-level result confirmed by the dedicated finish_task protocol message. */
export interface TaskCompletedEvent {
	type: "task.completed"
	meta: SuperMagicEventMeta & {
		correlationId: string
		appMessageId: string
		taskId: string
	}
	payload: {
		source: "finish_task"
		result: {
			detail?: unknown
			attachments: unknown[]
		}
	}
}
