import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { UploadSubDir } from "@/components/CanvasDesign/public/magic-types"
import {
	calculateUploadDirectory,
	getOrCreateUploadSubDirFileId,
	validateUploadDirectoryFileId,
} from "../utils/designAssetDirectory"

export interface ResolveDesignImagesFileDirOptions {
	projectId: string
	currentFile?: {
		id: string
		name: string
	}
	flatAttachments?: FileItem[]
	updateAttachments: () => void
}

/**
 * 解析当前设计项目下的 `images` 目录（与发起生图一致）：不存在则创建。
 * @returns 形如 `/design/path/images/`；当前文件或附件上下文不足时返回 `undefined`
 */
export async function resolveDesignImagesFileDirWithSlash(
	options: ResolveDesignImagesFileDirOptions,
): Promise<string | undefined> {
	const { projectId, currentFile, flatAttachments, updateAttachments } = options

	if (currentFile?.id && flatAttachments && flatAttachments.length > 0) {
		const designProjectFile = flatAttachments.find((item) => item.file_id === currentFile.id)

		if (designProjectFile?.relative_file_path) {
			const fileDir = calculateUploadDirectory(
				{ currentFile, flatAttachments },
				UploadSubDir.Images,
			)
			await getOrCreateUploadSubDirFileId({
				currentFile,
				flatAttachments,
				projectId,
				subDir: UploadSubDir.Images,
				updateAttachments,
				validateDirFileId: validateUploadDirectoryFileId,
			})
			return fileDir ? `/${fileDir}/` : undefined
		}
	}

	return undefined
}
