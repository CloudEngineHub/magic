export type PPTSlideContentPriority = "active" | "fullscreen-near" | "fullscreen-far" | "preview"

const PRIORITY_VALUES: Record<PPTSlideContentPriority, number> = {
	active: 0,
	"fullscreen-near": 1,
	"fullscreen-far": 2,
	preview: 3,
}

interface ScheduledContentTask {
	key: string
	priority: PPTSlideContentPriority
	priorityValue: number
	sequence: number
	controller: AbortController
	run: (signal: AbortSignal) => Promise<boolean>
	promise: Promise<boolean>
	resolve: (loaded: boolean) => void
	state: "queued" | "running" | "settled"
	cancelled: boolean
	settled: boolean
	holdsSlot: boolean
}

export interface PPTSlideContentSchedulerStats {
	active: number
	queued: number
	total: number
}

/**
 * Schedules slide HTML downloads independently from screenshot generation.
 * A stable slide key deduplicates requests while the priority queue keeps the active slide
 * responsive even when the sidebar has already queued several thumbnail previews.
 */
export class PPTSlideContentScheduler {
	private queue: ScheduledContentTask[] = []
	private tasks = new Map<string, ScheduledContentTask>()
	private activeCount = 0
	private sequence = 0
	private disposed = false
	private readonly maxConcurrency: number
	private readonly lowPriorityConcurrency: number

	constructor(maxConcurrency: number = 4) {
		this.maxConcurrency = Number.isFinite(maxConcurrency)
			? Math.max(1, Math.floor(maxConcurrency))
			: 4
		// Keep one lane available so a later active slide is not trapped behind sidebar previews.
		this.lowPriorityConcurrency = this.maxConcurrency === 1 ? 1 : this.maxConcurrency - 1
	}

	schedule(
		key: string,
		priority: PPTSlideContentPriority,
		run: (signal: AbortSignal) => Promise<boolean>,
	): Promise<boolean> {
		if (!key || this.disposed) return Promise.resolve(false)

		const existingTask = this.tasks.get(key)
		if (existingTask) {
			const nextPriorityValue = PRIORITY_VALUES[priority]
			if (nextPriorityValue < existingTask.priorityValue) {
				// A sidebar/fullscreen request may already be running when it becomes the active page.
				// Promote its metadata in place so active preemption never mistakes it for stale work.
				this.setTaskPriority(existingTask, priority)
			}
			return existingTask.promise
		}

		let resolveTask: (loaded: boolean) => void = () => undefined
		const promise = new Promise<boolean>((resolve) => {
			resolveTask = resolve
		})
		const task: ScheduledContentTask = {
			key,
			priority,
			priorityValue: PRIORITY_VALUES[priority],
			sequence: this.sequence++,
			controller: new AbortController(),
			run,
			promise,
			resolve: resolveTask,
			state: "queued",
			cancelled: false,
			settled: false,
			holdsSlot: false,
		}

		this.tasks.set(key, task)
		this.queue.push(task)
		this.sortQueue()
		this.pump()

		return promise
	}

	/**
	 * Reconcile priority owned by the fullscreen sliding window. Unlike schedule(), this may
	 * demote a retained task after it moves farther from the active page.
	 */
	reprioritize(key: string, priority: PPTSlideContentPriority): void {
		const task = this.tasks.get(key)
		if (!task || task.priority === priority) return
		this.setTaskPriority(task, priority)
	}

	cancelQueued(
		predicate: (task: { key: string; priority: PPTSlideContentPriority }) => boolean,
	): void {
		const remainingTasks: ScheduledContentTask[] = []

		this.queue.forEach((task) => {
			if (!predicate(task)) {
				remainingTasks.push(task)
				return
			}

			this.cancelTask(task)
		})

		this.queue = remainingTasks
	}

	cancel(key: string): void {
		const task = this.tasks.get(key)
		if (!task) return

		if (task.state === "queued") {
			this.queue = this.queue.filter((queuedTask) => queuedTask !== task)
		}
		this.cancelTask(task)
		this.pump()
	}

	cancelAll(): void {
		const currentTasks = Array.from(this.tasks.values())
		this.queue = []

		currentTasks.forEach((task) => {
			this.cancelTask(task)
		})
		this.pump()
	}

	dispose(): void {
		this.disposed = true
		this.cancelAll()
	}

	getStats(): PPTSlideContentSchedulerStats {
		return {
			active: this.activeCount,
			queued: this.queue.length,
			// A cancelled running task is removed from the key map immediately so the same slide
			// can be requested again, but it remains physically active until run() settles.
			total: this.activeCount + this.queue.length,
		}
	}

	private sortQueue(): void {
		this.queue.sort((a, b) => a.priorityValue - b.priorityValue || a.sequence - b.sequence)
	}

	private setTaskPriority(task: ScheduledContentTask, priority: PPTSlideContentPriority): void {
		task.priority = priority
		task.priorityValue = PRIORITY_VALUES[priority]
		if (task.state === "queued") this.sortQueue()
		this.pump()
	}

	private pump(): void {
		while (!this.disposed && this.queue.length > 0) {
			const nextTask = this.queue[0]
			if (nextTask.priority === "active" && this.activeCount >= this.maxConcurrency) {
				const runningLowerPriorityTask = Array.from(this.tasks.values())
					.filter((task) => task.state === "running" && task.priority !== "active")
					.sort((a, b) => b.priorityValue - a.priorityValue || b.sequence - a.sequence)[0]
				if (!runningLowerPriorityTask) break
				this.cancelTask(runningLowerPriorityTask)
				// The cancelled task still owns its physical slot until run() settles. Wait for its
				// finally block to pump again instead of cancelling every lower-priority task at once.
				break
			}

			const concurrencyLimit =
				nextTask.priority === "active" ? this.maxConcurrency : this.lowPriorityConcurrency
			if (this.activeCount >= concurrencyLimit) break

			const task = this.queue.shift()
			if (!task || task.controller.signal.aborted) continue

			task.state = "running"
			task.holdsSlot = true
			this.activeCount++
			void this.runTask(task)
		}
	}

	private async runTask(task: ScheduledContentTask): Promise<void> {
		let loaded = false

		try {
			loaded = await task.run(task.controller.signal)
		} catch {
			loaded = false
		} finally {
			this.releaseSlot(task)
			this.settleTask(task, !task.cancelled && loaded)
			if (this.tasks.get(task.key) === task) this.tasks.delete(task.key)
			this.pump()
		}
	}

	private cancelTask(task: ScheduledContentTask): void {
		if (task.cancelled) return
		task.cancelled = true
		task.controller.abort()
		// Aborting only notifies cooperative work. HTML processing and resource URL resolution may
		// still be running, so keep the physical slot until runTask() reaches its finally block.
		this.settleTask(task, false)
		if (this.tasks.get(task.key) === task) this.tasks.delete(task.key)
	}

	private releaseSlot(task: ScheduledContentTask): void {
		if (!task.holdsSlot) return
		task.holdsSlot = false
		this.activeCount = Math.max(0, this.activeCount - 1)
	}

	private settleTask(task: ScheduledContentTask, loaded: boolean): void {
		if (task.settled) return
		task.settled = true
		task.state = "settled"
		task.resolve(loaded)
	}
}
