import { useState, useCallback, useEffect, useRef } from "react"
import magicToast from "@/components/base/MagicToaster/utils"
import { useTranslation } from "react-i18next"
import type { AttachmentItem } from "./types"
import { checkDuplicateFileName } from "../utils/checkDuplicateFileName"
import MagicModal from "@/components/base/MagicModal"
import { IconAlertTriangleFilled } from "@tabler/icons-react"
import { SuperMagicApi } from "@/apis"
import { collectSelectedFolderIds } from "../../SelectPathModal/utils/attachmentUtils"
import { detectDuplicateFilesForMove } from "../utils/moveOrCopyDuplicateHandler"
import {
	collectSameParentOperationIds,
	detectFolderConflictsForMove,
} from "../utils/folderConflictHandler"
import { useMoveOrCopyDuplicateHandler } from "./useMoveOrCopyDuplicateHandler"
import { useFolderConflictHandler } from "./useFolderConflictHandler"
import { getAttachmentPathByLookupKey, type AttachmentIndex } from "../utils/attachmentIndex"
import { collectSelectedItemIds } from "../utils/collectSelectedItemIds"
import {
	detectCanvasProjectOperationRisk,
	getCanvasProjectOperationImpact,
	type CanvasProjectOperationRisk,
} from "../utils/canvasProjectOperationRisk"
import {
	mergeStaticDependencyFileIds,
	resolveSingleDocumentStaticDependencies,
} from "@/pages/superMagic/utils/staticDependencies"

interface UseMoveFileOptions {
	projectId?: string
	attachments?: AttachmentItem[]
	attachmentIndex?: AttachmentIndex
	onMoveSuccess?: () => void
	handleMoveFile?: (fileId: string, targetParentId: string) => Promise<boolean>
	// 批量移动相关
	selectedItems?: Set<string>
	setSelectedItems?: (items: Set<string>) => void
	getItemId?: (item: AttachmentItem) => string
	allFiles?: AttachmentItem[]
	onSelectModeChange?: (isSelectMode: boolean) => void
}

const MOVE_TASK_TIMEOUT_MS = 120000

export function useMoveFile(options: UseMoveFileOptions = {}) {
	const { t } = useTranslation("super")
	const {
		projectId,
		attachments = [],
		attachmentIndex,
		onMoveSuccess,
		handleMoveFile,
		selectedItems,
		setSelectedItems,
		getItemId,
		allFiles,
		onSelectModeChange,
	} = options

	// 移动弹窗状态
	const [visible, setVisible] = useState(false)
	const [currentMoveItem, setCurrentMoveItem] = useState<AttachmentItem | null>(null)
	const [isBatchMode, setIsBatchMode] = useState(false)
	const [batchFileIds, setBatchFileIds] = useState<string[]>([])
	// 禁用的文件夹ID列表
	const [disabledFolderIds, setDisabledFolderIds] = useState<string[]>([])
	// 移动进度状态
	const [moveProgress, setMoveProgress] = useState(0)
	const [isMoving, setIsMovingFn] = useState(false)
	const movePollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const moveWatchdogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const activeMoveTaskIdRef = useRef(0)
	const moveDuplicateHandler = useMoveOrCopyDuplicateHandler()
	const folderConflictHandler = useFolderConflictHandler()
	// 默认路径（被移动文件所在的目录）
	const [defaultPath, setDefaultPath] = useState<AttachmentItem[]>([])

	const setIsMoving = (moving: boolean) => {
		console.trace(moving)
		setIsMovingFn(moving)
	}

	const clearMoveTimers = useCallback(() => {
		if (movePollingTimerRef.current) {
			clearInterval(movePollingTimerRef.current)
			movePollingTimerRef.current = null
		}

		if (moveWatchdogTimerRef.current) {
			clearTimeout(moveWatchdogTimerRef.current)
			moveWatchdogTimerRef.current = null
		}
	}, [])

	const resetMoveTask = useCallback(
		(taskId: number) => {
			if (activeMoveTaskIdRef.current !== taskId) return

			clearMoveTimers()
			setIsMoving(false)
			setMoveProgress(0)
		},
		[clearMoveTimers],
	)

	const beginMoveTask = useCallback(() => {
		clearMoveTimers()
		activeMoveTaskIdRef.current += 1
		const taskId = activeMoveTaskIdRef.current

		setIsMoving(true)
		setMoveProgress(0)

		moveWatchdogTimerRef.current = setTimeout(() => {
			if (activeMoveTaskIdRef.current !== taskId) return

			console.warn("批量移动超时，自动清理移动状态", { taskId })
			magicToast.error(t("topicFiles.error.moveFileFailed"))
			resetMoveTask(taskId)
		}, MOVE_TASK_TIMEOUT_MS)

		return taskId
	}, [clearMoveTimers, resetMoveTask, t])

	const finishMoveTask = useCallback(
		(taskId: number, delay = 0) => {
			if (activeMoveTaskIdRef.current !== taskId) return

			clearMoveTimers()

			const reset = () => {
				resetMoveTask(taskId)
			}

			if (delay > 0) {
				setTimeout(reset, delay)
				return
			}

			reset()
		},
		[clearMoveTimers, resetMoveTask],
	)

	useEffect(() => clearMoveTimers, [clearMoveTimers])

	// 显示移动选择器
	const showMoveSelector = useCallback((item: AttachmentItem) => {
		setCurrentMoveItem(item)
		setIsBatchMode(false)
		// 单个文件移动时，禁用其父文件夹（如果是文件夹的话）
		const disabled = item.is_directory && item.file_id ? [item.file_id] : []
		setDisabledFolderIds(disabled)
		// 点击移动时始终从当前项目根目录开始选择目标位置。
		setDefaultPath([])
		setVisible(true)
	}, [])

	// 显示批量移动选择器
	const showBatchMoveSelector = useCallback(
		(fileIds: string[]) => {
			setBatchFileIds(fileIds)
			setIsBatchMode(true)
			// 收集选中的文件夹ID作为禁用列表
			if (fileIds && attachments) {
				const disabledIds = collectSelectedFolderIds(attachments, fileIds)
				console.log("🔵 disabledIds", disabledIds)
				setDisabledFolderIds(disabledIds)
				setDefaultPath([])
			} else {
				setDisabledFolderIds([])
				setDefaultPath([])
			}

			setVisible(true)
		},
		[attachments],
	)

	// 打开批量移动（内部根据选中项收集 file_ids）
	const openBatchMove = useCallback(() => {
		if (!selectedItems || selectedItems.size === 0 || !allFiles || !getItemId) return
		const ids = collectSelectedItemIds(allFiles, selectedItems, getItemId)
		if (ids.length === 0) return
		showBatchMoveSelector(ids)
	}, [allFiles, getItemId, selectedItems, showBatchMoveSelector])

	/**
	 * 供新移动端 UI 直接复用旧的目录选择器，不重新拼装移动链路。
	 */
	const openBatchMoveByFileIds = useCallback(
		(fileIds: string[]) => {
			if (fileIds.length === 0) return
			showBatchMoveSelector(fileIds)
		},
		[showBatchMoveSelector],
	)

	// 隐藏移动选择器
	const hideMoveSelector = useCallback(() => {
		setVisible(false)
		setCurrentMoveItem(null)
		setBatchFileIds([])
		setIsBatchMode(false)
		setDisabledFolderIds([])
		setDefaultPath([])
	}, [])

	// 获取文件/文件夹的显示名称
	const getItemName = useCallback((item: AttachmentItem): string => {
		return item.name || item.file_name || item.filename || item.display_filename || ""
	}, [])

	// 根据路径构建目标文件夹路径
	const getTargetFolderPath = useCallback(
		(path: AttachmentItem[]): string => {
			if (path.length === 0) return ""
			return "/" + path.map((item) => getItemName(item)).join("/")
		},
		[getItemName],
	)

	// 检查单个文件是否存在同名冲突
	const checkSingleFileConflict = useCallback(
		(item: AttachmentItem, targetFolderPath: string): boolean => {
			const fileName = getItemName(item)
			return checkDuplicateFileName(fileName, attachments, targetFolderPath)
		},
		[attachments, getItemName],
	)

	// 检查批量文件是否存在同名冲突
	const checkBatchFilesConflict = useCallback(
		(
			fileIds: string[],
			targetFolderPath: string,
		): { hasConflict: boolean; conflictItems: AttachmentItem[] } => {
			if (!allFiles || !getItemId) {
				return { hasConflict: false, conflictItems: [] }
			}

			const conflictItems: AttachmentItem[] = []

			// 递归查找文件
			const findItemsById = (items: AttachmentItem[], ids: string[]): AttachmentItem[] => {
				const foundItems: AttachmentItem[] = []

				items.forEach((item) => {
					const itemId = getItemId(item)
					if (ids.includes(itemId)) {
						foundItems.push(item)
					}
					if (item.is_directory && "children" in item && item.children) {
						foundItems.push(...findItemsById(item.children, ids))
					}
				})

				return foundItems
			}

			const itemsToMove = findItemsById(allFiles, fileIds)

			itemsToMove.forEach((item) => {
				if (checkSingleFileConflict(item, targetFolderPath)) {
					conflictItems.push(item)
				}
			})

			return {
				hasConflict: conflictItems.length > 0,
				conflictItems,
			}
		},
		[allFiles, getItemId, checkSingleFileConflict],
	)

	// 显示覆盖确认对话框
	const showOverwriteConfirm = useCallback(
		(conflictItems: AttachmentItem[], onConfirm: () => void) => {
			const isMultiple = conflictItems.length > 1
			let content: string

			if (!isMultiple) {
				// 单个文件冲突
				const fileName = getItemName(conflictItems[0])
				content = t("topicFiles.moveModal.overwriteSingleContent", { name: fileName })
			} else {
				// 多个文件冲突
				const totalCount = conflictItems.length
				if (totalCount <= 3) {
					// 文件数量较少，显示所有文件名
					const conflictNames = conflictItems.map((item) => getItemName(item)).join("、")
					content = t("topicFiles.moveModal.overwriteMultipleContent", {
						names: conflictNames,
					})
				} else {
					// 文件数量较多，显示前3个 + 总数
					const firstThreeNames = conflictItems
						.slice(0, 3)
						.map((item) => getItemName(item))
						.join("、")
					content = t("topicFiles.moveModal.overwriteManyContent", {
						names: firstThreeNames,
						total: totalCount,
					})
				}
			}

			MagicModal.confirm({
				title: t("topicFiles.moveModal.overwriteTitle"),
				content,
				icon: (
					<IconAlertTriangleFilled
						size={20}
						color="rgba(255,125,0, 1)"
						style={{ marginRight: 6, lineHeight: 20, flexShrink: 0 }}
					/>
				),
				okButtonProps: {
					color: "danger",
					variant: "solid",
				},
				cancelButtonProps: {
					color: "default",
					variant: "filled",
				},
				okText: t("topicFiles.moveModal.overwriteConfirm"),
				cancelText: t("common.cancel"),
				onOk: onConfirm,
			})
		},
		[getItemName, t],
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
					icon: (
						<IconAlertTriangleFilled
							size={20}
							color="rgba(255,125,0, 1)"
							style={{ marginRight: 6, lineHeight: 20, flexShrink: 0 }}
						/>
					),
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

	// 批量移动文件处理函数
	const batchMoveFiles = useCallback(
		async ({
			fileIds,
			projectId,
			targetParentId,
			targetProjectId,
			keepBothFileIds = [],
		}: {
			fileIds: string[]
			projectId: string
			targetParentId: string
			targetProjectId?: string
			keepBothFileIds?: string[]
		}) => {
			if (fileIds.length === 0 || !projectId) return

			let effectiveFileIds = fileIds
			try {
				const { dependencyTransferFileIds } = await resolveSingleDocumentStaticDependencies(
					{
						fileIds,
						attachments,
						attachmentIndex,
					},
				)
				effectiveFileIds = mergeStaticDependencyFileIds(
					fileIds,
					dependencyTransferFileIds,
					true,
				)
			} catch (error) {
				// Keep the legacy move usable if the optional browser-side dependency read fails.
				console.error(
					"Failed to resolve document static dependencies before moving:",
					error,
				)
			}

			const moveTaskId = beginMoveTask()

			try {
				const data =
					effectiveFileIds.length === 1
						? await SuperMagicApi.moveFile({
								file_id: effectiveFileIds[0],
								target_parent_id: targetParentId,
								project_id: projectId,
								target_project_id: targetProjectId,
								keep_both_file_ids: keepBothFileIds,
							})
						: await SuperMagicApi.moveFiles({
								file_ids: effectiveFileIds,
								project_id: projectId,
								target_project_id: targetProjectId,
								target_parent_id: targetParentId,
								pre_file_id: "",
								keep_both_file_ids: keepBothFileIds,
							})

				// 如果直接完成
				if (data.status === "success") {
					setMoveProgress(100)
					magicToast.success(t("topicFiles.success.fileMoved"))
					hideMoveSelector()
					onMoveSuccess?.()
					finishMoveTask(moveTaskId, 500)
					return
				}

				// 如果需要轮询状态
				if (data.status === "processing" && data.batch_key) {
					// 每2秒轮询批量状态
					const timer = setInterval(async () => {
						try {
							if (activeMoveTaskIdRef.current !== moveTaskId) return

							const checkData = await SuperMagicApi.checkBatchOperationStatus(
								data.batch_key,
							)

							if (activeMoveTaskIdRef.current !== moveTaskId) return

							// 更新进度显示
							if (checkData.status === "processing") {
								const progress = checkData.progress
									? parseInt(checkData.progress)
									: 0
								setMoveProgress(progress)
							} else if (checkData.status === "success") {
								setMoveProgress(100)
								magicToast.success(t("topicFiles.success.fileMoved"))
								hideMoveSelector()
								onMoveSuccess?.()
								finishMoveTask(moveTaskId, 500)
							} else if (checkData.status === "failed") {
								magicToast.error(
									checkData.message || t("topicFiles.error.moveFileFailed"),
								)
								finishMoveTask(moveTaskId)
							} else {
								finishMoveTask(moveTaskId)
							}
						} catch (error) {
							console.error("检查批量移动状态失败:", error)
							magicToast.error(t("topicFiles.error.moveFileFailed"))
							finishMoveTask(moveTaskId)
						}
					}, 2000)
					movePollingTimerRef.current = timer
					return
				}

				magicToast.error(data.message || t("topicFiles.error.moveFileFailed"))
				finishMoveTask(moveTaskId)
			} catch (error) {
				console.error("批量移动失败:", error)
				magicToast.error(t("topicFiles.error.moveFileFailed"))
				finishMoveTask(moveTaskId)
			}
		},
		[
			attachmentIndex,
			attachments,
			beginMoveTask,
			finishMoveTask,
			hideMoveSelector,
			onMoveSuccess,
			t,
		],
	)

	const batchMoveFilesWithDuplicateCheck = useCallback(
		async ({
			fileIds,
			projectId,
			targetParentId,
			targetPath,
			targetProjectId,
			sourceAttachments = attachments,
			targetAttachments = attachments,
		}: {
			fileIds: string[]
			projectId: string
			targetParentId: string
			targetPath?: AttachmentItem[]
			targetProjectId?: string
			sourceAttachments?: AttachmentItem[]
			targetAttachments?: AttachmentItem[]
		}) => {
			if (!projectId || fileIds.length === 0) return
			const resolvedTargetPath =
				targetPath ??
				(attachmentIndex
					? getAttachmentPathByLookupKey(attachmentIndex, targetParentId)
					: [])
			const sharedSourceIndex =
				sourceAttachments === attachments ? attachmentIndex : undefined
			const sharedTargetIndex =
				targetAttachments === attachments ? attachmentIndex : undefined

			let keepBothFileIds = collectSameParentOperationIds(
				fileIds,
				sourceAttachments,
				resolvedTargetPath,
				sharedSourceIndex,
			)
			const conflictDetectionIds = fileIds.filter(
				(fileId) => !keepBothFileIds.includes(fileId),
			)
			const folderConflicts =
				conflictDetectionIds.length > 0
					? detectFolderConflictsForMove(
							conflictDetectionIds,
							sourceAttachments,
							targetAttachments,
							resolvedTargetPath,
							{
								source: sharedSourceIndex,
								target: sharedTargetIndex,
							},
						)
					: new Map()

			if (conflictDetectionIds.length > 0) {
				const canvasRisk = await detectCanvasProjectOperationRisk({
					attachments: sourceAttachments,
					fileIds: conflictDetectionIds,
					operation: "move",
				})
				if (canvasRisk.shouldWarn) {
					const shouldContinue = await confirmCanvasProjectRisk(canvasRisk)
					if (!shouldContinue) return
				}
			}

			if (folderConflicts.size > 0) {
				const folderChoice = await folderConflictHandler.checkConflicts(folderConflicts)
				if (!folderChoice.shouldProceed) return
				keepBothFileIds = [...keepBothFileIds, ...folderChoice.keepBothIds]
			}

			const duplicateDetectionIds = fileIds.filter(
				(fileId) => !keepBothFileIds.includes(fileId),
			)
			const duplicates =
				duplicateDetectionIds.length > 0
					? detectDuplicateFilesForMove(
							duplicateDetectionIds,
							sourceAttachments,
							targetAttachments,
							resolvedTargetPath,
						)
					: new Map()

			if (duplicates.size > 0) {
				const userChoice = await moveDuplicateHandler.checkDuplicates(duplicates)
				if (!userChoice.shouldProceed) return
				keepBothFileIds = [...keepBothFileIds, ...userChoice.keepBothIds]
			}

			await batchMoveFiles({
				fileIds,
				projectId,
				targetParentId,
				targetProjectId,
				keepBothFileIds,
			})
		},
		[
			attachmentIndex,
			attachments,
			batchMoveFiles,
			confirmCanvasProjectRisk,
			folderConflictHandler,
			moveDuplicateHandler,
		],
	)

	// 确认移动文件
	const confirmMove = useCallback(
		async (data: { path: AttachmentItem[] }) => {
			const targetParentId =
				data.path.length > 0 ? data.path[data.path.length - 1].file_id || "" : ""
			const targetFolderPath = getTargetFolderPath(data.path)

			const executeBatchMove = (keepBothFileIds: string[] = []) => {
				// 立即退出多选模式
				setSelectedItems && setSelectedItems(new Set())
				onSelectModeChange && onSelectModeChange(false)

				batchMoveFiles({
					fileIds: batchFileIds,
					projectId: projectId || "",
					targetParentId: targetParentId,
					keepBothFileIds,
				})
			}

			// 批量模式
			if (isBatchMode) {
				if (!projectId || batchFileIds.length === 0) return

				const sameParentKeepBothIds = collectSameParentOperationIds(
					batchFileIds,
					attachments,
					data.path,
					attachmentIndex,
				)
				if (sameParentKeepBothIds.length === batchFileIds.length) {
					executeBatchMove(sameParentKeepBothIds)
					return
				}
				const conflictCheckIds = batchFileIds.filter(
					(fileId) => !sameParentKeepBothIds.includes(fileId),
				)

				if (conflictCheckIds.length > 0) {
					const canvasRisk = await detectCanvasProjectOperationRisk({
						attachments,
						fileIds: conflictCheckIds,
						operation: "move",
					})
					if (canvasRisk.shouldWarn) {
						const shouldContinue = await confirmCanvasProjectRisk(canvasRisk)
						if (!shouldContinue) return
					}
				}

				// 检查批量移动是否存在同名冲突
				const { hasConflict, conflictItems } = checkBatchFilesConflict(
					conflictCheckIds,
					targetFolderPath,
				)

				if (hasConflict) {
					// 显示覆盖确认对话框
					showOverwriteConfirm(conflictItems, () => {
						// 用户确认后执行批量移动
						executeBatchMove(sameParentKeepBothIds)
					})
					return
				}

				// 没有冲突，直接执行批量移动
				executeBatchMove(sameParentKeepBothIds)
				return
			}

			const executeSingleMove = async () => {
				if (!currentMoveItem?.file_id) return

				if (!handleMoveFile && projectId) {
					try {
						const { dependencyTransferFileIds } =
							await resolveSingleDocumentStaticDependencies({
								fileIds: [currentMoveItem.file_id],
								attachments,
								attachmentIndex,
							})
						if (dependencyTransferFileIds.length > 0) {
							await batchMoveFiles({
								fileIds: mergeStaticDependencyFileIds(
									[currentMoveItem.file_id],
									dependencyTransferFileIds,
									true,
								),
								projectId,
								targetParentId,
							})
							return
						}
					} catch (error) {
						console.error(
							"Failed to resolve document static dependencies before moving:",
							error,
						)
					}
				}

				try {
					setIsMoving(true)
					setMoveProgress(0)

					let success = false

					if (handleMoveFile) {
						setMoveProgress(50)
						// 使用传入的 handleMoveFile 函数
						success = await handleMoveFile(currentMoveItem.file_id, targetParentId)
						if (success) {
							setMoveProgress(100)
							hideMoveSelector()
							// 清空选中状态
							setSelectedItems && setSelectedItems(new Set())
							onMoveSuccess?.()
							setTimeout(() => {
								setIsMoving(false)
								setMoveProgress(0)
							}, 500)
						} else {
							setIsMoving(false)
							setMoveProgress(0)
						}
					} else {
						setMoveProgress(50)
						// 直接调用 API
						await SuperMagicApi.moveFile({
							file_id: currentMoveItem.file_id,
							target_parent_id: targetParentId,
						})
						setMoveProgress(100)
						magicToast.success(t("topicFiles.success.fileMoved"))
						hideMoveSelector()
						// 清空选中状态
						setSelectedItems && setSelectedItems(new Set())
						onMoveSuccess?.()
						setTimeout(() => {
							setIsMoving(false)
							setMoveProgress(0)
						}, 500)
					}
				} catch (error) {
					console.error("移动文件失败:", error)
					magicToast.error(t("topicFiles.error.moveFileFailed"))
					setIsMoving(false)
					setMoveProgress(0)
				}
			}

			if (!currentMoveItem?.file_id) return

			const sameParentKeepBothIds = collectSameParentOperationIds(
				[currentMoveItem.file_id],
				attachments,
				data.path,
				attachmentIndex,
			)
			if (sameParentKeepBothIds.length > 0 && projectId) {
				await batchMoveFiles({
					fileIds: [currentMoveItem.file_id],
					projectId,
					targetParentId,
					keepBothFileIds: sameParentKeepBothIds,
				})
				return
			}

			const canvasRisk = await detectCanvasProjectOperationRisk({
				attachments,
				items: [currentMoveItem],
				operation: "move",
			})
			if (canvasRisk.shouldWarn) {
				const shouldContinue = await confirmCanvasProjectRisk(canvasRisk)
				if (!shouldContinue) return
			}

			// 检查单个文件移动是否存在同名冲突
			const hasConflict = checkSingleFileConflict(currentMoveItem, targetFolderPath)

			if (hasConflict) {
				// 显示覆盖确认对话框
				showOverwriteConfirm([currentMoveItem], () => {
					// 用户确认后执行单个移动
					executeSingleMove()
				})
				return
			}

			// 没有冲突，直接执行单个移动
			executeSingleMove()
		},
		[
			attachmentIndex,
			attachments,
			batchFileIds,
			batchMoveFiles,
			checkBatchFilesConflict,
			checkSingleFileConflict,
			confirmCanvasProjectRisk,
			currentMoveItem,
			getTargetFolderPath,
			handleMoveFile,
			hideMoveSelector,
			isBatchMode,
			onMoveSuccess,
			onSelectModeChange,
			projectId,
			setSelectedItems,
			showOverwriteConfirm,
			t,
		],
	)

	return {
		// 状态
		visible,
		currentMoveItem,
		projectId: projectId || "",
		attachments,
		isMoving,
		moveProgress,

		// 方法
		showMoveSelector,
		showBatchMoveSelector,
		openBatchMove,
		openBatchMoveByFileIds,
		hideMoveSelector,
		confirmMove,
		batchMoveFiles, // 暴露批量移动方法
		batchMoveFilesWithDuplicateCheck,
		duplicateModalVisible: moveDuplicateHandler.modalVisible,
		currentDuplicateFileName: moveDuplicateHandler.currentFileName,
		totalDuplicates: moveDuplicateHandler.totalDuplicates,
		handleDuplicateReplace: moveDuplicateHandler.handleReplace,
		handleDuplicateKeepBoth: moveDuplicateHandler.handleKeepBoth,
		handleDuplicateCancel: moveDuplicateHandler.handleCancel,
		folderConflictModalVisible: folderConflictHandler.modalVisible,
		currentFolderConflictName: folderConflictHandler.currentFolderName,
		totalFolderConflicts: folderConflictHandler.totalConflicts,
		canMergeFolderConflict: folderConflictHandler.canMerge,
		handleFolderConflictKeepBoth: folderConflictHandler.handleKeepBoth,
		handleFolderConflictMerge: folderConflictHandler.handleMerge,
		handleFolderConflictCancel: folderConflictHandler.handleCancel,

		// 选择器配置
		selectorConfig: {
			visible,
			title: t("topicFiles.moveModal.title"),
			tips: t("topicFiles.moveModal.tips"),
			projectId: projectId || "",
			attachments,
			pendingMoveFileIds: isBatchMode
				? batchFileIds
				: currentMoveItem?.file_id
					? [currentMoveItem.file_id]
					: [],
			onSubmit: confirmMove,
			onClose: hideMoveSelector,
			okText: t("topicFiles.moveModal.confirm"),
			cancelText: t("common.cancel"),
			disabledFolderIds, // 传递禁用文件夹列表
			confirmLoading: isMoving, // 添加确认按钮加载状态
			defaultPath, // 传递默认路径
		},
	}
}
