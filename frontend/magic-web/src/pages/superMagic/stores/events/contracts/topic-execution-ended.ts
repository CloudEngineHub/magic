import type { SuperMagicEventMessageRef, SuperMagicEventMeta } from "../common"

/** Topic execution terminal statuses; a message Final may carry one of these statuses. */
export type TopicExecutionEndedStatus = "finished" | "error" | "suspended"

/** Topic-level execution terminal event emitted once per Topic execution generation. */
export interface TopicExecutionEndedEvent {
	type: "topic.execution.ended"
	meta: SuperMagicEventMeta
	payload: {
		status: TopicExecutionEndedStatus
		/** Stable identity for this Topic execution; unlike meta.revision it survives revisions. */
		executionId?: string
		/** Store-local Topic execution generation, incremented only by an admitted live begin. */
		generation?: number
		taskId?: string
		previousStatus?: string
		authority?: "assistant_final" | "topic_status"
		correlationId?: string
		messageSeqId?: string
		triggerMessage?: SuperMagicEventMessageRef & { role: "assistant" }
	}
}
