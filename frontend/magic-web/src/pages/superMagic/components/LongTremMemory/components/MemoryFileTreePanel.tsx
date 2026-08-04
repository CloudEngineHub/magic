import { Download, FilePlus2, FolderPlus, Pencil, Trash2 } from "lucide-react"
import { IconChevronDown, IconChevronRight, IconDots } from "@tabler/icons-react"
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import MagicIcon from "@/components/base/MagicIcon"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import SmartTooltip from "@/components/other/SmartTooltip"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { Input } from "@/components/shadcn-ui/input"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import CustomTree from "../../TopicFilesButton/components/CustomTree/CustomTree"
import InputWithError from "../../TopicFilesButton/components/InputWithError"
import NormalModeHeader from "../../TopicFilesButton/components/NormalModeHeader"
import SearchModeHeader from "../../TopicFilesButton/components/SearchModeHeader"
import type { PresetFileType } from "../../TopicFilesButton/constant"
import { useVirtualFile } from "../../TopicFilesButton/hooks/useVirtualFile"
import { useVirtualFolder } from "../../TopicFilesButton/hooks/useVirtualFolder"
import { useVisibleTreeRows } from "../../TopicFilesButton/hooks/useVisibleTreeRows"
import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import { useStyles as useTopicFilesStyles } from "../../TopicFilesButton/style"
import type { TreeNodeData } from "../../TopicFilesButton/utils/treeDataConverter"
import { memoryFileService, MEMORY_SCOPE } from "../services/memoryFileService"
import { MemoryTreeNodeIcon } from "./MemoryTreeNodeIcon"
import { buildMemoryTreeNodePathIndex, getMemoryTreeNodeName } from "./memoryTreeNodeUtils"

interface MemoryNodeDialogState {
	item: AttachmentItem
}

interface MemoryFileTreePanelProps {
	projectId?: string | null
	activeFileId?: string | null
	onFileClick?: (fileItem: AttachmentItem) => void
	showTitle?: boolean
}

const MEMORY_FILE_TYPE_OPTIONS: Array<{
	type: PresetFileType
	labelKey: string
	separatorBefore?: boolean
}> = [
	{ type: "txt", labelKey: "topicFiles.contextMenu.createSubMenu.txtFile" },
	{ type: "md", labelKey: "topicFiles.contextMenu.createSubMenu.mdFile" },
	{
		type: "html",
		labelKey: "topicFiles.contextMenu.createSubMenu.htmlFile",
		separatorBefore: true,
	},
	{ type: "py", labelKey: "topicFiles.contextMenu.createSubMenu.pythonFile" },
	{ type: "go", labelKey: "topicFiles.contextMenu.createSubMenu.goFile" },
	{ type: "php", labelKey: "topicFiles.contextMenu.createSubMenu.phpFile" },
	{
		type: "customFile",
		labelKey: "topicFiles.contextMenu.createSubMenu.customFile",
		separatorBefore: true,
	},
]

/** 获取附件节点的稳定文件编号。 */
function getMemoryItemId(item?: AttachmentItem | null): string {
	return String(item?.file_id || "")
}

/** 将用户记忆文件声明为独立预览文件，避免参与当前项目附件树同步。 */
function createMemoryPreviewItem(item: AttachmentItem): AttachmentItem {
	return {
		...item,
		display_config: {
			...(item.display_config || {}),
			previewPolicy: {
				...(item.display_config?.previewPolicy || {}),
				standalone: true,
				editingPresence: false,
				allowShare: false,
				syncWithAttachments: false,
				persistTab: false,
				restoreAsActive: false,
			},
		},
	}
}

/** 根据搜索词过滤文件树，并保留命中节点的祖先目录。 */
function filterMemoryTree(items: AttachmentItem[], keyword: string): AttachmentItem[] {
	const normalizedKeyword = keyword.trim().toLowerCase()
	if (!normalizedKeyword) return items

	return items.flatMap((item) => {
		const children = item.children ? filterMemoryTree(item.children, normalizedKeyword) : []
		const matches = getMemoryTreeNodeName(item).toLowerCase().includes(normalizedKeyword)
		if (!matches && children.length === 0) return []

		return [
			{
				...item,
				...(item.is_directory ? { children } : {}),
			},
		]
	})
}

/** 收集目录节点编号，用于搜索时自动展开命中的目录链。 */
function collectDirectoryIds(items: AttachmentItem[]): string[] {
	const directoryIds: string[] = []
	const visit = (nodes: AttachmentItem[]) => {
		nodes.forEach((item) => {
			if (!item.is_directory) return
			const itemId = getMemoryItemId(item)
			if (itemId) directoryIds.push(itemId)
			if (item.children?.length) visit(item.children)
		})
	}
	visit(items)
	return directoryIds
}

/** 在记忆树中按文件编号查找节点。 */
function findMemoryItemById(items: AttachmentItem[], fileId: string): AttachmentItem | null {
	for (const item of items) {
		if (getMemoryItemId(item) === fileId) return item
		if (item.children?.length) {
			const child = findMemoryItemById(item.children, fileId)
			if (child) return child
		}
	}

	return null
}

/** 项目侧文件记忆树。 */
export const MemoryFileTreePanel = memo(function MemoryFileTreePanel({
	projectId,
	activeFileId,
	onFileClick,
	showTitle = true,
}: MemoryFileTreePanelProps) {
	const { t } = useTranslation("super/longMemory")
	const { t: tSuper } = useTranslation("super")
	const { styles, cx } = useTopicFilesStyles()
	const isMobile = useIsMobile()
	const scrollRef = useRef<HTMLDivElement>(null)
	const [attachments, setAttachments] = useState<AttachmentItem[]>([])
	const [loading, setLoading] = useState(false)
	const [loadError, setLoadError] = useState(false)
	const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
	const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
	const [isSearchMode, setIsSearchMode] = useState(false)
	const [searchValue, setSearchValue] = useState("")
	const [dialogState, setDialogState] = useState<MemoryNodeDialogState | null>(null)
	const [dialogName, setDialogName] = useState("")
	const [submitting, setSubmitting] = useState(false)
	const creatingParentIdRef = useRef("")

	/** 重新加载当前用户的完整记忆文件树。 */
	const refreshMemoryFiles = useCallback(
		async (signal?: AbortSignal) => {
			if (!projectId) return

			setLoading(true)
			setLoadError(false)
			try {
				const result = await loadProjectAttachments({
					projectId,
					scope: MEMORY_SCOPE,
					temporaryToken: null,
					signal,
					onBatchSnapshot: (snapshot) => {
						setAttachments(snapshot.tree)
					},
				})
				setAttachments(result.tree)
				const rootId = getMemoryItemId(result.tree[0])
				if (rootId) {
					setExpandedKeys((current) =>
						current.includes(rootId) ? current : [...current, rootId],
					)
				}
			} catch (error) {
				if ((error as { name?: string })?.name === "AbortError") return
				console.error("加载记忆文件树失败", error)
				setLoadError(true)
			} finally {
				if (!signal?.aborted) setLoading(false)
			}
		},
		[projectId],
	)

	useEffect(() => {
		const controller = new AbortController()
		void refreshMemoryFiles(controller.signal)
		return () => controller.abort()
	}, [refreshMemoryFiles])

	const rootId = getMemoryItemId(attachments[0])
	const memoryNodePathIndex = useMemo(
		() => buildMemoryTreeNodePathIndex(attachments),
		[attachments],
	)

	/** 创建记忆文件，并按项目文件类型初始化默认正文。 */
	const createMemoryFile = useCallback(
		async (file: File) => {
			const parentId = creatingParentIdRef.current
			if (!parentId) throw new Error("Memory file parent is missing")

			const createdFile = await memoryFileService.createNode({
				name: file.name,
				parentId,
				isDirectory: false,
			})
			const content = await file.text()
			if (content && Number.isFinite(createdFile.version)) {
				try {
					await memoryFileService.saveFileContent(
						createdFile.id,
						content,
						createdFile.version,
					)
				} catch (error) {
					console.error("初始化记忆文件正文失败", error)
				}
			}
			await refreshMemoryFiles()
			return createdFile
		},
		[refreshMemoryFiles],
	)

	/** 创建记忆目录，并刷新完整文件树。 */
	const createMemoryFolder = useCallback(
		async (folderName: string) => {
			const parentId = creatingParentIdRef.current
			if (!parentId) throw new Error("Memory folder parent is missing")

			const createdFolder = await memoryFileService.createNode({
				name: folderName,
				parentId,
				isDirectory: true,
			})
			await refreshMemoryFiles()
			return createdFolder
		},
		[refreshMemoryFiles],
	)

	const {
		editingVirtualId: editingVirtualFileId,
		virtualFileName,
		setVirtualFileName,
		errorMessage: virtualFileErrorMessage,
		virtualInputRef: virtualFileInputRef,
		createVirtualFile,
		confirmVirtualFile,
		handleVirtualFileKeyDown,
		mergeVirtualFiles,
		resetVirtualFile,
	} = useVirtualFile({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onFileCreate: createMemoryFile,
	})
	const {
		editingVirtualId: editingVirtualFolderId,
		virtualFolderName,
		setVirtualFolderName,
		errorMessage: virtualFolderErrorMessage,
		virtualInputRef: virtualFolderInputRef,
		createVirtualFolder,
		confirmVirtualFolder,
		handleVirtualFolderKeyDown,
		mergeVirtualFolders,
		resetVirtualFolder,
	} = useVirtualFolder({
		attachments,
		setExpandedKeys,
		expandedKeys,
		onFolderCreate: createMemoryFolder,
	})

	const attachmentsWithVirtualNodes = mergeVirtualFiles(mergeVirtualFolders(attachments))
	const filteredAttachments = filterMemoryTree(attachmentsWithVirtualNodes, searchValue)
	const effectiveExpandedKeys = searchValue.trim()
		? collectDirectoryIds(filteredAttachments)
		: expandedKeys
	const { expandedKeySet, visibleRows, visibleNodes, visibleNodeIndexByKey } = useVisibleTreeRows(
		{
			expandedKeys: effectiveExpandedKeys,
			attachmentTree: filteredAttachments,
		},
	)
	const selectedItem = useMemo(() => {
		const selectedId = String(selectedKeys[0] || "")
		return visibleNodes.find((node) => String(node.key) === selectedId)?.item
	}, [selectedKeys, visibleNodes])
	const defaultParentId = selectedItem?.is_directory
		? getMemoryItemId(selectedItem)
		: String(selectedItem?.parent_id || rootId)

	/** 获取虚拟节点需要的父目录路径。 */
	const getCreationParentPath = useCallback(
		(parentId: string): string | undefined => {
			const parentItem = findMemoryItemById(attachments, parentId)
			if (parentItem?.relative_file_path) return parentItem.relative_file_path

			const pathSegments = memoryNodePathIndex.get(parentId)
			return pathSegments?.length ? `/${pathSegments.join("/")}` : undefined
		},
		[attachments, memoryNodePathIndex],
	)

	/** 在目标目录中开始树内新建文件。 */
	const beginCreateFile = useCallback(
		(type: PresetFileType, parentId: string = defaultParentId) => {
			if (!parentId) return

			setIsSearchMode(false)
			setSearchValue("")
			resetVirtualFolder()
			creatingParentIdRef.current = parentId
			createVirtualFile(type, parentId, getCreationParentPath(parentId))
		},
		[createVirtualFile, defaultParentId, getCreationParentPath, resetVirtualFolder],
	)

	/** 在目标目录中开始树内新建目录。 */
	const beginCreateFolder = useCallback(
		(parentId: string = defaultParentId) => {
			if (!parentId) return

			setIsSearchMode(false)
			setSearchValue("")
			resetVirtualFile()
			creatingParentIdRef.current = parentId
			createVirtualFolder(parentId, getCreationParentPath(parentId))
		},
		[createVirtualFolder, defaultParentId, getCreationParentPath, resetVirtualFile],
	)

	/** 打开记忆节点重命名弹窗。 */
	const openRenameDialog = useCallback((item: AttachmentItem) => {
		setDialogState({ item })
		setDialogName(getMemoryTreeNodeName(item))
	}, [])

	/** 关闭节点编辑弹窗并清理临时状态。 */
	const closeNodeDialog = useCallback(() => {
		if (submitting) return
		setDialogState(null)
		setDialogName("")
	}, [submitting])

	/** 提交记忆节点重命名操作。 */
	const submitNodeDialog = useCallback(async () => {
		if (!dialogState) return
		const targetName = dialogName.trim()
		if (!targetName) return

		setSubmitting(true)
		try {
			const fileId = getMemoryItemId(dialogState.item)
			if (!fileId) return
			await memoryFileService.renameNode(fileId, targetName)
			magicToast.success(t("fileTree.renameSuccess"))

			setDialogState(null)
			setDialogName("")
			await refreshMemoryFiles()
		} catch (error) {
			console.error("操作记忆文件失败", error)
		} finally {
			setSubmitting(false)
		}
	}, [dialogName, dialogState, refreshMemoryFiles, t])

	/** 删除指定记忆节点。 */
	const confirmDeleteNode = useCallback(
		(item: AttachmentItem) => {
			const fileId = getMemoryItemId(item)
			if (!fileId || fileId === rootId) return

			MagicModal.confirm({
				title: t("fileTree.deleteConfirmTitle"),
				content: t("fileTree.deleteConfirmContent", { name: getMemoryTreeNodeName(item) }),
				okText: t("confirm"),
				cancelText: t("cancel"),
				variant: "destructive",
				onOk: async () => {
					await memoryFileService.deleteNode(fileId)
					magicToast.success(t("deleteSuccess"))
					await refreshMemoryFiles()
				},
			})
		},
		[refreshMemoryFiles, rootId, t],
	)

	/** 响应文件树节点选中事件。 */
	const handleSelect = useCallback(
		(keys: React.Key[], info: { node: TreeNodeData }) => {
			setSelectedKeys(keys)
			const item = info.node.item
			if (item.is_directory) {
				const itemId = getMemoryItemId(item)
				setExpandedKeys((current) =>
					current.includes(itemId)
						? current.filter((key) => String(key) !== itemId)
						: [...current, itemId],
				)
				return
			}

			onFileClick?.(createMemoryPreviewItem(item))
		},
		[onFileClick],
	)

	/** 下载指定记忆文件并处理浏览器侧失败。 */
	const handleDownloadFile = useCallback(
		async (fileId: string, fileName: string) => {
			try {
				await memoryFileService.downloadFile(fileId, fileName)
			} catch (error) {
				console.error("下载记忆文件失败", error)
				magicToast.error(t("fileTree.downloadFailed"))
			}
		},
		[t],
	)

	/** 渲染单个记忆文件树节点。 */
	const renderNodeTitle = useCallback(
		(node: TreeNodeData) => {
			const item = node.item
			const itemId = getMemoryItemId(item)
			const itemName = getMemoryTreeNodeName(item)
			const isDirectory = Boolean(item.is_directory)
			const isVirtualFile = itemId === editingVirtualFileId
			const isVirtualFolder = itemId === editingVirtualFolderId
			const isVirtualNode = isVirtualFile || isVirtualFolder
			const virtualErrorMessage = isVirtualFolder
				? virtualFolderErrorMessage
				: virtualFileErrorMessage
			const hasChildren = Boolean(item.children?.length)
			const isExpanded = expandedKeySet.has(itemId)
			const isRoot = itemId === rootId
			const isActiveFile = activeFileId === itemId
			const showVirtualError = isVirtualNode && Boolean(virtualErrorMessage)

			if (isVirtualNode) {
				return (
					<div
						className={styles.fileItem}
						data-testid="file-item-virtual"
						draggable={false}
					>
						<div
							className={cx(
								styles.fileTitle,
								showVirtualError && styles.fileTitleTopAligned,
							)}
							style={{ paddingLeft: node.level * 10 }}
						>
							<div className={styles.iconWrapper}>
								<span className="block size-4" />
							</div>
							<div className={styles.iconWrapper}>
								<MemoryTreeNodeIcon item={item} pathSegments={[itemName]} />
							</div>
							<div className={styles.rowTitleText}>
								<InputWithError
									ref={
										isVirtualFolder
											? virtualFolderInputRef
											: virtualFileInputRef
									}
									data-testid={
										isVirtualFolder
											? "folder-name-input-virtual"
											: "file-name-input-virtual"
									}
									value={isVirtualFolder ? virtualFolderName : virtualFileName}
									onChange={(event) => {
										if (isVirtualFolder) {
											setVirtualFolderName(event.target.value)
										} else {
											setVirtualFileName(event.target.value)
										}
									}}
									onFocus={(event) => {
										event.target.scrollIntoView({
											behavior: "smooth",
											block: "center",
										})
									}}
									onBlur={
										isVirtualFolder ? confirmVirtualFolder : confirmVirtualFile
									}
									onKeyDown={
										isVirtualFolder
											? handleVirtualFolderKeyDown
											: handleVirtualFileKeyDown
									}
									onClick={(event) => event.stopPropagation()}
									errorMessage={virtualErrorMessage}
									showError={showVirtualError}
								/>
							</div>
						</div>
					</div>
				)
			}

			return (
				<div
					className={cx(styles.fileItem, isActiveFile && "bg-blue-500/10")}
					data-testid={isDirectory ? "folder-item" : "file-item"}
				>
					<div className={styles.fileTitle} style={{ paddingLeft: node.level * 10 }}>
						<div className={styles.iconWrapper}>
							{isDirectory && hasChildren ? (
								<MagicIcon
									component={isExpanded ? IconChevronDown : IconChevronRight}
									size={16}
									stroke={1.5}
									style={{ color: "rgba(28, 29, 35, 0.6)" }}
								/>
							) : (
								<span className="block size-4" />
							)}
						</div>
						<div className={styles.iconWrapper}>
							<MemoryTreeNodeIcon
								item={item}
								pathSegments={memoryNodePathIndex.get(itemId) || [itemName]}
							/>
						</div>
						<div className={styles.rowTitleText}>
							<SmartTooltip
								placement="right"
								className={cx(
									styles.ellipsis,
									isActiveFile && styles.activeFileItem,
								)}
								sideOffset={20}
							>
								{itemName}
							</SmartTooltip>
						</div>
					</div>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className={cx(
									styles.attachmentAction,
									"file-item-action size-6 shrink-0 p-0 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100",
								)}
								onClick={(event) => event.stopPropagation()}
							>
								<MagicIcon component={IconDots} stroke={2} size={16} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							onClick={(event) => event.stopPropagation()}
						>
							{isDirectory && (
								<>
									<DropdownMenuSub>
										<DropdownMenuSubTrigger>
											<FilePlus2 size={16} />
											{t("fileTree.createFile")}
										</DropdownMenuSubTrigger>
										<DropdownMenuSubContent>
											{MEMORY_FILE_TYPE_OPTIONS.map((option) => (
												<Fragment key={option.type}>
													{option.separatorBefore && (
														<DropdownMenuSeparator />
													)}
													<DropdownMenuItem
														onClick={() =>
															beginCreateFile(option.type, itemId)
														}
													>
														<MagicFileIcon
															type={option.type}
															size={16}
														/>
														{tSuper(option.labelKey)}
													</DropdownMenuItem>
												</Fragment>
											))}
										</DropdownMenuSubContent>
									</DropdownMenuSub>
									<DropdownMenuItem onClick={() => beginCreateFolder(itemId)}>
										<FolderPlus size={16} />
										{t("fileTree.createFolder")}
									</DropdownMenuItem>
									{!isRoot && <DropdownMenuSeparator />}
								</>
							)}
							{!isDirectory && (
								<DropdownMenuItem
									onClick={() => void handleDownloadFile(itemId, itemName)}
								>
									<Download size={16} />
									{t("fileTree.download")}
								</DropdownMenuItem>
							)}
							{!isRoot && (
								<>
									<DropdownMenuItem onClick={() => openRenameDialog(item)}>
										<Pencil size={16} />
										{t("fileTree.rename")}
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										variant="destructive"
										onClick={() => confirmDeleteNode(item)}
									>
										<Trash2 size={16} />
										{t("deleteMemory")}
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)
		},
		[
			activeFileId,
			beginCreateFile,
			beginCreateFolder,
			editingVirtualFileId,
			editingVirtualFolderId,
			confirmDeleteNode,
			confirmVirtualFile,
			confirmVirtualFolder,
			cx,
			expandedKeySet,
			handleVirtualFileKeyDown,
			handleVirtualFolderKeyDown,
			handleDownloadFile,
			memoryNodePathIndex,
			openRenameDialog,
			rootId,
			setVirtualFileName,
			setVirtualFolderName,
			styles.activeFileItem,
			styles.attachmentAction,
			styles.ellipsis,
			styles.fileItem,
			styles.fileTitle,
			styles.fileTitleTopAligned,
			styles.iconWrapper,
			styles.rowTitleText,
			t,
			tSuper,
			virtualFileErrorMessage,
			virtualFileInputRef,
			virtualFileName,
			virtualFolderErrorMessage,
			virtualFolderInputRef,
			virtualFolderName,
		],
	)

	/** 进入与项目文件一致的搜索模式。 */
	const openSearchMode = useCallback(() => {
		setIsSearchMode(true)
	}, [])

	/** 退出搜索模式并恢复完整文件树。 */
	const closeSearchMode = useCallback(() => {
		setIsSearchMode(false)
		setSearchValue("")
	}, [])

	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="memory-file-tree-panel">
			<div className="shrink-0 py-1" data-slot="project-panel-toolbar">
				{isSearchMode ? (
					<SearchModeHeader
						searchValue={searchValue}
						onSearchChange={setSearchValue}
						onClose={closeSearchMode}
					/>
				) : (
					<NormalModeHeader
						title={t("longMemory")}
						isShareRoute={false}
						refreshLoading={loading}
						allowEdit={Boolean(defaultParentId)}
						showMobileActions
						onRefresh={() => void refreshMemoryFiles()}
						onSearch={openSearchMode}
						onAddFile={(type) => type && beginCreateFile(type)}
						onAddFolder={() => beginCreateFolder()}
						className={cn(!showTitle && "[&>p]:hidden")}
					/>
				)}
			</div>

			<div ref={scrollRef} className={cx(styles.fileListArea, "min-h-0 px-2 pb-2")}>
				{loadError ? (
					<div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-sm text-muted-foreground">
						<span>{t("fileTree.loadFailed")}</span>
						<Button
							variant="outline"
							size="sm"
							onClick={() => void refreshMemoryFiles()}
						>
							{t("fileTree.retry")}
						</Button>
					</div>
				) : !loading && visibleNodes.length === 0 ? (
					<div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted-foreground">
						{searchValue.trim() ? t("fileTree.searchEmpty") : t("memoryListEmpty")}
					</div>
				) : (
					<CustomTree
						visibleRows={visibleRows}
						visibleNodes={visibleNodes}
						visibleNodeIndexByKey={visibleNodeIndexByKey}
						expandedKeys={effectiveExpandedKeys}
						selectedKeys={selectedKeys}
						onSelect={handleSelect}
						titleRender={renderNodeTitle}
						showIcon={false}
						blockNode
						scrollElementRef={scrollRef}
						isMobile={isMobile}
					/>
				)}
			</div>

			<Dialog open={Boolean(dialogState)} onOpenChange={(open) => !open && closeNodeDialog()}>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle>{t("fileTree.rename")}</DialogTitle>
						<DialogDescription>{t("fileTree.nameDescription")}</DialogDescription>
					</DialogHeader>
					<Input
						autoFocus
						value={dialogName}
						onChange={(event) => setDialogName(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") void submitNodeDialog()
						}}
					/>
					<DialogFooter>
						<Button variant="outline" disabled={submitting} onClick={closeNodeDialog}>
							{t("cancel")}
						</Button>
						<Button
							disabled={submitting || !dialogName.trim()}
							onClick={() => void submitNodeDialog()}
						>
							{t("confirm")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
})
