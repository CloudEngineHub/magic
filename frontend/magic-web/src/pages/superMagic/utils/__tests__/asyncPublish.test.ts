import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	AsyncPublishError,
	clearPendingPublishTask,
	loadPendingPublishTask,
	pollPublishTask,
	resumePendingPublish,
	runAsyncPublish,
	savePendingPublishTask,
} from "../asyncPublish"

describe("asyncPublish", () => {
	beforeEach(() => {
		sessionStorage.clear()
		vi.useFakeTimers()
	})

	afterEach(() => {
		vi.useRealTimers()
		sessionStorage.clear()
	})

	it("persists and clears pending publish task ids", () => {
		savePendingPublishTask("skill", "SK-1", "task-1")
		expect(loadPendingPublishTask("skill", "SK-1")).toBe("task-1")
		clearPendingPublishTask("skill", "SK-1")
		expect(loadPendingPublishTask("skill", "SK-1")).toBeNull()
	})

	it("returns immediately when create responds ready", async () => {
		const result = await runAsyncPublish({
			resourceType: "agent",
			code: "SMA-1",
			create: async () => ({
				publish_task_id: "task-ready",
				status: "ready",
				progress: 100,
				error: null,
			}),
			check: async () => {
				throw new Error("check should not be called")
			},
		})

		expect(result.status).toBe("ready")
		expect(loadPendingPublishTask("agent", "SMA-1")).toBeNull()
	})

	it("polls until ready and reports progress", async () => {
		const progressValues: number[] = []
		let checks = 0

		const promise = runAsyncPublish({
			resourceType: "skill",
			code: "SK-2",
			create: async () => ({
				publish_task_id: "task-2",
				status: "processing",
				progress: 10,
				error: null,
			}),
			check: async () => {
				checks += 1
				if (checks === 1) {
					return {
						publish_task_id: "task-2",
						status: "processing",
						progress: 60,
						error: null,
					}
				}
				return {
					publish_task_id: "task-2",
					status: "ready",
					progress: 100,
					error: null,
				}
			},
			onProgress: (progress) => progressValues.push(progress),
		})

		await vi.advanceTimersByTimeAsync(2500)
		await vi.advanceTimersByTimeAsync(2500)
		const result = await promise

		expect(result.status).toBe("ready")
		expect(progressValues).toEqual([10, 60, 100])
		expect(loadPendingPublishTask("skill", "SK-2")).toBeNull()
	})

	it("throws AsyncPublishError when status is failed", async () => {
		const promise = pollPublishTask({
			check: async () => ({
				publish_task_id: "task-3",
				status: "failed",
				progress: 40,
				error: "zip failed",
			}),
		})

		await expect(promise).rejects.toMatchObject({
			name: "AsyncPublishError",
			reason: "failed",
			message: "zip failed",
		})
	})

	it("resumes from an existing publish_task_id", async () => {
		savePendingPublishTask("agent", "SMA-9", "task-resume")

		const promise = runAsyncPublish({
			resourceType: "agent",
			code: "SMA-9",
			resumePublishTaskId: "task-resume",
			create: async () => {
				throw new Error("should not create")
			},
			check: async () => ({
				publish_task_id: "task-resume",
				status: "ready",
				progress: 100,
				error: null,
			}),
		})

		const result = await promise
		expect(result.status).toBe("ready")
		expect(loadPendingPublishTask("agent", "SMA-9")).toBeNull()
	})

	it("supports abort during polling", async () => {
		const controller = new AbortController()
		const promise = pollPublishTask({
			check: async () => ({
				publish_task_id: "task-abort",
				status: "processing",
				progress: 20,
				error: null,
			}),
			signal: controller.signal,
		})

		controller.abort()
		await expect(promise).rejects.toBeInstanceOf(AsyncPublishError)
	})

	it("resumes silently when the first check is already ready", async () => {
		savePendingPublishTask("agent", "SMA-ready", "task-ready")
		const onStartWaiting = vi.fn()
		const onProgress = vi.fn()

		const result = await resumePendingPublish({
			resourceType: "agent",
			code: "SMA-ready",
			publishTaskId: "task-ready",
			check: async () => ({
				publish_task_id: "task-ready",
				status: "ready",
				progress: 100,
				error: null,
			}),
			onStartWaiting,
			onProgress,
		})

		expect(result.alreadyReady).toBe(true)
		expect(onStartWaiting).not.toHaveBeenCalled()
		expect(onProgress).not.toHaveBeenCalled()
		expect(loadPendingPublishTask("agent", "SMA-ready")).toBeNull()
	})

	it("enters waiting UI only when resume is still processing", async () => {
		savePendingPublishTask("skill", "SK-wait", "task-wait")
		const onStartWaiting = vi.fn()
		const progressValues: number[] = []
		let checks = 0

		const promise = resumePendingPublish({
			resourceType: "skill",
			code: "SK-wait",
			publishTaskId: "task-wait",
			check: async () => {
				checks += 1
				if (checks === 1) {
					return {
						publish_task_id: "task-wait",
						status: "processing",
						progress: 40,
						error: null,
					}
				}
				return {
					publish_task_id: "task-wait",
					status: "ready",
					progress: 100,
					error: null,
				}
			},
			onStartWaiting,
			onProgress: (progress) => progressValues.push(progress),
		})

		await vi.advanceTimersByTimeAsync(2500)
		const result = await promise

		expect(result.alreadyReady).toBe(false)
		expect(onStartWaiting).toHaveBeenCalledTimes(1)
		expect(progressValues[0]).toBe(40)
		expect(progressValues.at(-1)).toBe(100)
		expect(loadPendingPublishTask("skill", "SK-wait")).toBeNull()
	})
})
