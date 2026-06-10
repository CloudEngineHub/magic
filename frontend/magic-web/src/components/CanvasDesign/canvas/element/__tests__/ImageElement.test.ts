import Konva from "konva"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ImageElement } from "../elements/ImageElement"
import { VideoElement } from "../elements/VideoElement"
import { GenerationStatus } from "../../../types.magic"

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
			syncMountedImageContentNodeWithLoadedResource: () => void
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

		element.syncMountedImageContentNodeWithLoadedResource()

		expect(imageNode.image()).toBe(newImage)
		expect(imageNode.width()).toBe(200)
		expect(imageNode.height()).toBe(120)
		expect(imageNode.crop()).toEqual({ x: 1, y: 2, width: 3, height: 4 })
	})

	it("labels temporary pasted image placeholders with retained info as uploading", () => {
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

	it("treats pasted video placeholders with retained info as uploading", () => {
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
		const infoButtonDecorator = { updateConfig: vi.fn() }
		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			backgroundNode: Konva.Image
			borderDecorator: typeof borderDecorator
			infoButtonDecorator: typeof infoButtonDecorator
			data: { id: string; width: number; height: number }
		}
		element.node = group
		element.backgroundNode = backgroundNode
		element.borderDecorator = borderDecorator
		element.infoButtonDecorator = infoButtonDecorator
		element.data = { id: "image-1", width: 100, height: 80 }

		element.onTransformResize(240, 160)

		expect(imageNode.width()).toBe(240)
		expect(imageNode.height()).toBe(160)
		expect(backgroundNode.width()).toBe(240)
		expect(backgroundNode.height()).toBe(160)
		expect(hitRect.width()).toBe(240)
		expect(hitRect.height()).toBe(160)
		expect(borderDecorator.updateSize).toHaveBeenCalledWith(240, 160)
		expect(infoButtonDecorator.updateConfig).toHaveBeenCalledWith({
			width: 240,
			height: 160,
		})
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
			thumbnail: { small: "" },
			variant: "preview" as const,
			sourceWidth: 100,
			sourceHeight: 80,
			isFullSize: false,
		}
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
			}
			getSourceCrop: () => { x: number; y: number; width: number; height: number }
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
		}
		element.getSourceCrop = vi.fn(() => ({ x: 0, y: 0, width: 100, height: 80 }))

		element.handleImageSourceWillClose(closingImage, "preview")

		expect(imageNode.image()).toBe(fallbackImage)
		expect(element.loadedImage).toBe(fallbackImage)
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

		element.handleImageSourceWillClose(closingImage, "preview")

		expect(element.loadedImage).toBeUndefined()
		expect(imageNode.getParent()).toBeNull()
	})

	it("keeps the mounted image when a display resource is released without a fallback", () => {
		const displayedImage = new Image()
		const imageNode = new Konva.Image({
			image: displayedImage,
			name: "image-content",
			width: 100,
			height: 80,
		})
		const group = new Konva.Group({ width: 100, height: 80 })
		group.add(imageNode)

		const element = Object.create(ImageElement.prototype) as ImageElement & {
			node: Konva.Group
			loadedImage?: HTMLImageElement
			loadedImageVariant: "preview"
			isResourceLoading: boolean
			isErrorState: boolean
			data: { id: string; src: string; width: number; height: number }
			canvas: {
				imageResourceManager: {
					peekResource: ReturnType<typeof vi.fn>
				}
			}
			handleDisplayResourceReleased: (variant: "preview", reason: string) => void
		}
		element.node = group
		element.loadedImage = displayedImage
		element.loadedImageVariant = "preview"
		element.isResourceLoading = false
		element.isErrorState = false
		element.data = { id: "image-1", src: "/image.png", width: 100, height: 80 }
		element.canvas = {
			imageResourceManager: {
				peekResource: vi.fn(() => null),
			},
		}

		element.handleDisplayResourceReleased("preview", "visibility:test")

		expect(element.loadedImage).toBe(displayedImage)
		expect(imageNode.getParent()).toBe(group)
		expect(element.isResourceLoading).toBe(true)
		expect(element.isErrorState).toBe(false)
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
			priority: "critical",
		})
		expect(emit).toHaveBeenCalledWith({
			type: "element:image:ossSrcReady",
			data: { elementId: "image-1" },
		})
		expect(rerenderWhenTransformIdle).toHaveBeenCalled()
	})
})
