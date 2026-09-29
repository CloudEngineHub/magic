import { SuperMagicApi } from "@/apis"
import type { FileScope } from "@/apis/modules/fileScope"
import { ossUploadService } from "@/stores/folderUpload/uploadService"
import { unshadow } from "@/utils/shadow"
import { FileSaveConflictError, FileSavePermanentError, type FileSavePersistRequest } from "./types"
import { getErrorStatus } from "./FileSaveQueue"

export interface PersistFileSaveMeta {
	fileKey?: string
	fileName?: string
	projectId?: string
	fileScope?: FileScope
}

export interface PersistFileSaveContext {
	getFileMeta: (fileId: string) => PersistFileSaveMeta
	syncFolderName?: (fileId: string, content: unknown) => Promise<void>
}

export async function assertRemoteBaseline(
	fileId: string,
	baselineVersion?: string,
): Promise<void> {
	if (!baselineVersion) return
	const info = await SuperMagicApi.getFileInfo(
		{ file_id: fileId },
		{ enableErrorMessagePrompt: false },
	)
	const remoteVersion = info?.version != null ? String(info.version) : undefined
	if (remoteVersion && remoteVersion !== String(baselineVersion)) {
		throw new FileSaveConflictError()
	}
}

export function normalizePersistError(error: unknown): Error {
	if (error instanceof FileSaveConflictError || error instanceof FileSavePermanentError) {
		return error
	}
	const status = getErrorStatus(error)
	if (status === 409) return new FileSaveConflictError()
	if (status === 401 || status === 403 || status === 404) {
		return new FileSavePermanentError(
			error instanceof Error ? error.message : "File save is not retryable",
		)
	}
	return error instanceof Error ? error : new Error(String(error))
}

/** Upload edited content, then commit via replaceFile or saveFileContent. */
export async function persistFileSave(
	request: FileSavePersistRequest,
	context: PersistFileSaveContext,
): Promise<void> {
	try {
		if (!request.forceOverwrite) {
			await assertRemoteBaseline(request.fileId, request.baselineVersion)
		}
		try {
			await context.syncFolderName?.(request.fileId, request.content)
		} catch (error) {
			console.error("syncCustomProjectFolderNameBeforeSave failed:", error)
		}

		const meta = context.getFileMeta(request.fileId)
		const contentStr =
			typeof request.content === "string" ? request.content : JSON.stringify(request.content)
		const uploadContent =
			request.enableShadow && contentStr.startsWith("SHADOWED_")
				? unshadow(contentStr)
				: contentStr

		if (meta.fileKey && meta.projectId) {
			const uploadedPath = await ossUploadService.uploadContentByFileKey(
				uploadContent,
				meta.fileKey,
				meta.projectId,
				meta.fileName || "content.html",
				meta.fileScope,
			)
			await SuperMagicApi.replaceFile({
				id: request.fileId,
				file_key: uploadedPath,
			})
			return
		}

		const res = await SuperMagicApi.saveFileContent([
			{
				file_id: request.fileId,
				content: request.content,
				enable_shadow: request.enableShadow,
			},
		])
		if (!res?.success_files?.length) {
			throw new FileSavePermanentError("Save API returned no success files")
		}
	} catch (error) {
		throw normalizePersistError(error)
	}
}
