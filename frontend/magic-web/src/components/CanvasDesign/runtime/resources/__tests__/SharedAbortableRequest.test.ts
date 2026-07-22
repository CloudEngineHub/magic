import { describe, expect, it } from "vitest"
import { SharedAbortableRequest } from "../offline-cache/SharedAbortableRequest"

function deferred<T>() {
	let resolve!: (value: T) => void
	return {
		promise: new Promise<T>((promiseResolve) => {
			resolve = promiseResolve
		}),
		resolve,
	}
}

describe("SharedAbortableRequest", () => {
	it("does not abort the shared request while another consumer is active", async () => {
		const response = deferred<string>()
		let sharedSignal: AbortSignal | undefined
		const request = new SharedAbortableRequest(
			(signal) => {
				sharedSignal = signal
				return response.promise
			},
			{ abortValue: "aborted" },
		)
		const firstController = new AbortController()
		const first = request.consume(firstController.signal)
		const nonViewportConsumer = request.consume()

		firstController.abort()
		await expect(first).resolves.toBe("aborted")
		expect(sharedSignal?.aborted).toBe(false)

		response.resolve("ready")
		await expect(nonViewportConsumer).resolves.toBe("ready")
	})

	it("aborts the underlying request after the last consumer leaves", async () => {
		let sharedSignal: AbortSignal | undefined
		const request = new SharedAbortableRequest(
			(signal) => {
				sharedSignal = signal
				return new Promise<null>(() => undefined)
			},
			{ abortValue: null },
		)
		const controller = new AbortController()
		const consumer = request.consume(controller.signal)

		controller.abort()
		await expect(consumer).resolves.toBeNull()
		expect(sharedSignal?.aborted).toBe(true)
	})
})
