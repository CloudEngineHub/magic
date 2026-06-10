import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"

interface BuildImagesDirCacheKeyParams {
	projectId?: string
	currentFile?: { id: string; name: string }
	flatAttachments?: FileItem[]
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.replace(/\/+/g, "/")
}

function getUploadDirectoryBase(params: BuildImagesDirCacheKeyParams): string {
	const { currentFile, flatAttachments } = params
	if (!currentFile?.id || !flatAttachments?.length) return ""

	const designProjectFile = flatAttachments.find((item) => item.file_id === currentFile.id)
	if (!designProjectFile?.relative_file_path) return ""

	const filePath = designProjectFile.relative_file_path
	if (designProjectFile.is_directory) {
		return normalizePath(filePath)
	}

	const fileName = designProjectFile.file_name || currentFile.name
	if (filePath.endsWith(fileName)) {
		return normalizePath(filePath.slice(0, -fileName.length))
	}

	const lastSlashIndex = filePath.lastIndexOf("/")
	if (lastSlashIndex < 0) return ""

	return normalizePath(filePath.slice(0, lastSlashIndex + 1))
}

export function buildImagesDirCacheKey(params: BuildImagesDirCacheKeyParams): string {
	const { projectId, currentFile, flatAttachments } = params
	const currentRelativePath =
		flatAttachments?.find((item) => item.file_id === currentFile?.id)?.relative_file_path ?? ""
	const basePath = getUploadDirectoryBase(params)
	const imagesDirPath = basePath ? `${basePath}/images` : "images"
	const normalizedImagesDirPath = normalizePath(imagesDirPath)
	const imagesDirFileId =
		flatAttachments?.find(
			(item) =>
				item.is_directory &&
				normalizePath(item.relative_file_path || "") === normalizedImagesDirPath,
		)?.file_id ?? ""

	return [
		projectId ?? "",
		currentFile?.id ?? "",
		currentRelativePath,
		normalizedImagesDirPath,
		imagesDirFileId,
	].join(":")
}
