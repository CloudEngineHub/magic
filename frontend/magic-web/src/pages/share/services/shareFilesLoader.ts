import { SuperMagicApi } from "@/apis"
import type { ShareFilesV2NextParentState } from "@/apis/modules/superMagic"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import { createProjectAttachmentsV2Builder } from "@/pages/superMagic/utils/projectAttachments/v2Adapter"

const DEFAULT_SHARE_FILES_PAGE_SIZE = 1000

export interface LoadShareFilesOptions {
	resourceId: string
	password?: string
	pageSize?: number
	signal?: AbortSignal
}

function normalizeNextParentIds(nextParentIds: ShareFilesV2NextParentState[] | null | undefined) {
	// The cursor is owned by the backend. Keep the array and every cursor field unchanged.
	return Array.isArray(nextParentIds) ? nextParentIds : []
}

function createCursorKey(nextParentIds: ShareFilesV2NextParentState[]) {
	// Cursor queues are small protocol state, so serialization is bounded and avoids a paging loop.
	return JSON.stringify(nextParentIds)
}

function throwIfAborted(signal?: AbortSignal) {
	if (!signal?.aborted) return
	throw new DOMException("Share files request aborted", "AbortError")
}

/**
 * Loads every V2 cursor page and reuses the project attachment builder so share pages keep the
 * same tree/list contract, path normalization, hidden-file handling, and display configuration.
 */
export async function loadShareFilesV2({
	resourceId,
	password,
	pageSize = DEFAULT_SHARE_FILES_PAGE_SIZE,
	signal,
}: LoadShareFilesOptions) {
	const builder = createProjectAttachmentsV2Builder()
	const seenCursorKeys = new Set<string>()
	let nextParentIds: ShareFilesV2NextParentState[] = []
	let shouldContinue = true

	while (shouldContinue) {
		throwIfAborted(signal)
		const requestParams = {
			resourceId,
			password,
			pageSize,
			nextParentIds,
		}
		const response = await SuperMagicApi.getShareResourceFilesV2Page(requestParams, { signal })
		throwIfAborted(signal)

		builder.mergeBatch(Array.isArray(response.list) ? response.list : [])
		if (!response.has_more) {
			shouldContinue = false
			continue
		}

		const responseCursor = normalizeNextParentIds(response.next_parent_ids)
		if (responseCursor.length === 0) {
			throw new Error("share_files_v2_empty_cursor")
		}

		const cursorKey = createCursorKey(responseCursor)
		if (seenCursorKeys.has(cursorKey)) {
			throw new Error("share_files_v2_repeated_cursor")
		}

		seenCursorKeys.add(cursorKey)
		nextParentIds = responseCursor
	}

	const snapshot = builder.finalize()
	return AttachmentDataProcessor.processAttachmentData(
		{
			tree: snapshot.tree,
			list: snapshot.list,
		},
		{ preserveList: true },
	) as { tree: AttachmentItem[]; list: AttachmentItem[] }
}
