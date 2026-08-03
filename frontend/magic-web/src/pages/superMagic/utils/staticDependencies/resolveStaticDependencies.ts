import {
	buildAttachmentIndex,
	type AttachmentIndex,
} from "@/pages/superMagic/components/TopicFilesButton/utils/attachmentIndex"
import { getFileContentById } from "@/pages/superMagic/utils/api"
import { getStaticDependencyParser } from "./parserRegistry"
import type { StaticDependencyAttachment, StaticDependencyResult } from "./types"

const EMPTY_RESULT: StaticDependencyResult = {
	fileType: null,
	dependencyFileIds: [],
	dependencyTransferFileIds: [],
	missingResourcePaths: [],
}

/**
 * Resolves local resources for one supported document; batch selections return an empty result.
 * @example `fileIds: ["readme-md"]` may resolve `dependencyFileIds: ["cover-image"]`.
 */
export async function resolveSingleDocumentStaticDependencies({
	fileIds,
	attachments,
	attachmentIndex,
}: {
	fileIds: string[]
	attachments: StaticDependencyAttachment[]
	attachmentIndex?: AttachmentIndex
}): Promise<StaticDependencyResult> {
	if (fileIds.length !== 1) return EMPTY_RESULT

	const resolvedAttachmentIndex =
		attachmentIndex ?? buildAttachmentIndex(attachments, { includeHidden: true })
	const file = resolvedAttachmentIndex.getItemById(fileIds[0])
	if (!file?.file_id) return EMPTY_RESULT

	const parser = getStaticDependencyParser(file)
	if (!parser) return EMPTY_RESULT

	const content = await getFileContentById(file.file_id, { responseType: "text" })
	if (typeof content !== "string") {
		throw new Error("Static dependency analysis requires text content")
	}

	return parser.resolve({ file, content, attachments, attachmentIndex: resolvedAttachmentIndex })
}

/**
 * Adds dependency IDs when enabled and removes duplicates.
 * @example `(["doc"], ["image", "doc"], true)` -> `["doc", "image"]`
 */
export function mergeStaticDependencyFileIds(
	fileIds: string[],
	dependencyFileIds: string[],
	includeDependencies: boolean,
): string[] {
	return includeDependencies
		? [...new Set([...fileIds, ...dependencyFileIds])]
		: [...new Set(fileIds)]
}
