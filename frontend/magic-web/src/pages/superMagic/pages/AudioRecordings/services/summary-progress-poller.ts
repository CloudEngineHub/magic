import { SuperMagicApi } from "@/apis"
import type { RecordTaskProgress } from "@/apis/modules/superMagic/recordSummary"

const POLL_INTERVAL_MS = 10000

export interface SummaryProgressPollerCallbacks {
	onProgress: (task: RecordTaskProgress) => void
	onTaskDone: (taskKey: string) => void
	onTaskMissing: (taskKey: string) => void
}

/** Polls ASR task progress in batch while the recordings list page is mounted */
export class SummaryProgressPoller {
	private taskKeys = new Set<string>()
	private timer: ReturnType<typeof setInterval> | null = null
	private callbacks: SummaryProgressPollerCallbacks | null = null
	private isPolling = false

	/** Registers store callbacks for progress updates */
	setCallbacks(callbacks: SummaryProgressPollerCallbacks | null) {
		this.callbacks = callbacks
	}

	/** Adds a task to the poll set and triggers an immediate fetch */
	addTask(taskKey: string) {
		if (!taskKey) return
		this.taskKeys.add(taskKey)
		void this.pollOnce()
		this.startInterval()
	}

	/** Removes a task from polling without stopping the interval if others remain */
	removeTask(taskKey: string) {
		this.taskKeys.delete(taskKey)
		if (this.taskKeys.size === 0) this.stopInterval()
	}

	/** Clears all tasks and stops polling — call on page unmount */
	dispose() {
		this.taskKeys.clear()
		this.stopInterval()
		this.callbacks = null
	}

	private startInterval() {
		if (this.timer || this.taskKeys.size === 0) return
		this.timer = setInterval(() => {
			void this.pollOnce()
		}, POLL_INTERVAL_MS)
	}

	private stopInterval() {
		if (!this.timer) return
		clearInterval(this.timer)
		this.timer = null
	}

	/**
	 * Returns true when the task response indicates the pipeline is fully done.
	 * The pipeline is done only when:
	 * 1. The overall task has failed (task_status === "failed"), OR
	 * 2. The summarizing phase itself has completed or failed (phase_status is completed/failed).
	 * We must NOT treat task_status === "completed" as terminal if summarizing is still in_progress.
	 */
	private isTaskTerminal(task: RecordTaskProgress): boolean {
		if (task.task_status === "failed") return true
		if (task.current_phase === "summarizing") {
			return task.phase_status === "completed" || task.phase_status === "failed"
		}
		return false
	}

	/** Fetches progress for all tracked task keys in one batch request */
	private async pollOnce() {
		// If callbacks were cleared (e.g., dispose() was called while a previous
		// pollOnce was in flight), stop the interval proactively so the timer
		// doesn't keep firing after the page unmounts.
		if (!this.callbacks) {
			this.stopInterval()
			return
		}
		if (this.isPolling || this.taskKeys.size === 0) return

		const keys = [...this.taskKeys]
		this.isPolling = true

		try {
			const response = await SuperMagicApi.batchTaskProgress({ task_keys: keys })
			const tasks = response.tasks ?? []

			// Guard against dispose() being called while we awaited the response.
			const callbacks = this.callbacks
			if (!callbacks) return

			for (const task of tasks) {
				if (!task.task_key) continue

				if (task.exists === false) {
					this.taskKeys.delete(task.task_key)
					callbacks.onTaskMissing(task.task_key)
					continue
				}

				callbacks.onProgress(task)

				// Remove the task when either the overall pipeline or the current phase is done.
				if (this.isTaskTerminal(task)) {
					this.taskKeys.delete(task.task_key)
					callbacks.onTaskDone(task.task_key)
				}
			}
		} catch {
			// Keep polling on transient network errors
		} finally {
			this.isPolling = false
			if (this.taskKeys.size === 0) this.stopInterval()
		}
	}
}

/** Module singleton shared by the recordings list store */
export const summaryProgressPoller = new SummaryProgressPoller()
