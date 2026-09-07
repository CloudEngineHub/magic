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
	const suffixMatches: AttachmentItem[] = []
	const searchBaseName = normalizedSearchPath.split("/").pop() || ""

	const visit = (items: AttachmentItem[]): AttachmentItem | undefined => {
		for (const item of items) {
			if (item.children) {
				const foundInChildren = visit(item.children)
				if (foundInChildren) return foundInChildren
			}

			const candidates = [item.relative_file_path, item.path].filter(
				(value): value is string => Boolean(value),
			)
			for (const candidate of candidates) {
				const normalizedItemPath = normalizeWorkspacePathForComparison(candidate)
				if (!normalizedItemPath) continue
				if (normalizedItemPath === normalizedSearchPath) {
					return item
				}
				if (normalizedItemPath.endsWith(`/${normalizedSearchPath}`)) {
					suffixMatches.push(item)
					break
				}
			}
		}
		return undefined
	}

	const exact = visit(attachments)
	if (exact) return exact

	// Canvas mentions often carry canvas-relative paths (`images/x.png`) while
	// workspace attachments are prefixed (`画布名/images/x.png`). Accept a unique suffix hit.
	const uniqueSuffixMatches = Array.from(new Set(suffixMatches))
	if (uniqueSuffixMatches.length === 1) return uniqueSuffixMatches[0]
	if (uniqueSuffixMatches.length > 1 && searchBaseName) {
		const byBaseName = uniqueSuffixMatches.filter((item) => {
			const name = String(item.file_name || item.filename || item.name || "")
				.trim()
				.toLowerCase()
			return name === searchBaseName.toLowerCase()
		})
		if (byBaseName.length === 1) return byBaseName[0]
	}
	return undefined
}
