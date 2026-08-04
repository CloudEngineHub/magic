import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { AttachmentItem } from "./types"
import { createShareHandler } from "../utils/createShareHandler"
import { getTemporaryDownloadUrl, downloadFileContent } from "../../../utils/api"
import { UploadSource, useFileUpload } from "../../MessageEditor/hooks/useFileUpload"
import { handleShareFunction } from "../../../utils/share"
import { ShareType, ResourceType } from "../../Share/types"
import { downloadFileWithAnchor } from "../../../utils/handleFIle"
import { exportSingleFileToPpt } from "../utils/exportSingleFile"
import { prepareHtmlPagesForExport } from "@/utils/htmlExportPrepare"
import { isMarkdownFileName } from "@/utils/pdfFileType"
import { ROOT_FILE_ID } from "../constant"
import { getParentIdFromPath as _getParentIdFromPath } from "../utils/getParentIdFromPath"
import { multiFolderUploadStore } from "@/stores/folderUpload"
import type { BatchSaveInfo } from "@/stores/folderUpload/types"
import { DownloadImageMode, ProjectListItem } from "../../../pages/Workspace/types"
import { useFileOpen } from "./useFileOpen"
import { SuperMagicApi } from "@/apis"
import { useDuplicateFileHandler } from "./useDuplicateFileHandler"
import { useMemoizedFn } from "ahooks"
import magicToast from "@/components/base/MagicToaster/utils"
import { uploadLogger } from "../utils/uploadLogger"
import { exportPPTX } from "@magic/html2pptx"
import {
	prepareExportSlides,
	prepareSingleSlideExport,
} from "@/pages/superMagic/services/pptService"
import { pptxExternalLogger, reportPptxExportError } from "@/pages/superMagic/utils/pptxLogger"
import { createPptxResourceErrorCollector } from "@/pages/superMagic/utils/pptxResourceErrors"
import { createRandomUuidV4 } from "@/utils/create-random-uuid-v4"
import { hasPPTMetadata } from "@/pages/superMagic/components/Detail/utils/file"
import {
	createPptxSlideConfig,
	resolvePptScaleContentDimensions,
} from "@/pages/superMagic/components/Detail/contents/HTML/utils/slide-dimensions"
import { getAppEntryFile } from "../../MessageList/components/MessageAttachment/utils"
import { waitForProjectAttachmentChange } from "@/pages/superMagic/utils/projectAttachments/attachmentMutationWaiter"
import { exportHtmlToImage } from "@magic-web/html2image"
import { textToHtml } from "../../../utils/textToHtml"
import { createUploadRefreshCoordinator } from "../utils/uploadRefreshController"
import { createDesignProjectFiles } from "../../Detail/contents/Design/utils/designProjectCreation"
import { createSelfMediaProject as createSelfMediaProjectAction } from "./projectCreators/createSelfMediaProject"
import { createAICardProject as createAICardProjectAction } from "./projectCreators/createAICardProject"
import {
	documentExportService,
	type DocumentExport,
} from "@/pages/superMagic/services/documentExport"
import type { DownloadProgressController } from "@/pages/superMagic/hooks/useDownloadProgress"
import type { FileScope } from "@/apis/modules/fileScope"

// 工具函数：从attachments中递归删除指定ID的文件/文件夹
const removeItemFromAttachments = (
	attachments: AttachmentItem[],
	targetId: string,
): AttachmentItem[] => {
	return attachments
		.filter((item) => {
			// 如果是目标项目，则过滤掉
			const itemId = item.file_id || (item as any).id
			return itemId !== targetId
		})
		.map((item) => {
			// 如果是文件夹，递归处理children
			if (item.is_directory && "children" in item) {
				return {
					...item,
					children: removeItemFromAttachments(item.children || [], targetId),
				}
			}
			return item
		})
}

// 工具函数：从 attachments 中查找文件
const findFileInAttachments = (
	attachments: AttachmentItem[],
	fileId: string,
): AttachmentItem | null => {
	for (const item of attachments) {
		if (item.file_id === fileId) {
			return item
		}
		if (item.is_directory && "children" in item && item.children) {
			const found = findFileInAttachments(item.children, fileId)
			if (found) return found
		}
	}
	return null
}

// 工具函数：查找文件所在的 slide 文件夹（父级 display_config.type === "slide"）
const findParentSlideFolder = (
	attachments: AttachmentItem[],
	targetFileId: string,
): AttachmentItem | null => {
	for (const item of attachments) {
		if (item.is_directory && item.children) {
			// 检查目标文件是否是该文件夹的直接子项
			if (item.children.some((child) => child.file_id === targetFileId)) {
				const config = (item.display_config || item.metadata) as
					{ type?: string; [key: string]: unknown } | undefined
				if (config?.type === "slide") {
					return item
				}
				return null // 找到父级但不是 slide 文件夹
			}
			// 递归检查子文件夹
			const found = findParentSlideFolder(item.children, targetFileId)
			if (found) return found
		}
	}
	return null
}

// 工具函数：处理 OnlyOffice 文件的 buffer（参考 OnlyOffice/index.tsx 的逻辑）
const processOnlyOfficeBuffer = (fileData: ArrayBuffer, fileExtension?: string): ArrayBuffer => {
	const ext = (fileExtension || "").toLowerCase()

	// CSV 和 TXT 是文本文件，直接返回原始数据
	if (["csv", "txt"].includes(ext)) {
		return fileData
	}

	// 检查 ZIP 文件头（Excel/Docx/PPT 都是 ZIP 格式）
	if (fileData.byteLength >= 4) {
		const view = new DataView(fileData, 0, 4)
		const signature = view.getUint32(0, true)

		// ZIP 文件魔数: 0x504b0304 (PK\x03\x04)
		if (signature === 0x04034b50) {
			return fileData
		} else {
			// 不是 ZIP 文件，尝试 base64 解码（参考 OnlyOffice/index.tsx 的 stringToBuffer）
			try {
				const text = new TextDecoder("utf-8").decode(fileData)
				// 验证是否是有效的 base64 字符串
				const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
				if (base64Regex.test(text.trim())) {
					const binary = atob(text)
					const bytes = new Uint8Array(binary.length)
					for (let i = 0; i < binary.length; i++) {
						bytes[i] = binary.charCodeAt(i)
					}
					return bytes.buffer
				}
			} catch (e) {
				// base64 解码失败，返回原始数据
				console.warn("base64 decode failed, using original data:", e)
			}
			return fileData
		}
	}
	return fileData
}

// 工具函数：获取 OnlyOffice 文件的 MIME type
const getOnlyOfficeMimeType = (fileExtension: string): string => {
	const ext = fileExtension.toLowerCase()
	if (["xlsx", "xls"].includes(ext)) {
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
	} else if (ext === "csv") {
		return "text/csv"
	} else if (ext === "docm") {
		return "application/vnd.ms-word.document.macroEnabled.12"
	} else if (["docx"].includes(ext)) {
		return "application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=UTF-8"
	} else if (["pptx", "ppt"].includes(ext)) {
		return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
	}
	return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
}

// 工具函数：下载 OnlyOffice 文件（通过 file_id 获取 buffer 并下载）
const downloadOnlyOfficeFile = async (
	fileId: string,
	fileExtension: string,
	attachments: AttachmentItem[] | undefined,
	mode?: DownloadImageMode,
): Promise<void> => {
	// 获取文件下载 URL
	const res = await getTemporaryDownloadUrl({
		file_ids: [fileId],
		download_mode: mode,
		is_download: true,
	})
	if (!res[0]?.url) {
		throw new Error("无法获取文件下载地址")
	}

	// 下载文件内容为 ArrayBuffer
	const fileData = await downloadFileContent(res[0].url, {
		responseType: "arrayBuffer",
	})

	if (!(fileData instanceof ArrayBuffer)) {
		throw new Error("文件数据格式错误")
	}

	// 处理 buffer（传递文件扩展名以正确处理 CSV 等文本文件）
	const finalBuffer = processOnlyOfficeBuffer(fileData, fileExtension)

	// 获取 MIME type
	const mimeType = getOnlyOfficeMimeType(fileExtension)

	// 创建 blob URL 并使用 downloadFileWithAnchor 下载
	const blob = new Blob([finalBuffer], { type: mimeType })
	const blobUrl = window.URL.createObjectURL(blob)

	// 从 attachments 中查找文件名
	let fileName: string | undefined
	if (attachments) {
		const fileItem = findFileInAttachments(attachments, fileId)
		fileName = fileItem?.file_name || fileItem?.display_filename || fileItem?.filename
	}

	downloadFileWithAnchor(blobUrl, fileName)

	// 清理 blob URL
	setTimeout(() => {
		window.URL.revokeObjectURL(blobUrl)
	}, 100)
}

export interface UseFileOperationsOptions {
	setUserSelectDetail?: (detail: any) => void
	onFileClick?: (fileItem: any) => void
	attachments?: AttachmentItem[]
	selectedTopic?: any
	projectId?: string
	/** 文件上传凭证所属的特殊空间。 */
	fileScope?: FileScope
	getItemId?: (item: AttachmentItem) => string
	onFileDelete?: (fileId: string) => Promise<void>
	// 新增：文件创建成功回调
	onFileCreated?: (fileItem: any) => void
	onUpdateAttachments?: () => void
	// 添加直接更新attachments的回调
	onAttachmentsChange?: (attachments: AttachmentItem[]) => void
	selectedProject?: ProjectListItem
	// 外部传入的共享 duplicateFileHandler（可选）
	duplicateFileHandler?: ReturnType<typeof useDuplicateFileHandler>
	// 新增：用于收集多个选中文件的分享
	selectedItems?: Set<string>
	filteredFiles?: AttachmentItem[]
	downloadProgress?: DownloadProgressController
}

/**
 * useFileOperations - 处理所有文件操作功能
 */
export function useFileOperations(options: UseFileOperationsOptions = {}) {
	const {
		setUserSelectDetail,
		onFileClick,
		attachments,
		selectedTopic,
		projectId,
		fileScope,
		getItemId,
		onFileDelete,
		onFileCreated,
		onUpdateAttachments,
		onAttachmentsChange,
		selectedProject,
		duplicateFileHandler: externalDuplicateHandler,
		selectedItems,
		filteredFiles,
		downloadProgress,
	} = options
	const { t } = useTranslation("super")
	const waitForAttachmentMutation = useMemoizedFn(
		(options: {
			fileIds?: string[]
			operations?: string[]
			matchMode?: "exact-file" | "project-any-apply"
			reason: string
			callback?: () => void
		}) => {
			if (fileScope) {
				options.callback?.()
				return
			}

			void waitForProjectAttachmentChange(projectId, {
				...options,
				fallback: "full-refresh",
			})
		},
	)

	// 文件打开功能
	const { handleOpenFile } = useFileOpen({
		onFileClick,
		setUserSelectDetail,
		attachments,
	})

	const workspaceId = selectedProject?.workspace_id

	// 分享模态框状态
	const [shareModalVisible, setShareModalVisible] = useState(false)
	// 打开文件分享弹层时携带的上下文：预选文件、资源 id、以及树/列表中默认展开定位的文件 id
	const [shareFileInfo, setShareFileInfo] = useState<{
		projectName?: string
		fileIds: string[]
		resourceId?: string
		/** 与 createShareHandler / useShareFile 对齐：弹层内默认展开或高亮的文件 id */
		defaultOpenFileId?: string
	} | null>(null)

	// 文件导出loading状态
	const [exportingFiles, setExportingFiles] = useState<Set<string>>(new Set())

	// 文件夹下载loading状态
	const [downloadingFolders, setDownloadingFolders] = useState<Set<string>>(new Set())

	// 删除状态管理
	const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(new Set())

	// 文件创建loading状态
	const [creatingFiles, setCreatingFiles] = useState<Set<string>>(new Set())

	// 文件移动loading状态
	const [movingFiles, setMovingFiles] = useState<Set<string>>(new Set())

	// 获取父文件夹ID - 从路径中解析
	const getParentIdFromPath = useCallback(
		(parentPath?: string): string | number | undefined => {
			return _getParentIdFromPath(attachments || [], parentPath)
		},
		[attachments],
	)

	// 通用的文件上传处理函数（实际执行上传）- 用于普通文件上传（每个文件一个任务）
	const processFilesUpload = useCallback(
		async (files: File[], suffixDir?: string, parentIdOverride?: string) => {
			const refreshCoordinator = createUploadRefreshCoordinator({
				uploadType: "file",
				projectFiles: attachments || [],
				uploadFileCount: files.length,
				onUpdateAttachments,
			})
			const currentProjectFileCount = refreshCoordinator.currentProjectFileCount
			// 获取父文件夹路径
			const parentPath = suffixDir ? `/${suffixDir}` : undefined
			// 获取父文件夹ID
			const parentId = parentIdOverride ?? (getParentIdFromPath(parentPath) as string)
			const parentIdSource = parentIdOverride ? "targetItem.file_id" : "pathLookup"

			uploadLogger.log("resolveUploadParent", {
				uploadType: "file",
				suffixDir,
				parentPath,
				parentId,
				parentIdSource,
				filesCount: files.length,
			})

			// 为每个文件创建单独的任务
			for (const file of files) {
				try {
					uploadLogger.log("createUploadTaskStart", {
						uploadType: "file",
						fileName: file.name,
						parentId,
						parentIdSource,
						currentProjectFileCount,
					})
					// 为单个文件创建任务
					await multiFolderUploadStore.createUploadTask([file], parentId, {
						projectId: projectId || "",
						fileScope,
						workspaceId: workspaceId,
						projectName: selectedProject?.project_name || t("common.untitledProject"),
						topicId: selectedTopic?.id,
						taskId: "",
						storageType: "workspace",
						source: UploadSource.ProjectFile,
						// 单个文件任务完成时的回调
						onComplete: (taskId: string) => {
							console.log(
								`📄 File upload task ${taskId} for "${file.name}" completed`,
							)
							refreshCoordinator.handleFileTaskComplete(taskId, {
								fileName: file.name,
							})
						},
						onError: (taskId: string) => {
							refreshCoordinator.handleFileTaskError(taskId, { fileName: file.name })
						},
						// 批次上传完成回调（对单文件来说就是文件完成）
						onBatchUploadComplete: (batchInfo) => {
							console.log(
								`📄 File "${file.name}" upload progress: ${batchInfo.currentBatch}/${batchInfo.totalBatches}, success: ${batchInfo.batchSuccessCount}, failed: ${batchInfo.batchFailedCount}`,
							)
						},
						// 批量保存完成回调
						onBatchSaveComplete: (batchSaveInfo: BatchSaveInfo) => {
							console.log(
								`💾 File "${file.name}" save completed: ${batchSaveInfo.savedFilesCount} files saved to project, total processed: ${batchSaveInfo.totalProcessedFiles}`,
							)
							refreshCoordinator.handleBatchSaveComplete(batchSaveInfo, {
								fileName: file.name,
							})
						},
					})

					refreshCoordinator.markTaskCreated({ fileName: file.name, parentId })
					uploadLogger.log("createUploadTaskSuccess", {
						uploadType: "file",
						fileName: file.name,
						parentId,
					})
					console.log(`✅ Successfully created upload task for file: ${file.name}`)
				} catch (error) {
					refreshCoordinator.markTaskCreateFailed({ fileName: file.name, parentId })
					uploadLogger.logError("createUploadTask", error, {
						uploadType: "file",
						fileName: file.name,
						parentId,
					})
					console.error(`❌ Failed to create upload task for file ${file.name}:`, error)
				}
			}

			const uploadStats = refreshCoordinator.getStats()
			uploadLogger.finishSession({
				uploadType: "file",
				status: uploadStats.taskCreateFailedCount > 0 ? "partial_failed" : "task_created",
				createdTaskCount: uploadStats.createdTaskCount,
				failedTaskCount: uploadStats.taskCreateFailedCount,
				parentId,
				parentIdSource,
			})
		},
		[
			projectId,
			fileScope,
			workspaceId,
			selectedProject,
			selectedTopic,
			t,
			onUpdateAttachments,
			attachments,
			getParentIdFromPath,
		],
	)

	// 文件夹上传处理函数（所有文件作为一个任务）
	const processFolderUpload = useCallback(
		async (files: File[], suffixDir?: string, parentIdOverride?: string) => {
			const refreshCoordinator = createUploadRefreshCoordinator({
				uploadType: "folder",
				projectFiles: attachments || [],
				uploadFileCount: files.length,
				onUpdateAttachments,
			})
			const currentProjectFileCount = refreshCoordinator.currentProjectFileCount
			// 获取父文件夹ID
			const parentPath = suffixDir ? `/${suffixDir}` : undefined
			const parentId = parentIdOverride ?? (getParentIdFromPath(parentPath) as string)
			const parentIdSource = parentIdOverride ? "targetItem.file_id" : "pathLookup"
			uploadLogger.log("resolveUploadParent", {
				uploadType: "folder",
				suffixDir,
				parentPath,
				parentId,
				parentIdSource,
				filesCount: files.length,
			})

			try {
				uploadLogger.log("createUploadTaskStart", {
					uploadType: "folder",
					filesCount: files.length,
					parentId,
					parentIdSource,
					currentProjectFileCount,
				})
				// 所有文件作为一个任务
				await multiFolderUploadStore.createUploadTask(files, parentId, {
					projectId: projectId || "",
					fileScope,
					workspaceId: workspaceId,
					projectName: selectedProject?.project_name || t("common.untitledProject"),
					topicId: selectedTopic?.id,
					taskId: "",
					storageType: "workspace",
					source: UploadSource.ProjectFile,
					// 文件夹任务完成时的回调
					onComplete: (taskId: string) => {
						console.log(`📁 Folder upload task ${taskId} completed`)
						refreshCoordinator.flushDeferredRefresh("taskComplete", { taskId })
					},
					onError: (taskId: string) => {
						refreshCoordinator.flushDeferredRefresh("taskError", { taskId })
					},
					// 批次上传完成回调
					onBatchUploadComplete: (batchInfo) => {
						console.log(
							`📁 Folder upload progress: ${batchInfo.currentBatch}/${batchInfo.totalBatches}, success: ${batchInfo.batchSuccessCount}, failed: ${batchInfo.batchFailedCount}`,
						)
					},
					// 批量保存完成回调
					onBatchSaveComplete: (batchSaveInfo: BatchSaveInfo) => {
						console.log(
							`💾 Folder save completed: ${batchSaveInfo.savedFilesCount} files saved to project, total processed: ${batchSaveInfo.totalProcessedFiles}`,
						)
						refreshCoordinator.handleBatchSaveComplete(batchSaveInfo)
					},
				})

				refreshCoordinator.markTaskCreated({ filesCount: files.length, parentId })
				uploadLogger.log("createUploadTaskSuccess", {
					uploadType: "folder",
					filesCount: files.length,
					parentId,
				})
				uploadLogger.finishSession({
					uploadType: "folder",
					status: "task_created",
					filesCount: files.length,
					parentId,
					parentIdSource,
				})
				console.log(`✅ Successfully created folder upload task with ${files.length} files`)
			} catch (error) {
				refreshCoordinator.markTaskCreateFailed({ filesCount: files.length, parentId })
				uploadLogger.logError("createUploadTask", error, {
					uploadType: "folder",
					filesCount: files.length,
					parentId,
				})
				uploadLogger.finishSession({
					uploadType: "folder",
					status: "failed",
					filesCount: files.length,
					parentId,
					parentIdSource,
				})
				console.error(`❌ Failed to create folder upload task:`, error)
			}
		},
		[
			projectId,
			fileScope,
			workspaceId,
			selectedProject,
			selectedTopic,
			t,
			onUpdateAttachments,
			attachments,
			getParentIdFromPath,
		],
	)

	// 同名文件处理 handler（优先使用外部传入的共享 handler）
	const internalDuplicateHandler = useDuplicateFileHandler({
		attachments: attachments || [],
	})
	const duplicateFileHandler = externalDuplicateHandler || internalDuplicateHandler

	// 集成文件上传功能
	const { uploading, removeFile } = useFileUpload({
		projectId,
		onFileCompleted: () => {
			onUpdateAttachments?.()
		},
		storageType: "workspace",
		source: UploadSource.ProjectFile,
		needFilterSameFile: false,
		maxUploadCount: 99999,
		maxUploadSize: multiFolderUploadStore.uploadConfig.maxFileSize, // 使用store的配置
	})

	// 创建文件的实际实现 - 供useVirtualFile调用
	const createFileAndUpload = async (file: File, suffixDir?: string) => {
		if (!projectId) {
			throw new Error("项目ID不能为空")
		}

		const fileKey = `${Date.now()}-${Math.random()}`
		setCreatingFiles((prev) => new Set(prev).add(fileKey))

		try {
			// 获取父文件夹ID
			const parentPath = suffixDir ? `/${suffixDir}` : undefined
			const parent_id = getParentIdFromPath(parentPath)

			console.log("🔵 创建文件:", {
				file_name: file.name,
				project_id: projectId,
				parent_id,
				parentPath,
				suffixDir,
			})

			// 调用新的创建文件API
			const response = await SuperMagicApi.createFile({
				project_id: projectId,
				parent_id,
				file_name: file.name,
				is_directory: false,
			})

			console.log("✅ 文件创建成功:", response)

			waitForAttachmentMutation({
				fileIds: response.file_id ? [response.file_id] : undefined,
				operations: ["add"],
				reason: "topic-files-create-file",
				callback: () => {
					// Open the new file tab after the file list updates.
					if (onFileCreated && response.file_id) {
						console.log("🔵 调用文件创建回调，自动打开Tab:", response.file_id)
						onFileCreated(response)
					}
				},
			})
			onUpdateAttachments?.()

			return response
		} catch (error) {
			console.error("创建文件失败:", error)
			throw error
		} finally {
			setCreatingFiles((prev) => {
				const newSet = new Set(prev)
				newSet.delete(fileKey)
				return newSet
			})
		}
	}

	// 创建文件夹的实际实现 - 供useVirtualFolder调用
	const createFolderAndUpload = async (folderName: string, parentPath?: string) => {
		if (!projectId) {
			throw new Error("项目ID不能为空")
		}

		const folderKey = `${Date.now()}-${Math.random()}`
		setCreatingFiles((prev) => new Set(prev).add(folderKey))

		try {
			// 获取父文件夹ID
			const parent_id = getParentIdFromPath(parentPath)

			console.log("🔵 创建文件夹:", {
				file_name: folderName,
				project_id: projectId,
				parent_id,
				parentPath,
			})

			// 调用新的创建文件夹API
			const response = await SuperMagicApi.createFile({
				project_id: projectId,
				parent_id,
				file_name: folderName,
				is_directory: true,
			})

			console.log("✅ 文件夹创建成功:", response)

			onUpdateAttachments?.()

			return response
		} catch (error) {
			console.error("创建文件夹失败:", error)
			throw error
		} finally {
			setCreatingFiles((prev) => {
				const newSet = new Set(prev)
				newSet.delete(folderKey)
				return newSet
			})
		}
	}

	const createDesignProject = async (folderName: string, parentPath?: string) => {
		if (!projectId) {
			throw new Error("项目ID不能为空")
		}

		const projectKey = `${Date.now()}-${Math.random()}`
		setCreatingFiles((prev) => new Set(prev).add(projectKey))

		try {
			// 获取父文件夹ID
			const parent_id = getParentIdFromPath(parentPath)

			const { folder } = await createDesignProjectFiles({
				projectId,
				parentId: parent_id,
				folderName,
			})

			onUpdateAttachments?.()

			magicToast.success(t("topicFiles.contextMenu.createDesignSuccess"))

			return folder
		} catch (error) {
			magicToast.error(t("topicFiles.contextMenu.createDesignFailed"))
			throw error
		} finally {
			setCreatingFiles((prev) => {
				const newSet = new Set(prev)
				newSet.delete(projectKey)
				return newSet
			})
		}
	}

	const createSelfMediaProject = (folderName: string, parentPath?: string) =>
		createSelfMediaProjectAction({
			projectId,
			folderName,
			parentPath,
			getParentIdFromPath,
			setCreatingFiles,
			onUpdateAttachments,
			t,
		})

	const createAICardProject = (folderName: string, parentPath?: string) =>
		createAICardProjectAction({
			projectId,
			folderName,
			parentPath,
			getParentIdFromPath,
			setCreatingFiles,
			onUpdateAttachments,
			t,
		})

	const handleUploadFile = (item?: AttachmentItem) => {
		// 获取上传目标文件夹路径
		const targetPath = item?.is_directory ? item.relative_file_path || item.name : undefined
		// 清理路径：移除前导和尾随斜杠，确保路径格式统一
		const targetSuffixDir = targetPath ? targetPath.replace(/^\/+|\/+$/g, "") : ""

		// 创建隐藏的文件输入框
		const input = document.createElement("input")
		input.type = "file"
		input.multiple = true
		input.style.display = "none"

		// 处理文件选择
		input.onchange = async (e) => {
			const fileList = (e.target as HTMLInputElement).files
			if (fileList && fileList.length > 0) {
				const files = Array.from(fileList)

				console.log("选择的文件:", files)
				console.log("上传目标路径:", targetPath)
				console.log("计算的suffixDir:", targetSuffixDir)

				// 通过同名检测处理文件上传
				await duplicateFileHandler.handleFilesWithDuplicateCheck(
					files,
					targetSuffixDir,
					processFilesUpload,
				)
			}

			// 清理DOM
			document.body.removeChild(input)
		}

		// 触发文件选择
		document.body.appendChild(input)
		input.click()
	}

	// 文件夹上传操作 - 使用全局多任务上传
	const handleUploadFolder = (item?: AttachmentItem) => {
		// 获取上传目标文件夹路径
		const targetPath = item?.is_directory ? item.relative_file_path || item.name : undefined
		// 清理路径：移除前导和尾随斜杠，确保路径格式统一
		const targetSuffixDir = targetPath ? targetPath.replace(/^\/+|\/+$/g, "") : ""

		// 创建隐藏的文件输入框
		const input = document.createElement("input")
		input.type = "file"
		input.multiple = true
		input.webkitdirectory = true
		input.style.display = "none"

		// 处理文件选择
		input.onchange = async (e) => {
			const fileList = (e.target as HTMLInputElement).files
			if (fileList && fileList.length > 0) {
				const files = Array.from(fileList)

				// 通过同名检测处理文件夹上传（使用 processFolderUpload 创建单个任务）
				await duplicateFileHandler.handleFilesWithDuplicateCheck(
					files,
					targetSuffixDir,
					processFolderUpload,
				)
			}

			// 清理DOM
			document.body.removeChild(input)
		}

		// 触发文件选择
		document.body.appendChild(input)
		input.click()
	}

	// 分享操作
	const handleShareItem = useCallback(
		(item: AttachmentItem) => {
			if (!selectedItems || !filteredFiles) {
				// 如果没有选中项或文件列表，只分享当前文件
				const clickedItemId = item.file_id || ""
				if (clickedItemId) {
					setShareFileInfo({
						projectName: selectedProject?.project_name,
						fileIds: [clickedItemId],
					})
					setShareModalVisible(true)
				}
				return
			}

			if (getItemId) {
				createShareHandler({
					item,
					selectedItems,
					allFiles: filteredFiles,
					getItemId,
					setShareFileInfo,
					setShareModalVisible,
				})
			}
		},
		[selectedItems, filteredFiles, getItemId, selectedProject?.project_name],
	)

	// 处理分享保存
	const handleShareSave = useCallback(
		({ type, extraData }: { type: ShareType; extraData: any }) => {
			// 使用 handleShareFunction 处理分享逻辑
			handleShareFunction({
				type,
				extraData,
				topicId: projectId || "",
				resourceType: ResourceType.Project,
			})
		},
		[projectId],
	)

	// 删除文件或文件夹
	const handleDeleteItem = async (item: AttachmentItem) => {
		// 获取文件ID，优先使用 getItemId，否则使用 file_id
		const fileId = getItemId ? getItemId(item) : item.file_id

		// 如果没有 fileId 且不是文件夹，显示错误信息
		if (!fileId) {
			magicToast.error(t("topicFiles.contextMenu.deleteFileFailed"))
			return
		}

		// 防止重复删除
		if (deletingFileIds.has(fileId)) {
			return
		}

		try {
			// 添加到删除中状态
			setDeletingFileIds((prev) => new Set(prev).add(fileId))

			// 删除当前文件/文件夹
			await SuperMagicApi.deleteFile(fileId)
			removeFile(fileId)

			// 更新 attachments 列表
			const updatedAttachments = removeItemFromAttachments(attachments || [], fileId)
			onAttachmentsChange?.(updatedAttachments)

			// 调用删除回调
			if (onFileDelete) {
				await onFileDelete(fileId)
			}

			// 如果没有本地更新回调，回退到pubsub方式
			if (!onAttachmentsChange) {
				onUpdateAttachments?.()
			}

			// 获取文件/文件夹名称
			const itemName =
				item.display_filename || item.file_name || item.filename || item.name || "未知项目"

			magicToast.success(
				item.is_directory
					? t("topicFiles.contextMenu.deleteFolderSuccessWithName", { name: itemName })
					: t("topicFiles.contextMenu.deleteFileSuccessWithName", { name: itemName }),
			)
		} catch (error) {
			console.error("删除失败:", error)
		} finally {
			// 移除删除中状态
			setDeletingFileIds((prev) => {
				const newSet = new Set(prev)
				newSet.delete(fileId)
				return newSet
			})
		}
	}

	// 检查文件是否正在删除中
	const isFileDeleting = (item: AttachmentItem) => {
		const fileId = getItemId ? getItemId(item) : item.file_id

		// 如果有 fileId，检查是否在删除中
		if (fileId) {
			return deletingFileIds.has(fileId)
		}

		// 如果没有 fileId 且是文件夹，检查文件夹删除状态
		if (!fileId && item.is_directory) {
			const folderPath = item.relative_file_path || item.name || ""
			const deleteKey = `folder-${folderPath}`
			return deletingFileIds.has(deleteKey)
		}

		return false
	}

	// 检查文件夹是否正在下载
	const isFolderDownloading = (item: AttachmentItem): boolean => {
		if (item.is_directory && item.file_id) {
			return downloadingFolders.has(item.file_id)
		}
		return false
	}

	// 下载原始文件
	const handleDownloadOriginal = async (item: AttachmentItem, mode?: DownloadImageMode) => {
		if (item.is_directory && item.file_id) {
			// 为文件夹添加下载loading状态
			setDownloadingFolders((prev) => new Set(prev).add(item.file_id || ""))

			try {
				// 文件夹下载：只传文件夹ID，走批量下载路径
				await handleDownloadFile(item.file_id, undefined, undefined, true)
			} finally {
				// 下载完成后移除loading状态
				setDownloadingFolders((prev) => {
					const newSet = new Set(prev)
					newSet.delete(item.file_id || "")
					return newSet
				})
			}
		} else if (item.file_id) {
			await handleDownloadFile(item.file_id, mode, item.file_extension)
		}
	}

	// 下载PDF格式（Markdown 走 markdown 导出；HTML 走 exportPDF；仅 display_config.type === "slide" 时传 pptMode）
	const handleDownloadPdf = useCallback(
		async (item: AttachmentItem, folderChildren?: AttachmentItem[]) => {
			if (!item.file_id) return

			const documentExporter = documentExportService.get()
			if (!documentExporter) {
				magicToast.error(t("topicFiles.contextMenu.fileExport.unsupportedInCurrentVersion"))
				return
			}

			const toastId = createRandomUuidV4()
			const resourceErrors = documentExporter.createResourceErrorCollector(t)
			const displayConfig = item.display_config as
				{ type?: string; slides?: string[]; [key: string]: unknown } | undefined
			const metadata = item.metadata as
				{ type?: string; slides?: string[]; [key: string]: unknown } | undefined
			let mergedDisplayConfig = displayConfig || metadata
			let slidePaths: string[] = Array.isArray(mergedDisplayConfig?.slides)
				? mergedDisplayConfig.slides
				: []
			let isSlideFolder = slidePaths.length > 0 || mergedDisplayConfig?.type === "slide"

			// 如果当前文件本身不是 slide 文件夹，检查是否在 slide 文件夹内部
			if (!isSlideFolder && !item.is_directory && attachments) {
				const parentFolder = findParentSlideFolder(attachments, item.file_id)
				if (parentFolder) {
					isSlideFolder = true
					const parentConfig = (parentFolder.display_config || parentFolder.metadata) as
						{ type?: string; slides?: string[]; [key: string]: unknown } | undefined
					mergedDisplayConfig = parentConfig
					slidePaths = [] // 单文件，不走多 slide 路径
				}
			}

			setExportingFiles((prev) => new Set(prev).add(item.file_id || ""))
			magicToast.loading({
				key: toastId,
				content: t("topicFiles.exporting"),
				duration: 0,
			})

			try {
				const isPptMode = mergedDisplayConfig?.type === "slide"

				if (isSlideFolder) {
					// 多页 HTML 文件夹（PPT 用 pptMode，普通文档模式按 A4 分页）
					// 找到入口文件（entry HTML），用它的 file_id 来加载内容
					const children = folderChildren?.length ? folderChildren : item.children || []
					const appEntryFile = getAppEntryFile(children, mergedDisplayConfig)
					const entryFileId = appEntryFile?.file_id || item.file_id
					const entryFileName = appEntryFile?.file_name || item.file_name

					const isSingleFile = !slidePaths.length
					const result = isSingleFile
						? await prepareSingleSlideExport({
								fileId: entryFileId,
								fileName: entryFileName,
								attachmentList: attachments ?? [],
							})
						: await prepareExportSlides({
								slidePaths,
								attachmentList: children.length ? children : (attachments ?? []),
								mainFileId: entryFileId,
								mainFileName: entryFileName,
								displayConfig: mergedDisplayConfig,
							})

					if (!result.htmlSlides.some(Boolean)) {
						magicToast.error({
							key: toastId,
							content: t("topicFiles.contextMenu.fileExport.exportFailed"),
							duration: 1000,
						})
						return
					}

					const preparedHtmlSlides = await prepareHtmlPagesForExport({
						pages: result.htmlSlides,
						attachments: attachments ?? [],
						fileId: entryFileId,
						fileName: entryFileName,
						attachmentList: attachments ?? [],
						displayConfig: mergedDisplayConfig,
					})

					const handle = documentExporter.exportPages(preparedHtmlSlides, {
						fileName: (result.fileName || "export") + ".pdf",
						skipFailedPages: true,
						pptMode: isPptMode,
						vector: {
							fitContentWidth: !isPptMode,
						},
						onResourceLoadError: resourceErrors.onResourceLoadError,
						onPageProgress: (ctx) => {
							const { index, total } = ctx as DocumentExport.PageProgressContext
							if (total <= 1) return
							magicToast.loading({
								key: toastId,
								content: `${t("topicFiles.exporting")} (${index + 1}/${total})`,
								duration: 0,
							})
						},
					})

					await handle.promise
				} else {
					// 单文件按类型走独立导出路线
					if (isMarkdownFileName(item.file_name)) {
						await documentExporter.exportMarkdownFile({
							fileId: item.file_id,
							fileName: item.file_name || "export.pdf",
							relativeFilePath: item.relative_file_path,
							attachments: (attachments ?? []) as any[],
							onResourceLoadError: resourceErrors.onResourceLoadError,
							onProgress: ({ phase, current, total }) => {
								if (phase !== "capture" || total <= 1) return
								magicToast.loading({
									key: toastId,
									content: `${t("topicFiles.exporting")} (${current}/${total})`,
									duration: 0,
								})
							},
						}).promise
					} else {
						const result = await prepareSingleSlideExport({
							fileId: item.file_id,
							fileName: item.file_name,
							attachmentList: attachments ?? [],
						})

						if (!result.htmlSlides.some(Boolean)) {
							magicToast.error({
								key: toastId,
								content: t("topicFiles.contextMenu.fileExport.exportFailed"),
								duration: 1000,
							})
							return
						}

						const preparedHtmlSlides = await prepareHtmlPagesForExport({
							pages: result.htmlSlides,
							attachments: attachments ?? [],
							fileId: item.file_id,
							fileName: item.file_name,
							attachmentList: attachments ?? [],
							displayConfig: mergedDisplayConfig,
						})

						await documentExporter.exportPages(preparedHtmlSlides, {
							fileName: (result.fileName || "export") + ".pdf",
							skipFailedPages: true,
							pptMode: isPptMode,
							vector: {
								fitContentWidth: !isPptMode,
							},
							onResourceLoadError: resourceErrors.onResourceLoadError,
							onPageProgress: (ctx) => {
								const { index, total } = ctx as DocumentExport.PageProgressContext
								if (total <= 1) return
								magicToast.loading({
									key: toastId,
									content: `${t("topicFiles.exporting")} (${index + 1}/${total})`,
									duration: 0,
								})
							},
						}).promise
					}
				}

				magicToast.success({
					key: toastId,
					content: t("topicFiles.exportSuccess"),
					duration: 1000,
				})
			} catch (error: unknown) {
				const isAbort = (error as { name?: string } | null)?.name === "AbortError"
				if (isAbort) {
					magicToast.info({
						key: toastId,
						content: t("topicFiles.exportCancel"),
						duration: 1000,
					})
				} else {
					console.error("[exportPDF] export failed:", error)
					magicToast.error({
						key: toastId,
						content: t("topicFiles.contextMenu.fileExport.exportFailed"),
						duration: 1000,
					})
				}
			} finally {
				setExportingFiles((prev) => {
					const newSet = new Set(prev)
					newSet.delete(item.file_id || "")
					return newSet
				})
			}
		},
		[t, attachments],
	)

	// 下载PPT格式
	const handleDownloadPpt = useCallback(
		(item: AttachmentItem) => {
			if (item.file_id) {
				const onStart = () => {
					setExportingFiles((prev) => new Set(prev).add(item.file_id || ""))
				}
				const onEnd = () => {
					setExportingFiles((prev) => {
						const newSet = new Set(prev)
						newSet.delete(item.file_id || "")
						return newSet
					})
				}
				exportSingleFileToPpt({
					fileId: item.file_id,
					projectId,
					t,
					onStart,
					onEnd,
					onError: onEnd,
				})
			}
		},
		[projectId, t],
	)

	// 导出可编辑PPTX（前端 html2pptx，通过 prepareExportSlides 服务准备数据）
	const handleDownloadPptx = useCallback(
		async (item: AttachmentItem, folderChildren?: AttachmentItem[]) => {
			if (!item.file_id) return

			const toastId = createRandomUuidV4()
			const displayConfig = item.display_config as
				{ type?: string; slides?: string[]; [key: string]: unknown } | undefined
			const metadata = item.metadata as
				{ type?: string; slides?: string[]; [key: string]: unknown } | undefined
			const mergedDisplayConfig = displayConfig || metadata
			const slidePaths: string[] = Array.isArray(mergedDisplayConfig?.slides)
				? mergedDisplayConfig.slides
				: []
			const isSingleFile = !slidePaths.length
			const autoSize = !hasPPTMetadata(item)

			let exportHandle: ReturnType<typeof exportPPTX> | null = null
			const resourceErrors = createPptxResourceErrorCollector(t)
			setExportingFiles((prev) => new Set(prev).add(item.file_id || ""))

			try {
				magicToast.loading({
					key: toastId,
					content: t("topicFiles.exporting"),
					duration: 0,
				})

				const result = isSingleFile
					? await prepareSingleSlideExport({
							fileId: item.file_id,
							fileName: item.file_name,
							attachmentList: attachments ?? [],
						})
					: await prepareExportSlides({
							slidePaths,
							attachmentList: folderChildren?.length
								? folderChildren
								: (attachments ?? []),
							mainFileId: item.file_id,
							mainFileName: item.file_name,
							displayConfig: mergedDisplayConfig,
						})

				if (!result.htmlSlides.some(Boolean)) {
					magicToast.error({
						key: toastId,
						content: t("topicFiles.contextMenu.fileExport.exportFailed"),
						duration: 1000,
					})
					return
				}

				const preparedHtmlSlides = await prepareHtmlPagesForExport({
					pages: result.htmlSlides,
					attachments: attachments ?? [],
					fileId: item.file_id,
					fileName: item.file_name,
					attachmentList: attachments ?? [],
					displayConfig: mergedDisplayConfig,
				})
				const pptFontResolver = documentExportService.get()?.getPptFontResolver?.()
				const pptxConfig = createPptxSlideConfig(
					resolvePptScaleContentDimensions(preparedHtmlSlides[0]),
				)

				exportHandle = exportPPTX(preparedHtmlSlides, {
					fileName: result.fileName,
					skipFailedPages: true,
					autoSize,
					config: pptxConfig,
					fontResolver: pptFontResolver,
					logger: pptxExternalLogger,
					logLevel: "warn",
					onResourceLoadError: resourceErrors.onResourceLoadError,
					onSlideProgress: ({ index, total }) => {
						const progress = total > 1 ? ` (${index + 1}/${total})` : ""
						magicToast.loading({
							key: toastId,
							content: `${t("topicFiles.exporting")}${progress}`,
							duration: 0,
						})
					},
				})

				await exportHandle.promise

				magicToast.success({
					key: toastId,
					content: t("topicFiles.exportSuccess"),
					duration: 1000,
				})
			} catch (error: unknown) {
				const isAbort = (error as { name?: string } | null)?.name === "AbortError"
				if (isAbort) {
					magicToast.info({
						key: toastId,
						content: t("topicFiles.exportCancel"),
						duration: 1000,
					})
				} else {
					magicToast.error({
						key: toastId,
						content: t("topicFiles.contextMenu.fileExport.exportFailed"),
						duration: 1000,
					})
					reportPptxExportError(error, {
						fileId: item.file_id,
						autoSize,
						source: "useFileOperations",
					})
				}
			} finally {
				setExportingFiles((prev) => {
					const newSet = new Set(prev)
					newSet.delete(item.file_id || "")
					return newSet
				})
			}
		},
		[t, attachments],
	)

	// 导出 HTML / 文本类文件 为图片（PNG / JPEG）
	const handleDownloadImage = useCallback(
		async (item: AttachmentItem, format: "png" | "jpeg" = "png") => {
			if (!item.file_id) return

			const toastId = createRandomUuidV4()
			setExportingFiles((prev) => new Set(prev).add(item.file_id || ""))
			magicToast.loading({
				key: toastId,
				content: t("topicFiles.exporting"),
				duration: 0,
			})

			try {
				const ext = (item.file_extension || "").toLowerCase()
				const isHtml = ext === "html" || ext === "htm"

				if (!isHtml) {
					// 文本类文件（md, txt, code）使用 exportTextToImage
					const [urlItem] =
						(await getTemporaryDownloadUrl({ file_ids: [item.file_id] })) ?? []
					if (!urlItem?.url) {
						magicToast.error({
							key: toastId,
							content: t("topicFiles.contextMenu.fileExport.exportFailed"),
							duration: 1000,
						})
						return
					}
					const textContent = (await downloadFileContent(urlItem.url)) as string
					if (!textContent) {
						magicToast.error({
							key: toastId,
							content: t("topicFiles.contextMenu.fileExport.exportFailed"),
							duration: 1000,
						})
						return
					}

					const language =
						ext === "md"
							? "markdown"
							: ext === "txt" || ext === "log"
								? "plaintext"
								: ext
					const html = textToHtml(textContent, { language })
					await exportHtmlToImage({
						pages: [html],
						format,
						fileName: (item.file_name || "export").replace(/\.[^.]+$/, ""),
						onProgress: ({ phase, current, total }) => {
							if (phase !== "capture" || total <= 1) return
							magicToast.loading({
								key: toastId,
								content: `${t("topicFiles.exporting")} (${current}/${total})`,
								duration: 0,
							})
						},
					}).promise
				} else {
					// HTML 文件使用原有逻辑
					const result = await prepareSingleSlideExport({
						fileId: item.file_id,
						fileName: item.file_name,
						attachmentList: attachments ?? [],
					})

					if (!result.htmlSlides.some(Boolean)) {
						magicToast.error({
							key: toastId,
							content: t("topicFiles.contextMenu.fileExport.exportFailed"),
							duration: 1000,
						})
						return
					}

					const preparedHtmlSlides = await prepareHtmlPagesForExport({
						pages: result.htmlSlides,
						attachments: attachments ?? [],
						fileId: item.file_id,
						fileName: item.file_name,
						attachmentList: attachments ?? [],
					})

					await exportHtmlToImage({
						pages: preparedHtmlSlides,
						format,
						fileName: result.fileName || "export",
						onProgress: ({ phase, current, total }) => {
							if (phase !== "capture" || total <= 1) return
							magicToast.loading({
								key: toastId,
								content: `${t("topicFiles.exporting")} (${current}/${total})`,
								duration: 0,
							})
						},
					}).promise
				}

				magicToast.success({
					key: toastId,
					content: t("topicFiles.exportSuccess"),
					duration: 1000,
				})
			} catch (error: unknown) {
				const isAbort = (error as { name?: string } | null)?.name === "AbortError"
				if (isAbort) {
					magicToast.info({
						key: toastId,
						content: t("topicFiles.exportCancel"),
						duration: 1000,
					})
				} else {
					console.error("[fileImageExport] export failed:", error)
					magicToast.error({
						key: toastId,
						content: t("topicFiles.contextMenu.fileExport.exportFailed"),
						duration: 1000,
					})
				}
			} finally {
				setExportingFiles((prev) => {
					const newSet = new Set(prev)
					newSet.delete(item.file_id || "")
					return newSet
				})
			}
		},
		[t, attachments],
	)

	// 文件下载功能 - 支持单个文件或多个文件
	const handleDownloadFile = useMemoizedFn(
		async (
			file_id: string | string[],
			mode?: DownloadImageMode,
			fileExtension?: string,
			isFolder?: boolean,
			downloadName?: string,
		) => {
			const fileIds = Array.isArray(file_id) ? file_id : [file_id]
			const folderDownloadToastId = isFolder ? createRandomUuidV4() : undefined

			if (fileIds.length === 0) return

			if (fileIds.length === 1 && !isFolder) {
				// 单个文件直接下载
				try {
					// 检查是否为 OnlyOffice 文件
					const ext = (fileExtension || "").toLowerCase()
					const isOnlyOfficeFile = [
						"xlsx",
						"xls",
						"csv",
						"docx",
						"docm",
						"doc",
						"pptx",
						"ppt",
					].includes(ext)

					// 如果是 OnlyOffice 文件，使用专门的下载方法
					if (isOnlyOfficeFile) {
						await downloadOnlyOfficeFile(fileIds[0], ext, attachments, mode)
						return
					}

					// 非 OnlyOffice 文件，使用原来的下载方式
					const res = await getTemporaryDownloadUrl({
						file_ids: fileIds,
						download_mode: mode,
						is_download: true,
					})
					if (res[0]?.url) {
						downloadFileWithAnchor(res[0].url)
					}
				} catch (error) {
					console.error("Download failed:", error)
				}
			} else {
				// 多个文件使用批量下载
				if (downloadProgress) {
					await downloadProgress.startDownload({
						projectId,
						fileIds,
						fileName: downloadName,
						label: t("topicFiles.downloading"),
						onSuccess: () => {
							magicToast.success({
								content: t("topicFiles.downloadSuccess"),
								duration: 1000,
							})
						},
						onError: (error) => {
							const message = error instanceof Error ? error.message : undefined
							magicToast.error({
								content: message || t("interface:ErrorHappened"),
								duration: 1000,
							})
						},
						onCancel: () => {
							magicToast.info(t("topicFiles.downloadAbort"))
						},
					})
					return
				}

				return new Promise<void>((resolve, reject) => {
					if (folderDownloadToastId) {
						// Mobile folder downloads close the action sheet immediately, so the toast
						// must be owned by the async download task rather than the transient sheet UI.
						magicToast.loading({
							key: folderDownloadToastId,
							content: t("topicFiles.downloading"),
							duration: 0,
						})
					}

					SuperMagicApi.createBatchDownload({
						project_id: projectId,
						file_ids: fileIds,
					})
						.then((data) => {
							if (data.status === "ready" && data.download_url) {
								downloadFileWithAnchor(data.download_url, downloadName)
								if (folderDownloadToastId) {
									magicToast.success({
										key: folderDownloadToastId,
										content: t("topicFiles.downloadSuccess"),
										duration: 1000,
									})
								}
								resolve()
								return
							}

							if (data.status === "processing") {
								// 轮询批量下载状态
								const timer = setInterval(async () => {
									try {
										const checkData =
											await SuperMagicApi.checkBatchDownloadStatus(
												data.batch_key,
											)
										if (checkData?.status === "ready") {
											clearInterval(timer)
										}
										if (
											checkData.status === "ready" &&
											checkData.download_url
										) {
											downloadFileWithAnchor(
												checkData.download_url,
												downloadName,
											)
											if (folderDownloadToastId) {
												magicToast.success({
													key: folderDownloadToastId,
													content: t("topicFiles.downloadSuccess"),
													duration: 1000,
												})
											}
											resolve()
										}
										if (checkData?.status === "failed") {
											clearInterval(timer)
											magicToast.error({
												key: folderDownloadToastId,
												content:
													checkData.message ||
													t("interface:ErrorHappened"),
												duration: 1000,
											})
											reject(
												new Error(checkData.message || "Download failed"),
											)
										}
									} catch (error: any) {
										clearInterval(timer)
										console.error("Batch download check failed:", error)
										magicToast.error({
											key: folderDownloadToastId,
											content: error?.message || t("interface:ErrorHappened"),
											duration: 1000,
										})
										reject(error)
									}
								}, 2000)
								return
							}

							magicToast.error({
								key: folderDownloadToastId,
								content: t("topicFiles.downloadFailed"),
								duration: 1000,
							})
							reject(new Error("Download failed"))
						})
						.catch((error) => {
							console.error("Batch download failed:", error)
							magicToast.error({
								key: folderDownloadToastId,
								content: error?.message || t("interface:ErrorHappened"),
								duration: 1000,
							})
							reject(error)
						})
				})
			}
		},
	)

	// 移动文件或文件夹
	const handleMoveFile = useCallback(
		async (fileId: string, targetParentId: string, preFileId?: string) => {
			if (!fileId) {
				magicToast.error(t("topicFiles.error.moveFileParamsRequired"))
				return false
			}

			setMovingFiles((prev) => new Set(prev).add(fileId))
			let data: any = null

			try {
				// 显示移动进度
				magicToast.loading({ content: t("topicFiles.moving"), duration: 0 })

				data = await SuperMagicApi.moveFile({
					file_id: fileId,
					target_parent_id: targetParentId || ROOT_FILE_ID,
					pre_file_id: preFileId,
				})

				// 如果直接完成
				if (data.status === "success") {
					magicToast.destroy()
					magicToast.success(t("topicFiles.success.fileMoved"))
					onUpdateAttachments?.()
					return true
				}

				// 如果需要轮询状态
				if (data.status === "processing" && data.batch_key) {
					// 每2秒轮询批量状态
					const timer = setInterval(async () => {
						try {
							const checkData = await SuperMagicApi.checkBatchOperationStatus(
								data.batch_key,
							)

							// 更新进度显示
							if (checkData.status === "processing") {
								console.log("checkData", checkData?.progress)
							} else if (checkData.status === "success") {
								magicToast.destroy()
								magicToast.success(t("topicFiles.success.fileMoved"))
								onUpdateAttachments?.()
								clearInterval(timer)
								// 移除移动状态
								setMovingFiles((prev) => {
									const newSet = new Set(prev)
									newSet.delete(fileId)
									return newSet
								})
							} else if (checkData.status === "failed") {
								magicToast.destroy()
								magicToast.error(
									checkData.message || t("topicFiles.error.moveFileFailed"),
								)
								clearInterval(timer)
								// 移除移动状态
								setMovingFiles((prev) => {
									const newSet = new Set(prev)
									newSet.delete(fileId)
									return newSet
								})
							} else {
								magicToast.destroy()
								clearInterval(timer)
								// 移除移动状态
								setMovingFiles((prev) => {
									const newSet = new Set(prev)
									newSet.delete(fileId)
									return newSet
								})
							}
						} catch (error) {
							console.error("检查文件移动状态失败:", error)
							magicToast.destroy()
							magicToast.error(t("topicFiles.error.moveFileFailed"))
							clearInterval(timer)
							// 移除移动状态
							setMovingFiles((prev) => {
								const newSet = new Set(prev)
								newSet.delete(fileId)
								return newSet
							})
						}
					}, 2000)
					return true
				}

				// 兼容旧的返回格式
				magicToast.destroy()
				magicToast.success(t("topicFiles.success.fileMoved"))
				onUpdateAttachments?.()
				return true
			} catch (error) {
				console.error("移动文件失败:", error)
				magicToast.destroy()
				return false
			} finally {
				// 只有在非异步处理的情况下才立即移除移动状态
				if (!data || data.status !== "processing") {
					setMovingFiles((prev) => {
						const newSet = new Set(prev)
						newSet.delete(fileId)
						return newSet
					})
				}
			}
		},
		[t, onUpdateAttachments],
	)

	return {
		// 文件操作
		handleUploadFile,
		handleUploadFolder,
		handleShareItem,
		handleDeleteItem,
		handleDownloadOriginal,
		handleDownloadPdf,
		handleDownloadPpt,
		handleDownloadPptx,
		handleDownloadImage,
		handleDownloadFile,
		handleOpenFile,
		handleMoveFile,
		// 分享相关
		shareModalVisible,
		setShareModalVisible,
		shareFileInfo,
		setShareFileInfo,
		handleShareSave,
		selectedTopic,
		// 导出状态
		exportingFiles,
		// 上传状态
		uploading,
		// 删除状态
		deletingFileIds,
		isFileDeleting,
		// 文件夹下载状态
		downloadingFolders,
		isFolderDownloading,
		// 移动状态
		movingFiles,
		// 新增：文件创建回调
		createFileAndUpload,
		// 新增：文件夹创建回调
		createFolderAndUpload,
		// 新增：画布项目创建回调
		createDesignProject,
		// 新增：自媒体项目创建回调
		createSelfMediaProject,
		// 新增：AI 卡片项目创建回调
		createAICardProject,
		// 新增：文件创建loading状态
		creatingFiles,
		// 新增：文件列表更新回调
		onAttachmentsChange,
		removeFile,
		// 新增：获取父级ID
		getParentIdFromPath,

		// 全局文件夹上传状态（只读）
		globalUploadInfo: multiFolderUploadStore.uploadInfo,
		hasActiveUploads: multiFolderUploadStore.hasActiveTasks,
		globalUploadProgress: multiFolderUploadStore.globalProgress,
		activeUploadTasks: multiFolderUploadStore.activeTasks,

		// 同名文件处理状态（统一处理文件和文件夹上传）
		duplicateFileHandler,
	}
}
