import type { Canvas } from "../../core/Canvas"
import type { ResolveCanvasResourceReference } from "../../../public/resource-reference"
import type {
	LayerElement,
	AudioElement,
	ImageElement,
	VideoElement,
	CanvasFileElement,
	ElementUpdatePatch,
} from "../../document/types"
import { ElementTypeEnum } from "../../document/types"
import { ImageElement as ImageElementClass } from "../../elements/image/ImageElement"
import {
	createContentId,
	getActiveContent,
	getActiveImageContent,
	isImageElementContent,
	mapContents,
	updateContent,
	updateImageContent,
} from "../../document/elementContent"
import { GenerationStatus, type UploadFileResponse } from "../../../public/magic-types"
import { toast } from "sonner"
import {
	getMediaDimensions,
	calculateElementsRect,
	calculateNodesRect,
	generateElementId,
	isVideoFile,
	isAudioFile,
	validateFile,
} from "../../shared/ids"
import { AUDIO_CONFIG } from "../../elements/audio/AudioElement.config"
import { filterRedundantElements, getCanvasCenter } from "../../shared/placement/elementUtils"
import { resolveGridPlacements } from "../../shared/placement/placementEngine"
import { getCanvasResourceFileName } from "../../shared/path/canvasResourcePath"
import {
	CanvasElementClipboard,
	type CanvasElementClipboardBrowserOptions,
	type CanvasElementClipboardFile,
	type CanvasElementClipboardNativeExposure,
	type CanvasElementClipboardOperation,
	type CanvasElementClipboardPasteSource,
	type CanvasElementClipboardWriteFile,
	type CanvasElementClipboardPayload,
	type CanvasElementClipboardFileMetadata,
} from "../../resources/clipboard/CanvasElementClipboard"
import {
	addClipboardResourceAliasMappings,
	collectElementResourceReferences,
	getClipboardResourcePathKey,
	rewriteElementResourceReferences,
	type ClipboardResourceReference,
} from "../../resources/clipboard/clipboardResourceReferences"
import canvasSize from "canvas-size"

const PNG_MIME_TYPE = "image/png"
const PNG_EXTENSION = ".png"
const DEFAULT_IMAGE_MIME_TYPE = "image/png"
const DEFAULT_VIDEO_MIME_TYPE = "video/mp4"
const DEFAULT_AUDIO_MIME_TYPE = "audio/mpeg"

interface CopyToastHandle {
	success: () => void
	dismiss: () => void
}

interface CanvasFileBlobData {
	blob: Blob
	element: CanvasFileElement
	filename: string
	mimeType: string
	fileSize: number
	sourceRef?: CanvasElementClipboardFileMetadata["sourceRef"]
}

interface CanvasFileMetadataData {
	element: CanvasFileElement
	filename: string
	mimeType: string
	fileSize: number
	sourceRef?: CanvasElementClipboardFileMetadata["sourceRef"]
}

interface OriginalFileBlobData {
	blob: Blob
	filename: string
	mimeType: string
	fileSize: number
	sourceRef?: CanvasElementClipboardFileMetadata["sourceRef"]
}

interface NativeClipboardFile {
	metadata: CanvasElementClipboardFileMetadata
	native: CanvasElementClipboardNativeExposure
}

interface CollectedClipboardFiles {
	metadata: CanvasElementClipboardFileMetadata[]
	files: CanvasElementClipboardWriteFile[]
	native?: CanvasElementClipboardNativeExposure
}

export interface CanvasPngExportResult {
	blob: Blob
	filename: string
}

type CanvasContainerElement = Extract<LayerElement, { children?: LayerElement[] }>

interface PreparedClipboardTreeElement {
	element: LayerElement | null
	sourceReferenceFailureCount: number
	pendingUploads: ClipboardTreeFileUpload[]
}

interface PreparedClipboardTreeFileElement {
	element: CanvasFileElement | null
	sourceReferenceFailureCount: number
	pendingUpload?: ClipboardTreeFileUpload
}

interface ClipboardTreeFileUpload {
	sourceElementId: string
	targetElementId: string
	targetContentId: string
	sourceCanvasId?: string
	sourcePath?: string
	file?: File
	metadata?: CanvasElementClipboardFileMetadata
}

function isCanvasContainerElement(element: LayerElement): element is CanvasContainerElement {
	return "children" in element
}

/**
 * ClipboardManager
 * 负责剪贴板操作(复制和粘贴元素)
 */
export class ClipboardManager {
	private canvas: Canvas

	constructor(options: { canvas: Canvas }) {
		const { canvas } = options
		this.canvas = canvas
	}

	/**
	 * 获取目标位置
	 */
	private getTargetPosition(position?: { x: number; y: number }): { x: number; y: number } {
		return position || getCanvasCenter(this.canvas)
	}

	/**
	 * 计算元素中心相对于目标位置的偏移量
	 */
	private getElementCenterOffset(
		element: { x?: number; y?: number; width?: number; height?: number },
		targetPosition: { x: number; y: number },
	): { offsetX: number; offsetY: number } {
		const elementWidth = element.width ?? 0
		const elementHeight = element.height ?? 0
		const elementCenterX = (element.x ?? 0) + elementWidth / 2
		const elementCenterY = (element.y ?? 0) + elementHeight / 2

		return {
			offsetX: targetPosition.x - elementCenterX,
			offsetY: targetPosition.y - elementCenterY,
		}
	}

	/**
	 * 计算多个元素中心相对于目标位置的偏移量
	 */
	private getElementsCenterOffset(
		elements: LayerElement[],
		targetPosition: { x: number; y: number },
	): { offsetX: number; offsetY: number } {
		const elementsRect = calculateElementsRect(elements)
		if (!elementsRect) {
			return { offsetX: 0, offsetY: 0 }
		}

		const elementsCenterX = elementsRect.x + elementsRect.width / 2
		const elementsCenterY = elementsRect.y + elementsRect.height / 2

		return {
			offsetX: targetPosition.x - elementsCenterX,
			offsetY: targetPosition.y - elementsCenterY,
		}
	}

	/**
	 * 判断是否可以粘贴来自其他画布的元素
	 */
	private canPasteFromClipboardCanvas(clipboardCanvasId?: string): boolean {
		const currentCanvasId = this.canvas.id
		if (clipboardCanvasId === undefined || currentCanvasId === undefined) {
			return true
		}
		return clipboardCanvasId === currentCanvasId
	}

	private showUnreadableClipboardHint(): void {
		toast(
			this.canvas.t?.("menu.pasteUseShortcutHint", "系统文件请使用 Ctrl/Cmd+V 粘贴") ||
				"系统文件请使用 Ctrl/Cmd+V 粘贴",
		)
	}

	private showClipboardSourceUnavailableHint(): void {
		toast(
			this.canvas.t?.(
				"menu.clipboardSourceUnavailable",
				"原文件链接已失效或无法访问，请重新复制后再粘贴",
			) || "原文件链接已失效或无法访问，请重新复制后再粘贴",
		)
	}

	private showBatchUploadFailedToast(failedCount: number, total: number): void {
		if (failedCount <= 0) return
		const fallback =
			failedCount >= total
				? `文件上传失败，共 ${total} 个`
				: `有 ${failedCount}/${total} 个文件上传失败`
		const template = this.canvas.t?.("image.batchUploadFailed", fallback) || fallback
		toast.error(
			template.replace("{{failed}}", String(failedCount)).replace("{{total}}", String(total)),
		)
	}

	/**
	 * 复制链路需要异步获取图片 / 视频来源信息，耗时期间给用户明确反馈。
	 * 这里统一使用 toast.loading，不再走宿主弹窗，避免复制动作阻塞当前画布交互。
	 */
	private showCopyLoadingToast(): CopyToastHandle {
		const content =
			this.canvas.t?.("menu.copyLoadingDescription", "正在准备媒体文件，请稍候...") ||
			"正在准备媒体文件，请稍候..."
		const toastId = toast.loading(content)
		return {
			success: () => {
				toast.success(this.canvas.t?.("menu.copySuccess", "复制成功") || "复制成功", {
					id: toastId,
				})
			},
			dismiss: () => toast.dismiss(toastId),
		}
	}

	/**
	 * 将多个元素复制为PNG图片
	 * @param elementIds - 元素ID列表
	 * @returns Promise<boolean> - 复制是否成功
	 */
	public async copyElementsAsPNG(elementIds: string[]): Promise<boolean> {
		const copyToast = this.showCopyLoadingToast()
		let success = false
		try {
			const exportResult = await this.exportElementsAsPNG(elementIds)
			if (!exportResult) {
				return false
			}
			const sourceElements = elementIds
				.map((id) => this.canvas.elementManager.getElementData(id))
				.filter((element): element is LayerElement => Boolean(element))

			success = await this.writePngToClipboard(
				exportResult.blob,
				exportResult.filename,
				exportResult.sourceFile,
				sourceElements,
			)
			if (success) {
				copyToast.success()
			}
			return success
		} catch (error) {
			return false
		} finally {
			if (!success) {
				copyToast.dismiss()
			}
		}
	}

	/**
	 * 将多个元素导出并下载为 PNG 图片
	 */
	public async downloadElementsAsPNG(elementIds: string[]): Promise<boolean> {
		try {
			const exportResult = await this.exportElementsAsPNG(elementIds)
			if (!exportResult) {
				return false
			}

			this.downloadBlob(exportResult.blob, exportResult.filename)
			return true
		} catch (error) {
			return false
		}
	}

	/**
	 * 导出指定元素为 PNG Blob，供非剪贴板场景复用。
	 *
	 * 插件图片拖拽需要拿到真实 File/Blob 上传给插件；这里复用剪贴板导出链路，
	 * 但只暴露 Blob 和文件名，避免把 clipboard-only 的内部字段泄漏出去。
	 */
	public async exportElementsAsPNGBlob(
		elementIds: string[],
		options?: { preferOriginalSingleImage?: boolean },
	): Promise<CanvasPngExportResult | null> {
		const exportResult = await this.exportElementsAsPNG(elementIds, options)
		if (!exportResult) return null
		return {
			blob: exportResult.blob,
			filename: exportResult.filename,
		}
	}

	/**
	 * 获取 PNG 文件名
	 */
	private getPngFilename(filename: string): string {
		return filename.toLowerCase().endsWith(PNG_EXTENSION)
			? filename
			: filename.replace(/\.[^/.]+$/, "") + PNG_EXTENSION
	}

	private getMimeTypeFromFilename(filename: string, fallback: string): string {
		const extension = filename.split("?")[0].split(".").pop()?.toLowerCase()
		const extensionMimeTypeMap: Record<string, string> = {
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			gif: "image/gif",
			webp: "image/webp",
			bmp: "image/bmp",
			svg: "image/svg+xml",
			ico: "image/x-icon",
			mp4: "video/mp4",
			mov: "video/quicktime",
			webm: "video/webm",
			avi: "video/x-msvideo",
			mkv: "video/x-matroska",
			mp3: "audio/mpeg",
			wav: "audio/wav",
			ogg: "audio/ogg",
			m4a: "audio/mp4",
			aac: "audio/aac",
		}

		return extension ? (extensionMimeTypeMap[extension] ?? fallback) : fallback
	}

	/**
	 * 获取原始未压缩资源信息。
	 *
	 * 图片展示链路会通过 useImageProcess=true 换取带 format/压缩参数的 URL；
	 * 复制元素只需要 sourceRef，避免为了画布协议提前下载大文件 Blob。
	 */
	private async fetchOriginalFileMetadata(options: {
		src: string
		fallbackFilename: string
		fallbackMimeType: string
	}): Promise<{
		filename: string
		mimeType: string
		fileSize: number
		sourceRef: CanvasElementClipboardFileMetadata["sourceRef"]
	} | null> {
		const getFileInfo = this.canvas.magicConfigManager.config?.methods?.getFileInfo
		if (!getFileInfo) {
			return null
		}

		try {
			const fileInfo = await getFileInfo(options.src, { useImageProcess: false })
			if (!fileInfo?.src) {
				return null
			}

			const filename =
				fileInfo.fileName || this.getFilenameFromPath(options.src, options.fallbackFilename)
			const mimeType = this.getMimeTypeFromFilename(filename, options.fallbackMimeType)

			return {
				filename,
				mimeType,
				fileSize: 0,
				sourceRef: {
					src: options.src,
					ossUrl: fileInfo.src,
					expiresAt: fileInfo.expires_at,
				},
			}
		} catch (error) {
			return null
		}
	}

	/**
	 * 获取原始未压缩资源 Blob。
	 *
	 * 仅在明确需要 native clipboard Blob（外部应用粘贴）或复制为 PNG 时调用。
	 */
	private async fetchOriginalFileBlob(options: {
		src: string
		fallbackFilename: string
		fallbackMimeType: string
	}): Promise<OriginalFileBlobData | null> {
		const metadata = await this.fetchOriginalFileMetadata(options)
		if (!metadata?.sourceRef?.ossUrl) {
			return null
		}

		try {
			const response = await fetch(metadata.sourceRef.ossUrl, { cache: "default" })
			if (!response.ok) {
				return null
			}

			const blob = await response.blob()
			const mimeType = blob.type || metadata.mimeType || options.fallbackMimeType

			return {
				blob,
				filename: metadata.filename,
				mimeType,
				fileSize: blob.size,
				sourceRef: metadata.sourceRef,
			}
		} catch {
			return null
		}
	}

	/**
	 * 将 Blob 转换为 PNG Blob
	 */
	private async convertToPngBlob(blob: Blob): Promise<Blob | null> {
		if (blob.type === PNG_MIME_TYPE) {
			return blob
		}

		try {
			const img = await createImageBitmap(blob)
			const canvas = document.createElement("canvas")
			canvas.width = img.width
			canvas.height = img.height
			const ctx = canvas.getContext("2d")
			if (!ctx) {
				return null
			}
			ctx.drawImage(img, 0, 0)
			return await new Promise<Blob | null>((resolve) => {
				canvas.toBlob((pngBlob) => {
					resolve(pngBlob || null)
				}, PNG_MIME_TYPE)
			})
		} catch (error) {
			return null
		}
	}

	/**
	 * 导出元素 PNG。
	 *
	 * preferOriginalSingleImage 默认开启：单张未裁剪图片可直接复用原图资源。
	 * 外部拖拽导入插件时会关闭它，以确保裁剪等画布视觉效果被烘焙进导出结果。
	 */
	private async exportElementsAsPNG(
		elementIds: string[],
		options: { preferOriginalSingleImage?: boolean } = {},
	): Promise<{
		blob: Blob
		filename: string
		sourceFile?: CanvasFileBlobData
	} | null> {
		if (elementIds.length === 0) {
			return null
		}

		// 1. 过滤冗余元素（如果父元素已选中，则子元素无需单独处理）
		const filteredIds = filterRedundantElements(elementIds, this.canvas.elementManager)
		if (filteredIds.length === 0) {
			return null
		}

		// 2. 获取所有元素实例和节点
		const adapter = this.canvas.elementManager.getNodeAdapter()
		const nodes = adapter.getNodesForTransform(filteredIds)
		if (nodes.length === 0) {
			return null
		}

		// 3. 使用 calculateNodesRect 计算总体边界
		const boundingRect = calculateNodesRect(
			nodes,
			this.canvas.stage,
			this.canvas.elementManager,
		)
		if (!boundingRect || boundingRect.width <= 0 || boundingRect.height <= 0) {
			return null
		}

		// 4. 创建 Canvas，设置宽高
		const exportCanvas = document.createElement("canvas")
		const ctx = exportCanvas.getContext("2d")
		if (!ctx) {
			return null
		}

		// 获取 Canvas 最大支持尺寸
		const { width: canvasMaxWidth, height: canvasMaxHeight } = await canvasSize.maxArea({
			usePromise: true,
			useWorker: true,
		})

		// 计算原始 Canvas 尺寸
		const originalWidth = Math.ceil(boundingRect.width)
		const originalHeight = Math.ceil(boundingRect.height)

		// 检查是否需要按比例压缩
		let canvasWidth = originalWidth
		let canvasHeight = originalHeight
		let scaleRatio = 1

		if (originalWidth > canvasMaxWidth || originalHeight > canvasMaxHeight) {
			const widthRatio = canvasMaxWidth / originalWidth
			const heightRatio = canvasMaxHeight / originalHeight
			scaleRatio = Math.min(widthRatio, heightRatio)

			canvasWidth = Math.ceil(originalWidth * scaleRatio)
			canvasHeight = Math.ceil(originalHeight * scaleRatio)
		}

		exportCanvas.width = canvasWidth
		exportCanvas.height = canvasHeight

		// 5. 判断是否需要绘制边框
		const firstElementData =
			filteredIds.length === 1
				? this.canvas.elementManager.getElementData(filteredIds[0])
				: null
		const shouldDrawBorder = false

		// 6. 单选图片时优先复用原图 blob，避免额外重渲染
		if (
			options.preferOriginalSingleImage !== false &&
			!shouldDrawBorder &&
			filteredIds.length === 1 &&
			firstElementData?.type === ElementTypeEnum.Image
		) {
			const result = await this.getImageBlobAndMetadata(firstElementData)
			if (result) {
				const pngBlob = await this.convertToPngBlob(result.blob)
				if (pngBlob) {
					return {
						blob: pngBlob,
						filename: this.getPngFilename(result.metadata.filename),
						sourceFile: {
							blob: pngBlob,
							element: result.element,
							filename: this.getPngFilename(result.metadata.filename),
							mimeType: PNG_MIME_TYPE,
							fileSize: pngBlob.size,
							sourceRef: result.metadata.sourceRef,
						},
					}
				}
			}
		}

		// 7. 收集所有需要渲染的元素信息并按 zIndex 排序
		const elementsToRender: Array<{
			elementInstance: {
				renderToCanvas: (
					ctx: CanvasRenderingContext2D,
					offsetX: number,
					offsetY: number,
					options?: { shouldDrawBorder?: boolean; width?: number; height?: number },
				) => Promise<boolean>
			}
			offsetX: number
			offsetY: number
			elementWidth: number
			elementHeight: number
			zIndex: number
		}> = []

		for (const node of nodes) {
			const elementId = node.id()
			if (!elementId) continue

			const element = this.canvas.elementManager.getElementData(elementId)
			if (!element) continue

			const elementInstance = this.canvas.elementManager.getElementInstance(elementId)
			if (!elementInstance || typeof elementInstance.renderToCanvas !== "function") {
				continue
			}

			const elementRect = calculateNodesRect(
				[node],
				this.canvas.stage,
				this.canvas.elementManager,
			)
			if (!elementRect) continue

			elementsToRender.push({
				elementInstance,
				offsetX: (elementRect.x - boundingRect.x) * scaleRatio,
				offsetY: (elementRect.y - boundingRect.y) * scaleRatio,
				elementWidth: elementRect.width * scaleRatio,
				elementHeight: elementRect.height * scaleRatio,
				zIndex: element.zIndex ?? 0,
			})
		}

		elementsToRender.sort((a, b) => a.zIndex - b.zIndex)

		// 8. 串行执行 renderToCanvas，避免 Canvas 上下文状态冲突
		let hasSuccess = false
		for (const {
			elementInstance,
			offsetX,
			offsetY,
			elementWidth,
			elementHeight,
		} of elementsToRender) {
			const result = await elementInstance.renderToCanvas(ctx, offsetX, offsetY, {
				shouldDrawBorder,
				width: elementWidth,
				height: elementHeight,
			})
			if (result) {
				hasSuccess = true
			}
		}

		if (!hasSuccess) {
			return null
		}

		const blob = await this.canvasToBlob(exportCanvas)
		if (!blob) {
			return null
		}

		return {
			blob,
			filename: this.getSelectionPngFilename(filteredIds),
		}
	}

	private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
		return new Promise<Blob | null>((resolve) => {
			canvas.toBlob((blob) => {
				resolve(blob || null)
			}, PNG_MIME_TYPE)
		})
	}

	private getSelectionPngFilename(elementIds: string[]): string {
		if (elementIds.length !== 1) {
			return `canvas${PNG_EXTENSION}`
		}

		const element = this.canvas.elementManager.getElementData(elementIds[0])
		const sanitizedName = element?.name?.trim().replace(/[\\/:*?"<>|]+/g, "-")
		if (sanitizedName) {
			return this.getPngFilename(sanitizedName)
		}

		if (element?.type === ElementTypeEnum.Text) {
			return this.getPngFilename("text")
		}

		return `canvas${PNG_EXTENSION}`
	}

	private downloadBlob(blob: Blob, filename: string): void {
		const downloadUrl = URL.createObjectURL(blob)
		const link = document.createElement("a")
		link.href = downloadUrl
		link.download = filename
		link.style.display = "none"
		document.body.appendChild(link)
		link.click()
		link.remove()
		window.setTimeout(() => {
			URL.revokeObjectURL(downloadUrl)
		}, 0)
	}

	/**
	 * Get the browser clipboard adapter options for CanvasDesign.
	 *
	 * ClipboardManager only forwards host-provided methods. Browser API
	 * fallback, error propagation, MIME rules, and parsing stay in utilities.
	 */
	private getClipboardBrowserOptions(): CanvasElementClipboardBrowserOptions | undefined {
		const clipboard = this.canvas.magicConfigManager.config?.methods?.clipboard
		if (!clipboard) return undefined
		return clipboard
	}

	private getNativeClipboardExposure(options: {
		operation: CanvasElementClipboardOperation
		files: CanvasElementClipboardWriteFile[]
		native?: CanvasElementClipboardNativeExposure
	}): CanvasElementClipboardNativeExposure | undefined {
		const { operation, files, native } = options
		if (native && CanvasElementClipboard.supportsNativeMimeType(native.mimeType)) {
			return native
		}

		if (files.length !== 1) {
			return undefined
		}

		const [file] = files
		if (!file || !CanvasElementClipboard.supportsNativeMimeType(file.metadata.mimeType)) {
			return undefined
		}

		if (operation === "copy-as-png") {
			return {
				mimeType: file.metadata.mimeType,
				blob: file.blob,
			}
		}

		return undefined
	}

	private async writeCanvasElementClipboardWithLog(options: {
		operation: CanvasElementClipboardOperation
		payload: CanvasElementClipboardPayload
		files: CanvasElementClipboardWriteFile[]
		native?: CanvasElementClipboardNativeExposure
	}): Promise<void> {
		const { operation, payload, files } = options
		const native = this.getNativeClipboardExposure({
			operation,
			files,
			native: options.native,
		})

		await CanvasElementClipboard.write({
			payload,
			files,
			native,
			clipboard: this.getClipboardBrowserOptions(),
		})
	}

	/**
	 * 将 PNG Blob 写入剪贴板。
	 *
	 * 复制为 PNG 也是 CanvasDesign 产出的文件，统一通过 CanvasElementClipboard
	 * 写入私有 payload + PNG Blob。读取时会按普通图片文件粘贴，而不是恢复源元素。
	 */
	private async writePngToClipboard(
		blob: Blob,
		filename: string,
		sourceFile?: CanvasFileBlobData,
		sourceElements: LayerElement[] = sourceFile ? [sourceFile.element] : [],
	): Promise<boolean> {
		try {
			const file = new File([blob], filename, { type: PNG_MIME_TYPE })
			const fileId = sourceFile
				? `${sourceFile.element.id}:png-export`
				: `canvas-png:${Date.now()}`
			const metadata = CanvasElementClipboard.createCanvasExportFileMetadata({
				fileId,
				filename,
				mimeType: PNG_MIME_TYPE,
				fileSize: file.size,
				sourceElements,
				sourceRef: sourceFile?.sourceRef,
			})
			const files: CanvasElementClipboardWriteFile[] = [{ blob: file, metadata }]
			const payload = CanvasElementClipboard.createPayload({
				elements: [],
				canvasId: this.canvas.id,
				files: [metadata],
				operation: "copy-as-png",
			})
			await this.writeCanvasElementClipboardWithLog({
				operation: "copy-as-png",
				payload,
				files,
			})
			return true
		} catch (error) {
			void error
			return false
		}
	}

	/**
	 * 获取图片元素的 blob 和元数据（内部方法，供其他方法复用）
	 * @param element 图片元素数据
	 * @returns blob、文件名和元数据，或 null（如果获取失败）
	 */
	private async getImageBlobAndMetadata(element: ImageElement): Promise<{
		blob: Blob
		element: ImageElement
		metadata: {
			filename: string
			mimeType: string
			fileSize: number
			sourceRef?: CanvasElementClipboardFileMetadata["sourceRef"]
		}
	} | null> {
		const src = getActiveImageContent(element).src
		if (!src) {
			return null
		}

		const originalFile = await this.fetchOriginalFileBlob({
			src,
			fallbackFilename: `${element.name || "image"}.png`,
			fallbackMimeType: DEFAULT_IMAGE_MIME_TYPE,
		})
		if (!originalFile) {
			return null
		}

		const metadata = {
			filename: originalFile.filename,
			mimeType: originalFile.mimeType,
			fileSize: originalFile.fileSize,
			sourceRef: originalFile.sourceRef,
		}

		return { blob: originalFile.blob, element, metadata }
	}

	private getFilenameFromPath(path: string, fallback: string): string {
		const cleanPath = path.split("?")[0]
		const filename = getCanvasResourceFileName(cleanPath)
		return filename || fallback
	}

	private async getImageMetadata(element: ImageElement): Promise<CanvasFileMetadataData | null> {
		const src = getActiveImageContent(element).src
		if (!src) {
			return null
		}

		const metadata = await this.fetchOriginalFileMetadata({
			src,
			fallbackFilename: `${element.name || "image"}.png`,
			fallbackMimeType: DEFAULT_IMAGE_MIME_TYPE,
		})

		return metadata ? { element, ...metadata } : null
	}

	private async getVideoMetadata(element: VideoElement): Promise<CanvasFileMetadataData | null> {
		const src = getActiveContent(element)?.src
		if (!src) {
			return null
		}

		const metadata = await this.fetchOriginalFileMetadata({
			src,
			fallbackFilename: `${element.name || "video"}.mp4`,
			fallbackMimeType: DEFAULT_VIDEO_MIME_TYPE,
		})

		return metadata ? { element, ...metadata } : null
	}

	private async getAudioMetadata(element: AudioElement): Promise<CanvasFileMetadataData | null> {
		const src = getActiveContent(element)?.src
		if (!src) return null
		const metadata = await this.fetchOriginalFileMetadata({
			src,
			fallbackFilename:
				(element.name ? `${element.name}.mp3` : getCanvasResourceFileName(src)) ||
				"audio.mp3",
			fallbackMimeType: DEFAULT_AUDIO_MIME_TYPE,
		})
		return metadata ? { element, ...metadata } : null
	}

	private async getCanvasFileMetadata(
		element: CanvasFileElement,
	): Promise<CanvasFileMetadataData | null> {
		if (element.type === ElementTypeEnum.Image) {
			return this.getImageMetadata(element)
		}
		if (element.type === ElementTypeEnum.Audio) {
			return this.getAudioMetadata(element)
		}

		return this.getVideoMetadata(element)
	}

	private shouldExposeNativeFileForElementCopy(options: {
		rootElements: LayerElement[]
		mediaElement: CanvasFileElement
		mediaElementCount: number
		metadata: CanvasElementClipboardFileMetadata
	}): boolean {
		if (
			options.rootElements.length !== 1 ||
			options.mediaElementCount !== 1 ||
			options.rootElements[0]?.id !== options.mediaElement.id
		) {
			return false
		}

		return CanvasElementClipboard.supportsNativeMimeType(options.metadata.mimeType)
	}

	private async fetchNativeClipboardFile(
		metadata: CanvasElementClipboardFileMetadata,
	): Promise<NativeClipboardFile | null> {
		if (!metadata.sourceRef?.ossUrl) {
			return null
		}

		try {
			const response = await fetch(metadata.sourceRef.ossUrl, { cache: "default" })
			if (!response.ok) {
				return null
			}

			const blob = await response.blob()
			const mimeType = blob.type || metadata.mimeType
			if (!CanvasElementClipboard.supportsNativeMimeType(mimeType)) {
				return null
			}

			const fileMetadata = {
				...metadata,
				mimeType,
				fileSize: blob.size,
			}

			return {
				metadata: fileMetadata,
				native: {
					mimeType,
					blob,
				},
			}
		} catch (error) {
			return null
		}
	}

	private async collectClipboardFiles(
		elements: LayerElement[],
	): Promise<CollectedClipboardFiles> {
		const mediaElements = this.getClipboardMediaElements(elements)
		const resolveResourceReference =
			this.canvas.magicConfigManager?.config?.methods?.resolveResourceReference
		const resourceRefs = collectElementResourceReferences(elements, resolveResourceReference)
		const resourceRefByIdentity = new Map(resourceRefs.map((ref) => [ref.identity, ref]))
		const nonActiveMediaResourceIdentities = this.getNonActiveMediaResourceIdentities(
			elements,
			resolveResourceReference,
		)
		const generationResourceRefs = resourceRefs.filter(
			(ref) => !ref.isSelfReferenceOnly || nonActiveMediaResourceIdentities.has(ref.identity),
		)
		const [mediaMetadataResults, generationMetadataResults] = await Promise.all([
			Promise.all(mediaElements.map((element) => this.getCanvasFileMetadata(element))),
			Promise.all(
				generationResourceRefs.map((ref, index) => {
					const fallbackFilename = this.getFilenameFromPath(
						ref.path,
						`resource-${index + 1}`,
					)
					return this.fetchOriginalFileMetadata({
						src: ref.path,
						fallbackFilename,
						fallbackMimeType: this.getMimeTypeFromFilename(
							fallbackFilename,
							"application/octet-stream",
						),
					})
				}),
			),
		])
		const metadataList: CanvasElementClipboardFileMetadata[] = []
		const files: CanvasElementClipboardWriteFile[] = []
		let native: CanvasElementClipboardNativeExposure | undefined

		for (let i = 0; i < mediaMetadataResults.length; i++) {
			const element = mediaElements[i]
			const result = mediaMetadataResults[i]
			if (!result) {
				continue
			}

			const metadata = CanvasElementClipboard.createFileMetadata({
				element,
				fileId: `${element.id}:${i}`,
				filename: result.filename,
				mimeType: result.mimeType,
				fileSize: result.fileSize,
				...this.getElementResourceMetadata(element, resourceRefByIdentity),
				sourceRef: result.sourceRef,
			})
			metadataList.push(metadata)

			if (
				this.shouldExposeNativeFileForElementCopy({
					rootElements: elements,
					mediaElement: element,
					mediaElementCount: mediaElements.length,
					metadata,
				})
			) {
				const nativeFile = await this.fetchNativeClipboardFile(metadata)
				if (nativeFile) {
					metadataList[metadataList.length - 1] = nativeFile.metadata
					native = nativeFile.native
				}
			}
		}

		for (let i = 0; i < generationMetadataResults.length; i++) {
			const ref = generationResourceRefs[i]
			const result = generationMetadataResults[i]
			if (!result) {
				continue
			}

			metadataList.push(
				CanvasElementClipboard.createGenerationResourceMetadata({
					fileId: `generation-resource:${i}`,
					resourcePath: ref.path,
					resourceIdentity: ref.identity,
					resourceAliases: ref.aliases,
					filename: result.filename,
					mimeType: result.mimeType,
					fileSize: result.fileSize,
					sourceRef: result.sourceRef,
				}),
			)
		}

		return { metadata: metadataList, files, native }
	}

	private getNonActiveMediaResourceIdentities(
		elements: LayerElement[],
		resolveResourceReference?: ResolveCanvasResourceReference,
	): Set<string> {
		const identities = new Set<string>()

		const collect = (element: LayerElement): void => {
			if (CanvasElementClipboard.isCanvasFileElement(element)) {
				const activeContentId = getActiveContent(element)?.contentId
				for (const content of element.contents) {
					if (content.contentId === activeContentId) continue
					const identity = getClipboardResourcePathKey(
						content.src,
						resolveResourceReference,
					)
					if (identity) identities.add(identity)
				}
			}

			if (isCanvasContainerElement(element) && Array.isArray(element.children)) {
				element.children.forEach(collect)
			}
		}

		elements.forEach(collect)
		return identities
	}

	private getElementResourceMetadata(
		element: CanvasFileElement,
		resourceRefByIdentity: ReadonlyMap<string, ClipboardResourceReference>,
	): Pick<CanvasElementClipboardFileMetadata, "resourceIdentity" | "resourceAliases"> {
		const elementSrc =
			element.type === ElementTypeEnum.Image
				? getActiveImageContent(element).src
				: getActiveContent(element)?.src
		const resourceIdentity = getClipboardResourcePathKey(
			elementSrc,
			this.canvas.magicConfigManager?.config?.methods?.resolveResourceReference,
		)
		if (!resourceIdentity || !elementSrc) return {}

		const resourceAliases = Array.from(
			new Set([elementSrc, ...(resourceRefByIdentity.get(resourceIdentity)?.aliases ?? [])]),
		)
		return { resourceIdentity, resourceAliases }
	}

	private getClipboardMediaElements(elements: LayerElement[]): CanvasFileElement[] {
		const mediaElements: CanvasFileElement[] = []

		const collect = (element: LayerElement): void => {
			if (CanvasElementClipboard.isCanvasFileElement(element)) {
				mediaElements.push(element)
			}

			if (!isCanvasContainerElement(element) || !Array.isArray(element.children)) {
				return
			}

			element.children.forEach(collect)
		}

		elements.forEach(collect)
		return mediaElements
	}

	/**
	 * 复制元素到剪贴板
	 * @param elementId - 元素ID（可选，如果不传则复制所有选中的元素）
	 */
	public async copy(elementId?: string): Promise<void> {
		try {
			let elements: LayerElement[]

			if (elementId) {
				// 复制指定元素
				const element = this.canvas.elementManager.getElementData(elementId)
				if (!element) return
				elements = [element]
			} else {
				// 复制所有选中的元素
				const selectedIds = this.canvas.selectionManager.getSelectedIds()
				if (selectedIds.length === 0) {
					return
				}

				// 获取所有选中的元素数据
				elements = selectedIds
					.map((id) => this.canvas.elementManager.getElementData(id))
					.filter((el): el is LayerElement => el !== null && el !== undefined)

				if (elements.length === 0) {
					return
				}
			}

			elements = this.canvas.elementManager.filterElementsForClipboard(elements)
			if (elements.length === 0) {
				return
			}
			elements = elements.map((element) => this.sanitizeElementTreeForClipboard(element))

			// 复制元素时会异步获取媒体 sourceRef，先展示 loading 避免用户误以为未响应。
			const copyToast = this.showCopyLoadingToast()
			let success = false
			try {
				const { metadata, files, native } = await this.collectClipboardFiles(elements)
				const payload = CanvasElementClipboard.createPayload({
					elements,
					canvasId: this.canvas.id,
					files: metadata,
					operation: "copy-elements",
				})
				await this.writeCanvasElementClipboardWithLog({
					operation: "copy-elements",
					payload,
					files,
					native,
				})
				success = true
				copyToast.success()
			} finally {
				if (!success) {
					copyToast.dismiss()
				}
			}
		} catch (error) {
			// 复制失败，静默处理
			throw new Error(error instanceof Error ? error.message : "复制失败")
		}
	}

	/**
	 * 聚焦到元素（单个或多个）
	 * @param elementIds 元素ID数组
	 */
	private focusOnElements(elementIds: string[]): void {
		if (elementIds.length === 0) return

		requestAnimationFrame(() => {
			this.canvas.viewportController.focusOnElements(elementIds, { animated: true })
		})
	}

	/**
	 * 从剪贴板粘贴元素或图片文件。
	 *
	 * 调用来源：
	 * - Ctrl/Cmd+V：传入 ClipboardEvent，可在 CanvasElementClipboard 中读取同步文件字节。
	 * - 菜单粘贴：不传 ClipboardEvent，只传 position，只能依赖 Clipboard API read()。
	 *
	 * @param clipboardEvent 可选的 ClipboardEvent，如果提供则可用于补齐文件
	 * @param position 可选的位置参数，如果提供则在该位置粘贴（元素中心对齐到该位置），否则在画布中心粘贴
	 * @param pasteSource 粘贴入口来源，用于日志和问题追踪
	 */
	public async paste(
		clipboardEvent?: ClipboardEvent,
		position?: { x: number; y: number },
		pasteSource: CanvasElementClipboardPasteSource = clipboardEvent ? "keyboard" : "menu",
	): Promise<void> {
		try {
			// 解析细节统一收敛在 CanvasElementClipboard：
			// Ctrl/Cmd+V 会传 clipboardEvent；菜单粘贴传 undefined。
			const parseResult = await CanvasElementClipboard.parseClipboardContent(clipboardEvent, {
				...this.getClipboardBrowserOptions(),
				pasteSource,
			})

			// 根据解析结果执行相应操作
			if (parseResult.type === "empty" || parseResult.type === "invalid") {
				if (
					!clipboardEvent &&
					parseResult.type === "invalid" &&
					parseResult.reason === "clipboard-api-unreadable-items"
				) {
					this.showUnreadableClipboardHint()
					return
				}
				if (
					!clipboardEvent &&
					parseResult.type === "invalid" &&
					parseResult.reason === "clipboard-filename-text-only"
				) {
					this.showUnreadableClipboardHint()
				}
				return
			}

			if (parseResult.type === "canvas-elements") {
				await this.pasteCanvasElementsFromRichClipboard(
					parseResult.elements,
					parseResult.files,
					parseResult.fileMetadata,
					parseResult.canvasId,
					position,
				)
				return
			}

			if (parseResult.type === "files") {
				await this.pasteFilesFromClipboard(parseResult.files, position)
				return
			}
		} catch {
			return
		}
	}

	private getFileElementDataWithUploadResult(
		finalElement: CanvasFileElement,
		uploadResult: UploadFileResponse,
		targetContentId: string,
	): CanvasFileElement {
		if (finalElement.type === ElementTypeEnum.Audio) {
			return {
				...updateContent(finalElement, targetContentId, {
					src: uploadResult.path,
				}),
				visible: true,
			} as CanvasFileElement
		}
		if (finalElement.type === ElementTypeEnum.Image && isImageElementContent(finalElement)) {
			return this.stripMediaGenerationTaskIdentity(
				updateImageContent(finalElement, targetContentId, {
					src: uploadResult.path,
					status: GenerationStatus.Completed,
					errorMessage: undefined,
				}),
			) as CanvasFileElement
		}
		return this.stripMediaGenerationTaskIdentity(
			updateContent(finalElement, targetContentId, {
				src: uploadResult.path,
				status: GenerationStatus.Completed,
				errorMessage: undefined,
			}),
		)
	}

	/**
	 * 上传完成只能提交资源域字段，不能把异步任务开始时的布局快照带回 ElementManager。
	 * 多选拖动的实时阶段只更新 Konva node；若这里提交完整元素，旧 x/y 会覆盖正在拖动的位置。
	 */
	private getFileElementResourceUpdates(uploadedElement: CanvasFileElement): ElementUpdatePatch {
		if (uploadedElement.type === ElementTypeEnum.Audio) {
			return {
				contents: uploadedElement.contents,
				activeContentId: uploadedElement.activeContentId,
				mainContentId: uploadedElement.mainContentId,
				visible: uploadedElement.visible,
			}
		}

		if (uploadedElement.type === ElementTypeEnum.Image) {
			return {
				contents: uploadedElement.contents,
				activeContentId: uploadedElement.activeContentId,
				mainContentId: uploadedElement.mainContentId,
			}
		}

		return {
			contents: uploadedElement.contents,
			activeContentId: uploadedElement.activeContentId,
			mainContentId: uploadedElement.mainContentId,
		}
	}

	private getFileElementUploadingPlaceholder(
		finalElement: Exclude<CanvasFileElement, AudioElement>,
		targetContentId: string,
	): CanvasFileElement {
		if (finalElement.type === ElementTypeEnum.Image && isImageElementContent(finalElement)) {
			return this.stripMediaGenerationTaskIdentity(
				updateImageContent(finalElement, targetContentId, {
					src: undefined,
					status: GenerationStatus.Processing,
					errorMessage: undefined,
				}),
			) as CanvasFileElement
		}
		return this.stripMediaGenerationTaskIdentity(
			updateContent(finalElement, targetContentId, {
				src: undefined,
				status: GenerationStatus.Processing,
				errorMessage: undefined,
			}),
		)
	}

	private stripMediaGenerationTaskIdentity<T extends CanvasFileElement>(
		element: T,
		options?: { normalizeUnresumableImageContents?: boolean },
	): T {
		const stripRequestIdentity = (request: unknown, idKey: string) => {
			if (!request || typeof request !== "object") return request
			const nextRequest = { ...(request as Record<string, unknown>) }
			delete nextRequest[idKey]
			delete nextRequest.project_id
			delete nextRequest.file_dir
			delete nextRequest.file_name
			return nextRequest
		}

		if (element.type === ElementTypeEnum.Image && isImageElementContent(element)) {
			const image = element
			const contents = image.contents.map((content) => ({
				...content,
				status:
					options?.normalizeUnresumableImageContents &&
					(content.status === GenerationStatus.Pending ||
						content.status === GenerationStatus.Processing)
						? GenerationStatus.Failed
						: content.status,
				generateImageRequest: content.generateImageRequest
					? (stripRequestIdentity(
							content.generateImageRequest,
							"image_id",
						) as typeof content.generateImageRequest)
					: undefined,
				imageGenerationTaskMeta: content.imageGenerationTaskMeta
					? (stripRequestIdentity(
							content.imageGenerationTaskMeta,
							"image_id",
						) as typeof content.imageGenerationTaskMeta)
					: undefined,
			}))
			return { ...image, contents } as T
		}

		if (element.type === ElementTypeEnum.Video) {
			return {
				...element,
				contents: element.contents.map((content) => ({
					...content,
					generateVideoRequest: content.generateVideoRequest
						? (stripRequestIdentity(
								content.generateVideoRequest,
								"video_id",
							) as typeof content.generateVideoRequest)
						: undefined,
				})),
			} as T
		}

		return { ...element } as T
	}

	private sanitizeElementTreeForClipboard(element: LayerElement): LayerElement {
		let sanitized = this.cloneLayerElementData(element)
		if (isCanvasContainerElement(sanitized) && Array.isArray(sanitized.children)) {
			sanitized = {
				...sanitized,
				children: sanitized.children.map((child) =>
					this.sanitizeElementTreeForClipboard(child),
				),
			}
		}
		if (CanvasElementClipboard.isCanvasFileElement(sanitized)) {
			return this.stripMediaGenerationTaskIdentity(sanitized, {
				normalizeUnresumableImageContents: true,
			})
		}
		return sanitized
	}

	private primeFileElementResourceCache(
		element: CanvasFileElement,
		uploadResult: UploadFileResponse,
	): void {
		if (!uploadResult.src) {
			return
		}

		if (element.type === ElementTypeEnum.Image) {
			this.canvas.imageResourceManager.primeCache(uploadResult.path, uploadResult)
			return
		}
		if (element.type === ElementTypeEnum.Audio) {
			this.canvas.audioResourceManager.primeCache(uploadResult.path, uploadResult)
			return
		}

		this.canvas.videoResourceManager.primeCache(uploadResult.path, uploadResult)
	}

	private primeGenerationResourceCache(
		resourcePath: string,
		uploadResult: UploadFileResponse,
		metadata: CanvasElementClipboardFileMetadata,
	): void {
		if (!uploadResult.src) {
			return
		}

		const mimeType = metadata.mimeType?.toLowerCase() || ""
		const filename = metadata.filename?.toLowerCase() || resourcePath.toLowerCase()
		const isImage =
			mimeType.startsWith("image/") ||
			/\.(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(filename)
		const isVideo =
			mimeType.startsWith("video/") || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(filename)

		if (isImage) {
			this.canvas.imageResourceManager.primeCache(uploadResult.path, uploadResult)
			return
		}

		if (isVideo) {
			this.canvas.videoResourceManager.primeCache(uploadResult.path, uploadResult)
		}
	}

	private cloneElementForPaste(element: LayerElement): LayerElement {
		let clonedElement = { ...element, id: generateElementId() } as LayerElement
		const contentIdMap = new Map<string, string>()
		clonedElement.contents.forEach((content) => {
			contentIdMap.set(content.contentId, createContentId())
		})
		const mappedElement = mapContents(clonedElement, (content) => ({
			...content,
			contentId: contentIdMap.get(content.contentId) as string,
		}))
		clonedElement = {
			...mappedElement,
			activeContentId: mappedElement.activeContentId
				? (contentIdMap.get(mappedElement.activeContentId) ?? mappedElement.activeContentId)
				: null,
			mainContentId: mappedElement.mainContentId
				? (contentIdMap.get(mappedElement.mainContentId) ?? mappedElement.mainContentId)
				: null,
		} as LayerElement

		return clonedElement
	}

	private cloneLayerElementData(element: LayerElement): LayerElement {
		return JSON.parse(JSON.stringify(element)) as LayerElement
	}

	private async resolveGenerationResourcePathMap(
		fileMetadata: CanvasElementClipboardFileMetadata[],
		sourceCanvasId?: string,
	): Promise<{ pathMap: Map<string, string>; failureCount: number }> {
		const pathMap = new Map<string, string>()
		const transferItems: Array<{
			metadata: CanvasElementClipboardFileMetadata
			resourcePath: string
		}> = []
		const seenResourceKeys = new Set<string>()
		const generationResources = fileMetadata.filter(
			(metadata) => metadata.role === "generation-resource" && metadata.resourcePath,
		)
		for (const metadata of generationResources) {
			const resourcePath = metadata.resourcePath
			const resourcePathKey = metadata.resourceIdentity || resourcePath
			if (!resourcePath || !resourcePathKey || seenResourceKeys.has(resourcePathKey)) {
				continue
			}

			seenResourceKeys.add(resourcePathKey)
			transferItems.push({ metadata, resourcePath })
		}

		const transferResults = await Promise.all(
			transferItems.map(async ({ metadata, resourcePath }) => {
				const uploadResult =
					await this.canvas.canvasFileUploadManager.transferRemoteResource({
						sourceCanvasId,
						metadata,
					})
				if (uploadResult?.path) {
					this.primeGenerationResourceCache(resourcePath, uploadResult, metadata)
					return { metadata, resourcePath, uploadResult, failed: false }
				}
				return { metadata, resourcePath, uploadResult: null, failed: true }
			}),
		)

		let failureCount = 0
		for (const result of transferResults) {
			if (result.uploadResult?.path) {
				addClipboardResourceAliasMappings(
					pathMap,
					result.resourcePath,
					result.metadata.resourceAliases,
					result.uploadResult.path,
				)
				continue
			}
			if (result.failed) {
				failureCount += 1
			}
		}
		return { pathMap, failureCount }
	}

	private registerGenerationResourceLoadDeferrals(
		fileMetadata: CanvasElementClipboardFileMetadata[],
	): Array<() => void> {
		const releases: Array<() => void> = []
		const seenKeys = new Set<string>()

		for (const metadata of fileMetadata) {
			if (metadata.role !== "generation-resource" || !metadata.resourcePath) {
				continue
			}

			const aliases = metadata.resourceAliases?.length
				? metadata.resourceAliases
				: [metadata.resourcePath]
			for (const alias of aliases) {
				const resourceKey = `${metadata.resourceIdentity || metadata.id}\0${alias}`
				if (seenKeys.has(resourceKey)) continue
				seenKeys.add(resourceKey)
				releases.push(
					this.canvas.canvasFileUploadManager.registerPendingRemoteResourceLoadDeferral(
						alias,
					),
				)
			}
		}
		return releases
	}

	private runClipboardGenerationResourceTransfers(options: {
		fileMetadata: CanvasElementClipboardFileMetadata[]
		sourceCanvasId?: string
		targetElementIds: string[]
		releaseLoadDeferrals?: Array<() => void>
	}): void {
		const {
			fileMetadata,
			sourceCanvasId,
			targetElementIds,
			releaseLoadDeferrals = [],
		} = options
		if (targetElementIds.length === 0) {
			releaseLoadDeferrals.forEach((release) => release())
			return
		}
		void (async () => {
			try {
				const result = await this.resolveGenerationResourcePathMap(
					fileMetadata,
					sourceCanvasId,
				)
				let rewriteCount = 0

				for (const elementId of targetElementIds) {
					const currentElement = this.canvas.elementManager.getElementData(elementId)
					if (!currentElement) {
						continue
					}

					const nextElement = this.cloneLayerElementData(currentElement)
					const hasRewritten = rewriteElementResourceReferences(
						nextElement,
						result.pathMap,
					)
					if (!hasRewritten) {
						continue
					}

					this.canvas.elementManager.update(elementId, nextElement, { silent: false })
					rewriteCount += 1
				}

				if (rewriteCount > 0) {
					this.canvas.historyManager.recordHistoryImmediate()
				}

				if (result.failureCount > 0) {
					this.showClipboardSourceUnavailableHint()
				}
			} catch {
				this.showClipboardSourceUnavailableHint()
			} finally {
				releaseLoadDeferrals.forEach((release) => release())
			}
		})()
	}

	private async resolveCrossCanvasTreeFileElement(options: {
		sourceElement: CanvasFileElement
		finalElement: CanvasFileElement
		fileByElementId: Map<string, File>
		metadataByElementId: Map<string, CanvasElementClipboardFileMetadata>
		sourceCanvasId?: string
	}): Promise<PreparedClipboardTreeFileElement> {
		const {
			sourceElement,
			finalElement,
			fileByElementId,
			metadataByElementId,
			sourceCanvasId,
		} = options
		const metadata = metadataByElementId.get(sourceElement.id)
		const sourcePath =
			sourceElement.type === ElementTypeEnum.Image
				? getActiveImageContent(sourceElement).src
				: getActiveContent(sourceElement)?.src

		const file = fileByElementId.get(sourceElement.id)
		const targetContentId = getActiveContent(finalElement)?.contentId
		if (!targetContentId) {
			return {
				element: null,
				sourceReferenceFailureCount: 1,
			}
		}
		const pendingUpload: ClipboardTreeFileUpload | null = file
			? {
					sourceElementId: sourceElement.id,
					targetElementId: finalElement.id,
					targetContentId,
					sourceCanvasId,
					sourcePath,
					file,
					metadata,
				}
			: metadata?.sourceRef?.ossUrl
				? {
						sourceElementId: sourceElement.id,
						targetElementId: finalElement.id,
						targetContentId,
						sourceCanvasId,
						sourcePath,
						metadata,
					}
				: null

		if (!pendingUpload) {
			return {
				element: null,
				sourceReferenceFailureCount: 1,
			}
		}

		if (finalElement.type === ElementTypeEnum.Audio) {
			// AudioElement 不具备可持久化的上传状态；先完成上传再加入元素树，避免撤销
			// 恢复出永久隐藏且没有 src 的空音频节点。
			const uploadResult = await this.resolveClipboardTreeUploadResult(pendingUpload)
			if (!uploadResult) {
				return {
					element: null,
					sourceReferenceFailureCount: 1,
				}
			}
			return {
				element: this.finalizeClipboardTreeFileElement(
					finalElement,
					pendingUpload,
					uploadResult,
				),
				sourceReferenceFailureCount: 0,
			}
		}

		return {
			element: this.getFileElementUploadingPlaceholder(finalElement, targetContentId),
			sourceReferenceFailureCount: 0,
			pendingUpload,
		}
	}

	private async prepareClipboardTreeElement(options: {
		sourceElement: LayerElement
		isRoot: boolean
		offsetX: number
		offsetY: number
		rootZIndex?: number
		canReuseElementSrc: boolean
		fileByElementId: Map<string, File>
		metadataByElementId: Map<string, CanvasElementClipboardFileMetadata>
		sourceCanvasId?: string
	}): Promise<PreparedClipboardTreeElement> {
		const {
			sourceElement,
			isRoot,
			offsetX,
			offsetY,
			rootZIndex,
			canReuseElementSrc,
			fileByElementId,
			metadataByElementId,
			sourceCanvasId,
		} = options
		let sourceReferenceFailureCount = 0
		const pendingUploads: ClipboardTreeFileUpload[] = []
		let finalElement = this.cloneElementForPaste(sourceElement)

		if (isRoot) {
			finalElement = {
				...finalElement,
				x: (sourceElement.x ?? 0) + offsetX,
				y: (sourceElement.y ?? 0) + offsetY,
				zIndex: rootZIndex,
			} as LayerElement
		}

		if (isCanvasContainerElement(sourceElement) && Array.isArray(sourceElement.children)) {
			const preparedChildren: LayerElement[] = []

			for (const child of sourceElement.children) {
				const preparedChild = await this.prepareClipboardTreeElement({
					sourceElement: child,
					isRoot: false,
					offsetX,
					offsetY,
					canReuseElementSrc,
					fileByElementId,
					metadataByElementId,
					sourceCanvasId,
				})
				sourceReferenceFailureCount += preparedChild.sourceReferenceFailureCount
				pendingUploads.push(...preparedChild.pendingUploads)
				if (preparedChild.element) {
					preparedChildren.push(preparedChild.element)
				}
			}

			;(finalElement as CanvasContainerElement).children = preparedChildren
		}

		if (!CanvasElementClipboard.isCanvasFileElement(sourceElement)) {
			return { element: finalElement, sourceReferenceFailureCount, pendingUploads }
		}

		if (canReuseElementSrc) {
			return { element: finalElement, sourceReferenceFailureCount, pendingUploads }
		}

		const resolvedFileElement = await this.resolveCrossCanvasTreeFileElement({
			sourceElement,
			finalElement: finalElement as CanvasFileElement,
			fileByElementId,
			metadataByElementId,
			sourceCanvasId,
		})

		sourceReferenceFailureCount += resolvedFileElement.sourceReferenceFailureCount
		if (resolvedFileElement.pendingUpload) {
			pendingUploads.push(resolvedFileElement.pendingUpload)
		}

		return {
			element: resolvedFileElement.element,
			sourceReferenceFailureCount,
			pendingUploads,
		}
	}

	private async resolveClipboardTreeUploadResult(
		upload: ClipboardTreeFileUpload,
	): Promise<UploadFileResponse | null> {
		if (upload.file) {
			try {
				const [uploadResult] = await this.canvas.canvasFileUploadManager.uploadDirect([
					upload.file,
				])
				if (!uploadResult) {
					return null
				}
				return uploadResult
			} catch {
				return null
			}
		}

		if (!upload.metadata) {
			return null
		}

		return this.canvas.canvasFileUploadManager.transferRemoteResource({
			sourceCanvasId: upload.sourceCanvasId,
			metadata: upload.metadata,
		})
	}

	private applyClipboardTreeUploadResult(
		upload: ClipboardTreeFileUpload,
		uploadResult: UploadFileResponse,
	): boolean {
		if (!this.canvas.elementManager.hasElement(upload.targetElementId)) {
			return false
		}

		const currentElement = this.canvas.elementManager.getElementData(upload.targetElementId)
		if (!currentElement || !CanvasElementClipboard.isCanvasFileElement(currentElement)) {
			return false
		}

		const uploadedElement = this.finalizeClipboardTreeFileElement(
			currentElement,
			upload,
			uploadResult,
		)
		const resourceUpdates = this.getFileElementResourceUpdates(uploadedElement)

		if (this.canvas.elementManager.isTemporary(upload.targetElementId)) {
			this.canvas.elementManager.convertToPermament(upload.targetElementId, resourceUpdates, {
				silent: true,
			})
		} else {
			this.canvas.elementManager.update(upload.targetElementId, resourceUpdates, {
				silent: false,
			})
		}
		this.activateUploadedFileElementResource(
			uploadedElement,
			uploadResult,
			upload.targetContentId,
		)

		return true
	}

	private finalizeClipboardTreeFileElement(
		finalElement: CanvasFileElement,
		upload: ClipboardTreeFileUpload,
		uploadResult: UploadFileResponse,
	): CanvasFileElement {
		const uploadedElement = this.getFileElementDataWithUploadResult(
			finalElement,
			uploadResult,
			upload.targetContentId,
		)
		if (upload.sourcePath) {
			const pathMap = new Map<string, string>()
			addClipboardResourceAliasMappings(
				pathMap,
				upload.sourcePath,
				[
					upload.metadata?.sourceRef?.src,
					...(upload.metadata?.resourceAliases ?? []),
				].filter((alias): alias is string => typeof alias === "string" && alias.length > 0),
				uploadResult.path,
			)
			rewriteElementResourceReferences(uploadedElement, pathMap)
		}
		this.primeFileElementResourceCache(uploadedElement, uploadResult)
		return uploadedElement
	}

	private activateUploadedFileElementResource(
		element: CanvasFileElement,
		uploadResult: UploadFileResponse,
		targetContentId: string,
	): void {
		if (element.activeContentId !== targetContentId) {
			return
		}
		const elementInstance = this.canvas.elementManager.getElementInstance(element.id)

		if (
			element.type === ElementTypeEnum.Image &&
			uploadResult.src &&
			elementInstance &&
			"setOssSrc" in elementInstance &&
			typeof elementInstance.setOssSrc === "function"
		) {
			elementInstance.setOssSrc(uploadResult.src)
		}

		if (
			element.type === ElementTypeEnum.Video &&
			elementInstance &&
			"requestPreviewLoad" in elementInstance &&
			typeof elementInstance.requestPreviewLoad === "function"
		) {
			elementInstance.requestPreviewLoad({ force: true })
		}

		if (element.type !== ElementTypeEnum.Audio) {
			this.canvas.visibilityManager.requestImmediateMediaLoadForElements([element.id], {
				reason: "clipboard-tree-upload",
				priority: "critical",
			})
		}
	}

	private applyClipboardTreeUploadFailure(upload: ClipboardTreeFileUpload): void {
		if (!this.canvas.elementManager.hasElement(upload.targetElementId)) {
			return
		}
		const element = this.canvas.elementManager.getElementData(upload.targetElementId)
		if (element?.type === ElementTypeEnum.Audio) {
			// 音频不会进入异步占位上传链路；防御性忽略旧任务，避免重新引入隐藏空节点语义。
			return
		}

		const patch = {
			status: GenerationStatus.Failed,
			errorMessage:
				this.canvas.t?.(
					"menu.clipboardSourceUnavailable",
					"原文件链接已失效或无法访问，请重新复制后再粘贴",
				) || "原文件链接已失效或无法访问，请重新复制后再粘贴",
		}
		const instance = this.canvas.elementManager.getElementInstance(upload.targetElementId)
		if (instance instanceof ImageElementClass) {
			instance.updateContentData(upload.targetContentId, patch, { silent: true })
			return
		}
		if (!element || !CanvasElementClipboard.isCanvasFileElement(element)) return
		const nextElement = updateContent(element, upload.targetContentId, patch)
		this.canvas.elementManager.update(
			upload.targetElementId,
			{ contents: nextElement.contents },
			{ silent: true },
		)
	}

	private runClipboardTreeFileUploads(uploads: ClipboardTreeFileUpload[]): void {
		if (uploads.length === 0) {
			return
		}

		void Promise.all(
			uploads.map(async (upload) => {
				const uploadResult = await this.resolveClipboardTreeUploadResult(upload)
				if (!uploadResult) {
					this.applyClipboardTreeUploadFailure(upload)
					return false
				}
				return this.applyClipboardTreeUploadResult(upload, uploadResult)
			}),
		).then((results) => {
			const successCount = results.filter(Boolean).length
			const failureCount = uploads.length - successCount

			if (successCount > 0) {
				this.canvas.historyManager.recordHistoryImmediate()
			}

			if (failureCount > 0) {
				this.showClipboardSourceUnavailableHint()
			}
		})
	}

	private async pasteCanvasElementsFromRichClipboard(
		elements: LayerElement[],
		files: CanvasElementClipboardFile[],
		fileMetadata: CanvasElementClipboardFileMetadata[],
		canvasId: string | undefined,
		position?: { x: number; y: number },
	): Promise<void> {
		const sortedElements = [...elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
		const fileByElementId = new Map(files.map((item) => [item.metadata.elementId, item.file]))
		const metadataByElementId = new Map(
			fileMetadata
				.filter((metadata) => metadata.role === "element-media")
				.map((metadata) => [metadata.elementId, metadata]),
		)
		const maxZIndex = this.canvas.elementManager.getMaxZIndexInLevel()
		const targetPosition = this.getTargetPosition(position)
		const { offsetX, offsetY } =
			sortedElements.length === 1
				? this.getElementCenterOffset(sortedElements[0], targetPosition)
				: this.getElementsCenterOffset(sortedElements, targetPosition)
		const canReuseElementSrc = this.canPasteFromClipboardCanvas(canvasId)
		const shouldTransferGenerationResourcesAfterCreate = !canReuseElementSrc
		const generationResourceLoadDeferralReleases = shouldTransferGenerationResourcesAfterCreate
			? this.registerGenerationResourceLoadDeferrals(fileMetadata)
			: []
		const createdElementIds: string[] = []
		const pendingTreeFileUploads: ClipboardTreeFileUpload[] = []
		let sourceReferenceFailureCount = 0
		let hasShownSourceUnavailableHint = false
		let generationResourceTransferScheduled = false
		this.canvas.historyManager.disable()

		try {
			const { pendingBatchId } = await this.canvas.canvasFileUploadManager.withLock(
				async () => {
					const pendingBatchId =
						this.canvas.canvasFileUploadManager.getCurrentPendingBatchId()
					let nextZIndex = maxZIndex + 1

					for (const element of sortedElements) {
						const rootZIndex = nextZIndex++
						const preparedTree = await this.prepareClipboardTreeElement({
							sourceElement: element,
							isRoot: true,
							offsetX,
							offsetY,
							rootZIndex,
							canReuseElementSrc,
							fileByElementId,
							metadataByElementId,
							sourceCanvasId: canvasId,
						})
						sourceReferenceFailureCount += preparedTree.sourceReferenceFailureCount

						if (!preparedTree.element) {
							continue
						}

						preparedTree.pendingUploads.forEach((upload) => {
							this.canvas.elementManager.markElementTemporary(upload.targetElementId)
						})
						this.canvas.elementManager.create(preparedTree.element)
						if (preparedTree.pendingUploads.length > 0) {
							this.canvas.visibilityManager.requestImmediateMediaLoadForElements(
								[preparedTree.element.id],
								{
									reason: "clipboard-container-tree",
									priority: "critical",
								},
							)
						}
						pendingTreeFileUploads.push(...preparedTree.pendingUploads)
						createdElementIds.push(preparedTree.element.id)
					}

					return { pendingBatchId }
				},
			)

			this.canvas.historyManager.enable()
			if (createdElementIds.length > 0) {
				this.canvas.selectionManager.selectMultiple(createdElementIds)
				this.focusOnElements(createdElementIds)
				this.canvas.historyManager.recordHistoryImmediate()
			}
			if (sourceReferenceFailureCount > 0 && !hasShownSourceUnavailableHint) {
				hasShownSourceUnavailableHint = true
				this.showClipboardSourceUnavailableHint()
			}
			if (
				pendingBatchId &&
				this.canvas.canvasFileUploadManager.hasPendingUploadBatch(pendingBatchId)
			) {
				this.canvas.canvasFileUploadManager.commitPendingUploadBatch(pendingBatchId)
			}
			this.runClipboardTreeFileUploads(pendingTreeFileUploads)
			if (shouldTransferGenerationResourcesAfterCreate) {
				generationResourceTransferScheduled = true
				this.runClipboardGenerationResourceTransfers({
					fileMetadata,
					sourceCanvasId: canvasId,
					targetElementIds: createdElementIds,
					releaseLoadDeferrals: generationResourceLoadDeferralReleases,
				})
			}
		} catch (error) {
			this.canvas.historyManager.enable()
			if (!generationResourceTransferScheduled) {
				generationResourceLoadDeferralReleases.forEach((release) => release())
			}
			throw error
		}
	}

	/**
	 * 从剪贴板粘贴文件
	 */
	private async pasteFilesFromClipboard(
		files: File[],
		position?: { x: number; y: number },
	): Promise<void> {
		if (files.length === 1) {
			await this.pasteCanvasFile(files[0], position)
			return
		}

		const targetPosition = this.getTargetPosition(position)
		const total = files.length
		const dropOverlay = this.canvas.dropOverlayManager
		dropOverlay.showProgressOverlay(0, total)
		try {
			await this.pasteMultipleCanvasFiles(files, targetPosition, {
				onProgress: (current) => {
					dropOverlay.updateProgressOverlay(current, total)
				},
			})
		} finally {
			dropOverlay.hideProgressOverlay()
		}
	}

	/**
	 * 粘贴多个文件到画布（支持图片、视频、音频）
	 * @param files 文件数组
	 * @param anchorPosition 锚点位置（第一个文件的中心位置）
	 * @param options 可选配置
	 * @returns 创建的元素 ID 数组
	 */
	public async pasteMultipleCanvasFiles(
		files: File[],
		anchorPosition: { x: number; y: number },
		options?: { skipFocus?: boolean; onProgress?: (current: number) => void },
	): Promise<string[]> {
		this.canvas.historyManager.disable()
		let processedUploadCount = 0
		let failedUploadCount = 0
		const processedUploadIndexes = new Set<number>()
		const markUploadProcessed = (index: number, status: "success" | "failed") => {
			if (processedUploadIndexes.has(index)) return
			processedUploadIndexes.add(index)
			processedUploadCount += 1
			if (status === "failed") {
				failedUploadCount += 1
			}
			options?.onProgress?.(processedUploadCount)
		}

		try {
			const { createdElementIds, pendingBatchId } =
				await this.canvas.canvasFileUploadManager.withLock(async () => {
					const pendingBatchId =
						this.canvas.canvasFileUploadManager.getCurrentPendingBatchId()
					const mediaDimensions = await Promise.all(
						files.map((file) =>
							isAudioFile(file)
								? {
										width: AUDIO_CONFIG.DEFAULT_WIDTH,
										height: AUDIO_CONFIG.DEFAULT_HEIGHT,
									}
								: getMediaDimensions(file),
						),
					)
					const positions = resolveGridPlacements(mediaDimensions, anchorPosition)

					const createdElementIds: string[] = []
					for (let i = 0; i < files.length; i++) {
						const file = files[i]
						const position = positions[i]

						const elementId =
							await this.canvas.canvasFileUploadManager.uploadFileElement({
								file,
								position,
								manageHistory: false,
								onUploadComplete: () => {
									markUploadProcessed(i, "success")
								},
								onUploadFailed: () => {
									markUploadProcessed(i, "failed")
								},
							})
						if (!elementId) {
							markUploadProcessed(i, "failed")
						}
						if (elementId) {
							createdElementIds.push(elementId)
						}
						// 让出一帧让浏览器渲染已创建的临时元素
						await new Promise((r) => requestAnimationFrame(r))
					}

					if (createdElementIds.length > 0 && !options?.skipFocus) {
						this.focusOnElements(createdElementIds)
					}

					return { createdElementIds, pendingBatchId }
				})

			const existingElementIds = createdElementIds.filter((elementId) =>
				this.canvas.elementManager.hasElement(elementId),
			)

			this.canvas.historyManager.enable()

			if (
				pendingBatchId &&
				this.canvas.canvasFileUploadManager.hasPendingUploadBatch(pendingBatchId)
			) {
				this.canvas.historyManager.recordHistoryImmediate()
				this.canvas.canvasFileUploadManager.commitPendingUploadBatch(pendingBatchId)
			} else if (existingElementIds.length > 0) {
				this.canvas.historyManager.recordHistoryImmediate()
			}

			this.showBatchUploadFailedToast(failedUploadCount, files.length)
			return existingElementIds
		} catch (error) {
			this.canvas.historyManager.enable()
			if (failedUploadCount === 0) {
				this.showBatchUploadFailedToast(files.length, files.length)
			}
			throw error
		}
	}

	/**
	 * 粘贴文件到画布（支持图片、视频、音频）
	 * @param file 文件
	 * @param position 可选的位置参数，如果提供则在该位置创建文件元素
	 * @param options 可选配置
	 * @returns 创建的元素 ID
	 */
	public async pasteCanvasFile(
		file: File,
		position?: { x: number; y: number },
		options?: { skipFocus?: boolean },
	): Promise<string | null> {
		if (this.canvas.readonly) {
			return null
		}

		const validation = validateFile(file)
		if (!validation.valid) {
			return null
		}

		const targetPosition = this.getTargetPosition(position)
		const elementIds = await this.pasteMultipleCanvasFiles([file], targetPosition, options)

		return elementIds.length > 0 ? elementIds[0] : null
	}

	/**
	 * 粘贴多个图片文件到画布（水平排列，无间隙）
	 * @param files 图片文件数组
	 * @param anchorPosition 锚点位置（第一个图片的中心位置）
	 * @param options 可选配置
	 * @returns 创建的图片元素 ID 数组
	 */
	public async pasteMultipleImageFiles(
		files: File[],
		anchorPosition: { x: number; y: number },
		options?: { skipFocus?: boolean },
	): Promise<string[]> {
		const imageFiles = files.filter((file) => !isVideoFile(file) && !isAudioFile(file))
		return this.pasteMultipleCanvasFiles(imageFiles, anchorPosition, options)
	}

	/**
	 * 粘贴图片文件到画布
	 * @param file 图片文件
	 * @param position 可选的位置参数，如果提供则在该位置创建图片（图片中心对齐到该位置），否则在画布中心创建
	 * @param options 可选配置
	 * @returns 创建的图片元素 ID
	 */
	public async pasteImageFile(
		file: File,
		position?: { x: number; y: number },
		options?: { skipFocus?: boolean },
	): Promise<string | null> {
		if (isVideoFile(file) || isAudioFile(file)) {
			return null
		}
		return this.pasteCanvasFile(file, position, options)
	}
}
