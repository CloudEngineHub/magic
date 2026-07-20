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
	 * Returns true when no further progress is expected and polling can stop.
	 *
	 * Terminal conditions:
	 * 1. Merging phase failed — phase_status is "failed"
	 * 2. Merging phase completed but auto_summary is false — manually triggered
	 *    summary, no further phase transition from the backend
	 * 3. Summarizing phase completed or failed — phase_status is "completed" or "failed"
	 *
	 * Merging completed with auto_summary === true is NOT terminal because the
	 * backend will automatically transition to the summarizing phase later.
	 */
	private isTaskTerminal(task: RecordTaskProgress): boolean {
		const phase = task.current_phase
		const status = task.phase_status

		if (phase === "merging") {
			if (status === "failed") return true
			if (status === "completed" && task.auto_summary === false) return true
			return false
		}

		if (phase === "summarizing") {
			return status === "completed" || status === "failed"
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
