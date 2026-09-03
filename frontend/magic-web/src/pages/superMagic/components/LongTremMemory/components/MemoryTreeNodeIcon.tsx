import MagicFileIcon from "@/components/base/MagicFileIcon"
import FoldIcon from "@/pages/superMagic/assets/svg/file-folder.svg"
import { TopicFileIcon } from "@/pages/superMagic/components/TopicFilesButton/components/TopicFileIcon"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

interface MemoryTreeNodeIconProps {
	item: AttachmentItem
	pathSegments: string[]
}

const MEMORY_ROOT_NAME = "memory"
const GLOBAL_FOLDER_NAME = "global"
const PROJECTS_FOLDER_NAME = "projects"
const MEMORY_FILE_NAME = "MEMORY.MD"

/** 判断当前路径是否为内置项目记忆目录。 */
function isProjectMemoryFolder(pathSegments: string[]): boolean {
	return (
		pathSegments.length === 3 &&
		pathSegments[0] === MEMORY_ROOT_NAME &&
		pathSegments[1] === PROJECTS_FOLDER_NAME &&
		pathSegments[2].startsWith("p_")
	)
}

/** 判断当前路径是否为内置记忆索引文件。 */
function isMemoryIndexFile(pathSegments: string[]): boolean {
	if (pathSegments.at(-1)?.toUpperCase() !== MEMORY_FILE_NAME) return false

	const parentPath = pathSegments.slice(0, -1)
	const isGlobalMemory =
		parentPath.length === 2 &&
		parentPath[0] === MEMORY_ROOT_NAME &&
		parentPath[1] === GLOBAL_FOLDER_NAME

	return isGlobalMemory || isProjectMemoryFolder(parentPath)
}

/** 记忆根目录与索引文件使用专属图标，其余节点与项目文件保持一致。 */
export function MemoryTreeNodeIcon({ item, pathSegments }: MemoryTreeNodeIconProps) {
	const normalizedPath = pathSegments.map((segment) => segment.trim().toLowerCase())

	if (!item.is_directory && isMemoryIndexFile(normalizedPath)) {
		return <TopicFileIcon magicVariant="magic-file-memory" className="block size-4 shrink-0" />
	}

	if (item.is_directory) {
		if (normalizedPath.length === 1 && normalizedPath[0] === MEMORY_ROOT_NAME) {
			return <TopicFileIcon magicVariant="magic-memory" className="block size-4 shrink-0" />
		}

		return <img src={FoldIcon as unknown as string} alt="" width={16} height={16} />
	}

	return <MagicFileIcon type={item.file_extension} size={16} />
}
