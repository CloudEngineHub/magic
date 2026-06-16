import type { FileItem } from "../../../components/FilesViewer/types"

const DESIGN_DISPLAY_TYPE = "design"
const MAGIC_PROJECT_FILE_NAME = "magic.project.js"

interface IsDesignMagicProjectFileOptions {
	file?: Partial<FileItem> | null
	fileName?: string
	attachments?: FileItem[] | null
	flatAttachments?: FileItem[] | null
}

export function isDesignMagicProjectFile({
	file,
	fileName,
	attachments,
	flatAttachments,
}: IsDesignMagicProjectFileOptions): boolean {
	const resolvedFileName = getBaseFileName(fileName || getNodeFileName(file))
	if (resolvedFileName !== MAGIC_PROJECT_FILE_NAME) return false

	const fileList = collectFiles({ attachments, flatAttachments })
	const currentFile = resolveCurrentFile(file, fileList)
	if (isDesignDisplayNode(file) || isDesignDisplayNode(currentFile)) return true

	const parentFile = resolveParentFile({
		file: currentFile || file,
		fileList,
		attachments,
	})

	return isDesignDisplayNode(parentFile)
}

function collectFiles(options: {
	attachments?: FileItem[] | null
	flatAttachments?: FileItem[] | null
}): FileItem[] {
	const result: FileItem[] = []
	const seen = new Set<string>()

	const pushFile = (item: FileItem) => {
		const key = getFileIdentity(item)
		if (key) {
			if (seen.has(key)) return
			seen.add(key)
		}
		result.push(item)
	}

	const pushTree = (items?: FileItem[] | null) => {
		for (const item of items || []) {
			pushFile(item)
			if (item.children?.length) pushTree(item.children)
		}
	}

	for (const item of options.flatAttachments || []) {
		pushFile(item)
	}
	pushTree(options.attachments)

	return result
}

function resolveCurrentFile(
	file: Partial<FileItem> | null | undefined,
	fileList: FileItem[],
): FileItem | Partial<FileItem> | undefined {
	if (!file) return undefined

	const fileId = normalizeFileId(file.file_id)
	if (fileId) {
		const matchedById = fileList.find((item) => normalizeFileId(item.file_id) === fileId)
		if (matchedById) return matchedById
	}

	const relativePath = normalizeComparablePath(file.relative_file_path)
	if (relativePath) {
		const matchedByPath = fileList.find(
			(item) => normalizeComparablePath(item.relative_file_path) === relativePath,
		)
		if (matchedByPath) return matchedByPath
	}

	const parentId = normalizeFileId(file.parent_id)
	if (parentId) {
		const fileName = getBaseFileName(getNodeFileName(file))
		const matchedByParent = fileList.find(
			(item) =>
				!item.is_directory &&
				normalizeFileId(item.parent_id) === parentId &&
				getBaseFileName(getNodeFileName(item)) === fileName,
		)
		if (matchedByParent) return matchedByParent
	}

	return file
}

function resolveParentFile(options: {
	file: Partial<FileItem> | null | undefined
	fileList: FileItem[]
	attachments?: FileItem[] | null
}): FileItem | undefined {
	const { file, fileList, attachments } = options
	if (!file) return undefined

	const parentId = normalizeFileId(file.parent_id)
	if (parentId) {
		const matchedByParentId = fileList.find(
			(item) => normalizeFileId(item.file_id) === parentId,
		)
		if (matchedByParentId) return matchedByParentId
	}

	const fileId = normalizeFileId(file.file_id)
	if (fileId) {
		const matchedTreeParent = findParentInTree(attachments || [], fileId)
		if (matchedTreeParent) return matchedTreeParent
	}

	const parentPath = getParentDirectoryPath(file.relative_file_path)
	if (parentPath) {
		return fileList.find(
			(item) =>
				item.is_directory &&
				normalizeComparablePath(item.relative_file_path) === parentPath,
		)
	}

	return undefined
}

function findParentInTree(items: FileItem[], childFileId: string): FileItem | undefined {
	for (const item of items) {
		if (item.children?.some((child) => normalizeFileId(child.file_id) === childFileId)) {
			return item
		}

		const matchedParent = findParentInTree(item.children || [], childFileId)
		if (matchedParent) return matchedParent
	}

	return undefined
}

function isDesignDisplayNode(file: Partial<FileItem> | null | undefined): boolean {
	return file?.display_config?.type === DESIGN_DISPLAY_TYPE
}

function getNodeFileName(file: Partial<FileItem> | null | undefined): string {
	return (
		file?.file_name ||
		file?.filename ||
		file?.display_filename ||
		file?.relative_file_path ||
		""
	)
}

function getBaseFileName(value: unknown): string {
	if (typeof value !== "string") return ""

	const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "")
	return normalized.split("/").pop()?.toLowerCase() || ""
}

function getParentDirectoryPath(value: unknown): string {
	const normalized = normalizeComparablePath(value)
	const lastSlashIndex = normalized.lastIndexOf("/")
	if (lastSlashIndex < 0) return ""

	return normalized.slice(0, lastSlashIndex)
}

function normalizeComparablePath(value: unknown): string {
	if (typeof value !== "string") return ""

	return value
		.replace(/\\/g, "/")
		.replace(/^\.?\//, "")
		.replace(/\/+$/, "")
}

function normalizeFileId(fileId: unknown): string {
	if (typeof fileId === "string") return fileId
	if (typeof fileId === "number") return String(fileId)

	return ""
}

function getFileIdentity(file: Partial<FileItem>): string {
	return (
		normalizeFileId(file.file_id) ||
		normalizeComparablePath(file.relative_file_path) ||
		`${normalizeFileId(file.parent_id)}:${getBaseFileName(getNodeFileName(file))}`
	)
}
