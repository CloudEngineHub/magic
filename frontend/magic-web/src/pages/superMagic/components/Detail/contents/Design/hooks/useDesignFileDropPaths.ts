import { useCallback } from "react"
import {
	DRAG_TYPE,
	type AttachmentDragData,
	type MultipleFilesDragData,
	type TabDragData,
} from "@/pages/superMagic/components/MessageEditor/utils/drag"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import {
	UploadSubDir,
	type GetFileInfoResponse,
	type UploadSubDirType,
} from "@/components/CanvasDesign/public/magic-types"
import type { DesignAttachmentIndex } from "../utils/designAttachmentIndex"
import type { GetOrCreateImagesDirFn } from "./useGetOrCreateImagesDir"
import { SuperMagicApi } from "@/apis"
import {
	getOrCreateUploadSubDirFileId,
	validateUploadDirectoryFileId,
} from "../utils/designAssetDirectory"
import {
	getDesignPathFileName,
	isCurrentCanvasResourcePath,
	resolveDesignAttachment,
	toDesignDslPathFromWorkspacePath,
} from "../utils/designPath"
import {
	SUPPORTED_AUDIO_EXTENSIONS,
	SUPPORTED_VIDEO_EXTENSIONS,
	validateCanvasFilePath,
} from "@/components/CanvasDesign/runtime/shared/ids"

interface UseDesignFileDropPathsOptions {
	projectId?: string
	currentFile?: { id: string; name: string }
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
	designProjectBasePath?: string
	updateAttachments: () => void
	getOrCreateImagesDir?: GetOrCreateImagesDirFn
	getFileInfoById?: (
		fileId: string,
		fileName?: string,
		fileSize?: number,
	) => Promise<GetFileInfoResponse & { file_id: string }>
	setFileInfoCache?: (
		path: string,
		fileInfo: GetFileInfoResponse,
		options?: { allowMissingAttachment?: boolean },
	) => void
}

interface UseDesignFileDropPathsReturn {
	/** 解析拖拽资源，必要时先复制到当前画布资源目录。 */
	getDataTransferFileInfo: (dataTransfer: DataTransfer) => Promise<string[]>
}

export interface DesignDropResourceEntry {
	sourcePath: string
	fileId?: string
	projectId?: string
	fileName?: string
}

type DesignDragData = TabDragData | AttachmentDragData | MultipleFilesDragData

interface DropFileLike {
	file_id?: string
	project_id?: string
	file_name?: string
	filename?: string
	relative_file_path?: string
	filePath?: string
	is_directory?: boolean
}

interface CopyFileResponse {
	status?: "success" | "processing" | "failed"
	batch_key?: string
	message?: string
	files?: {
		file_id?: string
		file_name?: string
		relative_file_path?: string
		parent_id?: string
	}
}

interface AssetDirectoryContext {
	assetDirFileId: string
	suffixDir: string
}

function createDropResourceEntry(file: DropFileLike): DesignDropResourceEntry | null {
	const sourcePath = file.relative_file_path || file.filePath || file.file_name || file.filename
	if (!sourcePath || file.is_directory) return null

	return {
		sourcePath,
		fileId: file.file_id,
		projectId: file.project_id,
		fileName: file.file_name || file.filename,
	}
}

function extractDesignDropResources(parsedData: DesignDragData): DesignDropResourceEntry[] {
	switch (parsedData.type) {
		case DRAG_TYPE.Tab: {
			const tabData = parsedData.data
			const entry = createDropResourceEntry({
				...tabData.fileData,
				filePath: tabData.filePath,
			})
			return entry ? [entry] : []
		}
		case DRAG_TYPE.ProjectFile: {
			const entry = createDropResourceEntry(parsedData.data)
			return entry ? [entry] : []
		}
		case DRAG_TYPE.ProjectDirectory:
			return []
		case DRAG_TYPE.MultipleFiles:
			return parsedData.data.flatMap((file) => {
				const entry = createDropResourceEntry(file)
				return entry ? [entry] : []
			})
		default:
			return []
	}
}

export function resolveDesignDropResourceEntries(
	dataTransfer: DataTransfer,
): DesignDropResourceEntry[] {
	const customData = dataTransfer.getData("text/plain")
	if (!customData) return []

	try {
		const parsedData = JSON.parse(customData) as DesignDragData
		const entries = extractDesignDropResources(parsedData)
		const seen = new Set<string>()

		return entries.filter((entry) => {
			if (!validateCanvasFilePath(entry.sourcePath).valid) return false
			const key = entry.fileId || entry.sourcePath
			if (seen.has(key)) return false
			seen.add(key)
			return true
		})
	} catch (error) {
		console.warn("[getDataTransferFileInfo] 解析拖拽数据失败:", error)
		return []
	}
}

/**
 * 只做路径语义归一化，供纯路径测试和兼容调用使用。
 * 实际拖拽通过 useDesignFileDropPaths 进一步准备外部资源。
 */
export function resolveDesignDropResourcePaths(
	dataTransfer: DataTransfer,
	designProjectBasePath?: string,
): string[] {
	return Array.from(
		new Set(
			resolveDesignDropResourceEntries(dataTransfer).map((entry) =>
				toDesignDslPathFromWorkspacePath(entry.sourcePath, {
					designProjectBasePath,
				}),
			),
		),
	)
}

function isVideoResourcePath(path: string): boolean {
	const fileName = getDesignPathFileName(path).toLowerCase()
	return SUPPORTED_VIDEO_EXTENSIONS.some((extension) => fileName.endsWith(extension))
}

function isAudioResourcePath(path: string): boolean {
	const fileName = getDesignPathFileName(path).toLowerCase()
	return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => fileName.endsWith(extension))
}

function getUploadSubDir(path: string): UploadSubDirType {
	return isVideoResourcePath(path) ? UploadSubDir.Videos : UploadSubDir.Images
}

function getCopiedFileInfo(
	response: CopyFileResponse,
	sourcePath: string,
): NonNullable<CopyFileResponse["files"]> {
	if (response.status === "failed") {
		throw new Error(response.message || `复制文件失败: ${sourcePath}`)
	}
	if (response.status !== "success" || !response.files?.file_name) {
		throw new Error(`复制文件未完成，无法确定最终文件名: ${sourcePath}`)
	}
	return response.files
}

/**
 * 画布拖拽资源准备器：当前画布资源直接归一化，其他目录资源使用后端复制规则。
 * 前端不猜测 a(1).png，复制后的实际文件名以后端响应为准。
 */
export function useDesignFileDropPaths(
	options: UseDesignFileDropPathsOptions,
): UseDesignFileDropPathsReturn {
	const {
		projectId,
		currentFile,
		flatAttachments,
		attachmentIndex,
		designProjectBasePath,
		updateAttachments,
		getOrCreateImagesDir,
		getFileInfoById,
		setFileInfoCache,
	} = options

	const resolveAssetDirectory = useCallback(
		async (subDir: UploadSubDirType): Promise<AssetDirectoryContext | null> => {
			if (!projectId) return null

			if (subDir === UploadSubDir.Images && getOrCreateImagesDir) {
				const imagesDir = await getOrCreateImagesDir()
				return imagesDir
					? { assetDirFileId: imagesDir.imagesDirFileId, suffixDir: imagesDir.suffixDir }
					: null
			}

			const assetDir = await getOrCreateUploadSubDirFileId({
				currentFile,
				flatAttachments,
				projectId,
				subDir,
				updateAttachments,
				validateDirFileId: validateUploadDirectoryFileId,
			})

			return assetDir
				? { assetDirFileId: assetDir.assetDirFileId, suffixDir: assetDir.suffixDir }
				: null
		},
		[currentFile, flatAttachments, getOrCreateImagesDir, projectId, updateAttachments],
	)

	const getSourceFileId = useCallback(
		(entry: DesignDropResourceEntry, normalizedWorkspacePath: string): string | undefined => {
			if (entry.fileId) return entry.fileId

			const resolved = resolveDesignAttachment(normalizedWorkspacePath, {
				flatAttachments,
				designProjectBasePath,
				attachmentIndex,
			})
			return resolved.status === "found" ? resolved.fileItem.file_id : undefined
		},
		[attachmentIndex, designProjectBasePath, flatAttachments],
	)

	const getDataTransferFileInfo = useCallback(
		async (dataTransfer: DataTransfer): Promise<string[]> => {
			const entries = resolveDesignDropResourceEntries(dataTransfer)
			const preparedPaths: string[] = []
			let copiedResource = false
			const assetDirectoryPromises = new Map<
				UploadSubDirType,
				Promise<AssetDirectoryContext | null>
			>()

			const getAssetDirectory = (subDir: UploadSubDirType) => {
				let promise = assetDirectoryPromises.get(subDir)
				if (!promise) {
					promise = resolveAssetDirectory(subDir)
					assetDirectoryPromises.set(subDir, promise)
				}
				return promise
			}

			try {
				for (const entry of entries) {
					const normalizedWorkspacePath = toDesignDslPathFromWorkspacePath(
						entry.sourcePath,
						{
							designProjectBasePath,
						},
					)

					if (
						isCurrentCanvasResourcePath(normalizedWorkspacePath, {
							designProjectBasePath,
						})
					) {
						preparedPaths.push(normalizedWorkspacePath)
						continue
					}

					if (isAudioResourcePath(entry.sourcePath)) continue

					const sourceFileId = getSourceFileId(entry, normalizedWorkspacePath)
					if (!sourceFileId || !projectId) {
						throw new Error(`无法确定待复制资源的文件ID: ${entry.sourcePath}`)
					}

					const subDir = getUploadSubDir(entry.sourcePath)
					const assetDirectory = await getAssetDirectory(subDir)
					if (!assetDirectory) {
						throw new Error(`无法获取画布资源目录: ${subDir}`)
					}

					const response = (await SuperMagicApi.copyFile({
						file_id: sourceFileId,
						target_parent_id: assetDirectory.assetDirFileId,
						target_project_id: projectId,
						pre_file_id: "-1",
						keep_both_file_ids: [sourceFileId],
					})) as CopyFileResponse
					const copiedFile = getCopiedFileInfo(response, entry.sourcePath)
					copiedResource = true
					const copiedWorkspacePath =
						copiedFile.relative_file_path ||
						`${assetDirectory.suffixDir}/${copiedFile.file_name}`
					const copiedDesignPath = toDesignDslPathFromWorkspacePath(copiedWorkspacePath, {
						designProjectBasePath,
					})

					if (getFileInfoById && setFileInfoCache && copiedFile.file_id) {
						try {
							const copiedFileInfo = await getFileInfoById(
								copiedFile.file_id,
								copiedFile.file_name,
							)
							setFileInfoCache(copiedDesignPath, copiedFileInfo, {
								allowMissingAttachment: true,
							})
						} catch (error) {
							// 复制已经成功，缓存预热失败不应让用户重试复制并产生重名副本。
							console.warn("[useDesignFileDropPaths] 复制文件信息预热失败:", error)
						}
					}

					preparedPaths.push(copiedDesignPath)
				}

				return preparedPaths
			} finally {
				if (copiedResource) updateAttachments()
			}
		},
		[
			designProjectBasePath,
			getFileInfoById,
			getSourceFileId,
			projectId,
			resolveAssetDirectory,
			setFileInfoCache,
			updateAttachments,
		],
	)

	return { getDataTransferFileInfo }
}
