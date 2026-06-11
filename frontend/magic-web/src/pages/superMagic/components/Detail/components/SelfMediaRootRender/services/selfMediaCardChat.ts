import { flattenAttachments } from "../../../contents/HTML/utils"
import {
	AttachmentSource,
	type AttachmentItem,
} from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { SelfMediaAttachmentNode, SelfMediaPost } from "../types"
import { type AttachmentNode, findDirectoryByRelativePath, findNodeById } from "./selfMediaHelpers"

function normalizeFilePath(path?: string): string {
	return (path || "").replace(/\\/g, "/").replace(/^\/+/, "")
}

function getFileExtension(fileName?: string): string | undefined {
	if (!fileName) return undefined
	const lastDotIndex = fileName.lastIndexOf(".")
	if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
		return undefined
	}

	return fileName.slice(lastDotIndex + 1)
}

export function resolveSelfMediaAttachmentItem(
	attachmentList?: SelfMediaAttachmentNode[],
	fileId?: string,
): AttachmentItem | null {
	if (!attachmentList?.length || !fileId) return null

	const matchedFile = flattenAttachments(attachmentList).find(
		(item) => !item?.is_directory && item?.file_id === fileId,
	)

	if (!matchedFile) return null

	return {
		...matchedFile,
		file_id: matchedFile.file_id,
		file_name: matchedFile.file_name,
		filename: matchedFile.file_name,
		display_filename: matchedFile.file_name,
		relative_file_path: matchedFile.relative_file_path,
		file_extension: getFileExtension(matchedFile.file_name),
		source: AttachmentSource.PROJECT_DIRECTORY,
	}
}

/**
 * Resolves the on-disk post directory (folder) from any card file in that post
 * and returns an AttachmentItem suitable for a folder @mention.
 */
function resolvePostDirectoryPathFromCardFile(
	allFileLeaves: AttachmentNode[],
	cardFilePath: string,
): string | null {
	const normalized = cardFilePath.replace(/\\/g, "/")
	const parts = normalized.split("/").filter(Boolean)
	if (!parts.length) return null
	const dirSegs = parts.slice(0, -1)
	for (let j = dirSegs.length; j >= 0; j--) {
		const prefix = j === 0 ? "" : `${dirSegs.slice(0, j).join("/")}/`
		const postJson = `${prefix}post.json`
		const hasPostJson = allFileLeaves.some(
			(n) =>
				!n.is_directory &&
				normalizeFilePath(n.relative_file_path) === normalizeFilePath(postJson),
		)
		if (hasPostJson) {
			if (j === 0) return "/"
			return `${dirSegs.slice(0, j).join("/")}/`
		}
	}
	const cardsIdx = normalized.indexOf("/cards/")
	if (cardsIdx !== -1) {
		return `${normalized.slice(0, cardsIdx)}/`
	}
	return null
}

function resolvePostDirectoryPathFromEntry(postEntryPath?: string): string | null {
	if (!postEntryPath) return null
	const normalized = postEntryPath.replace(/\\/g, "/").replace(/^\/+/, "")
	const parts = normalized.split("/").filter(Boolean)
	if (parts.length <= 1) return null
	return `${parts.slice(0, -1).join("/")}/`
}

function buildPostDirectoryAttachmentItem(
	attachmentList: SelfMediaAttachmentNode[],
	postDirPath: string | null,
): AttachmentItem | null {
	if (!postDirPath) return null
	const dirNode = findDirectoryByRelativePath(attachmentList as AttachmentNode[], postDirPath)
	if (!dirNode?.file_id) return null
	return {
		...dirNode,
		file_id: dirNode.file_id,
		file_name: dirNode.file_name,
		filename: dirNode.file_name,
		display_filename: dirNode.file_name,
		relative_file_path: dirNode.relative_file_path,
		is_directory: true,
		source: AttachmentSource.PROJECT_DIRECTORY,
	} as AttachmentItem
}

function findPostJsonByPathSuffix(
	allNodes: AttachmentNode[],
	path: string | null | undefined,
): AttachmentNode | null {
	const normalizedPath = normalizeFilePath(path)
	if (!normalizedPath) return null
	return (
		allNodes.find((node) => {
			if (node.is_directory) return false
			const nodePath = normalizeFilePath(node.relative_file_path)
			return nodePath === normalizedPath || nodePath.endsWith(`/${normalizedPath}`)
		}) ?? null
	)
}

function directoryPathFromPostJson(postJson: AttachmentNode): string {
	const path = postJson.relative_file_path || ""
	const slashIndex = path.replace(/\\/g, "/").lastIndexOf("/")
	if (slashIndex === -1) return ""
	return path.slice(0, slashIndex + 1)
}

function directoryNameFromPath(path: string): string {
	const parts = path.replace(/\\/g, "/").split("/").filter(Boolean)
	return parts[parts.length - 1] || ""
}

function buildSyntheticPostDirectoryAttachmentItem(
	postJson: AttachmentNode | null,
): AttachmentItem | null {
	if (!postJson?.parent_id) return null
	const directoryPath = directoryPathFromPostJson(postJson)
	if (!directoryPath) return null
	const directoryName = directoryNameFromPath(directoryPath)
	return {
		file_id: String(postJson.parent_id),
		file_name: directoryName,
		filename: directoryName,
		display_filename: directoryName,
		relative_file_path: directoryPath,
		is_directory: true,
		source: AttachmentSource.PROJECT_DIRECTORY,
	}
}

export function resolveSelfMediaPostDirectoryAttachmentItem(
	attachmentList: SelfMediaAttachmentNode[] | undefined,
	anyCardFileId: string | undefined,
	postEntryPath?: string,
): AttachmentItem | null {
	if (!attachmentList?.length) return null
	const flat = flattenAttachments(attachmentList) as AttachmentNode[]
	if (anyCardFileId) {
		const cardNode = findNodeById(attachmentList as AttachmentNode[], anyCardFileId)
		const cardPath = !cardNode?.is_directory ? cardNode?.relative_file_path : undefined
		const cardDirPath = cardPath ? resolvePostDirectoryPathFromCardFile(flat, cardPath) : null
		const postJsonFromCardPath = findPostJsonByPathSuffix(
			flat,
			cardDirPath ? `${cardDirPath}post.json` : null,
		)
		const item =
			buildPostDirectoryAttachmentItem(attachmentList, cardDirPath) ||
			buildSyntheticPostDirectoryAttachmentItem(postJsonFromCardPath)
		if (item) return item
	}
	const entryDirPath = resolvePostDirectoryPathFromEntry(postEntryPath)
	const postJsonFromEntryPath = findPostJsonByPathSuffix(flat, postEntryPath)
	const item =
		buildPostDirectoryAttachmentItem(attachmentList, entryDirPath) ||
		buildSyntheticPostDirectoryAttachmentItem(postJsonFromEntryPath)
	return item
}

export function resolveSelfMediaPostMentionFileId(post?: SelfMediaPost | null): string | undefined {
	return post?.article?.fileId || post?.cards.find((card) => card.fileId)?.fileId
}
