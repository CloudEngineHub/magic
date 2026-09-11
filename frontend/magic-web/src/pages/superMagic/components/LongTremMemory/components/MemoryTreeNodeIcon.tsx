import { isFixedUserMemoryEntry } from "./memoryTreeNodeUtils"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import FoldIcon from "@/pages/superMagic/assets/svg/file-folder.svg"
import { TopicFileIcon } from "@/pages/superMagic/components/TopicFilesButton/components/TopicFileIcon"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

interface MemoryTreeNodeIconProps {
	item: AttachmentItem
	pathSegments: string[]
	size?: number
}

/** 记忆根目录与索引文件使用专属图标，其余节点与项目文件保持一致。 */
export function MemoryTreeNodeIcon({ item, pathSegments, size = 16 }: MemoryTreeNodeIconProps) {
	const path = pathSegments.join("/")

	if (!item.is_directory && isFixedUserMemoryEntry(path, false)) {
		return <TopicFileIcon magicVariant="magic-file-memory" size={size} />
	}

	if (item.is_directory) {
		if (path === ".magic/memory") {
			return <TopicFileIcon magicVariant="magic-memory" size={size} />
		}

		return <img src={FoldIcon as unknown as string} alt="" width={size} height={size} />
	}

	return <MagicFileIcon type={item.file_extension} size={size} />
}
