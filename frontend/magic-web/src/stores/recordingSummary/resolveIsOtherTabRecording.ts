import type { TabStatus } from "@/services/recordSummary/TabCoordinator"
import type { RecordingStatus } from "@/types/recordSummary"

/**
 * Resolves whether the UI should treat the mirrored cross-tab session as
 * "other tab recording" instead of suppressing the current tab's own panel.
 */
export function resolveIsOtherTabRecording(params: {
	localStatus: RecordingStatus
	tabStatus: TabStatus
	mirroredIsRecording: boolean
}): boolean {
	const { localStatus, tabStatus, mirroredIsRecording } = params

	// Local active sessions always win over stale cross-tab mirrors.
	if (localStatus === "recording" || localStatus === "paused") {
		return false
	}

	return tabStatus !== "active" && mirroredIsRecording
}
