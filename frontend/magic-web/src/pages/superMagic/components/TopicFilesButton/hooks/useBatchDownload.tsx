import { useState, useMemo } from "react"
import type { AttachmentItem } from "./types"
import { MenuProps } from "antd"
import { collectFileIds } from "../utils/collectFileIds"
import { collectSelectedItemIds } from "../utils/collectSelectedItemIds"
import {
	hasMagicSystemFolderInDeletionSelection,
	resolveBatchDeleteConfirmContentKey,
} from "../utils/magic-system-folder"
import {
	IconDownload,
	IconFileTypePdf,
	IconFileTypePpt,
	IconTrash,
	IconFolderSymlink,
	IconShare3,
	IconCopy,
} from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { downloadFileWithAnchor } from "../../../utils/handleFIle"
import type { DownloadProgressController } from "@/pages/superMagic/hooks/useDownloadProgress"
import { getParentPathFromFileId } from "../../SelectPathModal/utils/attachmentUtils"
import MagicModal from "@/components/base/MagicModal"
import { MagicSystemFolderIcon } from "../components/MagicSystemFolderIcon"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useIsMobile } from "@/hooks/useIsMobile"
import { SuperMagicApi } from "@/apis"
import useShareRoute from "../../../hooks/useShareRoute"
import magicToast from "@/components/base/MagicToaster/utils"
import { createRandomUuidV4 } from "@/utils/create-random-uuid-v4"
import { useFileActionVisibility } from "@/pages/superMagic/providers/file-action-visibility-provider"
import { isCachedChatWorkspaceProject } from "@/pages/superMagic/utils/isChatWorkspaceProject"
import { normalizeMenuItems } from "../utils/menu-items"
import { useMobileDeleteConfirmSheet } from "./useMobileDeleteConfirmSheet"
import { downloadBlobFile } from "@/utils/file"
import {
	collectClientBatchExportTargets,
	getClientBatchItemType,
	runClientBatchDocumentExport,
} from "../modules/client-batch-export"

interface UseBatchDownloadOptions {
	projectId?: string
	getItemId: (item: AttachmentItem) => string
	selectedItems: Set<string>
	setSelectedItems: (items: Set<string>) => void
	filteredFiles: AttachmentItem[]
	onSelectModeChange?: (isSelectMode: boolean) => void
	// 批量移动和复制相关
	attachments?: AttachmentItem[]
	selectedWorkspace?: any
	selectedProject?: any
	projects?: any[]
	crossProjectOperation?: {
		openMoveModal: (fileIds: string[], parentPath: AttachmentItem[]) => void
		openCopyModal: (fileIds: string[], parentPath?: AttachmentItem[]) => void
	}
	moveFileHook?: {
		openBatchMove: () => void
	}
	// 新增：操作完成回调（用于刷新列表）
	onUpdateAttachments?: () => void
	removeFile: (fileId: string) => void
	getParentPathByFileId?: (fileId: string) => AttachmentItem[]
	isMoving?: boolean
	allowEdit?: boolean
	allowDownload?: boolean
	/** 是否允许批量移动。 */
	allowMove?: boolean
	/** 是否允许批量复制。 */
	allowCopy?: boolean
	/** 是否允许批量分享。 */
	allowShare?: boolean
	// 新增：批量分享回调
	onBatchShareClick?: (fileIds: string[]) => void
	// 是否在项目内
	isInProject?: boolean
	downloadProgress?: DownloadProgressController
}

/**
 * useBatchDownload - 处理批量下载功能
 */
export function useBatchDownload(options: UseBatchDownloadOptions) {
	const {
		projectId,
		getItemId,
		selectedItems,
		setSelectedItems,
		filteredFiles,
		onSelectModeChange,
		attachments = [],
		selectedWorkspace,
		selectedProject,
		projects = [],
		crossProjectOperation,
		moveFileHook,
		onUpdateAttachments,
		removeFile,
		getParentPathByFileId,
		isMoving = false,
		allowEdit,
		allowDownload,
		allowMove = true,
		allowCopy = true,
		allowShare = true,
		onBatchShareClick,
		isInProject,
		downloadProgress,
	} = options
	const [batchLoading, setBatchLoading] = useState(false)
	const { t } = useTranslation("super")
	const isMobile = useIsMobile()
	const isChatProject = isCachedChatWorkspaceProject(selectedProject)
	const { deleteConfirmNode, openDeleteConfirm } = useMobileDeleteConfirmSheet()
	const { isShareRoute, isFileShare } = useShareRoute()
	const { hideCopyTo, hideMoveTo, hideShareFile } = useFileActionVisibility()
	const canDownload = allowDownload !== false

	// 退出多选模式的辅助函数
	const exitSelectMode = () => {
		setSelectedItems(new Set())
		onSelectModeChange?.(false)
	}

	const getInitialParentPath = (fileId: string) => {
		return getParentPathByFileId
			? getParentPathByFileId(fileId)
			: getParentPathFromFileId(fileId, attachments)
	}

	// 检测选中项目中是否包含文件夹
	const hasSelectedFolders = () => {
		let foundFolder = false
		const checkItems = (items: AttachmentItem[]) => {
			for (const item of items) {
				const itemId = getItemId(item)
				if (selectedItems.has(itemId)) {
					if (item.is_directory) {
						foundFolder = true
						return
					}
				}
				if (item.is_directory && "children" in item && item.children) {
					checkItems(item.children)
				}
			}
		}
		checkItems(filteredFiles)
		return foundFolder
	}

	// 显示批量下载按钮的条件
	const showBatchDownload = useMemo(() => {
		return selectedItems.size > 0
	}, [selectedItems])

	// Mobile batch delete uses the hierarchy confirmation sheet (same as project-detail).
	const handleMobileBatchDelete = async () => {
		const rootAttachments = attachments?.length ? attachments : filteredFiles

		openDeleteConfirm({
			attachments: rootAttachments,
			selectedKeys: selectedItems,
			onConfirm: handleBatchDelete,
			testIdPrefix: "topic-files-batch-delete-confirm",
		})
	}

	// PC端批量删除（使用 Modal 确认）
	const handlePCBatchDeleteWithConfirm = async () => {
		const containsFolders = hasSelectedFolders()
		const touchesMagicFolder = hasMagicSystemFolderInDeletionSelection(
			filteredFiles,
			selectedItems,
			getItemId,
		)
		const contentKey = resolveBatchDeleteConfirmContentKey({
			containsFolders,
			touchesMagicFolder,
		})

		MagicModal.confirm({
			title: t("topicFiles.contextMenu.deleteTip"),
			content: t(contentKey, {
				count: selectedItems.size,
			}),
			variant: "destructive",
			showIcon: true,
			icon: touchesMagicFolder ? <MagicSystemFolderIcon size={24} /> : undefined,
			okText: t("topicFiles.contextMenu.delete"),
			cancelText: t("topicFiles.contextMenu.cancel"),
			onOk: handleBatchDelete,
		})
	}

	// 批量删除（不带确认弹窗，由调用方使用 Popconfirm 处理）
	const handleBatchDelete = async () => {
		if (selectedItems.size === 0) return
		setBatchLoading(true)
		try {
			const selectedFileIds = collectFileIds({
				items: filteredFiles,
				selectedItems,
				getItemId,
				includeFolderIds: true, // 删除时需要包含文件夹ID
			})

			if (selectedFileIds.length > 0) {
				await SuperMagicApi.deleteFiles({
					file_ids: selectedFileIds,
					project_id: projectId,
				}).catch(() => null)
				selectedFileIds.forEach((fileId) => {
					removeFile(fileId)
				})
			}
			pubsub.publish(PubSubEvents.Cancel_File_Selection)
			onUpdateAttachments?.()
			magicToast.success(t("topicFiles.contextMenu.deleteFileSuccess"))
			exitSelectMode()
		} catch (error) {
			console.error("Batch delete failed:", error)
			magicToast.error(t("topicFiles.error.deleteFileFailed"))
		} finally {
			setBatchLoading(false)
		}
	}

	// 批量下载选中文件
	const handleBatchDownload = async () => {
		if (!canDownload || selectedItems.size === 0 || !projectId) return
		setBatchLoading(true)
		let keepLoadingForPolling = false
		try {
			// 收集选中的文件ID（只收集直接选中的项目，不递归展开文件夹）
			const selectedFileIds = collectSelectedItemIds(filteredFiles, selectedItems, getItemId)

			if (selectedFileIds.length === 0) {
				setBatchLoading(false)
				console.warn("No downloadable files found")
				return
			}

			const token =
				isShareRoute || isFileShare
					? ((window as unknown as { temporary_token?: string }).temporary_token ?? "")
					: undefined

			if (downloadProgress) {
				await downloadProgress.startDownload({
					projectId,
					fileIds: selectedFileIds,
					token,
					label: t("topicFiles.downloading"),
					onSuccess: () => {
						magicToast.success({
							content: t("topicFiles.downloadSuccess"),
							duration: 1000,
						})
						exitSelectMode()
					},
					onError: (error) => {
						const message = error instanceof Error ? error.message : undefined
						magicToast.error({
							content: message || t("topicFiles.downloadFailed"),
							duration: 1000,
						})
					},
					onCancel: () => {
						magicToast.info(t("topicFiles.downloadAbort"))
					},
				})
				return
			}

			const toastId = createRandomUuidV4()
			magicToast.loading({
				key: toastId,
				content: t("topicFiles.downloading"),
				duration: 0,
			})

			// 调用后端创建批量下载任务
			const data = await SuperMagicApi.createBatchDownload({
				project_id: projectId,
				file_ids: selectedFileIds,
				token,
			})

			if (data.status === "ready" && data.download_url) {
				downloadFileWithAnchor(data.download_url)
				magicToast.success({
					key: toastId,
					content: t("topicFiles.downloadSuccess"),
					duration: 1000,
				})
				exitSelectMode()
				return
			}

			if (data.status === "processing") {
				keepLoadingForPolling = true
				// 每2秒轮询批量状态
				const timer = setInterval(async () => {
					try {
						const checkData = await SuperMagicApi.checkBatchDownloadStatus(
							data.batch_key,
						)
						if (checkData.status === "ready" && checkData.download_url) {
							downloadFileWithAnchor(checkData.download_url)
							magicToast.success({
								key: toastId,
								content: t("topicFiles.downloadSuccess"),
								duration: 1000,
							})
							setBatchLoading(false)
							exitSelectMode()
							clearInterval(timer)
						}
						if (checkData?.status === "failed") {
							setBatchLoading(false)
							clearInterval(timer)
							magicToast.error({
								key: toastId,
								content: checkData.message || t("topicFiles.downloadFailed"),
								duration: 1000,
							})
							return
						}
					} catch (error) {
						setBatchLoading(false)
						clearInterval(timer)
						console.error("Batch download check failed:", error)
						magicToast.error({
							key: toastId,
							content: t("topicFiles.downloadFailed"),
							duration: 1000,
						})
					}
				}, 2000)
				return
			}

			magicToast.error({
				key: toastId,
				content: t("topicFiles.downloadFailed"),
				duration: 1000,
			})
		} catch (error) {
			console.error("Batch download failed:", error)
			magicToast.error({
				content: t("topicFiles.downloadFailed"),
				duration: 1000,
			})
		} finally {
			if (!keepLoadingForPolling) {
				setBatchLoading(false)
			}
		}
	}

	const handleExportPdfOrPpt = async (convert_type = "pdf") => {
		if (!canDownload || selectedItems.size === 0) return
		const convertType = convert_type as "pdf" | "ppt"
		const format = convertType === "pdf" ? "pdf" : "pptx"
		// Always resolve against the complete attachment tree. The filtered tree can omit
		// folder resources while a search is active, which would produce incomplete exports.
		const sourceItems = attachments.length > 0 ? attachments : filteredFiles
		const { targets, unsupportedItems } = collectClientBatchExportTargets({
			items: sourceItems,
			selectedItems,
			getItemId,
			format,
		})

		if (unsupportedItems.length > 0) {
			const unsupportedTypes = Array.from(
				new Set(
					unsupportedItems.map((item) =>
						getClientBatchItemType(item, {
							folder: t("filenameValidator.type.folder"),
							unknown: t("common.unknown"),
						}),
					),
				),
			).join(", ")
			magicToast.error(
				t("folderUpload.errors.unsupportedFileType", { fileType: unsupportedTypes }),
			)
			return
		}

		if (targets.length === 0) {
			magicToast.error(
				t("folderUpload.errors.unsupportedFileType", {
					fileType: format === "pdf" ? "PDF" : "PPTX",
				}),
			)
			return
		}

		setBatchLoading(true)
		const toastId = createRandomUuidV4()
		magicToast.loading({
			key: toastId,
			content:
				convertType === "pdf"
					? t("topicFiles.batchExportingPdf")
					: t("topicFiles.batchExportingPpt"),
			duration: 0,
		})

		try {
			const result = await runClientBatchDocumentExport({
				format,
				targets,
				attachments: sourceItems,
				projectName: selectedProject?.project_name,
			})

			if (result.cancelled) {
				magicToast.destroy(toastId)
				return
			}
			if (result.unavailable) {
				magicToast.error({
					key: toastId,
					content: t("topicFiles.contextMenu.fileExport.unsupportedInCurrentVersion"),
					duration: 1000,
				})
				return
			}
			if (!result.artifact || result.successCount === 0) {
				magicToast.error({
					key: toastId,
					content: t("topicFiles.contextMenu.fileExport.exportFailed"),
					duration: 1000,
				})
				return
			}

			// Use the direct Blob downloader so a successful export does not open the
			// manual retry/copy download modal used by source-file downloads.
			const downloadResult = await downloadBlobFile(
				result.artifact.blob,
				result.artifact.fileName,
				format,
			)
			if (!downloadResult.success) {
				throw new Error(downloadResult.message || "Batch export download failed")
			}

			if (result.failureCount > 0) {
				magicToast.error({
					key: toastId,
					content: t("topicFiles.contextMenu.fileExport.exportFailed"),
					duration: 1000,
				})
			} else {
				magicToast.success({
					key: toastId,
					content: t("topicFiles.exportSuccess"),
					duration: 1000,
				})
				exitSelectMode()
			}
		} catch (error) {
			console.error("Client batch export failed:", error)
			magicToast.error({
				key: toastId,
				content: t("topicFiles.contextMenu.fileExport.exportFailed"),
				duration: 1000,
			})
		} finally {
			setBatchLoading(false)
		}
	}

	// 批量分享选中文件
	const handleBatchShare = () => {
		if (selectedItems.size === 0 || !onBatchShareClick) return

		// PC multi-select stores the folder row ID itself, so share must preserve direct selections.
		const selectedFileIds = collectSelectedItemIds(filteredFiles, selectedItems, getItemId)

		if (selectedFileIds.length > 0) {
			onBatchShareClick(selectedFileIds)
			exitSelectMode()
		}
	}

	// 批量移动处理函数
	const handleBatchMove = () => {
		if (!selectedItems || selectedItems.size === 0) return

		const fileIds = Array.from(selectedItems)
		const firstFileId = fileIds[0]
		const parentPath = firstFileId ? getInitialParentPath(firstFileId) : []

		// 只有桌面普通项目继续走跨项目 Modal；移动端和 chat 项目回退到目录选择器。
		if (projects.length > 0 && crossProjectOperation && !isMobile && !isChatProject) {
			crossProjectOperation.openMoveModal(fileIds, parentPath)
		} else if (moveFileHook) {
			// 否则使用原来的 SelectDirectoryModal
			moveFileHook.openBatchMove()
		}
	}

	// 批量复制处理函数
	const handleBatchCopy = () => {
		if (!selectedItems || selectedItems.size === 0) return
		if (!crossProjectOperation) return

		const fileIds = Array.from(selectedItems)
		const firstFileId = fileIds[0]
		const parentPath = firstFileId ? getInitialParentPath(firstFileId) : []

		crossProjectOperation.openCopyModal(fileIds, parentPath)
	}

	// 创建下拉菜单项配置
	const batchMenuItems = normalizeMenuItems([
		// 分享文件（仅在项目内显示）
		...(isInProject && allowEdit && allowShare && onBatchShareClick && !hideShareFile
			? [
					{
						key: "share",
						label: (
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<IconShare3 size={16} stroke={1.5} />
								<span>{t("topicFiles.contextMenu.shareFile")}</span>
							</div>
						),
						onClick: handleBatchShare,
						disabled: batchLoading || !onBatchShareClick,
					},
				]
			: []),
		// 批量下载（带二级菜单）
		...(canDownload && isInProject
			? [
					{
						key: "download",
						label: (
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<IconDownload size={16} stroke={1.5} />
								<span>{t("topicFiles.downloadTitle")}</span>
							</div>
						),
						disabled: batchLoading,
						children: [
							{
								key: "download-selected",
								label: (
									<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
										<IconDownload size={16} stroke={1.5} />
										<span>
											{t("topicFiles.downloadSelected", {
												count: selectedItems.size,
											})}
										</span>
									</div>
								),
								onClick: handleBatchDownload,
								disabled: batchLoading,
							},
							{
								key: "export-pdf",
								label: (
									<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
										<IconFileTypePdf size={16} stroke={1.5} />
										<span>{t("topicFiles.exportPdf")}</span>
									</div>
								),
								onClick: () => handleExportPdfOrPpt("pdf"),
								disabled: batchLoading,
							},
							{
								key: "export-ppt",
								label: (
									<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
										<IconFileTypePpt size={16} stroke={1.5} />
										<span>{t("topicFiles.exportPpt")}</span>
									</div>
								),
								onClick: () => handleExportPdfOrPpt("ppt"),
								disabled: batchLoading,
							},
						],
					},
				]
			: canDownload
				? // 不在项目内，暂时只显示一个一级菜单的批量下载（兼容金融模式）
					[
						{
							key: "download-selected",
							label: (
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<IconDownload size={16} stroke={1.5} />
									<span>
										{t("topicFiles.downloadSelected", {
											count: selectedItems.size,
										})}
									</span>
								</div>
							),
							onClick: handleBatchDownload,
							disabled: batchLoading,
						},
						{
							key: "export-pdf",
							label: (
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<IconFileTypePdf size={16} stroke={1.5} />
									<span>{t("topicFiles.exportPdf")}</span>
								</div>
							),
							onClick: () => handleExportPdfOrPpt("pdf"),
							disabled: batchLoading,
						},
						{
							key: "export-ppt",
							label: (
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<IconFileTypePpt size={16} stroke={1.5} />
									<span>{t("topicFiles.exportPpt")}</span>
								</div>
							),
							onClick: () => handleExportPdfOrPpt("ppt"),
							disabled: batchLoading,
						},
					]
				: []),
		// 批量移动（仅在允许编辑时显示）
		...(isInProject && allowEdit && allowMove && !hideMoveTo
			? [
					{
						key: "move",
						label: (
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<IconFolderSymlink size={16} stroke={1.5} />
								<span>{t("topicFiles.contextMenu.batchMove")}</span>
							</div>
						),
						onClick: handleBatchMove,
						disabled: batchLoading || isMoving,
					},
				]
			: []),
		// 批量复制（仅在允许编辑且当前空间开放复制能力时显示）
		...(isInProject && allowEdit && allowCopy && !hideCopyTo
			? [
					{
						key: "copy",
						label: (
							<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
								<IconCopy size={16} stroke={1.5} />
								<span>{t("topicFiles.contextMenu.batchCopy")}</span>
							</div>
						),
						onClick: handleBatchCopy,
						disabled: batchLoading || isMoving,
					},
				]
			: []),
		// 分隔线
		...(isInProject && allowEdit
			? [
					{
						type: "divider" as const,
						key: "divider",
					},
				]
			: []),
		// 批量删除（仅在允许编辑时显示）
		...(isInProject && allowEdit
			? [
					{
						key: "delete",
						label: (
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 8,
									color: "#FF4D3A",
								}}
							>
								<IconTrash size={16} stroke={1.5} />
								<span>{t("topicFiles.contextMenu.delete")}</span>
							</div>
						),
						onClick: isMobile
							? handleMobileBatchDelete
							: handlePCBatchDeleteWithConfirm,
						disabled: batchLoading || isMoving,
					},
				]
			: []),
	]) as MenuProps["items"]
	const canShowBatchOperations = showBatchDownload && Boolean(batchMenuItems?.length)

	return {
		// 状态
		batchLoading,
		showBatchDownload: canShowBatchOperations,

		// 处理函数
		handleBatchDownload,
		handleExportPdfOrPpt,
		handleBatchDelete,
		handleMobileBatchDelete,
		handleBatchShare,
		hasSelectedFolders,

		// 下拉菜单项配置
		batchMenuItems,
		deleteConfirmNode,
	}
}
