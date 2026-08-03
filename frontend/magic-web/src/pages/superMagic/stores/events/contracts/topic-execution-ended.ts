import type { SuperMagicEventMessageRef, SuperMagicEventMeta } from "../common"

/** Topic execution terminal statuses; a message Final may carry one of these statuses. */
export type TopicExecutionEndedStatus = "finished" | "error" | "suspended"

/** Topic-level execution terminal event emitted once per Topic execution generation. */
export interface TopicExecutionEndedEvent {
	type: "topic.execution.ended"
	meta: SuperMagicEventMeta
	payload: {
		status: TopicExecutionEndedStatus
		triggerMessage?: SuperMagicEventMessageRef & { role: "assistant" }
	}
}
