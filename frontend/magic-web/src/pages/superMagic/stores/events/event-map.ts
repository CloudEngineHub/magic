import type { MessageCommittedEvent } from "./contracts/message-committed"
import type { MessageStreamDeltaEvent } from "./contracts/message-stream-delta"
import type { MessageStreamEndedEvent } from "./contracts/message-stream-ended"
import type { MessageStreamStartedEvent } from "./contracts/message-stream-started"
import type { ToolCallSettledEvent } from "./contracts/tool-call-settled"
import type { TaskCompletedEvent } from "./contracts/task-completed"
import type { TopicExecutionEndedEvent } from "./contracts/topic-execution-ended"

/** SuperMagic Store 对外发布的完整事件名到数据契约映射。 */
export interface SuperMagicEventMap {
	"message.stream.started": MessageStreamStartedEvent
	"message.stream.delta": MessageStreamDeltaEvent
	"message.stream.ended": MessageStreamEndedEvent
	"message.committed": MessageCommittedEvent
	"topic.execution.ended": TopicExecutionEndedEvent
	"toolCall.settled": ToolCallSettledEvent
	"task.completed": TaskCompletedEvent
}

/** SuperMagic Store 支持订阅的精确事件名。 */
export type SuperMagicEventType = keyof SuperMagicEventMap

/** Store events exposed through the typed subscription surface. */
export type SuperMagicEvent = SuperMagicEventMap[SuperMagicEventType]
