import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import {
	buildAttachmentIndex,
	resolveAttachmentId,
} from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import type { MobileAttachmentSearchResult, MobileAttachmentTreeIndex } from "../types"

/** Reads the first available display field from an attachment payload. */
export function getAttachmentDisplayName(item: AttachmentItem): string {
	return item.name || item.file_name || item.display_filename || item.filename || ""
}

/** Resolves the stable identifier shared by nested and flattened attachment payloads. */
export function getAttachmentId(item: AttachmentItem): string | undefined {
	return resolveAttachmentId(item)
}

/** Builds one immutable lookup snapshot for navigation, search, and selection operations. */
export function buildMobileAttachmentTreeIndex(
	attachments: AttachmentItem[],
): MobileAttachmentTreeIndex {
	return buildAttachmentIndex(attachments, { includeHidden: true })
}

/** Searches the indexed tree without re-traversing it during row rendering. */
export function searchMobileAttachmentTree(
	index: MobileAttachmentTreeIndex,
	query: string,
	includeItem: (item: AttachmentItem) => boolean,
): MobileAttachmentSearchResult[] {
	const normalizedQuery = query.trim().toLowerCase()
	if (!normalizedQuery) return []

	const results: MobileAttachmentSearchResult[] = []
	for (const entry of index.entriesById.values()) {
		const item = entry.item
		if (!includeItem(item)) continue
		const name = getAttachmentDisplayName(item).toLowerCase()
		const extension = (item.file_extension || "").toLowerCase()
		if (!name.includes(normalizedQuery) && !extension.includes(normalizedQuery)) continue
		const itemId = getAttachmentId(item) || ""
		const pathItems = [...index.getParentItemsById(itemId), item]
		results.push({
			item,
			pathItems: pathItems.slice(0, -1),
			pathLabel: pathItems.slice(0, -1).map(getAttachmentDisplayName).join(" / "),
		})
	}
	return results
}
