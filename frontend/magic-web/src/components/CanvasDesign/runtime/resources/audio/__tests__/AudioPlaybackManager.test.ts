import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import type { ResolveCanvasResourceReference } from "../../../../public/resource-reference"
import { AudioPlaybackManager } from "../AudioPlaybackManager"
import { CanvasResourceScheduler } from "../../scheduler/CanvasResourceScheduler"

class FakeAudioElement extends EventTarget {
	preload = ""
	src = ""
	duration = 60
	currentTime = 0
	paused = true
	ended = false
	readyState = 0
	error: MediaError | null = null
	load = vi.fn(() => {
		if (!this.src) return
		queueMicrotask(() => {
			this.readyState = HTMLMediaElement.HAVE_METADATA
			this.dispatchEvent(new Event("loadedmetadata"))
		})
	})
	play = vi.fn(async () => {
		this.paused = false
		this.dispatchEvent(new Event("play"))
	})
	pause = vi.fn(() => {
		this.paused = true
		this.dispatchEvent(new Event("pause"))
	})
	removeAttribute = vi.fn((name: string) => {
		if (name === "src") this.src = ""
	})
}

afterEach(() => {
	vi.useRealTimers()
	vi.restoreAllMocks()
})

describe("AudioPlaybackManager", () => {
	function createCanvas(
		audioResourceManager: Record<string, unknown>,
		resolveResourceReference?: ResolveCanvasResourceReference,
	) {
		return {
			audioResourceManager: {
				getFailureReason: vi.fn().mockReturnValue(null),
				resolveVirtualPlaybackFallback: vi.fn().mockResolvedValue(null),
				...audioResourceManager,
			},
			mediaPlaybackCoordinator: { preparePlayback: vi.fn() },
			mediaResourceOfflineCacheManager: {
				recordVirtualResourceLoadSuccess: vi.fn(),
			},
			resourceScheduler: new CanvasResourceScheduler(),
			eventEmitter: { emit: vi.fn() },
			magicConfigManager: {
				config: { methods: { resolveResourceReference } },
			},
			id: "canvas-1",
		} as unknown as Canvas
	}

	function createEquivalentAudioPathResolver(): ResolveCanvasResourceReference {
		return (input) => {
			const path = "path" in input ? input.path : "url" in input ? input.url : input.fileId
			if (path === "./audios/voice.mp3" || path === "/画布A/audios/voice.mp3") {
				return {
					status: "resolved",
					resourceKind: "workspace-file",
					rawReference: path,
					workspacePath: "/画布A/audios/voice.mp3",
					storagePath: "./audios/voice.mp3",
					identity: "workspace:/画布A/audios/voice.mp3",
					candidates: ["/画布A/audios/voice.mp3"],
					legacyRecovered: false,
					resolutionSource: "strict-path",
				}
			}
			return { status: "ambiguous", rawReference: path, candidates: [] }
		}
	}

	it("does not create a session after release cancels an in-flight resource lookup", async () => {
		let resolveResource!: (value: { ossSrc: string }) => void
		const resourcePromise = new Promise<{ ossSrc: string }>((resolve) => {
			resolveResource = resolve
		})
		const createElement = vi.spyOn(document, "createElement")
		const manager = new AudioPlaybackManager({
			canvas: createCanvas({ getResource: vi.fn(() => resourcePromise) }),
		})

		const pendingPrepare = manager.prepare("audio-1", "./audios/voice.mp3")
		manager.releaseAll()
		resolveResource({ ossSrc: "https://example.test/voice.mp3" })

		expect(await pendingPrepare).toBe(false)
		expect(createElement).not.toHaveBeenCalledWith("audio")
		expect(manager.getSnapshot("audio-1")).toMatchObject({
			paused: true,
			duration: 0,
		})
	})

	it("manages metadata sessions, playback coordination and release snapshots", async () => {
		const audio = new FakeAudioElement()
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (audio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		const canvas = createCanvas({
			getResource: vi.fn().mockResolvedValue({
				ossSrc: "https://example.test/voice.mp3",
			}),
		})
		const preparePlayback = canvas.mediaPlaybackCoordinator.preparePlayback as ReturnType<
			typeof vi.fn
		>
		const manager = new AudioPlaybackManager({ canvas })
		const snapshots: Array<{ paused: boolean; duration: number }> = []
		manager.subscribe("audio-1", (snapshot) => {
			snapshots.push({ paused: snapshot.paused, duration: snapshot.duration })
		})

		expect(await manager.prepare("audio-1", "./audios/voice.mp3")).toBe(true)
		expect(audio.preload).toBe("metadata")
		expect(audio.src).toBe("https://example.test/voice.mp3")
		expect(await manager.toggle("audio-1", "./audios/voice.mp3")).toBe(true)
		expect(preparePlayback).toHaveBeenCalledWith("audio-1")
		expect(audio.play).toHaveBeenCalledTimes(1)
		expect(snapshots.at(-1)).toEqual({ paused: false, duration: 60 })

		manager.release("audio-1")
		expect(audio.pause).toHaveBeenCalled()
		expect(audio.removeAttribute).toHaveBeenCalledWith("src")
		expect(manager.getSnapshot("audio-1")).toMatchObject({
			paused: true,
			duration: 0,
		})
	})

	it("refreshes the URL after a playback error", async () => {
		const audio = new FakeAudioElement()
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (audio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		const getResource = vi
			.fn()
			.mockResolvedValueOnce({ ossSrc: "https://example.test/expired.mp3" })
			.mockResolvedValueOnce({ ossSrc: "https://example.test/fresh.mp3" })
		const manager = new AudioPlaybackManager({
			canvas: createCanvas({ getResource }),
		})

		await manager.prepare("audio-1", "./audios/voice.mp3")
		audio.error = {} as MediaError
		audio.dispatchEvent(new Event("error"))

		await vi.waitFor(() => {
			expect(audio.src).toBe("https://example.test/fresh.mp3")
		})
		expect(getResource).toHaveBeenLastCalledWith(
			"./audios/voice.mp3",
			expect.objectContaining({
				forceRefresh: true,
				allowCachedFallback: false,
				priority: "critical",
			}),
		)
	})

	it("emits a retryable resource failure when metadata loading fails", async () => {
		const audio = new FakeAudioElement()
		audio.load = vi.fn(() => {
			if (!audio.src) return
			queueMicrotask(() => audio.dispatchEvent(new Event("error")))
		})
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (audio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		const canvas = createCanvas({
			getResource: vi.fn().mockResolvedValue({
				ossSrc: "https://example.test/voice.mp3",
			}),
		})
		const manager = new AudioPlaybackManager({ canvas })

		expect(
			await manager.prepare("audio-1", "./audios/voice.mp3", {
				source: "viewport",
				priority: "visible",
			}),
		).toBe(false)
		expect(canvas.eventEmitter.emit).toHaveBeenCalledTimes(1)
		expect(canvas.eventEmitter.emit).toHaveBeenCalledWith({
			type: "resource:audio:load-failed",
			data: { path: "./audios/voice.mp3", reason: "load-error" },
		})
	})

	it("ends a stalled viewport preload after the metadata timeout", async () => {
		vi.useFakeTimers()
		const audio = new FakeAudioElement()
		audio.load = vi.fn()
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (audio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		const canvas = createCanvas({
			getResource: vi.fn().mockResolvedValue({
				ossSrc: "https://example.test/voice.mp3",
			}),
		})
		const manager = new AudioPlaybackManager({ canvas })

		const pending = manager.prepare("audio-1", "./audios/voice.mp3", {
			source: "viewport",
			priority: "visible",
		})
		await Promise.resolve()
		await Promise.resolve()
		await vi.advanceTimersByTimeAsync(15_000)

		expect(await pending).toBe(false)
		expect(canvas.eventEmitter.emit).toHaveBeenCalledWith({
			type: "resource:audio:load-failed",
			data: { path: "./audios/voice.mp3", reason: "load-error" },
		})
	})

	it("cancels viewport metadata loading and clears the audio source", async () => {
		const audio = new FakeAudioElement()
		audio.load = vi.fn()
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (audio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		const manager = new AudioPlaybackManager({
			canvas: createCanvas({
				getResource: vi.fn().mockResolvedValue({
					ossSrc: "https://example.test/voice.mp3",
				}),
			}),
		})
		const controller = new AbortController()

		const pending = manager.prepare("audio-1", "./audios/voice.mp3", {
			source: "viewport",
			priority: "visible",
			signal: controller.signal,
		})
		await vi.waitFor(() => expect(audio.src).toBe("https://example.test/voice.mp3"))
		controller.abort()

		expect(await pending).toBe(false)
		expect(audio.removeAttribute).toHaveBeenCalledWith("src")
		expect(audio.src).toBe("")
	})

	it("promotes a pending viewport request to an interaction acquire", async () => {
		const audio = new FakeAudioElement()
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (audio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		let resolveViewportResource!: (value: { ossSrc: string }) => void
		const viewportResource = new Promise<{ ossSrc: string }>((resolve) => {
			resolveViewportResource = resolve
		})
		const getResource = vi
			.fn()
			.mockImplementationOnce(() => viewportResource)
			.mockResolvedValueOnce({ ossSrc: "https://example.test/voice.mp3" })
		const canvas = createCanvas({ getResource })
		const manager = new AudioPlaybackManager({ canvas })
		const viewportController = new AbortController()

		const viewportPrepare = manager.prepare("audio-1", "./audios/voice.mp3", {
			source: "viewport",
			priority: "visible",
			signal: viewportController.signal,
		})
		const interactionToggle = manager.toggle("audio-1", "./audios/voice.mp3")
		resolveViewportResource({ ossSrc: "https://example.test/stale.mp3" })
		viewportController.abort()

		expect(await viewportPrepare).toBe(false)
		expect(await interactionToggle).toBe(true)
		expect(getResource).toHaveBeenCalledTimes(2)
		expect(audio.play).toHaveBeenCalledTimes(1)
		expect(canvas.mediaPlaybackCoordinator.preparePlayback).toHaveBeenCalledWith("audio-1")
	})

	it("releases pending and ready sessions through an equivalent host resource path", async () => {
		const readyAudio = new FakeAudioElement()
		const originalCreateElement = document.createElement.bind(document)
		vi.spyOn(document, "createElement").mockImplementation(((tagName: string) =>
			tagName.toLowerCase() === "audio"
				? (readyAudio as unknown as HTMLAudioElement)
				: originalCreateElement(tagName)) as typeof document.createElement)
		const resolver = createEquivalentAudioPathResolver()
		const readyManager = new AudioPlaybackManager({
			canvas: createCanvas(
				{
					getResource: vi.fn().mockResolvedValue({
						ossSrc: "https://example.test/voice.mp3",
					}),
				},
				resolver,
			),
		})

		expect(await readyManager.prepare("audio-ready", "./audios/voice.mp3")).toBe(true)
		readyManager.releaseByPath("/画布A/audios/voice.mp3")
		expect(readyAudio.removeAttribute).toHaveBeenCalledWith("src")
		expect(readyManager.getSnapshot("audio-ready")).toMatchObject({ duration: 0, paused: true })

		let resolvePendingResource!: (value: { ossSrc: string }) => void
		const pendingResource = new Promise<{ ossSrc: string }>((resolve) => {
			resolvePendingResource = resolve
		})
		const pendingManager = new AudioPlaybackManager({
			canvas: createCanvas({ getResource: vi.fn(() => pendingResource) }, resolver),
		})
		const pendingPrepare = pendingManager.prepare("audio-pending", "./audios/voice.mp3")

		pendingManager.releaseByPath("/画布A/audios/voice.mp3")
		resolvePendingResource({ ossSrc: "https://example.test/voice.mp3" })

		expect(await pendingPrepare).toBe(false)
	})
})
