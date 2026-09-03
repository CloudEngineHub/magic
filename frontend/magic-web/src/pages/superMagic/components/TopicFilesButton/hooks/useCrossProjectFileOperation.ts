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
import { useCanvasFileOperationGuard } from "./useCanvasFileOperationGuard"

export interface CrossProjectOperationSuccessResult {
	operationType: "move" | "copy"
	fileIds: string[]
	targetProjectId: string
	targetWorkspaceId?: string
	targetProjectName?: string
}

interface UseCrossProjectFileOperationOptions {
	projectId?: string
	shareCode?: string
	sharePassword?: string
	selectedWorkspace: Workspace | null
	selectedProject: ProjectListItem | null
	projects: ProjectListItem[]
	onSuccess?: (result?: CrossProjectOperationSuccessResult) => void
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
	const { projectId, shareCode, sharePassword, onSuccess } = options
	const { t } = useTranslation("super")
	const runCanvasFileOperationPreflight = useCanvasFileOperationGuard()

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
		(
			batchKey: string,
			operationType: "move" | "copy",
			completedFileIds: string[],
			target: {
				targetProjectId: string
				targetWorkspaceId?: string
				targetProjectName?: string
			},
		) => {
			const timer = setInterval(async () => {
				try {
					const checkData = await SuperMagicApi.checkBatchOperationStatus(batchKey)

					if (checkData.status === "processing") {
						const progress = checkData.progress ? parseInt(checkData.progress) : 0
						setOperationProgress(progress)
					} else if (checkData.status === "success") {
						setOperationProgress(100)
						if (operationType === "move" || !shareCode) {
							magicToast.success(
								operationType === "move"
									? t("topicFiles.success.fileMoved")
									: t("topicFiles.success.fileCopied"),
							)
						}
						clearInterval(timer)
						setTimeout(() => {
							setIsOperating(false)
							setOperationProgress(0)
							closeModal()
							onSuccess?.({ operationType, fileIds: completedFileIds, ...target })
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
		[closeModal, onSuccess, shareCode, t],
	)

	const confirmCanvasProjectRisk = useCallback(
		(canvasRisk: CanvasProjectOperationRisk, repairFailures: string[] = []) =>
			new Promise<boolean>((resolve) => {
				const impact = getCanvasProjectOperationImpact(canvasRisk)
				const riskContent =
					canvasRisk.shouldWarn && impact
						? t(
								impact === "open-failure"
									? "topicFiles.canvasOperationRisk.moveOpenFailureContent"
									: impact === "content-loss"
										? "topicFiles.canvasOperationRisk.moveContentLossContent"
										: "topicFiles.canvasOperationRisk.moveMixedContent",
							)
						: ""
				const repairContent = repairFailures.length
					? t("topicFiles.canvasOperationRisk.pathRepairFailureContent", {
							failures: repairFailures.join("\n"),
						})
					: ""
				MagicModal.confirm({
					title: t("topicFiles.canvasOperationRisk.title"),
					content: [riskContent, repairContent].filter(Boolean).join("\n\n"),
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
			targetWorkspaceId?: string
			targetProject?: ProjectListItem
			targetPath: AttachmentItem[]
			targetAttachments: AttachmentItem[]
			sourceAttachments: AttachmentItem[]
			fileIds?: string[]
			includeDocumentDependencies?: boolean
			documentDependencyFileIds?: string[]
			preserveParentPath?: boolean
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
			const shouldPreserveParentPath =
				data.preserveParentPath === true &&
				data.targetProjectId !== projectId &&
				(data.fileIds || fileIds).length > 1

			let keepBothIds =
				data.targetProjectId === projectId
					? collectSameParentOperationIds(
							effectiveFileIds,
							data.sourceAttachments,
							data.targetPath,
						)
					: []
			const conflictDetectionIds = effectiveFileIds.filter((id) => !keepBothIds.includes(id))
			let canvasRisk: CanvasProjectOperationRisk = {
				shouldWarn: false,
				riskTypes: [],
				affectedProjectNames: [],
			}
			if (conflictDetectionIds.length > 0) {
				canvasRisk = await detectCanvasProjectOperationRisk({
					attachments: data.sourceAttachments,
					fileIds: conflictDetectionIds,
					operation: "move",
				})
			}
			const preflightResult = await runCanvasFileOperationPreflight({
				repairOptions: {
					attachments: data.sourceAttachments,
					fileIds: effectiveFileIds,
					operation: "move",
					projectId,
				},
				requiresConfirmation: canvasRisk.shouldWarn,
				confirm: (repairPlan) =>
					confirmCanvasProjectRisk(
						canvasRisk,
						repairPlan?.failures.map(
							(failure) =>
								`${failure.projectName} / ${failure.fileName}: ${failure.message}`,
						) ?? [],
					),
				beforeCommit: async () => {
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
						const folderChoice =
							await folderConflictHandler.checkConflicts(folderConflicts)
						if (!folderChoice.shouldProceed) return false
						keepBothIds = [...keepBothIds, ...folderChoice.keepBothIds]
					}

					const duplicateDetectionIds = effectiveFileIds.filter(
						(id) => !keepBothIds.includes(id),
					)
					const duplicates =
						duplicateDetectionIds.length > 0
							? detectDuplicateFilesForMove(
									duplicateDetectionIds,
									data.sourceAttachments,
									data.targetAttachments,
									data.targetPath,
								)
							: new Map()

					if (duplicates.size > 0) {
						const userChoice = await duplicateHandler.checkDuplicates(duplicates)
						if (!userChoice.shouldProceed) return false
						keepBothIds = [...keepBothIds, ...userChoice.keepBothIds]
					}

					return true
				},
			})
			if (!preflightResult.ok) return

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
						...(shouldPreserveParentPath ? { preserve_parent_path: true } : {}),
					})
				}

				if (result.status === "success") {
					setOperationProgress(100)
					magicToast.success(t("topicFiles.success.fileMoved"))
					setTimeout(() => {
						setIsOperating(false)
						setOperationProgress(0)
						closeModal()
						onSuccess?.({
							operationType: "move",
							fileIds: effectiveFileIds,
							targetProjectId: data.targetProjectId,
							targetWorkspaceId:
								data.targetWorkspaceId || data.targetProject?.workspace_id,
							targetProjectName: data.targetProject?.project_name,
						})
					}, 500)
					return
				}

				if (result.status === "processing" && result.batch_key) {
					handleOperationPolling(result.batch_key, "move", effectiveFileIds, {
						targetProjectId: data.targetProjectId,
						targetWorkspaceId:
							data.targetWorkspaceId || data.targetProject?.workspace_id,
						targetProjectName: data.targetProject?.project_name,
					})
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
			runCanvasFileOperationPreflight,
		],
	)

	const executeCopyOperation = useCallback(
		async (data: {
			targetProjectId: string
			targetWorkspaceId?: string
			targetProject?: ProjectListItem
			targetPath: AttachmentItem[]
			targetAttachments: AttachmentItem[]
			sourceAttachments: AttachmentItem[]
			fileIds?: string[]
			includeDocumentDependencies?: boolean
			documentDependencyFileIds?: string[]
			preserveParentPath?: boolean
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
			const shouldPreserveParentPath =
				data.preserveParentPath === true &&
				data.targetProjectId !== projectId &&
				(data.fileIds ?? fileIds).length > 1

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

				const result = shareCode
					? await SuperMagicApi.copyShareFiles({
							shareCode,
							pwd: sharePassword,
							file_ids: effectiveFileIds,
							target_project_id: data.targetProjectId,
							target_parent_id: targetParentId,
							pre_file_id: "",
							keep_both_file_ids: keepBothIds,
							...(shouldPreserveParentPath ? { preserve_parent_path: true } : {}),
						})
					: await SuperMagicApi.copyFiles({
							file_ids: effectiveFileIds,
							project_id: projectId,
							target_project_id: data.targetProjectId,
							target_parent_id: targetParentId,
							pre_file_id: "",
							keep_both_file_ids: keepBothIds,
							...(shouldPreserveParentPath ? { preserve_parent_path: true } : {}),
						})

				if (result.status === "success") {
					setOperationProgress(100)
					if (!shareCode) {
						magicToast.success(t("topicFiles.success.fileCopied"))
					}
					setTimeout(() => {
						setIsOperating(false)
						setOperationProgress(0)
						closeModal()
						onSuccess?.({
							operationType: "copy",
							fileIds: effectiveFileIds,
							targetProjectId: data.targetProjectId,
							targetWorkspaceId:
								data.targetWorkspaceId || data.targetProject?.workspace_id,
							targetProjectName: data.targetProject?.project_name,
						})
					}, 500)
					return
				}

				if (result.status === "processing" && result.batch_key) {
					handleOperationPolling(result.batch_key, "copy", effectiveFileIds, {
						targetProjectId: data.targetProjectId,
						targetWorkspaceId:
							data.targetWorkspaceId || data.targetProject?.workspace_id,
						targetProjectName: data.targetProject?.project_name,
					})
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
			shareCode,
			sharePassword,
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
