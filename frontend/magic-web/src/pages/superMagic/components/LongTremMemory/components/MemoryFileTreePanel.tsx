import { memo, useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import type { TopicFilesMenuItem } from "@/pages/superMagic/components/TopicFilesButton/utils/menu-items"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { TopicFilesSpaceConfig } from "@/pages/superMagic/components/TopicFilesButton/file-space"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import {
	MentionItemType,
	type MemoryDirectoryMentionData,
	type MemoryFileMentionData,
} from "@/components/business/MentionPanel/types"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { MEMORY_SCOPE } from "../services/memoryFileService"
import { MemoryTreeNodeIcon } from "./MemoryTreeNodeIcon"
import {
	buildMemoryTreeNodePathIndex,
	getMemoryTreeNodeName,
	resolveMemoryTreeNodeTagKey,
} from "./memoryTreeNodeUtils"

interface MemoryFileTreePanelProps {
	projectId?: string | null
	selectedProject?: ProjectListItem | null
	selectedWorkspace?: Workspace | null
	activeFileId?: string | null
	onFileClick?: (fileItem: AttachmentItem) => void
	showTitle?: boolean
}

const MEMORY_PROJECT_ID = "0"
const MEMORY_ROOT_NAME = "memory"
const MEMORY_HIDDEN_MENU_KEYS = new Set([
	"copyFile",
	"importFromOtherProject",
	"setPersonalPet",
	"share",
])
const MEMORY_ROOT_HIDDEN_MENU_KEYS = new Set(["delete", "moveFile", "rename", "selectMultiple"])
const MEMORY_SPACE_CAPABILITIES: NonNullable<TopicFilesSpaceConfig["capabilities"]> = {
	addToChat: true,
	crossProject: false,
	importFromOtherProject: false,
	projectContentCreation: false,
	share: false,
}

/** 判断节点是否为用户记忆空间的固定根目录。 */
function isMemoryRoot(item?: AttachmentItem): boolean {
	return Boolean(item?.is_directory && getMemoryTreeNodeName(item) === MEMORY_ROOT_NAME)
}

/** 将用户记忆文件声明为独立预览文件，避免参与当前项目附件树同步。 */
function createMemoryPreviewItem(item: AttachmentItem): AttachmentItem {
	return {
		...item,
		project_id: MEMORY_PROJECT_ID,
		display_config: {
			...(item.display_config || {}),
			previewPolicy: {
				...(item.display_config?.previewPolicy || {}),
				standalone: true,
				editingPresence: false,
				allowShare: false,
				fileScope: MEMORY_SCOPE,
				syncWithAttachments: false,
				persistTab: false,
				restoreAsActive: false,
			},
		},
	}
}

/** 过滤记忆空间不适用的项目专属菜单，并保护固定根目录。 */
function filterMemoryMenuItems(
	menuItems: TopicFilesMenuItem[],
	isFixedRoot: boolean,
): TopicFilesMenuItem[] {
	const hiddenKeys = isFixedRoot
		? new Set([...MEMORY_HIDDEN_MENU_KEYS, ...MEMORY_ROOT_HIDDEN_MENU_KEYS])
		: MEMORY_HIDDEN_MENU_KEYS

	return menuItems
		.filter((menuItem) => !menuItem?.key || !hiddenKeys.has(String(menuItem.key)))
		.map((menuItem) => {
			if (!menuItem || !("children" in menuItem) || !menuItem.children) return menuItem
			return {
				...menuItem,
				children: filterMemoryMenuItems(
					menuItem.children as TopicFilesMenuItem[],
					isFixedRoot,
				),
			}
		})
}

/** 项目侧用户记忆文件树，复用项目文件的完整交互能力。 */
export const MemoryFileTreePanel = memo(function MemoryFileTreePanel({
	selectedProject,
	selectedWorkspace,
	activeFileId,
	onFileClick,
	showTitle = true,
}: MemoryFileTreePanelProps) {
	const { t } = useTranslation("super/longMemory")
	const [attachments, setAttachments] = useState<AttachmentItem[]>([])
	const [loading, setLoading] = useState(false)
	const [loadError, setLoadError] = useState(false)

	/** 重新加载当前用户的完整记忆文件树。 */
	const refreshMemoryFiles = useCallback(async (signal?: AbortSignal) => {
		setLoading(true)
		setLoadError(false)
		try {
			const result = await loadProjectAttachments({
				projectId: MEMORY_PROJECT_ID,
				scope: MEMORY_SCOPE,
				temporaryToken: null,
				signal,
				onBatchSnapshot: (snapshot) => {
					setAttachments(snapshot.tree)
				},
			})
			setAttachments(result.tree)
		} catch (error) {
			if ((error as { name?: string })?.name === "AbortError") return
			console.error("加载记忆文件树失败", error)
			setLoadError(true)
			throw error
		} finally {
			if (!signal?.aborted) setLoading(false)
		}
	}, [])

	useEffect(() => {
		const controller = new AbortController()
		void refreshMemoryFiles(controller.signal).catch(() => undefined)
		return () => controller.abort()
	}, [refreshMemoryFiles])

	const memoryNodePathIndex = useMemo(
		() => buildMemoryTreeNodePathIndex(attachments),
		[attachments],
	)
	const memoryProject = useMemo(
		() => ({
			id: MEMORY_PROJECT_ID,
			project_name: t("longMemory"),
			workspace_id: "",
		}),
		[t],
	)

	/** 将记忆节点转换为独立的记忆 mention。 */
	const createMemoryAttachmentMention = useCallback(
		(item: AttachmentItem): TiptapMentionAttributes | null => {
			const pathSegments = memoryNodePathIndex.get(String(item.file_id || ""))
			if (!pathSegments?.length) return null

			const memoryPath = `~/.magic/${pathSegments.join("/")}`
			const normalizedPath = item.is_directory
				? `${memoryPath.replace(/\/$/, "")}/`
				: memoryPath

			if (item.is_directory) {
				return {
					type: MentionItemType.MEMORY_DIRECTORY,
					data: {
						directory_id: String(item.file_id || ""),
						directory_name: getMemoryTreeNodeName(item),
						directory_path: normalizedPath,
					} satisfies MemoryDirectoryMentionData,
				}
			}

			return {
				type: MentionItemType.MEMORY_FILE,
				data: {
					file_id: String(item.file_id || ""),
					file_name: getMemoryTreeNodeName(item),
					file_path: normalizedPath,
					file_extension: item.file_extension || "",
				} satisfies MemoryFileMentionData,
			}
		},
		[memoryNodePathIndex],
	)

	const memorySpaceConfig = useMemo<TopicFilesSpaceConfig>(
		() => ({
			scope: MEMORY_SCOPE,
			capabilities: MEMORY_SPACE_CAPABILITIES,
			chatContext: {
				selectedProject,
				selectedWorkspace,
				createAttachmentMention: createMemoryAttachmentMention,
			},
		}),
		[selectedProject, selectedWorkspace, createMemoryAttachmentMention],
	)

	/** 使用记忆目录语义装饰共享文件树节点。 */
	const resolveMemoryRowDecoration = useCallback(
		({ item, isVirtual }: { item: AttachmentItem; isVirtual: boolean }) => {
			const pathSegments = memoryNodePathIndex.get(String(item.file_id || "")) || [
				getMemoryTreeNodeName(item),
			]
			const tagKey = isVirtual ? undefined : resolveMemoryTreeNodeTagKey(pathSegments)

			return {
				icon: <MemoryTreeNodeIcon item={item} pathSegments={pathSegments} />,
				tag: tagKey ? (
					<Badge
						variant="outline"
						className="h-5 rounded-md border-border bg-background px-2 py-0.5 text-[10px] font-normal leading-3 text-muted-foreground shadow-none"
					>
						{t(`fileTree.tags.${tagKey}`)}
					</Badge>
				) : undefined,
			}
		},
		[memoryNodePathIndex, t],
	)

	/** 打开记忆文件时补充独立预览策略。 */
	const handleMemoryFileClick = useCallback(
		(item: AttachmentItem) => {
			onFileClick?.(createMemoryPreviewItem(item))
		},
		[onFileClick],
	)

	/** 手动刷新失败时保留当前文件树并提示用户。 */
	const handleRefresh = useCallback(async () => {
		try {
			await refreshMemoryFiles()
		} catch {
			magicToast.error(t("fileTree.loadFailed"))
		}
	}, [refreshMemoryFiles, t])

	const memoryRoot = useMemo(() => attachments.find(isMemoryRoot), [attachments])
	const hasMemoryRoot = Boolean(memoryRoot)

	/** 判断节点是否为当前文件树的固定记忆根目录。 */
	const isFixedMemoryRoot = useCallback(
		(item?: AttachmentItem) => {
			if (!item || !memoryRoot) return false
			const memoryRootId = String(memoryRoot.file_id || "")
			return (
				item === memoryRoot ||
				(memoryRootId !== "" && String(item.file_id || "") === memoryRootId)
			)
		},
		[memoryRoot],
	)

	/** 过滤记忆空间不适用的菜单操作。 */
	const filterMemoryTreeMenuItems = useCallback(
		(menuItems: TopicFilesMenuItem[], item?: AttachmentItem) =>
			filterMemoryMenuItems(menuItems, isFixedMemoryRoot(item)),
		[isFixedMemoryRoot],
	)

	const isMemoryItemSelectable = useCallback(
		(item: AttachmentItem) => !isFixedMemoryRoot(item),
		[isFixedMemoryRoot],
	)

	return (
		<TopicFilesButton
			className="h-full min-h-0"
			title={t("longMemory")}
			showTitle={showTitle}
			attachments={attachments}
			projectId={MEMORY_PROJECT_ID}
			selectedProject={memoryProject}
			activeFileId={activeFileId}
			allowEdit={hasMemoryRoot && !loadError && !loading}
			allowDownload
			isInProject
			showMobileActions
			refreshAttachments={handleRefresh}
			onAttachmentsChange={setAttachments}
			onFileClick={handleMemoryFileClick}
			filterMenuItems={filterMemoryTreeMenuItems}
			resolveTopicFileRowDecoration={resolveMemoryRowDecoration}
			spaceConfig={memorySpaceConfig}
			isItemSelectable={isMemoryItemSelectable}
			operationRoot={memoryRoot}
		/>
	)
})
