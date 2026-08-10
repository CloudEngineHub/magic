import { toast } from "sonner"
import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum, type MediaElementType } from "../../document/types"
import { isAudioFile, isImageFile, isVideoFile, validateFile } from "../../shared/ids"

const MEDIA_ACCEPT: Record<MediaElementType, string> = {
	[ElementTypeEnum.Image]: "image/*,.png,.jpg,.jpeg,.gif,.webp",
	[ElementTypeEnum.Video]: "video/*,.mp4,.mov,.webm",
	[ElementTypeEnum.Audio]: "audio/*,.mp3,.wav,.ogg,.m4a,.aac",
}

export interface MediaReplacementTarget {
	elementId: string
	mediaType: MediaElementType
	contentId: string | null
}

/** 统一管理图片、视频、音频工具栏的本地选择与替换状态。 */
export class MediaReplaceController {
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

	public openLocalFilePicker(target: MediaReplacementTarget): void {
		if (this.destroyed || this.canvas.readonly || this.replacingElementId) return
		const input = this.ensureInput()
		input.value = ""
		input.accept = MEDIA_ACCEPT[target.mediaType]
		input.dataset.elementId = target.elementId
		input.dataset.mediaType = target.mediaType
		input.dataset.contentId = target.contentId ?? ""
		input.click()
	}

	public replaceWithProjectFile(
		target: MediaReplacementTarget & { path: string },
	): Promise<boolean> {
		return this.performReplacement(target, () =>
			this.canvas.canvasFileUploadManager.replaceMediaElementFromProject(target),
		)
	}

	private readonly handleInputChange = (): void => {
		const input = this.input
		const file = input?.files?.[0]
		const elementId = input?.dataset.elementId
		const mediaType = input?.dataset.mediaType as MediaElementType | undefined
		const contentId = input?.dataset.contentId
		if (
			!input ||
			!file ||
			!elementId ||
			!mediaType ||
			contentId === undefined ||
			this.destroyed
		) {
			return
		}

		const validation = validateFile(file)
		if (!validation.valid || !this.matchesMediaType(file, mediaType)) {
			toast.error(validation.error || this.getUnsupportedMessage(mediaType))
			input.value = ""
			return
		}

		const target = { elementId, mediaType, contentId: contentId || null }
		void this.performReplacement(target, () =>
			this.canvas.canvasFileUploadManager.replaceMediaElement({ ...target, file }),
		).finally(() => {
			input.value = ""
		})
	}

	private async performReplacement(
		target: MediaReplacementTarget,
		replace: () => boolean | Promise<boolean>,
	): Promise<boolean> {
		if (this.destroyed || this.canvas.readonly || this.replacingElementId) return false

		this.replacingElementId = target.elementId
		this.emitState(target, "uploading")
		try {
			const success = await replace()
			if (!success) throw new Error(this.getFailedMessage(target.mediaType))
			this.emitState(target, "idle")
			return true
		} catch (error) {
			this.emitState(target, "error")
			toast.error(
				error instanceof Error && error.message
					? error.message
					: this.getFailedMessage(target.mediaType),
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
		input.multiple = false
		input.style.display = "none"
		input.addEventListener("change", this.handleInputChange)
		this.canvas.container.appendChild(input)
		this.input = input
		return input
	}

	private matchesMediaType(file: File, mediaType: MediaElementType): boolean {
		switch (mediaType) {
			case ElementTypeEnum.Image:
				return isImageFile(file)
			case ElementTypeEnum.Video:
				return isVideoFile(file)
			case ElementTypeEnum.Audio:
				return isAudioFile(file)
		}
	}

	private getUnsupportedMessage(mediaType: MediaElementType): string {
		switch (mediaType) {
			case ElementTypeEnum.Image:
				return (
					this.canvas.t?.("image.replaceUnsupported", "不支持的图片格式") ??
					"不支持的图片格式"
				)
			case ElementTypeEnum.Video:
				return (
					this.canvas.t?.("video.replaceUnsupported", "不支持的视频格式") ??
					"不支持的视频格式"
				)
			case ElementTypeEnum.Audio:
				return (
					this.canvas.t?.("audio.replaceUnsupported", "不支持的音频格式") ??
					"不支持的音频格式"
				)
		}
	}

	private getFailedMessage(mediaType: MediaElementType): string {
		switch (mediaType) {
			case ElementTypeEnum.Image:
				return (
					this.canvas.t?.("image.replaceFailed", "图片替换失败，请重试") ??
					"图片替换失败，请重试"
				)
			case ElementTypeEnum.Video:
				return (
					this.canvas.t?.("video.replaceFailed", "视频替换失败，请重试") ??
					"视频替换失败，请重试"
				)
			case ElementTypeEnum.Audio:
				return (
					this.canvas.t?.("audio.replaceFailed", "音频替换失败，请重试") ??
					"音频替换失败，请重试"
				)
		}
	}

	private emitState(
		target: MediaReplacementTarget,
		status: "idle" | "uploading" | "error",
	): void {
		this.canvas.eventEmitter.emit({
			type: "element:media:replaceStateChanged",
			data: { elementId: target.elementId, mediaType: target.mediaType, status },
		})

		// 音频元素内仍有兼容入口；同步旧事件，确保角落按钮的状态反馈不丢失。
		if (target.mediaType === ElementTypeEnum.Audio) {
			this.canvas.eventEmitter.emit({
				type: "element:audio:replaceStateChanged",
				data: { elementId: target.elementId, status },
			})
		} else if (target.mediaType === ElementTypeEnum.Image) {
			this.canvas.eventEmitter.emit({
				type: "element:image:replaceStateChanged",
				data: { elementId: target.elementId, status },
			})
		}
	}
}
