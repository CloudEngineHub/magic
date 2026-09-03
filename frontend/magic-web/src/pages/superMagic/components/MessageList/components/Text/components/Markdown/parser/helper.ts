import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import {
	normalizeWorkspacePathForComparison,
	parseCanonicalWorkspaceHref,
} from "@/pages/superMagic/utils/filePathMention"
import { safeDecodeURIComponent } from "@/utils/encoding"

/**
 * XMarkdown 会把中文 URL 转义，这里还原成中文路径。
 */
export function decodePathForDisplay(path: string): string {
	if (!path) return ""

	return safeDecodeURIComponent(path)
}

/**
 * 根据相对路径从附件列表中查找文件
 * @param attachments - 附件列表
 * @param relativePath - 相对路径 (例如: "./images/photo.png" 或 "/path/to/file.png")
 * @returns 找到的文件信息或 undefined
 */
export function findAttachmentByPath(
	attachments: AttachmentItem[],
	relativePath: string,
): AttachmentItem | undefined {
	if (!Array.isArray(attachments) || attachments.length === 0) {
		return undefined
	}

	const normalizedSearchPath =
		parseCanonicalWorkspaceHref(relativePath) ??
		normalizeWorkspacePathForComparison(relativePath)
	if (!normalizedSearchPath) return undefined

	return findAttachmentByNormalizedPath(attachments, normalizedSearchPath)
}

function findAttachmentByNormalizedPath(
	attachments: AttachmentItem[],
	normalizedSearchPath: string,
): AttachmentItem | undefined {
	for (const item of attachments) {
		// 递归搜索子节点
		if (item.children) {
			const found = findAttachmentByNormalizedPath(item.children, normalizedSearchPath)
			if (found) return found
		}

		// 检查 relative_file_path 是否匹配
		if (item.relative_file_path) {
			const normalizedItemPath = normalizeWorkspacePathForComparison(item.relative_file_path)
			if (normalizedItemPath === normalizedSearchPath) {
				return item
			}
		}

		// 也检查 path 字段作为备选
		if (item.path) {
			const normalizedItemPath = normalizeWorkspacePathForComparison(item.path)
			if (normalizedItemPath === normalizedSearchPath) {
				return item
			}
		}
	}

	return undefined
}
