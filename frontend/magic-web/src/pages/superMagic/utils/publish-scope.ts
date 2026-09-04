import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"

const DEFAULT_PUBLISH_ROOT = ".magic"

type AttachmentPathFields = AttachmentItem & {
	file_path?: string
	file_type?: string
}

function normalizePath(value: unknown): string {
	if (typeof value !== "string") return ""
	return value
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/^\.\//, "")
		.replace(/\/+$/, "")
}

function isDirectory(item: AttachmentItem): boolean {
	const candidate = item as AttachmentPathFields
	return Boolean(
		item.is_directory || item.type === "directory" || candidate.file_type === "directory",
	)
}

function getItemName(item: AttachmentItem): string {
	return (
		item.file_name?.trim() ||
		item.name?.trim() ||
		item.filename?.trim() ||
		item.display_filename?.trim() ||
		""
	)
}

function getItemPath(item: AttachmentItem, fallbackParentPath = ""): string {
	const candidate = item as AttachmentPathFields
	const explicitPath = normalizePath(item.relative_file_path ?? candidate.file_path ?? item.path)
	if (explicitPath) return explicitPath

	const name = normalizePath(getItemName(item))
	if (!name) return normalizePath(fallbackParentPath)
	return [normalizePath(fallbackParentPath), name].filter(Boolean).join("/")
}

function collectFilePaths(items: AttachmentItem[], parentPath = ""): string[] {
	const paths: string[] = []

	for (const item of items) {
		const itemPath = getItemPath(item, parentPath)
		if (isDirectory(item)) {
			if (item.children?.length) paths.push(...collectFilePaths(item.children, itemPath))
			continue
		}

		if (itemPath) paths.push(itemPath)
	}

	return paths
}

/**
 * Returns project-relative file paths that will not be included by the publish exporter.
 * Directory entries are intentionally ignored; only files can make the notice necessary.
 */
export function findFilesOutsidePublishRoot(
	items: AttachmentItem[],
	publishRoot = DEFAULT_PUBLISH_ROOT,
): string[] {
	const normalizedRoot = normalizePath(publishRoot)
	if (!normalizedRoot) return []

	const rootPrefix = `${normalizedRoot}/`
	return Array.from(
		new Set(
			collectFilePaths(items).filter(
				(path) => path !== normalizedRoot && !path.startsWith(rootPrefix),
			),
		),
	).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

export function hasFilesOutsidePublishRoot(
	items: AttachmentItem[],
	publishRoot = DEFAULT_PUBLISH_ROOT,
): boolean {
	return findFilesOutsidePublishRoot(items, publishRoot).length > 0
}
