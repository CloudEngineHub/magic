import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"

function getFileName(item: AttachmentItem): string {
	return item.file_name || item.filename || item.name || ""
}

function getFileExtension(item: AttachmentItem): string {
	const extension = item.file_extension || getFileName(item).split(".").pop() || ""
	return extension.toLowerCase()
}

function getNormalizedPath(item: AttachmentItem): string {
	return (item.relative_file_path || item.file_key || item.path || getFileName(item)).replace(
		/^\/+/,
		"",
	)
}

function hasPathInfo(item: AttachmentItem): boolean {
	return Boolean(item.relative_file_path || item.file_key || item.path)
}

export function getAttachmentId(item: AttachmentItem): string {
	return (
		item.file_id ||
		item.relative_file_path ||
		item.path ||
		`${item.parent_id || "root"}:${getFileName(item)}`
	)
}

export function getMicroAppPreviewPath(item: AttachmentItem | null): string {
	if (!item) return "/"

	const fileName = item.display_filename || item.file_name || item.filename || "index.html"
	const relativePath = item.relative_file_path || fileName
	const normalizedPath = relativePath.replace(/^\/+/, "")

	return /^index\.html?$/i.test(normalizedPath) ? "/" : `/${normalizedPath}`
}

export function isHtmlFile(item: AttachmentItem): boolean {
	if (item.is_hidden || item.is_directory || item.type === "directory") return false

	const extension = getFileExtension(item)
	return extension === "html" || extension === "htm"
}

export function collectHtmlFiles(items: AttachmentItem[]): AttachmentItem[] {
	return items.filter(isHtmlFile)
}

export function isRootHtmlFile(item: AttachmentItem): boolean {
	if (!isHtmlFile(item)) return false

	const normalizedPath = getNormalizedPath(item)
	const isRootPath = !normalizedPath.includes("/")
	if (hasPathInfo(item)) return isRootPath

	return isRootPath && !item.parent_id
}

export function collectRootHtmlFiles(items: AttachmentItem[]): AttachmentItem[] {
	return items.filter(isRootHtmlFile)
}

export function resolveDefaultHtmlEntry(items: AttachmentItem[]): AttachmentItem | null {
	const rootHtmlFiles = collectRootHtmlFiles(items)
	if (rootHtmlFiles.length === 0) return null

	const indexHtml = rootHtmlFiles.find((item) => getFileName(item).toLowerCase() === "index.html")
	if (indexHtml) return indexHtml

	const indexHtm = rootHtmlFiles.find((item) => getFileName(item).toLowerCase() === "index.htm")
	if (indexHtm) return indexHtm

	return rootHtmlFiles[0]
}

export function resolveSelectedHtmlEntry({
	items,
	selectedFileId,
}: {
	items: AttachmentItem[]
	selectedFileId: string | null
}): AttachmentItem | null {
	const rootHtmlFiles = collectRootHtmlFiles(items)
	if (rootHtmlFiles.length === 0) return null

	if (selectedFileId) {
		const selected = rootHtmlFiles.find((item) => getAttachmentId(item) === selectedFileId)
		if (selected) return selected
	}

	return resolveDefaultHtmlEntry(rootHtmlFiles)
}
