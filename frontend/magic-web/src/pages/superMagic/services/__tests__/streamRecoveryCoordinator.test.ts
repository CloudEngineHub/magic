import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	StreamRecoveryCoordinator,
	type StreamRecoveryOwnerRegistration,
} from "../streamRecoveryCoordinator"

interface Deferred<T> {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason?: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, resolve, reject }
}

function createStoreHarness() {
	let recoveryListener:
		| ((payload: { topicId: string; correlationId: string }) => void)
		| undefined
	let nextGeneration = 7
	const store = {
		registerOnStreamRecoveryRequested: vi.fn(
			(listener: (payload: { topicId: string; correlationId: string }) => void) => {
				recoveryListener = listener
				return vi.fn()
			},
		),
		beginTopicSync: vi.fn(() => nextGeneration++),
		isTopicSyncCurrent: vi.fn(() => true),
		completeTopicSync: vi.fn(() => true),
		cancelTopicSync: vi.fn(),
		getLatestMessageSeqId: vi.fn(() => "seq-200"),
	}

	return {
		store,
		emitRecoveryRequest(payload: { topicId: string; correlationId: string }) {
			recoveryListener?.(payload)
		},
	}
}

function createOwner(
	overrides: Partial<StreamRecoveryOwnerRegistration> = {},
): StreamRecoveryOwnerRegistration {
	return {
		ownerToken: Symbol("owner"),
		topicId: "topic-1",
		conversationId: "conversation-1",
		getTaskStatus: () => "finished",
		recover: vi.fn().mockResolvedValue({ didPullSucceed: true }),
		...overrides,
	}
}

describe("StreamRecoveryCoordinator", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("registers one Store listener and deduplicates in-flight recovery per topic", async () => {
		const harness = createStoreHarness()
		const coordinator = new StreamRecoveryCoordinator(harness.store)
		const deferred = createDeferred<{ didPullSucceed: boolean }>()
		const firstOwner = createOwner({ recover: vi.fn() })
		const activeOwner = createOwner({ recover: vi.fn(() => deferred.promise) })

		coordinator.registerOwner(firstOwner)
		coordinator.registerOwner(activeOwner)

		expect(harness.store.registerOnStreamRecoveryRequested).toHaveBeenCalledTimes(1)

		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-1" })
		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-2" })

		// beginTopicSync must happen synchronously before the recovery callback can await HTTP.
		expect(harness.store.beginTopicSync).toHaveBeenCalledWith("topic-1")
		expect(harness.store.beginTopicSync).toHaveBeenCalledTimes(1)
		expect(firstOwner.recover).not.toHaveBeenCalled()
		expect(activeOwner.recover).toHaveBeenCalledTimes(1)
		expect(activeOwner.recover).toHaveBeenCalledWith({
			topicId: "topic-1",
			conversationId: "conversation-1",
			correlationId: "correlation-1",
			syncGeneration: 7,
		})

		deferred.resolve({ didPullSucceed: true })
		await deferred.promise
		await Promise.resolve()

		expect(harness.store.completeTopicSync).toHaveBeenCalledWith("topic-1", 7, {
			succeeded: true,
			taskStatus: "finished",
			latestSeqId: "seq-200",
		})
		expect(harness.store.cancelTopicSync).not.toHaveBeenCalled()
	})

	it("reports HTTP failure to Store without retrying in the coordinator", async () => {
		const harness = createStoreHarness()
		const coordinator = new StreamRecoveryCoordinator(harness.store)
		const owner = createOwner({
			recover: vi.fn().mockResolvedValue({ didPullSucceed: false }),
		})
		coordinator.registerOwner(owner)

		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-1" })
		await Promise.resolve()
		await Promise.resolve()

		expect(owner.recover).toHaveBeenCalledTimes(1)
		expect(harness.store.completeTopicSync).toHaveBeenCalledWith("topic-1", 7, {
			succeeded: false,
			taskStatus: "finished",
		})
		expect(harness.store.beginTopicSync).toHaveBeenCalledTimes(1)
		expect(harness.store.cancelTopicSync).not.toHaveBeenCalled()
	})

	it("cancels the generation when its owner unregisters before HTTP completes", async () => {
		const harness = createStoreHarness()
		const coordinator = new StreamRecoveryCoordinator(harness.store)
		const deferred = createDeferred<{ didPullSucceed: boolean }>()
		const owner = createOwner({ recover: vi.fn(() => deferred.promise) })
		const unregister = coordinator.registerOwner(owner)

		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-1" })
		unregister()

		expect(harness.store.cancelTopicSync).toHaveBeenCalledWith("topic-1", 7)

		deferred.resolve({ didPullSucceed: true })
		await deferred.promise
		await Promise.resolve()

		expect(harness.store.completeTopicSync).not.toHaveBeenCalled()
	})

	it("cancels an in-flight owner when a newer owner registers for the same topic", async () => {
		const harness = createStoreHarness()
		const coordinator = new StreamRecoveryCoordinator(harness.store)
		const deferred = createDeferred<{ didPullSucceed: boolean }>()
		const previousOwner = createOwner({ recover: vi.fn(() => deferred.promise) })
		const currentOwner = createOwner()
		coordinator.registerOwner(previousOwner)

		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-1" })
		coordinator.registerOwner(currentOwner)

		expect(harness.store.cancelTopicSync).toHaveBeenCalledWith("topic-1", 7)

		deferred.resolve({ didPullSucceed: true })
		await deferred.promise
		await Promise.resolve()
		expect(harness.store.completeTopicSync).not.toHaveBeenCalled()

		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-2" })
		await Promise.resolve()
		await Promise.resolve()

		expect(currentOwner.recover).toHaveBeenCalledWith(
			expect.objectContaining({ correlationId: "correlation-2", syncGeneration: 8 }),
		)
	})

	it("cancels the generation when recovery post-processing throws", async () => {
		const harness = createStoreHarness()
		const coordinator = new StreamRecoveryCoordinator(harness.store)
		const owner = createOwner({
			recover: vi.fn().mockRejectedValue(new Error("initialize failed")),
		})
		coordinator.registerOwner(owner)

		harness.emitRecoveryRequest({ topicId: "topic-1", correlationId: "correlation-1" })
		await Promise.resolve()
		await Promise.resolve()

		expect(harness.store.cancelTopicSync).toHaveBeenCalledWith("topic-1", 7)
		expect(harness.store.completeTopicSync).not.toHaveBeenCalled()
	})
})
