import { collectFileIdsFromHtml } from "@/pages/superMagic/components/Detail/contents/HTML/htmlProcessor"
import {
	buildAttachmentIndex,
	type AttachmentIndex,
} from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { getFileContentById } from "@/pages/superMagic/utils/api"

export type HtmlStaticDependencyAttachment = AttachmentItem

export interface SingleHtmlStaticDependencyResult {
	isHtml: boolean
	dependencyFileIds: string[]
	/** IDs to use for move/copy. Nested assets are replaced by their top-level directory. */
	dependencyTransferFileIds: string[]
}

function isHtmlFile(file: HtmlStaticDependencyAttachment): boolean {
	if (file.is_directory) return false

	const extension = (file.file_extension || file.file_name?.split(".").pop() || "").toLowerCase()
	return extension === "html" || extension === "htm"
}

function getDirectoryPath(relativeFilePath?: string): string {
	if (!relativeFilePath) return ""
	const lastSlashIndex = relativeFilePath.lastIndexOf("/")
	return lastSlashIndex === -1 ? "" : relativeFilePath.slice(0, lastSlashIndex + 1)
}

function getDependencyTransferFileIds({
	htmlFileId,
	dependencyFileIds,
	attachmentIndex,
}: {
	htmlFileId: string
	dependencyFileIds: string[]
	attachmentIndex: AttachmentIndex
}): string[] {
	const htmlDirectoryPathKeys = attachmentIndex.getPathKeysById(htmlFileId).slice(0, -1)

	return Array.from(
		new Set(
			dependencyFileIds.map((dependencyFileId) => {
				const dependencyPathKeys = attachmentIndex.getPathKeysById(dependencyFileId)
				let commonPathLength = 0

				while (
					commonPathLength < htmlDirectoryPathKeys.length &&
					commonPathLength < dependencyPathKeys.length &&
					htmlDirectoryPathKeys[commonPathLength] === dependencyPathKeys[commonPathLength]
				) {
					commonPathLength += 1
				}

				// The first dependency node below the common directory is the highest folder we can
				// carry without also moving the HTML's own directory or one of its ancestors.
				const transferRoot = attachmentIndex.getItemByKey(
					dependencyPathKeys[commonPathLength],
				)
				return transferRoot?.file_id || dependencyFileId
			}),
		),
	)
}

/**
 * Resolves dependencies only for a single HTML file. Batch selection deliberately stays on the
 * existing path so an operation cannot fan out into many browser content requests.
 */
export async function resolveSingleHtmlStaticDependencies({
	fileIds,
	attachments,
	attachmentIndex,
}: {
	fileIds: string[]
	attachments: HtmlStaticDependencyAttachment[]
	attachmentIndex?: AttachmentIndex
}): Promise<SingleHtmlStaticDependencyResult> {
	if (fileIds.length !== 1) {
		return { isHtml: false, dependencyFileIds: [], dependencyTransferFileIds: [] }
	}

	// Keep hidden assets in the lookup: an HTML file may depend on them even though the tree does
	// not render them. Callers that already own an index can pass it to avoid rebuilding it.
	const resolvedAttachmentIndex =
		attachmentIndex ?? buildAttachmentIndex(attachments, { includeHidden: true })
	const htmlFile = resolvedAttachmentIndex.getItemById(fileIds[0])
	if (!htmlFile || !htmlFile.file_id || !isHtmlFile(htmlFile)) {
		return { isHtml: false, dependencyFileIds: [], dependencyTransferFileIds: [] }
	}

	const content = await getFileContentById(htmlFile.file_id, { responseType: "text" })
	if (typeof content !== "string") {
		throw new Error("HTML dependency analysis requires text content")
	}

	const dependencyFileIds = Array.from(
		collectFileIdsFromHtml({
			content,
			attachments,
			html_relative_path: getDirectoryPath(htmlFile.relative_file_path),
			displayConfig: htmlFile.display_config,
		}),
	).filter((fileId) => fileId !== htmlFile.file_id)

	const uniqueDependencyFileIds = [...new Set(dependencyFileIds)]

	return {
		isHtml: true,
		dependencyFileIds: uniqueDependencyFileIds,
		dependencyTransferFileIds: getDependencyTransferFileIds({
			htmlFileId: htmlFile.file_id,
			dependencyFileIds: uniqueDependencyFileIds,
			attachmentIndex: resolvedAttachmentIndex,
		}),
	}
}

export function mergeHtmlStaticDependencyFileIds(
	fileIds: string[],
	dependencyFileIds: string[],
	includeDependencies: boolean,
): string[] {
	return includeDependencies
		? [...new Set([...fileIds, ...dependencyFileIds])]
		: [...new Set(fileIds)]
}
