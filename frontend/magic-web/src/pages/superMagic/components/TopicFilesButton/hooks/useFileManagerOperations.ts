import { useEffect, useRef } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { processDroppedItems } from "../utils/file-system"
import { getFileReferenceIdentityKey } from "../../../services/userFileReferenceResolver"
import { useDownloadProgress } from "../../../hooks/useDownloadProgress"
import workspaceStore from "../../../stores/core/workspace"
import projectStore from "../../../stores/core/project"
import { useFileOperations } from "./useFileOperations"
import { useMoveFile } from "./useMoveFile"
import { useCopyFileSelector } from "./useCopyFileSelector"
import { useCrossProjectFileOperation } from "./useCrossProjectFileOperation"
import { useImportFromOtherProject } from "./useImportFromOtherProject"
import { useDuplicateFileHandler } from "./useDuplicateFileHandler"
import { useUploadWithModal } from "./useUploadWithModal"
import { useDragUpload } from "./useDragUpload"
import { useBatchDownload } from "./useBatchDownload"
import { useFileManagerNames } from "./useFileManagerNames"
import { useSelectedFilesManager } from "./useSelectedFilesManager"
import { useShareFile } from "./useShareFile"
import { useFileInfoPanel } from "./useFileInfoPanel"
import { useContextMenu } from "./useContextMenu"
import { useDownloadImageMenu } from "../../Detail/contents/Image/hooks/useDownloadImageMenu"
import { useAICardCreateDialog } from "../../Detail/components/SelfMediaRootRender/components/AICardCreateDialog"
import { getAttachmentKey } from "../utils/getAttachmentKey"
import { getDuplicateFileModalProps } from "../components/duplicateFileModalProps"
import { resolveTopicFilesCapabilities } from "../file-space"
import type { FileManagerProps } from "../components/FileManager/types"
import type { AttachmentIndex } from "../utils/attachmentIndex"
import type { AttachmentItem } from "./types"

interface Options {
	props: FileManagerProps
	index: AttachmentIndex
	directory?: AttachmentItem
	selectedIds: Set<string>
	setSelectedIds: (ids: Set<string>) => void
	onOpen: (file: AttachmentItem) => void
	onMoveComplete: (ids: string[]) => void
}

/** 组合现有文件业务流程。手势和快捷键只调用这里暴露的操作，不直接请求文件 API。 */
export function useFileManagerOperations({
	props,
	index,
	directory,
	selectedIds,
	setSelectedIds,
	onOpen,
	onMoveComplete,
}: Options) {
	const { t } = useTranslation("super")
	const { attachments, projectId, spaceConfig, selectedProject, selectedTopic } = props
	const callbacks = spaceConfig?.operations
	const capabilities = resolveTopicFilesCapabilities(spaceConfig?.capabilities)
	const selectedWorkspace = selectedProject
		? workspaceStore.getWorkspaceById(selectedProject.workspace_id)
		: null
	const downloadProgress = useDownloadProgress()
	const duplicate = useDuplicateFileHandler({ attachments })
	const operations = useFileOperations({
		attachments,
		projectId,
		selectedProject: selectedProject ?? undefined,
		selectedTopic,
		fileScope: spaceConfig?.scope,
		isCurrent: callbacks?.isCurrent,
		resolveCreateParent: callbacks?.resolveCreateParent,
		onNodeCreated: callbacks?.onNodeCreated,
		onFileClick: onOpen,
		onFileCreated: onOpen,
		onUpdateAttachments: props.onRefresh,
		getItemId: getAttachmentKey,
		selectedItems: selectedIds,
		filteredFiles: attachments,
		duplicateFileHandler: duplicate,
		downloadProgress,
	})
	const names = useFileManagerNames(props, operations)
	const pendingMoveIds = useRef<string[]>([])
	const move = useMoveFile({
		projectId,
		attachments,
		attachmentIndex: index,
		allFiles: attachments,
		selectedItems: selectedIds,
		setSelectedItems: setSelectedIds,
		getItemId: getAttachmentKey,
		directorySource: spaceConfig?.directorySource,
		isCurrent: callbacks?.isCurrent,
		handleMoveFile: operations.handleMoveFile,
		useDetailedDuplicateConflict: true,
		onMoveSuccess: () => {
			onMoveComplete(pendingMoveIds.current)
			pendingMoveIds.current = []
			props.onRefresh()
		},
		onDirectoryMoveComplete: (files, targetId) => {
			callbacks?.onDirectoryMoveComplete(files, targetId)
			onMoveComplete(files.flatMap((file) => (file.file_id ? [file.file_id] : [])))
		},
	})
	const crossProject = useCrossProjectFileOperation({
		isCurrent: callbacks?.isCurrent,
		fileScope: spaceConfig?.scope,
		projectId,
		selectedProject: selectedProject ?? null,
		selectedWorkspace,
		projects: projectStore.projects,
		onSuccess: (result) => {
			if (result?.operationType === "move") onMoveComplete(result.fileIds)
			if (result?.operationType === "copy" && result.targetParentId)
				callbacks?.onDirectoryMoveComplete([], result.targetParentId)
			props.onRefresh()
		},
	})
	const copy = useCopyFileSelector({
		projectId,
		attachments,
		directorySource: spaceConfig?.directorySource,
	})
	const importOperation = useImportFromOtherProject({
		projectId,
		selectedProject: selectedProject ?? null,
		selectedWorkspace,
		workspaces: workspaceStore.workspaces,
		attachments,
		onSuccess: props.onRefresh,
	})
	const chat = useSelectedFilesManager({
		selectedItems: selectedIds,
		mergedFiles: attachments,
		getItemId: getAttachmentKey,
		selectedProject: spaceConfig?.chatContext?.selectedProject ?? selectedProject,
		selectedWorkspace: spaceConfig?.chatContext?.selectedWorkspace ?? selectedWorkspace,
		createAttachmentMention: spaceConfig?.chatContext?.createAttachmentMention,
		fileSpaceType: spaceConfig?.chatContext?.fileSpaceType,
	})
	const share = useShareFile({
		getItemId: getAttachmentKey,
		selectedItems: selectedIds,
		mergedFiles: attachments,
		setShareFileInfo: operations.setShareFileInfo,
		setShareModalVisible: operations.setShareModalVisible,
		selectedProject: selectedProject ?? undefined,
	})
	const batchShare = async (fileIds: string[]) => {
		const similar = await SuperMagicApi.findSimilarShares({ file_ids: fileIds }).catch(() => [])
		if (similar.length) {
			share.setSimilarShares(similar, fileIds)
			return
		}
		operations.setShareFileInfo({ projectName: selectedProject?.project_name, fileIds })
		operations.setShareModalVisible(true)
	}
	const batch = useBatchDownload({
		recordDeletionGroup: true,
		fileScope: spaceConfig?.scope,
		projectId,
		getItemId: getAttachmentKey,
		selectedItems: selectedIds,
		setSelectedItems: setSelectedIds,
		filteredFiles: attachments,
		attachments,
		selectedProject,
		selectedWorkspace,
		crossProjectOperation: {
			openMoveModal: (ids) => moveTo(ids),
			openCopyModal: (ids) => copyTo(ids),
		},
		moveFileHook: { openBatchMove: () => moveTo([...selectedIds]) },
		getParentPathByFileId: index.getParentItemsById,
		onUpdateAttachments: props.onRefresh,
		onDownloadSelected: spaceConfig?.scope ? operations.downloadSelectedFiles : undefined,
		resolveDeleteItems: callbacks?.resolveDeleteItems,
		beforeDelete: callbacks?.beforeDelete,
		onFilesDeleted: callbacks?.onFilesDeleted,
		isCurrent: callbacks?.isCurrent,
		removeFile: operations.removeFile,
		isMoving: move.isMoving,
		allowEdit: Boolean(
			props.allowEdit &&
			[...selectedIds].every((id) => {
				const file = index.getItemById(id)
				return file && (props.isItemMutable?.(file) ?? true)
			}),
		),
		allowCopyTo: Boolean(spaceConfig?.directorySource && props.allowEdit && capabilities.copy),
		allowDownload: props.allowDownload,
		allowMove: capabilities.move,
		allowCopy: capabilities.copy,
		allowShare: capabilities.share,
		onBatchShareClick: capabilities.share ? batchShare : undefined,
		isInProject: Boolean(projectId),
		downloadProgress,
	})
	const uploadTarget = useRef<AttachmentItem>()
	const userUpload = useUploadWithModal({
		projectId,
		fileScope: spaceConfig?.scope,
		title: props.rootName,
		resolveUploadTarget: callbacks
			? () => callbacks.resolveUploadTarget(uploadTarget.current)
			: undefined,
	})
	const cancelUserUpload = useMemoizedFn(userUpload.cancelDirectUpload)
	useEffect(() => () => cancelUserUpload(), [props.scopeKey, cancelUserUpload])
	const dragUpload = useDragUpload({
		allowUpload: Boolean(props.allowEdit && capabilities.upload),
		projectId,
		fileScope: spaceConfig?.scope,
		selectedProject,
		selectedTopic,
		workspaceId: selectedProject?.workspace_id,
		attachments,
		duplicateFileHandler: duplicate,
		onUpdateAttachments: props.onRefresh,
	})
	const uploadFile = (target?: AttachmentItem) => {
		if (callbacks) {
			uploadTarget.current = target ?? directory
			userUpload.handleCustomUploadFile()
		} else operations.handleUploadFile(target ?? directory)
	}
	const uploadFiles = async (files: File[], target?: AttachmentItem) => {
		if (callbacks) {
			uploadTarget.current = target ?? directory
			await userUpload.handleFilesSelected(files)
		} else await dragUpload.handleUploadFiles(files, target ?? directory, false)
	}
	const externalDrop = async (data: DataTransfer, target?: AttachmentItem) => {
		const identity = getFileReferenceIdentityKey()
		try {
			const dropped = await processDroppedItems(data)
			if (identity !== getFileReferenceIdentityKey()) return
			if (dropped.standaloneFiles.length) await uploadFiles(dropped.standaloneFiles, target)
			for (const folder of dropped.folders) {
				if (identity !== getFileReferenceIdentityKey()) return
				if (callbacks) {
					magicToast.error(t("topicFiles.error.dragFolderNotSupported"))
					break
				}
				await dragUpload.handleUploadFiles(folder.files, target ?? directory, true)
			}
		} catch {
			if (identity === getFileReferenceIdentityKey())
				magicToast.error(t("userSpace.operationFailed"))
		}
	}
	const imageDownload = useDownloadImageMenu({
		onDownload: (mode, item) => operations.handleDownloadOriginal(item as AttachmentItem, mode),
	})
	const info = useFileInfoPanel()
	const aiCard = useAICardCreateDialog({ projectId })
	const createFile = (
		type: Parameters<typeof names.file.createVirtualFile>[0],
		key?: string,
		path?: string,
	) =>
		names.file.createVirtualFile(
			type,
			key ?? directory?.file_id,
			path ?? directory?.relative_file_path,
		)
	const createFolder = (key?: string, path?: string) =>
		names.folder.createVirtualFolder(
			key ?? directory?.file_id,
			path ?? directory?.relative_file_path,
		)
	const moveTo = (ids: string[]) => {
		pendingMoveIds.current = ids
		if (capabilities.crossProject)
			crossProject.openMoveModal(ids, index.getParentItemsById(ids[0]))
		else move.openBatchMoveByFileIds(ids)
	}
	const copyTo = (ids: string[]) => {
		if (spaceConfig?.directorySource)
			copy.openBatchCopyByFileIds(
				ids,
				spaceConfig.directorySource.getPath(directory?.file_id ?? props.rootId),
			)
		else crossProject.openCopyModal(ids, index.getParentItemsById(ids[0]))
	}
	const isMutable = (file: AttachmentItem) =>
		Boolean(props.allowEdit && (props.isItemMutable?.(file) ?? true))
	const menu = useContextMenu({
		handleOpenFile: onOpen,
		handleOpenDirectory: onOpen,
		handleDeleteItem: operations.handleDeleteItem,
		handleDeleteWithConfirm: (file) => {
			if (isMutable(file)) void batch.deleteWithConfirm([file])
		},
		handleStartRename: (file) => {
			if (isMutable(file)) names.rename.handleStartRename(file)
		},
		handleDownloadOriginal: operations.handleDownloadOriginal,
		handleDownloadPdf: operations.handleDownloadPdf,
		handleDownloadPpt: operations.handleDownloadPpt,
		handleDownloadPptx: operations.handleDownloadPptx,
		handleDownloadImage: operations.handleDownloadImage,
		handleDownloadNoWaterMark: imageDownload.handleDownloadNoWaterMark,
		preloadWaterMarkFreeModal: imageDownload.preloadWaterMarkFreeModal,
		isFreeTrialVersion: imageDownload.isFreeTrialVersion,
		shouldUseSingleDownloadEntry: spaceConfig
			? true
			: imageDownload.shouldUseSingleDownloadEntry,
		handleShowInfo: info.handleShowInfo,
		handleUploadFile: props.allowEdit && capabilities.upload ? uploadFile : undefined,
		handleUploadFolder:
			props.allowEdit && capabilities.upload && !spaceConfig
				? (file) => operations.handleUploadFolder(file ?? directory)
				: undefined,
		handleShareItem: capabilities.share ? share.handleShareItem : undefined,
		handleAddToCurrentChat: capabilities.addToChat ? chat.handleAddToCurrentChat : undefined,
		handleAddToNewChat: capabilities.addToChat ? chat.handleAddToNewChat : undefined,
		handleAddMultipleFilesToCurrentChat: capabilities.addToChat
			? chat.handleAddMultipleFilesToCurrentChat
			: undefined,
		handleAddMultipleFilesToNewChat: capabilities.addToChat
			? chat.handleAddMultipleFilesToNewChat
			: undefined,
		handleMoveFile:
			props.allowEdit && capabilities.move
				? (file) => file.file_id && moveTo([file.file_id])
				: undefined,
		onCopyFile: capabilities.copy ? copyTo : undefined,
		handleReplaceFile:
			props.allowEdit && capabilities.replace ? props.handleReplaceFile : undefined,
		handleImportFromOtherProject:
			props.allowEdit && capabilities.importFromOtherProject
				? (file) =>
						importOperation.openImportModal(
							file?.file_id
								? [...index.getParentItemsById(file.file_id), file]
								: directory?.file_id
									? [...index.getParentItemsById(directory.file_id), directory]
									: [],
						)
				: undefined,
		createVirtualFile: createFile,
		createVirtualFolder: createFolder,
		createVirtualDesignProject: capabilities.projectContentCreation
			? (key, path) =>
					names.design.createVirtualDesignProject(
						key ?? directory?.file_id,
						path ?? directory?.relative_file_path,
					)
			: undefined,
		createVirtualSelfMediaProject: capabilities.projectContentCreation
			? (key, path) =>
					names.selfMedia.createVirtualSelfMediaProject(
						key ?? directory?.file_id,
						path ?? directory?.relative_file_path,
					)
			: undefined,
		createVirtualAICardProject: capabilities.projectContentCreation
			? (_key, path) => aiCard.open(path ?? directory?.relative_file_path)
			: undefined,
		selectedItems: selectedIds,
		treeIndex: index,
		attachments,
		allowDownload: props.allowDownload,
		filterBatchDownloadLayerMenuItems: (items) => (props.allowEdit ? items : []),
		isMoving: move.isMoving || crossProject.isOperating || batch.batchLoading || names.pending,
		filterMenuItems: (items, file) =>
			items.filter((item) => {
				if (!item || ["selectMultiple", "toggleFolderContents"].includes(String(item.key)))
					return false
				if (
					props.allowDownload === false &&
					["download", "downloadFolder"].includes(String(item.key))
				)
					return false
				return (
					(file ? isMutable(file) : props.allowEdit) ||
					[
						"openFile",
						"download",
						"downloadFolder",
						"showInfo",
						"copyPath",
						"addToCurrentChat",
						"addToNewChat",
					].includes(String(item.key))
				)
			}),
	})
	const duplicateProps = getDuplicateFileModalProps({
		sharedDuplicateHandler: callbacks
			? { ...userUpload.duplicateFileHandler, handleCancel: userUpload.cancelDirectUpload }
			: duplicate,
		moveDuplicateHandler: move,
		crossProjectDuplicateHandler: crossProject,
		importDuplicateHandler: importOperation,
	})
	return {
		operations,
		names,
		move,
		copy,
		crossProject,
		importOperation,
		share,
		batch,
		userUpload,
		duplicate,
		duplicateProps,
		imageDownload,
		info,
		aiCard,
		menu,
		capabilities,
		selectedWorkspace,
		uploadFile,
		uploadFiles,
		externalDrop,
		createFolder,
		createFile,
		moveTo,
		copyTo,
		isMutable,
		pendingMoveIds,
		busy:
			move.isMoving ||
			crossProject.isOperating ||
			importOperation.isOperating ||
			batch.batchLoading ||
			names.pending,
		transfer: async (ids: string[], targetId: string, mode: "move" | "copy") => {
			const path = spaceConfig?.directorySource
				? spaceConfig.directorySource.getPath(targetId)
				: targetId
					? [...index.getParentItemsById(targetId), index.getItemById(targetId)].filter(
							(item): item is AttachmentItem => Boolean(item),
						)
					: []
			if (mode === "move") {
				pendingMoveIds.current = ids
				if (spaceConfig?.directorySource) await move.moveWithinDirectorySource(path, ids)
				else
					await move.batchMoveFilesWithDuplicateCheck({
						fileIds: ids,
						projectId: projectId ?? "",
						targetParentId: targetId,
					})
			} else if (projectId || spaceConfig?.scope === "user")
				await crossProject.executeCopyOperation({
					fileIds: ids,
					targetProjectId: projectId ?? "",
					targetPath: path,
					sourceAttachments: attachments,
					targetAttachments: attachments,
				})
		},
	}
}
