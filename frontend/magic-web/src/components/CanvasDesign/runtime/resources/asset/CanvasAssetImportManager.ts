import type { Canvas } from "../../core/Canvas"
import {
	ElementTypeEnum,
	type AudioElement,
	type ImageElement,
	type LayerElement,
	type VideoElement,
} from "../../document/types"
import { updateContent } from "../../document/elementContent"
import { ElementFactory } from "../../elements/core/ElementFactory"
import { IMAGE_CONFIG } from "../../elements/image/ImageElement.config"
import { VIDEO_CONFIG } from "../../elements/video/VideoElement.config"
import { AUDIO_CONFIG } from "../../elements/audio/AudioElement.config"
import {
	generateElementId,
	getFileExtensionFromMimeType,
	getMediaDimensions,
} from "../../shared/ids"
import {
	resolveConnectedPlacement,
	resolveNearestFreeMediaPlacement,
} from "../../shared/placement/placementEngine"
import { createElementFromElementConnection } from "../../interaction/connection/elementConnectionCreation"
import { createSelectionRevision } from "../../interaction/selection/selectionContentCollector"
import { type CanvasAssetMediaType, type UploadFileResponse } from "../../../public/magic-types"
import {
	findCanvasAssetMediaBinding,
	findConnectedCanvasAssetMediaBinding,
	findCanvasWorkspaceMediaFile,
	getAssetUploadSubDir,
	type CanvasAssetMediaBinding,
} from "./assetMediaBinding"
import {
	getRememberedAssetMediaDimensions,
	probeAssetMediaDimensionsFromUrl,
	rememberAssetMediaDimensions,
	type AssetMediaDimensions,
} from "./assetMediaDimensionCache"

export { getAssetUploadSubDir } from "./assetMediaBinding"

export type CanvasAssetImportSlot = { kind: "frame" } | { kind: "reference" }

export interface CanvasAssetImportRequest {
	assetId: string
	targetElementId: string
	slot: CanvasAssetImportSlot
	allowedMediaTypes: readonly CanvasAssetMediaType[]
}

export interface CanvasAssetImportResult {
	elementId: string
	connectionId: string
	workspacePath: string
	fileName: string
	mediaType: CanvasAssetMediaType
	source: "existing-binding" | "existing-connection" | "existing-file" | "downloaded"
}

export interface CanvasAssetElementImportResult {
	elementId: string
	workspacePath: string
	fileName: string
	mediaType: CanvasAssetMediaType
	source: Exclude<CanvasAssetImportResult["source"], "existing-connection">
}

interface PreparedAssetMedia {
	assetId: string
	mediaType: CanvasAssetMediaType
	workspacePath: string
	fileName: string
	dimensions: { width: number; height: number }
	source: Exclude<CanvasAssetImportResult["source"], "existing-connection">
}

const FALLBACK_FILE_EXTENSIONS: Record<CanvasAssetMediaType, string> = {
	image: "png",
	video: "mp4",
	audio: "mp3",
}

const FALLBACK_MIME_TYPES: Record<CanvasAssetMediaType, string> = {
	image: "image/png",
	video: "video/mp4",
	audio: "audio/mpeg",
}

function getElementType(mediaType: CanvasAssetMediaType): LayerElement["type"] {
	if (mediaType === "image") return ElementTypeEnum.Image
	if (mediaType === "video") return ElementTypeEnum.Video
	return ElementTypeEnum.Audio
}

function getFallbackDimensions(mediaType: CanvasAssetMediaType) {
	if (mediaType === "image") {
		return { width: IMAGE_CONFIG.DEFAULT_WIDTH, height: IMAGE_CONFIG.DEFAULT_HEIGHT }
	}
	if (mediaType === "video") {
		return { width: VIDEO_CONFIG.DEFAULT_WIDTH, height: VIDEO_CONFIG.DEFAULT_HEIGHT }
	}
	return { width: AUDIO_CONFIG.DEFAULT_WIDTH, height: AUDIO_CONFIG.DEFAULT_HEIGHT }
}

async function measureFileDimensions(
	file: File,
	mediaType: CanvasAssetMediaType,
): Promise<AssetMediaDimensions | null> {
	if (mediaType === "audio") return null
	try {
		const dimensions = await getMediaDimensions(file)
		return dimensions.width > 0 && dimensions.height > 0 ? dimensions : null
	} catch {
		return null
	}
}

/**
 * 优先用素材预览已经量到的编码尺寸。
 * 预览未完成时再测本地文件或签名地址；都不可用才退回元素默认尺寸。
 */
async function resolveImportedMediaDimensions(options: {
	assetId: string
	mediaType: CanvasAssetMediaType
	file?: File
	fileUrl?: string | null
}): Promise<AssetMediaDimensions> {
	if (options.mediaType === "audio") return getFallbackDimensions(options.mediaType)

	const cached = getRememberedAssetMediaDimensions(options.assetId)
	if (cached) return cached

	const measured = options.file
		? await measureFileDimensions(options.file, options.mediaType)
		: null
	if (measured) {
		rememberAssetMediaDimensions(options.assetId, measured)
		return measured
	}

	if (options.fileUrl) {
		const probed = await probeAssetMediaDimensionsFromUrl(options.fileUrl, options.mediaType)
		if (probed) {
			rememberAssetMediaDimensions(options.assetId, probed)
			return probed
		}
	}

	return getFallbackDimensions(options.mediaType)
}

function getUrlFileName(url: string): string {
	try {
		const pathname = new URL(url).pathname
		return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1))
	} catch {
		return ""
	}
}

function sanitizeFileNamePart(value: string): string {
	return Array.from(value, (character) => (character.charCodeAt(0) < 32 ? "-" : character))
		.join("")
		.replace(/[<>:"/\\|?*]/g, "-")
		.replace(/\s+/g, " ")
		.trim()
}

function buildAssetFileName(options: {
	assetId: string
	mediaType: CanvasAssetMediaType
	fileName?: string
	fileUrl: string
	mimeType: string
}): string {
	const candidate =
		sanitizeFileNamePart(options.fileName ?? "") ||
		sanitizeFileNamePart(getUrlFileName(options.fileUrl)) ||
		`asset-${sanitizeFileNamePart(options.assetId)}`
	if (/\.[a-z0-9]{1,10}$/i.test(candidate)) return candidate

	const extension =
		getFileExtensionFromMimeType(options.mimeType) ||
		FALLBACK_FILE_EXTENSIONS[options.mediaType]
	return `${candidate}.${extension}`
}

function getAssetFileNameCandidates(options: {
	mediaType: CanvasAssetMediaType
	fileName?: string
	fileUrl?: string | null
}): string[] {
	const candidates = [
		sanitizeFileNamePart(options.fileName ?? ""),
		sanitizeFileNamePart(options.fileUrl ? getUrlFileName(options.fileUrl) : ""),
	].filter(Boolean)
	const fallbackExtension = FALLBACK_FILE_EXTENSIONS[options.mediaType]
	return Array.from(
		new Set(
			candidates.flatMap((candidate) =>
				/\.[a-z0-9]{1,10}$/i.test(candidate)
					? [candidate]
					: [candidate, `${candidate}.${fallbackExtension}`],
			),
		),
	)
}

function getElementName(fileName: string, mediaType: CanvasAssetMediaType): string {
	return fileName.replace(/\.[^/.]+$/, "") || mediaType
}

/** 将素材服务中的逻辑资源导入当前 Canvas，并创建可参与编辑器关联的媒体元素。 */
export class CanvasAssetImportManager {
	private readonly importPromises = new Map<string, Promise<PreparedAssetMedia>>()
	private readonly connectionPromises = new Map<string, Promise<CanvasAssetImportResult>>()
	private destroyed = false

	constructor(private readonly canvas: Canvas) {}

	public async importAndConnect(
		request: CanvasAssetImportRequest,
	): Promise<CanvasAssetImportResult> {
		const assetId = request.assetId.trim()
		const connectionKey = `${request.targetElementId}\u0000${assetId}`
		const existingConnectionPromise = this.connectionPromises.get(connectionKey)
		if (existingConnectionPromise) {
			const result = await existingConnectionPromise
			return { ...result, source: "existing-connection" }
		}

		const connectionPromise = this.importAndConnectInternal(request)
		this.connectionPromises.set(connectionKey, connectionPromise)
		try {
			return await connectionPromise
		} finally {
			if (this.connectionPromises.get(connectionKey) === connectionPromise) {
				this.connectionPromises.delete(connectionKey)
			}
		}
	}

	/** 导入素材并在当前画布创建独立媒体元素，不建立编辑器连接。 */
	public async importAndCreateElement(request: {
		assetId: string
		allowedMediaTypes: readonly CanvasAssetMediaType[]
	}): Promise<CanvasAssetElementImportResult> {
		if (this.destroyed) throw new Error("Canvas asset import manager destroyed")
		const assetId = request.assetId.trim()
		if (!assetId) throw new Error("Asset id is required")

		const prepared = await this.prepareAssetMedia(assetId, request.allowedMediaTypes)
		if (this.destroyed) throw new Error("Canvas asset import manager destroyed")

		const position = resolveNearestFreeMediaPlacement(this.canvas, prepared.dimensions)
		const elementId = this.createStandaloneMediaElement(prepared, position)
		if (!elementId) throw new Error("Failed to create an asset media element")

		return {
			elementId,
			workspacePath: prepared.workspacePath,
			fileName: prepared.fileName,
			mediaType: prepared.mediaType,
			source: prepared.source,
		}
	}

	private async importAndConnectInternal(
		request: CanvasAssetImportRequest,
	): Promise<CanvasAssetImportResult> {
		if (this.destroyed) throw new Error("Canvas asset import manager destroyed")
		const assetId = request.assetId.trim()
		if (!assetId) throw new Error("Asset id is required")
		if (request.allowedMediaTypes.length === 0) {
			throw new Error("No asset media type is allowed for this slot")
		}

		const prepared = await this.prepareAssetMedia(assetId, request.allowedMediaTypes)
		if (this.destroyed) throw new Error("Canvas asset import manager destroyed")
		const target = this.canvas.elementManager.getElementData(request.targetElementId)
		if (!target || target.type !== ElementTypeEnum.Video) {
			throw new Error("Asset import target video is unavailable")
		}

		const connected = findConnectedCanvasAssetMediaBinding(this.canvas, {
			assetId,
			targetElementId: request.targetElementId,
			allowedMediaTypes: request.allowedMediaTypes,
		})
		if (connected) {
			return {
				elementId: connected.elementId,
				connectionId: connected.connectionId,
				workspacePath: connected.workspacePath,
				fileName: connected.fileName,
				mediaType: connected.mediaType,
				source: "existing-connection",
			}
		}

		let connectionId: string | null = null
		const elementId = createElementFromElementConnection({
			canvas: this.canvas,
			origin: {
				kind: "element",
				elementId: request.targetElementId,
				side: "left",
			},
			createElement: () => this.createMediaElement(prepared, request.targetElementId),
			afterConnect: (result) => {
				connectionId = result.connectionIds[0] ?? null
				if (request.slot.kind !== "reference") return
				this.canvas.connectionAssociationSeedManager.register({
					targetElementId: request.targetElementId,
					targetKind: "video-generator",
					rootElementIds: [result.createdElementId],
					orderedSources: [
						{ elementId: result.createdElementId, kind: prepared.mediaType },
					],
					originRevision: createSelectionRevision([result.createdElementId]),
					createdBy: "assets",
					mediaRole: "reference",
				})
			},
		})

		if (!elementId || !connectionId) {
			throw new Error("Failed to create an asset media connection")
		}

		return {
			elementId,
			connectionId,
			workspacePath: prepared.workspacePath,
			fileName: prepared.fileName,
			mediaType: prepared.mediaType,
			source: prepared.source,
		}
	}

	public destroy(): void {
		this.destroyed = true
		this.importPromises.clear()
		this.connectionPromises.clear()
	}

	private async prepareAssetMedia(
		assetId: string,
		allowedMediaTypes: readonly CanvasAssetMediaType[],
	): Promise<PreparedAssetMedia> {
		const existing = this.findBinding(assetId, allowedMediaTypes)
		if (existing) {
			return this.fromBinding(existing)
		}

		const resource = await this.canvas.assetResourceManager.getResource(assetId, {
			forceRefresh: true,
			priority: "critical",
		})
		if (!resource.mediaType || !allowedMediaTypes.includes(resource.mediaType)) {
			throw new Error("Asset media type is not allowed for this slot")
		}

		// 素材详情请求期间可能已有另一个入口完成落图，复用文件或上传前再扫描一次。
		const refreshedBinding = this.findBinding(assetId, allowedMediaTypes)
		if (refreshedBinding) return this.fromBinding(refreshedBinding)

		for (const fileName of getAssetFileNameCandidates({
			mediaType: resource.mediaType,
			fileName: resource.fileName,
			fileUrl: resource.fileUrl,
		})) {
			const existingFile = findCanvasWorkspaceMediaFile(this.canvas, {
				mediaType: resource.mediaType,
				fileName,
			})
			if (!existingFile) continue
			return {
				assetId,
				...existingFile,
				dimensions: await resolveImportedMediaDimensions({
					assetId,
					mediaType: resource.mediaType,
					fileUrl: resource.fileUrl,
				}),
				source: "existing-file",
			}
		}

		if (!resource.fileUrl) throw new Error("Asset file URL is unavailable")

		const pending = this.importPromises.get(assetId)
		if (pending) {
			const prepared = await pending
			if (!allowedMediaTypes.includes(prepared.mediaType)) {
				throw new Error("Asset media type is not allowed for this slot")
			}
			return prepared
		}

		const importPromise = this.downloadAndUpload({
			assetId,
			mediaType: resource.mediaType,
			fileUrl: resource.fileUrl,
			fileName: resource.fileName,
		})
		this.importPromises.set(assetId, importPromise)
		try {
			return await importPromise
		} finally {
			if (this.importPromises.get(assetId) === importPromise) {
				this.importPromises.delete(assetId)
			}
		}
	}

	private findBinding(
		assetId: string,
		allowedMediaTypes: readonly CanvasAssetMediaType[],
	): CanvasAssetMediaBinding | null {
		return findCanvasAssetMediaBinding(this.canvas, { assetId, allowedMediaTypes })
	}

	private fromBinding(binding: CanvasAssetMediaBinding): PreparedAssetMedia {
		return {
			...binding,
			dimensions: getRememberedAssetMediaDimensions(binding.assetId) ?? binding.dimensions,
			source: "existing-binding",
		}
	}

	private async downloadAndUpload(options: {
		assetId: string
		mediaType: CanvasAssetMediaType
		fileUrl: string
		fileName?: string
	}): Promise<PreparedAssetMedia> {
		const response = await fetch(options.fileUrl, { cache: "default" })
		if (!response.ok) throw new Error(`Failed to download asset media: ${response.status}`)
		const blob = await response.blob()
		if (blob.size === 0) throw new Error("Downloaded asset media is empty")

		const mimeType = blob.type || FALLBACK_MIME_TYPES[options.mediaType]
		const fileName = buildAssetFileName({ ...options, mimeType })
		const file = new File([blob], fileName, { type: mimeType })
		const dimensions = await resolveImportedMediaDimensions({
			assetId: options.assetId,
			mediaType: options.mediaType,
			file,
			fileUrl: options.fileUrl,
		})
		const [uploadResult] = await this.canvas.canvasFileUploadManager.uploadDirect(
			[file],
			undefined,
			undefined,
			{ uploadSubDir: getAssetUploadSubDir(options.mediaType) },
		)
		if (!uploadResult?.path) throw new Error("Asset upload returned no workspace path")
		this.primeMediaCache(options.mediaType, uploadResult)

		return {
			assetId: options.assetId,
			mediaType: options.mediaType,
			workspacePath: uploadResult.path,
			fileName: uploadResult.fileName || fileName,
			dimensions,
			source: "downloaded",
		}
	}

	private primeMediaCache(
		mediaType: CanvasAssetMediaType,
		uploadResult: UploadFileResponse,
	): void {
		if (mediaType === "image") {
			this.canvas.imageResourceManager.primeCache(uploadResult.path, uploadResult)
			return
		}
		if (mediaType === "video") {
			this.canvas.videoResourceManager.primeCache(uploadResult.path, uploadResult)
			return
		}
		this.canvas.audioResourceManager.primeCache(uploadResult.path, uploadResult)
	}

	private createMediaElement(
		prepared: PreparedAssetMedia,
		targetElementId: string,
	): string | null {
		const originRect = this.canvas.geometryCacheManager.getElementBounds(targetElementId)
		const target = this.canvas.elementManager.getElementData(targetElementId)
		if (!target) return null
		const fallbackRect = {
			x: target.x ?? 0,
			y: target.y ?? 0,
			width: target.width ?? 1,
			height: target.height ?? 1,
		}
		const resolvedOriginRect = originRect ?? fallbackRect
		const position = resolveConnectedPlacement(
			this.canvas,
			{
				originSide: "left",
				canvasX: resolvedOriginRect.x,
				canvasY: resolvedOriginRect.y + resolvedOriginRect.height / 2,
				source: "handle",
			},
			prepared.dimensions,
			{
				output: "top-left",
				originElementId: targetElementId,
				originRect: resolvedOriginRect,
			},
		)
		const elementId = generateElementId()
		const elementType = getElementType(prepared.mediaType)
		const baseElement = ElementFactory.createElementData(
			elementType,
			elementId,
			position.x,
			position.y,
			prepared.dimensions.width,
			prepared.dimensions.height,
			this.canvas.elementManager.getNextZIndexInLevel(),
		) as ImageElement | VideoElement | AudioElement
		const namedElement = {
			...baseElement,
			name: getElementName(prepared.fileName, prepared.mediaType),
		}
		const contentPatch = { src: prepared.workspacePath, assetId: prepared.assetId }
		let element: ImageElement | VideoElement | AudioElement
		switch (namedElement.type) {
			case ElementTypeEnum.Image:
				element = updateContent(
					namedElement,
					namedElement.activeContentId ?? undefined,
					contentPatch,
				)
				break
			case ElementTypeEnum.Video:
				element = updateContent(
					namedElement,
					namedElement.activeContentId ?? undefined,
					contentPatch,
				)
				break
			case ElementTypeEnum.Audio:
				element = updateContent(
					namedElement,
					namedElement.activeContentId ?? undefined,
					contentPatch,
				)
				break
		}
		const created = this.canvas.elementManager.create(element)
		return created?.elementId ?? null
	}

	private createStandaloneMediaElement(
		prepared: PreparedAssetMedia,
		position: { x: number; y: number },
	): string | null {
		const elementId = generateElementId()
		const elementType = getElementType(prepared.mediaType)
		const baseElement = ElementFactory.createElementData(
			elementType,
			elementId,
			position.x,
			position.y,
			prepared.dimensions.width,
			prepared.dimensions.height,
			this.canvas.elementManager.getNextZIndexInLevel(),
		) as ImageElement | VideoElement | AudioElement
		const namedElement = {
			...baseElement,
			name: getElementName(prepared.fileName, prepared.mediaType),
		}
		const contentPatch = { src: prepared.workspacePath, assetId: prepared.assetId }
		let element: ImageElement | VideoElement | AudioElement
		switch (namedElement.type) {
			case ElementTypeEnum.Image:
				element = updateContent(
					namedElement,
					namedElement.activeContentId ?? undefined,
					contentPatch,
				)
				break
			case ElementTypeEnum.Video:
				element = updateContent(
					namedElement,
					namedElement.activeContentId ?? undefined,
					contentPatch,
				)
				break
			case ElementTypeEnum.Audio:
				element = updateContent(
					namedElement,
					namedElement.activeContentId ?? undefined,
					contentPatch,
				)
				break
		}

		const created = this.canvas.elementManager.create(element)
		return created?.elementId ?? null
	}
}
