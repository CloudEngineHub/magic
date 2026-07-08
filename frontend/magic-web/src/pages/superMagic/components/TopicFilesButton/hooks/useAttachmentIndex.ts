import { useMemo } from "react"
import { measureFileTreeOperation } from "@/pages/superMagic/utils/fileTreePerf"
import { buildAttachmentIndex } from "../utils/attachmentIndex"
import type { AttachmentItem } from "./types"
import { recordAttachmentIndexStructureMetrics } from "./useAttachmentIndexPerf"

interface UseAttachmentIndexOptions {
	mergedFiles: AttachmentItem[]
	cacheIdentity?: string
}

export function useAttachmentIndex({ mergedFiles, cacheIdentity = "" }: UseAttachmentIndexOptions) {
	const attachmentIndex = useMemo(() => {
		return measureFileTreeOperation(
			"attachment_index_build_ms",
			mergedFiles,
			() => buildAttachmentIndex(mergedFiles),
			(nextAttachmentIndex) => {
				const context = {
					cache_identity: cacheIdentity,
					attachment_index_entry_count: nextAttachmentIndex.totalCount,
				}
				return {
					...context,
					...recordAttachmentIndexStructureMetrics(nextAttachmentIndex, context),
				}
			},
		)
	}, [cacheIdentity, mergedFiles])

	return {
		attachmentIndex,
	}
}
