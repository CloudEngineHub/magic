import type { FileReference } from "@/apis/modules/superMagic"
import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import { MagicFSApi, SuperMagicApi, type MagicFSFile } from "@/apis"
import { getFileContentById } from "@/pages/superMagic/utils/api"

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
		name: file.name,
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
