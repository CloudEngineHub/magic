import { peekProjectAttachmentDragHoverPlainText } from "../../../editors/message/reference-assets/projectAttachmentDragHoverBridge"
import { IMAGE_FILE_EXTENSIONS } from "../assets/fileAssets"

export const PROJECT_ATTACHMENT_DRAG_MIME = "application/x-magic-project-attachment"

// 左侧文件树拖拽 payload 只认这些来源类型，其他内容静默丢弃。
const PROJECT_ATTACHMENT_DRAG_TYPES = new Set([
	"project_file",
	"project_directory",
	"multiple_files",
])

interface ProjectAttachmentItem {
	display_filename?: string
	file_extension?: string
	file_name?: string
	file_path?: string
	filename?: string
	is_directory?: boolean
	name?: string
	path?: string
	relative_file_path?: string
}

interface ProjectAttachmentDragData {
	type?: string
	data?: ProjectAttachmentItem | ProjectAttachmentItem[]
}

export interface ProjectAttachmentImageFile {
	path: string
	fileName?: string
}

function normalizeString(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined
	const trimmedValue = value.trim()
	return trimmedValue || undefined
}

/** 获取项目附件路径 */
function getProjectAttachmentPath(item: ProjectAttachmentItem): string | undefined {
	return (
		normalizeString(item.relative_file_path) ||
		normalizeString(item.file_path) ||
		normalizeString(item.path)
	)
}

/** 获取文件名从路径 */
function getFileNameFromPath(path: string): string | undefined {
	return path.split("/").filter(Boolean).pop()
}

/** 获取项目附件文件名 */
function getProjectAttachmentFileName(item: ProjectAttachmentItem): string | undefined {
	const path = getProjectAttachmentPath(item)
	return (
		normalizeString(item.file_name) ||
		normalizeString(item.display_filename) ||
		normalizeString(item.filename) ||
		normalizeString(item.name) ||
		(path ? getFileNameFromPath(path) : undefined)
	)
}

/** 获取项目附件文件扩展名 */
function getProjectAttachmentExtension(item: ProjectAttachmentItem): string | undefined {
	const explicitExtension = normalizeString(item.file_extension)
	if (explicitExtension) return explicitExtension.replace(/^\./, "").toLowerCase()

	const fileNameOrPath = getProjectAttachmentFileName(item) || getProjectAttachmentPath(item)
	const extension = fileNameOrPath?.split(".").pop()
	return extension && extension !== fileNameOrPath ? extension.toLowerCase() : undefined
}

// 只把图片文件转成插件可接收的 path 列表，文件夹不递归展开。
function isProjectAttachmentImageFile(item: ProjectAttachmentItem): boolean {
	if (item.is_directory) return false
	const extension = getProjectAttachmentExtension(item)
	return Boolean(extension && IMAGE_FILE_EXTENSIONS.has(extension))
}

/** 规范化项目附件拖拽数据 */
function normalizeProjectAttachmentItems(data: ProjectAttachmentDragData): ProjectAttachmentItem[] {
	if (data.type === "multiple_files") {
		return Array.isArray(data.data) ? data.data.filter(Boolean) : []
	}
	if (data.type === "project_file" || data.type === "project_directory") {
		return data.data && !Array.isArray(data.data) ? [data.data] : []
	}
	return []
}

/** 检查是否包含项目附件拖拽数据 */
export function hasProjectAttachmentDragPayload(
	dataTransfer: Pick<DataTransfer, "types"> | null | undefined,
): boolean {
	if (
		dataTransfer &&
		Array.from(dataTransfer.types || []).includes(PROJECT_ATTACHMENT_DRAG_MIME)
	) {
		return true
	}

	return Boolean(parseProjectAttachmentDragData(peekProjectAttachmentDragHoverPlainText() || ""))
}

/** 解析左侧文件树写入的项目附件拖拽数据 */
export function parseProjectAttachmentDragData(rawData: string): ProjectAttachmentDragData | null {
	if (!rawData) return null

	try {
		const parsedData = JSON.parse(rawData) as ProjectAttachmentDragData
		if (!parsedData || !PROJECT_ATTACHMENT_DRAG_TYPES.has(parsedData.type || "")) {
			return null
		}
		return parsedData
	} catch {
		return null
	}
}

/** 解析项目附件拖拽数据，提取图片文件 */
export function getProjectAttachmentImageFilesFromDragData(
	data: ProjectAttachmentDragData | null,
): ProjectAttachmentImageFile[] {
	if (!data) return []

	return normalizeProjectAttachmentItems(data).flatMap((item) => {
		if (!isProjectAttachmentImageFile(item)) return []
		const path = getProjectAttachmentPath(item)
		if (!path) return []
		return [
			{
				path,
				fileName: getProjectAttachmentFileName(item),
			},
		]
	})
}

/** drop 阶段只从项目附件自定义 MIME 提取图片文件；非图片与文件夹都会被静默过滤 */
export function getProjectAttachmentImageFilesFromDataTransfer(
	dataTransfer: Pick<DataTransfer, "getData"> | null | undefined,
): ProjectAttachmentImageFile[] {
	if (!dataTransfer) return []
	const rawData =
		dataTransfer.getData(PROJECT_ATTACHMENT_DRAG_MIME) ||
		peekProjectAttachmentDragHoverPlainText() ||
		""

	return getProjectAttachmentImageFilesFromDragData(parseProjectAttachmentDragData(rawData))
}
