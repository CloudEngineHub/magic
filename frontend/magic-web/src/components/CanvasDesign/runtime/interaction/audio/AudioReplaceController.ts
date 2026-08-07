import { toast } from "sonner"
import type { Canvas } from "../../core/Canvas"
import { isAudioFile, validateFile } from "../../shared/ids"

const AUDIO_ACCEPT = "audio/*,.mp3,.wav,.ogg,.m4a,.aac"

/** 管理音频元素右上角“替换”按钮对应的原生文件选择与上传流程。 */
export class AudioReplaceController {
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

	public openLocalFilePicker(elementId: string): void {
		if (this.destroyed || this.canvas.readonly || this.replacingElementId) return
		const input = this.ensureInput()
		input.value = ""
		input.dataset.elementId = elementId
		input.click()
	}

	public replaceWithProjectFile(elementId: string, path: string): Promise<boolean> {
		return this.performReplacement(elementId, () =>
			this.canvas.canvasFileUploadManager.replaceAudioElementFromProject({
				elementId,
				path,
			}),
		)
	}

	private readonly handleInputChange = (): void => {
		const input = this.input
		const file = input?.files?.[0]
		const elementId = input?.dataset.elementId
		if (!input || !file || !elementId || this.destroyed) return

		const validation = validateFile(file)
		if (!validation.valid || !isAudioFile(file)) {
			toast.error(
				validation.error ||
					(this.canvas.t?.("audio.replaceUnsupported", "不支持的音频格式") ??
						"不支持的音频格式"),
			)
			return
		}

		void this.performReplacement(elementId, () =>
			this.canvas.canvasFileUploadManager.replaceAudioElement({ elementId, file }),
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
					this.canvas.t?.("audio.replaceFailed", "音频替换失败，请重试") ??
						"音频替换失败，请重试",
				)
			}
			this.emitState(elementId, "idle")
			return true
		} catch (error) {
			this.emitState(elementId, "error")
			toast.error(
				error instanceof Error && error.message
					? error.message
					: (this.canvas.t?.("audio.replaceFailed", "音频替换失败，请重试") ??
							"音频替换失败，请重试"),
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
		input.accept = AUDIO_ACCEPT
		input.multiple = false
		input.style.display = "none"
		input.addEventListener("change", this.handleInputChange)
		this.canvas.container.appendChild(input)
		this.input = input
		return input
	}

	private emitState(elementId: string, status: "idle" | "uploading" | "error"): void {
		this.canvas.eventEmitter.emit({
			type: "element:audio:replaceStateChanged",
			data: { elementId, status },
		})
	}
}
