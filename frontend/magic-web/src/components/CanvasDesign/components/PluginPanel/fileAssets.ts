import { getMediaDimensions, isImageFile, validateFile } from "../../canvas/utils/utils"
import type { Canvas } from "../../canvas/Canvas"
import type { ReferenceResourcePanelItem } from "../../types"
import type { ReferenceResourceTypeFilter } from "../MessageEditor/reference-assets/reference-resource.types"
import type { PluginPickFilesOptions } from "./runtime/v1"
import type { PluginFileAsset, PluginFilePickerType } from "./types"

export async function pickPluginFiles(
	canvas: Canvas,
	files: File[],
	options?: PluginPickFilesOptions,
): Promise<PluginFileAsset[]> {
	if (canvas.readonly) {
		throw new Error("Canvas is readonly.")
	}

	const maxCount = Math.max(1, options?.maxCount ?? (options?.multiple ? files.length : 1))
	const acceptedFiles = files
		.slice(0, maxCount)
		.filter((file) => validatePluginPickedFile(file, options))

	if (acceptedFiles.length === 0) {
		return []
	}

	const dimensions = await Promise.all(
		acceptedFiles.map((file) =>
			options?.type === "image" || isImageFile(file)
				? getMediaDimensions(file).catch(
						(): { width: number; height: number } | undefined => undefined,
					)
				: Promise.resolve(undefined),
		),
	)
	const uploadResults = await canvas.canvasFileUploadManager.uploadDirect(acceptedFiles)

	return uploadResults.map((result, index) => ({
		id: result.path || result.src,
		path: result.path,
		url: result.src,
		src: result.src,
		fileName: result.fileName,
		type: inferPluginFileType(acceptedFiles[index]),
		width: dimensions[index]?.width,
		height: dimensions[index]?.height,
	}))
}

export async function resolveProjectPluginFile(
	canvas: Canvas,
	item: ReferenceResourcePanelItem,
	options?: PluginPickFilesOptions,
): Promise<PluginFileAsset> {
	const getFileInfo = canvas.magicConfigManager.config?.methods?.getFileInfo
	if (!getFileInfo) {
		throw new Error("getFileInfo method not available.")
	}
	const path = item.data.file_path
	const type = options?.type ?? inferPluginFileTypeFromPath(path)
	const fileInfo = await getFileInfo(path, { useImageProcess: type === "image" })
	const dimensions =
		type === "image"
			? await getImageDimensionsFromUrl(fileInfo.src).catch(
					(): { width: number; height: number } | undefined => undefined,
				)
			: undefined

	return {
		id: path,
		path,
		url: fileInfo.src,
		src: fileInfo.src,
		fileName: fileInfo.fileName || item.data.file_name,
		type,
		width: dimensions?.width,
		height: dimensions?.height,
	}
}

export function getPluginFilePickerAccept(options?: PluginPickFilesOptions): string {
	if (options?.accept?.length) return options.accept.join(",")
	if (options?.type === "image") return "image/*"
	if (options?.type === "video") return "video/*"
	if (options?.type === "audio") return "audio/*"
	return ""
}

export function getPluginReferenceResourceType(
	options?: PluginPickFilesOptions,
): ReferenceResourceTypeFilter {
	if (options?.type === "image") return "image"
	if (options?.type === "video") return "video"
	if (options?.type === "audio") return "audio"
	return "file"
}

function getImageDimensionsFromUrl(url: string): Promise<{ width: number; height: number }> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => {
			resolve({
				width: image.naturalWidth,
				height: image.naturalHeight,
			})
		}
		image.onerror = () => {
			reject(new Error("Failed to load selected project image."))
		}
		image.src = url
	})
}

function validatePluginPickedFile(file: File, options?: PluginPickFilesOptions): boolean {
	const validation = validateFile(file)
	if (!validation.valid) return false
	if (options?.type === "image") return isImageFile(file)
	if (options?.type === "video") return file.type.startsWith("video/")
	if (options?.type === "audio") return file.type.startsWith("audio/")
	return true
}

function inferPluginFileType(file: File | undefined): PluginFilePickerType {
	if (!file) return "file"
	if (isImageFile(file)) return "image"
	if (file.type.startsWith("video/")) return "video"
	if (file.type.startsWith("audio/")) return "audio"
	return "file"
}

function inferPluginFileTypeFromPath(path: string): PluginFilePickerType {
	const extension = path.split(".").pop()?.toLowerCase()
	if (extension && ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(extension)) {
		return "image"
	}
	if (extension && ["mp4", "webm", "mov", "m4v"].includes(extension)) {
		return "video"
	}
	if (extension && ["mp3", "wav", "m4a", "aac", "ogg"].includes(extension)) {
		return "audio"
	}
	return "file"
}
