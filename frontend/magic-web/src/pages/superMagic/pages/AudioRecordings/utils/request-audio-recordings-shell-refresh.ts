/**
 * Lets the recordings list shell register a refresh handler while mounted.
 * Callbacks from the shared record-summary flow can trigger list + group reloads
 * without importing page components directly.
 */
type AudioRecordingsShellRefreshHandler = () => void | Promise<void>

let activeShellRefreshHandler: AudioRecordingsShellRefreshHandler | null = null

/** Registers the active recordings list shell refresh handler (list + groups). */
export function registerAudioRecordingsShellRefreshHandler(
	handler: AudioRecordingsShellRefreshHandler,
): () => void {
	activeShellRefreshHandler = handler
	return () => {
		if (activeShellRefreshHandler === handler) {
			activeShellRefreshHandler = null
		}
	}
}

/** Refreshes list and group metadata when the recordings shell is currently mounted. */
export function requestAudioRecordingsShellRefresh(): void {
	void activeShellRefreshHandler?.()
}
