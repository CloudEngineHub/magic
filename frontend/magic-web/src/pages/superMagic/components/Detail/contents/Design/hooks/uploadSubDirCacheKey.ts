import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { UploadSubDir, type UploadSubDirType } from "@/components/CanvasDesign/public/magic-types"
import { calculateUploadDirectory } from "../utils/uploadDirectoryPath"

interface BuildUploadSubDirCacheKeyParams {
	projectId?: string
	currentFile?: { id: string; name: string }
	flatAttachments?: FileItem[]
	subDir?: UploadSubDirType
}

function normalizePath(path: string): string {
	return path
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "")
		.replace(/\/+/g, "/")
}

export function buildUploadSubDirCacheKey(params: BuildUploadSubDirCacheKeyParams): string {
	const { projectId, currentFile, flatAttachments } = params
	const subDir = params.subDir ?? UploadSubDir.Images
	const currentRelativePath =
		flatAttachments?.find((item) => item.file_id === currentFile?.id)?.relative_file_path ?? ""
	const normalizedDirPath = normalizePath(
		calculateUploadDirectory({ currentFile, flatAttachments }, subDir),
	)
	const assetDirFileId =
		flatAttachments?.find(
			(item) =>
				item.is_directory &&
				normalizePath(item.relative_file_path || "") === normalizedDirPath,
		)?.file_id ?? ""

	return [
		projectId ?? "",
		currentFile?.id ?? "",
		currentRelativePath,
		normalizedDirPath,
		assetDirFileId,
	].join(":")
}

export function buildImagesDirCacheKey(
	params: Omit<BuildUploadSubDirCacheKeyParams, "subDir">,
): string {
	return buildUploadSubDirCacheKey({ ...params, subDir: UploadSubDir.Images })
}
