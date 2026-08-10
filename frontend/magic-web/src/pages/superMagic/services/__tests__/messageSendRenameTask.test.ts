import { describe, expect, it, vi } from "vitest"
import {
	startMessageSendRenameTask,
	takeProjectRenameTask,
	trackProjectRenameTask,
} from "../messageSendRenameTask"

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})

	return { promise, resolve, reject }
}

describe("startMessageSendRenameTask", () => {
	it("completes after topic rename and project-name sync", async () => {
		const topicRename = createDeferred<string | null>()
		const projectSync = createDeferred<void>()
		const syncProjectName = vi.fn(() => projectSync.promise)
		const task = startMessageSendRenameTask({
			topicId: "topic-1",
			renameTopic: () => topicRename.promise,
			syncProjectName,
			onError: vi.fn(),
		})
		let completed = false
		const waiting = task.completion.then(() => {
			completed = true
		})

		await Promise.resolve()
		expect(completed).toBe(false)

		topicRename.resolve("客户跟进看板")
		await vi.waitFor(() => {
			expect(syncProjectName).toHaveBeenCalledWith("客户跟进看板")
		})
		expect(completed).toBe(false)

		projectSync.resolve()
		await expect(task.completion).resolves.toEqual({
			topicId: "topic-1",
			topicName: "客户跟进看板",
		})
		await waiting
		expect(completed).toBe(true)
	})

	it("resolves to null when topic rename fails", async () => {
		const error = new Error("rename failed")
		const onError = vi.fn()
		const syncProjectName = vi.fn()
		const task = startMessageSendRenameTask({
			topicId: "topic-1",
			renameTopic: async () => {
				throw error
			},
			syncProjectName,
			onError,
		})

		await expect(task.completion).resolves.toBeNull()
		expect(onError).toHaveBeenCalledWith(error)
		expect(syncProjectName).not.toHaveBeenCalled()
	})

	it("keeps the topic name when project-name sync fails", async () => {
		const error = new Error("project sync failed")
		const onError = vi.fn()
		const task = startMessageSendRenameTask({
			topicId: "topic-1",
			renameTopic: async () => "客户跟进看板",
			syncProjectName: async () => {
				throw error
			},
			onError,
		})

		await expect(task.completion).resolves.toEqual({
			topicId: "topic-1",
			topicName: "客户跟进看板",
		})
		expect(onError).toHaveBeenCalledWith(error)
	})

	it("keeps a completed rename task until the detail page consumes it", async () => {
		const completion = Promise.resolve({
			topicId: "topic-1",
			topicName: "客户跟进看板",
		})

		trackProjectRenameTask("project-1", completion)
		await completion

		expect(takeProjectRenameTask("project-1")).toBe(completion)
		expect(takeProjectRenameTask("project-1")).toBeNull()
	})
})
