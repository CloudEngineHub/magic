import { afterEach, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import { exportCanvasDocument } from "../../../document/exportDocument"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import { TransformBehavior } from "../../../interaction/transform/TransformManager"
import { ElementFactory } from "../../core/ElementFactory"
import { AUDIO_CONFIG } from "../../audio/AudioElement.config"
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

	it("uses the audio card dimensions and square corners", () => {
		expect(VIDEO_EDIT_CONFIG.DEFAULT_WIDTH).toBe(AUDIO_CONFIG.DEFAULT_WIDTH)
		expect(VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT).toBe(AUDIO_CONFIG.DEFAULT_HEIGHT)
		expect(VIDEO_EDIT_CONFIG.CORNER_RADIUS).toBe(0)
	})

	it("creates a stable base DSL and factory instance", () => {
		const data = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 10,
			y: 20,
			videoSequence: ["video-s01", "video-s02"],
			audioSequence: ["audio-1"],
			output: { aspectRatio: "9:16", resolution: "1K", format: "mp4" },
		})

		expect(data).toMatchObject({
			id: "video-edit-1",
			type: ElementTypeEnum.VideoEdit,
			contents: [
				{
					videoSequence: ["video-s01", "video-s02"],
					audioSequence: ["audio-1"],
				},
			],
			width: VIDEO_EDIT_CONFIG.DEFAULT_WIDTH,
			height: VIDEO_EDIT_CONFIG.DEFAULT_HEIGHT,
		})
		expect(ElementFactory.create(data, createCanvasMock())).toBeInstanceOf(VideoEditElement)
	})

	it("keeps the node fixed-size and exports ordered inputs as a deep clone", () => {
		const source = VideoEditElement.createElementData({
			id: "video-edit-1",
			x: 0,
			y: 0,
			videoSequence: ["video-s02", "video-s01"],
			audioSequence: ["audio-1"],
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
		expect(exportedContent?.videoSequence).not.toBe(sourceContent?.videoSequence)
		expect(exportedContent?.audioSequence).not.toBe(sourceContent?.audioSequence)
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
				videoSequence: [video.id],
				audioSequence: [audio.id],
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
			videoSequence: videos.map((video) => video.id),
			audioSequence: [audio.id],
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

	it("persists card drag order and delegates audio preview to the existing manager", () => {
		mockCanvasRenderingContext()
		const videos = [
			createVideoSource("video-1", "开场", "./videos/1.mp4"),
			createVideoSource("video-2", "介绍", "./videos/2.mp4"),
			createVideoSource("video-3", "收尾", "./videos/3.mp4"),
		]
		const audio = createAudioSource("audio-1", "./audios/旁白_V2.wav")
		const update = vi.fn()
		const toggleAudio = vi.fn(async () => true)
		const bindControl = vi.fn(() => vi.fn())
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
				videoSequence: videos.map((video) => video.id),
				audioSequence: [audio.id],
			}),
			createCanvasMock([...videos, audio], { update, toggleAudio, bindControl }),
		)
		const node = element.render()
		const cards = node.find(".video-edit-video-card")
		const firstCard = cards[0]
		const thirdCard = cards[2]
		if (!(firstCard instanceof Konva.Group) || !(thirdCard instanceof Konva.Group)) {
			throw new Error("Expected draggable video cards")
		}
		firstCard.fire("dragstart")
		firstCard.x(thirdCard.x())
		firstCard.fire("dragend")

		expect(update).toHaveBeenCalledWith(
			"video-edit-1",
			expect.objectContaining({
				contents: [
					expect.objectContaining({
						videoSequence: ["video-2", "video-3", "video-1"],
					}),
				],
			}),
			{ silent: false },
		)

		expect(node.findOne(".video-edit-audio-play-button")).toBeTruthy()
		expect(
			bindControl.mock.calls.some(
				(call) => call[0]?.action?.type === "toggle-audio-playback",
			),
		).toBe(true)
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
				videoSequence: [video.id],
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

	it("starts composition with canonical output and uses cancel while encoding", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const bindControl = vi.fn(() => vi.fn())
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
				videoSequence: [video.id],
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
				action: { type: "merge-videos", disabled: false },
			}),
		)

		;(element as unknown as { compositionSnapshot: unknown }).compositionSnapshot = {
			status: "encoding",
			progress: 0.45,
			phase: "video",
			issues: [],
		}
		node = element.render()
		expect(node.findOne(".video-edit-video-card")?.getAttr("draggable")).toBe(false)
		expect(node.findOne(".video-edit-merge-button")?.findOne("Text")?.getAttr("text")).toBe(
			"取消",
		)
		const cancelBinding = bindControl.mock.calls
			.reverse()
			.find((call) => call[0]?.action?.type === "merge-videos")
		expect(cancelBinding?.[0]?.action).toEqual({ type: "merge-videos", disabled: false })
	})

	it("does not rerender recursively when composition subscription emits its initial snapshot", () => {
		mockCanvasRenderingContext()
		const video = createVideoSource("video-1", "开场", "./videos/1.mp4")
		const subscribeComposition = vi.fn(
			(
				_elementId: string,
				listener: (snapshot: { status: "idle"; progress: number; issues: never[] }) => void,
			) => {
				listener({ status: "idle", progress: 0, issues: [] })
				return vi.fn()
			},
		)
		const canvas = createCanvasMock([video], { subscribeComposition })
		const element = new VideoEditElement(
			VideoEditElement.createElementData({
				id: "video-edit-1",
				x: 0,
				y: 0,
				videoSequence: [video.id],
			}),
			canvas,
		)
		const node = element.render()

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
				videoSequence: [video.id],
				audioSequence: [audio.id],
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
				videoSequence: [video.id],
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
