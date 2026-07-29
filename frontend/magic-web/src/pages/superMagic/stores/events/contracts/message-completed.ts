import type { SuperMagicEventMessageRef, SuperMagicEventMeta } from "../common"

/** Assistant 消息可对外观察的终态。 */
export type MessageCompletedStatus = "finished" | "error" | "suspended" | "revoked"

/** Assistant canonical 消息进入新的终态后发布的事件契约。 */
export interface MessageCompletedEvent {
	/** 精确事件名。 */
	type: "message.completed"
	/** Assistant 消息实体的顺序、版本与定位信息。 */
	meta: SuperMagicEventMeta
	/** 已确认的 Assistant 终态。 */
	payload: {
		/** 不包含完整 debug/content/attachments 的规范消息引用。 */
		message: SuperMagicEventMessageRef & { role: "assistant" }
		/** 当前新进入的规范终态。 */
		status: MessageCompletedStatus
		/** 进入当前终态前的 canonical 状态；首次插入消息时可省略。 */
		/** 该值由 transition ledger 保存的上一终态映射；同终态重复到达不会再次发布事件。 */
		previousStatus?: string
	}
}
