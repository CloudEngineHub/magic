import type { SuperMagicEventMeta } from "../common"

/** 当前流代次结束的规范原因。 */
export type MessageStreamEndReason =
	| "finish_reason"
	| "authoritative_final"
	| "restart"
	| "suspended"
	| "revoked"
	| "recovery_replaced"

/** Store 关闭某一流代次后发布的事件契约。 */
export interface MessageStreamEndedEvent {
	/** 精确事件名。 */
	type: "message.stream.ended"
	/** 流实体的顺序、版本与定位信息。 */
	meta: SuperMagicEventMeta & {
		/** 已结束流的 correlation_id。 */
		correlationId: string
		/** 已结束的流代次。 */
		streamGeneration: number
	}
	/** 流结束边界及其后续 canonical 状态。 */
	payload: {
		/** 导致本代流结束的规范原因。 */
		reason: MessageStreamEndReason
		/** chunk 协议提供的原始 finish_reason；非 finish_reason 边界可省略。 */
		finishReason?: string | null
		/** 是否仍需等待 IM/HTTP Final 消息确认 canonical message。 */
		/** finish_reason 通常映射为 true；权威 Final、撤回和替换映射为 false。 */
		awaitingCanonicalMessage: boolean
		/** restart 时接替旧流的新代次。 */
		/** 该值由旧代次加一计算，仅 restart 边界出现。 */
		replacedByGeneration?: number
	}
}
