import { createElement, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import type { AttachmentItem } from "./index"
import type { ProjectListItem, Workspace } from "../../../pages/Workspace/types"
import { SuperMagicApi } from "@/apis"
import { detectDuplicateFilesForMove } from "../utils/moveOrCopyDuplicateHandler"
import {
	collectSameParentOperationIds,
	detectFolderConflictsForMove,
} from "../utils/folderConflictHandler"
import { useMoveOrCopyDuplicateHandler } from "./useMoveOrCopyDuplicateHandler"
import { useFolderConflictHandler } from "./useFolderConflictHandler"
import magicToast from "@/components/base/MagicToaster/utils"
import MagicModal from "@/components/base/MagicModal"
import { IconAlertTriangleFilled } from "@tabler/icons-react"
import {
	detectCanvasProjectOperationRisk,
	getCanvasProjectOperationImpact,
	type CanvasProjectOperationRisk,
} from "../utils/canvasProjectOperationRisk"
import {
	mergeStaticDependencyFileIds,
	resolveSingleDocumentStaticDependencies,
} from "@/pages/superMagic/utils/staticDependencies"

interface UseCrossProjectFileOperationOptions {
	projectId?: string
	selectedWorkspace: Workspace | null
	selectedProject: ProjectListItem | null
	projects: ProjectListItem[]
	onSuccess?: (result?: { operationType: "move" | "copy"; fileIds: string[] }) => void
}

interface EffectiveOperationFileIdsResult {
	fileIds: string[]
	dependencyAnalysisFailed: boolean
}

async function resolveEffectiveOperationFileIds({
	fileIds,
	sourceAttachments,
	includeDocumentDependencies = true,
	documentDependencyFileIds,
}: {
	fileIds: string[]
	sourceAttachments: AttachmentItem[]
	includeDocumentDependencies?: boolean
	documentDependencyFileIds?: string[]
}): Promise<EffectiveOperationFileIdsResult> {
	if (!includeDocumentDependencies) {
		return {
			fileIds: mergeStaticDependencyFileIds(fileIds, [], false),
			dependencyAnalysisFailed: false,
		}
	}

	if (documentDependencyFileIds !== undefined) {
		return {
			fileIds: mergeStaticDependencyFileIds(fileIds, documentDependencyFileIds, true),
			dependencyAnalysisFailed: false,
		}
	}

	try {
		const { dependencyTransferFileIds } = await resolveSingleDocumentStaticDependencies({
			fileIds,
			attachments: sourceAttachments,
		})
		return {
			fileIds: mergeStaticDependencyFileIds(fileIds, dependencyTransferFileIds, true),
			dependencyAnalysisFailed: false,
		}
	} catch (error) {
		// Dependency enrichment must not turn an existing file operation into a hard failure.
		console.error("Failed to resolve document static dependencies for file operation:", error)
		return {
			fileIds: mergeStaticDependencyFileIds(fileIds, [], false),
			dependencyAnalysisFailed: true,
		}
	}
}

export function useCrossProjectFileOperation(options: UseCrossProjectFileOperationOptions) {
	const { projectId, onSuccess } = options
	const { t } = useTranslation("super")

	const [visible, setVisible] = useState(false)
	const [operationType, setOperationType] = useState<"move" | "copy">("move")
	const [fileIds, setFileIds] = useState<string[]>([])
	const [initialPath, setInitialPath] = useState<AttachmentItem[]>([])
	const [isOperating, setIsOperating] = useState(false)
	const [operationProgress, setOperationProgress] = useState(0)

	// 集成同名检测 Hook
	const duplicateHandler = useMoveOrCopyDuplicateHandler()
	const folderConflictHandler = useFolderConflictHandler()

	const openMoveModal = useCallback((ids: string[], path?: AttachmentItem[]) => {
		setFileIds(ids)
		setOperationType("move")
		setInitialPath(path || [])
		setVisible(true)
	}, [])

	const openCopyModal = useCallback((ids: string[], path?: AttachmentItem[]) => {
		setFileIds(ids)
		setOperationType("copy")
		setInitialPath(path || [])
		setVisible(true)
	}, [])

	const closeModal = useCallback(() => {
		setVisible(false)
		setFileIds([])
		setOperationProgress(0)
	}, [])

	const handleOperationPolling = useCallback(
		(batchKey: string, operationType: "move" | "copy", completedFileIds: string[]) => {
			const timer = setInterval(async () => {
				try {
					const checkData = await SuperMagicApi.checkBatchOperationStatus(batchKey)

					if (checkData.status === "processing") {
						const progress = checkData.progress ? parseInt(checkData.progress) : 0
						setOperationProgress(progress)
					} else if (checkData.status === "success") {
						setOperationProgress(100)
						magicToast.success(
							operationType === "move"
								? t("topicFiles.success.fileMoved")
								: t("topicFiles.success.fileCopied"),
						)
						clearInterval(timer)
						setTimeout(() => {
							setIsOperating(false)
							setOperationProgress(0)
							closeModal()
							onSuccess?.({ operationType, fileIds: completedFileIds })
						}, 500)
					} else if (checkData.status === "failed") {
						magicToast.error(
							checkData.message ||
								(operationType === "move"
									? t("topicFiles.error.moveFileFailed")
									: t("topicFiles.error.copyFileFailed")),
						)
						clearInterval(timer)
						setIsOperating(false)
						setOperationProgress(0)
					} else {
						clearInterval(timer)
						setIsOperating(false)
						setOperationProgress(0)
					}
				} catch (error) {
					console.error("检查操作状态失败:", error)
					magicToast.error(
						operationType === "move"
							? t("topicFiles.error.moveFileFailed")
							: t("topicFiles.error.copyFileFailed"),
					)
					clearInterval(timer)
					setIsOperating(false)
					setOperationProgress(0)
				}
			}, 2000)
		},
		[closeModal, onSuccess, t],
	)

	const confirmCanvasProjectRisk = useCallback(
		(canvasRisk: CanvasProjectOperationRisk) =>
			new Promise<boolean>((resolve) => {
				const impact = getCanvasProjectOperationImpact(canvasRisk)
				MagicModal.confirm({
					title: t("topicFiles.canvasOperationRisk.title"),
					content: t(
						impact === "open-failure"
							? "topicFiles.canvasOperationRisk.moveOpenFailureContent"
							: impact === "content-loss"
								? "topicFiles.canvasOperationRisk.moveContentLossContent"
								: "topicFiles.canvasOperationRisk.moveMixedContent",
					),
					icon: createElement(IconAlertTriangleFilled, {
						size: 20,
						color: "rgba(255,125,0, 1)",
						style: { marginRight: 6, lineHeight: 20, flexShrink: 0 },
					}),
					okButtonProps: {
						color: "danger",
						variant: "solid",
					},
					cancelButtonProps: {
						color: "default",
						variant: "filled",
					},
					okText: t("topicFiles.moveModal.confirm"),
					cancelText: t("common.cancel"),
					onOk: () => resolve(true),
					onCancel: () => resolve(false),
				})
			}),
		[t],
	)

	const executeMoveOperation = useCallback(
		async (data: {
			targetProjectId: string
			targetPath: AttachmentItem[]
			targetAttachments: AttachmentItem[]
			sourceAttachments: AttachmentItem[]
			fileIds?: string[]
			includeDocumentDependencies?: boolean
			documentDependencyFileIds?: string[]
		}) => {
			const { fileIds: effectiveFileIds, dependencyAnalysisFailed } =
				await resolveEffectiveOperationFileIds({
					fileIds: data.fileIds || fileIds,
					sourceAttachments: data.sourceAttachments,
					includeDocumentDependencies: data.includeDocumentDependencies,
					documentDependencyFileIds: data.documentDependencyFileIds,
				})
			if (dependencyAnalysisFailed) {
				magicToast.warning(t("share.documentDependenciesAnalysisFailed"))
			}
			if (!projectId || effectiveFileIds.length === 0) return

			let keepBothIds =
				data.targetProjectId === projectId
					? collectSameParentOperationIds(
							effectiveFileIds,
							data.sourceAttachments,
							data.targetPath,
						)
					: []
			const conflictDetectionIds = effectiveFileIds.filter((id) => !keepBothIds.includes(id))

			if (conflictDetectionIds.length > 0) {
				const canvasRisk = await detectCanvasProjectOperationRisk({
					attachments: data.sourceAttachments,
					fileIds: conflictDetectionIds,
					operation: "move",
				})
				if (canvasRisk.shouldWarn) {
					const shouldContinue = await confirmCanvasProjectRisk(canvasRisk)
					if (!shouldContinue) return
				}
			}

			// 1. 检测同名文件（递归检测文件夹内所有子文件）
			const folderConflicts =
				conflictDetectionIds.length > 0
					? detectFolderConflictsForMove(
							conflictDetectionIds,
							data.sourceAttachments,
							data.targetAttachments,
							data.targetPath,
						)
					: new Map()
			if (folderConflicts.size > 0) {
				const folderChoice = await folderConflictHandler.checkConflicts(folderConflicts)
				if (!folderChoice.shouldProceed) return
				keepBothIds = [...keepBothIds, ...folderChoice.keepBothIds]
			}

			// 1. 检测同名文件（递归检测文件夹内所有子文件）
			const duplicateDetectionIds = effectiveFileIds.filter((id) => !keepBothIds.includes(id))
			const duplicates =
				duplicateDetectionIds.length > 0
					? detectDuplicateFilesForMove(
							duplicateDetectionIds,
							data.sourceAttachments,
							data.targetAttachments,
							data.targetPath,
						)
					: new Map()

			// 2. 如果有同名，显示 Modal 并等待用户选择
			if (duplicates.size > 0) {
				const userChoice = await duplicateHandler.checkDuplicates(duplicates)
				if (!userChoice.shouldProceed) {
					return // 用户取消
				}
				keepBothIds = [...keepBothIds, ...userChoice.keepBothIds]
			}

			// 3. 执行移动操作
			setIsOperating(true)
			setOperationProgress(0)

			try {
				const targetParentId =
					data.targetPath.length > 0
						? data.targetPath[data.targetPath.length - 1].file_id || ""
						: ""

				let result

				// 区分单文件移动和批量移动
				if (effectiveFileIds.length === 1) {
					// 使用单文件移动接口（moveFile）
					result = await SuperMagicApi.moveFile({
						file_id: effectiveFileIds[0],
						target_parent_id: targetParentId,
						project_id: projectId,
						target_project_id: data.targetProjectId,
						keep_both_file_ids: keepBothIds,
					})
				} else {
					// 使用批量移动接口（moveFiles）
					result = await SuperMagicApi.moveFiles({
						file_ids: effectiveFileIds,
						project_id: projectId,
						target_project_id: data.targetProjectId,
						target_parent_id: targetParentId,
						pre_file_id: "",
						keep_both_file_ids: keepBothIds,
					})
				}

				if (result.status === "success") {
					setOperationProgress(100)
					magicToast.success(t("topicFiles.success.fileMoved"))
					setTimeout(() => {
						setIsOperating(false)
						setOperationProgress(0)
						closeModal()
						onSuccess?.({ operationType: "move", fileIds: effectiveFileIds })
					}, 500)
					return
				}

				if (result.status === "processing" && result.batch_key) {
					handleOperationPolling(result.batch_key, "move", effectiveFileIds)
				}
			} catch (error) {
				console.error("移动文件失败:", error)
				magicToast.error(t("topicFiles.error.moveFileFailed"))
				setIsOperating(false)
				setOperationProgress(0)
			}
		},
		[
			fileIds,
			projectId,
			closeModal,
			onSuccess,
			t,
			handleOperationPolling,
			confirmCanvasProjectRisk,
			duplicateHandler,
			folderConflictHandler,
		],
	)

	const executeCopyOperation = useCallback(
		async (data: {
			targetProjectId: string
			targetPath: AttachmentItem[]
			targetAttachments: AttachmentItem[]
			sourceAttachments: AttachmentItem[]
			fileIds?: string[]
			includeDocumentDependencies?: boolean
			documentDependencyFileIds?: string[]
		}) => {
			const { fileIds: effectiveFileIds, dependencyAnalysisFailed } =
				await resolveEffectiveOperationFileIds({
					fileIds: data.fileIds ?? fileIds,
					sourceAttachments: data.sourceAttachments,
					includeDocumentDependencies: data.includeDocumentDependencies,
					documentDependencyFileIds: data.documentDependencyFileIds,
				})
			if (dependencyAnalysisFailed) {
				magicToast.warning(t("share.documentDependenciesAnalysisFailed"))
			}
			if (!projectId || effectiveFileIds.length === 0) return

			let keepBothIds =
				data.targetProjectId === projectId
					? collectSameParentOperationIds(
							effectiveFileIds,
							data.sourceAttachments,
							data.targetPath,
						)
					: []
			const conflictDetectionIds = effectiveFileIds.filter((id) => !keepBothIds.includes(id))

			const folderConflicts =
				conflictDetectionIds.length > 0
					? detectFolderConflictsForMove(
							conflictDetectionIds,
							data.sourceAttachments,
							data.targetAttachments,
							data.targetPath,
						)
					: new Map()

			if (folderConflicts.size > 0) {
				const folderChoice = await folderConflictHandler.checkConflicts(folderConflicts)
				if (!folderChoice.shouldProceed) {
					return
				}
				keepBothIds = [...keepBothIds, ...folderChoice.keepBothIds]
			}

			// 1. Check duplicates. "Keep both" renames the top folder, so skip inner paths.
			const duplicateDetectionIds = effectiveFileIds.filter((id) => !keepBothIds.includes(id))
			const duplicates =
				duplicateDetectionIds.length > 0
					? detectDuplicateFilesForMove(
							duplicateDetectionIds,
							data.sourceAttachments,
							data.targetAttachments,
							data.targetPath,
						)
					: new Map()

			// 2. 如果有同名，显示 Modal 并等待用户选择
			if (duplicates.size > 0) {
				const userChoice = await duplicateHandler.checkDuplicates(duplicates)
				if (!userChoice.shouldProceed) {
					return // 用户取消
				}
				keepBothIds = [...keepBothIds, ...userChoice.keepBothIds]
			}

			// 4. 执行复制操作
			setIsOperating(true)
			setOperationProgress(0)

			try {
				const targetParentId =
					data.targetPath.length > 0
						? data.targetPath[data.targetPath.length - 1].file_id || ""
						: ""

				const result = await SuperMagicApi.copyFiles({
					file_ids: effectiveFileIds,
					project_id: projectId,
					target_project_id: data.targetProjectId,
					target_parent_id: targetParentId,
					pre_file_id: "",
					keep_both_file_ids: keepBothIds,
				})

				if (result.status === "success") {
					setOperationProgress(100)
					magicToast.success(t("topicFiles.success.fileCopied"))
					setTimeout(() => {
						setIsOperating(false)
						setOperationProgress(0)
						closeModal()
						onSuccess?.({ operationType: "copy", fileIds: effectiveFileIds })
					}, 500)
					return
				}

				if (result.status === "processing" && result.batch_key) {
					handleOperationPolling(result.batch_key, "copy", effectiveFileIds)
				}
			} catch (error) {
				console.error("复制文件失败:", error)
				magicToast.error(t("topicFiles.error.copyFileFailed"))
				setIsOperating(false)
				setOperationProgress(0)
			}
		},
		[
			fileIds,
			projectId,
			closeModal,
			onSuccess,
			t,
			handleOperationPolling,
			duplicateHandler,
			folderConflictHandler,
		],
	)

	return {
		visible,
		operationType,
		fileIds,
		initialPath,
		isOperating,
		operationProgress,
		openMoveModal,
		openCopyModal,
		executeMoveOperation,
		executeCopyOperation,
		closeModal,
		// 导出同名检测 Modal 状态
		duplicateModalVisible: duplicateHandler.modalVisible,
		currentDuplicateFileName: duplicateHandler.currentFileName,
		totalDuplicates: duplicateHandler.totalDuplicates,
		handleDuplicateReplace: duplicateHandler.handleReplace,
		handleDuplicateKeepBoth: duplicateHandler.handleKeepBoth,
		handleDuplicateCancel: duplicateHandler.handleCancel,
		folderConflictModalVisible: folderConflictHandler.modalVisible,
		currentFolderConflictName: folderConflictHandler.currentFolderName,
		totalFolderConflicts: folderConflictHandler.totalConflicts,
		canMergeFolderConflict: folderConflictHandler.canMerge,
		handleFolderConflictKeepBoth: folderConflictHandler.handleKeepBoth,
		handleFolderConflictMerge: folderConflictHandler.handleMerge,
		handleFolderConflictCancel: folderConflictHandler.handleCancel,
	}
}
