import { useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { UploadSource } from "../../MessageEditor/hooks/useFileUpload"
import { multiFolderUploadStore } from "@/stores/folderUpload"
import type { BatchSaveInfo } from "@/stores/folderUpload/types"
import type { AttachmentItem } from "./types"
import { useDuplicateFileHandler } from "./useDuplicateFileHandler"
import { createUploadRefreshCoordinator } from "../utils/uploadRefreshController"

interface UseUploadWithModalOptions {
	projectId?: string
	selectedProject?: any
	selectedTopic?: any
	attachments?: AttachmentItem[]
	duplicateFileHandler?: ReturnType<typeof useDuplicateFileHandler>
	onUpdateAttachments?: () => void
}

export function useUploadWithModal({
	projectId,
	selectedProject,
	selectedTopic,
	attachments = [],
	duplicateFileHandler: externalDuplicateHandler,
	onUpdateAttachments,
}: UseUploadWithModalOptions) {
	const { t } = useTranslation("super")
	const workspaceId = selectedProject?.workspace_id

	// UploadModal 状态管理
	const [uploadModalVisible, setUploadModalVisible] = useState(false)
	const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([])
	const [isUploadingFolder, setIsUploadingFolder] = useState(false)

	// 实际上传处理函数（用于单个文件上传）
	const processFilesUpload = useCallback(
		async (files: File[], parentId?: string) => {
			const refreshCoordinator = createUploadRefreshCoordinator({
				uploadType: "file",
				projectFiles: attachments,
				uploadFileCount: files.length,
				onUpdateAttachments,
			})

			let firstError: unknown

			// File upload: create one task per file sequentially to avoid Promise spikes.
			for (const file of files) {
				try {
					await multiFolderUploadStore.createUploadTask([file], parentId, {
						projectId: projectId || "",
						workspaceId,
						projectName: selectedProject?.project_name || t("common.untitledProject"),
						topicId: selectedTopic?.id,
						taskId: "",
						storageType: "workspace",
						source: UploadSource.ProjectFile,
						onComplete: (taskId: string) => {
							console.log(
								`📄 Modal file upload task ${taskId} completed for ${file.name}`,
							)
							refreshCoordinator.handleFileTaskComplete(taskId, {
								fileName: file.name,
							})
						},
						onError: (taskId: string) => {
							refreshCoordinator.handleFileTaskError(taskId, {
								fileName: file.name,
							})
						},
						onBatchUploadComplete: (batchInfo) => {
							console.log(
								`📄 Modal file batch upload progress: ${batchInfo.currentBatch}/${batchInfo.totalBatches}, success: ${batchInfo.batchSuccessCount}, failed: ${batchInfo.batchFailedCount}`,
							)
						},
						onBatchSaveComplete: (batchSaveInfo: BatchSaveInfo) => {
							console.log(
								`💾 Modal file batch save completed: ${batchSaveInfo.savedFilesCount} files saved to project, total processed: ${batchSaveInfo.totalProcessedFiles}`,
							)
							refreshCoordinator.handleBatchSaveComplete(batchSaveInfo, {
								fileName: file.name,
							})
						},
					})
					refreshCoordinator.markTaskCreated({ fileName: file.name, parentId })
				} catch (error) {
					refreshCoordinator.markTaskCreateFailed({ fileName: file.name, parentId })
					firstError = firstError || error
				}
			}

			if (firstError) {
				throw firstError
			}
		},
		[
			attachments,
			onUpdateAttachments,
			projectId,
			workspaceId,
			selectedProject,
			selectedTopic,
			t,
		],
	)

	// 实际上传处理函数（用于文件夹上传）
	const processFolderUpload = useCallback(
		async (files: File[], parentId?: string) => {
			const refreshCoordinator = createUploadRefreshCoordinator({
				uploadType: "folder",
				projectFiles: attachments,
				uploadFileCount: files.length,
				onUpdateAttachments,
			})

			// Folder upload: all files share one upload task.
			try {
				await multiFolderUploadStore.createUploadTask(files, parentId, {
					projectId: projectId || "",
					workspaceId,
					projectName: selectedProject?.project_name || t("common.untitledProject"),
					topicId: selectedTopic?.id,
					taskId: "",
					storageType: "workspace",
					source: UploadSource.ProjectFile,
					onComplete: (taskId: string) => {
						console.log(`📁 Modal folder upload task ${taskId} completed`)
						refreshCoordinator.flushDeferredRefresh("taskComplete", { taskId })
					},
					onError: (taskId: string) => {
						refreshCoordinator.flushDeferredRefresh("taskError", { taskId })
					},
					onBatchUploadComplete: (batchInfo) => {
						console.log(
							`📁 Modal folder batch upload progress: ${batchInfo.currentBatch}/${batchInfo.totalBatches}, success: ${batchInfo.batchSuccessCount}, failed: ${batchInfo.batchFailedCount}`,
						)
					},
					onBatchSaveComplete: (batchSaveInfo: BatchSaveInfo) => {
						console.log(
							`💾 Modal folder batch save completed: ${batchSaveInfo.savedFilesCount} files saved to project, total processed: ${batchSaveInfo.totalProcessedFiles}`,
						)
						refreshCoordinator.handleBatchSaveComplete(batchSaveInfo)
					},
				})
				refreshCoordinator.markTaskCreated({ filesCount: files.length, parentId })
			} catch (error) {
				refreshCoordinator.markTaskCreateFailed({ filesCount: files.length, parentId })
				throw error
			}
		},
		[
			attachments,
			onUpdateAttachments,
			projectId,
			workspaceId,
			selectedProject,
			selectedTopic,
			t,
		],
	)

	// 同名文件处理 handler（优先使用外部传入的共享 handler）
	const internalDuplicateHandler = useDuplicateFileHandler({
		attachments,
	})
	const duplicateFileHandler = externalDuplicateHandler || internalDuplicateHandler

	// 处理文件选择完成后打开 UploadModal
	const handleFilesSelected = useCallback((files: File[], isFolder: boolean = false) => {
		setSelectedUploadFiles(files)
		setIsUploadingFolder(isFolder)
		setUploadModalVisible(true)
	}, [])

	// 自定义上传文件处理函数
	const handleCustomUploadFile = useCallback(() => {
		const input = document.createElement("input")
		input.type = "file"
		input.multiple = true
		input.style.display = "none"

		input.onchange = (e) => {
			const files = (e.target as HTMLInputElement).files
			if (files && files.length > 0) {
				handleFilesSelected(Array.from(files), false)
			}
			document.body.removeChild(input)
		}

		document.body.appendChild(input)
		input.click()
	}, [handleFilesSelected])

	// 自定义上传文件夹处理函数
	const handleCustomUploadFolder = useCallback(() => {
		const input = document.createElement("input")
		input.type = "file"
		input.multiple = true
		input.webkitdirectory = true
		input.style.display = "none"

		input.onchange = (e) => {
			const files = (e.target as HTMLInputElement).files
			if (files && files.length > 0) {
				handleFilesSelected(Array.from(files), true)
			}
			document.body.removeChild(input)
		}

		document.body.appendChild(input)
		input.click()
	}, [handleFilesSelected])

	// 处理 UploadModal 提交
	const handleUploadModalSubmit = useCallback(
		async ({ path, files }: { path: AttachmentItem[]; files: File[] }) => {
			try {
				// 提取最后一个 AttachmentItem 的 file_id 作为 parentId
				const parentId = path.length > 0 ? path[path.length - 1].file_id || "" : ""

				// 根据是否为文件夹上传选择不同的处理函数
				const uploadProcessor = isUploadingFolder ? processFolderUpload : processFilesUpload

				// 通过同名检测处理上传
				await duplicateFileHandler.handleFilesWithDuplicateCheck(
					files,
					parentId,
					uploadProcessor,
				)
			} catch (error) {
				console.error("Upload failed:", error)
			}
		},
		[duplicateFileHandler, processFilesUpload, processFolderUpload, isUploadingFolder],
	)

	// 处理 UploadModal 关闭
	const handleUploadModalClose = useCallback(() => {
		setUploadModalVisible(false)
		setSelectedUploadFiles([])
		setIsUploadingFolder(false)
	}, [])

	return {
		// 状态
		uploadModalVisible,
		selectedUploadFiles,
		isUploadingFolder,

		// 操作方法
		handleCustomUploadFile,
		handleCustomUploadFolder,
		handleUploadModalSubmit,
		handleUploadModalClose,
		handleFilesSelected,

		// 同名文件处理状态（统一处理文件和文件夹上传）
		duplicateFileHandler,
	}
}
