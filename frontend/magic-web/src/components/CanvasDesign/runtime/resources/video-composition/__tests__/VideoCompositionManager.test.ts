import { beforeEach, describe, expect, it, vi } from "vitest"
import { Quality } from "mediabunny"
import { EventEmitter } from "../../../core/EventEmitter"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import {
	getVideoEditOutputDimensions,
	VideoCompositionManager,
	normalizeVideoEditOutput,
} from "../VideoCompositionManager"

interface MockTrack {
	kind: "video" | "audio"
	start: number
	end: number
	canDecode: ReturnType<typeof vi.fn>
	displayWidth?: number
	displayHeight?: number
	inputFps?: number
	buffers?: Array<{ timestamp: number; duration: number; buffer: AudioBuffer }>
}

interface MockMediaDefinition {
	canRead?: boolean | (() => Promise<boolean>)
	videoTrack?: MockTrack
	audioTrack?: MockTrack
}

const mediaMock = vi.hoisted(() => ({
	definitions: new Map<string, MockMediaDefinition>(),
	inputs: [] as Array<{ disposed: boolean }>,
	canvasSources: [] as Array<{
		canvas: HTMLCanvasElement
		adds: Array<[number, number | undefined]>
	}>,
	audioSources: [] as Array<{ adds: AudioBuffer[] }>,
	outputs: [] as Array<{ state: string; cancel: ReturnType<typeof vi.fn> }>,
	videoDrawFits: [] as Array<{ fit: string }>,
	canEncodeVideo: vi.fn(async () => true),
	canEncodeAudio: vi.fn(async () => true),
}))

vi.mock("mediabunny", () => {
	class UrlSource {
		constructor(readonly url: string) {}
	}

	class Input {
		readonly definition: MockMediaDefinition
		disposed = false

		constructor(options: { source: UrlSource }) {
			this.definition = mediaMock.definitions.get(options.source.url) ?? {}
			mediaMock.inputs.push(this)
		}

		async canRead() {
			const value = this.definition.canRead ?? true
			return typeof value === "function" ? value() : value
		}

		async getPrimaryVideoTrack() {
			return this.definition.videoTrack ?? null
		}

		async getPrimaryAudioTrack() {
			return this.definition.audioTrack ?? null
		}

		async getFirstTimestamp(tracks: MockTrack[]) {
			return tracks[0]?.start ?? 0
		}

		async computeDuration(tracks: MockTrack[]) {
			return tracks[0]?.end ?? 0
		}

		dispose() {
			this.disposed = true
		}
	}

	class VideoSampleSink {
		constructor(private readonly track: MockTrack) {}

		async *samplesAtTimestamps(timestamps: Iterable<number>) {
			for (const timestamp of timestamps) {
				yield {
					timestamp,
					drawWithFit: vi.fn((_context, options: { fit: string }) => {
						mediaMock.videoDrawFits.push(options)
					}),
					close: vi.fn(),
				}
			}
		}
	}

	class AudioBufferSink {
		constructor(private readonly track: MockTrack) {}

		async *buffers(start: number, end: number) {
			for (const wrapped of this.track.buffers ?? []) {
				if (wrapped.timestamp < end && wrapped.timestamp + wrapped.duration > start) {
					yield wrapped
				}
			}
		}
	}

	class CanvasSource {
		readonly adds: Array<[number, number | undefined]> = []

		constructor(readonly canvas: HTMLCanvasElement) {
			mediaMock.canvasSources.push(this)
		}

		async add(timestamp: number, duration?: number) {
			this.adds.push([timestamp, duration])
		}
	}

	class AudioBufferSource {
		readonly adds: AudioBuffer[] = []

		constructor() {
			mediaMock.audioSources.push(this)
		}

		async add(buffer: AudioBuffer) {
			this.adds.push(buffer)
		}
	}

	class BufferTarget {
		buffer: ArrayBuffer | null = null
	}

	class StreamTarget {
		constructor(readonly writable: WritableStream) {}
	}

	class Output {
		state = "pending"
		readonly cancel = vi.fn(async () => {
			this.state = "canceled"
		})

		constructor(private readonly options: { target: BufferTarget }) {
			mediaMock.outputs.push(this)
		}

		addVideoTrack() {}
		addAudioTrack() {}

		async start() {
			this.state = "started"
		}

		async finalize() {
			this.options.target.buffer = new Uint8Array([1, 2, 3]).buffer
			this.state = "finalized"
		}
	}

	class Mp4OutputFormat {}
	class Quality {}

	return {
		ALL_FORMATS: [],
		AudioBufferSink,
		AudioBufferSource,
		BufferTarget,
		CanvasSource,
		Input,
		Mp4OutputFormat,
		Output,
		Quality,
		StreamTarget,
		UrlSource,
		VideoSampleSink,
		canEncodeAudio: mediaMock.canEncodeAudio,
		canEncodeVideo: mediaMock.canEncodeVideo,
	}
})

vi.mock("sonner", () => ({
	toast: {
		error: vi.fn(),
		info: vi.fn(),
	},
}))

vi.mock("../../../elements/core/ElementFactory", () => ({
	ElementFactory: {
		createElementData: (
			type: string,
			id: string,
			x: number,
			y: number,
			width: number,
			height: number,
			zIndex: number,
		) => {
			const contentId = `${id}-content-1`
			return {
				id,
				type,
				x,
				y,
				width,
				height,
				zIndex,
				activeContentId: contentId,
				mainContentId: contentId,
				contents: [{ contentId }],
			}
		},
	},
}))

function deferred<T>() {
	let resolve!: (value: T) => void
	return {
		promise: new Promise<T>((promiseResolve) => {
			resolve = promiseResolve
		}),
		resolve,
	}
}

function createVideoTrack(options: {
	duration: number
	start?: number
	width?: number
	height?: number
	inputFps?: number
	canDecode?: boolean
}): MockTrack {
	return {
		kind: "video",
		start: options.start ?? 0,
		end: (options.start ?? 0) + options.duration,
		displayWidth: options.width ?? 1920,
		displayHeight: options.height ?? 1080,
		inputFps: options.inputFps,
		canDecode: vi.fn(async () => options.canDecode ?? true),
		getDisplayWidth: async () => options.width ?? 1920,
		getDisplayHeight: async () => options.height ?? 1080,
	} as MockTrack
}

function createAudioTrack(options: {
	duration: number
	start?: number
	canDecode?: boolean
	buffers?: MockTrack["buffers"]
}): MockTrack {
	return {
		kind: "audio",
		start: options.start ?? 0,
		end: (options.start ?? 0) + options.duration,
		canDecode: vi.fn(async () => options.canDecode ?? true),
		buffers: options.buffers,
	}
}

function createVideoElement(id: string, src: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Video,
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

function createAudioElement(id: string, src: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Audio,
		x: 0,
		y: 0,
		width: 1280,
		height: 120,
		zIndex: 0,
		activeContentId: `${id}-content-1`,
		mainContentId: `${id}-content-1`,
		contents: [{ contentId: `${id}-content-1`, src }],
	} as LayerElement
}

function createVideoEditElement(options: {
	videoIds: string[]
	audioIds?: string[]
	aspectRatio?: string
	resolution?: string
}): LayerElement {
	return {
		id: "video-edit-1",
		type: ElementTypeEnum.VideoEdit,
		x: 10,
		y: 20,
		width: 1280,
		height: 720,
		zIndex: 5,
		activeContentId: "video-edit-content-1",
		mainContentId: "video-edit-content-1",
		contents: [
			{
				contentId: "video-edit-content-1",
				output: {
					aspectRatio: options.aspectRatio,
					resolution: options.resolution,
					format: "mp4",
				},
			},
		],
	} as LayerElement
}

function createCanvas(
	elements: LayerElement[],
	options?: {
		uploadDirect?: ReturnType<typeof vi.fn>
	},
) {
	const eventEmitter = new EventEmitter()
	const elementMap = new Map(elements.map((element) => [element.id, element]))
	const created: LayerElement[] = []
	const deleted: string[] = []
	const temporaryIds = new Set<string>()
	const connections: Array<{ id: string; sourceElementId: string; targetElementId: string }> =
		elements
			.filter((element) => element.type !== ElementTypeEnum.VideoEdit)
			.map((element, index) => ({
				id: `input-${index + 1}`,
				sourceElementId: element.id,
				targetElementId: "video-edit-1",
			}))
	const editor = elements.find((element) => element.type === ElementTypeEnum.VideoEdit)
	if (editor) {
		elements
			.filter(
				(element) =>
					element.type === ElementTypeEnum.Video ||
					element.type === ElementTypeEnum.Audio,
			)
			.forEach((element) =>
				connections.push({ sourceElementId: element.id, targetElementId: editor.id }),
			)
	}
	const uploadDirect =
		options?.uploadDirect ??
		vi.fn(async () => [
			{
				path: "./videos/composed.mp4",
				src: "https://media.test/composed.mp4",
				fileName: "composed.mp4",
				source: 1,
				expires_at: Date.now() + 60_000,
				resource_version: "v1",
				updated_at: new Date().toISOString(),
				content_length: 3,
			},
		])
	const canvas = {
		eventEmitter,
		elementManager: {
			getElementData: vi.fn((id: string) => elementMap.get(id)),
			getAllElements: vi.fn(() => Array.from(elementMap.values())),
			getAllElementIds: vi.fn(() => Array.from(elementMap.keys())),
			isElementVisibleInDataTree: vi.fn(() => true),
			getNextZIndexInLevel: vi.fn(() => 9),
			create: vi.fn((element: LayerElement) => {
				created.push(element)
				elementMap.set(element.id, element)
			}),
			createTemporaryElement: vi.fn((element: LayerElement) => {
				created.push(element)
				elementMap.set(element.id, element)
				temporaryIds.add(element.id)
				return element.id
			}),
			convertToPermament: vi.fn((id: string, patch: Record<string, unknown>) => {
				const current = elementMap.get(id)
				if (!current) throw new Error(`Element ${id} not found`)
				Object.assign(current, patch)
				temporaryIds.delete(id)
			}),
			update: vi.fn((id: string, patch: Record<string, unknown>) => {
				const current = elementMap.get(id)
				if (!current) return
				Object.assign(current, patch)
			}),
			delete: vi.fn((id: string) => {
				deleted.push(id)
				elementMap.delete(id)
			}),
			isTemporary: vi.fn((id: string) => temporaryIds.has(id)),
			hasElement: vi.fn((id: string) => elementMap.has(id)),
		},
		connectionManager: {
			connectRuntimeElements: vi.fn(
				(edge: { sourceElementId: string; targetElementId: string }) => {
					const connectionId = `conn-${connections.length + 1}`
					connections.push({ id: connectionId, ...edge })
					return { status: "created", connectionId }
				},
			),
			promoteRuntimeConnection: vi.fn(() => true),
			removeConnections: vi.fn((connectionIds: string[]) => {
				for (const connectionId of connectionIds) {
					const index = connections.findIndex(
						(connection) => connection.id === connectionId,
					)
					if (index >= 0) connections.splice(index, 1)
				}
			}),
			connectElements: vi.fn((edge: { sourceElementId: string; targetElementId: string }) => {
				connections.push({ id: `conn-${connections.length + 1}`, ...edge })
				return { status: "created", connectionId: `conn-${connections.length}` }
			}),
			getConnections: vi.fn(() => connections),
			getDownstreamConnections: vi.fn((elementId: string) =>
				connections.filter((connection) => connection.sourceElementId === elementId),
			),
			getUpstreamConnections: vi.fn((elementId: string) =>
				connections.filter((connection) => connection.targetElementId === elementId),
			),
		},
		geometryCacheManager: {
			getElementBounds: vi.fn((id: string) => {
				const element = elementMap.get(id)
				if (!element?.width || !element?.height) return null
				return {
					x: element.x ?? 0,
					y: element.y ?? 0,
					width: element.width,
					height: element.height,
				}
			}),
		},
		historyManager: {
			runTransaction: vi.fn(
				(callback: () => unknown, shouldRecord?: (result: unknown) => boolean) => {
					const result = callback()
					shouldRecord?.(result)
					return result
				},
			),
		},
		videoResourceManager: {
			ensureFreshOssSrc: vi.fn(async (path: string) => path),
			primeCache: vi.fn(),
		},
		audioResourceManager: {
			getResource: vi.fn(async (path: string) => ({ ossSrc: path })),
		},
		canvasFileUploadManager: { uploadDirect },
		selectionManager: { select: vi.fn() },
		viewportController: {
			isElementInViewport: vi.fn(() => true),
			moveElementToViewport: vi.fn(),
		},
	}
	return {
		canvas: canvas as never,
		created,
		deleted,
		connections,
		elementMap,
		eventEmitter,
		uploadDirect,
	}
}

describe("VideoCompositionManager", () => {
	beforeEach(() => {
		mediaMock.definitions.clear()
		mediaMock.inputs.length = 0
		mediaMock.canvasSources.length = 0
		mediaMock.audioSources.length = 0
		mediaMock.outputs.length = 0
		mediaMock.videoDrawFits.length = 0
		mediaMock.canEncodeVideo.mockReset().mockResolvedValue(true)
		mediaMock.canEncodeAudio.mockReset().mockResolvedValue(true)
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			fillStyle: "#000000",
			fillRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D)
		Object.defineProperty(navigator, "storage", {
			configurable: true,
			value: undefined,
		})
	})

	it("normalizes legacy output values and derives the nearest default ratio", () => {
		expect(getVideoEditOutputDimensions("16:9", "1080P")).toEqual({
			width: 1920,
			height: 1080,
		})
		expect(getVideoEditOutputDimensions("4:5", "1080P")).toEqual({
			width: 1080,
			height: 1350,
		})
		expect(getVideoEditOutputDimensions("21:9", "480P")).toEqual({
			width: 1120,
			height: 480,
		})
		expect(
			normalizeVideoEditOutput(
				{ aspectRatio: "unknown", resolution: "1K", format: "webm" },
				{ displayWidth: 1080, displayHeight: 1920 },
			),
		).toEqual({
			aspectRatio: "9:16",
			resolution: "1080P",
			format: "mp4",
			width: 1080,
			height: 1920,
		})
		expect(normalizeVideoEditOutput({ aspectRatio: "1:1", resolution: "720P" })).toMatchObject({
			width: 720,
			height: 720,
			format: "mp4",
		})
		expect(normalizeVideoEditOutput({ aspectRatio: "4:5", resolution: "1440P" })).toMatchObject(
			{
				width: 1440,
				height: 1800,
				format: "mp4",
			},
		)
		expect(
			normalizeVideoEditOutput({ aspectRatio: "21:9", resolution: "2160P" }),
		).toMatchObject({
			width: 5040,
			height: 2160,
			format: "mp4",
		})
	})

	it("prechecks output capability with the final encoder configuration and ignores stale results", async () => {
		const capabilityGate = deferred<boolean>()
		mediaMock.canEncodeVideo.mockImplementationOnce(() => capabilityGate.promise)
		const video = createVideoElement("video-1", "./videos/one.mp4")
		const editor = createVideoEditElement({ videoIds: [video.id], resolution: "2160P" })
		const { canvas, elementMap } = createCanvas([editor, video])
		const manager = new VideoCompositionManager({ canvas })

		const firstCheck = manager.checkOutputCapability(editor.id)
		expect(manager.getSnapshot(editor.id).outputCapability).toBe("checking")
		expect(mediaMock.canEncodeVideo).toHaveBeenCalledWith("avc", {
			width: 3840,
			height: 2160,
			quality: expect.anything(),
		})

		const updated = JSON.parse(JSON.stringify(editor)) as typeof editor
		updated.contents[0]!.output = { aspectRatio: "9:16", resolution: "720P", format: "mp4" }
		elementMap.set(editor.id, updated)
		await expect(manager.checkOutputCapability(editor.id)).resolves.toBe(true)
		capabilityGate.resolve(false)
		await expect(firstCheck).resolves.toBe(false)
		expect(manager.getSnapshot(editor.id).outputCapability).toBe("supported")
	})

	it("keeps video order, downsamples 4K/60fps input to 1080P/30fps and creates the result element", async () => {
		const first = createVideoElement("video-1", "./videos/one.mp4")
		const second = createVideoElement("video-2", "./videos/two.mp4")
		const editor = createVideoEditElement({
			videoIds: [first.id, second.id],
			aspectRatio: "9:16",
			resolution: "1080P",
		})
		mediaMock.definitions.set("./videos/one.mp4", {
			videoTrack: createVideoTrack({
				duration: 1,
				start: 4,
				width: 3840,
				height: 2160,
				inputFps: 60,
			}),
		})
		mediaMock.definitions.set("./videos/two.mp4", {
			videoTrack: createVideoTrack({ duration: 0.5, width: 1920, height: 1080 }),
		})
		const { canvas, created, connections, uploadDirect } = createCanvas([editor, first, second])
		const manager = new VideoCompositionManager({ canvas })

		await expect(manager.start(editor.id)).resolves.toBe(true)
		expect(uploadDirect).toHaveBeenCalledWith(expect.any(Array), undefined, undefined, {
			overwrite: false,
		})

		const videoSource = mediaMock.canvasSources[0]
		expect(videoSource?.canvas.width).toBe(1080)
		expect(videoSource?.canvas.height).toBe(1920)
		expect(videoSource?.adds).toHaveLength(45)
		expect(videoSource?.adds[0]?.[0]).toBe(0)
		expect(videoSource?.adds[30]?.[0]).toBeCloseTo(1)
		expect(mediaMock.videoDrawFits).toHaveLength(45)
		expect(mediaMock.videoDrawFits).toEqual(
			Array.from({ length: 45 }, () => ({ fit: "contain" })),
		)
		const result = created[0]
		expect(result).toMatchObject({
			type: ElementTypeEnum.Video,
			x: 2314,
			y: 20,
			width: 405,
			height: 720,
			zIndex: 9,
			name: "合并视频",
			contents: [{ src: "./videos/composed.mp4", status: "completed" }],
		})
		expect(connections.at(-1)).toMatchObject({
			sourceElementId: editor.id,
			targetElementId: result?.id,
		})
		expect(manager.getSnapshot(editor.id)).toMatchObject({
			status: "completed",
			progress: 1,
			resultElementId: result?.id,
		})
	})

	it("maps video audio decode failures to the corresponding video card", async () => {
		const video = createVideoElement("video-1", "./videos/bad-audio.mp4")
		const editor = createVideoEditElement({ videoIds: [video.id] })
		mediaMock.definitions.set("./videos/bad-audio.mp4", {
			videoTrack: createVideoTrack({ duration: 1 }),
			audioTrack: createAudioTrack({ duration: 1, canDecode: false }),
		})
		const { canvas } = createCanvas([editor, video])
		const manager = new VideoCompositionManager({ canvas })

		await expect(manager.start(editor.id)).resolves.toBe(false)
		expect(manager.getSnapshot(editor.id)).toMatchObject({
			status: "error",
			issues: [{ code: "audio-decode-unsupported", elementId: video.id }],
		})
	})

	it("blocks duration and encoder capability failures before encoding", async () => {
		const video = createVideoElement("video-1", "./videos/long.mp4")
		const editor = createVideoEditElement({ videoIds: [video.id] })
		mediaMock.definitions.set("./videos/long.mp4", {
			videoTrack: createVideoTrack({ duration: 601 }),
		})
		const firstCanvas = createCanvas([editor, video])
		const firstManager = new VideoCompositionManager({ canvas: firstCanvas.canvas })

		await expect(firstManager.start(editor.id)).resolves.toBe(false)
		expect(firstManager.getSnapshot(editor.id).issues[0]?.code).toBe("duration-limit")

		mediaMock.definitions.set("./videos/long.mp4", {
			videoTrack: createVideoTrack({ duration: 1 }),
		})
		mediaMock.canEncodeVideo.mockResolvedValue(false)
		const secondCanvas = createCanvas([editor, video])
		const secondManager = new VideoCompositionManager({ canvas: secondCanvas.canvas })
		await expect(secondManager.start(editor.id)).resolves.toBe(false)
		expect(secondManager.getSnapshot(editor.id).issues[0]?.code).toBe(
			"video-encode-unsupported",
		)
	})

	it("rejects duplicate starts and cleans resources when cancelled", async () => {
		const gate = deferred<boolean>()
		const video = createVideoElement("video-1", "./videos/pending.mp4")
		const editor = createVideoEditElement({ videoIds: [video.id] })
		mediaMock.definitions.set("./videos/pending.mp4", {
			canRead: () => gate.promise,
			videoTrack: createVideoTrack({ duration: 1 }),
		})
		const { canvas, created, deleted } = createCanvas([editor, video])
		const manager = new VideoCompositionManager({ canvas })
		const firstStart = manager.start(editor.id)
		await vi.waitFor(() => expect(created).toHaveLength(1))

		await expect(manager.start(editor.id)).resolves.toBe(false)
		expect(created).toHaveLength(1)
		expect(manager.isComposingResult(created[0]!.id)).toBe(true)
		manager.cancel(editor.id)
		gate.resolve(true)
		await expect(firstStart).resolves.toBe(false)
		expect(manager.getSnapshot(editor.id).status).toBe("cancelled")
		expect(deleted).toEqual([created[0]!.id])
		expect(mediaMock.inputs.every((input) => input.disposed)).toBe(true)
	})

	it("drops an upload result when the input signature changes", async () => {
		const uploadGate = deferred<Array<Record<string, unknown>>>()
		const uploadDirect = vi.fn(() => uploadGate.promise)
		const video = createVideoElement("video-1", "./videos/original.mp4")
		const editor = createVideoEditElement({ videoIds: [video.id] })
		mediaMock.definitions.set("./videos/original.mp4", {
			videoTrack: createVideoTrack({ duration: 0.1 }),
		})
		const { canvas, created, deleted, eventEmitter, elementMap } = createCanvas(
			[editor, video],
			{
				uploadDirect,
			},
		)
		const manager = new VideoCompositionManager({ canvas })
		const start = manager.start(editor.id)
		await vi.waitFor(() => expect(manager.getSnapshot(editor.id).status).toBe("uploading"))

		const changedVideo = createVideoElement("video-1", "./videos/changed.mp4")
		elementMap.set(video.id, changedVideo)
		eventEmitter.emit({
			type: "element:updated",
			data: { elementId: video.id, data: changedVideo, previousData: video },
		})
		uploadGate.resolve([
			{
				path: "./videos/stale.mp4",
				src: "https://media.test/stale.mp4",
				fileName: "stale.mp4",
				source: 1,
				expires_at: Date.now() + 60_000,
				resource_version: "v1",
				updated_at: new Date().toISOString(),
				content_length: 3,
			},
		])

		await expect(start).resolves.toBe(false)
		expect(created).toHaveLength(1)
		expect(deleted).toEqual([created[0]!.id])
		expect(manager.getSnapshot(editor.id)).toMatchObject({
			status: "error",
			issues: [{ code: "stale-input" }],
		})
	})

	it("mixes video sound with one linked audio track in five-second chunks", async () => {
		const video = createVideoElement("video-1", "./videos/with-sound.mp4")
		const audio = createAudioElement("audio-1", "./audios/voice.wav")
		const editor = createVideoEditElement({ videoIds: [video.id], audioIds: [audio.id] })
		const fakeBuffer = {} as AudioBuffer
		mediaMock.definitions.set("./videos/with-sound.mp4", {
			videoTrack: createVideoTrack({ duration: 6 }),
			audioTrack: createAudioTrack({
				duration: 6,
				buffers: [{ timestamp: 0, duration: 6, buffer: fakeBuffer }],
			}),
		})
		mediaMock.definitions.set("./audios/voice.wav", {
			audioTrack: createAudioTrack({
				duration: 2,
				buffers: [{ timestamp: 0, duration: 2, buffer: fakeBuffer }],
			}),
		})
		const contextStarts: Array<Array<[number, number, number]>> = []
		class MockOfflineAudioContext {
			readonly destination = {}
			private readonly starts: Array<[number, number, number]> = []

			constructor(
				readonly numberOfChannels: number,
				readonly length: number,
				readonly sampleRate: number,
			) {
				contextStarts.push(this.starts)
			}

			createBufferSource() {
				return {
					buffer: null,
					connect: vi.fn(),
					start: (when: number, offset: number, duration: number) => {
						this.starts.push([when, offset, duration])
					},
				}
			}

			async startRendering() {
				return {} as AudioBuffer
			}
		}
		vi.stubGlobal("OfflineAudioContext", MockOfflineAudioContext)
		const { canvas } = createCanvas([editor, video, audio])
		const manager = new VideoCompositionManager({ canvas })

		await expect(manager.start(editor.id)).resolves.toBe(true)
		expect(mediaMock.audioSources[0]?.adds).toHaveLength(2)
		expect(contextStarts).toHaveLength(2)
		expect(contextStarts[0]).toHaveLength(2)
		expect(contextStarts[1]).toHaveLength(1)
	})
})
