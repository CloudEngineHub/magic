import type { AudioProjectListItem } from "@/types/audioProject"

export type AudioProjectCopyUnavailableReason = "missingProjectId" | "statusUnavailable"

export type AudioProjectCopyAvailability =
	| { canCopy: true }
	| { canCopy: false; reason: AudioProjectCopyUnavailableReason }

const BLOCKED_CARD_STATUSES = new Set<AudioProjectListItem["card_status"]>([
	"uploading",
	"upload_failed",
	"waiting",
	"processing",
	"merge_failed",
	"summarizing",
])

const ACTIVE_PHASE_STATUSES = new Set<string>([
	"running",
	"processing",
	"waiting",
	"in_progress",
	"pending",
])

/**
 * Centralizes recording copy eligibility so list, detail, and mobile entry points
 * disable the action for the same pipeline states.
 */
export function canCopyAudioProject(item: AudioProjectListItem | null | undefined) {
	if (!item?.id) {
		return { canCopy: false, reason: "missingProjectId" } satisfies AudioProjectCopyAvailability
	}

	if (BLOCKED_CARD_STATUSES.has(item.card_status)) {
		return {
			canCopy: false,
			reason: "statusUnavailable",
		} satisfies AudioProjectCopyAvailability
	}

	if (item.current_phase === "summarizing" && item.phase_status !== "completed") {
		return {
			canCopy: false,
			reason: "statusUnavailable",
		} satisfies AudioProjectCopyAvailability
	}

	if (item.current_phase === "merging" && item.phase_status !== "completed") {
		return {
			canCopy: false,
			reason: "statusUnavailable",
		} satisfies AudioProjectCopyAvailability
	}

	if (item.phase_status && ACTIVE_PHASE_STATUSES.has(item.phase_status)) {
		return {
			canCopy: false,
			reason: "statusUnavailable",
		} satisfies AudioProjectCopyAvailability
	}

	return { canCopy: true } satisfies AudioProjectCopyAvailability
}
