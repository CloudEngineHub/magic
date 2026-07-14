import { createAbortError } from "../sandbox/abort"

/**
 * Throw AbortError if the signal has already been aborted
 */
export function ensureNotAborted(signal: AbortSignal): void {
	if (signal.aborted) throw createAbortError()
}
