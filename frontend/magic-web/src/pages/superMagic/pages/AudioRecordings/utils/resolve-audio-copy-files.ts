import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

/**
 * Extracts root-level visible file/folder ids for whole-project recording copy.
 * Folder ids are intentionally kept as outer ids so the backend can recursively
 * copy children while preserving directory structure.
 */
export function resolveAudioCopyRootFileIds(attachments: AttachmentItem[] | null | undefined) {
	if (!attachments?.length) return []

	return attachments
		.filter((item) => !item.is_hidden && Boolean(item.file_id))
		.map((item) => item.file_id)
}
