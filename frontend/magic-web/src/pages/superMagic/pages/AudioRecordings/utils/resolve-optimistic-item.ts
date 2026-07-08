import type { AudioProjectListItem } from "@/types/audioProject"

const OPTIMISTIC_UPLOADING_TRANSFER = new Set(["transferring", "failed"])
const OPTIMISTIC_UPLOADING_CARD = new Set(["uploading", "upload_failed"])

/**
 * Decides whether an optimistic item should be cleared (replaced by the
 * authoritative backend row). Most non-uploading optimistic items are cleared
 * as soon as the backend row for the same project exists, but there is one
 * intentional exception:
 * - keep local `summarizing` while the authoritative row is still behind
 *   (for example `merging + completed` / `not_summarized`)
 *
 * This prevents imported auto-summary cards from regressing back to
 * "Generate Summary" during the short window before the backend list catches up.
 *
 * The caller is responsible for guaranteeing that the matching authoritative
 * row already exists in the backend list; this helper only inspects the
 * optimistic item plus the already-found authoritative row.
 *
 * @returns true when the optimistic item should be cleared
 */
export function shouldResolveOptimisticItem(
	optimisticItem: AudioProjectListItem,
	authoritativeItem?: AudioProjectListItem,
): boolean {
	const isUploading =
		OPTIMISTIC_UPLOADING_TRANSFER.has(optimisticItem.transferStatus ?? "") ||
		OPTIMISTIC_UPLOADING_CARD.has(optimisticItem.card_status)
	if (isUploading) return false

	// Keep a local summarizing state until the backend row itself reports summarizing.
	// A stale summarized/summary_failed row can be from the previous summary attempt, so
	// resolving it too early would regress the card right after re-summary starts.
	if (
		optimisticItem.card_status === "summarizing" &&
		authoritativeItem &&
		authoritativeItem.card_status !== "summarizing"
	) {
		return false
	}

	return true
}
