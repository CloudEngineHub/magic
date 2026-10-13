import type {
	MentionItem,
	MentionPanelSelectionAssetType,
	MentionPanelSelectionSummary,
} from "../types"

export type MentionPanelSelectionSummaryCounts = Record<MentionPanelSelectionAssetType, number>

function normalizeCount(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0
}

/**
 * Merge committed resource counts with the current session's pending entries.
 * Pending entries can come from several folders, so this calculation deliberately
 * lives outside the breadcrumb renderer and applies the host's duplicate check once.
 */
export function getMentionPanelSelectionSummaryCounts(
	selectionSummary: MentionPanelSelectionSummary | undefined,
	pendingEntries: Iterable<{ item: MentionItem }>,
): MentionPanelSelectionSummaryCounts | undefined {
	if (!selectionSummary) return undefined

	const counts: MentionPanelSelectionSummaryCounts = {
		image: normalizeCount(selectionSummary.currentCounts.image),
		video: normalizeCount(selectionSummary.currentCounts.video),
		audio: normalizeCount(selectionSummary.currentCounts.audio),
	}

	for (const { item } of pendingEntries) {
		if (selectionSummary.isItemAlreadySelected?.(item)) continue
		const assetType = selectionSummary.getItemAssetType?.(item)
		if (assetType) counts[assetType] += 1
	}

	return counts
}
