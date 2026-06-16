import { describe, expect, it, vi } from "vitest"
import { ClipboardManager } from "../ClipboardManager"
import type { FrameElement, ImageElement, LayerElement, VideoElement } from "../../types"
import { GenerationStatus, ImageGenerationTaskTypeMap } from "../../../types.magic"

interface ClipboardManagerTestHarness {
	canvas: {
		canvasFileUploadManager: {
			getCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			getReusableCompletedRemoteResourceTransfer: ReturnType<typeof vi.fn>
			transferRemoteResource: ReturnType<typeof vi.fn>
		}
		imageResourceManager: {
			primeCache: ReturnType<typeof vi.fn>
		}
		videoResourceManager: {
			primeCache: ReturnType<typeof vi.fn>
		}
	}
	collectClipboardFiles: (elements: LayerElement[]) => Promise<{
		metadata: Array<{ elementId: string; sourceRef?: { src?: string; ossUrl?: string } }>
		files: unknown[]
		native?: unknown
	}>
	getCanvasFileMetadata: ReturnType<typeof vi.fn>
	prepareClipboardTreeElement: (options: {
		sourceElement: LayerElement
		currentNames: Set<string>
		isRoot: boolean
		offsetX: number
		offsetY: number
		rootZIndex?: number
		canReuseElementSrc: boolean
		fileByElementId: Map<string, File>
		metadataByElementId: Map<string, unknown>
		sourceCanvasId?: string
	}) => Promise<{
		element: LayerElement | null
		sourceReferenceFailureCount: number
		pendingUploads: Array<{
			sourceElementId: string
			targetElementId: string
			sourceCanvasId?: string
			file?: File
			metadata?: unknown
		}>
	}>
}

function createClipboardManager(): ClipboardManagerTestHarness {
	const manager = Object.create(ClipboardManager.prototype) as ClipboardManagerTestHarness
	manager.canvas = {
		canvasFileUploadManager: {
			getCompletedRemoteResourceTransfer: vi.fn(),
			getReusableCompletedRemoteResourceTransfer: vi.fn(),
			transferRemoteResource: vi.fn(),
		},
		imageResourceManager: {
			primeCache: vi.fn(),
		},
		videoResourceManager: {
			primeCache: vi.fn(),
		},
	}
	return manager
}

describe("ClipboardManager frame clipboard trees", () => {
	it("collects media metadata from frame children", async () => {
		const child: ImageElement = {
			id: "image-child",
			type: "image",
			name: "Child image",
			src: "source/image.png",
			x: 12,
			y: 16,
			width: 80,
			height: 60,
			generateImageRequest: {
				image_id: "source-image-task",
				model_id: "image-model",
				prompt: "a friendly creature",
				size: "1024x1024",
			},
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.High,
				image_id: "source-high-task",
				file_path: "source/image.png",
				size: "2048x2048",
			},
			generateHightImageRequest: {
				image_id: "legacy-high-task",
				file_path: "source/image.png",
				size: "2048x2048",
			},
		}
		const frame: FrameElement = {
			id: "frame-1",
			type: "frame",
			name: "Frame",
			x: 100,
			y: 120,
			width: 300,
			height: 200,
			children: [child],
		}
		const manager = createClipboardManager()
		manager.getCanvasFileMetadata = vi.fn(async (element: ImageElement) => ({
			element,
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 0,
			sourceRef: {
				src: element.src,
				ossUrl: "https://example.test/image.png",
			},
		}))

		const result = await manager.collectClipboardFiles([frame])

		expect(result.metadata).toEqual([
			expect.objectContaining({
				elementId: "image-child",
				sourceRef: expect.objectContaining({
					src: "source/image.png",
				}),
			}),
		])
		expect(result.native).toBeUndefined()
	})

	it("rewrites frame child media src when pasting across canvases", async () => {
		const child: ImageElement = {
			id: "image-child",
			type: "image",
			name: "Child image",
			src: "source/image.png",
			x: 12,
			y: 16,
			width: 80,
			height: 60,
			generateImageRequest: {
				image_id: "source-image-task",
				model_id: "image-model",
				prompt: "a friendly creature",
				size: "1024x1024",
			},
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.High,
				image_id: "source-high-task",
				file_path: "source/image.png",
				size: "2048x2048",
			},
			generateHightImageRequest: {
				image_id: "legacy-high-task",
				file_path: "source/image.png",
				size: "2048x2048",
			},
		}
		const frame: FrameElement = {
			id: "frame-1",
			type: "frame",
			name: "Frame",
			x: 100,
			y: 120,
			width: 300,
			height: 200,
			zIndex: 3,
			children: [child],
		}
		const uploadResult = {
			path: "target/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
			expires_at: 0,
			source: "clipboard",
		}
		const manager = createClipboardManager()
		manager.canvas = {
			canvasFileUploadManager: {
				getCompletedRemoteResourceTransfer: vi.fn(() => uploadResult),
				getReusableCompletedRemoteResourceTransfer: vi.fn(async () => uploadResult),
				transferRemoteResource: vi.fn(),
			},
			imageResourceManager: {
				primeCache: vi.fn(),
			},
			videoResourceManager: {
				primeCache: vi.fn(),
			},
		}

		const result = await manager.prepareClipboardTreeElement({
			sourceElement: frame,
			currentNames: new Set(),
			isRoot: true,
			offsetX: 10,
			offsetY: 20,
			rootZIndex: 9,
			canReuseElementSrc: false,
			fileByElementId: new Map(),
			metadataByElementId: new Map([
				[
					"image-child",
					{
						elementId: "image-child",
						filename: "image.png",
						mimeType: "image/png",
						fileSize: 0,
						sourceRef: {
							src: "source/image.png",
							ossUrl: "https://source.test/image.png",
						},
					},
				],
			]),
			sourceCanvasId: "source-canvas",
		})

		expect(result.sourceReferenceFailureCount).toBe(0)
		expect(result.pendingUploads).toEqual([])
		expect(result.element).toEqual(
			expect.objectContaining({
				type: "frame",
				x: 110,
				y: 140,
				zIndex: 9,
			}),
		)
		const pastedFrame = result.element as FrameElement
		expect(pastedFrame.id).not.toBe("frame-1")
		expect(pastedFrame.children).toHaveLength(1)
		expect(pastedFrame.children?.[0]).toEqual(
			expect.objectContaining({
				type: "image",
				src: "target/image.png",
				status: GenerationStatus.Completed,
				generateImageRequest: expect.objectContaining({
					model_id: "image-model",
					prompt: "a friendly creature",
				}),
				imageGenerationTaskMeta: expect.objectContaining({
					type: ImageGenerationTaskTypeMap.High,
					file_path: "source/image.png",
					size: "2048x2048",
				}),
				generateHightImageRequest: expect.objectContaining({
					file_path: "source/image.png",
					size: "2048x2048",
				}),
			}),
		)
		const pastedChild = pastedFrame.children?.[0] as ImageElement
		expect(pastedChild.id).not.toBe("image-child")
		expect(pastedChild.generateImageRequest?.image_id).toBeUndefined()
		expect(pastedChild.imageGenerationTaskMeta?.image_id).toBeUndefined()
		expect(pastedChild.generateHightImageRequest?.image_id).toBeUndefined()
		expect(manager.canvas.imageResourceManager.primeCache).toHaveBeenCalledWith(
			"target/image.png",
			uploadResult,
		)
	})

	it("returns an uploading frame child placeholder before remote transfer finishes", async () => {
		const child: ImageElement = {
			id: "image-child",
			type: "image",
			name: "Child image",
			src: "source/image.png",
			x: 12,
			y: 16,
			width: 80,
			height: 60,
			generateImageRequest: {
				image_id: "source-image-task",
				model_id: "image-model",
				prompt: "a friendly creature",
			},
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.RemoveBackground,
				image_id: "source-remove-bg-task",
				file_path: "source/image.png",
			},
		}
		const frame: FrameElement = {
			id: "frame-1",
			type: "frame",
			name: "Frame",
			x: 100,
			y: 120,
			width: 300,
			height: 200,
			children: [child],
		}
		const manager = createClipboardManager()
		const metadata = {
			elementId: "image-child",
			filename: "image.png",
			mimeType: "image/png",
			fileSize: 0,
			sourceRef: {
				src: "source/image.png",
				ossUrl: "https://source.test/image.png",
			},
		}

		const result = await manager.prepareClipboardTreeElement({
			sourceElement: frame,
			currentNames: new Set(),
			isRoot: true,
			offsetX: 0,
			offsetY: 0,
			canReuseElementSrc: false,
			fileByElementId: new Map(),
			metadataByElementId: new Map([["image-child", metadata]]),
			sourceCanvasId: "source-canvas",
		})

		expect(result.sourceReferenceFailureCount).toBe(0)
		expect(result.pendingUploads).toEqual([
			expect.objectContaining({
				sourceElementId: "image-child",
				sourceCanvasId: "source-canvas",
				metadata,
			}),
		])
		const pastedFrame = result.element as FrameElement
		const pastedChild = pastedFrame.children?.[0] as ImageElement
		expect(pastedChild).toEqual(
			expect.objectContaining({
				type: "image",
				src: undefined,
				status: GenerationStatus.Processing,
				generateImageRequest: expect.objectContaining({
					model_id: "image-model",
					prompt: "a friendly creature",
				}),
				imageGenerationTaskMeta: expect.objectContaining({
					type: ImageGenerationTaskTypeMap.RemoveBackground,
					file_path: "source/image.png",
				}),
			}),
		)
		expect(pastedChild.generateImageRequest?.image_id).toBeUndefined()
		expect(pastedChild.imageGenerationTaskMeta?.image_id).toBeUndefined()
		expect(pastedChild.id).toBe(result.pendingUploads[0]?.targetElementId)
		expect(pastedChild.id).not.toBe("image-child")
	})

	it("keeps pasted video info data but drops the source polling id", async () => {
		const child: VideoElement = {
			id: "video-child",
			type: "video",
			name: "Child video",
			src: "source/video.mp4",
			x: 12,
			y: 16,
			width: 160,
			height: 90,
			generateVideoRequest: {
				video_id: "source-video-task",
				model_id: "video-model",
				prompt: "a cinematic clip",
			},
		}
		const frame: FrameElement = {
			id: "frame-1",
			type: "frame",
			name: "Frame",
			x: 100,
			y: 120,
			width: 300,
			height: 200,
			children: [child],
		}
		const manager = createClipboardManager()
		const metadata = {
			elementId: "video-child",
			filename: "video.mp4",
			mimeType: "video/mp4",
			fileSize: 0,
			sourceRef: {
				src: "source/video.mp4",
				ossUrl: "https://source.test/video.mp4",
			},
		}

		const result = await manager.prepareClipboardTreeElement({
			sourceElement: frame,
			currentNames: new Set(),
			isRoot: true,
			offsetX: 0,
			offsetY: 0,
			canReuseElementSrc: false,
			fileByElementId: new Map(),
			metadataByElementId: new Map([["video-child", metadata]]),
			sourceCanvasId: "source-canvas",
		})

		expect(result.sourceReferenceFailureCount).toBe(0)
		expect(result.pendingUploads).toEqual([
			expect.objectContaining({
				sourceElementId: "video-child",
				sourceCanvasId: "source-canvas",
				metadata,
			}),
		])
		const pastedFrame = result.element as FrameElement
		const pastedChild = pastedFrame.children?.[0] as VideoElement
		expect(pastedChild).toEqual(
			expect.objectContaining({
				type: "video",
				src: undefined,
				status: GenerationStatus.Processing,
				generateVideoRequest: expect.objectContaining({
					model_id: "video-model",
					prompt: "a cinematic clip",
				}),
			}),
		)
		expect(pastedChild.generateVideoRequest?.video_id).toBeUndefined()
		expect(pastedChild.id).toBe(result.pendingUploads[0]?.targetElementId)
		expect(pastedChild.id).not.toBe("video-child")
	})

	it("activates pasted frame child image resources after upload applies", () => {
		const uploadResult = {
			path: "target/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
			expires_at: 0,
			source: "clipboard",
		}
		const currentElement: ImageElement = {
			id: "pasted-image",
			type: "image",
			name: "Pasted image",
			x: 12,
			y: 16,
			width: 80,
			height: 60,
			status: GenerationStatus.Processing,
		}
		const setOssSrc = vi.fn()
		const requestImmediateMediaLoadForElements = vi.fn()
		const convertToPermament = vi.fn()
		const manager = createClipboardManager()
		manager.canvas = {
			...manager.canvas,
			elementManager: {
				hasElement: vi.fn(() => true),
				getElementData: vi.fn(() => currentElement),
				getElementInstance: vi.fn(() => ({ setOssSrc })),
				isTemporary: vi.fn(() => true),
				convertToPermament,
				update: vi.fn(),
			},
			visibilityManager: {
				requestImmediateMediaLoadForElements,
			},
		} as unknown as ClipboardManagerTestHarness["canvas"]

		const applied = (
			manager as unknown as {
				applyClipboardTreeUploadResult: (
					upload: {
						sourceElementId: string
						targetElementId: string
					},
					uploadResult: typeof uploadResult,
				) => boolean
			}
		).applyClipboardTreeUploadResult(
			{
				sourceElementId: "source-image",
				targetElementId: "pasted-image",
			},
			uploadResult,
		)

		expect(applied).toBe(true)
		expect(convertToPermament).toHaveBeenCalledWith(
			"pasted-image",
			expect.objectContaining({
				id: "pasted-image",
				src: "target/image.png",
				status: GenerationStatus.Completed,
			}),
			{ silent: true },
		)
		expect(manager.canvas.imageResourceManager.primeCache).toHaveBeenCalledWith(
			"target/image.png",
			uploadResult,
		)
		expect(setOssSrc).toHaveBeenCalledWith("https://target.test/image.png")
		expect(requestImmediateMediaLoadForElements).toHaveBeenCalledWith(["pasted-image"], {
			reason: "clipboard-tree-upload",
			priority: "critical",
		})
	})

	it("activates pasted frame child video resources after upload applies", () => {
		const uploadResult = {
			path: "target/video.mp4",
			src: "https://target.test/video.mp4",
			fileName: "video.mp4",
			expires_at: 0,
			source: "clipboard",
		}
		const currentElement: VideoElement = {
			id: "pasted-video",
			type: "video",
			name: "Pasted video",
			x: 12,
			y: 16,
			width: 160,
			height: 90,
			status: GenerationStatus.Processing,
		}
		const requestPreviewLoad = vi.fn()
		const requestImmediateMediaLoadForElements = vi.fn()
		const convertToPermament = vi.fn()
		const manager = createClipboardManager()
		manager.canvas = {
			...manager.canvas,
			elementManager: {
				hasElement: vi.fn(() => true),
				getElementData: vi.fn(() => currentElement),
				getElementInstance: vi.fn(() => ({ requestPreviewLoad })),
				isTemporary: vi.fn(() => true),
				convertToPermament,
				update: vi.fn(),
			},
			visibilityManager: {
				requestImmediateMediaLoadForElements,
			},
		} as unknown as ClipboardManagerTestHarness["canvas"]

		const applied = (
			manager as unknown as {
				applyClipboardTreeUploadResult: (
					upload: {
						sourceElementId: string
						targetElementId: string
					},
					uploadResult: typeof uploadResult,
				) => boolean
			}
		).applyClipboardTreeUploadResult(
			{
				sourceElementId: "source-video",
				targetElementId: "pasted-video",
			},
			uploadResult,
		)

		expect(applied).toBe(true)
		expect(convertToPermament).toHaveBeenCalledWith(
			"pasted-video",
			expect.objectContaining({
				id: "pasted-video",
				src: "target/video.mp4",
				status: GenerationStatus.Completed,
			}),
			{ silent: true },
		)
		expect(manager.canvas.videoResourceManager.primeCache).toHaveBeenCalledWith(
			"target/video.mp4",
			uploadResult,
		)
		expect(requestPreviewLoad).toHaveBeenCalledWith({ force: true })
		expect(requestImmediateMediaLoadForElements).toHaveBeenCalledWith(["pasted-video"], {
			reason: "clipboard-tree-upload",
			priority: "critical",
		})
	})
})
