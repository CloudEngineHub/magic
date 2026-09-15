import type { SuperMagicEventMessageRef, SuperMagicEventMeta } from "../common"

/** 工具调用可被订阅方视为已结算的状态。 */
export type ToolCallSettledStatus = "finished" | "error" | "suspended" | "response_missing"

/** canonical toolResponseMap 出现新的终态结算后发布的事件契约。 */
export interface ToolCallSettledEvent {
	/** 精确事件名。 */
	type: "toolCall.settled"
	/** 工具调用实体的顺序、版本与定位信息。 */
	meta: SuperMagicEventMeta & {
		/** 规范工具调用 ID；只允许映射自非空 tool.id。 */
		toolCallId: string
	}
	/** 工具调用及其结算结果的紧凑快照。 */
	payload: {
		/** 被结算的规范工具调用。 */
		toolCall: {
			/** 非空 tool.id，也是 toolResponseMap 的唯一规范 key。 */
			id: string
			/** 工具函数名；响应未携带名称时可省略。 */
			name?: string
			/** 工具调用在所属 Assistant tool_calls 中的索引；无法定位时可省略。 */
			/** 该值由规范 tool.id 在所属 Assistant tool_calls 中的位置映射，不使用 tool_call_id 推导。 */
			index?: number
		}
		/** 最终或弱终态响应摘要。 */
		response: {
			/** 工具响应消息的紧凑引用；Store 合成弱响应时可省略。 */
			message?: SuperMagicEventMessageRef
			/** 工具响应状态。 */
			status: ToolCallSettledStatus
			/** 工具响应动作标识。 */
			action?: string
			/** 工具响应备注。 */
			remark?: string
			/** 业务方解析所需的响应详情；不包含附件数组或累计流式 arguments。 */
			detail?: unknown
		}
		/** strong 表示真实工具响应，weak 表示 Store 合成的 response_missing。 */
		/** status=response_missing 映射为 weak，其余允许发布的终态映射为 strong。 */
		strength: "strong" | "weak"
		/** 当前结算是否允许被后到的真实工具响应替换。 */
		/** 仅 response_missing 弱结算映射为 true。 */
		replaceable: boolean
	}
}
