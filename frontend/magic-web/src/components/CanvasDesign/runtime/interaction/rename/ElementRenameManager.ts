import { getActiveImageContent, isImageElementContent } from "../../document/elementContent"
import { GenerationStatus } from "../../../public/magic-types"
import type { Canvas } from "../../core/Canvas"
import type { CanvasImageFileRename } from "../../../public/magic-types"

export interface ImageRenameOptions {
	/** 显式传入选项时，标题和文件独立提交；未提供文件变化表示只改标题。 */
	fileChange?: CanvasImageFileRename
}

export class ElementRenameManager {
	private renamingElementId: string | null = null

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	private canvas: Canvas

	public canRename(elementId: string | null): boolean {
		if (!elementId) return false

		const elementData = this.canvas.elementManager.getElementData(elementId)
		if (!this.canvas.permissionManager.canRename(elementData)) {
			return false
		}

		return this.canvas.nameLabelManager.canStartRename(elementId)
	}

	public startRename(elementId: string, fromLayers = false): boolean {
		if (
			fromLayers
				? !this.canvas.permissionManager.canRename(
						this.canvas.elementManager.getElementData(elementId),
					)
				: !this.canRename(elementId)
		) {
			return false
		}

		if (this.renamingElementId === elementId) {
			return true
		}

		this.cancelRename()
		this.renamingElementId = elementId
		this.canvas.nameLabelManager.setRenamingElementId(elementId)
		this.canvas.eventEmitter.emit({
			type: "element:rename-start",
			data: { elementId },
		})
		return true
	}

	public async commitRename(nextName: string, options?: ImageRenameOptions): Promise<void> {
		const elementId = this.renamingElementId
		const name = nextName.trim()
		if (!elementId || !name) return
		const element = this.canvas.elementManager.getElementData(elementId)
		if (!this.canvas.permissionManager.canRename(element)) return
		const elementInstance = this.canvas.elementManager.getElementInstance(elementId)
		const currentName =
			elementInstance?.getNameLabelContent().primaryText ||
			element?.name ||
			elementInstance?.getRenderName() ||
			""
		if (name === currentName && !options?.fileChange) {
			this.cancelRename()
			return
		}
		let affectsFile = false
		const methods = this.canvas.magicConfigManager.config?.methods?.imageRename
		if (options?.fileChange) {
			const change = options.fileChange
			if (
				!methods ||
				!element ||
				!isImageElementContent(element) ||
				element.contents.length !== 1 ||
				change.elementId !== elementId ||
				getActiveImageContent(element).contentId !== change.contentId
			) {
				throw new Error(
					this.canvas.t?.("rename.fileChanged", "文件已变化，请重新打开命名面板。") ||
						"文件已变化，请重新打开命名面板。",
				)
			}
			const error = methods.validateImageFileRenames([change])[change.fileId]
			if (error) throw new Error(error)
			this.canvas.historyManager.recordHistoryImmediate()
			await methods.renameImageFile(change)
			affectsFile = true
		} else if (
			!options &&
			element &&
			isImageElementContent(element) &&
			element.contents.length === 1 &&
			methods
		) {
			const content = getActiveImageContent(element)
			const processing =
				content.status === GenerationStatus.Pending ||
				content.status === GenerationStatus.Processing
			const file =
				!processing && content.src ? methods.resolveImageRenameFile(content.src) : undefined
			if (file) {
				const extension = file.fileName.match(/\.[^/.]+$/)?.[0] || ""
				this.canvas.historyManager.recordHistoryImmediate()
				await methods.renameImageFile({
					elementId,
					contentId: content.contentId,
					fileId: file.fileId,
					expectedName: file.fileName,
					targetName: name.toLowerCase().endsWith(extension.toLowerCase())
						? name
						: `${name}${extension}`,
				})
				affectsFile = true
			}
		}
		// 文件已改名时标题不能形成单独的撤销记录；普通元素命名继续沿用画布历史。
		const current = this.canvas.elementManager.getElementData(elementId)
		if (current && this.canvas.permissionManager.canRename(current) && current.name !== name) {
			this.canvas.elementManager.update(
				elementId,
				{ name },
				affectsFile ? { historyPolicy: "exclude" } : undefined,
			)
		}
		if (affectsFile)
			this.canvas.historyManager.applyExternalFileRename((document) => {
				const rewrite = (items: typeof document.elements): typeof document.elements =>
					items?.map((item) => {
						if (item.id === elementId) return { ...item, name }
						return "children" in item && item.children
							? { ...item, children: rewrite(item.children) }
							: item
					})
				return { ...document, elements: rewrite(document.elements) }
			})
		this.cancelRename()
	}

	public cancelRename(): void {
		if (!this.renamingElementId) {
			return
		}

		const elementId = this.renamingElementId
		this.renamingElementId = null
		this.canvas.nameLabelManager.setRenamingElementId(null)
		this.canvas.eventEmitter.emit({
			type: "element:rename-end",
			data: { elementId },
		})
	}

	public getRenamingElementId(): string | null {
		return this.renamingElementId
	}

	public destroy(): void {
		this.cancelRename()
	}
}
