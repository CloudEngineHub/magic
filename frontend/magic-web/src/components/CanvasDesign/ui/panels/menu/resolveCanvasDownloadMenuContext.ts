import type { Canvas } from "../../../runtime/core/Canvas"
import { AttachmentSource } from "../../../public/magic-types"
import { getSelectedFileElements, getSelectedImageElements } from "../../../runtime/shared/ids"
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
	/** 与 Topic 单文件一致：仅一张图片，且附件元信息表明它是 AI 图片。 */
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
	const selectedMedia = getSelectedFileElements(canvas)
	if (selectedMedia.length === 0) {
		return {
			useAiImageSubmenu: false,
			selectionKind: "none",
		}
	}

	const hasVideo = selectedMedia.some((e) => e.type === "video")
	const hasImage = selectedMedia.some((e) => e.type === "image")

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

	const imageElements = getSelectedImageElements(canvas)
	// 项目文件多选下载只有一个入口；AI 图片子菜单只对单文件开放。
	if (imageElements.length !== 1) {
		return {
			useAiImageSubmenu: false,
			selectionKind,
		}
	}

	const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
	const getFileResourceMeta = canvas.magicConfigManager.config?.methods?.getFileResourceMeta
	const flags = await Promise.all(
		imageElements.map(async (img) => {
			if (!img.src) return false
			const meta = getFileResourceMeta
				? await getFileResourceMeta(img.src).catch(() => null)
				: null
			const entry =
				meta?.status === "exists"
					? meta
					: await canvas.imageResourceManager.getEntry(img.src)
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
