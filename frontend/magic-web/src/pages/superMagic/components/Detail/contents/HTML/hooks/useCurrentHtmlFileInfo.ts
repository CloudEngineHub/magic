import { useMemo } from "react"
import {
	findAttachmentByFileId,
	getHtmlDirectoryPath,
	type ProjectAttachmentNode,
} from "../utils/file-utils"

interface UseCurrentHtmlFileInfoOptions {
	attachmentList?: ProjectAttachmentNode[]
	fileId?: string
	fallbackFileName?: string
}

export interface CurrentHtmlFileInfo {
	key: string
	fileId: string
	fileName?: string
	parentId?: string
	relativeFilePath?: string
	htmlRelativeFolderPath?: string
	updatedAt?: string | number
}

function createCurrentHtmlFileInfo({
	currentFileId,
	currentFileName,
	currentParentId,
	currentRelativeFilePath,
	currentUpdatedAt,
	fileId,
	fallbackFileName,
}: {
	currentFileId?: string
	currentFileName?: string
	currentParentId?: string
	currentRelativeFilePath?: string
	currentUpdatedAt?: string | number
	fileId?: string
	fallbackFileName?: string
}): CurrentHtmlFileInfo {
	const normalizedFileId = currentFileId || fileId || ""
	const fileName = currentFileName || fallbackFileName
	const parentId = currentParentId
	const relativeFilePath = currentRelativeFilePath
	const updatedAt = currentUpdatedAt
	const htmlRelativeFolderPath = getHtmlDirectoryPath(relativeFilePath) || undefined
	const key = [
		normalizedFileId,
		relativeFilePath || "",
		fileName || "",
		parentId || "",
		updatedAt ?? "",
	].join("|")

	return {
		key,
		fileId: normalizedFileId,
		fileName,
		parentId,
		relativeFilePath,
		htmlRelativeFolderPath,
		updatedAt,
	}
}

export function useCurrentHtmlFileInfo(
	options: UseCurrentHtmlFileInfoOptions,
): CurrentHtmlFileInfo {
	const { attachmentList, fileId, fallbackFileName } = options
	const currentFile = useMemo(
		() => findAttachmentByFileId(attachmentList, fileId),
		[attachmentList, fileId],
	)
	const currentFileId = currentFile?.file_id
	const currentFileName = currentFile?.file_name
	const currentParentId = currentFile?.parent_id
	const currentRelativeFilePath = currentFile?.relative_file_path
	const currentUpdatedAt = currentFile?.updated_at

	return useMemo(
		() =>
			createCurrentHtmlFileInfo({
				currentFileId,
				currentFileName,
				currentParentId,
				currentRelativeFilePath,
				currentUpdatedAt,
				fileId,
				fallbackFileName,
			}),
		[
			currentFileId,
			currentFileName,
			currentParentId,
			currentRelativeFilePath,
			currentUpdatedAt,
			fileId,
			fallbackFileName,
		],
	)
}
