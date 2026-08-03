import { describe, expect, it, vi } from "vitest"
import { PPTSlideContentScheduler } from "../PPTSlideContentScheduler"

function createDeferred() {
	let resolve: (value: boolean) => void = () => undefined
	const promise = new Promise<boolean>((targetResolve) => {
		resolve = targetResolve
	})
	return { promise, resolve }
}

describe("PPTSlideContentScheduler", () => {
	it("limits concurrent slide content work", async () => {
		const scheduler = new PPTSlideContentScheduler(2)
		const deferredTasks = Array.from({ length: 4 }, () => createDeferred())
		let active = 0
		let maxActive = 0

		const results = deferredTasks.map((deferred, index) =>
			scheduler.schedule(`slide-${index}`, "active", async () => {
				active++
				maxActive = Math.max(maxActive, active)
				const result = await deferred.promise
				active--
				return result
			}),
		)

		expect(scheduler.getStats()).toEqual({ active: 2, queued: 2, total: 4 })
		deferredTasks[0].resolve(true)
		deferredTasks[1].resolve(true)
		await Promise.resolve()
		await Promise.resolve()
		expect(scheduler.getStats().active).toBe(2)

		deferredTasks[2].resolve(true)
		deferredTasks[3].resolve(true)
		await expect(Promise.all(results)).resolves.toEqual([true, true, true, true])
		expect(maxActive).toBe(2)
	})

	it("deduplicates a stable slide key and upgrades queued priority", async () => {
		const scheduler = new PPTSlideContentScheduler(1)
		const blocker = createDeferred()
		const target = createDeferred()
		const competitor = createDeferred()
		const executionOrder: string[] = []
		const runTarget = vi.fn(async () => target.promise)

		const blockerPromise = scheduler.schedule("blocker", "preview", async () => blocker.promise)
		const competitorPromise = scheduler.schedule("competitor", "preview", async () => {
			executionOrder.push("competitor")
			return competitor.promise
		})
		const firstTargetPromise = scheduler.schedule("target", "preview", runTarget)
		const duplicateTargetPromise = scheduler.schedule("target", "active", runTarget)

		expect(duplicateTargetPromise).toBe(firstTargetPromise)
		blocker.resolve(true)
		await blockerPromise
		await Promise.resolve()
		expect(runTarget).toHaveBeenCalledTimes(1)
		expect(executionOrder).toEqual([])

		target.resolve(true)
		await expect(firstTargetPromise).resolves.toBe(true)
		await Promise.resolve()
		expect(executionOrder).toEqual(["competitor"])
		competitor.resolve(true)
		await competitorPromise
	})

	it("keeps one lane available for an active slide while previews are queued", async () => {
		const scheduler = new PPTSlideContentScheduler(2)
		const firstPreview = createDeferred()
		const secondPreview = createDeferred()
		const active = createDeferred()
		const activeRun = vi.fn(async () => active.promise)

		const firstPromise = scheduler.schedule(
			"preview-1",
			"preview",
			async () => firstPreview.promise,
		)
		const secondPromise = scheduler.schedule(
			"preview-2",
			"preview",
			async () => secondPreview.promise,
		)
		const activePromise = scheduler.schedule("active", "active", activeRun)

		expect(activeRun).toHaveBeenCalledTimes(1)
		expect(scheduler.getStats()).toEqual({ active: 2, queued: 1, total: 3 })

		active.resolve(true)
		firstPreview.resolve(true)
		await Promise.all([activePromise, firstPromise])
		await Promise.resolve()
		secondPreview.resolve(true)
		await secondPromise
	})

	it("preempts lower-priority work for an active slide at concurrency one", async () => {
		const scheduler = new PPTSlideContentScheduler(1)
		const previewSawAbort = vi.fn()
		const previewPromise = scheduler.schedule(
			"preview",
			"preview",
			(signal) =>
				new Promise<boolean>((resolve) => {
					signal.addEventListener("abort", () => {
						previewSawAbort()
						resolve(false)
					})
				}),
		)

		const activePromise = scheduler.schedule("active", "active", async () => true)

		await expect(previewPromise).resolves.toBe(false)
		await expect(activePromise).resolves.toBe(true)
		expect(previewSawAbort).toHaveBeenCalledTimes(1)
	})

	it("starts a queued preview immediately when it is upgraded to active", async () => {
		const scheduler = new PPTSlideContentScheduler(2)
		const previewBlocker = createDeferred()
		const target = createDeferred()
		const targetRun = vi.fn(async () => target.promise)

		const blockerPromise = scheduler.schedule(
			"preview-blocker",
			"preview",
			async () => previewBlocker.promise,
		)
		const queuedTargetPromise = scheduler.schedule("target", "preview", targetRun)

		expect(targetRun).not.toHaveBeenCalled()
		const upgradedTargetPromise = scheduler.schedule("target", "active", targetRun)

		expect(upgradedTargetPromise).toBe(queuedTargetPromise)
		expect(targetRun).toHaveBeenCalledTimes(1)
		expect(scheduler.getStats()).toEqual({ active: 2, queued: 0, total: 2 })

		target.resolve(true)
		previewBlocker.resolve(true)
		await expect(Promise.all([blockerPromise, upgradedTargetPromise])).resolves.toEqual([
			true,
			true,
		])
	})

	it("cancels obsolete queued preview work", async () => {
		const scheduler = new PPTSlideContentScheduler(1)
		const blocker = createDeferred()
		const blockerPromise = scheduler.schedule("active", "active", async () => blocker.promise)
		const stalePromise = scheduler.schedule("stale", "preview", async () => true)

		scheduler.cancelQueued(({ priority }) => priority === "preview")
		await expect(stalePromise).resolves.toBe(false)
		expect(scheduler.getStats()).toEqual({ active: 1, queued: 0, total: 1 })

		blocker.resolve(true)
		await blockerPromise
	})

	it("aborts running work when the scheduler is disposed", async () => {
		const scheduler = new PPTSlideContentScheduler(1)
		const sawAbort = vi.fn()
		const result = scheduler.schedule(
			"active",
			"active",
			(signal) =>
				new Promise<boolean>((resolve) => {
					signal.addEventListener("abort", () => {
						sawAbort()
						resolve(false)
					})
				}),
		)

		scheduler.dispose()
		await expect(result).resolves.toBe(false)
		expect(sawAbort).toHaveBeenCalledTimes(1)
	})

	it("settles cancelled non-cooperative work as false and allows the same key again", async () => {
		const scheduler = new PPTSlideContentScheduler(1)
		const oldTask = createDeferred()
		const oldResult = scheduler.schedule("slide", "active", async () => oldTask.promise)

		scheduler.cancelAll()
		await expect(oldResult).resolves.toBe(false)

		const newResult = scheduler.schedule("slide", "active", async () => true)
		await expect(newResult).resolves.toBe(true)

		oldTask.resolve(true)
		await expect(oldResult).resolves.toBe(false)
	})

	it("normalizes fractional concurrency instead of leaving tasks queued forever", async () => {
		const scheduler = new PPTSlideContentScheduler(0.5)
		await expect(scheduler.schedule("slide", "active", async () => true)).resolves.toBe(true)
	})
})
