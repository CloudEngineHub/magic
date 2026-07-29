import Konva from "konva"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ImageElement } from "../../image/ImageElement"
import { VideoElement } from "../../video/VideoElement"
import {
	GenerationStatus,
	type GenerateImageRequest,
	type GenerateVideoRequest,
} from "../../../../public/magic-types"
import { RenderUtils } from "../../../shared/render/RenderUtils"
import { ElementTypeEnum } from "../../../document/types"

function createDeferred() {
	let resolve!: () => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<void>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, resolve, reject }
}

describe("ImageElement mounted image node sync", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("updates the mounted Konva image source without recreating the group", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
		} as unknown as CanvasRenderingContext2D)

		const oldImage = new Image()
		const newImage = new Image()
		const imageNode = new Konva.Image({
			image: oldImage,
			name: "image-content",
			width: 100,
			height: 100,
		})
		const group = new Konva.Group()
		group.add(imageNode)

		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			loadedImage: HTMLImageElement
			data: { id: string; width: number; height: number }
			canvas: { cropManager: { getCroppingElementId: () => string | null } }
			getSourceCrop: () => { x: number; y: number; width: number; height: number }
			patchMountedImageContentNodeWithLoadedResource: () => { type: string }
		}
		element.node = group
		element.loadedImage = newImage
		element.data = { id: "image-1", width: 200, height: 120 }
		element.canvas = {
			cropManager: {
				getCroppingElementId: () => null,
			},
		}
		element.getSourceCrop = vi.fn(() => ({ x: 1, y: 2, width: 3, height: 4 }))

		const result = element.patchMountedImageContentNodeWithLoadedResource()

		expect(result).toEqual({ type: "patched-content" })
		expect(imageNode.image()).toBe(newImage)
		expect(imageNode.width()).toBe(200)
		expect(imageNode.height()).toBe(120)
		expect(imageNode.crop()).toEqual({ x: 1, y: 2, width: 3, height: 4 })
	})

	it("applies resource upgrades to the mounted image node without rerendering", () => {
		const oldImage = new Image()
		const fullImage = new Image()
		const imageNode = new Konva.Image({
			image: oldImage,
			name: "image-content",
			width: 100,
			height: 80,
		})
		const group = new Konva.Group({ width: 100, height: 80 })
		group.add(imageNode)

		const emit = vi.fn()
		const batchDraw = vi.fn()
		const rerenderWhenTransformIdle = vi.fn()
		const resource = {
			ossSrc: "https://example.test/full.png",
			image: fullImage,
			imageInfo: {
				naturalWidth: 100,
				naturalHeight: 80,
				fileSize: 10,
				mimeType: "image/png",
				filename: "full.png",
			},
			variant: "full" as const,
			sourceWidth: 100,
			sourceHeight: 80,
			isFullSize: true,
		}
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			loadedImage: HTMLImageElement
			loadedImageVariant: "preview"
			data: { id: string; src: string; width: number; height: number }
			canvas: {
				cropManager: { getCroppingElementId: () => string | null }
				eventEmitter: { emit: ReturnType<typeof vi.fn> }
			}
			getSourceCrop: () => { x: number; y: number; width: number; height: number }
			isErrorState: boolean
			isResourceLoading: boolean
			lastAppliedLoadFailureSignature: string | null
			rerenderWhenTransformIdle: ReturnType<typeof vi.fn>
			applyPresentedResource: (
				loadedResource: typeof resource,
				targetVariant: "full",
			) => boolean
		}
		element.node = group
		element.loadedImage = oldImage
		element.loadedImageVariant = "preview"
		element.data = { id: "image-1", src: "/image.png", width: 100, height: 80 }
		element.canvas = {
			cropManager: {
				getCroppingElementId: () => null,
			},
			eventEmitter: { emit },
		}
		element.getSourceCrop = vi.fn(() => ({ x: 0, y: 0, width: 100, height: 80 }))
		element.isErrorState = false
		element.isResourceLoading = true
		element.lastAppliedLoadFailureSignature = "/image.png:load-error"
		element.rerenderWhenTransformIdle = rerenderWhenTransformIdle
		vi.spyOn(imageNode, "getLayer").mockReturnValue({ batchDraw } as never)

		const previousAutoDrawEnabled = Konva.autoDrawEnabled
		let changed = false
		try {
			Konva.autoDrawEnabled = false
			changed = element.applyPresentedResource(resource, "full")
		} finally {
			Konva.autoDrawEnabled = previousAutoDrawEnabled
		}

		expect(changed).toBe(true)
		expect(imageNode.image()).toBe(fullImage)
		expect(element.loadedImage).toBe(fullImage)
		expect(element.isResourceLoading).toBe(false)
		expect(element.lastAppliedLoadFailureSignature).toBeNull()
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:ossSrcReady",
			data: { elementId: "image-1" },
		})
		expect(rerenderWhenTransformIdle).not.toHaveBeenCalled()
		expect(batchDraw).not.toHaveBeenCalled()
	})

	it("rerenders when a loaded resource has no mounted image node to update", () => {
		const previewImage = new Image()
		const group = new Konva.Group({ width: 100, height: 80 })
		const emit = vi.fn()
		const rerenderWhenTransformIdle = vi.fn()
		const resource = {
			ossSrc: "https://example.test/preview.png",
			image: previewImage,
			imageInfo: {
				naturalWidth: 100,
				naturalHeight: 80,
				fileSize: 10,
				mimeType: "image/png",
				filename: "preview.png",
			},
			variant: "preview" as const,
			sourceWidth: 100,
			sourceHeight: 80,
			isFullSize: false,
		}
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			loadedImage?: HTMLImageElement
			data: { id: string; src: string; width: number; height: number }
			canvas: {
				cropManager: { getCroppingElementId: () => string | null }
				eventEmitter: { emit: ReturnType<typeof vi.fn> }
			}
			isErrorState: boolean
			isResourceLoading: boolean
			lastAppliedLoadFailureSignature: string | null
			rerenderWhenTransformIdle: ReturnType<typeof vi.fn>
			applyPresentedResource: (
				loadedResource: typeof resource,
				targetVariant: "preview",
			) => boolean
		}
		element.node = group
		element.loadedImage = undefined
		element.data = { id: "image-1", src: "/image.png", width: 100, height: 80 }
		element.canvas = {
			cropManager: {
				getCroppingElementId: () => null,
			},
			eventEmitter: { emit },
		}
		element.isErrorState = false
		element.isResourceLoading = true
		element.lastAppliedLoadFailureSignature = null
		element.rerenderWhenTransformIdle = rerenderWhenTransformIdle

		const changed = element.applyPresentedResource(resource, "preview")

		expect(changed).toBe(true)
		expect(element.loadedImage).toBe(previewImage)
		expect(rerenderWhenTransformIdle).toHaveBeenCalledTimes(1)
	})

	it("renders the loaded image even when oss metadata is temporarily absent", () => {
		const imageGroup = new Konva.Group()
		const loadingGroup = new Konva.Group()
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			data: { id: string; src: string; status?: GenerationStatus }
			isErrorState: boolean
			storedOssSrc: string | null
			storedImageInfo: undefined
			loadedImage: HTMLImageElement
			getImageGenerationTaskMeta: () => undefined
			renderImage: ReturnType<typeof vi.fn>
			renderLoadingPlaceholder: ReturnType<typeof vi.fn>
		}
		element.data = { id: "image-1", src: "/image.png" }
		element.isErrorState = false
		element.storedOssSrc = null
		element.storedImageInfo = undefined
		element.loadedImage = new Image()
		element.getImageGenerationTaskMeta = vi.fn(() => undefined)
		element.renderImage = vi.fn(() => imageGroup)
		element.renderLoadingPlaceholder = vi.fn(() => loadingGroup)

		expect(element.render()).toBe(imageGroup)
		expect(element.renderImage).toHaveBeenCalledTimes(1)
		expect(element.renderLoadingPlaceholder).not.toHaveBeenCalled()
	})

	it("labels temporary pasted image placeholders with existing info as uploading", () => {
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			data: {
				id: string
				name: string
				status: GenerationStatus
				generateImageRequest: { model_id: string; prompt: string }
			}
			canvas: { t: undefined; elementManager: { isTemporary: ReturnType<typeof vi.fn> } }
			isGenerating: boolean
			isErrorState: boolean
		}
		element.data = {
			id: "pasted-image",
			name: "Pasted image",
			status: GenerationStatus.Processing,
			generateImageRequest: {
				model_id: "image-model",
				prompt: "a friendly creature",
			},
		}
		element.canvas = {
			t: undefined,
			elementManager: {
				isTemporary: vi.fn(() => true),
			},
		}
		element.isGenerating = false
		element.isErrorState = false

		expect(element.getNameLabelText()).toBe("Pasted image(上传中)")
	})

	it("treats pasted video placeholders with existing info as uploading", () => {
		const element = Object.create(VideoElement.prototype) as VideoElement & {
			data: {
				id: string
				status: GenerationStatus
				generateVideoRequest: { model_id: string; prompt: string }
			}
			canvas: {
				t: undefined
				elementManager: { isTemporary: ReturnType<typeof vi.fn> }
			}
			isGenerating: boolean
			resolveRenderState: () => { stage: string; text?: string }
		}
		element.data = {
			id: "pasted-video",
			status: GenerationStatus.Processing,
			generateVideoRequest: {
				model_id: "video-model",
				prompt: "a cinematic clip",
			},
		}
		element.canvas = {
			t: undefined,
			elementManager: {
				isTemporary: vi.fn(() => true),
			},
		}
		element.isGenerating = false

		expect(element.resolveRenderState()).toEqual({
			stage: "uploading",
			placeholderMode: "loading",
			text: "正在上传中...",
		})
	})

	it("clears video generating state when terminal generation data arrives", () => {
		const element = Object.create(VideoElement.prototype) as VideoElement & {
			data: {
				id: string
				src?: string
				status?: GenerationStatus
				generateVideoRequest?: { video_id: string }
				errorMessage?: string
			}
			isGenerating: boolean
			cancelScheduledPreviewRefresh: ReturnType<typeof vi.fn>
			releasePlaybackConsumers: ReturnType<typeof vi.fn>
			renderer: { resetPreview: ReturnType<typeof vi.fn> }
			canvas: {
				visibilityManager: {
					updateVideoElement: ReturnType<typeof vi.fn>
					unregisterVideoElement: ReturnType<typeof vi.fn>
				}
			}
		}
		element.data = {
			id: "video-1",
			status: GenerationStatus.Processing,
			generateVideoRequest: { video_id: "task-1" },
		}
		element.isGenerating = true
		element.cancelScheduledPreviewRefresh = vi.fn()
		element.releasePlaybackConsumers = vi.fn()
		element.renderer = { resetPreview: vi.fn() }
		element.canvas = {
			visibilityManager: {
				updateVideoElement: vi.fn(),
				unregisterVideoElement: vi.fn(),
			},
		}

		const shouldRerender = element.update({
			...element.data,
			src: "videos/result.mp4",
			status: GenerationStatus.Completed,
		})

		expect(element.isGenerating).toBe(false)
		expect(element.canvas.visibilityManager.updateVideoElement).toHaveBeenCalledWith(
			"video-1",
			"videos/result.mp4",
		)
		expect(shouldRerender).toBe(true)
	})

	it("resizes mounted image layout during node-only transform resize", () => {
		const imageNode = new Konva.Image({
			image: new Image(),
			name: "image-content",
			width: 100,
			height: 80,
		})
		const backgroundNode = new Konva.Image({
			image: new Image(),
			name: "background",
			width: 100,
			height: 80,
		})
		const hitRect = new Konva.Rect({
			name: "hit-area",
			width: 100,
			height: 80,
		})
		const group = new Konva.Group({ width: 100, height: 80 })
		group.add(imageNode)
		group.add(backgroundNode)
		group.add(hitRect)

		const borderDecorator = { updateSize: vi.fn() }
		const cornerActionsDecorator = { updateConfig: vi.fn() }
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			borderDecorator: typeof borderDecorator
			cornerActionsDecorator: typeof cornerActionsDecorator
			data: { id: string; width: number; height: number }
		}
		element.node = group
		element.borderDecorator = borderDecorator
		element.cornerActionsDecorator = cornerActionsDecorator
		element.data = { id: "image-1", width: 100, height: 80 }

		element.onTransformResize(240, 160)

		expect(imageNode.width()).toBe(240)
		expect(imageNode.height()).toBe(160)
		expect(backgroundNode.width()).toBe(240)
		expect(backgroundNode.height()).toBe(160)
		expect(hitRect.width()).toBe(240)
		expect(hitRect.height()).toBe(160)
		expect(borderDecorator.updateSize).toHaveBeenCalledWith(240, 160)
		expect(cornerActionsDecorator.updateConfig).toHaveBeenCalledWith({
			width: 240,
			height: 160,
		})
	})

	it("resizes named placeholder background images without relying on backgroundNode", () => {
		const backgroundImage = new Image()
		backgroundImage.width = 400
		backgroundImage.height = 200
		const group = new Konva.Group({ width: 100, height: 100 })
		const backgroundNode = RenderUtils.createBackgroundImage(group, 100, 100, backgroundImage)
		const hitRect = new Konva.Rect({
			name: "hit-area",
			width: 100,
			height: 100,
		})
		group.add(hitRect)

		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			borderDecorator: undefined
			cornerActionsDecorator: undefined
		}
		element.node = group
		element.borderDecorator = undefined
		element.cornerActionsDecorator = undefined

		expect(backgroundNode.crop()).toEqual({ x: 100, y: 0, width: 200, height: 200 })

		element.onTransformResize(240, 60)

		expect(backgroundNode.width()).toBe(240)
		expect(backgroundNode.height()).toBe(60)
		expect(backgroundNode.crop()).toEqual({ x: 0, y: 50, width: 400, height: 100 })
	})

	it("resizes named video placeholder background images", () => {
		const backgroundImage = new Image()
		backgroundImage.width = 400
		backgroundImage.height = 200
		const group = new Konva.Group({ width: 100, height: 100 })
		const backgroundNode = RenderUtils.createBackgroundImage(group, 100, 100, backgroundImage)
		const hitRect = new Konva.Rect({
			name: "hit-area",
			width: 100,
			height: 100,
		})
		group.add(hitRect)

		const element = Object.create(VideoElement.prototype) as VideoElement & {
			node: Konva.Group
			borderDecorator: undefined
			cornerActionsDecorator: undefined
		}
		element.node = group
		element.borderDecorator = undefined
		element.cornerActionsDecorator = undefined
		;(
			element as unknown as {
				renderer: {
					updatePlaceholderContentLayout: ReturnType<typeof vi.fn>
					updatePlayerLayout: ReturnType<typeof vi.fn>
				}
			}
		).renderer = {
			updatePlaceholderContentLayout: vi.fn(),
			updatePlayerLayout: vi.fn(),
		}

		element.onTransformResize(240, 60)

		expect(backgroundNode.width()).toBe(240)
		expect(backgroundNode.height()).toBe(60)
		expect(backgroundNode.crop()).toEqual({ x: 0, y: 50, width: 400, height: 100 })
	})

	it("switches mounted image away from a resource before it closes", () => {
		const closingImage = new Image()
		const fallbackImage = new Image()
		const imageNode = new Konva.Image({
			image: closingImage,
			name: "image-content",
			width: 100,
			height: 80,
		})
		const group = new Konva.Group({ width: 100, height: 80 })
		group.add(imageNode)

		const fallbackResource = {
			ossSrc: "oss://image",
			image: fallbackImage,
			imageInfo: {
				naturalWidth: 100,
				naturalHeight: 80,
				fileSize: 1,
				mimeType: "image/png",
				filename: "image.png",
			},
			variant: "preview" as const,
			sourceWidth: 100,
			sourceHeight: 80,
			isFullSize: false,
		}
		const rerenderWhenTransformIdle = vi.fn()
		const requestLayerDraw = vi.fn()
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			loadedImage: HTMLImageElement
			loadedImageVariant: "preview"
			data: { id: string; src: string; width: number; height: number }
			canvas: {
				cropManager: { getCroppingElementId: () => string | null }
				imageResourceManager: {
					peekResource: ReturnType<typeof vi.fn>
				}
				runtimeScheduler: {
					requestLayerDraw: typeof requestLayerDraw
				}
			}
			getSourceCrop: () => { x: number; y: number; width: number; height: number }
			rerenderWhenTransformIdle: ReturnType<typeof vi.fn>
			handleImageSourceWillClose: (image: HTMLImageElement, variant: "preview") => void
		}
		element.node = group
		element.loadedImage = closingImage
		element.loadedImageVariant = "preview"
		element.data = { id: "image-1", src: "/image.png", width: 100, height: 80 }
		element.canvas = {
			cropManager: {
				getCroppingElementId: () => null,
			},
			imageResourceManager: {
				peekResource: vi.fn(() => fallbackResource),
			},
			runtimeScheduler: {
				requestLayerDraw,
			},
		}
		element.getSourceCrop = vi.fn(() => ({ x: 0, y: 0, width: 100, height: 80 }))
		element.rerenderWhenTransformIdle = rerenderWhenTransformIdle

		element.handleImageSourceWillClose(closingImage, "preview")

		expect(imageNode.image()).toBe(fallbackImage)
		expect(element.loadedImage).toBe(fallbackImage)
		expect(rerenderWhenTransformIdle).not.toHaveBeenCalled()
		expect(requestLayerDraw).toHaveBeenCalledWith("content", {
			source: "ImageElement",
			reason: "resource-will-close",
		})
	})

	it("removes mounted image node when a closing resource has no fallback", () => {
		const closingImage = new Image()
		const imageNode = new Konva.Image({
			image: closingImage,
			name: "image-content",
			width: 100,
			height: 80,
		})
		const group = new Konva.Group({ width: 100, height: 80 })
		group.add(imageNode)

		const rerenderWhenTransformIdle = vi.fn()
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			loadedImage?: HTMLImageElement
			loadedImageVariant: "preview"
			data: { id: string; src: string; width: number; height: number }
			canvas: {
				imageResourceManager: {
					peekResource: ReturnType<typeof vi.fn>
				}
			}
			rerenderWhenTransformIdle: ReturnType<typeof vi.fn>
			handleImageSourceWillClose: (image: HTMLImageElement, variant: "preview") => void
		}
		element.node = group
		element.loadedImage = closingImage
		element.loadedImageVariant = "preview"
		element.data = { id: "image-1", src: "/image.png", width: 100, height: 80 }
		element.canvas = {
			imageResourceManager: {
				peekResource: vi.fn(() => null),
			},
		}
		element.rerenderWhenTransformIdle = rerenderWhenTransformIdle

		element.handleImageSourceWillClose(closingImage, "preview")

		expect(element.loadedImage).toBeUndefined()
		expect(imageNode.getParent()).toBeNull()
		expect(rerenderWhenTransformIdle).toHaveBeenCalledTimes(1)
	})

	it("clears stale not-found state when an uploaded oss src is applied", () => {
		const loadResource = vi.fn()
		const emit = vi.fn()
		const rerenderWhenTransformIdle = vi.fn()
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			data: { id: string; src: string }
			canvas: {
				imageResourceManager: {
					loadResource: ReturnType<typeof vi.fn>
				}
				eventEmitter: {
					emit: ReturnType<typeof vi.fn>
				}
			}
			storedOssSrc: string | null
			imageLoadFailureReason: "not-found" | null
			isErrorState: boolean
			isResourceLoading: boolean
			lastAppliedLoadFailureSignature: string | null
			rerenderWhenTransformIdle: ReturnType<typeof vi.fn>
		}
		element.data = { id: "image-1", src: "./images/image.png" }
		element.canvas = {
			imageResourceManager: { loadResource },
			eventEmitter: { emit },
		}
		element.storedOssSrc = null
		element.imageLoadFailureReason = "not-found"
		element.isErrorState = true
		element.isResourceLoading = false
		element.lastAppliedLoadFailureSignature = "./images/image.png:not-found"
		element.rerenderWhenTransformIdle = rerenderWhenTransformIdle

		element.setOssSrc("https://oss.example/image.png")

		expect(element.storedOssSrc).toBe("https://oss.example/image.png")
		expect(element.imageLoadFailureReason).toBeNull()
		expect(element.isErrorState).toBe(false)
		expect(element.isResourceLoading).toBe(true)
		expect(element.lastAppliedLoadFailureSignature).toBeNull()
		expect(loadResource).toHaveBeenCalledWith("./images/image.png", {
			variant: "preview",
			priority: "visible",
		})
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:ossSrcReady",
			data: { elementId: "image-1" },
		})
		expect(rerenderWhenTransformIdle).toHaveBeenCalled()
	})

	it("subscribes only to load failures and decoded surface close events", () => {
		const cleanup = vi.fn()
		const onImageResourceWillClose = vi.fn(() => cleanup)
		const onImageResourceLoadFailed = vi.fn(() => cleanup)
		const element = Object.create(ImageElement.prototype) as {
			data: { id: string; src: string }
			canvas: {
				magicConfigManager: { config: { methods: Record<string, never> } }
				elementManager: { isTemporary: () => boolean }
				imageResourceManager: {
					onImageResourceWillClose: typeof onImageResourceWillClose
					onImageResourceLoadFailed: typeof onImageResourceLoadFailed
				}
			}
			resourceSubscriptionCleanups: Array<() => void>
			removeResourceLoadedListener: () => void
			setupResourceLoadedListener: () => void
		}
		element.data = { id: "image-1", src: "./images/a.png" }
		element.canvas = {
			magicConfigManager: { config: { methods: {} } },
			elementManager: { isTemporary: () => false },
			imageResourceManager: {
				onImageResourceWillClose,
				onImageResourceLoadFailed,
			},
		}
		element.resourceSubscriptionCleanups = []

		element.setupResourceLoadedListener()

		expect(onImageResourceWillClose).toHaveBeenCalledWith(
			"./images/a.png",
			expect.any(Function),
		)
		expect(onImageResourceLoadFailed).toHaveBeenCalledWith(
			"./images/a.png",
			expect.any(Function),
		)
		expect(element.resourceSubscriptionCleanups).toHaveLength(2)
	})

	it("exposes an image generation request while submission is pending", async () => {
		const deferred = createDeferred()
		const generateImage = vi.fn(() => deferred.promise)
		const update = vi.fn()
		type TestImageData = {
			id: string
			type: typeof ElementTypeEnum.Image
			width: number
			height: number
			generateImageRequest?: GenerateImageRequest
		}
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			data: TestImageData
			isGenerating: boolean
			isErrorState: boolean
			isRetryEditing: boolean
			canvas: {
				magicConfigManager: { config: { methods: { generateImage: typeof generateImage } } }
				elementManager: {
					update: typeof update
					getElementData: () => TestImageData
				}
				eventEmitter: { emit: ReturnType<typeof vi.fn> }
			}
			pollingManager: { start: ReturnType<typeof vi.fn> }
			updateImageElementNames: ReturnType<typeof vi.fn>
			createOssSrcPromise: ReturnType<typeof vi.fn>
			clearTempGenerateImageRequestPrompt: ReturnType<typeof vi.fn>
			rerender: ReturnType<typeof vi.fn>
		}
		element.data = {
			id: "image-1",
			type: ElementTypeEnum.Image,
			width: 100,
			height: 100,
		}
		element.isGenerating = false
		element.isErrorState = false
		element.isRetryEditing = false
		update.mockImplementation((_id, updates) => {
			element.data = { ...element.data, ...updates }
		})
		element.canvas = {
			magicConfigManager: { config: { methods: { generateImage } } },
			elementManager: {
				update,
				getElementData: () => element.data,
			},
			eventEmitter: { emit: vi.fn() },
		}
		element.pollingManager = { start: vi.fn() }
		element.updateImageElementNames = vi.fn()
		element.createOssSrcPromise = vi.fn()
		element.clearTempGenerateImageRequestPrompt = vi.fn()
		element.rerender = vi.fn()

		const resultPromise = element.generateImage({
			model_id: "image-model",
			prompt: "A product photo",
		})
		await Promise.resolve()

		expect(element.data.generateImageRequest).toEqual(
			expect.objectContaining({
				model_id: "image-model",
				prompt: "A product photo",
				image_id: expect.any(String),
			}),
		)
		expect(update).toHaveBeenNthCalledWith(
			1,
			"image-1",
			expect.objectContaining({ generateImageRequest: element.data.generateImageRequest }),
			{ mode: "data-only", silent: true },
		)
		expect(element.rerender).toHaveBeenCalledTimes(1)

		deferred.resolve()
		await expect(resultPromise).resolves.toBe(true)
		expect(update).toHaveBeenNthCalledWith(
			2,
			"image-1",
			expect.objectContaining({ generateImageRequest: element.data.generateImageRequest }),
			{ silent: false },
		)
	})

	it("exposes a video generation request while submission is pending", async () => {
		const deferred = createDeferred()
		const generateVideo = vi.fn(() => deferred.promise)
		const update = vi.fn()
		type TestVideoData = {
			id: string
			type: typeof ElementTypeEnum.Video
			width: number
			height: number
			generateVideoRequest?: GenerateVideoRequest
		}
		const element = Object.create(VideoElement.prototype) as VideoElement & {
			data: TestVideoData
			isGenerating: boolean
			isErrorState: boolean
			isRetryEditing: boolean
			canvas: {
				magicConfigManager: { config: { methods: { generateVideo: typeof generateVideo } } }
				elementManager: {
					update: typeof update
					getElementData: () => TestVideoData
				}
				eventEmitter: { emit: ReturnType<typeof vi.fn> }
			}
			pollingManager: { start: ReturnType<typeof vi.fn> }
			clearTempGenerateVideoRequest: ReturnType<typeof vi.fn>
			rerender: ReturnType<typeof vi.fn>
		}
		element.data = {
			id: "video-1",
			type: ElementTypeEnum.Video,
			width: 100,
			height: 100,
		}
		element.isGenerating = false
		element.isErrorState = false
		element.isRetryEditing = false
		update.mockImplementation((_id, updates) => {
			element.data = { ...element.data, ...updates }
		})
		element.canvas = {
			magicConfigManager: { config: { methods: { generateVideo } } },
			elementManager: {
				update,
				getElementData: () => element.data,
			},
			eventEmitter: { emit: vi.fn() },
		}
		element.pollingManager = { start: vi.fn() }
		element.clearTempGenerateVideoRequest = vi.fn()
		element.rerender = vi.fn()

		const resultPromise = element.generateVideo({
			model_id: "video-model",
			prompt: "A product video",
		})
		await Promise.resolve()

		expect(element.data.generateVideoRequest).toEqual(
			expect.objectContaining({
				model_id: "video-model",
				prompt: "A product video",
				video_id: expect.any(String),
			}),
		)
		expect(update).toHaveBeenNthCalledWith(
			1,
			"video-1",
			expect.objectContaining({ generateVideoRequest: element.data.generateVideoRequest }),
			{ mode: "data-only", silent: true },
		)
		expect(element.rerender).toHaveBeenCalledTimes(1)

		deferred.resolve()
		await expect(resultPromise).resolves.toBe(true)
		expect(update).toHaveBeenNthCalledWith(
			2,
			"video-1",
			expect.objectContaining({ generateVideoRequest: element.data.generateVideoRequest }),
			{ silent: false },
		)
	})
})
