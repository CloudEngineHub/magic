import { describe, expect, it } from "vitest"
import { CanvasResourceScheduler } from "../scheduler/CanvasResourceScheduler"

interface Deferred<T> {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (error: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

async function flushMicrotasks(): Promise<void> {
	await Promise.resolve()
	await Promise.resolve()
}

describe("CanvasResourceScheduler", () => {
	it("limits concurrent tasks by resource kind", async () => {
		const scheduler = new CanvasResourceScheduler()
		const started: number[] = []
		const deferreds = [
			createDeferred<number>(),
			createDeferred<number>(),
			createDeferred<number>(),
		]

		const promises = deferreds.map((deferred, index) =>
			scheduler.run(
				"video:preview",
				() => {
					started.push(index)
					return deferred.promise
				},
				{ source: "test", priority: "visible" },
			),
		)

		expect(started).toEqual([0, 1])
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				activeTotal: 2,
				queuedTotal: 1,
			}),
		)

		deferreds[0].resolve(0)
		await promises[0]
		await flushMicrotasks()

		expect(started).toEqual([0, 1, 2])
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				activeTotal: 2,
				queuedTotal: 0,
			}),
		)

		deferreds[1].resolve(1)
		deferreds[2].resolve(2)
		await expect(Promise.all(promises)).resolves.toEqual([0, 1, 2])
	})

	it("starts higher priority queued tasks first", async () => {
		const scheduler = new CanvasResourceScheduler()
		const started: string[] = []
		const activeA = createDeferred<string>()
		const activeB = createDeferred<string>()
		const queuedBackground = createDeferred<string>()
		const queuedCritical = createDeferred<string>()

		const promises = [
			scheduler.run(
				"video:preview",
				() => {
					started.push("active-a")
					return activeA.promise
				},
				{ source: "test", priority: "background" },
			),
			scheduler.run(
				"video:preview",
				() => {
					started.push("active-b")
					return activeB.promise
				},
				{ source: "test", priority: "background" },
			),
			scheduler.run(
				"video:preview",
				() => {
					started.push("queued-background")
					return queuedBackground.promise
				},
				{ source: "test", priority: "background" },
			),
			scheduler.run(
				"video:preview",
				() => {
					started.push("queued-critical")
					return queuedCritical.promise
				},
				{ source: "test", priority: "critical" },
			),
		]

		expect(started).toEqual(["active-a", "active-b"])

		activeA.resolve("active-a")
		await promises[0]
		await flushMicrotasks()

		expect(started).toEqual(["active-a", "active-b", "queued-critical"])

		queuedCritical.resolve("queued-critical")
		await promises[3]
		await flushMicrotasks()

		expect(started).toEqual(["active-a", "active-b", "queued-critical", "queued-background"])

		activeB.resolve("active-b")
		queuedBackground.resolve("queued-background")
		await expect(Promise.all(promises)).resolves.toEqual([
			"active-a",
			"active-b",
			"queued-background",
			"queued-critical",
		])
	})

	it("rejects queued tasks when destroyed", async () => {
		const scheduler = new CanvasResourceScheduler()
		const activeA = createDeferred<string>()
		const activeB = createDeferred<string>()
		const queued = createDeferred<string>()

		const activePromises = [
			scheduler.run("video:preview", () => activeA.promise, {
				source: "test",
				priority: "visible",
			}),
			scheduler.run("video:preview", () => activeB.promise, {
				source: "test",
				priority: "visible",
			}),
		]
		const queuedPromise = scheduler.run("video:preview", () => queued.promise, {
			source: "test",
			priority: "visible",
		})

		scheduler.destroy()

		await expect(queuedPromise).rejects.toThrow("CanvasResourceScheduler destroyed")
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				destroyed: true,
				rejectedOnDestroyCount: 1,
			}),
		)

		activeA.resolve("active-a")
		activeB.resolve("active-b")
		await expect(Promise.all(activePromises)).resolves.toEqual(["active-a", "active-b"])
	})

	it("tracks completed and failed task counts", async () => {
		const scheduler = new CanvasResourceScheduler()

		await expect(
			scheduler.run("image:decode", async () => "ok", {
				source: "test",
				priority: "visible",
			}),
		).resolves.toBe("ok")
		await expect(
			scheduler.run(
				"image:decode",
				async () => {
					throw new Error("async failed")
				},
				{
					source: "test",
					priority: "visible",
				},
			),
		).rejects.toThrow("async failed")
		await expect(
			scheduler.run(
				"image:decode",
				() => {
					throw new Error("sync failed")
				},
				{
					source: "test",
					priority: "visible",
				},
			),
		).rejects.toThrow("sync failed")

		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				activeTotal: 0,
				startedCount: 3,
				completedCount: 1,
				failedCount: 2,
			}),
		)
	})
})
