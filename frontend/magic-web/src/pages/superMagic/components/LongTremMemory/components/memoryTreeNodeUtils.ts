import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

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
