import { SuperMagicApi } from "@/apis"
import { SuperMagicApiErrorCode } from "@/pages/superMagic/constants/apiErrorCodes"
import { findDirectoryByPath, findParentDirectoryId } from "./fileFinder"
import { UploadSubDir, type UploadSubDirType } from "@/components/CanvasDesign/public/magic-types"
import {
	calculateUploadDirectory,
	type CalculateUploadDirectoryParams,
} from "./uploadDirectoryPath"

export { calculateUploadDirectory, getUploadDirectoryBase } from "./uploadDirectoryPath"

interface GetOrCreateImagesDirFileIdParams extends CalculateUploadDirectoryParams {
	projectId: string
	updateAttachments: () => void
	validateImagesDirFileId?: (fileId: string) => Promise<boolean>
}

interface GetOrCreateUploadSubDirFileIdParams extends CalculateUploadDirectoryParams {
	projectId: string
	subDir: UploadSubDirType
	updateAttachments: () => void
	validateDirFileId?: (fileId: string) => Promise<boolean>
}

export interface GetOrCreateImagesDirFileIdResult {
	imagesDirFileId: string
	suffixDir: string
}

export interface GetOrCreateUploadSubDirFileIdResult {
	assetDirFileId: string
	suffixDir: string
	subDir: UploadSubDirType
}

export async function validateUploadDirectoryFileId(fileId: string): Promise<boolean> {
	try {
		await SuperMagicApi.getFileInfo({ file_id: fileId }, { enableErrorMessagePrompt: false })
		return true
	} catch {
		return false
	}
}

/**
 * 获取或创建画布资源子目录（images / videos / audios），返回其 file_id。
 * batch-save 通过 parent_id 构建文件树，所以每类资源目录都需要稳定的目录 file_id。
 */
export async function getOrCreateUploadSubDirFileId(
	params: GetOrCreateUploadSubDirFileIdParams,
): Promise<GetOrCreateUploadSubDirFileIdResult | null> {
	const {
		currentFile,
		flatAttachments,
		projectId,
		subDir,
		updateAttachments,
		validateDirFileId,
	} = params
	const suffixDir = calculateUploadDirectory({ currentFile, flatAttachments }, subDir)

	if (!suffixDir || !projectId) {
		return null
	}

	let assetDirItem = findDirectoryByPath(suffixDir, flatAttachments)

	if (assetDirItem?.file_id) {
		const isUsable = validateDirFileId ? await validateDirFileId(assetDirItem.file_id) : true
		if (isUsable) {
			return { assetDirFileId: assetDirItem.file_id, suffixDir, subDir }
		}
	}

	const parentDirId = findParentDirectoryId(suffixDir, currentFile, flatAttachments)

	if (parentDirId === undefined) {
		return null
	}

	try {
		const createResponse = await SuperMagicApi.createFile({
			project_id: projectId,
			parent_id: parentDirId,
			file_name: subDir,
			is_directory: true,
			ignore_duplicate: true,
		})

		const fileId = (createResponse as { file_id?: string })?.file_id
		if (fileId) {
			updateAttachments()
			return { assetDirFileId: fileId, suffixDir, subDir }
		}
	} catch (error: unknown) {
		const errorObj = error as { code?: number; message?: string }
		if (errorObj.code === SuperMagicApiErrorCode.DuplicateFile) {
			updateAttachments()
			assetDirItem = findDirectoryByPath(suffixDir, flatAttachments)
			if (assetDirItem?.file_id) {
				const isUsable = validateDirFileId
					? await validateDirFileId(assetDirItem.file_id)
					: true
				if (isUsable) {
					return { assetDirFileId: assetDirItem.file_id, suffixDir, subDir }
				}
			}
		}
	}

	return null
}

/**
 * 获取或创建 images 目录，返回其 file_id
 * 用于文件上传改造：batch-save 时通过 parent_id 构建文件树，需传入目标目录的 file_id
 */
export async function getOrCreateImagesDirFileId(
	params: GetOrCreateImagesDirFileIdParams,
): Promise<GetOrCreateImagesDirFileIdResult | null> {
	const result = await getOrCreateUploadSubDirFileId({
		...params,
		subDir: UploadSubDir.Images,
		validateDirFileId: params.validateImagesDirFileId,
	})

	return result ? { imagesDirFileId: result.assetDirFileId, suffixDir: result.suffixDir } : null
}
