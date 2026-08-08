import { toast } from "sonner"
import type { Canvas } from "../../core/Canvas"
import { isImageFile, validateFile } from "../../shared/ids"

const IMAGE_ACCEPT = "image/*,.png,.jpg,.jpeg,.gif,.webp"

/** 管理图片工具栏“替换图片”对应的原生文件选择与上传流程。 */
export class ImageReplaceController {
	private readonly canvas: Canvas
	private input?: HTMLInputElement
	private replacingElementId: string | null = null
	private destroyed = false

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
	}

	public destroy(): void {
		if (this.destroyed) return
		this.destroyed = true
		if (this.input) {
			this.input.removeEventListener("change", this.handleInputChange)
			this.input.remove()
			this.input = undefined
		}
	}

	public openLocalFilePicker(elementId: string, contentId: string | null): void {
		if (this.destroyed || this.canvas.readonly || this.replacingElementId) return
		const input = this.ensureInput()
		input.value = ""
		input.dataset.elementId = elementId
		input.dataset.contentId = contentId ?? ""
		input.click()
	}

	public replaceWithProjectFile(
		elementId: string,
		path: string,
		contentId: string | null,
	): Promise<boolean> {
		return this.performReplacement(elementId, () =>
			this.canvas.canvasFileUploadManager.replaceImageElementFromProject({
				elementId,
				path,
				contentId,
			}),
		)
	}

	private readonly handleInputChange = (): void => {
		const input = this.input
		const file = input?.files?.[0]
		const elementId = input?.dataset.elementId
		const contentId = input?.dataset.contentId
		if (!input || !file || !elementId || contentId === undefined || this.destroyed) return

		const validation = validateFile(file)
		if (!validation.valid || !isImageFile(file)) {
			toast.error(
				validation.error ||
					(this.canvas.t?.("image.replaceUnsupported", "不支持的图片格式") ??
						"不支持的图片格式"),
			)
			return
		}

		void this.performReplacement(elementId, () =>
			this.canvas.canvasFileUploadManager.replaceImageElement({
				elementId,
				file,
				contentId: contentId || null,
			}),
		).finally(() => {
			input.value = ""
		})
	}

	private async performReplacement(
		elementId: string,
		replace: () => boolean | Promise<boolean>,
	): Promise<boolean> {
		if (this.destroyed || this.canvas.readonly || this.replacingElementId) return false

		this.replacingElementId = elementId
		this.emitState(elementId, "uploading")
		try {
			const success = await replace()
			if (!success) {
				throw new Error(
					this.canvas.t?.("image.replaceFailed", "图片替换失败，请重试") ??
						"图片替换失败，请重试",
				)
			}
			this.emitState(elementId, "idle")
			return true
		} catch (error) {
			this.emitState(elementId, "error")
			toast.error(
				error instanceof Error && error.message
					? error.message
					: (this.canvas.t?.("image.replaceFailed", "图片替换失败，请重试") ??
							"图片替换失败，请重试"),
			)
			return false
		} finally {
			this.replacingElementId = null
		}
	}

	private ensureInput(): HTMLInputElement {
		if (this.input) return this.input
		const input = document.createElement("input")
		input.type = "file"
		input.accept = IMAGE_ACCEPT
		input.multiple = false
		input.style.display = "none"
		input.addEventListener("change", this.handleInputChange)
		this.canvas.container.appendChild(input)
		this.input = input
		return input
	}

	private emitState(elementId: string, status: "idle" | "uploading" | "error"): void {
		this.canvas.eventEmitter.emit({
			type: "element:image:replaceStateChanged",
			data: { elementId, status },
		})
	}
}
