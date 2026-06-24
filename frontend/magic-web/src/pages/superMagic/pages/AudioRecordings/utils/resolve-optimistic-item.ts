import type { AudioProjectListItem } from "@/types/audioProject"

const OPTIMISTIC_UPLOADING_TRANSFER = new Set(["transferring", "failed"])
const OPTIMISTIC_UPLOADING_CARD = new Set(["uploading", "upload_failed"])
const AUTHORITATIVE_SUMMARY_CAUGHT_UP_CARD = new Set([
	"summarizing",
	"summarized",
	"summary_failed",
])

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

	// Keep a local summarizing state until the backend row itself catches up; otherwise
	// a stale `not_summarized` authoritative row would regress the card back to "Generate Summary".
	if (
		optimisticItem.card_status === "summarizing" &&
		authoritativeItem &&
		!AUTHORITATIVE_SUMMARY_CAUGHT_UP_CARD.has(authoritativeItem.card_status)
	) {
		return false
	}

	return true
}
