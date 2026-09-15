import type { SuperMagicEventMeta } from "../common"

/** Store 接受某一流代次的首个有序 chunk 后发布的事件契约。 */
export interface MessageStreamStartedEvent {
	/** 精确事件名。 */
	type: "message.stream.started"
	/** 流实体的顺序、版本与定位信息。 */
	meta: SuperMagicEventMeta & {
		/** 当前流的 correlation_id。 */
		correlationId: string
		/** 当前流代次，从 1 开始。 */
		/** 首包或 i=0 重启由 Store 映射为新的代次。 */
		streamGeneration: number
	}
	/** 流启动边界的紧凑描述。 */
	payload: {
		/** 启动该流代次的有序 chunk 索引。 */
		chunkIndex: number
		/** 首个有序 chunk 中最先出现的 canonical 数据类别。 */
		/** 该值由 content、reasoning_content、tool_calls 与元数据字段映射得出。 */
		startsWith: "metadata" | "reasoning" | "content" | "tool_call"
	}
}
