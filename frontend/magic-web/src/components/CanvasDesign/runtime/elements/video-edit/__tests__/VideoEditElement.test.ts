import { afterEach, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import type { Canvas } from "../../../core/Canvas"
import { exportCanvasDocument } from "../../../document/exportDocument"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import { TransformBehavior } from "../../../interaction/transform/TransformManager"
import { ElementFactory } from "../../core/ElementFactory"
import { EventEmitter } from "../../../core/EventEmitter"
import { VIDEO_EDIT_CONFIG } from "../VideoEditElement.config"
import { VideoEditElement } from "../VideoEditElement"

function createCanvasMock(
	sourceElements: LayerElement[] = [],
	options?: {
		update?: ReturnType<typeof vi.fn>
		toggleAudio?: ReturnType<typeof vi.fn>
		startComposition?: ReturnType<typeof vi.fn>
		cancelComposition?: ReturnType<typeof vi.fn>
		subscribeComposition?: ReturnType<typeof vi.fn>
		getPreviewResource?: ReturnType<typeof vi.fn>
		bindControl?: ReturnType<typeof vi.fn>
	},
) {
	const elements = new Map(sourceElements.map((element) => [element.id, element]))
	const connectionSources = sourceElements
	const bindControl = options?.bindControl ?? vi.fn(() => vi.fn())
	return {
		deviceInfo: {
			formFactor: "desktop",
			input: { touch: false, coarsePointer: false, hover: true },
		},
		eventEmitter: {
			on: vi.fn(() => vi.fn()),
		},
		elementManager: {
			canDragElement: vi.fn(() => true),
			canListenElement: vi.fn(() => true),
			getElementData: vi.fn((elementId: string) => elements.get(elementId)),
			update: options?.update ?? vi.fn(),
		},
		connectionManager: {
			getUpstreamConnections: vi.fn((targetElementId: string) =>
				targetElementId.startsWith("video-edit")
					? connectionSources.map((element) => ({
							id: `connection-${element.id}`,
							sourceElementId: element.id,
							targetElementId,
						}))
					: [],
			),
		},
		videoEditInteractionManager: {
			bindControl,
			refreshOutputControlStates: vi.fn(),
		},
		audioPlaybackManager: {
			toggle: options?.toggleAudio ?? vi.fn(async () => true),
		},
		videoCompositionManager: {
			start: options?.startComposition ?? vi.fn(async () => true),
			cancel: options?.cancelComposition ?? vi.fn(),
			subscribe: options?.subscribeComposition,
		},
		videoResourceManager: {
			getPreviewResource: options?.getPreviewResource,
			needsResourceReload: vi.fn(() => false),
			getCachedMetadata: vi.fn(() => null),
		},
		transformManager: {
			isTransformInteractionActive: vi.fn(() => false),
			isTransforming: vi.fn(() => false),
		},
	} as never
}

function mockCanvasRenderingContext(): void {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		clearRect: vi.fn(),
		fillRect: vi.fn(),
		getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
		measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
	} as unknown as CanvasRenderingContext2D)
}

function createVideoSource(id: string, name: string, src: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Video,
		x: 0,
		y: 0,
		width: 1280,
		height: 720,
		zIndex: 0,
		name,
		activeContentId: `${id}-content-1`,
		mainContentId: `${id}-content-1`,
		contents: [{ contentId: `${id}-content-1`, src }],
	} as LayerElement
}

function createAudioSource(id: string, src: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Audio,
		x: 0,
		y: 0,
		width: 1280,
		height: 720,
		zIndex: 0,
		activeContentId: `${id}-content-1`,
		mainContentId: `${id}-content-1`,
		contents: [{ contentId: `${id}-content-1`, src }],
	} as LayerElement
}

describe("VideoEditElement", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("uses independent enlarged card dimensions and square corners", () => {
		expect(VIDEO_EDIT_CONFIG.DEFAULT_WIDTH).toBe(1920)
		expect(VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT).toBe(1080)
		expect(VIDEO_EDIT_CONFIG.CORNER_RADIUS).toBe(0)
	})

	it("creates a stable base DSL and factory instance", () => {
		const data = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 10,
			y: 20,
			output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
		})

		expect(data).toMatchObject({
			id: "video-edit-1",
			type: ElementTypeEnum.VideoEdit,
			name: "视频合并",
			contents: [
				{
					output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
				},
			],
			width: VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
		})
		expect(ElementFactory.create(data, createCanvasMock())).toBeInstanceOf(VideoEditElement)
	})

	it("keeps the node fixed-size and exports output settings as a deep clone", () => {
		const source = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 0,
			y: 0,
			output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
		})
		const element = ElementFactory.create(source, createCanvasMock())

		expect(element?.getTransformBehavior()).toBe(TransformBehavior.APPLY_TO_SIZE)
		expect(element?.supportsSizeEditing()).toBe(false)

		const [exported] = exportCanvasDocument([source]).elements ?? []
		expect(exported).toEqual(source)
		expect(exported).not.toBe(source)
		if (exported?.type !== ElementTypeEnum.VideoEdit) {
			throw new Error("Expected video edit element")
		}
		const exportedContent = exported.contents[0]
		const sourceContent = source.contents[0]
		expect(exportedContent?.output).not.toBe(sourceContent?.output)
	})

	it("keeps transformer bounds on the card hit-area after control hits expand", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const audio = createAudioSource("audio-1", "./audios/旁白_V2.wav")
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-bounds",
				x: 0,
				y: 0,
			}),
			createCanvasMock([video, audio]),
		)
		const root = new Konva.Group()
		const viewport = new Konva.Group({ x: 40, y: 20, scaleX: 0.4, scaleY: 0.4 })
		const group = element.render()
		root.add(viewport)
		viewport.add(group)
		element.onMounted()

		const hitArea = group.findOne(".hit-area") as Konva.Rect
		expect(group.getClientRect({ relativeTo: root, skipStroke: true })).toEqual(
			hitArea.getClientRect({ relativeTo: root, skipStroke: true }),
		)
		expect(group.getClientRect({ relativeTo: root }).width).toBeCloseTo(
			VIDEO_EDIT_CONFIG.DEFAULT_WIDTH * 0.4,
		)
		expect(group.getClientRect({ relativeTo: root }).height).toBeCloseTo(
			VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT * 0.4,
		)
	})

	it("renders the responsive video track and one compact audio row without a header", () => {
		mockCanvasRenderingContext()
		const videos = Array.from({ length: 8 }, (_, index) =>
			createVideoSource(
				`video-${index + 1}`,
				`视频 ${index + 1}`,
				`./videos/${index + 1}.mp4`,
			),
		)
		const audio = createAudioSource("audio-1", "./audios/旁白_V2.wav")
		const data = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 0,
			y: 0,
			output: { aspectRatio: "9:16", resolution: "1080P", format: "mp4" },
		})
		const element = new VideoEditElement(data, createCanvasMock([...videos, audio]))
		const node = element.render()

		expect(node.findOne(".video-edit-title")).toBeUndefined()
		expect(node.findOne(".video-edit-video-title")?.getAttr("text")).toBe("使用视频")
		expect(node.find(".video-edit-video-card")).toHaveLength(8)
		expect(node.findOne(".video-edit-audio-name")?.getAttr("text")).toBe("旁白_V2.wav")
		expect(node.findOne(".video-edit-audio-row")).toBeDefined()
		expect(node.findOne(".video-edit-audio-progress-track")).toBeDefined()
		expect(node.findOne(".video-edit-audio-progress-fill")).toBeDefined()
		expect(node.findOne(".video-edit-audio-progress-thumb")).toBeDefined()
		expect(node.findOne(".video-edit-audio-progress-hit")).toBeDefined()
		expect(node.findOne(".video-edit-audio-duration")?.getAttr("text")).toBe("0:00 / 0:00")
		expect(node.findOne(".video-edit-audio-waveform")).toBeUndefined()
		expect(node.findOne(".video-edit-merge-button")).toBeDefined()

		const playButton = node.findOne(".video-edit-audio-play-button") as Konva.Group
		const track = node.findOne(".video-edit-audio-progress-track") as Konva.Rect
		const thumb = node.findOne(".video-edit-audio-progress-thumb") as Konva.Circle
		const duration = node.findOne(".video-edit-audio-duration") as Konva.Text
		const playRight =
			(playButton.findOne(".video-edit-control-background") as Konva.Circle).x() +
			(playButton.findOne(".video-edit-control-background") as Konva.Circle).radius()
		const gapLeft = thumb.x() - thumb.radius() - playRight
		const gapRight = duration.x() - (track.x() + track.width() + thumb.radius())
		expect(gapLeft).toBeCloseTo(gapRight)
		expect(gapLeft).toBeGreaterThan(0)
		expect(node.find("Text").some((text) => text.getAttr("text")?.includes("48kHz"))).toBe(
			false,
		)
	})

	it("uses connected inputs and delegates audio preview to the existing manager", () => {
		mockCanvasRenderingContext()
		const videos = [
			createVideoSource("video-1", "开场", "./videos/1.mp4"),
			createVideoSource("video-2", "介绍", "./videos/2.mp4"),
			createVideoSource("video-3", "收尾", "./videos/3.mp4"),
		]
		const audio = createAudioSource("audio-1", "./audios/旁白_V2.wav")
		const toggleAudio = vi.fn(async () => true)
		const bindControl = vi.fn(() => vi.fn())
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
			}),
			createCanvasMock([...videos, audio], { toggleAudio, bindControl }),
		)
		const node = element.render()
		expect(node.find(".video-edit-video-card")).toHaveLength(3)
		expect(node.findOne(".video-edit-audio-play-button")).toBeTruthy()
		expect(
			bindControl.mock.calls.some(
				(call) => call[0]?.action?.type === "toggle-audio-playback",
			),
		).toBe(true)
	})

	it("restores video card hover grip and handle-only drag affordance", () => {
		mockCanvasRenderingContext()
		const videos = [
			createVideoSource("video-1", "开场", "./videos/1.mp4"),
			createVideoSource("video-2", "介绍", "./videos/2.mp4"),
		]
		const element = new VideoEditElement(
			VideoEditElement.createElementData({ id: "video-edit-1", x: 0, y: 0 }),
			createCanvasMock(videos),
		)
		const node = element.render()
		const card = node.findOne(".video-edit-video-card") as Konva.Group
		const grip = card.findOne(".video-edit-video-card-grip") as Konva.Group
		const handle = card.findOne(".video-edit-video-card-drag-handle") as Konva.Rect

		expect(grip.visible()).toBe(false)
		expect(handle.listening()).toBe(false)
		card.fire("mouseenter")
		expect(grip.visible()).toBe(true)
		expect(handle.listening()).toBe(true)
		card.fire("mouseleave")
		expect(grip.visible()).toBe(false)
		expect(handle.listening()).toBe(false)
	})

	it("refreshes derived inputs after source deletion and document restore", () => {
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const audio = createAudioSource("audio-1", "./audios/旁白.wav")
		const eventEmitter = new EventEmitter()
		let connectedSources: LayerElement[] = [video, audio]
		const canvas = createCanvasMock([video, audio]) as unknown as Canvas
		canvas.eventEmitter = eventEmitter
		canvas.connectionManager.getUpstreamConnections = vi.fn((targetElementId: string) =>
			targetElementId === "video-edit-1"
				? connectedSources.map((source) => ({
						id: `connection-${source.id}`,
						sourceElementId: source.id,
						targetElementId,
					}))
				: [],
		)
		const element = new VideoEditElement(
			VideoEditElement.createElementData({ id: "video-edit-1", x: 0, y: 0 }),
			canvas,
		)
		element.render()
		element.onMounted()
		element.rerenderWhenTransformIdle = vi.fn()

		connectedSources = [audio]
		eventEmitter.emit({ type: "element:deleted", data: { elementId: video.id } })
		eventEmitter.emit({ type: "document:restored", data: undefined })

		expect(element.rerenderWhenTransformIdle).toHaveBeenCalledTimes(2)
	})

	it("renders footer output controls as storyboard-style parameter rows", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const bindControl = vi.fn(() => vi.fn())
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
				output: { aspectRatio: "16:9", resolution: "1080P", format: "mp4" },
			}),
			createCanvasMock([video], { bindControl }),
		)
		const node = element.render()
		element.onMounted()

		expect(
			node
				.findOne(".video-edit-footer-aspect-ratio")
				?.findOne(".video-edit-control-text")
				?.getAttr("text"),
		).toBe("16:9")
		expect(
			node
				.findOne(".video-edit-footer-resolution")
				?.findOne(".video-edit-control-text")
				?.getAttr("text"),
		).toBe("1080P")
		expect(
			node
				.findOne(".video-edit-footer-format")
				?.findOne(".video-edit-control-text")
				?.getAttr("text"),
		).toBe("MP4")
		expect(node.find(".video-edit-control-hit")).toHaveLength(4)
		expect(bindControl).toHaveBeenCalledTimes(4)
	})

	it("renders read-only output settings without edit or reorder affordances", () => {
		mockCanvasRenderingContext()
		const videos = [
			createVideoSource("video-1", "开场", "./videos/1.mp4"),
			createVideoSource("video-2", "介绍", "./videos/2.mp4"),
		]
		const audio = createAudioSource("audio-1", "./audios/旁白.wav")
		const eventEmitter = new EventEmitter()
		const canvas = createCanvasMock([...videos, audio]) as unknown as Canvas
		canvas.readonly = true
		canvas.eventEmitter = eventEmitter
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-readonly",
				x: 0,
				y: 0,
				output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
			}),
			canvas,
		)

		const node = element.render()
		const controlHits = node.find(".video-edit-control-hit")
		const controlActions = controlHits.map(
			(hit) => hit.getAttr("videoEditControlMetadata")?.action,
		)

		expect(node.findOne(".video-edit-merge-button")).toBeUndefined()
		expect(node.find(".video-edit-control-suffix")).toHaveLength(0)
		expect(node.findOne(".video-edit-video-card-grip")).toBeUndefined()
		expect(node.findOne(".video-edit-video-card-drag-handle")).toBeUndefined()
		expect(node.findOne(".video-edit-video-drop-placeholder")).toBeUndefined()
		expect(controlActions).toEqual([{ type: "toggle-audio-playback" }])
		expect(node.findOne(".video-edit-audio-progress-hit")?.listening()).toBe(true)
		expect(node.findOne(".video-edit-audio-progress-thumb-hit")?.listening()).toBe(true)
		expect(node.findOne(".video-edit-video-viewport")?.listening()).toBe(true)
		expect(node.find(".video-edit-video-card")).toHaveLength(2)
		expect(node.size()).toEqual({
			width: VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
		})
	})

	it("rerenders video edit controls when readonly changes at runtime", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const audio = createAudioSource("audio-1", "./audios/旁白.wav")
		const eventEmitter = new EventEmitter()
		const canvas = createCanvasMock([video, audio]) as unknown as Canvas
		canvas.eventEmitter = eventEmitter
		const element = new VideoEditElement(
			VideoEditElement.createElementData({ id: "video-edit-toggle", x: 0, y: 0 }),
			canvas,
		)
		element.render()
		element.onMounted()
		expect(element.getNode()?.findOne(".video-edit-merge-button")).toBeDefined()
		expect(element.getNode()?.find(".video-edit-control-suffix")).toHaveLength(3)

		canvas.readonly = true
		eventEmitter.emit({ type: "canvas:readonly", data: { readonly: true } })
		expect(element.getNode()?.findOne(".video-edit-merge-button")).toBeUndefined()
		expect(element.getNode()?.find(".video-edit-control-suffix")).toHaveLength(0)
		expect(element.getNode()?.findOne(".video-edit-video-card-grip")).toBeUndefined()
		expect(element.getNode()?.findOne(".video-edit-audio-play-button")).toBeDefined()

		canvas.readonly = false
		eventEmitter.emit({ type: "canvas:readonly", data: { readonly: false } })
		expect(element.getNode()?.findOne(".video-edit-merge-button")).toBeDefined()
		expect(element.getNode()?.find(".video-edit-control-suffix")).toHaveLength(3)
		expect(element.getNode()?.findOne(".video-edit-video-card-grip")).toBeDefined()
		element.destroy()
		expect(eventEmitter.listenerCount("canvas:readonly")).toBe(0)
	})

	it("keeps the merge label and disables composition while a job is running", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const bindControl = vi.fn(() => vi.fn())
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
				output: { resolution: "1K", format: "webm" },
			}),
			createCanvasMock([video], { bindControl }),
		)
		let node = element.render()
		const mergeBinding = bindControl.mock.calls.find(
			(call) => call[0]?.action?.type === "merge-videos",
		)
		expect(mergeBinding?.[0]).toEqual(
			expect.objectContaining({
				elementId: "video-edit-1",
				action: { type: "merge-videos", disabled: true },
			}),
		)

		;(element as unknown as { compositionSnapshot: unknown }).compositionSnapshot = {
			status: "encoding",
			progress: 0.45,
			phase: "video",
			outputCapability: "supported",
			issues: [],
		}
		node = element.render()
		expect(node.findOne(".video-edit-video-card")?.getAttr("draggable")).toBe(false)
		expect(node.findOne(".video-edit-merge-button")?.findOne("Text")?.getAttr("text")).toBe(
			"合并视频",
		)
		const busyBinding = bindControl.mock.calls
			.reverse()
			.find((call) => call[0]?.action?.type === "merge-videos")
		expect(busyBinding?.[0]?.action).toEqual({ type: "merge-videos", disabled: true })
	})

	it("does not rerender recursively when composition subscription emits its initial snapshot", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const subscribeComposition = vi.fn(
			(
				_elementId: string,
				listener: (snapshot: {
					status: "idle"
					progress: number
					outputCapability: "idle"
					issues: never[]
				}) => void,
			) => {
				listener({ status: "idle", progress: 0, outputCapability: "idle", issues: [] })
				return vi.fn()
			},
		)
		const canvas = createCanvasMock([video], { subscribeComposition })
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
			}),
			canvas,
		)
		const node = element.render()

		;(element as unknown as { canvas: { transformManager: unknown } }).canvas.transformManager =
			{
				isTransformInteractionActive: vi.fn(() => false),
			}
		expect(() => element.onMounted()).not.toThrow()
		expect(subscribeComposition).toHaveBeenCalledTimes(1)
		expect(element.getNode()).toBe(node)
	})

	it("shows material errors on the matching video card and audio row", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const audio = createAudioSource("audio-1", "./audios/voice.wav")
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
			}),
			createCanvasMock([video, audio]),
		)
		;(element as unknown as { compositionSnapshot: unknown }).compositionSnapshot = {
			status: "error",
			progress: 0,
			issues: [
				{ code: "video-decode-unsupported", elementId: video.id, message: "视频无法解码" },
				{ code: "audio-decode-unsupported", elementId: audio.id, message: "音频无法解码" },
			],
		}
		const node = element.render()
		const texts = node.find("Text").map((text) => text.getAttr("text"))
		expect(texts).toContain("视频无法解码")
		expect(texts).toContain("音频无法解码")
	})

	it("replaces the video placeholder with the shared first-frame preview", async () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const poster = document.createElement("canvas")
		poster.width = 320
		poster.height = 180
		const getPreviewResource = vi.fn(async () => ({
			ossSrc: "https://media.test/1.mp4",
			poster,
			metadata: { duration: 1, videoWidth: 320, videoHeight: 180 },
		}))
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
			}),
			createCanvasMock([video], { getPreviewResource }),
		)
		element.rerenderWhenTransformIdle = vi.fn()
		element.render()
		await vi.waitFor(() => expect(getPreviewResource).toHaveBeenCalledOnce())
		await vi.waitFor(() => {
			expect(
				(
					element as unknown as { previewCanvases: Map<string, HTMLCanvasElement> }
				).previewCanvases.get(video.id),
			).toBe(poster)
		})

		const rerendered = element.render()
		expect(rerendered.findOne("Image")?.getAttr("image")).toBe(poster)
	})
})
