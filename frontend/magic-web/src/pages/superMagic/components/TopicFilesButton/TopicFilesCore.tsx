import { IconChevronDown, IconChevronRight, IconDots } from "@tabler/icons-react"
import { Loader2, ChevronDown } from "lucide-react"
import { Flex, message } from "antd"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { useMemo, useImperativeHandle, forwardRef, useRef } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import MagicIcon from "@/components/base/MagicIcon"
import FoldIcon from "@/pages/superMagic/assets/svg/file-folder.svg"
import CustomTree from "./components/CustomTree/CustomTree"
import EmptyState from "./components/EmptyState"
import { useStyles } from "./style"
import { useMemoizedFn, useResponsive } from "ahooks"
import { useSuperMagicDropdown } from "../SuperMagicDropdown"
import {
	useRename,
	useFileOperations,
	useContextMenu,
	useFileInfoPanel,
	useFileSelection,
	useBatchDownload,
	useFileFilter,
	useVirtualFile,
	useVirtualFolder,
	useVirtualDesignProject,
	useVirtualSelfMediaProject,
	useVirtualAICardProject,
	useTreeUI,
	useDragMove,
	useTopicFilesTreeDerivation,
	useFileListAreaDrag,
	useMoveFile,
	useSelectedFilesManager,
	useTopicFilesPerfSession,
	measureMergedFilesBuild,
	isInRootDirectory,
	useAutoExpandFolder,
	createFileDragHandlers,
	useShareFile,
	useStableTreeNodeDragHandlers,
	useTopicFileRowRenderVersion,
	useCrossProjectMoveCompensation,
} from "./hooks"
import { useFileShortcuts } from "./hooks/useFileShortcuts"
import { useCrossProjectFileOperation } from "./hooks/useCrossProjectFileOperation"
import { useImportFromOtherProject } from "./hooks/useImportFromOtherProject"
import CrossProjectFileOperationModal from "../SelectPathModal/components/CrossProjectFileOperationModal"
import ImportFromOtherProjectModal from "../SelectPathModal/components/ImportFromOtherProjectModal"
import { useDragUpload } from "./hooks/useDragUpload"
import { getDuplicateFileModalProps } from "./components/duplicateFileModalProps"
import { type PresetFileType } from "./constant"
import { useDuplicateFileHandler } from "./hooks/useDuplicateFileHandler"

import { useLocateFile } from "./hooks/useLocateFile"
import type { AttachmentItem } from "./hooks/types"
import { SuperMagicApi } from "@/apis"

import ShareModal from "../Share/Modal"
import ShareSuccessModal from "../Share/FileShareModal/ShareSuccessModal"
import SimilarSharesDialog from "../Share/SimilarSharesDialog"
import SimilarSharesDrawer from "../Share/SimilarSharesDrawer"
import { generateShareUrl } from "../ShareManagement/utils/shareTypeHelpers"
import { ShareMode, ShareType } from "../Share/types"
import ProjectShareSheet from "@/pages/superMagicMobile/components/ProjectShareSheet"
import type { TreeNodeData } from "./utils/treeDataConverter"
import { DuplicateFileModal } from "./components/DuplicateFileModal"
import { FolderConflictModal } from "./components/FolderConflictModal"
import { CustomFolderMagicIcon } from "./components/CustomFolderMagicIcon"
import { MagicSystemFolderIcon } from "./components/MagicSystemFolderIcon"
import {
	ProjectFileImagePreviewProvider,
	resolveProjectFileImagePreviewSource,
	useProjectFileImagePreviewManager,
} from "./components/ProjectFileImagePreviewProvider"
import { ProjectFileImageThumbnailIcon } from "./components/ProjectFileImageThumbnailIcon"
import { ProjectFileImageSmartTooltip } from "./components/ProjectFileImageSmartTooltip"
import { InputWithError } from "./components"
import {
	getAppEntryFile,
	getAttachmentType,
	getChildrenForCustomMetadataIconPath,
	getFileTreeIconType,
	getFileIconType,
} from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"
import { isEmpty } from "lodash-es"
import { Button } from "@/components/shadcn-ui/button"
import { useOrganization } from "@/models/user/hooks/useOrganization"
import MagicProgressToast from "@/components/base/MagicProgressToast"
import { SelectDirectoryModal } from "../SelectPathModal"
import { handleAttachmentDragEnd } from "../MessageEditor/utils/drag"
import SmartTooltip from "@/components/other/SmartTooltip"
import { isCachedChatWorkspaceProject } from "@/pages/superMagic/utils/isChatWorkspaceProject"

import { useDownloadImageMenu } from "../Detail/contents/Image/hooks/useDownloadImageMenu"
import { DownloadImageMode } from "../../pages/Workspace/types"
import { useDownloadProgress } from "@/pages/superMagic/hooks/useDownloadProgress"
import { userStore } from "@/models/user"
import { MagicDropdown } from "@/components/base"
import { detectContentTypeRender } from "../Detail/components/FilesViewer/utils/preview"
import { markProjectFileListScrollActivity } from "@/pages/superMagic/utils/fileListScrollActivity"
import type { FileItem } from "../Detail/components/FilesViewer/types"
import type { TopicFileRowDecorationResolver } from "./topic-file-row-decoration.types"
import { DetailType } from "../Detail/types"
import SelfMediaPostRowPlatformIcon from "../Detail/components/SelfMediaRootRender/components/SelfMediaPostRowPlatformIcon"
import { useSelfMediaTreeNavigation } from "./hooks/useSelfMediaTreeNavigation"
import { useAICardTreeNavigation } from "./hooks/useAICardTreeNavigation"
import { isMagicSystemFolder } from "./utils/magic-system-folder"
import { useAICardCreateDialog } from "../Detail/components/SelfMediaRootRender/components/AICardCreateDialog"
import { isNoHoverCoarsePointer } from "@/utils/devices"
import { useActiveTreeSelection } from "./hooks/useActiveTreeSelection"
import {
	shouldEnableTopicFileSelection,
	shouldShowMobileBatchActions,
} from "./utils/batch-selection"

interface TopicFilesCoreProps {
	className?: string
	attachments?: AttachmentItem[]
	setUserSelectDetail?: (detail: any) => void
	onFileClick?: (fileItem: any) => void
	projectId?: string
	fileFilters?: {
		documents: boolean
		multimedia: boolean
		code: boolean
	}
	handleDownloadAll?: () => void
	allLoading?: boolean
	activeFileId?: string | null
	selectedTopic?: any
	isSelectMode?: boolean
	onSelectModeChange?: (isSelectMode: boolean) => void
	onSelectAll?: () => void
	onDeselectAll?: () => void
	onSelectionChange?: (selectedCount: number, totalCount: number) => void
	allowEdit?: boolean
	onUpdateAttachments?: () => void
	afterAddFileToNewTopic?: () => void
	afterAddFileToCurrentTopic?: () => void
	// 添加直接更新attachments的回调
	onAttachmentsChange?: (attachments: AttachmentItem[]) => void
	selectedProject?: any
	handleReplaceFile?: (item: AttachmentItem) => void
	// 外部传入的同名文件处理 handler（可选）
	duplicateFileHandler?: ReturnType<typeof useDuplicateFileHandler>
	// 跨项目操作所需的props
	selectedWorkspace?: any
	projects?: any[]
	workspaces?: any[]
	isInProject?: boolean
	// 外部传入的搜索值
	externalSearchValue?: string
	// 自定义菜单项过滤器
	filterMenuItems?: (menuItems: any[]) => any[]
	// 自定义批量下载菜单过滤器
	filterBatchDownloadLayerMenuItems?: (menuItems: any[]) => any[]
	// 是否允许下载（用于分享页面权限控制）
	allowDownload?: boolean
	// Allow a read-only host such as a public share to expose batch selection without login.
	allowReadonlySelection?: boolean
	resolveTopicFileRowDecoration?: TopicFileRowDecorationResolver
	// 刷新加载状态
	refreshLoading?: boolean
}

// 定义 ref 暴露的方法接口
export interface TopicFilesCoreRef {
	createVirtualFile: (type: PresetFileType, key?: string, parentPath?: string) => void
	createVirtualFolder: (key?: string, parentPath?: string) => void
	createDesignProject: (parentPath?: string) => Promise<any>
	handleUploadFile: (item?: any) => void
	handleUploadFolder: (item?: any) => void
	handleImportFromOtherProject: (item?: any) => void
	openBatchMoveByFileIds: (fileIds: string[]) => void
	resetAllStates: () => void
}

const TopicFilesCore = forwardRef<TopicFilesCoreRef, TopicFilesCoreProps>(function TopicFilesCore(
	{
		className,
		attachments = [],
		setUserSelectDetail,
		onFileClick,
		projectId,
		fileFilters = {
			documents: true,
			multimedia: true,
			code: true,
		},
		handleDownloadAll,
		allLoading,
		activeFileId,
		selectedTopic,
		isSelectMode = false,
		onSelectModeChange,
		onSelectionChange,
		allowEdit = true,
		onUpdateAttachments,
		afterAddFileToNewTopic,
		afterAddFileToCurrentTopic,
		onAttachmentsChange,
		selectedProject,
		handleReplaceFile,
		duplicateFileHandler: externalDuplicateHandler,
		selectedWorkspace,
		projects = [],
		workspaces = [],
		isInProject = false,
		externalSearchValue,
		filterMenuItems,
		filterBatchDownloadLayerMenuItems,
		allowDownload,
		allowReadonlySelection = false,
		resolveTopicFileRowDecoration,
		refreshLoading = false,
	},
	ref,
) {
	const { t, i18n } = useTranslation("super")
	const { styles, cx } = useStyles({ isExpanded: true })
	const isMobile = useResponsive().md === false
	// Mobile layouts and no-hover desktop touch layouts must keep file actions reachable.
	const shouldShowInlineFileAction = isMobile || isNoHoverCoarsePointer()
	const fileListAreaRef = useRef<HTMLDivElement>(null)
	const { organizationCode } = useOrganization()
	// 有userId，认为有登录状态
	const hasLogin = Boolean(userStore.user?.userInfo?.user_id)
	const selectionEnabled = shouldEnableTopicFileSelection({
		isSelectMode,
		allowEdit,
		allowDownload,
		hasLogin,
		allowReadonlySelection,
	})
	const isChatProject = isCachedChatWorkspaceProject(selectedProject)
	const canUseDesktopCrossProjectMove = projects.length > 0 && !isChatProject && !isMobile
	const { handleShowInfo, fileInfoPanel } = useFileInfoPanel()
	const downloadProgress = useDownloadProgress()

	// AI 卡片创建弹窗 hook
	const { open: openAICardDialog, dialogElement: aiCardDialogElement } = useAICardCreateDialog({
		projectId,
	})

	const workspaceId = selectedProject?.workspace_id
	useTopicFilesPerfSession({
		attachments,
		projectId,
		selectedProjectId: selectedProject?.id,
	})

	// 创建共享的同名文件处理 handler（单例）
	// 优先使用外部传入的 handler，否则创建内部 handler
	const internalDuplicateHandler = useDuplicateFileHandler({
		attachments: attachments || [],
	})
	const sharedDuplicateHandler = externalDuplicateHandler || internalDuplicateHandler

	// 拖拽上传 hook
	const { handleUploadFiles } = useDragUpload({
		allowUpload: allowEdit,
		projectId,
		selectedProject,
		selectedTopic,
		workspaceId,
		debug: process.env.NODE_ENV === "development",
		attachments,
		duplicateFileHandler: sharedDuplicateHandler,
		onUpdateAttachments,
	})

	// 使用hooks
	const {
		renamingItemId,
		renameValue,
		setRenameValue,
		renameInputRef,
		renameErrorMessage,
		handleStartRename,
		handleRenameConfirm,
		handleRenameKeyDown,
		getItemId,
		isFileRenaming,
		resetRename,
	} = useRename({
		projectId,
		onRenameSuccess: (oldName, newName) => {
			console.log("重命名成功:", oldName, "->", newName)
		},
		onRenameError: (error) => {
			console.error("重命名失败:", error)
		},
		onUpdateAttachments,
		attachments,
		onAttachmentsChange,
	})

	const {
		handleUploadFile,
		handleUploadFolder,
		handleDeleteItem,
		handleDownloadOriginal,
		handleDownloadPdf,
		handleDownloadPpt,
		handleDownloadPptx,
		handleDownloadImage,
		handleOpenFile,
		handleMoveFile,
		shareModalVisible,
		setShareModalVisible,
		shareFileInfo,
		setShareFileInfo,
		handleShareSave,
		exportingFiles,
		createFileAndUpload,
		createFolderAndUpload,
		createDesignProject,
		createSelfMediaProject,
		createAICardProject,
		movingFiles,
		downloadingFolders,
		isFolderDownloading,
		removeFile,
	} = useFileOperations({
		setUserSelectDetail,
		onFileClick,
		attachments,
		selectedTopic,
		projectId,
		// 添加文件创建成功回调
		onFileCreated: (fileItem: any) => {
			console.log("🔵 文件创建成功回调:", fileItem)
			// 如果有 onFileClick 回调，调用它来打开文件Tab
			if (onFileClick) {
				// 等待一小段时间确保文件列表已更新
				setTimeout(() => {
					onFileClick(fileItem)
				}, 100)
			}
		},
		onUpdateAttachments,
		onAttachmentsChange,
		getItemId,
		selectedProject,
		duplicateFileHandler: sharedDuplicateHandler,
		downloadProgress,
	})

	const {
		agreementModal,
		handleDownloadNoWaterMark,
		isFreeTrialVersion,
		preloadWaterMarkFreeModal,
		shouldUseSingleDownloadEntry,
	} = useDownloadImageMenu({
		onDownload: (mode?: DownloadImageMode, item?: AttachmentItem | object) =>
			handleDownloadOriginal(item as AttachmentItem, mode),
	})

	// 文件过滤 hook - 传递外部搜索值
	const { filteredFiles, matchedItemPaths, resetFilter } = useFileFilter({
		attachments,
		fileFilters,
		externalSearchValue,
	})

	// UI 状态 hook - 需要在虚拟文件hooks之前定义，传递搜索相关参数以自动展开父级
	const treeUI = useTreeUI({
		organizationCode,
		projectId,
		enableCache: true,
		searchValue: externalSearchValue,
		matchedItemPaths,
	})
	const {
		hoveredItemRef,
		setHoveredItem,
		contextMenuItemId,
		setContextMenuItemId,
		expandedKeys,
		setExpandedKeys,
		selectedKeys,
		handleSelect: handleTreeSelect,
		resetUI,
		cacheLoaded,
	} = treeUI

	const {
		editingVirtualId: editingVirtualFileId,
		virtualFileName,
		setVirtualFileName,
		errorMessage: fileErrorMessage,
		virtualInputRef: virtualFileInputRef,
		createVirtualFile,
		cancelVirtualFile,
		handleVirtualFileKeyDown,
		mergeVirtualFiles,
		confirmVirtualFile,
		resetVirtualFile,
	} = useVirtualFile({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onFileCreate: createFileAndUpload,
		onAttachmentsChange,
	})

	const {
		editingVirtualId: editingVirtualFolderId,
		virtualFolderName,
		setVirtualFolderName,
		errorMessage: folderErrorMessage,
		virtualInputRef: virtualFolderInputRef,
		createVirtualFolder,
		cancelVirtualFolder,
		handleVirtualFolderKeyDown,
		mergeVirtualFolders,
		confirmVirtualFolder,
		resetVirtualFolder,
	} = useVirtualFolder({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onFolderCreate: createFolderAndUpload,
		onAttachmentsChange,
	})

	const {
		editingVirtualId: editingVirtualDesignProjectId,
		virtualDesignProjectName,
		setVirtualDesignProjectName,
		errorMessage: designProjectErrorMessage,
		virtualInputRef: virtualDesignProjectInputRef,
		createVirtualDesignProject,
		cancelVirtualDesignProject,
		handleVirtualDesignProjectKeyDown,
		mergeVirtualDesignProjects,
		confirmVirtualDesignProject,
		resetVirtualDesignProject,
	} = useVirtualDesignProject({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onDesignProjectCreate: createDesignProject,
		onAttachmentsChange,
	})

	const {
		editingVirtualId: editingVirtualSelfMediaProjectId,
		virtualSelfMediaProjectName,
		setVirtualSelfMediaProjectName,
		errorMessage: selfMediaProjectErrorMessage,
		virtualInputRef: virtualSelfMediaProjectInputRef,
		createVirtualSelfMediaProject,
		cancelVirtualSelfMediaProject,
		handleVirtualSelfMediaProjectKeyDown,
		mergeVirtualSelfMediaProjects,
		confirmVirtualSelfMediaProject,
		resetVirtualSelfMediaProject,
	} = useVirtualSelfMediaProject({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onSelfMediaProjectCreate: createSelfMediaProject,
		onAttachmentsChange,
	})

	const {
		editingVirtualId: editingVirtualAICardProjectId,
		virtualAICardProjectName,
		setVirtualAICardProjectName,
		errorMessage: aiCardProjectErrorMessage,
		virtualInputRef: virtualAICardProjectInputRef,
		createVirtualAICardProject,
		cancelVirtualAICardProject,
		handleVirtualAICardProjectKeyDown,
		mergeVirtualAICardProjects,
		confirmVirtualAICardProject,
		resetVirtualAICardProject,
	} = useVirtualAICardProject({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onAICardProjectCreate: createAICardProject,
		onAttachmentsChange,
	})

	// 合并虚拟文件和虚拟文件夹和虚拟画布项目和虚拟自媒体项目和虚拟AI卡片项目和真实文件
	const mergedFiles = useMemo(() => {
		return measureMergedFilesBuild(filteredFiles.length, () => {
			const withVirtualFiles = mergeVirtualFiles(filteredFiles)
			const withVirtualFolders = mergeVirtualFolders(withVirtualFiles)
			const withVirtualDesignProjects = mergeVirtualDesignProjects(withVirtualFolders)
			const withVirtualSelfMediaProjects =
				mergeVirtualSelfMediaProjects(withVirtualDesignProjects)
			return mergeVirtualAICardProjects(withVirtualSelfMediaProjects)
		})
	}, [
		filteredFiles,
		mergeVirtualFiles,
		mergeVirtualFolders,
		mergeVirtualDesignProjects,
		mergeVirtualSelfMediaProjects,
		mergeVirtualAICardProjects,
	])
	const { treeIndex, expandedKeySet, visibleRows, visibleNodes, visibleNodeIndexByKey } =
		useTopicFilesTreeDerivation({
			attachments,
			mergedFiles,
			expandedKeys,
			externalSearchValue,
			renamingItemId,
			refreshLoading,
			selectedProjectId: selectedProject?.id || projectId,
		})

	// 文件定位 hook
	const { locatingFileId } = useLocateFile({
		treeIndex,
		expandedKeys,
		setExpandedKeys,
		selectedProjectId: selectedProject?.id || projectId,
	})

	// 文件选择 hook (需要先声明，因为 moveFileHook 需要使用 selectedItems)
	const {
		selectedItems,
		setSelectedItems,
		handleItemSelect,
		getFolderSelectionState,
		isItemDisabled,
		resetSelection,
		handleEnterMultiSelectMode,
		isItemSelected,
	} = useFileSelection({
		projectId,
		getItemId,
		treeIndex,
		isSelectMode,
		selectionEnabled,
		onSelectionChange,
		onSelectModeChange,
	})

	// 文件分享 hook
	const {
		handleShareItem: handleShareItemFromHook,
		shareSuccessInfo,
		closeSuccessModal,
		similarSharesInfo,
		closeSimilarSharesDialog,
		handleSelectSimilarShare,
		handleCreateNewShare,
		handleCancelShare,
		handleEditShare,
		setSimilarShares,
	} = useShareFile({
		getItemId,
		selectedItems,
		mergedFiles,
		setShareFileInfo,
		setShareModalVisible,
		selectedProject,
	})

	// 使用移动文件 hook (需要先声明，因为 useDragMove 需要使用它的状态)
	const moveFileHook = useMoveFile({
		projectId,
		attachments,
		attachmentIndex: treeIndex,
		onMoveSuccess: () => {
			onUpdateAttachments?.()
		},
		handleMoveFile,
		selectedItems,
		allFiles: mergedFiles,
		getItemId,
	})

	// 解构移动进度状态
	const { isMoving, moveProgress } = moveFileHook

	const handleCrossProjectOperationSuccess = useCrossProjectMoveCompensation({
		attachments,
		onAttachmentsChange,
		onUpdateAttachments,
	})

	const {
		dragState,
		handleDragStart: handleFileDragStart,
		handleDragEnd: handleFileDragEnd,
		handleDragEnter,
		handleDragLeave,
		handleDragOver,
		handleDrop: handleFileDrop,
		isDropTarget,
		handleTreeNodeDragEnter,
		handleTreeNodeDragLeave,
		handleTreeNodeDragOver,
		handleTreeNodeDrop,
	} = useDragMove({
		allowMove: allowEdit,
		onMoveFiles: async (fileIds: string[], targetFolderId: string | null) => {
			if (fileIds.length === 0) return

			await moveFileHook.batchMoveFilesWithDuplicateCheck({
				fileIds,
				projectId: selectedProject?.id || projectId || "",
				targetParentId: targetFolderId || "",
			})
		},
		debug: process.env.NODE_ENV === "development",
		isMoving: moveFileHook.isMoving, // 传递移动状态
		// 外部文件上传支持
		allowExternalDrop: allowEdit,
		onUploadFiles: handleUploadFiles,
	})

	// 检查是否可以移动到根目录的函数
	const canMoveToRoot = useMemoizedFn(() => {
		// 如果没有在拖拽，或者没有拖拽项，则不允许
		if (!dragState.isDragging || !dragState.draggingItems?.length) {
			return false
		}

		// 检查所有被拖拽的文件是否已经在根目录
		for (const item of dragState.draggingItems) {
			if (isInRootDirectory(item)) {
				return false // 如果有任何文件已经在根目录，则不允许移动到根目录
			}
		}

		return true // 所有文件都不在根目录，允许移动
	})

	// 自动展开文件夹 hook
	const {
		handleDragEnter: handleAutoExpandDragEnter,
		handleDragLeave: handleAutoExpandDragLeave,
	} = useAutoExpandFolder({
		delay: 1000,
		enabled: allowEdit && (dragState.isDragging || dragState.isExternalDrag), // 只在编辑模式且正在拖拽时启用
		debug: process.env.NODE_ENV === "development",
	})

	// 文件列表区域拖拽 hook
	const {
		isDragOverFileListArea,
		handleFileListAreaDragEnter,
		handleFileListAreaDragOver,
		handleFileListAreaDragLeave,
		handleFileListAreaDragEnd,
		handleFileListAreaDrop,
	} = useFileListAreaDrag({
		allowEdit,
		// 传递新的拖拽移动处理器
		handleFileDragEnter: handleDragEnter,
		handleFileDragLeave: handleDragLeave,
		handleFileDragOver: handleDragOver,
		handleFileDrop,
		// 传递检查函数
		canMoveToRoot,
		// 外部文件上传支持
		allowExternalDrop: allowEdit,
		onUploadFiles: handleUploadFiles,
	})

	// 为TreeNode提供的拖拽目标检查函数
	const isDropTargetNode = useMemoizedFn((node: TreeNodeData) => {
		const item = node.item
		if (!item) return false
		return isDropTarget(item)
	})
	const treeNodeDragHandlers = useStableTreeNodeDragHandlers({
		onDragEnter: handleTreeNodeDragEnter,
		onDragLeave: handleTreeNodeDragLeave,
		onDragOver: handleTreeNodeDragOver,
		onDrop: handleTreeNodeDrop,
	})

	// 使用选中文件管理 hook
	const {
		handleAddMultipleFilesToCurrentChat,
		handleAddMultipleFilesToNewChat,
		handleAddToCurrentChat,
		handleAddToNewChat,
		handleDragStart,
	} = useSelectedFilesManager({
		selectedItems,
		mergedFiles,
		getItemId,
		afterAddFileToCurrentTopic,
		afterAddFileToNewTopic,
		selectedWorkspace,
		selectedProject,
	})

	// 确认移动：交由 hook 内部批量处理
	const handleBatchMoveConfirm = useMemoizedFn(
		async ({ path, targetProjectId, targetAttachments, sourceAttachments }) => {
			if (targetProjectId && targetAttachments && sourceAttachments) {
				await crossProjectOperation.executeMoveOperation({
					fileIds: moveFileHook.selectorConfig.pendingMoveFileIds,
					targetProjectId,
					targetPath: path,
					targetAttachments,
					sourceAttachments,
				})
				return
			}

			await moveFileHook.confirmMove({ path })
		},
	)

	// 跨项目文件操作 Hook
	const crossProjectOperation = useCrossProjectFileOperation({
		projectId,
		selectedWorkspace: selectedWorkspace || null,
		selectedProject: selectedProject || null,
		projects,
		onSuccess: handleCrossProjectOperationSuccess,
	})

	// 导入操作 Hook
	const importOperation = useImportFromOtherProject({
		projectId,
		selectedWorkspace: selectedWorkspace || null,
		selectedProject: selectedProject || null,
		workspaces: workspaces || [],
		attachments,
		onSuccess: () => {
			onUpdateAttachments?.()
		},
	})

	const duplicateFileModalProps = getDuplicateFileModalProps({
		externalDuplicateHandler,
		sharedDuplicateHandler,
		moveDuplicateHandler: moveFileHook,
		crossProjectDuplicateHandler: crossProjectOperation,
		importDuplicateHandler: importOperation,
	})
	const noopFolderConflictHandler = () => undefined
	const folderConflictModalProps =
		!externalDuplicateHandler && sharedDuplicateHandler.folderConflictModalVisible
			? {
					visible: true,
					folderName: sharedDuplicateHandler.currentFolderName,
					totalConflicts: sharedDuplicateHandler.totalFolderConflicts,
					canMerge: sharedDuplicateHandler.canMergeFolderConflict,
					onCancel: sharedDuplicateHandler.handleFolderConflictCancel,
					onMerge: sharedDuplicateHandler.handleFolderConflictMerge,
					onKeepBoth: sharedDuplicateHandler.handleFolderConflictKeepBoth,
				}
			: moveFileHook.folderConflictModalVisible
				? {
						visible: true,
						folderName: moveFileHook.currentFolderConflictName,
						totalConflicts: moveFileHook.totalFolderConflicts,
						canMerge: moveFileHook.canMergeFolderConflict,
						onCancel: moveFileHook.handleFolderConflictCancel,
						onMerge: moveFileHook.handleFolderConflictMerge,
						onKeepBoth: moveFileHook.handleFolderConflictKeepBoth,
					}
				: crossProjectOperation.folderConflictModalVisible
					? {
							visible: true,
							folderName: crossProjectOperation.currentFolderConflictName,
							totalConflicts: crossProjectOperation.totalFolderConflicts,
							canMerge: crossProjectOperation.canMergeFolderConflict,
							onCancel: crossProjectOperation.handleFolderConflictCancel,
							onMerge: crossProjectOperation.handleFolderConflictMerge,
							onKeepBoth: crossProjectOperation.handleFolderConflictKeepBoth,
						}
					: importOperation.folderConflictModalVisible
						? {
								visible: true,
								folderName: importOperation.currentFolderConflictName,
								totalConflicts: importOperation.totalFolderConflicts,
								canMerge: importOperation.canMergeFolderConflict,
								onCancel: importOperation.handleFolderConflictCancel,
								onMerge: importOperation.handleFolderConflictMerge,
								onKeepBoth: importOperation.handleFolderConflictKeepBoth,
							}
						: {
								visible: false,
								folderName: "",
								totalConflicts: 0,
								canMerge: false,
								onCancel: noopFolderConflictHandler,
								onMerge: noopFolderConflictHandler,
								onKeepBoth: noopFolderConflictHandler,
							}

	// 创建移动文件处理函数的适配器
	const handleMoveFileAdapter = useMemoizedFn((item: AttachmentItem) => {
		// 桌面端普通项目继续复用现有跨项目 Modal；移动端和 chat 项目统一走目录 Sheet。
		if (canUseDesktopCrossProjectMove) {
			if (item.file_id) {
				// 获取文件的父目录路径
				const parentPath = getParentPathByFileId(item.file_id)
				crossProjectOperation.openMoveModal([item.file_id], parentPath)
			}
		} else {
			// 否则使用原来的 SelectDirectoryModal
			moveFileHook.showMoveSelector(item)
		}
	})

	// 创建复制文件处理函数的适配器
	const handleCopyFileAdapter = useMemoizedFn((fileIds: string[]) => {
		// 获取第一个文件的父目录路径作为默认路径
		const firstFileId = fileIds[0]
		if (firstFileId) {
			const parentPath = getParentPathByFileId(firstFileId)
			crossProjectOperation.openCopyModal(fileIds, parentPath)
		} else {
			crossProjectOperation.openCopyModal(fileIds)
		}
	})

	// 从其他项目导入文件处理函数
	const handleImportFromOtherProject = useMemoizedFn((item?: AttachmentItem) => {
		if (item && item.is_directory && item.file_id) {
			// 如果是文件夹，导入到该文件夹
			const parentPath = getParentPathByFileId(item.file_id)
			const targetPath = [...parentPath, item]
			importOperation.openImportModal(targetPath)
		} else {
			// 如果是空白区域，导入到根目录
			importOperation.openImportModal([])
		}
	})

	// 文件快捷键 hook（需要在 useContextMenu 之前调用）
	const { getShortcutHint } = useFileShortcuts({
		hoveredItemRef,
		contextMenuItemId,
		treeIndex,
		editingVirtualFileId,
		editingVirtualFolderId,
		editingVirtualDesignProjectId,
		renamingItemId,
		handleAddToCurrentChat,
		selectedProjectId: selectedProject?.id || projectId,
		isSelectMode,
		selectedItems,
		handleAddMultipleFilesToCurrentChat,
	})

	const { getMenuItems, getBatchDownloadLayerMenuItems, deleteConfirmNode } = useContextMenu({
		handleUploadFile,
		handleUploadFolder,
		handleImportFromOtherProject,
		handleShareItem: handleShareItemFromHook,
		handleDeleteItem,
		handleDownloadOriginal,
		handleDownloadPdf,
		handleDownloadPpt,
		handleDownloadPptx,
		handleDownloadImage,
		handleOpenFile,
		handleStartRename,
		handleShowInfo,
		handleAddToCurrentChat,
		handleAddToNewChat,
		handleMoveFile: handleMoveFileAdapter,
		handleReplaceFile,
		onCopyFile: handleCopyFileAdapter,
		createVirtualFile,
		createVirtualFolder,
		createVirtualDesignProject,
		createVirtualSelfMediaProject,
		createVirtualAICardProject: (_key?: string, parentPath?: string) => {
			openAICardDialog(parentPath)
		},
		isMoving,
		selectedItems,
		handleAddMultipleFilesToCurrentChat,
		handleAddMultipleFilesToNewChat,
		handleDownloadNoWaterMark,
		preloadWaterMarkFreeModal,
		isFreeTrialVersion,
		shouldUseSingleDownloadEntry,
		getShortcutHint,
		handleEnterMultiSelectMode,
		isSelectMode,
		filterMenuItems,
		filterBatchDownloadLayerMenuItems,
		treeIndex,
		attachments,
	})

	// 重置所有状态的方法
	const resetAllStates = () => {
		resetSelection()
		resetFilter()
		resetUI()
		resetRename()
		resetVirtualFile()
		resetVirtualFolder()
		resetVirtualDesignProject()
		resetVirtualSelfMediaProject()
		resetVirtualAICardProject()
	}

	// 使用 useImperativeHandle 暴露内部方法
	useImperativeHandle(ref, () => ({
		createVirtualFile,
		createVirtualFolder,
		createDesignProject: (parentPath?: string) => {
			// 调用虚拟画布项目创建函数
			createVirtualDesignProject(undefined, parentPath)
			// 返回一个 Promise，在确认创建时 resolve
			return new Promise((resolve) => {
				// 这里我们无法直接等待确认，所以返回一个立即 resolve 的 Promise
				// 实际的创建逻辑在 confirmVirtualDesignProject 中处理
				resolve(null)
			})
		},
		handleUploadFile,
		handleUploadFolder,
		handleImportFromOtherProject,
		openBatchMoveByFileIds: (fileIds: string[]) => {
			moveFileHook.openBatchMoveByFileIds(fileIds)
		},
		resetAllStates,
	}))

	// 选择处理
	const handleSelect = useMemoizedFn((selectedKeys: React.Key[]) => {
		handleTreeSelect(selectedKeys)
		// 处理文件选择逻辑
		if (selectedKeys.length > 0) {
			const item = treeIndex.getItemByKey(selectedKeys[0] as string)
			if (item) {
				handleItemSelect(item)
			}
		}
	})

	const activeFile = activeFileId ? treeIndex.getItemById(activeFileId) : undefined
	const { activeTreeSelectionKey, effectiveSelectedKeys } = useActiveTreeSelection({
		activeFileId,
		treeIndex,
		expandedKeySet,
		selectedKeys,
	})
	const isActiveFileIndexHtml =
		activeFile?.file_name === "index.html" ||
		activeFile?.filename === "index.html" ||
		activeFile?.display_filename === "index.html"

	const { getRowRenderVersion, rowRenderContextVersion } = useTopicFileRowRenderVersion({
		expandedKeySet,
		selection: {
			enabled: selectionEnabled,
			isSelectMode,
			selectedItemsSize: selectedItems.size,
			getFolderSelectionState,
			isItemSelected,
		},
		active: {
			activeFileId,
			isActiveFileIndexHtml,
			locatingFileId,
			contextMenuItemId,
		},
		rename: {
			renamingItemId,
			renameValue,
			renameErrorMessage,
			isFileRenaming,
		},
		virtualEdit: {
			editingVirtualFileId,
			virtualFileName,
			fileErrorMessage,
			editingVirtualFolderId,
			virtualFolderName,
			folderErrorMessage,
			editingVirtualDesignProjectId,
			virtualDesignProjectName,
			designProjectErrorMessage,
		},
		busy: {
			movingFiles,
			exportingFiles,
			downloadingFoldersSize: downloadingFolders.size,
			isFolderDownloading,
		},
		drag: {
			isDragging: dragState.isDragging,
			isExternalDrag: dragState.isExternalDrag,
			draggingItemsCount: dragState.draggingItems?.length || 0,
		},
	})

	// 在树形数据中查找文件的辅助函数
	// 在树形数据中查找文件的辅助函数
	const findFileInTree = useMemoizedFn((fileId: string): AttachmentItem | undefined => {
		return treeIndex.getItemById(fileId)
	})
	const getParentPathByFileId = useMemoizedFn((fileId: string): AttachmentItem[] => {
		return treeIndex.getParentItemsById(fileId)
	})

	const selfMediaNavigation = useSelfMediaTreeNavigation({
		attachments,
		findFileInTree,
		onFileClick,
		setUserSelectDetail,
	})
	const { tryOpenSelfMediaFromPostRootFolder } = selfMediaNavigation

	const { tryOpenAICardFromSubFolder } = useAICardTreeNavigation({
		attachments,
		findFileInTree,
		onFileClick,
		setUserSelectDetail,
	})

	// 检查文件是否在文件夹的直接子项中（只检查一级，不递归）
	const isFileInFolder = useMemoizedFn(
		(folderItem: AttachmentItem, targetFileId: string): boolean => {
			if (!folderItem?.children || folderItem.children.length === 0) {
				return false
			}

			// 只检查直接子项，不递归检查嵌套文件夹
			return folderItem.children.some((child) => child.file_id === targetFileId)
		},
	)

	// 渲染节点标题
	const titleRender = useMemoizedFn((node: TreeNodeData) => {
		const item = node.item || {}
		const itemId = node.key
		const { display_config } = item
		const isActiveFile = activeTreeSelectionKey === String(itemId)
		const hasChildren = !node.isLeaf
		const isExpanded = expandedKeySet.has(String(node.key))

		const showCheckbox = selectionEnabled
		const isSelected = showCheckbox ? isItemSelected(itemId) : false

		// 检查是否正在定位此文件
		const isLocating = locatingFileId === item.file_id

		const indentWidth = node.level * 10
		const decoration =
			resolveTopicFileRowDecoration?.({
				item,
				node,
				isVirtual: !!node.isVirtual,
			}) || undefined
		const renderDecorationTag = () => {
			if (!decoration?.tag) return null
			return <div className={styles.rowTagSlot}>{decoration.tag}</div>
		}

		// 渲染展开/折叠图标
		const renderExpandIcon = () => {
			if (!hasChildren) {
				return (
					<div
						style={{ width: 16, height: 16 }}
						data-testid="file-expand-icon-placeholder"
					/>
				) // 占位符，保持对齐
			}

			return (
				<MagicIcon
					component={isExpanded ? IconChevronDown : IconChevronRight}
					size={16}
					stroke={1.5}
					style={{
						cursor: "pointer",
						color: "rgba(28, 29, 35, 0.6)",
					}}
					data-testid="file-expand-icon"
					onClick={(e: any) => {
						e.stopPropagation()
						const newExpandedKeys = isExpanded
							? expandedKeys.filter((key) => key !== node.key)
							: [...expandedKeys, node.key]
						setExpandedKeys(newExpandedKeys)
					}}
				/>
			)
		}

		// 如果是虚拟项目，使用特殊渲染
		if (node.isVirtual) {
			const isVirtualFolder = item?.is_directory && node.isVirtual
			const isVirtualDesignProject = editingVirtualDesignProjectId === itemId
			const isVirtualSelfMediaProject = editingVirtualSelfMediaProjectId === itemId
			const isVirtualAICardProject = editingVirtualAICardProjectId === itemId
			const isVirtualNormalFolder =
				isVirtualFolder &&
				!isVirtualDesignProject &&
				!isVirtualSelfMediaProject &&
				!isVirtualAICardProject
			const virtualErrorMessage = isVirtualDesignProject
				? designProjectErrorMessage
				: isVirtualSelfMediaProject
					? selfMediaProjectErrorMessage
					: isVirtualAICardProject
						? aiCardProjectErrorMessage
						: isVirtualNormalFolder
							? folderErrorMessage
							: fileErrorMessage
			const showVirtualError = !!virtualErrorMessage

			return (
				<div
					className={cx(
						styles.fileItem,
						contextMenuItemId === itemId && styles.contextMenuActiveItem,
					)}
					data-testid="file-item-virtual"
					onMouseEnter={() => setHoveredItem(itemId)}
					onMouseLeave={() => setHoveredItem(null)}
					draggable={false}
					onDragStart={(e) => {
						handleDragStart(e, item)
					}}
					onDragEnd={(e) => {
						handleAttachmentDragEnd(e)
					}}
				>
					<div
						className={cx(
							styles.fileTitle,
							showVirtualError && styles.fileTitleTopAligned,
						)}
						style={{
							paddingLeft: indentWidth + "px",
							alignItems:
								designProjectErrorMessage || folderErrorMessage || fileErrorMessage
									? "flex-start"
									: undefined,
						}}
					>
						{/* 展开/折叠图标 */}
						<div className={styles.iconWrapper}>{renderExpandIcon()}</div>

						<div className={styles.iconWrapper} data-testid="file-virtual-row-icon">
							{decoration?.icon ? (
								decoration.icon
							) : isVirtualDesignProject ? (
								<MagicFileIcon type="design" size={16} />
							) : isVirtualSelfMediaProject ? (
								<MagicFileIcon type="self-media" size={16} />
							) : isVirtualAICardProject ? (
								<MagicFileIcon type="ai-card" size={16} />
							) : isVirtualNormalFolder ? (
								<img
									src={FoldIcon as unknown as string}
									alt="folder"
									width={16}
									height={16}
									data-testid="file-virtual-folder-icon-image"
								/>
							) : (
								<MagicFileIcon type={item?.file_extension} size={16} />
							)}
						</div>

						{/* 虚拟项目名输入框 */}
						<div className={styles.rowTitleText}>
							<InputWithError
								ref={
									isVirtualDesignProject
										? virtualDesignProjectInputRef
										: isVirtualSelfMediaProject
											? virtualSelfMediaProjectInputRef
											: isVirtualAICardProject
												? virtualAICardProjectInputRef
												: isVirtualNormalFolder
													? virtualFolderInputRef
													: virtualFileInputRef
								}
								data-testid={
									isVirtualDesignProject
										? "design-project-name-input-virtual"
										: isVirtualSelfMediaProject
											? "self-media-project-name-input-virtual"
											: isVirtualAICardProject
												? "ai-card-project-name-input-virtual"
												: isVirtualNormalFolder
													? "folder-name-input-virtual"
													: "file-name-input-virtual"
								}
								value={
									isVirtualDesignProject
										? virtualDesignProjectName
										: isVirtualSelfMediaProject
											? virtualSelfMediaProjectName
											: isVirtualAICardProject
												? virtualAICardProjectName
												: isVirtualNormalFolder
													? virtualFolderName
													: virtualFileName
								}
								onChange={(e: any) => {
									if (isVirtualDesignProject) {
										setVirtualDesignProjectName(e.target.value)
									} else if (isVirtualSelfMediaProject) {
										setVirtualSelfMediaProjectName(e.target.value)
									} else if (isVirtualAICardProject) {
										setVirtualAICardProjectName(e.target.value)
									} else if (isVirtualNormalFolder) {
										setVirtualFolderName(e.target.value)
									} else {
										setVirtualFileName(e.target.value)
									}
								}}
								onFocus={(e) => {
									e.target.scrollIntoView({ behavior: "smooth", block: "center" })
								}}
								onBlur={
									isVirtualDesignProject
										? confirmVirtualDesignProject
										: isVirtualSelfMediaProject
											? confirmVirtualSelfMediaProject
											: isVirtualAICardProject
												? confirmVirtualAICardProject
												: isVirtualNormalFolder
													? confirmVirtualFolder
													: confirmVirtualFile
								}
								onKeyDown={
									isVirtualDesignProject
										? handleVirtualDesignProjectKeyDown
										: isVirtualSelfMediaProject
											? handleVirtualSelfMediaProjectKeyDown
											: isVirtualAICardProject
												? handleVirtualAICardProjectKeyDown
												: isVirtualNormalFolder
													? handleVirtualFolderKeyDown
													: handleVirtualFileKeyDown
								}
								onClick={(e: any) => e.stopPropagation()}
								errorMessage={virtualErrorMessage}
								showError={showVirtualError}
							/>
						</div>
						{renderDecorationTag()}

						{showCheckbox && (
							<div className={styles.iconWrapper}>
								<Checkbox
									data-testid="file-virtual-row-checkbox"
									checked={isSelected}
									onCheckedChange={() => {
										handleItemSelect(item)
									}}
									onClick={(e) => e.stopPropagation()}
								/>
							</div>
						)}
					</div>
				</div>
			)
		}

		// 文件夹渲染
		if (item?.is_directory) {
			const folderSelectionState = showCheckbox ? getFolderSelectionState(item) : "none"
			const isFolderSelected = folderSelectionState === "all"
			const isFolderIndeterminate = folderSelectionState === "partial"

			// 检查是否应该高亮文件夹：
			// 1. 如果打开的文件是 index.html，并且该文件夹有 display_config，且该文件在文件夹的子项中
			// 2. 或者文件夹本身是 activeFileId
			const appEntryResolvedForHighlight =
				display_config?.type === "custom"
					? getAppEntryFile(item?.children || [], display_config)
					: null
			const isActiveCustomEntry =
				display_config?.type === "custom" &&
				activeFileId &&
				appEntryResolvedForHighlight?.file_id === activeFileId
			const shouldHighlightFolder =
				// 情况1：子文件是 index.html（非 custom 入口）
				(isActiveFileIndexHtml &&
					!!display_config?.type &&
					display_config?.type !== "custom" &&
					activeFileId &&
					isFileInFolder(item, activeFileId)) ||
				// 情况1b：custom 类型，当前打开的是 index 解析出的入口文件
				isActiveCustomEntry ||
				// 情况2：文件夹本身是 activeFileId
				(activeFileId === item?.file_id && !!display_config?.type)
			const isFolderBusy =
				isFileRenaming(item) ||
				movingFiles.has(item?.file_id || "") ||
				isFolderDownloading(item)

			const { folderIconPlatform: selfMediaRowPlatform } = attachments?.length
				? { folderIconPlatform: selfMediaNavigation.resolveNodeFolderIconPlatform(item) }
				: { folderIconPlatform: null }

			// 使用 createFileDragHandlers 获取拖拽事件处理器
			const folderDragHandlers = createFileDragHandlers({
				item,
				node,
				allowEdit,
				isExpanded,
				dragState,
				selectedItems,
				handleDragStart,
				handleFileDragStart,
				handleFileDragEnd,
				handleAutoExpandDragEnter,
				handleAutoExpandDragLeave,
				getItemId,
				findFileInTree,
				setExpandedKeys,
			})

			return (
				<div
					className={cx(
						styles.fileItem,
						(shouldHighlightFolder || isActiveFile) && styles.activeFileItemWrapper,
						isActiveFile && "bg-blue-500/10",
						contextMenuItemId === itemId && styles.contextMenuActiveItem,
					)}
					data-testid="folder-item"
					onClick={(e) => {
						e.stopPropagation()
						if (isSelectMode) {
							handleItemSelect(item)
							return
						}

						if (tryOpenSelfMediaFromPostRootFolder(item)) return
						if (tryOpenAICardFromSubFolder(item)) return

						if (isEmpty(item.display_config)) {
							// 普通文件夹，没有 display_config，直接展开/折叠
							const newExpandedKeys = isExpanded
								? expandedKeys.filter((key) => key !== node.key)
								: [...expandedKeys, node.key]
							setExpandedKeys(newExpandedKeys)
						} else {
							// 有 display_config 的文件或文件夹，需要判断是内容类型渲染还是文件预览
							// 1. 先检查是否是内容类型渲染（不依赖文件内容，有自己的 detail render content）
							// 需要将 AttachmentItem 转换为 FileItem 格式
							const fileItem: FileItem = {
								file_id: item.file_id || "",
								file_name: item.name || item.file_name || "",
								display_filename: item.name || item.file_name,
								is_directory: item.is_directory,
								children: item.children as FileItem[] | undefined,
								display_config: item.display_config,
								file_extension: item.file_extension,
								file_size: item.file_size,
							}
							const contentTypeConfig = detectContentTypeRender(fileItem)

							if (contentTypeConfig) {
								// 内容类型渲染：不依赖文件内容，直接渲染对应的 detail render content
								// 打开标签页
								if (onFileClick && item.file_id) {
									onFileClick(item)
								}

								// 设置详情，使用内容类型渲染
								const transformedData = contentTypeConfig.dataTransformer
									? contentTypeConfig.dataTransformer(fileItem)
									: item

								setUserSelectDetail?.({
									type: contentTypeConfig.detailType,
									data: {
										...item,
										...transformedData,
										file_id: item.file_id,
										file_name: item.name || item.file_name,
										display_config: item.display_config,
									},
									currentFileId: item.file_id,
									attachments,
								})
							} else {
								// 文件预览模式（默认）：custom 用 index，其它默认 index.html
								const appEntryFile = getAppEntryFile(
									item?.children || [],
									item.display_config,
								)
								if (appEntryFile) {
									handleOpenFile(appEntryFile)
								} else if (item.display_config?.type === "custom") {
									message.error(t("topicFiles.customMainFileNotFound"))
								} else {
									// 如果没有入口文件，可能是普通文件夹，展开/折叠
									const newExpandedKeys = isExpanded
										? expandedKeys.filter((key) => key !== node.key)
										: [...expandedKeys, node.key]
									setExpandedKeys(newExpandedKeys)
								}
							}
						}
					}}
					draggable={renamingItemId !== itemId}
					{...folderDragHandlers}
					onMouseEnter={() => setHoveredItem(itemId)}
					onMouseLeave={() => setHoveredItem(null)}
					onContextMenu={(e) => delegateProps.onDropdownContextMenuClick?.(e, item)}
				>
					<div
						className={cx(
							styles.fileTitle,
							renamingItemId === itemId &&
								!!renameErrorMessage &&
								styles.fileTitleTopAligned,
						)}
						style={{
							paddingLeft: indentWidth + "px",
							alignItems: renameErrorMessage ? "flex-start" : undefined,
						}}
						data-testid="folder-content"
					>
						{/* 展开/折叠图标 */}
						<div
							className={styles.iconWrapper}
							onClick={(e) => {
								if (!isEmpty(display_config)) {
									e.stopPropagation()
									const newExpandedKeys = isExpanded
										? expandedKeys.filter((key) => key !== node.key)
										: [...expandedKeys, node.key]
									setExpandedKeys(newExpandedKeys)
								}
							}}
							data-testid="folder-expand-trigger"
						>
							{renderExpandIcon()}
						</div>

						<div className={styles.iconWrapper} data-testid="folder-icon">
							{isFileRenaming(item) ? (
								<Loader2 className="mr-1 animate-spin" size={16} />
							) : movingFiles.has(item?.file_id || "") ? (
								<Loader2 className="mr-1 animate-spin" size={16} />
							) : isFolderDownloading(item) ? (
								<Loader2 className="mr-1 animate-spin" size={16} />
							) : decoration?.icon && !isFolderBusy ? (
								decoration.icon
							) : selfMediaRowPlatform && !isFolderBusy ? (
								<SelfMediaPostRowPlatformIcon
									platform={selfMediaRowPlatform}
									size={16}
								/>
							) : !isFolderBusy && isMagicSystemFolder(item) ? (
								<MagicSystemFolderIcon size={16} />
							) : display_config?.type ? (
								["custom", "micro-app"].includes(display_config?.type) &&
								(display_config?.type === "custom" || item?.is_directory) ? (
									<CustomFolderMagicIcon
										displayConfig={item?.display_config}
										childrenItems={getChildrenForCustomMetadataIconPath(
											item,
											(id) => findFileInTree(id),
										)}
										typeFallback={display_config?.type}
										size={16}
									/>
								) : (
									<MagicFileIcon
										type={getAttachmentType(item) || item?.file_extension}
										size={16}
									/>
								)
							) : (
								<img
									src={FoldIcon as unknown as string}
									alt="folder"
									width={16}
									height={16}
									data-testid="folder-icon-image"
								/>
							)}
						</div>

						{/* 文件夹名称或重命名输入框 */}
						<div className={styles.rowTitleText} data-testid="folder-name">
							{renamingItemId === itemId ? (
								<InputWithError
									ref={renameInputRef}
									value={renameValue}
									data-testid="file-name-input-rename"
									onChange={(e: any) => setRenameValue(e.target.value)}
									onBlur={handleRenameConfirm}
									onKeyDown={handleRenameKeyDown}
									className={styles.renameInput}
									onClick={(e: any) => e.stopPropagation()}
									errorMessage={renameErrorMessage}
									showError={!!renameErrorMessage}
									style={{ flex: 1, marginLeft: "4px" }}
								/>
							) : (
								<SmartTooltip
									placement="right"
									className={cx(
										styles.ellipsis,
										(shouldHighlightFolder || isActiveFile) &&
											styles.activeFileItem,
									)}
									sideOffset={20}
								>
									{item?.name}
								</SmartTooltip>
							)}
						</div>
						{renderDecorationTag()}
					</div>

					{/* 更多按钮 */}
					{!showCheckbox &&
						renamingItemId !== itemId &&
						allowEdit &&
						!(filterMenuItems && allowDownload === false) && (
							<MagicIcon
								className={cx(
									styles.attachmentAction,
									"file-item-action",
									(contextMenuItemId === itemId || shouldShowInlineFileAction) &&
										"file-item-action-visible",
								)}
								data-testid="file-more-actions-button"
								onClick={(e: any) => {
									e.stopPropagation()
									delegateProps.onDropdownActionClick?.(e, item)
								}}
								component={IconDots}
								stroke={2}
								size={16}
							/>
						)}

					{/* 文件夹的 Checkbox */}
					{showCheckbox && (
						<div className={styles.iconWrapper}>
							<Checkbox
								data-testid="folder-checkbox"
								checked={isFolderIndeterminate ? "indeterminate" : isFolderSelected}
								disabled={isItemDisabled()}
								onCheckedChange={() => {
									handleItemSelect(item)
								}}
								onClick={(e) => e.stopPropagation()}
							/>
						</div>
					)}
				</div>
			)
		}

		// 文件渲染
		// 使用 createFileDragHandlers 获取拖拽事件处理器
		const fileDragHandlers = createFileDragHandlers({
			item,
			node,
			allowEdit,
			isExpanded,
			dragState,
			selectedItems,
			handleDragStart,
			handleFileDragStart,
			handleFileDragEnd,
			handleAutoExpandDragEnter,
			handleAutoExpandDragLeave,
			getItemId,
			findFileInTree,
			setExpandedKeys,
		})
		const isFileBusy =
			exportingFiles.has(item?.file_id || "") ||
			isFileRenaming(item) ||
			movingFiles.has(item?.file_id || "")
		const imagePreviewSource = resolveProjectFileImagePreviewSource(item)

		return (
			<div
				className={cx(
					styles.fileItem,
					isLocating && styles.locatingFileItem,
					isActiveFile && "bg-blue-500/10",
					contextMenuItemId === itemId && styles.contextMenuActiveItem,
				)}
				data-file-id={item.file_id}
				data-testid="file-item"
				onClick={(e) => {
					e.stopPropagation()
					if (isSelectMode) {
						handleItemSelect(item)
						return
					}

					if (tryOpenSelfMediaFromPostRootFolder(item)) return
					if (tryOpenAICardFromSubFolder(item)) return

					if (renamingItemId !== itemId) {
						// 检查是否是内容类型渲染（不依赖文件内容，有自己的 detail render content）
						if (item.display_config?.type) {
							const fileItem: FileItem = {
								file_id: item.file_id || "",
								file_name: item.file_name || item.name || "",
								display_filename: item.file_name || item.name,
								is_directory: item.is_directory,
								children: item.children as FileItem[] | undefined,
								display_config: item.display_config,
								file_extension: item.file_extension,
								file_size: item.file_size,
							}
							const contentTypeConfig = detectContentTypeRender(fileItem)

							if (contentTypeConfig) {
								// 内容类型渲染：不依赖文件内容，直接渲染对应的 detail render content
								// 打开标签页
								if (onFileClick && item.file_id) {
									onFileClick(item)
								}

								// 设置详情，使用内容类型渲染
								const transformedData = contentTypeConfig.dataTransformer
									? contentTypeConfig.dataTransformer(fileItem)
									: item

								setUserSelectDetail?.({
									type: contentTypeConfig.detailType,
									data: {
										...item,
										...transformedData,
										file_id: item.file_id,
										file_name: item.file_name || item.name,
										display_config: item.display_config,
									},
									currentFileId: item.file_id,
									attachments,
								})
								return
							}
						}

						// 文件预览模式（默认）：基于文件扩展名
						handleOpenFile(item)
					}
				}}
				draggable={renamingItemId !== itemId}
				{...fileDragHandlers}
				onMouseEnter={() => {
					setHoveredItem(itemId)
				}}
				onMouseLeave={() => {
					setHoveredItem(null)
				}}
				onContextMenu={(e) => delegateProps.onDropdownContextMenuClick?.(e, item)}
			>
				<div
					className={cx(
						styles.fileTitle,
						renamingItemId === itemId &&
							!!renameErrorMessage &&
							styles.fileTitleTopAligned,
					)}
					style={{
						paddingLeft: indentWidth + "px",
						alignItems: renameErrorMessage ? "flex-start" : undefined,
					}}
					data-testid="file-content"
				>
					{/* 展开/折叠图标 */}
					<div className={styles.iconWrapper}>{renderExpandIcon()}</div>

					<div className={styles.iconWrapper} data-testid="file-icon">
						{exportingFiles.has(item?.file_id || "") ? (
							<Loader2 className="mr-1 flex-shrink-0 animate-spin" size={16} />
						) : isFileRenaming(item) ? (
							<Loader2 className="mr-1 flex-shrink-0 animate-spin" size={16} />
						) : movingFiles.has(item?.file_id || "") ? (
							<Loader2 className="mr-1 flex-shrink-0 animate-spin" size={16} />
						) : null}
						{decoration?.icon && !isFileBusy ? (
							decoration.icon
						) : item?.display_config?.type === "custom" ||
						  (item?.display_config?.type === "micro-app" && item?.is_directory) ? (
							<CustomFolderMagicIcon
								displayConfig={item?.display_config}
								childrenItems={getChildrenForCustomMetadataIconPath(item, (id) =>
									findFileInTree(id),
								)}
								typeFallback={item?.display_config?.type}
								size={16}
							/>
						) : (
							<ProjectFileImageThumbnailIcon
								item={item}
								size={16}
								fallback={
									<MagicFileIcon
										type={
											getFileTreeIconType(item) ||
											getFileIconType(item) ||
											item?.file_extension
										}
										size={16}
									/>
								}
							/>
						)}
					</div>

					{/* 文件名称或重命名输入框 */}
					<div className={styles.rowTitleText} data-testid="file-name">
						{renamingItemId === itemId ? (
							<InputWithError
								ref={renameInputRef}
								value={renameValue}
								data-testid="file-name-input-rename"
								onChange={(e: any) => setRenameValue(e.target.value)}
								onBlur={handleRenameConfirm}
								onKeyDown={handleRenameKeyDown}
								onClick={(e: any) => e.stopPropagation()}
								errorMessage={renameErrorMessage}
								showError={!!renameErrorMessage}
								style={{
									flex: 1,
									marginLeft: "4px",
								}}
							/>
						) : (
							<>
								{imagePreviewSource ? (
									<ProjectFileImageSmartTooltip
										source={imagePreviewSource}
										className={cx(
											"min-w-0 flex-1",
											styles.ellipsis,
											isActiveFile && "font-medium",
										)}
										sideOffset={20}
									>
										{item?.file_name}
									</ProjectFileImageSmartTooltip>
								) : (
									<SmartTooltip
										placement="right"
										className={cx(
											styles.ellipsis,
											isActiveFile && "font-medium",
										)}
										sideOffset={20}
									>
										{item?.file_name}
									</SmartTooltip>
								)}
							</>
						)}
					</div>
					{renderDecorationTag()}
				</div>

				{/* 更多按钮 */}
				{!showCheckbox &&
					renamingItemId !== itemId &&
					(allowEdit || (filterMenuItems && allowDownload !== false)) && (
						<MagicIcon
							className={cx(
								styles.attachmentAction,
								"file-item-action",
								(contextMenuItemId === itemId || shouldShowInlineFileAction) &&
									"file-item-action-visible",
							)}
							data-testid="file-more-actions-button"
							onClick={(e: any) => {
								e.stopPropagation()
								delegateProps.onDropdownActionClick?.(e, item)
							}}
							component={IconDots}
							stroke={2}
							size={16}
						/>
					)}

				{/* 文件的 Checkbox */}
				{showCheckbox && (
					<div className={styles.iconWrapper}>
						<Checkbox
							data-testid="file-checkbox"
							checked={isSelected}
							disabled={isItemDisabled()}
							onCheckedChange={() => {
								handleItemSelect(item)
							}}
							onClick={(e) => e.stopPropagation()}
						/>
					</div>
				)}
			</div>
		)
	})
	const {
		batchLoading,
		showBatchDownload,
		batchMenuItems,
		deleteConfirmNode: batchDeleteConfirmNode,
	} = useBatchDownload({
		projectId,
		getItemId,
		selectedItems,
		setSelectedItems,
		filteredFiles: mergedFiles,
		onSelectModeChange,
		// 批量移动和复制所需的依赖
		attachments,
		getParentPathByFileId,
		selectedWorkspace,
		selectedProject,
		projects,
		crossProjectOperation,
		moveFileHook,
		onUpdateAttachments,
		removeFile,
		isMoving,
		allowEdit,
		allowDownload,
		downloadProgress,
		// 批量分享回调
		onBatchShareClick: async (fileIds: string[]) => {
			if (fileIds.length > 0) {
				// 检查是否存在相似分享
				try {
					const similarShares = await SuperMagicApi.findSimilarShares({
						file_ids: fileIds,
					})

					if (similarShares && similarShares.length > 0) {
						// 显示相似分享选择弹窗
						setSimilarShares(similarShares, fileIds)
						return
					}
				} catch (error) {
					console.error("Check similar shares failed:", error)
				}

				// 无相似分享，直接打开分享弹窗
				setShareFileInfo({
					projectName: selectedProject?.project_name,
					fileIds,
				})
				setShareModalVisible(true)
			}
		},
		isInProject,
	})
	const showMobileBatchActions = shouldShowMobileBatchActions({
		isMobile,
		isSelectMode,
		hasSelection: showBatchDownload,
	})
	const handleCancelMobileBatchSelection = useMemoizedFn(() => {
		resetSelection()
		onSelectModeChange?.(false)
	})

	// 配置右键菜单 - 根据选中状态和语言动态调整宽度
	const { dropdownContent, delegateProps } = useSuperMagicDropdown<AttachmentItem>({
		width: i18n.language.startsWith("en") ? 240 : 220,
		getMenuItems,
		fixedWidth: true, // 跳过 DOM 测量，强制使用配置的 width
		mobileProps: {
			title: t("super:shortcut.fileOperations"),
		},
		onOpenChange: (open, itemData) => {
			// 右键菜单打开时，记录当前文件ID以保持 hover 样式
			// 关闭时清空
			setContextMenuItemId(open && itemData ? getItemId(itemData) : null)
		},
	})

	// 配置批量下载层右键菜单
	const {
		dropdownContent: batchDownloadDropdownContent,
		delegateProps: fileListAreaDelegateProps,
	} = useSuperMagicDropdown<null>({
		width: 180,
		getMenuItems: getBatchDownloadLayerMenuItems,
		mobileProps: {
			title: t("super:topicFiles.batchOperation"),
		},
	})
	const handleFileListScroll = useMemoizedFn(() => {
		markProjectFileListScrollActivity()
	})
	const imagePreviewManager = useProjectFileImagePreviewManager({ attachments })
	const handleMountedTreeRowsChange = useMemoizedFn((rows: Array<{ node: TreeNodeData }>) => {
		imagePreviewManager.setMountedItems(rows.map((row) => row.node.item))
	})

	return (
		<ProjectFileImagePreviewProvider manager={imagePreviewManager}>
			<div
				className={cx(className, "flex h-[calc(100%-32px)] overflow-auto flex-col")}
				data-testid="topic-files-core"
			>
				{/* 右键菜单内容 */}
				{(allowEdit || filterMenuItems) && dropdownContent}
				{allowEdit && batchDownloadDropdownContent}
				{fileInfoPanel}
				{deleteConfirmNode}
				{batchDeleteConfirmNode}
				{/* Content area */}
				{/* <div className={styles.contentArea}> */}
				{/* File tree */}
				<div
					ref={fileListAreaRef}
					className={cx(styles.fileListArea, "px-2 pb-2", {
						[styles.dragTargetFolder]:
							isDragOverFileListArea || dragState.isDragOverRoot, // 添加拖拽悬停样式
					})}
					onScroll={handleFileListScroll}
					onContextMenu={(e) =>
						fileListAreaDelegateProps.onDropdownContextMenuClick?.(e, null)
					}
					onDragEnter={handleFileListAreaDragEnter}
					onDragOver={handleFileListAreaDragOver}
					onDragLeave={handleFileListAreaDragLeave}
					onDragEnd={handleFileListAreaDragEnd}
					onDrop={handleFileListAreaDrop}
					data-testid="topic-files-list-area"
				>
					{visibleRows.length > 0 ? (
						<CustomTree
							visibleRows={visibleRows}
							visibleNodes={visibleNodes}
							visibleNodeIndexByKey={visibleNodeIndexByKey}
							// draggable={
							// 	allowEdit
							// 		? {
							// 				icon: false,
							// 		  }
							// 		: false
							// }
							onSelect={handleSelect}
							expandedKeys={expandedKeys}
							selectedKeys={effectiveSelectedKeys}
							titleRender={titleRender}
							getRowRenderVersion={getRowRenderVersion}
							rowRenderContextVersion={rowRenderContextVersion}
							showIcon={false}
							blockNode
							scrollElementRef={fileListAreaRef}
							scrollToKey={locatingFileId}
							isMobile={isMobile}
							onMountedRowsChange={handleMountedTreeRowsChange}
							// height={treeHeight}
							dragTargetNodeClass={styles.dragTargetFolder}
							dragTargetKey={dragState.dropTargetFolderId}
							isDragTargetNode={isDropTargetNode}
							{...treeNodeDragHandlers}
						/>
					) : refreshLoading ? (
						<div
							className="flex h-full w-full items-center justify-center"
							data-testid="topic-files-list-loading"
						>
							<div className="flex flex-col items-center gap-3">
								<Loader2 size={20} className="animate-spin text-muted-foreground" />
								<p className="text-sm text-muted-foreground">
									{t("topicFiles.loadingFiles")}
								</p>
							</div>
						</div>
					) : (
						<EmptyState
							onAddFile={createVirtualFile}
							onAddDesign={createVirtualDesignProject}
							onUploadFile={() => handleUploadFile()}
							allowEdit={allowEdit}
						/>
					)}
				</div>
				{/* </div> */}
				{/* Batch download layer */}
				<div
					className={cx(styles.batchDownloadLayer, {
						[styles.hidden]:
							(!isMobile && !showBatchDownload) ||
							(isMobile && attachments.length <= 0),
						[styles.pcBatchDownloadLayer]: !isMobile,
					})}
				>
					{!isMobile && showBatchDownload && (
						<Flex className={styles.batchOperations}>
							<MagicDropdown
								menu={{ items: batchMenuItems, style: { width: "100%" } }}
								placement="topLeft"
								trigger={["click"]}
							>
								<div style={{ width: "100%" }}>
									<Button
										className={styles.batchDownloadButtonPC}
										data-testid="batch-operations-button"
										disabled={batchLoading}
										style={{ flex: 1, width: "100%" }}
									>
										<Flex align="center" gap={2} justify="center">
											{batchLoading ? (
												<Loader2 className="mr-1 animate-spin" size={16} />
											) : null}
											<span className={styles.batchDownloadButtonPCText}>
												{t("topicFiles.batchOperations")}
											</span>
											<IconChevronDown size={16} stroke={1.5} color="#fff" />
										</Flex>
									</Button>
								</div>
							</MagicDropdown>
						</Flex>
					)}
					{showMobileBatchActions && (
						<Button
							variant="secondary"
							className="h-9 px-8 py-2 text-sm font-medium shadow-xs"
							data-testid="mobile-cancel-select-button"
							onClick={handleCancelMobileBatchSelection}
						>
							{t("topicFiles.cancelSelect")}
						</Button>
					)}
					{showMobileBatchActions && (
						<MagicDropdown
							menu={{ items: batchMenuItems }}
							placement="topLeft"
							trigger={["click"]}
							disabled={!showBatchDownload || batchLoading}
						>
							<Button
								variant="default"
								className="h-9 w-[253px] gap-2 px-4 py-2 text-sm font-medium shadow-xs"
								data-testid="mobile-batch-operations-button"
								disabled={!showBatchDownload || batchLoading}
							>
								{batchLoading ? (
									<Loader2 className="animate-spin" size={16} />
								) : null}
								<span>{t("topicFiles.batchOperation")}</span>
								<ChevronDown size={16} />
							</Button>
						</MagicDropdown>
					)}
					{/* {isMobile && attachments.length > 0 && hasLogin && (
					<>
						<div className={styles.batchDownloadSeparator} />
						<button
							className={styles.batchDownloadButton}
							onClick={handleDownloadAll}
							type="button"
							disabled={allLoading}
						>
							{allLoading ? (
								<Loader2 className="mr-1 animate-spin" size={16} />
							) : null}
							<IconFolderDown size={20} stroke={1.5} color="rgba(28, 29, 35, 0.8)" />
							<span>{t("topicFiles.downloadAllTitle")}</span>
						</button>
					</>
				)} */}
				</div>
				{/* 文件分享模态框 */}
				{isMobile ? (
					<ProjectShareSheet
						open={
							Boolean(shareFileInfo && shareModalVisible) || Boolean(shareSuccessInfo)
						}
						onClose={() => {
							setShareModalVisible(false)
							setShareFileInfo(null)
							closeSuccessModal()
						}}
						mode="file"
						attachments={attachments}
						attachmentList={attachments}
						projectName={shareFileInfo?.projectName || selectedProject?.project_name}
						projectId={projectId}
						defaultSelectedFileIds={
							shareFileInfo?.fileIds || shareSuccessInfo?.shareInfo?.file_ids
						}
						defaultOpenFileId={shareFileInfo?.defaultOpenFileId}
						initialSelectedShare={shareSuccessInfo?.shareInfo || null}
					/>
				) : (
					<>
						{shareFileInfo && (
							<ShareModal
								open={shareModalVisible}
								onCancel={() => {
									setShareModalVisible(false)
									setShareFileInfo(null)
								}}
								shareMode={ShareMode.File}
								types={[
									ShareType.PasswordProtected,
									ShareType.Public,
									ShareType.Organization,
								]}
								attachments={attachments}
								resourceId={
									shareFileInfo.resourceId ||
									shareSuccessInfo?.shareInfo?.resource_id
								}
								defaultSelectedFileIds={shareFileInfo.fileIds}
								projectName={shareFileInfo.projectName}
								projectId={projectId}
							/>
						)}
						{/* 文件分享成功Modal - 用于已存在的分享 */}
						{shareSuccessInfo && (
							<ShareSuccessModal
								open={true}
								onClose={closeSuccessModal}
								onCancelShare={handleCancelShare}
								onEditShare={handleEditShare}
								shareName={shareSuccessInfo.shareInfo.resource_name || ""}
								projectName={shareSuccessInfo.shareInfo.project_name}
								fileCount={shareSuccessInfo.shareInfo?.extend?.file_count || 1}
								mainFileName={
									shareSuccessInfo.shareInfo.main_file_name || t("share.untitled")
								}
								shareUrl={generateShareUrl(
									shareSuccessInfo.shareInfo.resource_id,
									shareSuccessInfo.shareInfo.password,
									"files",
								)}
								password={shareSuccessInfo.shareInfo.password}
								expire_at={shareSuccessInfo.shareInfo.expire_at}
								shareType={shareSuccessInfo.shareInfo.share_type}
								shareProject={shareSuccessInfo.shareInfo.share_project}
								fileIds={shareSuccessInfo.shareInfo.file_ids}
								createdAt={shareSuccessInfo.shareInfo.created_at}
								updatedAt={shareSuccessInfo.shareInfo.updated_at}
								viewCount={shareSuccessInfo.shareInfo.view_count}
							/>
						)}
					</>
				)}
				{/* 相似分享Dialog/Drawer */}
				{similarSharesInfo &&
					(isMobile ? (
						<SimilarSharesDrawer
							open={true}
							onClose={closeSimilarSharesDialog}
							shares={similarSharesInfo.similarShares}
							onSelectShare={handleSelectSimilarShare}
							onCreateNew={handleCreateNewShare}
						/>
					) : (
						<SimilarSharesDialog
							open={true}
							onClose={closeSimilarSharesDialog}
							shares={similarSharesInfo.similarShares}
							onSelectShare={handleSelectSimilarShare}
							onCreateNew={handleCreateNewShare}
						/>
					))}
				{/* 移动文件选择器 */}
				{
					<SelectDirectoryModal
						{...{
							...moveFileHook.selectorConfig,
							visible: moveFileHook.selectorConfig.visible,
							mobileCrossProjectConfig:
								isMobile && selectedProject
									? {
											currentProject: selectedProject,
											currentWorkspace: selectedWorkspace,
											sourceAttachments: attachments,
											isChatProject,
										}
									: undefined,
							onSubmit: handleBatchMoveConfirm,
						}}
					/>
				}
				<CrossProjectFileOperationModal
					visible={crossProjectOperation.visible}
					title={
						crossProjectOperation.operationType === "move"
							? t("topicFiles.contextMenu.moveTo")
							: t("topicFiles.contextMenu.copyTo")
					}
					operationType={crossProjectOperation.operationType}
					selectedWorkspace={selectedWorkspace}
					selectedProject={selectedProject}
					workspaces={workspaces}
					fileIds={crossProjectOperation.fileIds}
					sourceAttachments={attachments}
					initialPath={crossProjectOperation.initialPath}
					onClose={crossProjectOperation.closeModal}
					onSubmit={
						crossProjectOperation.operationType === "move"
							? crossProjectOperation.executeMoveOperation
							: crossProjectOperation.executeCopyOperation
					}
				/>
				{/* 从其他项目导入 Modal */}
				{workspaces && projectId && (
					<ImportFromOtherProjectModal
						visible={importOperation.visible}
						workspaces={workspaces}
						currentProjectId={projectId}
						currentProject={selectedProject || null}
						targetPath={importOperation.targetPath}
						targetAttachments={attachments}
						onClose={importOperation.closeModal}
						onSubmit={importOperation.executeImportOperation}
					/>
				)}
				{/* Duplicate file modal */}
				<FolderConflictModal {...folderConflictModalProps} />
				<DuplicateFileModal {...duplicateFileModalProps} />
				{/* 移动/复制进度提示 - 使用 Portal 渲染到 body */}
				{createPortal(
					<MagicProgressToast
						visible={
							isMoving ||
							crossProjectOperation.isOperating ||
							importOperation.isOperating
						}
						progress={
							crossProjectOperation.isOperating
								? crossProjectOperation.operationProgress
								: importOperation.isOperating
									? importOperation.operationProgress
									: moveProgress
						}
						text={
							crossProjectOperation.isOperating &&
							crossProjectOperation.operationType === "copy"
								? t("topicFiles.copying")
								: importOperation.isOperating
									? t("topicFiles.copying")
									: t("topicFiles.moving")
						}
						position="top"
						width={280}
						showPercentage={true}
						progressHeight={4}
						zIndex={99999}
					/>,
					document.body,
				)}
				{/* 下载无水印图片协议弹窗 */}
				{agreementModal}
				{/* AI 卡片创建弹窗 */}
				{aiCardDialogElement}
			</div>
		</ProjectFileImagePreviewProvider>
	)
})

export default TopicFilesCore
