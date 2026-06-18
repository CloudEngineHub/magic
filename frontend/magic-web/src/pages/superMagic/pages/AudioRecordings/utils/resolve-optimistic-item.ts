import type { AudioProjectListItem } from "@/types/audioProject"

const OPTIMISTIC_UPLOADING_TRANSFER = new Set(["transferring", "failed"])
const OPTIMISTIC_UPLOADING_CARD = new Set(["uploading", "upload_failed"])

/**
 * Decides whether an optimistic item should be cleared (replaced by the
 * authoritative backend row). the only state that
 * keeps the optimistic item is "uploading" — all other backend states
 * (not_summarized / summarizing / summarized / summary_failed) directly replace
 * the local placeholder.
 *
 * The caller is responsible for guaranteeing that the matching authoritative
 * row already exists in the backend list; this helper only inspects the
 * optimistic item itself.
 *
 * @returns true when the optimistic item should be cleared
 */
export function shouldResolveOptimisticItem(optimisticItem: AudioProjectListItem): boolean {
	const isUploading =
		OPTIMISTIC_UPLOADING_TRANSFER.has(optimisticItem.transferStatus ?? "") ||
		OPTIMISTIC_UPLOADING_CARD.has(optimisticItem.card_status)
	return !isUploading
}
