import type { TaskCreateOptions } from "@/stores/folderUpload/types"
import type { FileReference } from "@/apis/modules/superMagic"
import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import { MagicFSApi, SuperMagicApi, type MagicFSFile } from "@/apis"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { getFileReferenceIdentityKey } from "../../../services/userFileReferenceResolver"

const FILE_CONCURRENT_MODIFICATION_CODE = 51152
const STABLE_SNAPSHOT_MAX_ATTEMPTS = 3

/** 用户文件的稳定编辑快照。 */
export interface UserFileSnapshot {
	file: MagicFSFile
	content: string
	revision: number
}

/** 用户文件保存结果。 */
export interface UserFileSaveResult {
	revision: number
}

/** 用户文件已被其他会话或进程修改。 */
export class UserFileConcurrentModificationError extends Error {
	/** 创建并发修改错误。 */
	constructor() {
		super("User file has been modified")
		this.name = "UserFileConcurrentModificationError"
	}
}

export const USER_FILE_SCOPE = "user" as const
// BatchDeleteFilesRequestDTO 的 file_ids 协议上限；多选按该上限分批提交并保留每批结果。
export const USER_FILE_DELETE_BATCH_SIZE = 500

export class UserSpaceFileService {
	async listDirectory(parentId?: string, signal?: AbortSignal): Promise<MagicFSFile[]> {
		const response = await MagicFSApi.listFiles(
			{ scope: USER_FILE_SCOPE, ...(parentId ? { parent_id: parentId } : {}) },
			{ signal },
		)
		return response.files
	}

	/** 读取指定用户文件的文本正文。 */
	async readFileContent(fileId: string, signal?: AbortSignal): Promise<string> {
		return getFileContentById(fileId, {
			responseType: "text",
			forceRefresh: true,
			signal,
		}) as Promise<string>
	}

	/** 查询指定用户文件的最新元数据。 */
	async getFileInfo(fileId: string, signal?: AbortSignal): Promise<MagicFSFile> {
		const response = await MagicFSApi.getFileInfo(fileId, { signal })
		return response.file
	}

	/**
	 * 读取元数据版本一致的正文快照。
	 *
	 * 读取正文前后各校验一次修订号，避免把变化中的文件作为编辑基准。
	 */
	async readStableSnapshot(fileId: string, signal?: AbortSignal): Promise<UserFileSnapshot> {
		for (let attempt = 0; attempt < STABLE_SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
			const before = await this.getFileInfo(fileId, signal)
			const content = await this.readFileContent(fileId, signal)
			const after = await this.getFileInfo(fileId, signal)

			if (before.version === after.version) {
				return {
					file: after,
					content,
					revision: after.version,
				}
			}
		}

		throw new UserFileConcurrentModificationError()
	}

	/** 保存指定用户文件的文本正文，并校验编辑基准修订号。 */
	async saveFileContent(
		fileId: string,
		content: string,
		expectedRevision: number,
	): Promise<UserFileSaveResult> {
		const response = await SuperMagicApi.saveFileContent([
			{
				file_id: fileId,
				content,
				expected_revision: expectedRevision,
			},
		])

		const failedFile = response.error_files.find((file) => file.file_id === fileId)
		if (failedFile?.error_code === FILE_CONCURRENT_MODIFICATION_CODE) {
			throw new UserFileConcurrentModificationError()
		}
		if (failedFile) {
			throw new Error(failedFile.error)
		}

		const savedFile = response.success_files.find((file) => file.file_id === fileId)
		if (!savedFile) {
			throw new Error("User file save result is missing")
		}

		const revision = savedFile.data.revision ?? (await this.getFileInfo(fileId)).version
		return { revision }
	}

	/** 在用户空间创建文件或目录。 */
	async createNode(params: {
		name: string
		parentId: string
		isDirectory: boolean
	}): Promise<MagicFSFile> {
		const response = await MagicFSApi.createFile({
			name: params.name,
			parent_id: params.parentId,
			is_directory: params.isDirectory,
			space_type: "user",
		})

		return response.file
	}

	/** 重命名用户文件或目录。 */
	async renameNode(fileId: string, targetName: string): Promise<void> {
		await SuperMagicApi.renameFile({
			file_id: fileId,
			target_name: targetName,
		})
	}

	async uploadFiles(
		files: File[],
		parentId: string,
		title: string,
		identity: string,
		callbacks: Pick<TaskCreateOptions, "onComplete" | "onError" | "onBatchSaveComplete">,
	): Promise<{ id: string; cancel: () => Promise<void> }> {
		const { multiFolderUploadStore } = await import("@/stores/folderUpload")
		if (identity !== getFileReferenceIdentityKey())
			throw new DOMException("Identity changed", "AbortError")
		const id = await multiFolderUploadStore.createUploadTask(files, parentId, {
			projectId: "0",
			fileScope: USER_FILE_SCOPE,
			projectName: title,
			storageType: "workspace",
			...callbacks,
		})
		return { id, cancel: () => multiFolderUploadStore.cancelTask(id) }
	}

	async moveNode(fileId: string, targetParentId: string): Promise<void> {
		await SuperMagicApi.moveFile({ file_id: fileId, target_parent_id: targetParentId })
	}

	async deleteNodes(fileIds: string[]): Promise<string[]> {
		// project_id=0 仅属于已有删除接口的传输协议，不进入用户引用或页面项目模型。
		const response = await SuperMagicApi.deleteFiles({
			file_ids: fileIds,
			project_id: "0",
			include_descendants: true,
		})
		return response.file_ids.map(String)
	}

	/** 下载单个用户文件。 */
	async downloadFile(fileId: string, fileName: string): Promise<void> {
		const urls = await getTemporaryDownloadUrl({
			file_ids: [fileId],
			is_download: true,
		})
		const fileUrl = urls[0]?.url
		if (!fileUrl) throw new Error("User file URL is unavailable")

		const anchor = document.createElement("a")
		anchor.href = fileUrl
		anchor.download = fileName
		anchor.rel = "noopener noreferrer"
		anchor.click()
	}
}

export const userSpaceFileService = new UserSpaceFileService()

/** MagicFS 仅在这里转换为既有文件组件模型；空间路径来自已鉴权的真实父链。 */
export function toUserAttachment(file: MagicFSFile, path: string): AttachmentItem {
	const extension = file.is_directory
		? ""
		: file.name.includes(".")
			? (file.name.split(".").pop() ?? "")
			: ""
	const reference: FileReference | undefined = path
		? {
				file_id: file.id,
				file_name: file.name,
				is_directory: file.is_directory,
				file_extension: extension,
				space_type: "user",
				space_relative_path: path,
			}
		: undefined
	return {
		file_id: file.id,
		file_name: file.name,
		filename: file.name,
		file_extension: extension,
		parent_id: file.parent_id,
		is_directory: file.is_directory,
		file_size: file.size,
		updated_at: file.updated_at,
		relative_file_path: path,
		space_type: "user",
		file_reference: reference,
		display_config: {
			previewPolicy: {
				standalone: true,
				editingPresence: false,
				allowShare: false,
				allowVersionHistory: false,
				fileScope: USER_FILE_SCOPE,
				syncWithAttachments: false,
				persistTab: false,
				restoreAsActive: false,
			},
		},
	}
}
