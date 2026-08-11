import { afterEach, describe, expect, it, vi } from "vitest"
import { UploadProgressBatcher } from "../UploadProgressBatcher"

afterEach(() => {
	vi.useRealTimers()
})

describe("UploadProgressBatcher", () => {
	it("keeps only the latest integer progress for each file in a window", () => {
		vi.useFakeTimers()
		const onFlush = vi.fn()
		const batcher = new UploadProgressBatcher(onFlush, 200)
		batcher.begin("file-1")

		batcher.enqueue("file-1", 10.2)
		batcher.enqueue("file-1", 10.4)
		batcher.enqueue("file-1", 52.7)

		expect(onFlush).not.toHaveBeenCalled()
		vi.advanceTimersByTime(200)

		expect(onFlush).toHaveBeenCalledTimes(1)
		expect([...onFlush.mock.calls[0][0]]).toEqual([["file-1", 53]])
	})

	it("flushes multiple files together", () => {
		vi.useFakeTimers()
		const onFlush = vi.fn()
		const batcher = new UploadProgressBatcher(onFlush, 200)
		batcher.begin("file-1")
		batcher.begin("file-2")

		batcher.enqueue("file-1", 20)
		batcher.enqueue("file-2", 40)
		vi.advanceTimersByTime(200)

		expect(onFlush).toHaveBeenCalledTimes(1)
		expect([...onFlush.mock.calls[0][0]]).toEqual([
			["file-1", 20],
			["file-2", 40],
		])
	})

	it("commits terminal progress immediately and cancels stale pending progress", () => {
		vi.useFakeTimers()
		const onFlush = vi.fn()
		const batcher = new UploadProgressBatcher(onFlush, 200)
		batcher.begin("file-1")
		batcher.enqueue("file-1", 80)

		batcher.complete("file-1")

		expect([...onFlush.mock.calls[0][0]]).toEqual([["file-1", 100]])
		vi.advanceTimersByTime(200)
		expect(onFlush).toHaveBeenCalledTimes(1)
	})

	it("ignores delayed intermediate progress after completion until a retry begins", () => {
		vi.useFakeTimers()
		const onFlush = vi.fn()
		const batcher = new UploadProgressBatcher(onFlush, 200)
		batcher.begin("file-1")
		batcher.complete("file-1")

		batcher.enqueue("file-1", 80)
		vi.advanceTimersByTime(200)
		expect(onFlush).toHaveBeenCalledTimes(1)
		expect([...onFlush.mock.calls[0][0]]).toEqual([["file-1", 100]])

		batcher.begin("file-1")
		batcher.enqueue("file-1", 25)
		vi.advanceTimersByTime(200)
		expect([...onFlush.mock.calls[1][0]]).toEqual([["file-1", 25]])
	})

	it("removes pending work when a file is deleted", () => {
		vi.useFakeTimers()
		const onFlush = vi.fn()
		const batcher = new UploadProgressBatcher(onFlush, 200)
		batcher.begin("file-1")
		batcher.enqueue("file-1", 25)

		batcher.remove("file-1")
		vi.advanceTimersByTime(200)

		expect(onFlush).not.toHaveBeenCalled()
	})
})
