import type { LocateProjectFileActionOptions, UserAction, ViewActionOptions } from "../types"
import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum } from "../../document/types"
import { getCanvasResourceFileName } from "../../shared/path/canvasResourcePath"

interface SelectedMediaFile {
	src: string
	fileName?: string
}

function isLocatableProjectFilePath(path: string): boolean {
	const normalized = path.trim()
	if (!normalized) return false
	if (normalized.startsWith("blob:") || normalized.startsWith("data:")) return false
	if (/^[a-z]:[\\/]/i.test(normalized)) return true
	if (normalized.startsWith("//")) return false
	if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false
	return true
}

function resolveMediaElementFile(
	canvas: Canvas,
	elementId?: string | null,
): SelectedMediaFile | null {
	const selectedIds = canvas.selectionManager.getSelectedIds()
	const resolvedElementId = elementId ?? (selectedIds.length === 1 ? selectedIds[0] : null)
	if (!resolvedElementId) return null

	const element = canvas.elementManager.getElementData(resolvedElementId)
	if (!element) return null
	if (element.type !== ElementTypeEnum.Image && element.type !== ElementTypeEnum.Video)
		return null
	if (!element.src) return null
	if (!isLocatableProjectFilePath(element.src)) return null

	const entry =
		element.type === ElementTypeEnum.Image
			? canvas.imageResourceManager.getEntry(element.src)
			: undefined
	const fileName = entry?.fileName || getCanvasResourceFileName(element.src) || undefined

	return {
		src: element.src,
		fileName,
	}
}

export function resolveProjectFileLocationTarget(
	canvas: Canvas,
	elementId?: string | null,
): SelectedMediaFile | null {
	return resolveMediaElementFile(canvas, elementId)
}

/**
 * 视图操作相关的用户动作
 */
export const viewActions: UserAction[] = [
	{
		id: "view.zoom-in",
		category: "view",
		canExecute: () => {
			// 缩放操作总是可用
			return true
		},
		execute: (canvas) => {
			canvas.viewportController.zoomIn()
		},
	},
	{
		id: "view.zoom-out",
		category: "view",
		canExecute: () => {
			// 缩放操作总是可用
			return true
		},
		execute: (canvas) => {
			canvas.viewportController.zoomOut()
		},
	},
	{
		id: "view.zoom-fit",
		category: "view",
		canExecute: () => {
			// 缩放操作总是可用
			return true
		},
		execute: (canvas) => {
			canvas.viewportController.fitToScreen({ animated: true })
		},
	},
	{
		id: "view.focus-element",
		category: "view",
		canExecute: () => {
			// 定位操作总是可用（执行时会检查元素是否存在）
			return true
		},
		execute: (canvas, options?: ViewActionOptions) => {
			const elementIds = options?.elementIds
			if (!elementIds || elementIds.length === 0) {
				return
			}
			// 过滤出存在的元素ID
			const validElementIds = elementIds.filter((id) => canvas.elementManager.hasElement(id))
			if (validElementIds.length === 0) {
				return
			}
			// 先检测元素是否在可视区域
			const isInViewport = canvas.viewportController.isElementInViewport(validElementIds)
			// 如果不在可视区域，则移动到可视区域
			if (!isInViewport) {
				canvas.viewportController.moveElementToViewport(validElementIds, {
					animated: true,
					padding: { top: 50, right: 50, bottom: 50, left: 100 },
				})
			}
		},
	} satisfies UserAction<"view.focus-element", ViewActionOptions>,
	{
		id: "view.locate-project-file",
		category: "view",
		canExecute: (canvas, options?: LocateProjectFileActionOptions) => {
			return (
				!!canvas.magicConfigManager.config?.methods?.locateProjectFile &&
				resolveMediaElementFile(canvas, options?.elementId) !== null
			)
		},
		execute: async (canvas, options?: LocateProjectFileActionOptions) => {
			const locateProjectFile = canvas.magicConfigManager.config?.methods?.locateProjectFile
			if (!locateProjectFile) return

			const file = resolveMediaElementFile(canvas, options?.elementId)
			if (!file) return

			await locateProjectFile({
				filePath: file.src,
				fileName: file.fileName,
				locateInTree: true,
			})
		},
	} satisfies UserAction<"view.locate-project-file">,
]
