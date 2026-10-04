import { toast } from "sonner"
import type { CanvasDesignMethods } from "../../public/magic-types"
import { GenerationStatus } from "../../public/magic-types"
import type { Canvas } from "../core/Canvas"
import { getActiveImageContent, getImageContents } from "../document/elementContent"
import { ElementTypeEnum, type ImageElement, type ImageElementContent } from "../document/types"
import { resolveCanvasStorageResourceReference } from "../shared/path/canvasResourcePath"
import type { DeleteImageFileActionOptions } from "./types"

interface ResolvedImageContent {
	content: ImageElementContent
	fileId: string
}

interface ImageResourceReference {
	elementId: string
	contentId: string
	src: string
	fileId?: string
}

interface ImageFileDeletionTarget {
	elementId: string
	element: ImageElement
}

interface ImageElementInstanceWithContentDeletion {
	deleteActiveContent: () => boolean
}

function translate(canvas: Canvas, key: string, fallback: string): string {
	return canvas.t?.(key, fallback) ?? fallback
}

function getMethods(canvas: Canvas): CanvasDesignMethods | undefined {
	return canvas.magicConfigManager.config?.methods
}

function getTarget(
	canvas: Canvas,
	options?: DeleteImageFileActionOptions,
): ImageFileDeletionTarget | null {
	const selectedIds = canvas.selectionManager.getSelectedIds()
	const elementId = options?.elementId ?? (selectedIds.length === 1 ? selectedIds[0] : undefined)
	if (!elementId) return null
	if (selectedIds.length > 1 || (selectedIds.length === 1 && selectedIds[0] !== elementId)) {
		return null
	}
	const element = canvas.elementManager.getElementData(elementId)
	if (!element || element.type !== ElementTypeEnum.Image) return null
	return { elementId, element }
}

function canDeleteSelectedImageFile(
	canvas: Canvas,
	options?: DeleteImageFileActionOptions,
): boolean {
	if (!canvas.permissionManager.can("document.delete")) return false
	if (canvas.connectionManager.hasSelectedConnection()) return false
	const methods = getMethods(canvas)
	if (!methods?.confirmModal || !methods.deleteProjectFiles) return false
	const target = getTarget(canvas, options)
	return target ? canvas.permissionManager.canDelete(target.element) : false
}

function resolveImageContentFile(
	canvas: Canvas,
	content: ImageElementContent,
): ResolvedImageContent | null {
	const src = content.src?.trim()
	const resolveResourceReference = getMethods(canvas)?.resolveResourceReference
	if (!src || !resolveResourceReference) return null

	const resolution = resolveCanvasStorageResourceReference(src, resolveResourceReference, {
		requireAttachment: true,
	})
	if (
		resolution.status !== "resolved" ||
		resolution.resourceKind !== "workspace-file" ||
		!resolution.attachmentId
	) {
		return null
	}
	return { content, fileId: resolution.attachmentId }
}

function getImageResourceReferences(canvas: Canvas): ImageResourceReference[] {
	const references: ImageResourceReference[] = []
	for (const elementId of canvas.elementManager.getAllElementIds()) {
		const element = canvas.elementManager.getElementData(elementId)
		if (!element || element.type !== ElementTypeEnum.Image) continue
		for (const content of getImageContents(element)) {
			const src = content.src?.trim()
			if (!src) continue
			references.push({
				elementId,
				contentId: content.contentId,
				src,
				fileId: resolveImageContentFile(canvas, content)?.fileId,
			})
		}
	}
	return references
}

function hasOtherReference(
	references: ImageResourceReference[],
	targetElementId: string,
	target: ResolvedImageContent,
): boolean {
	return references.some(
		(reference) =>
			(reference.elementId !== targetElementId ||
				reference.contentId !== target.content.contentId) &&
			(reference.fileId === target.fileId || reference.src === target.content.src?.trim()),
	)
}

function hasReferenceOutsideElement(
	references: ImageResourceReference[],
	targetElementId: string,
	targets: ResolvedImageContent[],
): boolean {
	const targetFileIds = new Set(targets.map((target) => target.fileId))
	const targetSources = new Set(
		targets
			.map((target) => target.content.src?.trim())
			.filter((src): src is string => Boolean(src)),
	)
	return references.some(
		(reference) =>
			reference.elementId !== targetElementId &&
			((reference.fileId && targetFileIds.has(reference.fileId)) ||
				targetSources.has(reference.src)),
	)
}

function showError(canvas: Canvas, key: string, fallback: string): void {
	toast.error(translate(canvas, key, fallback))
}

async function moveFilesToRecycleBin(canvas: Canvas, fileIds: readonly string[]): Promise<boolean> {
	const deleteProjectFiles = getMethods(canvas)?.deleteProjectFiles
	if (!deleteProjectFiles || fileIds.length === 0) return true

	try {
		const result = await deleteProjectFiles({ fileIds })
		const deletedFileIds = new Set(result.deletedFileIds.map(String))
		if (fileIds.some((fileId) => !deletedFileIds.has(fileId))) {
			showError(
				canvas,
				"menu.deleteImageFileIncomplete",
				"部分图片已移入回收站，请刷新文件列表后重试",
			)
			return false
		}
		return true
	} catch {
		showError(canvas, "menu.deleteImageFileFailed", "图片文件移入回收站失败，请重试")
		return false
	}
}

function canDeleteActiveContentInstance(
	instance: unknown,
): instance is ImageElementInstanceWithContentDeletion {
	return (
		typeof instance === "object" &&
		instance !== null &&
		"deleteActiveContent" in instance &&
		typeof instance.deleteActiveContent === "function"
	)
}

function deleteActiveImageContent(canvas: Canvas, target: ImageFileDeletionTarget): boolean {
	const instance = canvas.elementManager.getElementInstance(target.elementId)
	if (!canDeleteActiveContentInstance(instance)) return false
	return instance.deleteActiveContent()
}

function deleteWholeImageElement(canvas: Canvas, target: ImageFileDeletionTarget): boolean {
	if (!canvas.elementManager.hasElement(target.elementId)) return false
	canvas.selectionManager.select(target.elementId, false, false)
	canvas.deleteSelection()
	return !canvas.elementManager.hasElement(target.elementId)
}

async function deleteCurrentVersion(
	canvas: Canvas,
	target: ImageFileDeletionTarget,
): Promise<void> {
	const initialContentCount = getImageContents(target.element).length
	const activeContent = getActiveImageContent(target.element)
	if (activeContent.status !== GenerationStatus.Completed) {
		showError(canvas, "menu.deleteImageVersionPending", "当前版本尚未完成，无法删除项目文件")
		return
	}
	const resolved = resolveImageContentFile(canvas, activeContent)
	if (!resolved) {
		showError(canvas, "menu.deleteImageFileUnavailable", "当前版本不属于当前项目文件，无法删除")
		return
	}

	const references = getImageResourceReferences(canvas)
	const fileIsShared = hasOtherReference(references, target.elementId, resolved)
	if (!fileIsShared && !(await moveFilesToRecycleBin(canvas, [resolved.fileId]))) return

	const latestTarget = getTarget(canvas, { elementId: target.elementId })
	const latestActiveContent = latestTarget
		? getActiveImageContent(latestTarget.element)
		: undefined
	if (
		!latestTarget ||
		getImageContents(latestTarget.element).length !== initialContentCount ||
		latestActiveContent?.contentId !== activeContent.contentId ||
		latestActiveContent.src?.trim() !== activeContent.src?.trim()
	) {
		showError(
			canvas,
			fileIsShared ? "menu.deleteImageFileChanged" : "menu.deleteImageFileTargetChanged",
			fileIsShared
				? "图片版本已发生变化，请刷新后重试"
				: "图片已移入回收站，但画布版本已发生变化，请刷新后重试",
		)
		return
	}
	const deleted =
		initialContentCount === 1
			? deleteWholeImageElement(canvas, latestTarget)
			: deleteActiveImageContent(canvas, latestTarget)
	if (!deleted) {
		showError(
			canvas,
			fileIsShared ? "menu.deleteImageVersionFailed" : "menu.deleteImageFileCanvasSaveFailed",
			fileIsShared ? "当前版本删除失败，请重试" : "图片已移入回收站，但画布保存失败，请重试",
		)
		return
	}
	if (fileIsShared) {
		toast.success(
			translate(
				canvas,
				"menu.deleteImageVersionSuccess",
				"当前版本已删除，仍被引用的文件已保留",
			),
		)
	}
}

async function deleteAllVersions(canvas: Canvas, target: ImageFileDeletionTarget): Promise<void> {
	const contents = getImageContents(target.element)
	if (contents.some((content) => content.status !== GenerationStatus.Completed)) {
		showError(canvas, "menu.deleteImageVersionsPending", "有历史版本尚未完成，无法删除全部版本")
		return
	}
	const resolvedContents = contents.map((content) => resolveImageContentFile(canvas, content))
	if (resolvedContents.some((resolved) => !resolved)) {
		showError(
			canvas,
			"menu.deleteImageVersionsUnavailable",
			"有历史版本无法定位项目文件，无法删除全部版本",
		)
		return
	}
	const resolved = resolvedContents as ResolvedImageContent[]
	const references = getImageResourceReferences(canvas)
	if (hasReferenceOutsideElement(references, target.elementId, resolved)) {
		showError(
			canvas,
			"menu.deleteImageVersionsShared",
			"仍有其它画布元素引用这些文件，请先处理其它引用",
		)
		return
	}

	const fileIds = [...new Set(resolved.map((item) => item.fileId))]
	if (!(await moveFilesToRecycleBin(canvas, fileIds))) return

	const latestTarget = getTarget(canvas, { elementId: target.elementId })
	const latestContents = latestTarget ? getImageContents(latestTarget.element) : []
	const versionsUnchanged =
		latestContents.length === contents.length &&
		latestContents.every(
			(content, index) =>
				content.contentId === contents[index]?.contentId &&
				content.src?.trim() === contents[index]?.src?.trim(),
		)
	if (!latestTarget || !versionsUnchanged) {
		showError(
			canvas,
			"menu.deleteImageFileTargetChanged",
			"图片已移入回收站，但画布版本已发生变化，请刷新后重试",
		)
		return
	}
	if (!deleteWholeImageElement(canvas, latestTarget)) {
		showError(
			canvas,
			"menu.deleteImageFileCanvasSaveFailed",
			"图片已移入回收站，但画布保存失败，请重试",
		)
	}
}

function openSingleVersionConfirm(canvas: Canvas, target: ImageFileDeletionTarget): void {
	const confirmModal = getMethods(canvas)?.confirmModal
	if (!confirmModal) return
	confirmModal({
		title: translate(canvas, "menu.deleteImageFileTitle", "彻底删除图片"),
		content: translate(
			canvas,
			"menu.deleteImageFileContent",
			"图片会从画布移除，并移入项目回收站。你可以稍后从回收站恢复。",
		),
		variant: "destructive",
		showIcon: true,
		okText: translate(canvas, "menu.deleteImageFileConfirm", "移入回收站并删除"),
		cancelText: translate(canvas, "common.cancel", "取消"),
		onOk: () => deleteCurrentVersion(canvas, target),
	})
}

function openVersionChoiceConfirm(canvas: Canvas, target: ImageFileDeletionTarget): void {
	const confirmModal = getMethods(canvas)?.confirmModal
	if (!confirmModal) return
	confirmModal({
		title: translate(canvas, "menu.deleteImageVersionsTitle", "删除图片历史版本"),
		content: translate(
			canvas,
			"menu.deleteImageVersionsContent",
			"这个图片包含多个历史版本。请选择要删除的范围；移入回收站的文件仍可恢复。",
		),
		variant: "destructive",
		showIcon: true,
		cancelText: translate(canvas, "common.cancel", "取消"),
		actions: [
			{
				id: "current",
				label: translate(canvas, "menu.deleteCurrentImageVersion", "只删除当前版本"),
				variant: "default",
			},
			{
				id: "all",
				label: translate(canvas, "menu.deleteAllImageVersions", "删除全部版本"),
				variant: "destructive",
			},
		],
		onAction: async (actionId) => {
			if (actionId === "current") await deleteCurrentVersion(canvas, target)
			if (actionId === "all") await deleteAllVersions(canvas, target)
		},
	})
}

export function executeDeleteImageFile(
	canvas: Canvas,
	options?: DeleteImageFileActionOptions,
): void {
	if (!canDeleteSelectedImageFile(canvas, options)) return
	const target = getTarget(canvas, options)
	if (!target) return

	const contents = getImageContents(target.element)
	if (contents.length > 1) openVersionChoiceConfirm(canvas, target)
	else openSingleVersionConfirm(canvas, target)
}

export { canDeleteSelectedImageFile }
