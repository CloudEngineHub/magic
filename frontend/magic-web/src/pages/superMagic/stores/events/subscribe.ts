import type { SuperMagicEventMap, SuperMagicEventType } from "./event-map"

/** 订阅事件时可声明的实体范围；未填写的字段不参与过滤。 */
export interface SuperMagicEventScope {
	/** 只接收指定 topic 的事件。 */
	topicId?: string
	/** 只接收指定 correlation 的事件。 */
	correlationId?: string
	/** 只接收指定 app message 的事件。 */
	appMessageId?: string
	/** 只接收指定规范工具调用 ID 的事件。 */
	toolCallId?: string
}

/** 单次 Store 事件订阅的可选行为。 */
export interface SuperMagicSubscribeOptions<T extends SuperMagicEventType> {
	/** 在执行 predicate 前应用的轻量实体过滤条件。 */
	scope?: SuperMagicEventScope
	/** 对已命中 type 与 scope 的事件执行的业务侧精细过滤。 */
	predicate?: (event: SuperMagicEventMap[T]) => boolean
	/** AbortSignal 终止时自动取消本次订阅；不提供历史事件 replay。 */
	signal?: AbortSignal
}

/** 指定事件类型对应的回调签名。 */
export type SuperMagicEventCallback<T extends SuperMagicEventType> = (
	event: SuperMagicEventMap[T],
) => void

/** 取消单次注册的幂等函数。 */
export type SuperMagicUnsubscribe = () => void

/** SuperMagic Store 的标准化事件订阅 API。 */
export type SuperMagicSubscribe = <T extends SuperMagicEventType>(
	type: T,
	callback: SuperMagicEventCallback<T>,
	options?: SuperMagicSubscribeOptions<T>,
) => SuperMagicUnsubscribe
