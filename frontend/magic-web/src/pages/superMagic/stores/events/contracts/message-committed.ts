import type { SuperMagicEventMessageRef, SuperMagicEventMeta } from "../common"

/** canonical 消息发生语义插入或更新后发布的事件契约。 */
export interface MessageCommittedEvent {
	/** 精确事件名。 */
	type: "message.committed"
	/** 消息实体的顺序、版本与定位信息。 */
	meta: SuperMagicEventMeta
	/** 已完成写入的 canonical 消息变化。 */
	payload: {
		/** 不包含完整 debug/content/attachments 的规范消息引用。 */
		message: SuperMagicEventMessageRef
		/** 本次写入是创建新 canonical 消息还是修订已有消息。 */
		/** transition ledger 中不存在历史快照时映射为 insert，否则映射为 update。 */
		operation: "insert" | "update"
		/** 本次 canonical 决策的权威层级。 */
		/** 服务端 IM/HTTP/分享事实映射为 server，仅明确的本地 canonical 写入映射为 local。 */
		authority: "server" | "local"
		/** 本次发生语义变化的字段集合。 */
		/** 该数组由写入前后的 canonical 字段比较映射，禁止因对象引用变化虚报字段。 */
		changedFields: string[]
	}
}
