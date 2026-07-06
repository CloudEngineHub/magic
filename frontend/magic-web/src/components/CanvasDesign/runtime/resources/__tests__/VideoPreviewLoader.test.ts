import { describe, expect, it, vi } from "vitest"
import { VideoPreviewLoader } from "../video/VideoPreviewLoader"

function createLoader(options?: { concurrency?: number; isDestroyed?: () => boolean }) {
	return new VideoPreviewLoader({
		concurrency: options?.concurrency ?? 1,
		timeoutMs: 1000,
		isDestroyed: options?.isDestroyed ?? (() => false),
		onStaleRequestDrop: vi.fn(),
		onAbort: vi.fn(),
		onTimeout: vi.fn(),
	})
}

describe("VideoPreviewLoader", () => {
	it("queues preview tasks by concurrency and starts the next task after release", async () => {
		const loader = createLoader({ concurrency: 1 })
		let finishFirst!: () => void
		let firstStarted = false
		let secondStarted = false

		const first = loader.enqueue(
			() =>
				new Promise<void>((resolve) => {
					firstStarted = true
					finishFirst = resolve
				}),
		)
		const second = loader.enqueue(async () => {
			secondStarted = true
		})

		await Promise.resolve()
		expect(firstStarted).toBe(true)
		expect(secondStarted).toBe(false)
		expect(loader.activeCount).toBe(1)
		expect(loader.queuedCount).toBe(1)

		finishFirst()
		await first
		await second
		await Promise.resolve()
		expect(secondStarted).toBe(true)
		expect(loader.activeCount).toBe(0)
		expect(loader.queuedCount).toBe(0)
	})

	it("rejects queued preview tasks on destroy", async () => {
		const loader = createLoader({ concurrency: 1 })
		let finishFirst!: () => void
		const first = loader.enqueue(
			() =>
				new Promise<void>((resolve) => {
					finishFirst = resolve
				}),
		)
		const second = loader.enqueue(async () => undefined)
		const pendingError = new Error("destroyed")

		loader.destroy(pendingError)
		await expect(second).rejects.toBe(pendingError)

		finishFirst()
		await first
	})
})
