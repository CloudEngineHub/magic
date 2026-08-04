import type { MessageCommittedEvent } from "./contracts/message-committed"
import type { MessageStreamDeltaEvent } from "./contracts/message-stream-delta"
import type { MessageStreamEndedEvent } from "./contracts/message-stream-ended"
import type { MessageStreamStartedEvent } from "./contracts/message-stream-started"
import type { ToolCallSettledEvent } from "./contracts/tool-call-settled"
import type { TaskCompletedEvent } from "./contracts/task-completed"
import type { TopicExecutionEndedEvent } from "./contracts/topic-execution-ended"

/** SuperMagic Store 对外发布的完整事件名到数据契约映射。 */
export interface SuperMagicEventMap {
	/**
	 * Marks the start of a new observable stream generation.
	 * Subscriber callbacks run synchronously after the Store accepts that generation's first
	 * ordered chunk, including metadata-only chunks.
	 */
	"message.stream.started": MessageStreamStartedEvent
	/**
	 * Reports the canonical content, reasoning, or tool-call increment accepted for an active stream.
	 * Subscriber callbacks run synchronously after the ordered chunk updates StreamState;
	 * metadata-only chunks do not trigger this event.
	 */
	"message.stream.delta": MessageStreamDeltaEvent
	/**
	 * Marks a distinct end boundary for the current stream generation.
	 * Subscriber callbacks run synchronously after the Store records a finish reason,
	 * authoritative Final, restart, suspension, revocation, or recovery replacement.
	 */
	"message.stream.ended": MessageStreamEndedEvent
	/**
	 * Reports a semantically meaningful insert or update to the canonical message collection.
	 * Subscriber callbacks run synchronously after the canonical write is recorded and before
	 * task or Topic lifecycle events derived from the same commit.
	 */
	"message.committed": MessageCommittedEvent
	/**
	 * Reports the terminal status of one Topic execution generation.
	 * Subscriber callbacks run synchronously when the first publishable terminal confirmation
	 * closes the generation; duplicate, historical, and silent recovery confirmations do not fire.
	 */
	"topic.execution.ended": TopicExecutionEndedEvent
	/**
	 * Reports a new terminal settlement for a canonical tool call.
	 * Subscriber callbacks run synchronously after toolResponseMap records the settlement, or when
	 * a real terminal response replaces a weak response_missing settlement; duplicates do not fire.
	 */
	"toolCall.settled": ToolCallSettledEvent
	/**
	 * Reports the task-level result carried by a valid finish_task protocol message.
	 * Subscriber callbacks run synchronously after a live WebSocket finish_task message is committed
	 * and deduplicated; history, recovery, and polling only seed the baseline without firing.
	 */
	"task.completed": TaskCompletedEvent
}

/** SuperMagic Store 支持订阅的精确事件名。 */
export type SuperMagicEventType = keyof SuperMagicEventMap

/** Store events exposed through the typed subscription surface. */
export type SuperMagicEvent = SuperMagicEventMap[SuperMagicEventType]
