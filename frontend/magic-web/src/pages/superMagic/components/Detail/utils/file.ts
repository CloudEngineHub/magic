import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import { isSlidesTemplateFolder } from "../../TopicFilesButton/utils/slides-template-folder"

function collectAttachmentItems(
	items: AttachmentItem[] | undefined,
	result: AttachmentItem[] = [],
): AttachmentItem[] {
	for (const item of items || []) {
		result.push(item)
		collectAttachmentItems(item.children, result)
	}
	return result
}

function getAttachmentName(item: AttachmentItem | undefined): string {
	return item?.file_name || item?.filename || item?.name || item?.display_filename || ""
}

function isHtmlFile(item: AttachmentItem | undefined): boolean {
	return (
		item?.file_extension?.toLowerCase() === "html" ||
		getAttachmentName(item).toLowerCase().endsWith(".html")
	)
}

export const hasPPTMetadata = (attachmentItem: AttachmentItem) => {
	return attachmentItem?.display_config?.type === "slide"
}

/** Detect if a folder/file carries self-media metadata */
export const hasSelfMediaMetadata = (
	attachmentItem: AttachmentItem | { metadata?: Record<string, unknown> } | null,
) => {
	return attachmentItem?.metadata?.type === "self-media"
}

/**
 * Check if a file is in PPT mode by checking its parent folder's metadata
 */
export const isFileInPPTMode = (fileId: string, attachmentList: AttachmentItem[]): boolean => {
	const parentId = attachmentList?.find((item) => item.file_id === fileId)?.parent_id

	if (!parentId) return false

	const parentFolder = attachmentList.find((item) => item.file_id === parentId)

	return parentFolder ? hasPPTMetadata(parentFolder) : false
}

/** Check if an HTML file is a page inside a standard project slides template. */
export const isFileInSlidesTemplateMode = (
	fileId: string,
	attachmentList: AttachmentItem[] = [],
): boolean => {
	const items = collectAttachmentItems(attachmentList)
	const file = items.find((item) => String(item.file_id || "") === String(fileId || ""))
	if (!file || !isHtmlFile(file)) return false

	const slidesDirectory = items.find(
		(item) => String(item.file_id || "") === String(file.parent_id || ""),
	)
	if (!slidesDirectory?.is_directory || getAttachmentName(slidesDirectory) !== "slides") {
		return false
	}

	const templateRoot = items.find(
		(item) => String(item.file_id || "") === String(slidesDirectory.parent_id || ""),
	)
	if (!templateRoot?.is_directory) return false

	const rootChildrenById = items.filter(
		(item) => String(item.parent_id || "") === String(templateRoot.file_id || ""),
	)
	const rootChildren = Array.from(
		new Map(
			[...(templateRoot.children || []), ...rootChildrenById].map((item) => [
				String(item.file_id || getAttachmentName(item)),
				item,
			]),
		).values(),
	)

	return isSlidesTemplateFolder({ ...templateRoot, children: rootChildren })
}

/** Fixed-size slide canvas preview, shared by PPT projects and project slide templates. */
export const isFileInSlideCanvasMode = (
	fileId: string,
	attachmentList: AttachmentItem[] = [],
): boolean => {
	return (
		isFileInPPTMode(fileId, attachmentList) ||
		isFileInSlidesTemplateMode(fileId, attachmentList)
	)
}

/**
 * Check if a file's extension matches any of the given types.
 * @param attachmentItem - the file to check
 * @param extensions - allowed extensions to match against
 *
 * @example
 * isConvertibleFile(item, ["html"])           // only html → PPTX export
 * isConvertibleFile(item, ["html", "md"])     // html + md → PDF export
 */
export const isConvertibleFile = (
	attachmentItem: AttachmentItem,
	extensions: string[],
): boolean => {
	const ext = attachmentItem?.file_extension?.toLowerCase() ?? ""
	return extensions.includes(ext)
}
