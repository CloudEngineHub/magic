import type { SuperMagicEventMeta, SuperMagicToolCallDelta } from "../common"

/** Store 接受会改变 canonical 流内容的有序 chunk 后发布的事件契约。 */
export interface MessageStreamDeltaEvent {
	/** 精确事件名。 */
	type: "message.stream.delta"
	/** 流实体的顺序、版本与定位信息。 */
	meta: SuperMagicEventMeta & {
		/** 当前流的 correlation_id。 */
		correlationId: string
		/** 当前流代次，从 1 开始。 */
		streamGeneration: number
	}
	/** 当前 chunk 实际接受的增量数据。 */
	payload: {
		/** 当前有序 chunk 索引。 */
		chunkIndex: number
		/** 本次新增的正文片段；未变化时为空字符串。 */
		contentDelta: string
		/** 接受本次片段后正文的累计字符数。 */
		/** 该值由 Store 对 canonical StreamState.content 取长度计算。 */
		contentLength: number
		/** 本次新增的思考内容片段；未变化时为空字符串。 */
		reasoningContentDelta: string
		/** 接受本次片段后思考内容的累计字符数。 */
		/** 该值由 Store 对 canonical StreamState.reasoning_content 取长度计算。 */
		reasoningContentLength: number
		/** 本次新增或修订的工具调用片段，不包含完整累计 arguments。 */
		toolCallDeltas: SuperMagicToolCallDelta[]
	}
}
