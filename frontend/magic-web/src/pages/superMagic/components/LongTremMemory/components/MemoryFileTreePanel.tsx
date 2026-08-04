import {
	ChevronDown,
	ChevronRight,
	Download,
	FilePlus2,
	FolderPlus,
	MoreHorizontal,
	Pencil,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
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
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { Input } from "@/components/shadcn-ui/input"
import { useIsMobile } from "@/hooks/useIsMobile"
import { cn } from "@/lib/utils"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import CustomTree from "../../TopicFilesButton/components/CustomTree/CustomTree"
import { useVisibleTreeRows } from "../../TopicFilesButton/hooks/useVisibleTreeRows"
import type { AttachmentItem } from "../../TopicFilesButton/hooks/types"
import type { TreeNodeData } from "../../TopicFilesButton/utils/treeDataConverter"
import { memoryFileService, MEMORY_SCOPE } from "../services/memoryFileService"
import { MemoryTreeNodeIcon } from "./MemoryTreeNodeIcon"
import { buildMemoryTreeNodePathIndex, getMemoryTreeNodeName } from "./memoryTreeNodeUtils"

type MemoryNodeDialogMode = "createFile" | "createFolder" | "rename"

interface MemoryNodeDialogState {
	mode: MemoryNodeDialogMode
	parentId: string
	item?: AttachmentItem
}

interface MemoryFileTreePanelProps {
	projectId?: string | null
	activeFileId?: string | null
	onFileClick?: (fileItem: AttachmentItem) => void
}

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

/** 项目侧文件记忆树。 */
export const MemoryFileTreePanel = memo(function MemoryFileTreePanel({
	projectId,
	activeFileId,
	onFileClick,
}: MemoryFileTreePanelProps) {
	const { t } = useTranslation("super/longMemory")
	const isMobile = useIsMobile()
	const scrollRef = useRef<HTMLDivElement>(null)
	const [attachments, setAttachments] = useState<AttachmentItem[]>([])
	const [loading, setLoading] = useState(false)
	const [loadError, setLoadError] = useState(false)
	const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
	const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([])
	const [searchValue, setSearchValue] = useState("")
	const [dialogState, setDialogState] = useState<MemoryNodeDialogState | null>(null)
	const [dialogName, setDialogName] = useState("")
	const [submitting, setSubmitting] = useState(false)

	const filteredAttachments = useMemo(
		() => filterMemoryTree(attachments, searchValue),
		[attachments, searchValue],
	)
	const memoryNodePathIndex = useMemo(
		() => buildMemoryTreeNodePathIndex(attachments),
		[attachments],
	)
	const effectiveExpandedKeys = useMemo(
		() => (searchValue.trim() ? collectDirectoryIds(filteredAttachments) : expandedKeys),
		[expandedKeys, filteredAttachments, searchValue],
	)
	const { expandedKeySet, visibleRows, visibleNodes, visibleNodeIndexByKey } = useVisibleTreeRows(
		{
			expandedKeys: effectiveExpandedKeys,
			attachmentTree: filteredAttachments,
		},
	)

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
	const selectedItem = useMemo(() => {
		const selectedId = String(selectedKeys[0] || "")
		return visibleNodes.find((node) => String(node.key) === selectedId)?.item
	}, [selectedKeys, visibleNodes])

	/** 打开创建或重命名弹窗。 */
	const openNodeDialog = useCallback((state: MemoryNodeDialogState) => {
		setDialogState(state)
		setDialogName(state.mode === "rename" ? getMemoryTreeNodeName(state.item) : "")
	}, [])

	/** 关闭节点编辑弹窗并清理临时状态。 */
	const closeNodeDialog = useCallback(() => {
		if (submitting) return
		setDialogState(null)
		setDialogName("")
	}, [submitting])

	/** 提交创建或重命名操作。 */
	const submitNodeDialog = useCallback(async () => {
		if (!dialogState) return
		const targetName = dialogName.trim()
		if (!targetName) return

		setSubmitting(true)
		try {
			if (dialogState.mode === "rename") {
				const fileId = getMemoryItemId(dialogState.item)
				if (!fileId) return
				await memoryFileService.renameNode(fileId, targetName)
				magicToast.success(t("fileTree.renameSuccess"))
			} else {
				await memoryFileService.createNode({
					name: targetName,
					parentId: dialogState.parentId,
					isDirectory: dialogState.mode === "createFolder",
				})
				magicToast.success(t("fileTree.createSuccess"))
			}

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
			const isExpanded = expandedKeySet.has(itemId)
			const isRoot = itemId === rootId
			const parentId = isDirectory ? itemId : String(item.parent_id || rootId)

			return (
				<div
					className={cn(
						"group flex h-8 min-w-0 items-center gap-1 rounded-md pr-1 text-sm",
						activeFileId === itemId && "bg-primary/10 text-primary",
					)}
					style={{ paddingLeft: node.level * 12 }}
				>
					<span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
						{isDirectory ? (
							isExpanded ? (
								<ChevronDown size={14} />
							) : (
								<ChevronRight size={14} />
							)
						) : null}
					</span>
					<span className="flex size-4 shrink-0 items-center justify-center">
						<MemoryTreeNodeIcon
							item={item}
							pathSegments={memoryNodePathIndex.get(itemId) || [itemName]}
						/>
					</span>
					<span className="min-w-0 flex-1 truncate" title={itemName}>
						{itemName}
					</span>
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="size-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
								onClick={(event) => event.stopPropagation()}
							>
								<MoreHorizontal size={16} />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="end"
							onClick={(event) => event.stopPropagation()}
						>
							{isDirectory && (
								<>
									<DropdownMenuItem
										onClick={() =>
											openNodeDialog({ mode: "createFile", parentId })
										}
									>
										<FilePlus2 size={16} />
										{t("fileTree.createFile")}
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={() =>
											openNodeDialog({ mode: "createFolder", parentId })
										}
									>
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
									<DropdownMenuItem
										onClick={() =>
											openNodeDialog({ mode: "rename", parentId, item })
										}
									>
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
			confirmDeleteNode,
			expandedKeySet,
			handleDownloadFile,
			memoryNodePathIndex,
			openNodeDialog,
			rootId,
			t,
		],
	)

	const defaultParentId = selectedItem?.is_directory
		? getMemoryItemId(selectedItem)
		: String(selectedItem?.parent_id || rootId)

	return (
		<div className="flex h-full min-h-0 flex-col" data-testid="memory-file-tree-panel">
			<div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
				<div className="relative min-w-0 flex-1">
					<Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={searchValue}
						onChange={(event) => setSearchValue(event.target.value)}
						placeholder={t("fileTree.searchPlaceholder")}
						className="h-8 pl-8"
					/>
				</div>
				<Button
					variant="ghost"
					size="icon"
					className="size-8"
					disabled={loading}
					onClick={() => void refreshMemoryFiles()}
					title={t("fileTree.refresh")}
				>
					<RefreshCw size={16} className={cn(loading && "animate-spin")} />
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button size="icon" className="size-8" disabled={!defaultParentId}>
							<FilePlus2 size={16} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onClick={() =>
								openNodeDialog({ mode: "createFile", parentId: defaultParentId })
							}
						>
							<FilePlus2 size={16} />
							{t("fileTree.createFile")}
						</DropdownMenuItem>
						<DropdownMenuItem
							onClick={() =>
								openNodeDialog({ mode: "createFolder", parentId: defaultParentId })
							}
						>
							<FolderPlus size={16} />
							{t("fileTree.createFolder")}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			<div ref={scrollRef} className="min-h-0 flex-1 overflow-auto p-1">
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
						scrollElementRef={scrollRef}
						isMobile={isMobile}
					/>
				)}
			</div>

			<Dialog open={Boolean(dialogState)} onOpenChange={(open) => !open && closeNodeDialog()}>
				<DialogContent className="sm:max-w-[420px]">
					<DialogHeader>
						<DialogTitle>
							{dialogState?.mode === "rename"
								? t("fileTree.rename")
								: dialogState?.mode === "createFolder"
									? t("fileTree.createFolder")
									: t("fileTree.createFile")}
						</DialogTitle>
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
