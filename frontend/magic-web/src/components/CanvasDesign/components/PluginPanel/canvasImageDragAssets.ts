import type { Canvas } from "../../canvas/Canvas"
import { ElementTypeEnum, type ImageElement } from "../../canvas/types"
import { pickPluginFiles, resolvePluginFileByPath } from "./fileAssets"
import type { PluginFileAsset } from "./types"

const PNG_MIME_TYPE = "image/png"

/** 根据画布图片名称生成插件侧上传时使用的 PNG 文件名 */
function getPngFilename(element: ImageElement): string {
	const name = element.name?.trim() || "canvas-image"
	const sanitized = name.replace(/[\\/:*?"<>|]+/g, "-")
	return sanitized.toLowerCase().endsWith(".png") ? sanitized : `${sanitized}.png`
}

/** 判断图片在画布上是否存在需要重新渲染的视觉修改 */
function hasVisualImageModification(element: ImageElement): boolean {
	return Boolean(element.crop)
}

/**
 * 把图片元素按画布当前视觉效果导出成插件可识别的文件资产。
 *
 * 裁剪效果只存在于画布元素上，不能直接复用原始图片文件。
 */
async function exportImageElementAsAsset(
	canvas: Canvas,
	element: ImageElement,
): Promise<PluginFileAsset> {
	const exportResult = await canvas.clipboardManager.exportElementsAsPNGBlob([element.id], {
		preferOriginalSingleImage: false,
	})
	if (!exportResult) {
		throw new Error("Failed to export image element.")
	}

	const file = new File([exportResult.blob], exportResult.filename || getPngFilename(element), {
		type: PNG_MIME_TYPE,
	})
	const [asset] = await pickPluginFiles(canvas, [file], { type: "image", maxCount: 1 })
	if (!asset) {
		throw new Error("Failed to upload exported image.")
	}
	return asset
}

/**
 * 将画布图片元素解析为插件文件资产。
 *
 * 未被裁剪的图片直接复用原始资源；存在裁剪时重新导出 PNG，
 * 保证插件拿到的是用户当前在画布上看到的结果。
 */
async function resolveImageElementAsAsset(
	canvas: Canvas,
	element: ImageElement,
): Promise<PluginFileAsset> {
	if (!element.src) {
		throw new Error("Image element source is empty.")
	}

	if (hasVisualImageModification(element)) {
		return exportImageElementAsAsset(canvas, element)
	}

	return resolvePluginFileByPath(canvas, element.src, {
		type: "image",
		fileName: element.name,
	})
}

/** 批量解析外部拖拽中的图片元素，非图片元素会直接视为非法拖拽数据 */
export async function resolveCanvasImageDragAssets(
	canvas: Canvas,
	elementIds: string[],
): Promise<PluginFileAsset[]> {
	const elements = elementIds.map((elementId) => canvas.elementManager.getElementData(elementId))
	const imageElements = elements.filter(
		(element): element is ImageElement =>
			Boolean(element) && element?.type === ElementTypeEnum.Image && Boolean(element.src),
	)

	if (imageElements.length !== elementIds.length) {
		throw new Error("Only image elements can be dropped into plugins.")
	}

	return Promise.all(imageElements.map((element) => resolveImageElementAsAsset(canvas, element)))
}
