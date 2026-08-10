import {
	toDisplayUploadProgress,
	UPLOAD_PROGRESS_UPDATE_INTERVAL_MS,
} from "../../utils/uploadProgress"

export type UploadProgressBatch = ReadonlyMap<string, number>

/**
 * Coalesces noisy SDK progress callbacks into one observable update window.
 * Initial and terminal values bypass the timer so the UI never lags behind a state change.
 */
export class UploadProgressBatcher {
	private readonly pendingProgress = new Map<string, number>()
	private readonly committedProgress = new Map<string, number>()
	private timer: ReturnType<typeof setTimeout> | undefined

	constructor(
		private readonly onFlush: (updates: UploadProgressBatch) => void,
		private readonly wait = UPLOAD_PROGRESS_UPDATE_INTERVAL_MS,
	) {}

	begin(fileId: string) {
		this.remove(fileId)
		this.committedProgress.set(fileId, 0)
	}

	enqueue(fileId: string, progress: number) {
		const displayProgress = toDisplayUploadProgress(progress)
		if (displayProgress === undefined) return
		// Ignore callbacks that arrive after the upload body has already reached 100%.
		// begin() resets this guard for a genuine retry cycle.
		if (this.committedProgress.get(fileId) === 100 && displayProgress < 100) return

		if (displayProgress === 0 || displayProgress === 100) {
			this.commitImmediately(fileId, displayProgress)
			return
		}

		if (
			this.pendingProgress.get(fileId) === displayProgress ||
			(!this.pendingProgress.has(fileId) &&
				this.committedProgress.get(fileId) === displayProgress)
		) {
			return
		}

		this.pendingProgress.set(fileId, displayProgress)
		this.scheduleFlush()
	}

	complete(fileId: string) {
		this.commitImmediately(fileId, 100)
	}

	remove(fileId: string) {
		this.pendingProgress.delete(fileId)
		this.committedProgress.delete(fileId)
		this.clearTimerWhenIdle()
	}

	dispose() {
		if (this.timer) clearTimeout(this.timer)
		this.timer = undefined
		this.pendingProgress.clear()
		this.committedProgress.clear()
	}

	private commitImmediately(fileId: string, progress: number) {
		this.pendingProgress.delete(fileId)
		this.clearTimerWhenIdle()

		if (this.committedProgress.get(fileId) === progress) return

		this.committedProgress.set(fileId, progress)
		this.onFlush(new Map([[fileId, progress]]))
	}

	private scheduleFlush() {
		if (this.timer) return

		this.timer = setTimeout(() => {
			this.timer = undefined
			this.flushPendingProgress()
		}, this.wait)
	}

	private flushPendingProgress() {
		if (this.pendingProgress.size === 0) return

		const updates = new Map<string, number>()
		this.pendingProgress.forEach((progress, fileId) => {
			if (this.committedProgress.get(fileId) === progress) return
			this.committedProgress.set(fileId, progress)
			updates.set(fileId, progress)
		})
		this.pendingProgress.clear()

		if (updates.size > 0) this.onFlush(updates)
	}

	private clearTimerWhenIdle() {
		if (this.pendingProgress.size > 0 || !this.timer) return
		clearTimeout(this.timer)
		this.timer = undefined
	}
}
