export type CanvasResourceTaskKind =
	| "image:body-fetch"
	| "image:decode"
	| "video:preview"
	| "video:playback-acquire"

export type CanvasResourceTaskPriority = "critical" | "visible" | "near" | "background"

export interface CanvasResourceSchedulerSnapshot {
	destroyed: boolean
	activeTotal: number
	queuedTotal: number
	peakActiveTotal: number
	peakQueuedTotal: number
	startedCount: number
	completedCount: number
	failedCount: number
	rejectedOnDestroyCount: number
	activeByKind: Record<CanvasResourceTaskKind, number>
	queuedByKind: Record<CanvasResourceTaskKind, number>
}

interface CanvasResourceTaskLogMeta {
	source: string
	canvasId?: string
	managerInstanceId?: number
	ownerId?: string
	path?: string
	variant?: string
	cacheKey?: string
	url?: string
}

interface CanvasResourceTask<T> {
	id: number
	kind: CanvasResourceTaskKind
	priority: CanvasResourceTaskPriority
	queuedAt: number
	sequence: number
	meta: CanvasResourceTaskLogMeta
	task: () => Promise<T>
	resolve: (value: T) => void
	reject: (error: unknown) => void
}

const TASK_KIND_LIMITS: Record<CanvasResourceTaskKind, number> = {
	"image:body-fetch": 6,
	"image:decode": 4,
	"video:preview": 2,
	"video:playback-acquire": 2,
}

const TOTAL_RESOURCE_TASK_LIMIT = 8

const TASK_PRIORITIES: Record<CanvasResourceTaskPriority, number> = {
	critical: 0,
	visible: 1,
	near: 2,
	background: 3,
}

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now()
}

function createKindCountRecord(): Record<CanvasResourceTaskKind, number> {
	return {
		"image:body-fetch": 0,
		"image:decode": 0,
		"video:preview": 0,
		"video:playback-acquire": 0,
	}
}

export class CanvasResourceScheduler {
	private destroyed = false
	private taskIdSeed = 0
	private sequenceSeed = 0
	private activeTotal = 0
	private peakActiveTotal = 0
	private peakQueuedTotal = 0
	private startedCount = 0
	private completedCount = 0
	private failedCount = 0
	private rejectedOnDestroyCount = 0
	private readonly activeByKind = createKindCountRecord()
	private readonly queue: CanvasResourceTask<unknown>[] = []

	public run<T>(
		kind: CanvasResourceTaskKind,
		task: () => Promise<T>,
		options: CanvasResourceTaskLogMeta & { priority?: CanvasResourceTaskPriority },
	): Promise<T> {
		if (this.destroyed) {
			return Promise.reject(new Error("CanvasResourceScheduler destroyed"))
		}

		return new Promise<T>((resolve, reject) => {
			const item: CanvasResourceTask<T> = {
				id: ++this.taskIdSeed,
				kind,
				priority: options.priority ?? "background",
				queuedAt: now(),
				sequence: ++this.sequenceSeed,
				meta: options,
				task,
				resolve,
				reject,
			}
			this.queue.push(item as CanvasResourceTask<unknown>)
			this.peakQueuedTotal = Math.max(this.peakQueuedTotal, this.queue.length)
			this.pump()
		})
	}

	public getSnapshot(): CanvasResourceSchedulerSnapshot {
		const queuedByKind = createKindCountRecord()
		this.queue.forEach((task) => {
			queuedByKind[task.kind] += 1
		})
		return {
			destroyed: this.destroyed,
			activeTotal: this.activeTotal,
			queuedTotal: this.queue.length,
			peakActiveTotal: this.peakActiveTotal,
			peakQueuedTotal: this.peakQueuedTotal,
			startedCount: this.startedCount,
			completedCount: this.completedCount,
			failedCount: this.failedCount,
			rejectedOnDestroyCount: this.rejectedOnDestroyCount,
			activeByKind: { ...this.activeByKind },
			queuedByKind,
		}
	}

	public destroy(): void {
		this.destroyed = true
		const error = new Error("CanvasResourceScheduler destroyed")
		while (this.queue.length > 0) {
			const task = this.queue.shift()
			if (!task) continue
			this.rejectedOnDestroyCount += 1
			task.reject(error)
		}
	}

	private sortQueue(): void {
		this.queue.sort((a, b) => {
			const priorityDiff = TASK_PRIORITIES[a.priority] - TASK_PRIORITIES[b.priority]
			if (priorityDiff !== 0) return priorityDiff
			return a.sequence - b.sequence
		})
	}

	private getQueuedCountByKind(kind: CanvasResourceTaskKind): number {
		let count = 0
		this.queue.forEach((task) => {
			if (task.kind === kind) count += 1
		})
		return count
	}

	private findRunnableTaskIndex(): number {
		if (this.activeTotal >= TOTAL_RESOURCE_TASK_LIMIT) return -1
		return this.queue.findIndex(
			(task) => this.activeByKind[task.kind] < TASK_KIND_LIMITS[task.kind],
		)
	}

	private pump(): void {
		if (this.destroyed) return

		while (this.activeTotal < TOTAL_RESOURCE_TASK_LIMIT && this.queue.length > 0) {
			this.sortQueue()
			const taskIndex = this.findRunnableTaskIndex()
			if (taskIndex < 0) return
			const task = this.queue.splice(taskIndex, 1)[0]
			if (!task) return
			this.startTask(task)
		}
	}

	private startTask(task: CanvasResourceTask<unknown>): void {
		this.activeTotal += 1
		this.activeByKind[task.kind] += 1
		this.peakActiveTotal = Math.max(this.peakActiveTotal, this.activeTotal)
		this.startedCount += 1

		let promise: Promise<unknown>
		try {
			promise = Promise.resolve(task.task())
		} catch (error) {
			promise = Promise.reject(error)
		}

		void promise
			.then((result) => {
				this.completedCount += 1
				task.resolve(result)
			})
			.catch((error) => {
				this.failedCount += 1
				task.reject(error)
			})
			.finally(() => {
				this.activeTotal = Math.max(0, this.activeTotal - 1)
				this.activeByKind[task.kind] = Math.max(0, this.activeByKind[task.kind] - 1)
				this.pump()
			})
	}
}
