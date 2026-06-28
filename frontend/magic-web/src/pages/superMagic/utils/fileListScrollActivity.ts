import { manualPerfLogger } from "@/utils/manualPerfLogger"

export const FILE_LIST_SCROLL_IDLE_MS = 1500

let lastScrollAt = -Infinity

export function markProjectFileListScrollActivity() {
	lastScrollAt = manualPerfLogger.now()
}

export function getProjectFileListScrollIdleDelayMs() {
	const elapsedMs = manualPerfLogger.now() - lastScrollAt
	return Math.max(0, FILE_LIST_SCROLL_IDLE_MS - elapsedMs)
}

export function resetProjectFileListScrollActivity() {
	lastScrollAt = -Infinity
}
