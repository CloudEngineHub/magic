import { MagicFSApi, SuperMagicApi, type MagicFSFile } from "@/apis"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"

export const MEMORY_SCOPE = "memory" as const
export const GLOBAL_MEMORY_DIRECTORY_NAME = "global"
export const MEMORY_ENTRY_FILE_NAME = "MEMORY.md"
const FILE_CONCURRENT_MODIFICATION_CODE = 51152
const STABLE_SNAPSHOT_MAX_ATTEMPTS = 3

/** 记忆文件的稳定编辑快照。 */
export interface MemoryFileSnapshot {
	file: MagicFSFile
	content: string
	revision: number
}

/** 记忆文件保存结果。 */
export interface MemoryFileSaveResult {
	revision: number
}

/** 记忆文件已被其他会话或进程修改。 */
export class MemoryFileConcurrentModificationError extends Error {
	/** 创建并发修改错误。 */
	constructor() {
		super("Memory file has been modified")
		this.name = "MemoryFileConcurrentModificationError"
	}
}

/**
 * 文件记忆访问服务。
 *
 * 该服务负责屏蔽固定目录查找与通用文件接口差异，页面只处理展示状态。
 */
export class MemoryFileService {
	/** 查询记忆根目录或指定目录的直接子节点。 */
	async listDirectory(parentId?: string): Promise<MagicFSFile[]> {
		const response = await MagicFSApi.listFiles({
			scope: MEMORY_SCOPE,
			...(parentId ? { parent_id: parentId } : {}),
		})

		return response.files || []
	}

	/** 按固定目录结构定位全局记忆入口文件。 */
	async findGlobalMemoryFile(): Promise<MagicFSFile | null> {
		const roots = await this.listDirectory()
		const memoryRoot = roots.find((file) => file.is_directory && file.name === "memory")
		if (!memoryRoot) return null

		const memoryChildren = await this.listDirectory(memoryRoot.id)
		const globalDirectory = memoryChildren.find(
			(file) => file.is_directory && file.name === GLOBAL_MEMORY_DIRECTORY_NAME,
		)
		if (!globalDirectory) return null

		const globalChildren = await this.listDirectory(globalDirectory.id)
		return (
			globalChildren.find(
				(file) => !file.is_directory && file.name === MEMORY_ENTRY_FILE_NAME,
			) || null
		)
	}

	/** 确保固定的全局记忆文件存在，并返回可用于编辑的稳定快照。 */
	async ensureGlobalMemoryFile(): Promise<MemoryFileSnapshot> {
		const roots = await this.listDirectory()
		const memoryRoot = roots.find((file) => file.is_directory && file.name === "memory")
		if (!memoryRoot) {
			throw new Error("Memory root directory is missing")
		}

		let memoryChildren = await this.listDirectory(memoryRoot.id)
		let globalDirectory = memoryChildren.find(
			(file) => file.is_directory && file.name === GLOBAL_MEMORY_DIRECTORY_NAME,
		)

		if (!globalDirectory) {
			try {
				globalDirectory = await this.createNode({
					name: GLOBAL_MEMORY_DIRECTORY_NAME,
					parentId: memoryRoot.id,
					isDirectory: true,
				})
			} catch (error) {
				memoryChildren = await this.listDirectory(memoryRoot.id)
				globalDirectory = memoryChildren.find(
					(file) => file.is_directory && file.name === GLOBAL_MEMORY_DIRECTORY_NAME,
				)
				if (!globalDirectory) throw error
			}
		}

		let globalChildren = await this.listDirectory(globalDirectory.id)
		let memoryFile = globalChildren.find(
			(file) => !file.is_directory && file.name === MEMORY_ENTRY_FILE_NAME,
		)

		if (!memoryFile) {
			try {
				memoryFile = await this.createNode({
					name: MEMORY_ENTRY_FILE_NAME,
					parentId: globalDirectory.id,
					isDirectory: false,
				})
			} catch (error) {
				globalChildren = await this.listDirectory(globalDirectory.id)
				memoryFile = globalChildren.find(
					(file) => !file.is_directory && file.name === MEMORY_ENTRY_FILE_NAME,
				)
				if (!memoryFile) throw error
			}
		}

		return this.readStableSnapshot(memoryFile.id)
	}

	/** 读取指定记忆文件的文本正文。 */
	async readFileContent(fileId: string): Promise<string> {
		return getFileContentById(fileId, {
			responseType: "text",
			forceRefresh: true,
		}) as Promise<string>
	}

	/** 查询指定记忆文件的最新元数据。 */
	async getFileInfo(fileId: string): Promise<MagicFSFile> {
		const response = await MagicFSApi.getFileInfo(fileId)
		return response.file
	}

	/**
	 * 读取元数据版本一致的正文快照。
	 *
	 * 读取正文前后各校验一次修订号，避免把变化中的文件作为编辑基准。
	 */
	async readStableSnapshot(fileId: string): Promise<MemoryFileSnapshot> {
		for (let attempt = 0; attempt < STABLE_SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
			const before = await this.getFileInfo(fileId)
			const content = await this.readFileContent(fileId)
			const after = await this.getFileInfo(fileId)

			if (before.version === after.version) {
				return {
					file: after,
					content,
					revision: after.version,
				}
			}
		}

		throw new MemoryFileConcurrentModificationError()
	}

	/** 保存指定记忆文件的文本正文，并校验编辑基准修订号。 */
	async saveFileContent(
		fileId: string,
		content: string,
		expectedRevision: number,
	): Promise<MemoryFileSaveResult> {
		const response = await SuperMagicApi.saveFileContent([
			{
				file_id: fileId,
				content,
				expected_revision: expectedRevision,
			},
		])

		const failedFile = response.error_files.find((file) => file.file_id === fileId)
		if (failedFile?.error_code === FILE_CONCURRENT_MODIFICATION_CODE) {
			throw new MemoryFileConcurrentModificationError()
		}
		if (failedFile) {
			throw new Error(failedFile.error)
		}

		const savedFile = response.success_files.find((file) => file.file_id === fileId)
		if (!savedFile) {
			throw new Error("Memory file save result is missing")
		}

		const revision = savedFile.data.revision ?? (await this.getFileInfo(fileId)).version
		return { revision }
	}

	/** 在用户记忆空间创建文件或目录。 */
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

	/** 重命名记忆文件或目录。 */
	async renameNode(fileId: string, targetName: string): Promise<void> {
		await SuperMagicApi.renameFile({
			file_id: fileId,
			target_name: targetName,
		})
	}

	/** 删除记忆文件或目录。 */
	async deleteNode(fileId: string): Promise<void> {
		await SuperMagicApi.deleteFile(fileId)
	}

	/** 下载单个记忆文件。 */
	async downloadFile(fileId: string, fileName: string): Promise<void> {
		const urls = await getTemporaryDownloadUrl({
			file_ids: [fileId],
			is_download: true,
		})
		const fileUrl = urls[0]?.url
		if (!fileUrl) throw new Error("Memory file URL is unavailable")

		const anchor = document.createElement("a")
		anchor.href = fileUrl
		anchor.download = fileName
		anchor.rel = "noopener noreferrer"
		anchor.click()
	}
}

export const memoryFileService = new MemoryFileService()
