import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { UploadSubDir } from "@/components/CanvasDesign/public/magic-types"

export interface CalculateUploadDirectoryParams {
	currentFile?: {
		id: string
		name: string
	}
	/** 已扁平化的附件列表 */
	flatAttachments?: FileItem[]
}

/**
 * 计算上传目录的「基路径」（不含子目录如 images / videos / audios）。
 * 基于当前设计文件的路径，用于与 uploadSubDir 组合得到完整上传路径。
 */
export function getUploadDirectoryBase(params: CalculateUploadDirectoryParams): string {
	const { currentFile, flatAttachments } = params

	if (!currentFile?.id || !flatAttachments || flatAttachments.length === 0) {
		return ""
	}

	const designProjectFile = flatAttachments.find((item) => item.file_id === currentFile.id)

	if (!designProjectFile?.relative_file_path) {
		return ""
	}

	const filePath = designProjectFile.relative_file_path
	let suffixDir = ""

	if (designProjectFile.is_directory) {
		suffixDir = filePath
	} else {
		const fileName = designProjectFile.file_name || currentFile.name
		if (filePath.endsWith(fileName)) {
			suffixDir = filePath.slice(0, -fileName.length)
		} else {
			const lastSlashIndex = filePath.lastIndexOf("/")
			if (lastSlashIndex >= 0) {
				suffixDir = filePath.slice(0, lastSlashIndex + 1)
			}
		}
	}

	suffixDir = suffixDir.replace(/^\/+|\/+$/g, "")
	return suffixDir
}

/**
 * 计算画布资源上传的目标目录路径。
 * 基于当前设计文件的路径，计算指定子目录（默认 images）的路径。
 */
export function calculateUploadDirectory(
	params: CalculateUploadDirectoryParams,
	subDir: string = UploadSubDir.Images,
): string {
	const base = getUploadDirectoryBase(params)
	return base ? `${base}/${subDir}` : subDir
}
