import { describe, expect, it, vi } from "vitest"
import type { MessageCommittedEvent } from "../contracts/message-committed"
import { createSuperMagicEventEmitter } from "../internal/emitter"

function createMessageCommittedEvent(sequence = 1): MessageCommittedEvent {
	return {
		type: "message.committed",
		meta: {
			sequence,
			revision: sequence,
			occurredAt: 1_000 + sequence,
			source: "im",
			topicId: "topic-a",
			correlationId: "correlation-a",
			appMessageId: "message-a",
			messageSeqId: String(sequence),
		},
		payload: {
			message: {
				logicalMessageId: "message-a",
				appMessageId: "message-a",
				correlationId: "correlation-a",
				seqId: String(sequence),
				role: "assistant",
				type: "super_magic_message",
				status: "running",
				sendTime: 1_000,
			},
			operation: "insert",
			authority: "server",
			changedFields: ["appMessageId", "status"],
		},
	}
}

describe("SuperMagic Store event emitter", () => {
	it("treats repeated callback registrations as independent subscriptions", () => {
		const emitter = createSuperMagicEventEmitter()
		const callback = vi.fn()
		const unsubscribeFirst = emitter.subscribe("message.committed", callback)
		const unsubscribeSecond = emitter.subscribe("message.committed", callback)

		emitter.emit(createMessageCommittedEvent())
		expect(callback).toHaveBeenCalledTimes(2)

		unsubscribeFirst()
		emitter.emit(createMessageCommittedEvent(2))
		expect(callback).toHaveBeenCalledTimes(3)

		unsubscribeFirst()
		unsubscribeSecond()
		emitter.emit(createMessageCommittedEvent(3))
		expect(callback).toHaveBeenCalledTimes(3)
	})

	it("filters subscriptions by event scope", () => {
		const emitter = createSuperMagicEventEmitter()
		const callback = vi.fn()
		emitter.subscribe("message.committed", callback, {
			scope: {
				topicId: "topic-a",
				correlationId: "correlation-a",
				appMessageId: "message-a",
			},
		})

		emitter.emit(createMessageCommittedEvent())
		emitter.emit({
			...createMessageCommittedEvent(2),
			meta: { ...createMessageCommittedEvent(2).meta, topicId: "topic-b" },
		})

		expect(callback).toHaveBeenCalledTimes(1)
	})

	it("evaluates predicate filters after scope matching", () => {
		const emitter = createSuperMagicEventEmitter()
		const callback = vi.fn()
		const predicate = vi.fn((event: MessageCommittedEvent) => event.meta.revision > 1)
		emitter.subscribe("message.committed", callback, {
			scope: { topicId: "topic-a" },
			predicate,
		})

		emitter.emit(createMessageCommittedEvent())
		emitter.emit(createMessageCommittedEvent(2))
		emitter.emit({
			...createMessageCommittedEvent(3),
			meta: { ...createMessageCommittedEvent(3).meta, topicId: "topic-b" },
		})

		expect(predicate).toHaveBeenCalledTimes(2)
		expect(callback).toHaveBeenCalledOnce()
	})

	it("removes a subscription when its AbortSignal aborts", () => {
		const emitter = createSuperMagicEventEmitter()
		const callback = vi.fn()
		const controller = new AbortController()
		const unsubscribe = emitter.subscribe("message.committed", callback, {
			signal: controller.signal,
		})

		emitter.emit(createMessageCommittedEvent())
		controller.abort()
		emitter.emit(createMessageCommittedEvent(2))
		unsubscribe()

		expect(callback).toHaveBeenCalledOnce()
	})

	it("does not register a subscription for an already aborted signal", () => {
		const emitter = createSuperMagicEventEmitter()
		const callback = vi.fn()
		const controller = new AbortController()
		controller.abort()

		const unsubscribe = emitter.subscribe("message.committed", callback, {
			signal: controller.signal,
		})
		emitter.emit(createMessageCommittedEvent())
		unsubscribe()

		expect(callback).not.toHaveBeenCalled()
	})

	it("delivers matching subscriptions in registration order", () => {
		const emitter = createSuperMagicEventEmitter()
		const calls: string[] = []
		emitter.subscribe("message.committed", () => calls.push("first"))
		emitter.subscribe("message.committed", () => calls.push("second"))

		emitter.emit(createMessageCommittedEvent())

		expect(calls).toEqual(["first", "second"])
	})

	it("isolates listener and predicate exceptions", () => {
		const emitter = createSuperMagicEventEmitter()
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined)
		const callback = vi.fn()
		emitter.subscribe("message.committed", () => {
			throw new Error("callback failed")
		})
		emitter.subscribe("message.committed", callback, {
			predicate: () => {
				throw new Error("predicate failed")
			},
		})
		emitter.subscribe("message.committed", callback)

		emitter.emit(createMessageCommittedEvent())

		expect(callback).toHaveBeenCalledOnce()
		expect(consoleError).toHaveBeenCalledTimes(2)
		consoleError.mockRestore()
	})
})
