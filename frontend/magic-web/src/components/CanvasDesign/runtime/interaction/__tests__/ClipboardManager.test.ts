import { describe, expect, it, vi } from "vitest"
import { ClipboardManager } from "../clipboard/ClipboardManager"
import type { FrameElement, ImageElement, LayerElement, VideoElement } from "../../document/types"
import {
	GenerationStatus,
	ImageGenerationTaskTypeMap,
	type UploadFileResponse,
} from "../../../public/magic-types"

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
		metadata: Array<{
			elementId: string
			role?: string
			resourcePath?: string
			sourceRef?: { src?: string; ossUrl?: string }
		}>
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
		resourcePathMap: ReadonlyMap<string, string>
		sourceCanvasId?: string
	}) => Promise<{
		element: LayerElement | null
		sourceReferenceFailureCount: number
		pendingUploads: Array<{
			sourceElementId: string
			targetElementId: string
			sourceCanvasId?: string
			sourcePath?: string
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
	it("starts media metadata lookups concurrently so get-file-url can batch them", async () => {
		const firstImage: ImageElement = {
			id: "first-image",
			type: "image",
			name: "First image",
			src: "source/first.png",
			x: 0,
			y: 0,
			width: 80,
			height: 60,
		}
		const secondImage: ImageElement = {
			id: "second-image",
			type: "image",
			name: "Second image",
			src: "source/second.png",
			x: 100,
			y: 0,
			width: 80,
			height: 60,
		}
		let resolveFirstLookup!: (value: { src: string; fileName: string }) => void
		const firstLookup = new Promise<{ src: string; fileName: string }>((resolve) => {
			resolveFirstLookup = resolve
		})
		const getFileInfo = vi.fn((path: string) => {
			if (path === firstImage.src) {
				return firstLookup
			}
			return Promise.resolve({
				src: `https://example.test/${path}`,
				fileName: path.split("/").pop() ?? "image.png",
			})
		})
		const manager = createClipboardManager()
		;(manager.canvas as unknown as { magicConfigManager: unknown }).magicConfigManager = {
			config: { methods: { getFileInfo } },
		}

		const resultPromise = manager.collectClipboardFiles([firstImage, secondImage])
		await Promise.resolve()

		expect(getFileInfo).toHaveBeenCalledTimes(2)
		expect(getFileInfo).toHaveBeenNthCalledWith(1, firstImage.src, {
			useImageProcess: false,
		})
		expect(getFileInfo).toHaveBeenNthCalledWith(2, secondImage.src, {
			useImageProcess: false,
		})

		resolveFirstLookup({
			src: "https://example.test/source/first.png",
			fileName: "first.png",
		})
		await expect(resultPromise).resolves.toMatchObject({
			metadata: [{ elementId: firstImage.id }, { elementId: secondImage.id }],
		})
	})

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

	it("collects generation resource metadata from image requests", async () => {
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
				model_id: "image-model",
				prompt: "a friendly creature",
				reference_images: ["source/ref.png", "source/image.png"],
			},
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
		;(manager.canvas as unknown as { magicConfigManager: unknown }).magicConfigManager = {
			config: {
				methods: {
					getFileInfo: vi.fn(async (path: string) => ({
						src: `https://example.test/${path}`,
						fileName: path.split("/").pop(),
					})),
				},
			},
		}

		const result = await manager.collectClipboardFiles([child])

		expect(result.metadata).toEqual([
			expect.objectContaining({
				elementId: "image-child",
				role: "element-media",
				sourceRef: expect.objectContaining({ src: "source/image.png" }),
			}),
			expect.objectContaining({
				role: "generation-resource",
				resourcePath: "source/ref.png",
				sourceRef: expect.objectContaining({ src: "source/ref.png" }),
			}),
		])
	})

	it("collects cross-element media references as generation resources", async () => {
		const referencedElement: ImageElement = {
			id: "referenced-image",
			type: "image",
			name: "Referenced image",
			src: "./images/referenced.png",
			x: 0,
			y: 0,
			width: 80,
			height: 60,
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.High,
				file_path: "./images/referenced.png",
			},
		}
		const referringElement: ImageElement = {
			id: "referring-image",
			type: "image",
			name: "Referring image",
			src: "source/referring.png",
			x: 100,
			y: 0,
			width: 80,
			height: 60,
			generateImageRequest: {
				model_id: "image-model",
				prompt: "use the other pasted image",
				reference_images: ["images/referenced.png"],
			},
		}
		const manager = createClipboardManager()
		manager.getCanvasFileMetadata = vi.fn(async (element: ImageElement) => ({
			element,
			filename: `${element.id}.png`,
			mimeType: "image/png",
			fileSize: 0,
			sourceRef: {
				src: element.src,
				ossUrl: `https://example.test/${element.src}`,
			},
		}))
		;(manager.canvas as unknown as { magicConfigManager: unknown }).magicConfigManager = {
			config: {
				methods: {
					getFileInfo: vi.fn(async (path: string) => ({
						src: `https://example.test/${path}`,
						fileName: path.split("/").pop(),
					})),
				},
			},
		}

		const result = await manager.collectClipboardFiles([referencedElement, referringElement])

		expect(result.metadata).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					elementId: "referenced-image",
					role: "element-media",
				}),
				expect.objectContaining({
					elementId: "referring-image",
					role: "element-media",
				}),
				expect.objectContaining({
					role: "generation-resource",
					resourcePath: "images/referenced.png",
				}),
			]),
		)
	})

	it("deduplicates generation resource transfers and reports failures", async () => {
		const manager = createClipboardManager()
		const transferRemoteResource = vi.fn(async ({ metadata }: { metadata: { id: string } }) =>
			metadata.id === "missing"
				? null
				: {
						path: "target/ref.png",
						src: "https://target.test/ref.png",
						fileName: "ref.png",
						expires_at: "2030-01-01 00:00:00",
					},
		)
		manager.canvas.canvasFileUploadManager.transferRemoteResource = transferRemoteResource

		const result = await (
			manager as unknown as {
				resolveGenerationResourcePathMap: (
					fileMetadata: Array<{
						id: string
						elementId: string
						filename: string
						mimeType: string
						fileSize: number
						role: string
						resourcePath?: string
						sourceRef?: { src?: string; ossUrl?: string }
					}>,
					sourceCanvasId?: string,
				) => Promise<{ pathMap: Map<string, string>; failureCount: number }>
			}
		).resolveGenerationResourcePathMap(
			[
				{
					id: "ref-a",
					elementId: "ref-a",
					filename: "ref.png",
					mimeType: "image/png",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "source/ref.png",
					sourceRef: { src: "source/ref.png", ossUrl: "https://source.test/ref.png" },
				},
				{
					id: "ref-a-duplicate",
					elementId: "ref-a-duplicate",
					filename: "ref.png",
					mimeType: "image/png",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "./source/ref.png",
					sourceRef: { src: "./source/ref.png", ossUrl: "https://source.test/ref.png" },
				},
				{
					id: "missing",
					elementId: "missing",
					filename: "missing.png",
					mimeType: "image/png",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "source/missing.png",
					sourceRef: {
						src: "source/missing.png",
						ossUrl: "https://source.test/missing.png",
					},
				},
			],
			"source-canvas",
		)

		expect(Array.from(result.pathMap.entries())).toEqual([["source/ref.png", "target/ref.png"]])
		expect(result.failureCount).toBe(1)
		expect(transferRemoteResource).toHaveBeenCalledTimes(2)
	})

	it("transfers distinct generation resources concurrently", async () => {
		const manager = createClipboardManager()
		let resolveFirst: (value: UploadFileResponse) => void = () => undefined
		const firstTransfer = new Promise<UploadFileResponse>((resolve) => {
			resolveFirst = resolve
		})
		const transferRemoteResource = vi.fn(
			({ metadata }: { metadata: { id: string; filename: string } }) => {
				if (metadata.id === "ref-a") {
					return firstTransfer
				}
				return Promise.resolve({
					path: "target/ref-b.png",
					src: "https://target.test/ref-b.png",
					fileName: metadata.filename,
					expires_at: "2030-01-01 00:00:00",
				})
			},
		)
		manager.canvas.canvasFileUploadManager.transferRemoteResource = transferRemoteResource

		const resultPromise = (
			manager as unknown as {
				resolveGenerationResourcePathMap: (
					fileMetadata: Array<{
						id: string
						elementId: string
						filename: string
						mimeType: string
						fileSize: number
						role: string
						resourcePath?: string
						sourceRef?: { src?: string; ossUrl?: string }
					}>,
					sourceCanvasId?: string,
				) => Promise<{ pathMap: Map<string, string>; failureCount: number }>
			}
		).resolveGenerationResourcePathMap(
			[
				{
					id: "ref-a",
					elementId: "ref-a",
					filename: "ref-a.png",
					mimeType: "image/png",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "source/ref-a.png",
					sourceRef: { src: "source/ref-a.png", ossUrl: "https://source.test/ref-a.png" },
				},
				{
					id: "ref-b",
					elementId: "ref-b",
					filename: "ref-b.png",
					mimeType: "image/png",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "source/ref-b.png",
					sourceRef: { src: "source/ref-b.png", ossUrl: "https://source.test/ref-b.png" },
				},
			],
			"source-canvas",
		)

		await Promise.resolve()
		expect(transferRemoteResource).toHaveBeenCalledTimes(2)

		resolveFirst({
			path: "target/ref-a.png",
			src: "https://target.test/ref-a.png",
			fileName: "ref-a.png",
			expires_at: "2030-01-01 00:00:00",
		})
		const result = await resultPromise

		expect(Array.from(result.pathMap.entries())).toEqual([
			["source/ref-a.png", "target/ref-a.png"],
			["source/ref-b.png", "target/ref-b.png"],
		])
		expect(result.failureCount).toBe(0)
	})

	it("rewrites frame child media src when pasting across canvases", async () => {
		const child: ImageElement = {
			id: "image-child",
			type: "image",
			name: "Child image",
			src: "./images/image.png",
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
				file_path: "images/image.png",
				size: "2048x2048",
			},
			generateHightImageRequest: {
				image_id: "legacy-high-task",
				file_path: "images/image.png",
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
			expires_at: "2030-01-01 00:00:00",
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
							src: "./images/image.png",
							ossUrl: "https://source.test/image.png",
						},
					},
				],
			]),
			resourcePathMap: new Map([["images/image.png", "target/reference-copy.png"]]),
			sourceCanvasId: "source-canvas",
		})

		expect(result.sourceReferenceFailureCount).toBe(0)
		expect(result.pendingUploads).toEqual([
			expect.objectContaining({
				sourceElementId: "image-child",
				sourceCanvasId: "source-canvas",
			}),
		])
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
				src: undefined,
				status: GenerationStatus.Processing,
				generateImageRequest: expect.objectContaining({
					model_id: "image-model",
					prompt: "a friendly creature",
				}),
				imageGenerationTaskMeta: expect.objectContaining({
					type: ImageGenerationTaskTypeMap.High,
					file_path: "images/image.png",
					size: "2048x2048",
				}),
				generateHightImageRequest: expect.objectContaining({
					file_path: "images/image.png",
					size: "2048x2048",
				}),
			}),
		)
		const pastedChild = pastedFrame.children?.[0] as ImageElement
		expect(pastedChild.id).not.toBe("image-child")
		expect(pastedChild.generateImageRequest?.image_id).toBeUndefined()
		expect(pastedChild.imageGenerationTaskMeta?.image_id).toBeUndefined()
		expect(pastedChild.generateHightImageRequest?.image_id).toBeUndefined()
		expect(pastedChild.id).toBe(result.pendingUploads[0]?.targetElementId)
		expect(
			manager.canvas.canvasFileUploadManager.getReusableCompletedRemoteResourceTransfer,
		).not.toHaveBeenCalled()
		expect(manager.canvas.imageResourceManager.primeCache).not.toHaveBeenCalled()
	})

	it("rewrites image generation references when pasting across canvases", async () => {
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
				project_id: "source-project",
				file_dir: "/source/images/",
				model_id: "image-model",
				prompt: "use source/ref.png as a reference",
				reference_images: ["source/ref.png", "source/image.png"],
				reference_image_options: [{ path: "source/ref.png" }],
			},
			imageGenerationTaskMeta: {
				type: ImageGenerationTaskTypeMap.Eraser,
				image_id: "source-eraser-task",
				file_path: "source/image.png",
				mask_path: "source/mask.png",
				mark_path: "source/mark.png",
				reference_image_options: [{ path: "source/ref.png" }],
			},
			generateHightImageRequest: {
				image_id: "legacy-high-task",
				file_path: "source/ref.png",
				reference_image_options: [{ path: "source/ref.png" }],
			},
		}
		const uploadResult = {
			path: "target/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
			expires_at: "2030-01-01 00:00:00",
		}
		const manager = createClipboardManager()
		manager.canvas.canvasFileUploadManager.getReusableCompletedRemoteResourceTransfer = vi.fn(
			async () => uploadResult,
		)

		const result = await manager.prepareClipboardTreeElement({
			sourceElement: child,
			currentNames: new Set(),
			isRoot: true,
			offsetX: 0,
			offsetY: 0,
			rootZIndex: 8,
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
			resourcePathMap: new Map([
				["source/ref.png", "target/ref.png"],
				["source/mask.png", "target/mask.png"],
				["source/mark.png", "target/mark.png"],
			]),
			sourceCanvasId: "source-canvas",
		})

		const pastedChild = result.element as ImageElement
		expect(result.pendingUploads).toEqual([
			expect.objectContaining({
				sourceElementId: "image-child",
				sourceCanvasId: "source-canvas",
			}),
		])
		expect(pastedChild.src).toBeUndefined()
		expect(pastedChild.generateImageRequest).toEqual(
			expect.objectContaining({
				model_id: "image-model",
				prompt: "use source/ref.png as a reference",
				reference_images: ["target/ref.png", "source/image.png"],
				reference_image_options: [expect.objectContaining({ path: "target/ref.png" })],
			}),
		)
		expect(pastedChild.generateImageRequest?.image_id).toBeUndefined()
		expect(pastedChild.generateImageRequest?.project_id).toBeUndefined()
		expect(pastedChild.generateImageRequest?.file_dir).toBeUndefined()
		expect(pastedChild.imageGenerationTaskMeta).toEqual(
			expect.objectContaining({
				file_path: "source/image.png",
				mask_path: "target/mask.png",
				mark_path: "target/mark.png",
				reference_image_options: [expect.objectContaining({ path: "target/ref.png" })],
			}),
		)
		expect(pastedChild.generateHightImageRequest).toEqual(
			expect.objectContaining({
				file_path: "target/ref.png",
				reference_image_options: [expect.objectContaining({ path: "target/ref.png" })],
			}),
		)
		expect(
			manager.canvas.canvasFileUploadManager.getReusableCompletedRemoteResourceTransfer,
		).not.toHaveBeenCalled()
	})

	it("rewrites video generation input resources when pasting across canvases", async () => {
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
				project_id: "source-project",
				file_dir: "/source/videos/",
				file_name: "source.mp4",
				model_id: "video-model",
				prompt: "a cinematic clip",
				inputs: {
					frames: [{ role: "start", uri: "source/start.png" }],
					reference_images: [{ uri: "source/ref.png" }],
					reference_videos: [{ uri: "source/ref.mp4" }],
					reference_audios: [{ uri: "source/ref.mp3" }],
					video: { uri: "source/video.mp4" },
					mask: { uri: "source/mask.png" },
					audio: [{ uri: "source/audio.wav" }],
				},
			},
		}
		const uploadResult = {
			path: "target/video.mp4",
			src: "https://target.test/video.mp4",
			fileName: "video.mp4",
			expires_at: "2030-01-01 00:00:00",
		}
		const manager = createClipboardManager()
		manager.canvas.canvasFileUploadManager.getReusableCompletedRemoteResourceTransfer = vi.fn(
			async () => uploadResult,
		)

		const result = await manager.prepareClipboardTreeElement({
			sourceElement: child,
			currentNames: new Set(),
			isRoot: true,
			offsetX: 0,
			offsetY: 0,
			rootZIndex: 8,
			canReuseElementSrc: false,
			fileByElementId: new Map(),
			metadataByElementId: new Map([
				[
					"video-child",
					{
						elementId: "video-child",
						filename: "video.mp4",
						mimeType: "video/mp4",
						fileSize: 0,
						sourceRef: {
							src: "source/video.mp4",
							ossUrl: "https://source.test/video.mp4",
						},
					},
				],
			]),
			resourcePathMap: new Map([
				["source/start.png", "target/start.png"],
				["source/ref.png", "target/ref.png"],
				["source/ref.mp4", "target/ref.mp4"],
				["source/ref.mp3", "target/ref.mp3"],
				["source/mask.png", "target/mask.png"],
				["source/audio.wav", "target/audio.wav"],
			]),
			sourceCanvasId: "source-canvas",
		})

		const pastedChild = result.element as VideoElement
		expect(result.pendingUploads).toEqual([
			expect.objectContaining({
				sourceElementId: "video-child",
				sourceCanvasId: "source-canvas",
			}),
		])
		expect(pastedChild.src).toBeUndefined()
		expect(pastedChild.generateVideoRequest?.video_id).toBeUndefined()
		expect(pastedChild.generateVideoRequest?.project_id).toBeUndefined()
		expect(pastedChild.generateVideoRequest?.file_dir).toBeUndefined()
		expect(pastedChild.generateVideoRequest?.file_name).toBeUndefined()
		expect(pastedChild.generateVideoRequest?.inputs).toEqual({
			frames: [expect.objectContaining({ uri: "target/start.png" })],
			reference_images: [expect.objectContaining({ uri: "target/ref.png" })],
			reference_videos: [expect.objectContaining({ uri: "target/ref.mp4" })],
			reference_audios: [expect.objectContaining({ uri: "target/ref.mp3" })],
			video: expect.objectContaining({ uri: "source/video.mp4" }),
			mask: expect.objectContaining({ uri: "target/mask.png" }),
			audio: [expect.objectContaining({ uri: "target/audio.wav" })],
		})
		expect(
			manager.canvas.canvasFileUploadManager.getReusableCompletedRemoteResourceTransfer,
		).not.toHaveBeenCalled()
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
			resourcePathMap: new Map(),
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
			resourcePathMap: new Map(),
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
		const uploadResult: UploadFileResponse = {
			path: "target/image.png",
			src: "https://target.test/image.png",
			fileName: "image.png",
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
			generateImageRequest: {
				model_id: "image-model",
				prompt: "pasted image",
				reference_images: ["source/image.png"],
			},
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
						sourcePath?: string
					},
					nextUploadResult: UploadFileResponse,
				) => boolean
			}
		).applyClipboardTreeUploadResult(
			{
				sourceElementId: "source-image",
				targetElementId: "pasted-image",
				sourcePath: "source/image.png",
			},
			uploadResult,
		)

		expect(applied).toBe(true)
		const imageResourceUpdates = convertToPermament.mock.calls[0]?.[1]
		expect(imageResourceUpdates).toEqual(
			expect.objectContaining({
				src: "target/image.png",
				status: GenerationStatus.Completed,
				errorMessage: undefined,
				generateImageRequest: expect.objectContaining({
					reference_images: ["target/image.png"],
				}),
			}),
		)
		expect(imageResourceUpdates).not.toHaveProperty("id")
		expect(imageResourceUpdates).not.toHaveProperty("x")
		expect(imageResourceUpdates).not.toHaveProperty("y")
		expect(imageResourceUpdates).not.toHaveProperty("width")
		expect(imageResourceUpdates).not.toHaveProperty("height")
		expect(convertToPermament).toHaveBeenCalledWith("pasted-image", imageResourceUpdates, {
			silent: true,
		})
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
		const uploadResult: UploadFileResponse = {
			path: "target/video.mp4",
			src: "https://target.test/video.mp4",
			fileName: "video.mp4",
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
						sourcePath?: string
					},
					nextUploadResult: UploadFileResponse,
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
		const videoResourceUpdates = convertToPermament.mock.calls[0]?.[1]
		expect(videoResourceUpdates).toEqual(
			expect.objectContaining({
				src: "target/video.mp4",
				status: GenerationStatus.Completed,
				errorMessage: undefined,
			}),
		)
		expect(videoResourceUpdates).not.toHaveProperty("id")
		expect(videoResourceUpdates).not.toHaveProperty("x")
		expect(videoResourceUpdates).not.toHaveProperty("y")
		expect(videoResourceUpdates).not.toHaveProperty("width")
		expect(videoResourceUpdates).not.toHaveProperty("height")
		expect(convertToPermament).toHaveBeenCalledWith("pasted-video", videoResourceUpdates, {
			silent: true,
		})
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

	it("runs background generation resource transfers after creating pasted elements", async () => {
		const uploadResult: UploadFileResponse = {
			path: "./videos/reference-copy.mp4",
			src: "https://target.test/reference-copy.mp4",
			fileName: "reference-copy.mp4",
			expires_at: "2030-01-01 00:00:00",
		}
		const currentElement: VideoElement = {
			id: "pasted-video",
			type: "video",
			name: "Pasted video",
			x: 12,
			y: 16,
			width: 160,
			height: 90,
			generateVideoRequest: {
				model_id: "video-model",
				prompt: "merge clips",
				inputs: {
					reference_videos: [{ uri: "./videos/reference.mp4" }],
				},
			},
		}
		const transferRemoteResource = vi.fn(async () => uploadResult)
		const update = vi.fn()
		const recordHistoryImmediate = vi.fn()
		const releaseLoadDeferral = vi.fn()
		const manager = createClipboardManager()
		manager.canvas = {
			id: "target-canvas",
			canvasFileUploadManager: {
				getCompletedRemoteResourceTransfer: vi.fn(),
				getReusableCompletedRemoteResourceTransfer: vi.fn(),
				transferRemoteResource,
			},
			elementManager: {
				getElementData: vi.fn(() => currentElement),
				update,
			},
			historyManager: {
				recordHistoryImmediate,
			},
			imageResourceManager: {
				primeCache: vi.fn(),
			},
			videoResourceManager: {
				primeCache: vi.fn(),
			},
		} as unknown as ClipboardManagerTestHarness["canvas"]
		;(
			manager as unknown as {
				runClipboardGenerationResourceTransfers: (options: {
					fileMetadata: Array<{
						elementId: string
						filename: string
						mimeType: string
						fileSize: number
						role: string
						resourcePath?: string
						sourceRef?: { src?: string; ossUrl?: string }
					}>
					sourceCanvasId?: string
					targetElementIds: string[]
					releaseLoadDeferrals?: Array<() => void>
				}) => void
			}
		).runClipboardGenerationResourceTransfers({
			fileMetadata: [
				{
					elementId: "generation-resource:0",
					filename: "reference.mp4",
					mimeType: "video/mp4",
					fileSize: 0,
					role: "generation-resource",
					resourcePath: "./videos/reference.mp4",
					sourceRef: {
						src: "./videos/reference.mp4",
						ossUrl: "https://source.test/reference.mp4",
					},
				},
			],
			sourceCanvasId: "source-canvas",
			targetElementIds: ["pasted-video"],
			releaseLoadDeferrals: [releaseLoadDeferral],
		})

		await vi.waitFor(() => {
			expect(transferRemoteResource).toHaveBeenCalledTimes(1)
			expect(update).toHaveBeenCalledTimes(1)
		})

		expect(update).toHaveBeenCalledWith(
			"pasted-video",
			expect.objectContaining({
				generateVideoRequest: expect.objectContaining({
					inputs: expect.objectContaining({
						reference_videos: [{ uri: "./videos/reference-copy.mp4" }],
					}),
				}),
			}),
			{ silent: false },
		)
		expect(manager.canvas.videoResourceManager.primeCache).toHaveBeenCalledWith(
			"./videos/reference-copy.mp4",
			uploadResult,
		)
		expect(recordHistoryImmediate).toHaveBeenCalledTimes(1)
		expect(releaseLoadDeferral).toHaveBeenCalledTimes(1)
	})
})
