/**
 * Shared helpers for Agent / Skill async publish:
 * create task → poll check until ready / failed, with optional sessionStorage resume.
 */

export type AsyncPublishResourceType = "agent" | "skill"

export type AsyncPublishStatus = "processing" | "ready" | "failed"

export interface AsyncPublishTaskSnapshot {
	publish_task_id: string
	status: AsyncPublishStatus
	progress?: number | null
	error?: string | null
}

export interface PollPublishOptions {
	check: () => Promise<AsyncPublishTaskSnapshot>
	intervalMs?: number
	maxAttempts?: number
	onProgress?: (progress: number) => void
	signal?: AbortSignal
}

export type AsyncPublishFailureReason = "failed" | "timeout" | "aborted" | "expired"

export class AsyncPublishError extends Error {
	readonly reason: AsyncPublishFailureReason

	constructor(message: string, reason: AsyncPublishFailureReason) {
		super(message)
		this.name = "AsyncPublishError"
		this.reason = reason
	}
}

const DEFAULT_POLL_INTERVAL_MS = 2500
const DEFAULT_MAX_ATTEMPTS = 100
const STORAGE_KEY_PREFIX = "async-publish-task:"

function getStorageKey(resourceType: AsyncPublishResourceType, code: string) {
	return `${STORAGE_KEY_PREFIX}${resourceType}:${code}`
}

/** Persist publish_task_id so re-entering the page can resume polling. */
export function savePendingPublishTask(
	resourceType: AsyncPublishResourceType,
	code: string,
	publishTaskId: string,
) {
	if (typeof sessionStorage === "undefined" || !code || !publishTaskId) return
	try {
		sessionStorage.setItem(getStorageKey(resourceType, code), publishTaskId)
	} catch {
		// Ignore quota / private-mode failures
	}
}

export function loadPendingPublishTask(
	resourceType: AsyncPublishResourceType,
	code: string,
): string | null {
	if (typeof sessionStorage === "undefined" || !code) return null
	try {
		return sessionStorage.getItem(getStorageKey(resourceType, code))
	} catch {
		return null
	}
}

export function clearPendingPublishTask(resourceType: AsyncPublishResourceType, code: string) {
	if (typeof sessionStorage === "undefined" || !code) return
	try {
		sessionStorage.removeItem(getStorageKey(resourceType, code))
	} catch {
		// Ignore storage failures
	}
}

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(new AsyncPublishError("Publish polling aborted", "aborted"))
			return
		}

		const timer = window.setTimeout(() => {
			signal?.removeEventListener("abort", onAbort)
			resolve()
		}, ms)

		function onAbort() {
			window.clearTimeout(timer)
			reject(new AsyncPublishError("Publish polling aborted", "aborted"))
		}

		signal?.addEventListener("abort", onAbort, { once: true })
	})
}

function throwIfAborted(signal?: AbortSignal) {
	if (signal?.aborted) throw new AsyncPublishError("Publish polling aborted", "aborted")
}

/**
 * Poll publish/check until status is ready or failed.
 * Treats missing / expired task responses as failed so the user can republish.
 */
export async function pollPublishTask(
	options: PollPublishOptions,
): Promise<AsyncPublishTaskSnapshot> {
	const {
		check,
		intervalMs = DEFAULT_POLL_INTERVAL_MS,
		maxAttempts = DEFAULT_MAX_ATTEMPTS,
		onProgress,
		signal,
	} = options

	for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
		throwIfAborted(signal)

		let result: AsyncPublishTaskSnapshot
		try {
			result = await check()
		} catch (error) {
			// Task gone / expired → treat as failed so UI unlocks for retry
			if (isPublishTaskMissingError(error)) {
				throw new AsyncPublishError(
					"Publish task expired or not found. Please publish again.",
					"expired",
				)
			}
			throw error
		}

		onProgress?.(typeof result.progress === "number" ? result.progress : 0)

		if (result.status === "ready") return result

		if (result.status === "failed") {
			throw new AsyncPublishError(
				result.error?.trim() || "Publish failed. Please try again.",
				"failed",
			)
		}

		await sleep(intervalMs, signal)
	}

	throw new AsyncPublishError(
		"Publish is taking longer than expected. Please check again later.",
		"timeout",
	)
}

export interface RunAsyncPublishOptions {
	resourceType: AsyncPublishResourceType
	code: string
	create: () => Promise<AsyncPublishTaskSnapshot>
	check: (publishTaskId: string) => Promise<AsyncPublishTaskSnapshot>
	onProgress?: (progress: number) => void
	signal?: AbortSignal
	/** When set, skip create and resume polling an existing task. */
	resumePublishTaskId?: string | null
}

export interface ResumePendingPublishOptions {
	resourceType: AsyncPublishResourceType
	code: string
	publishTaskId: string
	check: (publishTaskId: string) => Promise<AsyncPublishTaskSnapshot>
	onProgress?: (progress: number) => void
	signal?: AbortSignal
	/**
	 * Called only when the task is still processing and the UI should enter waiting state.
	 * Not called when the first check already returns ready / failed.
	 */
	onStartWaiting?: () => void
}

export interface ResumePendingPublishResult {
	/** True when the first check already found status=ready (no waiting UI needed). */
	alreadyReady: boolean
	task: AsyncPublishTaskSnapshot
}

/**
 * Create (or resume) an async publish task and poll until ready.
 * Persists publish_task_id in sessionStorage while processing.
 */
export async function runAsyncPublish(
	options: RunAsyncPublishOptions,
): Promise<AsyncPublishTaskSnapshot> {
	const { resourceType, code, create, check, onProgress, signal, resumePublishTaskId } = options

	let publishTaskId = resumePublishTaskId?.trim() || ""

	if (!publishTaskId) {
		throwIfAborted(signal)
		const created = await create()
		publishTaskId = created.publish_task_id
		onProgress?.(typeof created.progress === "number" ? created.progress : 0)

		if (created.status === "ready") {
			clearPendingPublishTask(resourceType, code)
			return created
		}

		if (created.status === "failed") {
			clearPendingPublishTask(resourceType, code)
			throw new AsyncPublishError(
				created.error?.trim() || "Publish failed. Please try again.",
				"failed",
			)
		}

		if (!publishTaskId) {
			throw new AsyncPublishError("Missing publish_task_id from create response", "failed")
		}

		savePendingPublishTask(resourceType, code, publishTaskId)
	} else {
		savePendingPublishTask(resourceType, code, publishTaskId)
	}

	try {
		const result = await pollPublishTask({
			check: () => check(publishTaskId),
			onProgress,
			signal,
		})
		clearPendingPublishTask(resourceType, code)
		return result
	} catch (error) {
		if (error instanceof AsyncPublishError && error.reason !== "aborted") {
			clearPendingPublishTask(resourceType, code)
		}
		throw error
	}
}

/**
 * Resume a pending publish task after re-entering the page.
 * If the first check is already ready, settle silently without entering waiting UI.
 */
export async function resumePendingPublish(
	options: ResumePendingPublishOptions,
): Promise<ResumePendingPublishResult> {
	const { resourceType, code, publishTaskId, check, onProgress, signal, onStartWaiting } = options
	const taskId = publishTaskId.trim()
	if (!taskId) {
		throw new AsyncPublishError("Missing publish_task_id", "failed")
	}

	throwIfAborted(signal)

	let snapshot: AsyncPublishTaskSnapshot
	try {
		snapshot = await check(taskId)
	} catch (error) {
		if (isPublishTaskMissingError(error)) {
			clearPendingPublishTask(resourceType, code)
			throw new AsyncPublishError(
				"Publish task expired or not found. Please publish again.",
				"expired",
			)
		}
		throw error
	}

	if (snapshot.status === "ready") {
		clearPendingPublishTask(resourceType, code)
		return { alreadyReady: true, task: snapshot }
	}

	if (snapshot.status === "failed") {
		clearPendingPublishTask(resourceType, code)
		throw new AsyncPublishError(
			snapshot.error?.trim() || "Publish failed. Please try again.",
			"failed",
		)
	}

	// Still processing — show waiting UI, then poll until terminal status.
	onStartWaiting?.()
	onProgress?.(typeof snapshot.progress === "number" ? snapshot.progress : 0)
	savePendingPublishTask(resourceType, code, taskId)

	try {
		const task = await pollPublishTask({
			check: () => check(taskId),
			onProgress,
			signal,
		})
		clearPendingPublishTask(resourceType, code)
		return { alreadyReady: false, task }
	} catch (error) {
		if (error instanceof AsyncPublishError && error.reason !== "aborted") {
			clearPendingPublishTask(resourceType, code)
		}
		throw error
	}
}

function isPublishTaskMissingError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false
	const message =
		"message" in error && typeof error.message === "string" ? error.message.toLowerCase() : ""
	return (
		message.includes("不存在") ||
		message.includes("过期") ||
		message.includes("not found") ||
		message.includes("expired")
	)
}

/** Map AsyncPublishError to a user-facing i18n string (crew/market namespace). */
export function resolveAsyncPublishErrorMessage(
	error: AsyncPublishError,
	t: (key: string) => string,
): string {
	if (error.reason === "timeout") {
		return t("skillEditPage.publishPanel.toast.publishTimeout")
	}
	if (error.reason === "expired") {
		return t("skillEditPage.publishPanel.toast.publishTaskExpired")
	}
	if (error.reason === "failed" && error.message.trim()) {
		const message = error.message.trim()
		// Prefer backend error text when it is already localized / specific
		if (
			message !== "Publish failed. Please try again." &&
			message !== "Publish is taking longer than expected. Please check again later." &&
			message !== "Publish task expired or not found. Please publish again."
		) {
			return message
		}
	}
	return t("skillEditPage.publishPanel.toast.publishFailed")
}
