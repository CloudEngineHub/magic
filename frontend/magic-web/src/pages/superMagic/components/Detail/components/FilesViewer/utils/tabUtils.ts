import type { TabItem, FileItem } from "../types"
import type { AttachmentItem } from "../../../../TopicFilesButton/hooks/types"
import { getParentIdFromPath } from "../../../../TopicFilesButton/utils/getParentIdFromPath"
import { isMagicProjectConfigFile } from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"

function normalizeTabFileId(fileId: unknown): string {
	if (typeof fileId === "string") return fileId.trim()
	if (typeof fileId === "number" && Number.isFinite(fileId)) return String(fileId)
	return ""
}

function getAttachmentFileName(item: FileItem | AttachmentItem): string {
	return item.display_filename || item.file_name || item.filename || ""
}

function isSlideProjectFolder(item: FileItem | AttachmentItem | undefined): boolean {
	return Boolean(item?.is_directory && item?.display_config?.type === "slide")
}

function createFallbackSlideProjectFolder(
	file: FileItem | AttachmentItem,
): (FileItem | AttachmentItem) | undefined {
	// 旧缓存可能保存的是 PPT 目录下 index.html 的 file_id。
	// 如果缓存恢复早于附件树加载，无法通过 attachments 找到父目录，会导致：
	// 默认恢复 tab 使用 index.html id，用户再点击文件树里的 PPT 目录时使用目录 id，
	// 同一个 PPT 项目被打开成两个 tab。此时先用 index.html.parent_id 作为稳定 tab id，
	// 等附件树同步完成后，再由同步逻辑用真实目录节点刷新 fileData。
	const parentId = normalizeTabFileId(file.parent_id)
	if (!parentId || file.display_config?.type !== "slide") return undefined

	const relativeFilePath = file.relative_file_path || ""
	const folderPath = relativeFilePath.includes("/")
		? relativeFilePath.split("/").slice(0, -1).join("/")
		: ""
	if (!folderPath) return undefined

	const folderPathParts = folderPath.split("/").filter(Boolean)
	const folderName =
		file.display_config.name ||
		(folderPath ? folderPathParts[folderPathParts.length - 1] : undefined) ||
		getAttachmentFileName(file)

	return {
		...file,
		file_id: parentId,
		file_name: folderName,
		filename: folderName,
		display_filename: folderName,
		file_extension: "",
		relative_file_path: folderPath,
		parent_id: undefined,
		is_directory: true,
		children: undefined,
	}
}

function findParentDirectory(
	items: (FileItem | AttachmentItem)[] | undefined,
	child: FileItem | AttachmentItem,
): FileItem | AttachmentItem | undefined {
	if (!items || !Array.isArray(items)) return undefined

	const childParentId = normalizeTabFileId(child.parent_id)
	const childPath = child.relative_file_path || ""
	const parentPath = childPath.includes("/") ? childPath.split("/").slice(0, -1).join("/") : ""

	for (const item of items) {
		if (item.is_directory) {
			const itemId = normalizeTabFileId(item.file_id)
			const itemPath = item.relative_file_path || ""
			if (
				(childParentId && itemId === childParentId) ||
				(parentPath && itemPath === parentPath)
			) {
				return item
			}
		}

		if (Array.isArray(item.children)) {
			const found = findParentDirectory(item.children, child)
			if (found) return found
		}
	}

	return undefined
}

function resolveSlideProjectTabFile(
	file: FileItem | AttachmentItem,
	attachments?: FileItem[] | AttachmentItem[],
): FileItem | AttachmentItem {
	if (isSlideProjectFolder(file)) return file

	const fileName = getAttachmentFileName(file).toLowerCase()
	if (fileName !== "index.html") return file

	const parentDirectory = findParentDirectory(attachments, file)
	if (isSlideProjectFolder(parentDirectory)) return parentDirectory

	return createFallbackSlideProjectFolder(file) || file
}

export function normalizeSlideProjectTabItem(
	tab: TabItem,
	attachments?: FileItem[] | AttachmentItem[],
): TabItem {
	const tabFile = resolveSlideProjectTabFile(tab.fileData, attachments)
	const stableFileId = normalizeTabFileId(tabFile.file_id)
	if (!stableFileId) return tab

	const currentTabId = normalizeTabFileId(tab.id)
	const currentFileId = normalizeTabFileId(tab.fileData.file_id)
	if (stableFileId === currentTabId && stableFileId === currentFileId) return tab

	const displayConfig = tabFile.display_config || tab.display_config
	return {
		...tab,
		id: stableFileId,
		title: getFileTabTitle(tabFile, attachments, displayConfig),
		fileData: {
			...tab.fileData,
			...tabFile,
			file_id: stableFileId,
			display_config: displayConfig,
		} as FileItem,
		filePath: tabFile.relative_file_path || tab.filePath,
		display_config: displayConfig,
	}
}

export function dedupeTabsById(tabs: TabItem[]): TabItem[] {
	const result: TabItem[] = []
	const indexById = new Map<string, number>()

	for (const tab of tabs) {
		const id = normalizeTabFileId(tab.id)
		if (!id) continue

		const existingIndex = indexById.get(id)
		if (existingIndex === undefined) {
			indexById.set(id, result.length)
			result.push({ ...tab, id })
			continue
		}

		const existing = result[existingIndex]
		const shouldUseNext =
			tab.active ||
			(!existing.active &&
				(tab.active_at || tab.create_at || 0) >=
					(existing.active_at || existing.create_at || 0))

		result[existingIndex] = {
			...(shouldUseNext ? tab : existing),
			id,
			active: Boolean(existing.active || tab.active),
		}
	}

	return result
}

/**
 * 递归查找指定路径的目录项
 * @param items - 附件树数组
 * @param targetPath - 目标路径
 * @returns 找到的目录项或 undefined
 */
function findDirectoryByPath(
	items: (FileItem | AttachmentItem)[] | undefined,
	targetPath: string,
): FileItem | AttachmentItem | undefined {
	if (!items || !Array.isArray(items) || !targetPath) {
		return undefined
	}

	for (const item of items) {
		const itemPath = item.relative_file_path || ""
		if (item.is_directory && itemPath === targetPath) {
			return item
		}
		if (item.is_directory && Array.isArray(item.children)) {
			const found = findDirectoryByPath(item.children, targetPath)
			if (found) return found
		}
	}
	return undefined
}

/**
 * 获取文件的 tab title
 * 对于 index.html 文件：优先从文件 display_config.name 获取，其次从父目录 display_config.name 获取，最后使用目录名称
 * 对于其他文件：优先从 display_config.name 获取，否则使用文件名
 * @param file - 文件项
 * @param attachments - 附件树数组（用于查找父目录）
 * @param displayConfig - 可选的元数据（优先使用）
 * @returns tab title
 */
export function getFileTabTitle(
	file: FileItem | AttachmentItem,
	attachments?: FileItem[] | AttachmentItem[],
	displayConfig?: Record<string, unknown>,
): string {
	const fileName = file.display_filename || file.file_name || file.filename || "未命名文件"
	const fileDisplayConfig = displayConfig || file.display_config

	// 检查是否为 index.html
	if (fileName.toLowerCase() === "index.html" && file.relative_file_path) {
		// 优先从 index.html 文件的 display_config.name 获取
		if (
			fileDisplayConfig &&
			typeof fileDisplayConfig.name === "string" &&
			fileDisplayConfig.name.trim()
		) {
			return fileDisplayConfig.name.trim()
		}

		// 其次从父目录的 display_config.name 获取
		const parentPath = file.relative_file_path.split("/").slice(0, -1).join("/")
		const parentDirectory = parentPath
			? findDirectoryByPath(attachments as FileItem[] | undefined, parentPath)
			: undefined
		const parentDisplayConfig = parentDirectory?.display_config
		if (
			parentDisplayConfig &&
			typeof parentDisplayConfig.name === "string" &&
			parentDisplayConfig.name.trim()
		) {
			return parentDisplayConfig.name.trim()
		}

		// 如果文件或目录有 display_config（但没有 name），使用目录名称作为 tab title
		const hasFileDisplayConfig = !!fileDisplayConfig
		const hasParentDisplayConfig = !!parentDisplayConfig
		if (hasFileDisplayConfig || hasParentDisplayConfig) {
			const pathParts = file.relative_file_path.split("/")
			if (pathParts.length > 1) {
				// 使用父目录名称
				const directoryName = pathParts[pathParts.length - 2]
				return directoryName || fileName
			}
		}
	}

	// magic.project.js 始终显示文件名，不用 display_config.name
	if (isMagicProjectConfigFile(fileName)) {
		return fileName
	}

	// 对于其他非 index.html 文件，优先从 display_config.name 获取
	if (
		fileDisplayConfig &&
		typeof fileDisplayConfig.name === "string" &&
		fileDisplayConfig.name.trim()
	) {
		return fileDisplayConfig.name.trim()
	}

	return fileName
}

/**
 * Convert file item to tab item
 * @param file - File item to convert (FileItem or AttachmentItem)
 * @param attachments - Array of attachments for parent ID calculation
 * @param options - Additional options for tab creation
 * @returns TabItem or null if file is invalid
 */
export function convertFileToTabItem(
	file: FileItem | AttachmentItem,
	attachments?: FileItem[] | AttachmentItem[],
	options?: {
		display_config?: Record<string, unknown>
		create_at?: number
		active_at?: number
		active?: boolean
		closeable?: boolean
	},
): TabItem | null {
	if (!file) {
		return null
	}

	const tabFile = resolveSlideProjectTabFile(file, attachments)
	const stableFileId = normalizeTabFileId(tabFile.file_id)
	if (!stableFileId) {
		return null
	}

	const resolvedToSlideFolder = tabFile !== file && isSlideProjectFolder(tabFile)
	const fileDisplayConfig = resolvedToSlideFolder
		? tabFile.display_config
		: options?.display_config || tabFile.display_config
	const tabTitle = getFileTabTitle(tabFile, attachments, fileDisplayConfig)

	const parentPath = tabFile.relative_file_path?.split("/").slice(0, -1).join("/") || ""

	const now = Date.now()

	const tabItem: TabItem = {
		id: stableFileId,
		type: "file",
		title: tabTitle,
		fileData: {
			...tabFile,
			file_id: stableFileId,
			parent_id: getParentIdFromPath(attachments as AttachmentItem[] | undefined, parentPath),
			display_config: fileDisplayConfig,
		} as FileItem,
		active: options?.active ?? true,
		closeable: options?.closeable ?? true,
		filePath: tabFile.relative_file_path,
		display_config: fileDisplayConfig,
		// Note: create_at and active_at will be set by reducer if used through dispatchTabs
		// For direct setCurrentTabs calls, these values are preserved
		create_at: options?.create_at ?? now,
		active_at: options?.active_at ?? now,
	}

	return tabItem
}

/**
 * Calculate calvedRelativePath for duplicate names
 * @param filePath - The file path to process
 * @param existingPaths - Array of existing file paths to check against
 * @returns The calculated relative path or undefined if no duplicates
 */
export function calculateCalvedRelativePath(
	filePath: string | undefined,
	existingPaths: string[],
): string | undefined {
	if (!filePath) return undefined

	// Extract filename from path
	const pathParts = filePath.split("/")
	const filename = pathParts[pathParts.length - 1]

	// Find all existing tabs with the same filename
	const duplicateFilenames = existingPaths.filter((path) => {
		if (!path) return false
		const existingFilename = path.split("/").pop()
		return existingFilename === filename
	})

	// If no duplicates found, no need for calvedRelativePath
	if (duplicateFilenames.length === 0) {
		return undefined
	}

	// Calculate minimum required parent directories to make paths unique
	let requiredDepth = 1
	const maxDepth = pathParts.length - 1 // Exclude filename

	while (requiredDepth <= maxDepth) {
		const currentPath = pathParts.slice(-requiredDepth - 1, -1).join("/")

		// Check if this path is unique among duplicates
		const conflictingPaths = duplicateFilenames.filter((path) => {
			const existingParts = path.split("/")
			const existingPath = existingParts.slice(-requiredDepth - 1, -1).join("/")
			return existingPath === currentPath
		})

		if (conflictingPaths.length === 0) {
			return currentPath ? `../${currentPath}` : "./"
		}

		requiredDepth++
	}

	// If still not unique, return the full directory path with prefix
	const fullPath = pathParts.slice(0, -1).join("/")
	return fullPath ? `../${fullPath}` : "./"
}

/**
 * Handle adding new tab to state
 * @param state - Current tabs state
 * @param newTab - New tab being added
 * @returns Updated state with new tab added and filePath set
 */
export function handleDuplicateTabNames(state: TabItem[], newTab: TabItem): TabItem[] {
	// 简化逻辑：相对路径现在在渲染层动态计算，这里只需要添加tab并设置filePath
	const newTabFilePath = newTab.fileData.relative_file_path || newTab.filePath

	return [
		...state.map((tab) => ({
			...tab,
			active: false,
			filePath: tab.fileData.relative_file_path || tab.filePath,
		})),
		{
			...newTab,
			filePath: newTabFilePath,
		},
	]
}
