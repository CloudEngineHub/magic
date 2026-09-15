import type { SuperMagicEventMap, SuperMagicEventType } from "../event-map"
import type {
	SuperMagicEventCallback,
	SuperMagicEventScope,
	SuperMagicSubscribe,
	SuperMagicSubscribeOptions,
} from "../subscribe"

interface EventListener<T extends SuperMagicEventType> {
	callback: SuperMagicEventCallback<T>
	options?: SuperMagicSubscribeOptions<T>
}

function matchesScope<T extends SuperMagicEventType>(
	event: SuperMagicEventMap[T],
	scope?: SuperMagicEventScope,
) {
	if (!scope) return true
	if (scope.topicId !== undefined && event.meta.topicId !== scope.topicId) return false
	if (scope.correlationId !== undefined && event.meta.correlationId !== scope.correlationId)
		return false
	if (scope.appMessageId !== undefined && event.meta.appMessageId !== scope.appMessageId)
		return false
	if (scope.toolCallId !== undefined && event.meta.toolCallId !== scope.toolCallId) return false
	return true
}

/** 创建 Store 实例私有的同步 FIFO emitter；每次注册拥有独立生命周期。 */
export function createSuperMagicEventEmitter() {
	const listeners = new Map<SuperMagicEventType, Set<EventListener<SuperMagicEventType>>>()

	const subscribe: SuperMagicSubscribe = (type, callback, options) => {
		if (options?.signal?.aborted) return () => undefined

		const listener = { callback, options } as EventListener<SuperMagicEventType>
		const typeListeners = listeners.get(type) || new Set<EventListener<SuperMagicEventType>>()
		typeListeners.add(listener)
		listeners.set(type, typeListeners)

		let active = true
		const unsubscribe = () => {
			if (!active) return
			active = false
			options?.signal?.removeEventListener("abort", unsubscribe)
			typeListeners.delete(listener)
			if (typeListeners.size === 0) listeners.delete(type)
		}
		options?.signal?.addEventListener("abort", unsubscribe, { once: true })
		return unsubscribe
	}

	function emit<T extends SuperMagicEventType>(event: SuperMagicEventMap[T]) {
		const typeListeners = listeners.get(event.type)
		if (!typeListeners?.size) return

		Array.from(typeListeners).forEach((listener) => {
			if (!matchesScope(event, listener.options?.scope)) return
			try {
				if (listener.options?.predicate && !listener.options.predicate(event)) return
				listener.callback(event)
			} catch (error) {
				console.error("[SuperMagicStore] event subscriber error", {
					error,
					type: event.type,
				})
			}
		})
	}

	return { subscribe, emit }
}
