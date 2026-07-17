import type { Canvas } from "../../../runtime/core/Canvas"
import { AttachmentSource } from "../../../public/magic-types"
import { getLoadedFileElements, getLoadedImageElements } from "../../../runtime/shared/ids"
import {
	getCanvasResourceFileName,
	toCanonicalCanvasResourcePath,
} from "../../../runtime/shared/path/canvasResourcePath"

/**
 * 画布下载菜单判定「图片」扩展名（语义与宿主 Topic isImage 对齐；枚举值见 types.magic 的 AttachmentSource）。
 */
const DOWNLOAD_MENU_IMAGE_EXTENSIONS: readonly string[] = [
	"jpg",
	"jpeg",
	"png",
	"gif",
	"bmp",
	"svg",
	"webp",
	"ico",
	"tiff",
	"tif",
	"sh",
]

export interface CanvasDownloadMenuContext {
	/** 与 Topic 一致：仅图片、无视频，且每张图在资源管理器缓存中为 AI 源、扩展名为图片 */
	useAiImageSubmenu: boolean
	selectionKind: "video-only" | "mixed" | "image-only" | "none"
}

function extensionFromFileNameOrPath(fileName: string, path?: string): string {
	const withDot =
		fileName && fileName.includes(".")
			? fileName
			: getCanvasResourceFileName(path) || path || ""
	const base = getCanvasResourceFileName(withDot) || withDot
	const dot = base.lastIndexOf(".")
	return dot >= 0
		? base
				.slice(dot + 1)
				.toLowerCase()
				.trim()
		: ""
}

function isRasterImageFile(fileName: string, path?: string): boolean {
	const ext = extensionFromFileNameOrPath(fileName, path)
	if (!ext) return false
	return DOWNLOAD_MENU_IMAGE_EXTENSIONS.includes(ext)
}

/**
 * 仅从 ImageResourceManager 条目上换链写入的 source/fileName 解析下载菜单（不在菜单层调用 getFileInfo）
 */
export async function resolveCanvasDownloadMenuContext(
	canvas: Canvas,
): Promise<CanvasDownloadMenuContext> {
	const loaded = getLoadedFileElements(canvas)
	if (loaded.length === 0) {
		return {
			useAiImageSubmenu: false,
			selectionKind: "none",
		}
	}

	const hasVideo = loaded.some((e) => e.type === "video")
	const hasImage = loaded.some((e) => e.type === "image")

	let selectionKind: CanvasDownloadMenuContext["selectionKind"]
	if (hasVideo && hasImage) selectionKind = "mixed"
	else if (hasVideo) selectionKind = "video-only"
	else if (hasImage) selectionKind = "image-only"
	else selectionKind = "none"

	if (!hasImage || hasVideo) {
		return {
			useAiImageSubmenu: false,
			selectionKind,
		}
	}

	const imageElements = getLoadedImageElements(canvas)
	if (imageElements.length === 0) {
		return {
			useAiImageSubmenu: false,
			selectionKind,
		}
	}

	const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
	const flags = await Promise.all(
		imageElements.map(async (img) => {
			if (!img.src) return false
			const entry = await canvas.imageResourceManager.getEntry(img.src)
			if (!entry?.fileName) return false
			const normalizedSrc = toCanonicalCanvasResourcePath(img.src, resolveAbs)
			const isImage = isRasterImageFile(entry.fileName, normalizedSrc)
			const isAi = entry.source === AttachmentSource.AI
			return isImage && isAi
		}),
	)

	const useAiImageSubmenu = flags.length > 0 && flags.every(Boolean)

	return { useAiImageSubmenu, selectionKind }
}
