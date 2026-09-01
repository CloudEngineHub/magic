import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

export type MemoryTreeNodeTagKey =
	| "memoryRoot"
	| "global"
	| "globalMemory"
	| "globalNotes"
	| "projects"
	| "project"
	| "currentProject"
	| "projectMemory"
	| "projectNotes"

const MEMORY_ROOT_PATH = ["memory"]
const GLOBAL_MEMORY_PATH = ["memory", "global"]
const PROJECTS_PATH = ["memory", "projects"]
const MEMORY_FILE_NAME = "MEMORY.md"
const NOTES_DIRECTORY_NAME = "notes"
const PROJECT_DIRECTORY_PREFIX = "p_"

/** 获取记忆树节点的稳定显示名称。 */
export function getMemoryTreeNodeName(item?: AttachmentItem | null): string {
	return String(item?.display_filename || item?.file_name || item?.filename || item?.name || "")
}

/** 建立节点编号到目录层级的索引，避免依赖后端是否返回相对路径。 */
export function buildMemoryTreeNodePathIndex(items: AttachmentItem[]): Map<string, string[]> {
	const pathIndex = new Map<string, string[]>()

	const visit = (nodes: AttachmentItem[], parentPath: string[]) => {
		nodes.forEach((item) => {
			const currentPath = [...parentPath, getMemoryTreeNodeName(item)]
			const itemId = String(item.file_id || "")
			if (itemId) pathIndex.set(itemId, currentPath)
			if (item.children?.length) visit(item.children, currentPath)
		})
	}

	visit(items, [])
	return pathIndex
}

/** 根据标准记忆目录结构解析节点右侧标签，普通用户文件不返回标签。 */
export function resolveMemoryTreeNodeTagKey(
	pathSegments: string[],
	projectId?: string | null,
): MemoryTreeNodeTagKey | undefined {
	if (isSamePath(pathSegments, MEMORY_ROOT_PATH)) return "memoryRoot"
	if (isSamePath(pathSegments, GLOBAL_MEMORY_PATH)) return "global"
	if (isSamePath(pathSegments, [...GLOBAL_MEMORY_PATH, MEMORY_FILE_NAME])) {
		return "globalMemory"
	}
	if (isSamePath(pathSegments, [...GLOBAL_MEMORY_PATH, NOTES_DIRECTORY_NAME])) {
		return "globalNotes"
	}
	if (isSamePath(pathSegments, PROJECTS_PATH)) return "projects"

	const projectDirectoryName = pathSegments[2]
	const isProjectPath =
		pathSegments.length >= 3 &&
		pathSegments[0] === MEMORY_ROOT_PATH[0] &&
		pathSegments[1] === PROJECTS_PATH[1] &&
		projectDirectoryName.startsWith(PROJECT_DIRECTORY_PREFIX) &&
		projectDirectoryName.length > PROJECT_DIRECTORY_PREFIX.length
	if (!isProjectPath) return
	if (pathSegments.length === 3) {
		return isCurrentProjectMemoryDirectory(pathSegments, projectId)
			? "currentProject"
			: "project"
	}
	if (pathSegments.length !== 4) return
	if (pathSegments[3] === MEMORY_FILE_NAME) return "projectMemory"
	if (pathSegments[3] === NOTES_DIRECTORY_NAME) return "projectNotes"

	return
}

/** 判断节点是否为当前项目对应的记忆目录。 */
export function isCurrentProjectMemoryDirectory(
	pathSegments: string[],
	projectId?: string | null,
): boolean {
	return Boolean(
		projectId &&
		pathSegments.length === 3 &&
		pathSegments[0] === MEMORY_ROOT_PATH[0] &&
		pathSegments[1] === PROJECTS_PATH[1] &&
		pathSegments[2] === `${PROJECT_DIRECTORY_PREFIX}${projectId}`,
	)
}

/** 将当前项目记忆目录移动到 projects 目录的首位，保持原树节点不变。 */
export function prioritizeCurrentProjectMemoryDirectory(
	items: AttachmentItem[],
	projectId?: string | null,
): AttachmentItem[] {
	if (!projectId) return items

	const reorderChildren = (nodes: AttachmentItem[], parentPath: string[]): AttachmentItem[] =>
		nodes.map((item) => {
			const currentPath = [...parentPath, getMemoryTreeNodeName(item)]
			if (!item.children?.length) return item

			const children = reorderChildren(item.children, currentPath)
			const childrenChanged = children.some(
				(child, index) => child !== item.children?.[index],
			)
			if (isSamePath(currentPath, PROJECTS_PATH)) {
				const currentIndex = children.findIndex((child) =>
					isCurrentProjectMemoryDirectory(
						[...currentPath, getMemoryTreeNodeName(child)],
						projectId,
					),
				)
				if (currentIndex > 0) {
					const prioritizedChildren = [...children]
					const [currentProject] = prioritizedChildren.splice(currentIndex, 1)
					prioritizedChildren.unshift(currentProject)
					return { ...item, children: prioritizedChildren }
				}
			}

			return childrenChanged ? { ...item, children } : item
		})

	return reorderChildren(items, [])
}

/** 判断两个目录层级是否完全一致。 */
function isSamePath(actualPath: string[], expectedPath: string[]): boolean {
	return (
		actualPath.length === expectedPath.length &&
		actualPath.every((segment, index) => segment === expectedPath[index])
	)
}
