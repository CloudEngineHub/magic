import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { AttachmentIndex } from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"

export type MobileAttachmentCheckState = "checked" | "unchecked" | "indeterminate"

export interface MobileAttachmentSearchResult {
	item: AttachmentItem
	pathItems: AttachmentItem[]
	pathLabel: string
}

export type MobileAttachmentTreeIndex = AttachmentIndex
