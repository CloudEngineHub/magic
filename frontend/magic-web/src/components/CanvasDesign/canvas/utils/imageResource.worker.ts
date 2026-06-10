import {
	SMALL_THUMBNAIL_MAX_SIZE,
	// TOOLTIP_THUMBNAIL_MIN_SIZE, // 已废弃：tooltip场景直接用ossSrc渲染
	// COMPRESSED_WEBP_QUALITY,
	// COMPRESSED_JPEG_QUALITY,
	// getCompressedQuality,
} from "./imageThumbnailConstants"
import { parseImageDimensionsFromBlobHeader } from "./imageHeaderDimensions"

export type ImageResourceDecodeVariant = "small" | "overview" | "preview" | "full"
export type ImageResourceWorkerRequestType = "decode" | "warmup"

export interface ImageResourceWorkerRequest {
	type?: ImageResourceWorkerRequestType
	ossSrc?: string
	/** 已由主线程获取并缓存的压缩 body；存在时 worker 只负责解码，不再 fetch。 */
	blob?: Blob
	filename?: string
	requestId: string
	mainThreadSentAt?: number
	variant?: ImageResourceDecodeVariant
	maxEdge?: number
	includeThumbnail?: boolean
}

export interface ImageResourceWorkerTimings {
	workerQueueMs?: number
	workerTotalMs: number
	fetchMs?: number
	metadataMs?: number
	thumbnailMs?: number
	imageDecodeMs?: number
	blobBytes?: number
	imageBitmapWidth?: number
	imageBitmapHeight?: number
	imageBitmapResized?: boolean
}

export interface ImageResourceWorkerResponse {
	requestId: string
	/** ImageBitmap（优先，通过 transferable 零拷贝传递） */
	imageSource?: ImageBitmap
	/** Blob（降级方案，当不支持 ImageBitmap 时使用） */
	blob?: Blob
	/** 403/401 时置为 true，主线程需重新换取 ossSrc */
	needsReExchange?: boolean
	/** 文件信息 */
	imageInfo?: {
		naturalWidth: number
		naturalHeight: number
		fileSize: number
		mimeType: string
		filename: string
	}
	/** 缩略图 */
	thumbnails?: {
		small: string
	}
	/** 错误信息 */
	error?: string
	/** 响应状态码（非 2xx 时返回） */
	statusCode?: number
	/** 本次解码变体 */
	variant?: ImageResourceDecodeVariant
	timings?: ImageResourceWorkerTimings
}

export interface ImageResourceWorkerReadyMessage {
	type: "ready"
	workerBootedAt: number
	workerReadyPostedAt: number
	workerTopLevelMs: number
}

export type ImageResourceWorkerMessage =
	| ImageResourceWorkerResponse
	| ImageResourceWorkerReadyMessage

const IMAGE_RESOURCE_WORKER_BOOTED_AT = Date.now()

function extractFilenameFromUrl(url: string): string | null {
	try {
		const urlObj = new URL(url)
		const pathname = urlObj.pathname
		const parts = pathname.split("/")
		const filename = parts[parts.length - 1]
		return filename ? decodeURIComponent(filename) : null
	} catch {
		const parts = url.split("/")
		const filename = parts[parts.length - 1]
		const cleanFilename = filename?.split("?")[0]
		return cleanFilename ? decodeURIComponent(cleanFilename) : null
	}
}

function getFileExtensionFromMimeType(mimeType: string): string {
	const mimeTypeToExtension: Record<string, string> = {
		"image/png": "png",
		"image/jpeg": "jpeg",
		"image/jpg": "jpg",
		"image/gif": "gif",
		"image/webp": "webp",
		"image/svg+xml": "svg",
		"image/bmp": "bmp",
		"image/x-icon": "ico",
	}
	if (mimeTypeToExtension[mimeType]) {
		return mimeTypeToExtension[mimeType]
	}
	const parts = mimeType.split("/")
	if (parts.length === 2) {
		const subtype = parts[1]
		const extension = subtype.split("+")[0]
		return extension.replace(/^x-/, "")
	}
	return "png"
}

let webpSupported: boolean | null = null

async function checkWebpSupportInWorker(): Promise<boolean> {
	if (webpSupported !== null) return webpSupported
	try {
		const canvas = new OffscreenCanvas(1, 1)
		const ctx = canvas.getContext("2d")
		if (!ctx) return false
		ctx.fillStyle = "transparent"
		ctx.fillRect(0, 0, 1, 1)
		const blob = await canvas.convertToBlob({ type: "image/webp" })
		const dataUrl = await blobToDataUrl(blob)
		webpSupported = dataUrl.startsWith("data:image/webp")
	} catch {
		webpSupported = false
	}
	return webpSupported
}

async function canvasToDataUrlViaBlob(
	canvas: OffscreenCanvas,
	mimeType: "image/webp" | "image/jpeg",
	quality: number,
): Promise<string> {
	const blob = await canvas.convertToBlob({ type: mimeType, quality })
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(reader.result as string)
		reader.onerror = reject
		reader.readAsDataURL(blob)
	})
}

async function bitmapToDataUrl(bitmap: ImageBitmap, quality: number): Promise<string> {
	const w = bitmap.width
	const h = bitmap.height
	const canvas = new OffscreenCanvas(w, h)
	const ctx = canvas.getContext("2d")
	if (!ctx) return ""
	ctx.drawImage(bitmap, 0, 0)
	bitmap.close()

	const useWebp = await checkWebpSupportInWorker()
	if (useWebp) {
		try {
			const dataUrl = await canvasToDataUrlViaBlob(canvas, "image/webp", quality)
			if (dataUrl.startsWith("data:image/webp")) return dataUrl
		} catch {
			// fallback to jpeg
		}
	}
	return canvasToDataUrlViaBlob(canvas, "image/jpeg", quality)
}

/**
 * 检测 Worker 环境是否支持 ImageBitmap
 */
function isImageBitmapSupported(): boolean {
	return typeof createImageBitmap === "function"
}

function getResizeDimensions(options: { width: number; height: number; maxEdge?: number }): {
	width: number
	height: number
	resized: boolean
} {
	const { width, height, maxEdge } = options
	if (!maxEdge || maxEdge <= 0) {
		return { width, height, resized: false }
	}

	const largestEdge = Math.max(width, height)
	if (largestEdge <= maxEdge) {
		return { width, height, resized: false }
	}

	const scale = maxEdge / largestEdge
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
		resized: true,
	}
}

async function getImageMetadata(options: {
	blob: Blob
	ossSrc: string
	passedFilename?: string
	supportsImageBitmap: boolean
}): Promise<{
	imageInfo: NonNullable<ImageResourceWorkerResponse["imageInfo"]>
	maxDim: number
}> {
	const { blob, ossSrc, passedFilename, supportsImageBitmap } = options
	const contentType = blob.type || "image/jpeg"
	const fileSize = blob.size
	const extractedFilename = extractFilenameFromUrl(ossSrc)
	const filename =
		passedFilename || extractedFilename || `image.${getFileExtensionFromMimeType(contentType)}`

	let dimensions = await parseImageDimensionsFromBlobHeader(blob)

	if (!dimensions && supportsImageBitmap) {
		// 支持 ImageBitmap：创建用于获取尺寸信息的 bitmap（稍后关闭）
		const sizeBitmap = await createImageBitmap(blob)
		dimensions = {
			width: sizeBitmap.width,
			height: sizeBitmap.height,
		}
		sizeBitmap.close()
	} else if (!dimensions) {
		// 不支持 ImageBitmap：使用 HTMLImageElement 获取尺寸（降级方案）
		const img = await new Promise<HTMLImageElement>((resolve, reject) => {
			const image = new Image()
			image.onload = () => resolve(image)
			image.onerror = reject
			image.src = URL.createObjectURL(blob)
		})
		dimensions = {
			width: img.naturalWidth,
			height: img.naturalHeight,
		}
		URL.revokeObjectURL(img.src)
	}
	if (!dimensions) {
		throw new Error("Unable to read image dimensions")
	}

	const naturalWidth = dimensions.width
	const naturalHeight = dimensions.height
	return {
		imageInfo: {
			naturalWidth,
			naturalHeight,
			fileSize,
			mimeType: contentType,
			filename,
		},
		maxDim: Math.max(naturalWidth, naturalHeight),
	}
}

async function createSmallThumbnail(options: {
	blob: Blob
	maxDim: number
	supportsImageBitmap: boolean
}): Promise<{ small: string }> {
	const { blob, maxDim, supportsImageBitmap } = options
	const thumbnails: { small: string } = {} as { small: string }

	// Small: decide based on size
	if (maxDim <= SMALL_THUMBNAIL_MAX_SIZE) {
		const direct = await blobToDataUrl(blob)
		thumbnails.small = direct
	} else {
		if (supportsImageBitmap) {
			const smallBitmap = await createImageBitmap(blob, {
				resizeWidth: SMALL_THUMBNAIL_MAX_SIZE,
				resizeQuality: "high",
			})
			thumbnails.small = await bitmapToDataUrl(smallBitmap, 1)
		} else {
			// 降级：使用 canvas 缩放
			const img = await new Promise<HTMLImageElement>((resolve, reject) => {
				const image = new Image()
				image.onload = () => resolve(image)
				image.onerror = reject
				image.src = URL.createObjectURL(blob)
			})
			const canvas = new OffscreenCanvas(
				SMALL_THUMBNAIL_MAX_SIZE,
				(SMALL_THUMBNAIL_MAX_SIZE * img.naturalHeight) / img.naturalWidth,
			)
			const ctx = canvas.getContext("2d")
			if (ctx) {
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
				thumbnails.small = await blobToDataUrl(
					await canvas.convertToBlob({ type: "image/jpeg", quality: 1 }),
				)
			} else {
				thumbnails.small = await blobToDataUrl(blob)
			}
			URL.revokeObjectURL(img.src)
		}
		// tooltip场景直接用ossSrc渲染，不再生成tooltip缩略图
		// } else if (maxDim <= TOOLTIP_THUMBNAIL_MIN_SIZE) {
		// 	thumbnails.small = await blobToDataUrl(blob)
		// 	const tooltipBitmap = await createImageBitmap(blob, {
		// 		resizeWidth: TOOLTIP_THUMBNAIL_MIN_SIZE,
		// 		resizeQuality: "high",
		// 	})
		// 	thumbnails.tooltip = await bitmapToDataUrl(tooltipBitmap, 0.95)
		// } else {
		// 	const [smallBitmap, tooltipBitmap] = await Promise.all([
		// 		createImageBitmap(blob, {
		// 			resizeWidth: SMALL_THUMBNAIL_MAX_SIZE,
		// 			resizeQuality: "high",
		// 		}),
		// 		createImageBitmap(blob, {
		// 			resizeWidth: TOOLTIP_THUMBNAIL_MIN_SIZE,
		// 			resizeQuality: "high",
		// 		}),
		// 	])
		// 	thumbnails.small = await bitmapToDataUrl(smallBitmap, 0.9)
		// 	thumbnails.tooltip = await bitmapToDataUrl(tooltipBitmap, 0.95)
	}

	return thumbnails
}

async function createImageBitmapForVariant(options: {
	blob: Blob
	imageInfo: NonNullable<ImageResourceWorkerResponse["imageInfo"]>
	variant: ImageResourceDecodeVariant
	maxEdge?: number
}): Promise<{
	imageBitmap: ImageBitmap
	resized: boolean
	targetWidth: number
	targetHeight: number
}> {
	const { blob, imageInfo, variant, maxEdge } = options
	const resize = getResizeDimensions({
		width: imageInfo.naturalWidth,
		height: imageInfo.naturalHeight,
		maxEdge: variant === "full" ? undefined : maxEdge,
	})

	if (!resize.resized) {
		const imageBitmap = await createImageBitmap(blob)
		return {
			imageBitmap,
			resized: false,
			targetWidth: imageBitmap.width,
			targetHeight: imageBitmap.height,
		}
	}

	const imageBitmap = await createImageBitmap(blob, {
		resizeWidth: resize.width,
		resizeHeight: resize.height,
		resizeQuality: "high",
	})
	return {
		imageBitmap,
		resized: true,
		targetWidth: resize.width,
		targetHeight: resize.height,
	}
}

async function processRequest(
	request: ImageResourceWorkerRequest,
): Promise<ImageResourceWorkerResponse> {
	const {
		ossSrc,
		filename: passedFilename,
		requestId,
		mainThreadSentAt,
		variant = "full",
		maxEdge,
		includeThumbnail = true,
	} = request
	const workerStartedAt = Date.now()
	const timings: ImageResourceWorkerTimings = {
		workerQueueMs:
			typeof mainThreadSentAt === "number"
				? Math.max(0, workerStartedAt - mainThreadSentAt)
				: undefined,
		workerTotalMs: 0,
	}

	const markTiming = <K extends keyof ImageResourceWorkerTimings>(
		key: K,
		startedAt: number,
	): void => {
		timings[key] = Math.max(0, Date.now() - startedAt) as ImageResourceWorkerTimings[K]
	}

	const completeTimings = (): ImageResourceWorkerTimings => {
		timings.workerTotalMs = Math.max(0, Date.now() - workerStartedAt)
		return timings
	}

	try {
		if (request.type === "warmup") {
			return {
				requestId,
				variant,
				timings: completeTimings(),
			}
		}

		if (!ossSrc) {
			throw new Error("Missing ossSrc")
		}

		const fetchStartedAt = Date.now()
		const blob = request.blob
			? request.blob
			: await (async () => {
					const response = await fetch(ossSrc, { cache: "default" })
					if (!response.ok) {
						const needsReExchange = response.status === 401 || response.status === 403
						throw Object.assign(new Error(`Fetch failed: ${response.status}`), {
							statusCode: response.status,
							needsReExchange,
						})
					}
					return response.blob()
				})()
		if (!request.blob) {
			markTiming("fetchMs", fetchStartedAt)
		}
		timings.blobBytes = blob.size
		const supportsImageBitmap = isImageBitmapSupported()
		const metadataStartedAt = Date.now()
		const { imageInfo, maxDim } = await getImageMetadata({
			blob,
			ossSrc,
			passedFilename,
			supportsImageBitmap,
		})
		markTiming("metadataMs", metadataStartedAt)
		const thumbnailStartedAt = Date.now()
		const thumbnails = includeThumbnail
			? await createSmallThumbnail({
					blob,
					maxDim,
					supportsImageBitmap,
				})
			: undefined
		if (includeThumbnail) {
			markTiming("thumbnailMs", thumbnailStartedAt)
		}

		// Compressed: full size, dynamic quality
		// const pixelCount = naturalWidth * naturalHeight
		// const useWebp = await checkWebpSupportInWorker()
		// const quality = getCompressedQuality(
		// 	pixelCount,
		// 	fileSize,
		// 	useWebp ? COMPRESSED_WEBP_QUALITY : COMPRESSED_JPEG_QUALITY,
		// )
		// const compressedBitmap = await createImageBitmap(blob)
		// thumbnails.compressed = await bitmapToDataUrl(compressedBitmap, quality)

		// 根据是否支持 ImageBitmap 决定返回类型
		if (supportsImageBitmap) {
			// 创建用于传递的 ImageBitmap（preview 会在 Worker 内缩放，full 保持原图）
			const imageDecodeStartedAt = Date.now()
			const {
				imageBitmap: imageSource,
				resized,
				targetWidth,
				targetHeight,
			} = await createImageBitmapForVariant({
				blob,
				imageInfo,
				variant,
				maxEdge,
			})
			markTiming("imageDecodeMs", imageDecodeStartedAt)
			timings.imageBitmapWidth = targetWidth
			timings.imageBitmapHeight = targetHeight
			timings.imageBitmapResized = resized
			return {
				requestId,
				imageSource,
				imageInfo,
				thumbnails,
				variant,
				timings: completeTimings(),
			}
		} else {
			// 降级：返回 blob，主线程将使用 createImageSourceFromBlob 创建 ImageSource（会降级到 HTMLImageElement）
			return {
				requestId,
				blob,
				imageInfo,
				thumbnails,
				variant,
				timings: completeTimings(),
			}
		}
	} catch (err) {
		const statusCode =
			err && typeof err === "object" && "statusCode" in err
				? Number((err as { statusCode?: unknown }).statusCode)
				: undefined
		const needsReExchange =
			err && typeof err === "object" && "needsReExchange" in err
				? Boolean((err as { needsReExchange?: unknown }).needsReExchange)
				: undefined
		return {
			requestId,
			error: err instanceof Error ? err.message : String(err),
			...(statusCode && { statusCode }),
			...(needsReExchange && { needsReExchange }),
			timings: completeTimings(),
		}
	}
}

self.onmessage = (e: MessageEvent<ImageResourceWorkerRequest>) => {
	processRequest(e.data).then((response) => {
		// 如果响应中包含 ImageBitmap，通过 transferable 传递以实现零拷贝
		// 如果响应中包含 Blob，直接传递（Blob 也是 transferable，但为了兼容性直接传递）
		if (response.imageSource) {
			self.postMessage(response, { transfer: [response.imageSource] })
		} else if (response.blob) {
			// Blob 也可以通过 transfer 传递，但为了兼容性直接传递
			self.postMessage(response)
		} else {
			self.postMessage(response)
		}
	})
}

const IMAGE_RESOURCE_WORKER_READY_POSTED_AT = Date.now()
self.postMessage({
	type: "ready",
	workerBootedAt: IMAGE_RESOURCE_WORKER_BOOTED_AT,
	workerReadyPostedAt: IMAGE_RESOURCE_WORKER_READY_POSTED_AT,
	workerTopLevelMs: Math.max(
		0,
		IMAGE_RESOURCE_WORKER_READY_POSTED_AT - IMAGE_RESOURCE_WORKER_BOOTED_AT,
	),
} satisfies ImageResourceWorkerReadyMessage)
