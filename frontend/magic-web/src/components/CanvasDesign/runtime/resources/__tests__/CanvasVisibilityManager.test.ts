import { describe, expect, it, vi } from "vitest"
import { CanvasVisibilityManager } from "../visibility/CanvasVisibilityManager"
import type { ImageResourceLoadPriority, ImageResourceVariant } from "../image/ImageResourceManager"
import { ElementTypeEnum, type LayerElement } from "../../document/types"
import { createTestResourceReferenceResolver } from "../../../public/__tests__/testResourceReferenceResolver"

interface VideoCandidate {
	elementId: string
	path: string
	priority: ImageResourceLoadPriority
	tier: "url" | "poster"
	visibilityState: "visible" | "near" | "far"
	screenArea: number
	screenLongEdge: number
	distanceToViewportCenter: number
}

interface AudioCandidate {
	elementId: string
	path: string
	priority: ImageResourceLoadPriority
	tier: "url" | "preload"
	visibilityState: "visible" | "near" | "far"
	screenArea: number
	screenLongEdge: number
	distanceToViewportCenter: number
}

interface ImageCandidate {
	elementId: string
	path: string
	priority: ImageResourceLoadPriority
	variant: ImageResourceVariant
	visibilityState: "visible" | "near" | "far"
	screenArea: number
	screenLongEdge: number
	distanceToViewportCenter: number
}

function createCandidate(priority: ImageResourceLoadPriority): VideoCandidate {
	return {
		elementId: "video-1",
		path: "./videos/a.mp4",
		priority,
		tier: priority === "near" ? "url" : "poster",
		visibilityState: priority === "near" ? "near" : "visible",
		screenArea: 1000,
		screenLongEdge: 100,
		distanceToViewportCenter: 0,
	}
}

function createAudioCandidate(priority: "visible" | "near"): AudioCandidate {
	return {
		elementId: "audio-1",
		path: "./audios/a.mp3",
		priority,
		tier: priority === "near" ? "url" : "preload",
		visibilityState: priority === "near" ? "near" : "visible",
		screenArea: 1000,
		screenLongEdge: 100,
		distanceToViewportCenter: 0,
	}
}

function createImageCandidate(
	elementId: string,
	priority: ImageResourceLoadPriority = "visible",
): ImageCandidate {
	return {
		elementId,
		path: `./images/${elementId}.png`,
		priority,
		variant: priority === "near" ? "low" : "preview",
		visibilityState: priority === "near" ? "near" : "visible",
		screenArea: 1000,
		screenLongEdge: 100,
		distanceToViewportCenter: Number(elementId.replace(/\D/g, "")) || 0,
	}
}

type SelectImageCandidatesToLoad = (options: {
	pendingVisibleCandidates: ImageCandidate[]
	pendingLowDetailVisibleCandidates: ImageCandidate[]
	pendingNearCandidates: ImageCandidate[]
	reason: string
	shouldDeferNearLoads: boolean
}) => {
	visibleToLoad: ImageCandidate[]
	nearToLoad: ImageCandidate[]
	imageLoadRequestBudget: number | null
}

function createManager(requestPreviewLoad = vi.fn()) {
	const ensureFreshOssInfo = vi.fn()
	const manager = Object.create(CanvasVisibilityManager.prototype) as CanvasVisibilityManager & {
		canvas: {
			elementManager: {
				getElementInstance: () => { requestPreviewLoad: typeof requestPreviewLoad }
			}
			videoResourceManager: {
				ensureFreshOssInfo: typeof ensureFreshOssInfo
			}
		}
		lastRequestedVideoLoadState: Map<
			string,
			{
				priority: ImageResourceLoadPriority
				tier: "url" | "poster"
				requestedAt: number
			}
		>
		registeredVideos: Map<string, { elementId: string; path: string }>
		lastVideoVisibilityState: Map<string, string>
		scheduleRefresh: ReturnType<typeof vi.fn>
	}
	manager.canvas = {
		elementManager: {
			getElementInstance: () => ({ requestPreviewLoad }),
		},
		videoResourceManager: {
			ensureFreshOssInfo,
		},
	}
	manager.lastRequestedVideoLoadState = new Map()
	manager.registeredVideos = new Map()
	manager.lastVideoVisibilityState = new Map()
	manager.scheduleRefresh = vi.fn()
	return { ensureFreshOssInfo, manager, requestPreviewLoad }
}

function createConstructedManager(requestPreviewLoad = vi.fn()) {
	const ensureFreshOssInfo = vi.fn()
	const getAudioResource = vi.fn()
	const prepareAudio = vi.fn()
	const releaseAudio = vi.fn()
	const releaseViewportPreload = vi.fn()
	const imagePresentationScheduler = {
		replaceTargets: vi.fn(),
		removeTarget: vi.fn(),
		getSnapshot: vi.fn(() => ({
			targetCount: 0,
			pendingCount: 0,
			targetReplaceCount: 0,
			enqueuedCount: 0,
			pendingReplaceCount: 0,
			staleDropCount: 0,
			movingUpgradeDeferredCount: 0,
			appliedLowCount: 0,
			appliedPreviewCount: 0,
			appliedFullCount: 0,
			movingAppliedLowCount: 0,
			movingAppliedPreviewCount: 0,
			movingAppliedFullCount: 0,
			idleAppliedLowCount: 0,
			idleAppliedPreviewCount: 0,
			idleAppliedFullCount: 0,
			flushCount: 0,
			peakPendingCount: 0,
			drawRequestCount: 0,
		})),
	}
	const handlers = new Map<string, Array<(event: unknown) => void>>()
	let contentLayerListening = true
	const contentLayer = {
		listening: vi.fn((value?: boolean) => {
			if (typeof value === "boolean") {
				contentLayerListening = value
				return contentLayer
			}
			return contentLayerListening
		}),
		batchDraw: vi.fn(),
		getListeningValue: () => contentLayerListening,
	}
	const canvas = {
		eventEmitter: {
			on: vi.fn((type: string, handler: (event: unknown) => void) => {
				handlers.set(type, [...(handlers.get(type) ?? []), handler])
			}),
			off: vi.fn(),
		},
		contentLayer,
		elementManager: {
			getElementInstance: () => ({ requestPreviewLoad }),
		},
		videoResourceManager: {
			ensureFreshOssInfo,
		},
		audioResourceManager: {
			getResource: getAudioResource,
		},
		audioPlaybackManager: {
			prepare: prepareAudio,
			release: releaseAudio,
			releaseViewportPreload,
		},
		imageResourceManager: {
			getSnapshot: vi.fn(() => ({
				decodeAttemptCount: 0,
				decodeRepeatAttemptCount: 0,
				decodeSuccessCount: 0,
				decodeFailedCount: 0,
				decodedEvictedCount: 0,
				decodedEvictedBytes: 0,
				decodedEvictedLow: 0,
				decodedEvictedPreview: 0,
				decodedEvictedFull: 0,
				decodedBytesTotal: 0,
				lowLoaded: 0,
				previewLoaded: 0,
				fullLoaded: 0,
				activePreviewLoadPipelineCount: 0,
				queuedPreviewLoadCount: 0,
				activeDecodePixelCost: 0,
				queuedDecodePermitCount: 0,
			})),
		},
		imagePresentationScheduler,
		runtimeScheduler: {
			getSnapshot: vi.fn(() => ({
				drawRequestCount: 0,
				flushCount: 0,
				drawnCount: 0,
				coalescedDrawRequestCount: 0,
				drawReasonCounts: {},
			})),
		},
		magicConfigManager: {
			config: {
				methods: {},
			},
		},
	}
	const manager = new CanvasVisibilityManager({
		canvas: canvas as ConstructorParameters<typeof CanvasVisibilityManager>[0]["canvas"],
	}) as CanvasVisibilityManager & {
		lastRequestedVideoLoadState: Map<
			string,
			{
				priority: ImageResourceLoadPriority
				tier: "url" | "poster"
				requestedAt: number
			}
		>
		registeredVideos: Map<string, { elementId: string; path: string }>
	}
	return {
		contentLayer,
		ensureFreshOssInfo,
		getAudioResource,
		handlers,
		imagePresentationScheduler,
		manager,
		prepareAudio,
		releaseAudio,
		releaseViewportPreload,
		requestPreviewLoad,
	}
}

type RequestVideoLoad = (candidate: VideoCandidate, reason: string, force?: boolean) => void
type RequestAudioLoad = (candidate: AudioCandidate, reason: string, force?: boolean) => void
type ShouldRequestImageCandidate = (candidate: ImageCandidate) => boolean
type UpdateImageRetentionHints = (candidates: ImageCandidate[], lastSeenAt: number) => void

describe("CanvasVisibilityManager video load requests", () => {
	it("binds viewport video requests to the shared path signal", () => {
		const { ensureFreshOssInfo, manager } = createManager()
		const requestVideoLoad = (manager as unknown as { requestVideoLoad: RequestVideoLoad })
			.requestVideoLoad

		requestVideoLoad.call(manager, createCandidate("near"), "viewport:pan")
		requestVideoLoad.call(manager, createCandidate("near"), "viewport:scale")

		expect(ensureFreshOssInfo).toHaveBeenCalledTimes(1)
		expect(ensureFreshOssInfo).toHaveBeenCalledWith(
			"./videos/a.mp4",
			expect.objectContaining({
				allowCachedFallback: true,
				signal: expect.any(AbortSignal),
			}),
		)
	})

	it("dedupes repeated near video url prewarm candidates", () => {
		const { ensureFreshOssInfo, manager, requestPreviewLoad } = createManager()
		const requestVideoLoad = (manager as unknown as { requestVideoLoad: RequestVideoLoad })
			.requestVideoLoad

		requestVideoLoad.call(manager, createCandidate("near"), "test")
		requestVideoLoad.call(manager, createCandidate("near"), "test")

		expect(ensureFreshOssInfo).toHaveBeenCalledTimes(1)
		expect(ensureFreshOssInfo).toHaveBeenCalledWith("./videos/a.mp4", {
			allowCachedFallback: true,
			priority: "near",
		})
		expect(requestPreviewLoad).not.toHaveBeenCalled()
	})

	it("allows video candidates to upgrade from url prewarm to poster preview", () => {
		const { ensureFreshOssInfo, manager, requestPreviewLoad } = createManager()
		const requestVideoLoad = (manager as unknown as { requestVideoLoad: RequestVideoLoad })
			.requestVideoLoad

		requestVideoLoad.call(manager, createCandidate("near"), "test")
		requestVideoLoad.call(manager, createCandidate("visible"), "test")

		expect(ensureFreshOssInfo).toHaveBeenCalledTimes(1)
		expect(requestPreviewLoad).toHaveBeenCalledTimes(1)
		expect(requestPreviewLoad).toHaveBeenCalledWith({ force: false })
	})

	it("clears requested video load state when a video element is unregistered", () => {
		const { ensureFreshOssInfo, manager, requestPreviewLoad } = createManager()
		const requestVideoLoad = (manager as unknown as { requestVideoLoad: RequestVideoLoad })
			.requestVideoLoad

		manager.registeredVideos.set("video-1", {
			elementId: "video-1",
			path: "./videos/a.mp4",
		})
		manager.lastRequestedVideoLoadState.set("video-1", {
			priority: "visible",
			tier: "poster",
			requestedAt: 1,
		})

		manager.unregisterVideoElement("video-1")
		requestVideoLoad.call(manager, createCandidate("near"), "test")

		expect(ensureFreshOssInfo).toHaveBeenCalledTimes(1)
		expect(requestPreviewLoad).not.toHaveBeenCalled()
		expect(manager.lastRequestedVideoLoadState.get("video-1")).toEqual(
			expect.objectContaining({
				priority: "near",
				tier: "url",
			}),
		)
	})

	it("clears requested video load state when video preview load fails", () => {
		const { handlers, manager } = createConstructedManager()

		manager.registeredVideos.set("video-1", {
			elementId: "video-1",
			path: "./videos/a.mp4",
		})
		manager.lastRequestedVideoLoadState.set("video-1", {
			priority: "visible",
			tier: "poster",
			requestedAt: 1,
		})

		handlers.get("resource:video:load-failed")?.[0]?.({
			data: { path: "./videos/a.mp4" },
		})

		expect(manager.lastRequestedVideoLoadState.has("video-1")).toBe(false)
	})
})

describe("CanvasVisibilityManager audio viewport requests", () => {
	it("updates equivalent audio references and allows refreshed resources to load again", () => {
		const { manager, releaseAudio } = createConstructedManager()
		const internals = manager as unknown as {
			canvas: {
				magicConfigManager: {
					config: {
						methods: {
							resolveResourceReference?: ReturnType<
								typeof createTestResourceReferenceResolver
							>
						}
					}
				}
			}
			registeredAudios: Map<string, { elementId: string; path: string }>
			lastAudioVisibilityState: Map<string, string>
			lastRequestedAudioLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					tier: "url" | "preload"
					requestedAt: number
				}
			>
			scheduleRefresh: ReturnType<typeof vi.fn>
			cancelViewportResourceSignalIfUnused: ReturnType<typeof vi.fn>
		}
		internals.canvas.magicConfigManager.config.methods.resolveResourceReference =
			createTestResourceReferenceResolver({ currentCanvasWorkspacePath: "/画布A" })
		internals.scheduleRefresh = vi.fn()
		internals.cancelViewportResourceSignalIfUnused = vi.fn()
		internals.registeredAudios.set("audio-1", {
			elementId: "audio-1",
			path: "./audios/a.mp3",
		})
		internals.lastAudioVisibilityState.set("audio-1", "visible")
		internals.lastRequestedAudioLoadState.set("audio-1", {
			priority: "visible",
			tier: "preload",
			requestedAt: 1,
		})

		manager.updateAudioElement("audio-1", "/画布A/audios/a.mp3")

		expect(internals.registeredAudios.get("audio-1")?.path).toBe("/画布A/audios/a.mp3")
		expect(releaseAudio).toHaveBeenCalledWith("audio-1")
		expect(internals.lastAudioVisibilityState.has("audio-1")).toBe(false)
		expect(internals.lastRequestedAudioLoadState.has("audio-1")).toBe(false)

		internals.lastRequestedAudioLoadState.set("audio-1", {
			priority: "visible",
			tier: "preload",
			requestedAt: 2,
		})
		internals.scheduleRefresh.mockClear()

		manager.invalidateAudioLoadRequest("./audios/a.mp3", "host-refresh")

		expect(internals.lastRequestedAudioLoadState.has("audio-1")).toBe(false)
		expect(internals.scheduleRefresh).toHaveBeenCalledWith(
			"audio:load-request-invalidated:host-refresh",
			true,
		)
	})

	it("resolves near audio URLs without creating an HTMLAudioElement session", () => {
		const { getAudioResource, manager, prepareAudio } = createConstructedManager()
		const requestAudioLoad = (manager as unknown as { requestAudioLoad: RequestAudioLoad })
			.requestAudioLoad

		requestAudioLoad.call(manager, createAudioCandidate("near"), "viewport:idle-media")

		expect(getAudioResource).toHaveBeenCalledWith(
			"./audios/a.mp3",
			expect.objectContaining({
				allowCachedFallback: true,
				priority: "near",
				signal: expect.any(AbortSignal),
			}),
		)
		expect(prepareAudio).not.toHaveBeenCalled()
	})

	it("preloads visible audio through the managed viewport session", () => {
		const { getAudioResource, manager, prepareAudio } = createConstructedManager()
		const requestAudioLoad = (manager as unknown as { requestAudioLoad: RequestAudioLoad })
			.requestAudioLoad

		requestAudioLoad.call(manager, createAudioCandidate("visible"), "document:loaded")

		expect(prepareAudio).toHaveBeenCalledWith(
			"audio-1",
			"./audios/a.mp3",
			expect.objectContaining({
				source: "viewport",
				priority: "visible",
				signal: expect.any(AbortSignal),
			}),
		)
		expect(getAudioResource).not.toHaveBeenCalled()
	})

	it("upgrades a near URL request to visible preload and dedupes repeats", () => {
		const { getAudioResource, manager, prepareAudio } = createConstructedManager()
		const requestAudioLoad = (manager as unknown as { requestAudioLoad: RequestAudioLoad })
			.requestAudioLoad

		requestAudioLoad.call(manager, createAudioCandidate("near"), "audio:register")
		requestAudioLoad.call(manager, createAudioCandidate("near"), "viewport:idle-media")
		requestAudioLoad.call(manager, createAudioCandidate("visible"), "viewport:idle-media")

		expect(getAudioResource).toHaveBeenCalledTimes(1)
		expect(prepareAudio).toHaveBeenCalledTimes(1)
	})

	it("clears transient failure dedupe but keeps not-found terminal", () => {
		const { handlers, manager } = createConstructedManager()
		const state = manager as unknown as {
			lastRequestedAudioLoadState: Map<string, unknown>
			registeredAudios: Map<string, { elementId: string; path: string }>
		}
		state.registeredAudios.set("audio-1", {
			elementId: "audio-1",
			path: "./audios/a.mp3",
		})
		state.lastRequestedAudioLoadState.set("audio-1", {})

		handlers.get("resource:audio:load-failed")?.[0]?.({
			data: { path: "./audios/a.mp3", reason: "load-error" },
		})
		expect(state.lastRequestedAudioLoadState.has("audio-1")).toBe(false)

		state.lastRequestedAudioLoadState.set("audio-1", {})
		handlers.get("resource:audio:load-failed")?.[0]?.({
			data: { path: "./audios/a.mp3", reason: "not-found" },
		})
		expect(state.lastRequestedAudioLoadState.has("audio-1")).toBe(true)
	})

	it("releases only far viewport sessions after the far drain is ready", () => {
		const { manager, releaseViewportPreload } = createConstructedManager()
		const audioState = manager as unknown as {
			registeredAudios: Map<string, { elementId: string; path: string }>
			lastAudioVisibilityState: Map<string, string>
			scheduleFarVisibilityDrain: ReturnType<typeof vi.fn>
			updateAudioVisibilityStates: (
				visibleAudioIds: ReadonlySet<string>,
				nearAudioIds: ReadonlySet<string>,
				farDrainReady: boolean,
			) => number
		}
		audioState.scheduleFarVisibilityDrain = vi.fn()
		audioState.registeredAudios.set("audio-visible", {
			elementId: "audio-visible",
			path: "./audios/visible.mp3",
		})
		audioState.registeredAudios.set("audio-far", {
			elementId: "audio-far",
			path: "./audios/far.mp3",
		})

		expect(
			audioState.updateAudioVisibilityStates(new Set(["audio-visible"]), new Set(), false),
		).toBe(1)
		expect(releaseViewportPreload).not.toHaveBeenCalled()
		expect(audioState.scheduleFarVisibilityDrain).toHaveBeenCalledTimes(1)

		audioState.updateAudioVisibilityStates(new Set(["audio-visible"]), new Set(), true)
		expect(releaseViewportPreload).toHaveBeenCalledWith("audio-far")
	})
})

describe("CanvasVisibilityManager image load requests", () => {
	it("clears image request dedupe state after transient load failures", () => {
		const { handlers, manager: constructedManager } = createConstructedManager()
		const manager = constructedManager as CanvasVisibilityManager & {
			registeredImages: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			scheduleRefresh: ReturnType<typeof vi.fn>
		}

		manager.registeredImages.set("image-preview", {
			elementId: "image-preview",
			path: "./images/a.png",
		})
		manager.registeredImages.set("image-full", {
			elementId: "image-full",
			path: "./images/a.png",
		})
		manager.registeredImages.set("image-other", {
			elementId: "image-other",
			path: "./images/b.png",
		})
		manager.lastRequestedLoadState.set("image-preview", {
			priority: "visible",
			variant: "preview",
			requestedAt: 1,
		})
		manager.lastRequestedLoadState.set("image-full", {
			priority: "critical",
			variant: "full",
			requestedAt: 1,
		})
		manager.lastRequestedLoadState.set("image-other", {
			priority: "visible",
			variant: "preview",
			requestedAt: 1,
		})
		manager.scheduleRefresh = vi.fn()

		handlers.get("resource:image:load-failed")?.[0]?.({
			data: { path: "./images/a.png", reason: "load-error" },
		})

		expect(manager.lastRequestedLoadState.has("image-preview")).toBe(false)
		expect(manager.lastRequestedLoadState.has("image-full")).toBe(false)
		expect(manager.lastRequestedLoadState.has("image-other")).toBe(true)
		expect(manager.scheduleRefresh).not.toHaveBeenCalled()
	})

	it("keeps not-found image requests terminal instead of creating a retry loop", () => {
		const { handlers, manager: constructedManager } = createConstructedManager()
		const manager = constructedManager as CanvasVisibilityManager & {
			registeredImages: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
		}

		manager.registeredImages.set("image-1", {
			elementId: "image-1",
			path: "./images/missing.png",
		})
		manager.lastRequestedLoadState.set("image-1", {
			priority: "visible",
			variant: "preview",
			requestedAt: 1,
		})

		handlers.get("resource:image:load-failed")?.[0]?.({
			data: { path: "./images/missing.png", reason: "not-found" },
		})

		expect(manager.lastRequestedLoadState.has("image-1")).toBe(true)
	})

	it("clears only the failed non-low image variant request state", () => {
		const { handlers, manager: constructedManager } = createConstructedManager()
		const manager = constructedManager as CanvasVisibilityManager & {
			registeredImages: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
		}

		manager.registeredImages.set("image-preview", {
			elementId: "image-preview",
			path: "./images/a.png",
		})
		manager.registeredImages.set("image-full", {
			elementId: "image-full",
			path: "./images/a.png",
		})
		manager.lastRequestedLoadState.set("image-preview", {
			priority: "visible",
			variant: "preview",
			requestedAt: 1,
		})
		manager.lastRequestedLoadState.set("image-full", {
			priority: "critical",
			variant: "full",
			requestedAt: 1,
		})

		handlers.get("resource:image:variant-load-failed")?.[0]?.({
			data: { path: "./images/a.png", variant: "full", reason: "load-error" },
		})

		expect(manager.lastRequestedLoadState.has("image-preview")).toBe(true)
		expect(manager.lastRequestedLoadState.has("image-full")).toBe(false)
	})

	it("does not reissue an unchanged viewport image request across pan and scale", () => {
		const loadResource = vi.fn()
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				imageResourceManager: {
					loadResource: typeof loadResource
				}
			}
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
		}
		manager.canvas = {
			imageResourceManager: { loadResource },
		}
		manager.lastRequestedLoadState = new Map()

		const candidate = {
			...createImageCandidate("image-1", "visible"),
			path: "./images/a.png",
		}
		const requestImageLoad = (
			manager as unknown as {
				requestImageLoad: (candidate: ImageCandidate, reason: string) => void
			}
		).requestImageLoad
		requestImageLoad.call(manager, candidate, "viewport:pan")
		requestImageLoad.call(manager, candidate, "viewport:scale")

		expect(loadResource).toHaveBeenCalledTimes(1)
		expect(loadResource).toHaveBeenCalledWith(
			"./images/a.png",
			expect.objectContaining({
				signal: expect.any(AbortSignal),
			}),
		)
	})

	it("keeps the displayed image tier while moving and uses low for blank images", () => {
		let displayedVariant: ImageResourceVariant | undefined = "preview"
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				elementManager: {
					getElementInstance: () => {
						getDisplayResourceVariant: () => ImageResourceVariant | undefined
					}
				}
				magicConfigManager: { config: { methods: Record<string, never> } }
			}
			imagePresentationPhase: "moving" | "idle"
			lowFallbackPreviewPathByElementId: Map<string, string>
		}
		manager.canvas = {
			elementManager: {
				getElementInstance: () => ({
					getDisplayResourceVariant: () => displayedVariant,
				}),
			},
			magicConfigManager: { config: { methods: {} } },
		}
		manager.imagePresentationPhase = "moving"
		manager.lowFallbackPreviewPathByElementId = new Map()
		const resolveImageCandidateForPresentationPhase = (
			manager as unknown as {
				resolveImageCandidateForPresentationPhase: (
					candidate: ImageCandidate,
				) => ImageCandidate
			}
		).resolveImageCandidateForPresentationPhase
		const candidate = {
			...createImageCandidate("image-1", "visible"),
			variant: "full" as ImageResourceVariant,
			screenLongEdge: 2000,
		}

		expect(resolveImageCandidateForPresentationPhase.call(manager, candidate)).toEqual(
			expect.objectContaining({
				variant: "preview",
				screenLongEdge: 2000,
			}),
		)

		displayedVariant = undefined
		expect(resolveImageCandidateForPresentationPhase.call(manager, candidate)).toEqual(
			expect.objectContaining({ variant: "low" }),
		)

		manager.imagePresentationPhase = "idle"
		expect(resolveImageCandidateForPresentationPhase.call(manager, candidate)).toEqual(
			expect.objectContaining({
				variant: "full",
			}),
		)

		manager.lowFallbackPreviewPathByElementId.set("image-1", candidate.path)
		expect(
			resolveImageCandidateForPresentationPhase.call(manager, {
				...candidate,
				variant: "low",
			}),
		).toEqual(expect.objectContaining({ variant: "preview" }))
	})

	it("lets blank moving images request low without waiting for tier cooldown", () => {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				elementManager: {
					getElementInstance: () => {
						getDisplayResourceVariant: () => undefined
					}
				}
			}
			imagePresentationPhase: "moving"
			lastRequestedLoadState: Map<string, unknown>
			scheduleRefresh: ReturnType<typeof vi.fn>
		}
		manager.canvas = {
			elementManager: {
				getElementInstance: () => ({ getDisplayResourceVariant: () => undefined }),
			},
		}
		manager.imagePresentationPhase = "moving"
		manager.lastRequestedLoadState = new Map([
			[
				"image-1",
				{ priority: "visible", variant: "preview", requestedAt: performance.now() },
			],
		])
		manager.scheduleRefresh = vi.fn()

		expect(
			manager.shouldRequestImageCandidate({
				...createImageCandidate("image-1"),
				variant: "low",
			}),
		).toBe(true)
		expect(manager.scheduleRefresh).not.toHaveBeenCalled()
	})

	it("limits admitted full candidates per refresh", () => {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				imageResourceManager: {
					getFullAdmissionSnapshot: () => {
						fullDecodedBytes: number
						fullLoadingCount: number
						fullBudgetBytes: number
					}
				}
			}
			admitOrDowngradeFullCandidates: (candidates: ImageCandidate[]) => ImageCandidate[]
		}
		manager.canvas = {
			imageResourceManager: {
				getFullAdmissionSnapshot: () => ({
					fullDecodedBytes: 0,
					fullLoadingCount: 0,
					fullBudgetBytes: 10_000,
				}),
			},
		}
		const candidates = ["image-1", "image-2", "image-3", "image-4", "image-5"].map((id) => ({
			...createImageCandidate(id, "visible"),
			variant: "full" as ImageResourceVariant,
		}))

		const admitted = manager.admitOrDowngradeFullCandidates(candidates)

		expect(admitted.map((candidate) => candidate.variant)).toEqual([
			"full",
			"full",
			"full",
			"full",
			"preview",
		])
	})

	it("admits viewport-centered full candidates before larger distant full candidates", () => {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				imageResourceManager: {
					getFullAdmissionSnapshot: () => {
						fullDecodedBytes: number
						fullLoadingCount: number
						fullBudgetBytes: number
					}
				}
			}
			admitOrDowngradeFullCandidates: (candidates: ImageCandidate[]) => ImageCandidate[]
		}
		manager.canvas = {
			imageResourceManager: {
				getFullAdmissionSnapshot: () => ({
					fullDecodedBytes: 0,
					fullLoadingCount: 0,
					fullBudgetBytes: 10_000,
				}),
			},
		}
		const farLarge = {
			...createImageCandidate("image-1", "visible"),
			variant: "full" as ImageResourceVariant,
			screenArea: 100_000,
			screenLongEdge: 1000,
			distanceToViewportCenter: 500,
		}
		const centeredSmall = {
			...createImageCandidate("image-2", "visible"),
			variant: "full" as ImageResourceVariant,
			screenArea: 100,
			screenLongEdge: 100,
			distanceToViewportCenter: 0,
		}
		const nearMedium = {
			...createImageCandidate("image-3", "visible"),
			variant: "full" as ImageResourceVariant,
			screenArea: 10_000,
			screenLongEdge: 500,
			distanceToViewportCenter: 20,
		}
		const nearLarge = {
			...createImageCandidate("image-4", "visible"),
			variant: "full" as ImageResourceVariant,
			screenArea: 20_000,
			screenLongEdge: 700,
			distanceToViewportCenter: 30,
		}
		const nearSmall = {
			...createImageCandidate("image-5", "visible"),
			variant: "full" as ImageResourceVariant,
			screenArea: 200,
			screenLongEdge: 120,
			distanceToViewportCenter: 40,
		}

		const admitted = manager.admitOrDowngradeFullCandidates([
			farLarge,
			centeredSmall,
			nearMedium,
			nearLarge,
			nearSmall,
		])

		expect(admitted.map((candidate) => candidate.variant)).toEqual([
			"preview",
			"full",
			"full",
			"full",
			"full",
		])
	})

	it("allows one top full candidate when the full budget is reached", () => {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				imageResourceManager: {
					getFullAdmissionSnapshot: () => {
						fullDecodedBytes: number
						fullLoadingCount: number
						fullBudgetBytes: number
					}
				}
			}
			admitOrDowngradeFullCandidates: (candidates: ImageCandidate[]) => ImageCandidate[]
		}
		manager.canvas = {
			imageResourceManager: {
				getFullAdmissionSnapshot: () => ({
					fullDecodedBytes: 10_000,
					fullLoadingCount: 0,
					fullBudgetBytes: 10_000,
				}),
			},
		}
		const candidates = ["image-1", "image-2"].map((id) => ({
			...createImageCandidate(id, "visible"),
			variant: "full" as ImageResourceVariant,
		}))

		const admitted = manager.admitOrDowngradeFullCandidates(candidates)

		expect(admitted.map((candidate) => candidate.variant)).toEqual(["full", "preview"])
	})

	it("downgrades full candidates when full loads are already saturated", () => {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				imageResourceManager: {
					getFullAdmissionSnapshot: () => {
						fullDecodedBytes: number
						fullLoadingCount: number
						fullBudgetBytes: number
					}
				}
			}
			admitOrDowngradeFullCandidates: (candidates: ImageCandidate[]) => ImageCandidate[]
		}
		manager.canvas = {
			imageResourceManager: {
				getFullAdmissionSnapshot: () => ({
					fullDecodedBytes: 0,
					fullLoadingCount: 4,
					fullBudgetBytes: 10_000,
				}),
			},
		}
		const candidates = ["image-1", "image-2"].map((id) => ({
			...createImageCandidate(id, "visible"),
			variant: "full" as ImageResourceVariant,
		}))

		const admitted = manager.admitOrDowngradeFullCandidates(candidates)

		expect(admitted.map((candidate) => candidate.variant)).toEqual(["preview", "preview"])
	})

	it("allows idle media refreshes to bypass the rapid variant switch cooldown", () => {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			shouldRequestImageCandidate: (
				candidate: ImageCandidate,
				options?: { reason?: string },
			) => boolean
			scheduleRefresh: ReturnType<typeof vi.fn>
		}
		manager.lastRequestedLoadState = new Map([
			[
				"image-1",
				{
					priority: "visible",
					variant: "preview",
					requestedAt: performance.now(),
				},
			],
		])
		manager.scheduleRefresh = vi.fn()

		expect(
			manager.shouldRequestImageCandidate(
				{
					...createImageCandidate("image-1", "visible"),
					variant: "full",
					screenLongEdge: 2000,
				},
				{ reason: "viewport:idle-media" },
			),
		).toBe(true)
		expect(manager.scheduleRefresh).not.toHaveBeenCalled()
	})

	it("passes directed completion metadata to full image resource loads", () => {
		const loadResource = vi.fn()
		const manager = Object.create(CanvasVisibilityManager.prototype) as {
			canvas: {
				imageResourceManager: {
					loadResource: typeof loadResource
				}
			}
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			requestImageLoad: (candidate: ImageCandidate, reason: string, force?: boolean) => void
		}
		manager.canvas = {
			imageResourceManager: { loadResource },
		}
		manager.lastRequestedLoadState = new Map()
		const requestImageLoad = manager.requestImageLoad.bind(manager)

		requestImageLoad(
			{
				elementId: "image-1",
				path: "./images/a.png",
				priority: "visible",
				variant: "full",
				visibilityState: "visible",
				screenArea: 40000,
				screenLongEdge: 200,
				distanceToViewportCenter: 0,
			},
			"viewport:scale",
		)

		expect(loadResource).toHaveBeenCalledWith(
			"./images/a.png",
			expect.objectContaining({
				variant: "full",
				priority: "visible",
				displayTargetElementId: "image-1",
				displayTargetReason: "viewport:scale",
				signal: expect.any(AbortSignal),
			}),
		)
	})

	it("does not attach viewport cancellation to non-viewport image requests", () => {
		const loadResource = vi.fn()
		const manager = Object.create(CanvasVisibilityManager.prototype) as {
			canvas: {
				imageResourceManager: {
					loadResource: typeof loadResource
				}
			}
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			requestImageLoad: (candidate: ImageCandidate, reason: string, force?: boolean) => void
		}
		manager.canvas = {
			imageResourceManager: { loadResource },
		}
		manager.lastRequestedLoadState = new Map()

		manager.requestImageLoad(
			{
				...createImageCandidate("image-1", "critical"),
				path: "./images/a.png",
			},
			"selection:container",
		)

		expect(loadResource).toHaveBeenCalledWith("./images/a.png", {
			variant: "preview",
			priority: "critical",
			displayTargetElementId: "image-1",
			displayTargetReason: "selection:container",
		})
	})

	it("invalidates image load request dedupe state by path and variant", () => {
		const manager = Object.create(CanvasVisibilityManager.prototype) as {
			canvas: {
				magicConfigManager: {
					config: {
						methods: Record<string, never>
					}
				}
				imagePresentationScheduler: {
					removeTarget: ReturnType<typeof vi.fn>
				}
			}
			destroyed: boolean
			registeredImages: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			scheduleRefresh: ReturnType<typeof vi.fn>
			invalidateImageLoadRequest: CanvasVisibilityManager["invalidateImageLoadRequest"]
		}
		manager.canvas = {
			magicConfigManager: {
				config: {
					methods: {},
				},
			},
			imagePresentationScheduler: {
				removeTarget: vi.fn(),
			},
		}
		manager.destroyed = false
		manager.registeredImages = new Map([
			["image-1", { elementId: "image-1", path: "./images/a.png" }],
			["image-2", { elementId: "image-2", path: "./images/a.png" }],
			["image-3", { elementId: "image-3", path: "./images/b.png" }],
		])
		manager.lastRequestedLoadState = new Map([
			["image-1", { priority: "visible", variant: "preview", requestedAt: 1 }],
			["image-2", { priority: "visible", variant: "full", requestedAt: 1 }],
			["image-3", { priority: "visible", variant: "preview", requestedAt: 1 }],
		])
		manager.scheduleRefresh = vi.fn()

		manager.invalidateImageLoadRequest("./images/a.png", "preview", "decoded-budget")

		expect(manager.lastRequestedLoadState.has("image-1")).toBe(false)
		expect(manager.lastRequestedLoadState.has("image-2")).toBe(true)
		expect(manager.lastRequestedLoadState.has("image-3")).toBe(true)
		expect(manager.scheduleRefresh).toHaveBeenCalledWith(
			"image:load-request-invalidated:decoded-budget",
			true,
		)

		manager.scheduleRefresh.mockClear()
		manager.invalidateImageLoadRequest("./images/a.png", "low", "decoded-budget")
		expect(manager.lastRequestedLoadState.has("image-2")).toBe(true)
		expect(manager.scheduleRefresh).not.toHaveBeenCalled()

		manager.invalidateImageLoadRequest("./images/a.png", undefined, "decoded-budget")
		expect(manager.lastRequestedLoadState.has("image-2")).toBe(false)
		expect(manager.lastRequestedLoadState.has("image-3")).toBe(true)
		expect(manager.scheduleRefresh).toHaveBeenCalledWith(
			"image:load-request-invalidated:decoded-budget",
			true,
		)

		manager.scheduleRefresh.mockClear()
		manager.invalidateImageLoadRequest("./images/a.png", undefined, "decoded-budget")
		expect(manager.scheduleRefresh).toHaveBeenCalledWith(
			"image:load-request-invalidated:decoded-budget",
			true,
		)
	})

	it("caps background image load requests and keeps visible candidates first", () => {
		const manager = Object.create(CanvasVisibilityManager.prototype) as CanvasVisibilityManager
		const selectImageCandidatesToLoad = (
			manager as unknown as { selectImageCandidatesToLoad: SelectImageCandidatesToLoad }
		).selectImageCandidatesToLoad
		const visibleCandidates = Array.from({ length: 5 }, (_, index) =>
			createImageCandidate(`visible-${index}`, "visible"),
		)
		const nearCandidates = Array.from({ length: 20 }, (_, index) =>
			createImageCandidate(`near-${index}`, "near"),
		)

		const result = selectImageCandidatesToLoad.call(manager, {
			pendingLowDetailVisibleCandidates: [],
			pendingNearCandidates: nearCandidates,
			pendingVisibleCandidates: visibleCandidates,
			reason: "visibility:drain",
			shouldDeferNearLoads: false,
		})

		expect(result.imageLoadRequestBudget).toBe(12)
		expect(result.visibleToLoad).toHaveLength(5)
		expect(result.nearToLoad).toHaveLength(7)
	})

	it("does not apply the background image load budget to normal refreshes", () => {
		const manager = Object.create(CanvasVisibilityManager.prototype) as CanvasVisibilityManager
		const selectImageCandidatesToLoad = (
			manager as unknown as { selectImageCandidatesToLoad: SelectImageCandidatesToLoad }
		).selectImageCandidatesToLoad
		const visibleCandidates = Array.from({ length: 20 }, (_, index) =>
			createImageCandidate(`visible-${index}`, "visible"),
		)
		const nearCandidates = Array.from({ length: 20 }, (_, index) =>
			createImageCandidate(`near-${index}`, "near"),
		)

		const result = selectImageCandidatesToLoad.call(manager, {
			pendingLowDetailVisibleCandidates: [],
			pendingNearCandidates: nearCandidates,
			pendingVisibleCandidates: visibleCandidates,
			reason: "document:restored",
			shouldDeferNearLoads: false,
		})

		expect(result.imageLoadRequestBudget).toBeNull()
		expect(result.visibleToLoad).toHaveLength(20)
		expect(result.nearToLoad).toHaveLength(20)
	})
})

describe("CanvasVisibilityManager image variant switch cooldown", () => {
	it("schedules a forced refresh when a fast cross-tier request is suppressed", () => {
		vi.useFakeTimers()
		try {
			const manager = Object.create(
				CanvasVisibilityManager.prototype,
			) as CanvasVisibilityManager & {
				destroyed: boolean
				lastRequestedLoadState: Map<
					string,
					{
						priority: ImageResourceLoadPriority
						variant: ImageResourceVariant
						requestedAt: number
					}
				>
				variantSwitchCooldownTimerId: ReturnType<typeof setTimeout> | null
				scheduleRefresh: ReturnType<typeof vi.fn>
				shouldRequestImageCandidate: ShouldRequestImageCandidate
			}
			manager.destroyed = false
			manager.variantSwitchCooldownTimerId = null
			manager.scheduleRefresh = vi.fn()
			manager.lastRequestedLoadState = new Map([
				[
					"image-1",
					{
						priority: "visible",
						variant: "low",
						requestedAt: performance.now(),
					},
				],
			])

			const shouldRequest = manager.shouldRequestImageCandidate({
				elementId: "image-1",
				path: "./images/a.png",
				priority: "visible",
				variant: "preview",
				visibilityState: "visible",
				screenArea: 1000,
				screenLongEdge: 500,
				distanceToViewportCenter: 0,
			})

			expect(shouldRequest).toBe(false)
			vi.advanceTimersByTime(449)
			expect(manager.scheduleRefresh).not.toHaveBeenCalled()
			vi.advanceTimersByTime(1)
			expect(manager.scheduleRefresh).toHaveBeenCalledWith(
				"visibility:variant-switch-cooldown",
				true,
			)
			expect(manager.variantSwitchCooldownTimerId).toBeNull()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("CanvasVisibilityManager decoded image retention hints", () => {
	function createRetentionManager(displayedVariant?: ImageResourceVariant) {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				elementManager: {
					getElementInstance: () => {
						getDisplayResourceVariant?: () => ImageResourceVariant | undefined
					}
				}
				magicConfigManager: {
					config: {
						methods: Record<string, never>
					}
				}
				imagePresentationScheduler: {
					removeTarget: ReturnType<typeof vi.fn>
				}
			}
			destroyed: boolean
			registeredImages: Map<string, { elementId: string; path: string }>
			lastVisibilityState: Map<string, string>
			lastRequestedLoadState: Map<string, unknown>
			lowFallbackPreviewPathByElementId: Map<string, string>
			imageRetentionHints: Map<string, unknown>
			scheduleRefresh: ReturnType<typeof vi.fn>
		}
		manager.canvas = {
			elementManager: {
				getElementInstance: () => ({
					getDisplayResourceVariant: () => displayedVariant,
				}),
			},
			magicConfigManager: {
				config: {
					methods: {},
				},
			},
			imagePresentationScheduler: {
				removeTarget: vi.fn(),
			},
		}
		manager.destroyed = false
		manager.registeredImages = new Map([
			["image-1", { elementId: "image-1", path: "./images/a.png" }],
		])
		manager.lastVisibilityState = new Map()
		manager.lastRequestedLoadState = new Map()
		manager.lowFallbackPreviewPathByElementId = new Map()
		manager.imageRetentionHints = new Map()
		manager.scheduleRefresh = vi.fn()
		return manager
	}

	it("returns visible image retention hints with requested and displayed variants", () => {
		const manager = createRetentionManager("full")
		const updateImageRetentionHints = (
			manager as unknown as { updateImageRetentionHints: UpdateImageRetentionHints }
		).updateImageRetentionHints

		updateImageRetentionHints.call(
			manager,
			[
				{
					elementId: "image-1",
					path: "./images/a.png",
					priority: "visible",
					variant: "full",
					visibilityState: "visible",
					screenArea: 1_000_000,
					screenLongEdge: 2000,
					distanceToViewportCenter: 0,
				},
			],
			performance.now(),
		)

		expect(manager.getDecodedImageRetentionSnapshot()).toEqual([
			expect.objectContaining({
				elementId: "image-1",
				path: "./images/a.png",
				visibilityState: "visible",
				requestedVariant: "full",
				displayedVariant: "full",
				screenLongEdge: 2000,
			}),
		])
	})

	it("clears image retention hints on unregister and path update", () => {
		const manager = createRetentionManager("preview")
		const updateImageRetentionHints = (
			manager as unknown as { updateImageRetentionHints: UpdateImageRetentionHints }
		).updateImageRetentionHints

		updateImageRetentionHints.call(
			manager,
			[
				{
					elementId: "image-1",
					path: "./images/a.png",
					priority: "visible",
					variant: "preview",
					visibilityState: "visible",
					screenArea: 1000,
					screenLongEdge: 500,
					distanceToViewportCenter: 0,
				},
			],
			performance.now(),
		)
		manager.updateImageElement("image-1", "./images/b.png")

		expect(manager.getDecodedImageRetentionSnapshot()).toEqual([])
		expect(manager.registeredImages.get("image-1")?.path).toBe("./images/b.png")

		updateImageRetentionHints.call(
			manager,
			[
				{
					elementId: "image-1",
					path: "./images/b.png",
					priority: "visible",
					variant: "preview",
					visibilityState: "visible",
					screenArea: 1000,
					screenLongEdge: 500,
					distanceToViewportCenter: 0,
				},
			],
			performance.now(),
		)
		manager.unregisterImageElement("image-1")

		expect(manager.getDecodedImageRetentionSnapshot()).toEqual([])
		expect(manager.registeredImages.has("image-1")).toBe(false)
	})

	it("keeps retention hints during the grace window and prunes them after expiry", () => {
		vi.useFakeTimers()
		try {
			const manager = createRetentionManager("preview")
			const updateImageRetentionHints = (
				manager as unknown as { updateImageRetentionHints: UpdateImageRetentionHints }
			).updateImageRetentionHints

			updateImageRetentionHints.call(
				manager,
				[
					{
						elementId: "image-1",
						path: "./images/a.png",
						priority: "near",
						variant: "preview",
						visibilityState: "near",
						screenArea: 1000,
						screenLongEdge: 500,
						distanceToViewportCenter: 0,
					},
				],
				performance.now(),
			)

			vi.advanceTimersByTime(4999)
			expect(manager.getDecodedImageRetentionSnapshot()).toHaveLength(1)

			vi.advanceTimersByTime(2)
			expect(manager.getDecodedImageRetentionSnapshot()).toEqual([])
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("CanvasVisibilityManager content layer hit graph suppression", () => {
	it("uses an explicit viewport end event to enter idle immediately", () => {
		vi.useFakeTimers()
		try {
			const { handlers, manager } = createConstructedManager()
			const scheduleRefresh = vi.fn()
			;(manager as unknown as { scheduleRefresh: typeof scheduleRefresh }).scheduleRefresh =
				scheduleRefresh

			handlers.get("viewport:pan")?.[0]?.({})
			handlers.get("viewport:changed")?.[0]?.({ data: { phase: "end" } })

			expect(scheduleRefresh).toHaveBeenCalledWith("viewport:idle-media", true)
			vi.advanceTimersByTime(160)
			expect(scheduleRefresh.mock.calls).toEqual([
				["viewport:pan", false],
				["viewport:idle-media", true],
			])
			manager.destroy()
		} finally {
			vi.useRealTimers()
		}
	})

	it("schedules an idle media refresh after viewport movement settles", () => {
		vi.useFakeTimers()
		try {
			const { handlers, manager } = createConstructedManager()
			const scheduleRefresh = vi.fn()
			;(manager as unknown as { scheduleRefresh: typeof scheduleRefresh }).scheduleRefresh =
				scheduleRefresh

			handlers.get("viewport:pan")?.[0]?.({})

			expect(scheduleRefresh).toHaveBeenCalledWith("viewport:pan", false)
			vi.advanceTimersByTime(159)
			expect(scheduleRefresh).not.toHaveBeenCalledWith("viewport:idle-media", true)
			vi.advanceTimersByTime(1)
			expect(scheduleRefresh).toHaveBeenCalledWith("viewport:idle-media", true)
			manager.destroy()
		} finally {
			vi.useRealTimers()
		}
	})

	it("disables content layer listening during viewport movement and restores it after idle", () => {
		vi.useFakeTimers()
		try {
			const { contentLayer, handlers, manager } = createConstructedManager()

			handlers.get("viewport:pan")?.[0]?.({})

			expect(contentLayer.getListeningValue()).toBe(false)
			vi.advanceTimersByTime(159)
			expect(contentLayer.getListeningValue()).toBe(false)
			vi.advanceTimersByTime(1)

			expect(contentLayer.getListeningValue()).toBe(true)
			expect(contentLayer.batchDraw).toHaveBeenCalledTimes(1)
			manager.destroy()
		} finally {
			vi.useRealTimers()
		}
	})

	it("keeps content layer listening disabled while viewport movement continues", () => {
		vi.useFakeTimers()
		try {
			const { contentLayer, handlers, manager } = createConstructedManager()

			handlers.get("viewport:pan")?.[0]?.({})
			vi.advanceTimersByTime(100)
			handlers.get("viewport:scale")?.[0]?.({})
			vi.advanceTimersByTime(159)
			expect(contentLayer.getListeningValue()).toBe(false)
			vi.advanceTimersByTime(1)

			expect(contentLayer.getListeningValue()).toBe(true)
			manager.destroy()
		} finally {
			vi.useRealTimers()
		}
	})
})

describe("CanvasVisibilityManager skipped pan visible refresh", () => {
	it("requests visible images without running the large near query when viewport movement is skipped", () => {
		const requestImageLoad = vi.fn()
		const scheduleDrainIfNeeded = vi.fn()
		const scheduleFarVisibilityDrain = vi.fn()
		const replaceTargets = vi.fn()
		const queryElementIdsByExpandedRect = vi.fn((_rect, padding, options) =>
			padding === 0 && Array.from(options?.elementIds ?? []).includes("image-1")
				? ["image-1"]
				: [],
		)
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				elementManager: {
					findParentIdForElement: () => undefined
					getElementInstance: () => {
						getDisplayResourceVariant: () => undefined
					}
					isElementVisibleInDataTree: () => boolean
				}
				geometryCacheManager: {
					getElementBounds: () => { x: number; y: number; width: number; height: number }
					queryElementIdsByExpandedRect: typeof queryElementIdsByExpandedRect
				}
				imagePresentationScheduler: {
					replaceTargets: typeof replaceTargets
				}
			}
			registeredImages: Map<string, { elementId: string; path: string }>
			registeredVideos: Map<string, { elementId: string; path: string }>
			registeredAudios: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			lastRequestedVideoLoadState: Map<string, unknown>
			lastRequestedAudioLoadState: Map<string, unknown>
			lastVisibilityState: Map<string, string>
			lastVideoVisibilityState: Map<string, string>
			lastAudioVisibilityState: Map<string, string>
			lastContainerDisplayVariant: Map<string, ImageResourceVariant>
			imageRetentionHints: Map<string, unknown>
			imagePresentationPhase: "moving" | "idle"
			initialVisibleCriticalUntil: number
			statsSnapshot: Record<string, number>
			shouldRequestImageCandidate: () => boolean
			shouldRequestVideoCandidate: () => boolean
			requestImageLoad: typeof requestImageLoad
			scheduleDrainIfNeeded: typeof scheduleDrainIfNeeded
			scheduleFarVisibilityDrain: typeof scheduleFarVisibilityDrain
			refreshVisibleOnlyForSkippedViewportMovement: (options: {
				reason: string
				startedAt: number
				viewportRect: { x: number; y: number; width: number; height: number }
				viewportScale: number
			}) => void
		}

		manager.canvas = {
			elementManager: {
				findParentIdForElement: () => undefined,
				getElementInstance: () => ({
					getDisplayResourceVariant: () => undefined,
				}),
				isElementVisibleInDataTree: () => true,
			},
			geometryCacheManager: {
				getElementBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
				queryElementIdsByExpandedRect,
			},
			imagePresentationScheduler: {
				replaceTargets,
			},
		}
		manager.registeredImages = new Map([
			["image-1", { elementId: "image-1", path: "./images/a.png" }],
		])
		manager.registeredVideos = new Map()
		manager.registeredAudios = new Map()
		manager.lastRequestedLoadState = new Map()
		manager.lastRequestedVideoLoadState = new Map()
		manager.lastRequestedAudioLoadState = new Map()
		manager.lastVisibilityState = new Map()
		manager.lastVideoVisibilityState = new Map()
		manager.lastAudioVisibilityState = new Map()
		manager.lastContainerDisplayVariant = new Map()
		manager.imageRetentionHints = new Map()
		manager.imagePresentationPhase = "moving"
		manager.initialVisibleCriticalUntil = 0
		manager.statsSnapshot = {
			registeredImageCount: 0,
			registeredVideoCount: 0,
			registeredAudioCount: 0,
			registerDedupedCount: 0,
			videoRegisterDedupedCount: 0,
			audioRegisterDedupedCount: 0,
			lowFallbackPreviewCount: 0,
			visibleImageCount: 0,
			nearImageCount: 0,
			farImageCount: 0,
			visibleVideoCount: 0,
			nearVideoCount: 0,
			farVideoCount: 0,
			visibleAudioCount: 0,
			nearAudioCount: 0,
			farAudioCount: 0,
			lastQueryDurationMs: 0,
			lastRequestedVisibleCount: 0,
			lastRequestedNearCount: 0,
			lastRequestedVisibleVideoCount: 0,
			lastRequestedNearVideoCount: 0,
			lastRequestedVisibleAudioCount: 0,
			lastRequestedNearAudioCount: 0,
			lowDetailVisibleVideoCount: 0,
			pendingLowDetailVisibleVideoLoadCandidateCount: 0,
			pendingImageLoadCandidateCount: 0,
			pendingVideoLoadCandidateCount: 0,
			pendingAudioLoadCandidateCount: 0,
			drainScheduledCount: 0,
			drainRunCount: 0,
			lastViewportScale: 1,
			lastViewportWidth: 0,
			lastViewportHeight: 0,
			skippedViewportQueryCount: 0,
			queryCount: 0,
		}
		manager.shouldRequestImageCandidate = () => true
		manager.shouldRequestVideoCandidate = () => true
		manager.requestImageLoad = requestImageLoad
		manager.scheduleDrainIfNeeded = scheduleDrainIfNeeded
		manager.scheduleFarVisibilityDrain = scheduleFarVisibilityDrain

		manager.refreshVisibleOnlyForSkippedViewportMovement({
			reason: "viewport:pan",
			startedAt: performance.now(),
			viewportRect: { x: 100, y: 200, width: 800, height: 600 },
			viewportScale: 0.2,
		})

		expect(queryElementIdsByExpandedRect).toHaveBeenCalledTimes(1)
		expect(queryElementIdsByExpandedRect).toHaveBeenCalledWith(
			{ x: 100, y: 200, width: 800, height: 600 },
			0,
			{ elementIds: ["image-1"] },
		)
		expect(requestImageLoad).toHaveBeenCalledTimes(1)
		expect(requestImageLoad).toHaveBeenCalledWith(
			expect.objectContaining({
				elementId: "image-1",
				path: "./images/a.png",
				priority: "visible",
				variant: "low",
				visibilityState: "visible",
			}),
			"viewport:pan",
		)
		expect(replaceTargets).toHaveBeenCalledWith(
			[
				expect.objectContaining({
					elementId: "image-1",
					variant: "low",
				}),
			],
			"moving",
		)
		expect(scheduleFarVisibilityDrain).toHaveBeenCalledTimes(1)
	})
})

describe("CanvasVisibilityManager immediate media loading", () => {
	function createImmediateMediaManager(elements: Record<string, LayerElement>) {
		const requestImmediateImageLoad = vi.fn()
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				elementManager: {
					getElementData: (elementId: string) => LayerElement | undefined
					isElementVisibleInDataTree: (elementId: string) => boolean
				}
			}
			registeredImages: Map<string, { elementId: string; path: string }>
			requestImmediateImageLoad: typeof requestImmediateImageLoad
		}
		manager.canvas = {
			elementManager: {
				getElementData: (elementId: string) => elements[elementId],
				isElementVisibleInDataTree: (elementId: string) =>
					elements[elementId]?.visible !== false,
			},
		}
		manager.registeredImages = new Map([
			["image-1", { elementId: "image-1", path: "./images/a.png" }],
			["image-2", { elementId: "image-2", path: "./images/b.png" }],
			["direct-image", { elementId: "direct-image", path: "./images/direct.png" }],
		])
		manager.requestImmediateImageLoad = requestImmediateImageLoad
		return { manager, requestImmediateImageLoad }
	}

	it("expands frame children and requests critical image loads", () => {
		const { manager, requestImmediateImageLoad } = createImmediateMediaManager({
			"frame-1": {
				id: "frame-1",
				type: ElementTypeEnum.Frame,
				children: [
					{ id: "image-1", type: ElementTypeEnum.Image, src: "./images/a.png" },
					{
						id: "group-1",
						type: ElementTypeEnum.Group,
						children: [
							{ id: "image-2", type: ElementTypeEnum.Image, src: "./images/b.png" },
						],
					},
				],
			},
			"image-1": { id: "image-1", type: ElementTypeEnum.Image, src: "./images/a.png" },
			"image-2": { id: "image-2", type: ElementTypeEnum.Image, src: "./images/b.png" },
			"group-1": {
				id: "group-1",
				type: ElementTypeEnum.Group,
				children: [{ id: "image-2", type: ElementTypeEnum.Image, src: "./images/b.png" }],
			},
		})

		manager.requestImmediateMediaLoadForElements(["frame-1"], { reason: "test-focus" })

		expect(requestImmediateImageLoad).toHaveBeenCalledWith("image-1", {
			reason: "test-focus",
			priority: "critical",
		})
		expect(requestImmediateImageLoad).toHaveBeenCalledWith("image-2", {
			reason: "test-focus",
			priority: "critical",
		})
		expect(requestImmediateImageLoad).toHaveBeenCalledTimes(2)
	})

	it("can skip direct root images while still loading container descendants", () => {
		const { manager, requestImmediateImageLoad } = createImmediateMediaManager({
			"direct-image": {
				id: "direct-image",
				type: ElementTypeEnum.Image,
				src: "./images/direct.png",
			},
			"frame-1": {
				id: "frame-1",
				type: ElementTypeEnum.Frame,
				children: [{ id: "image-1", type: ElementTypeEnum.Image, src: "./images/a.png" }],
			},
			"image-1": { id: "image-1", type: ElementTypeEnum.Image, src: "./images/a.png" },
		})

		manager.requestImmediateMediaLoadForElements(["direct-image", "frame-1"], {
			reason: "selection",
			includeDirectImages: false,
		})

		expect(requestImmediateImageLoad).toHaveBeenCalledTimes(1)
		expect(requestImmediateImageLoad).toHaveBeenCalledWith("image-1", {
			reason: "selection",
			priority: "critical",
		})
	})

	it("keeps a shared media request alive until far eviction", () => {
		const manager = Object.create(CanvasVisibilityManager.prototype) as {
			canvas: { magicConfigManager?: { config?: { methods?: unknown } } }
			destroyed: boolean
			getViewportResourceSignal: (
				mediaType: "image" | "video" | "audio",
				path: string,
			) => AbortSignal
			getViewportResourceAbortKey: (
				mediaType: "image" | "video" | "audio",
				path: string,
			) => string
			cancelFarViewportResourceSignals: (activeKeys: Set<string>) => void
			registeredImages: Map<string, { elementId: string; path: string }>
			registeredVideos: Map<string, { elementId: string; path: string }>
			registeredAudios: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<string, unknown>
			lastRequestedVideoLoadState: Map<string, unknown>
			lastRequestedAudioLoadState: Map<string, unknown>
		}
		manager.canvas = {}
		manager.destroyed = false
		manager.registeredImages = new Map([
			["image-1", { elementId: "image-1", path: "./images/a.png" }],
			["image-2", { elementId: "image-2", path: "./images/a.png" }],
			["image-3", { elementId: "image-3", path: "./images/b.png" }],
		])
		manager.registeredVideos = new Map([
			["video-1", { elementId: "video-1", path: "./videos/a.mp4" }],
		])
		manager.registeredAudios = new Map()
		manager.lastRequestedLoadState = new Map([
			["image-1", {}],
			["image-2", {}],
			["image-3", {}],
		])
		manager.lastRequestedVideoLoadState = new Map([["video-1", {}]])
		manager.lastRequestedAudioLoadState = new Map()

		const initialSignal = manager.getViewportResourceSignal("image", "./images/a.png")
		const nextSignal = manager.getViewportResourceSignal("image", "./images/a.png")
		manager.getViewportResourceSignal("image", "./images/b.png")
		manager.getViewportResourceSignal("video", "./videos/a.mp4")
		const resourceKey = manager.getViewportResourceAbortKey("image", "./images/a.png")
		const retainedImageKey = manager.getViewportResourceAbortKey("image", "./images/b.png")
		const retainedVideoKey = manager.getViewportResourceAbortKey("video", "./videos/a.mp4")
		const getResourceKeySpy = vi.spyOn(manager, "getViewportResourceAbortKey")
		getResourceKeySpy.mockClear()

		expect(nextSignal).toBe(initialSignal)
		expect(initialSignal.aborted).toBe(false)
		manager.cancelFarViewportResourceSignals(
			new Set([resourceKey, retainedImageKey, retainedVideoKey]),
		)
		expect(initialSignal.aborted).toBe(false)
		manager.cancelFarViewportResourceSignals(new Set([retainedImageKey, retainedVideoKey]))
		expect(initialSignal.aborted).toBe(true)
		expect(manager.lastRequestedLoadState.has("image-1")).toBe(false)
		expect(manager.lastRequestedLoadState.has("image-2")).toBe(false)
		expect(manager.lastRequestedLoadState.has("image-3")).toBe(true)
		expect(manager.lastRequestedVideoLoadState.has("video-1")).toBe(true)
		expect(getResourceKeySpy).toHaveBeenCalledTimes(4)
	})
})

describe("CanvasVisibilityManager image load priorities", () => {
	function createImageCandidateManager(options?: {
		audio?: Partial<LayerElement>
		frame?: Partial<LayerElement>
		image?: Partial<LayerElement>
		registered?: boolean
		registeredAudio?: boolean
		registeredVideo?: boolean
		video?: Partial<LayerElement>
	}) {
		const manager = Object.create(
			CanvasVisibilityManager.prototype,
		) as CanvasVisibilityManager & {
			canvas: {
				elementManager: {
					getAllElements: () => LayerElement[]
					getElementData: (elementId: string) => LayerElement | undefined
					findParentIdForElement: (elementId: string) => string | undefined
					isElementVisibleInDataTree: (elementId: string) => boolean
				}
				geometryCacheManager: {
					getElementBounds: (
						elementId: string,
					) => { x: number; y: number; width: number; height: number } | null
					queryElementIdsByExpandedRect: (
						rect: { x: number; y: number; width: number; height: number },
						padding: number,
						options?: { elementIds?: Iterable<string> },
					) => string[]
				}
			}
			registeredImages: Map<string, { elementId: string; path: string }>
			registeredVideos: Map<string, { elementId: string; path: string }>
			registeredAudios: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			lastContainerDisplayVariant: Map<string, ImageResourceVariant>
		}
		const imageElement = {
			id: "image-1",
			type: ElementTypeEnum.Image,
			src: "./images/a.png",
			x: 0,
			y: 0,
			width: 200,
			height: 160,
			...options?.image,
		} as LayerElement
		const videoElement = {
			id: "video-1",
			type: ElementTypeEnum.Video,
			src: "./videos/a.mp4",
			x: 20,
			y: 20,
			width: 300,
			height: 180,
			...options?.video,
		} as LayerElement
		const audioElement = {
			id: "audio-1",
			type: ElementTypeEnum.Audio,
			src: "./audios/a.mp3",
			x: 40,
			y: 40,
			width: 240,
			height: 120,
			...options?.audio,
		} as LayerElement
		const frameChildren = [
			imageElement,
			...(options?.video ? [videoElement] : []),
			...(options?.audio ? [audioElement] : []),
		]
		const elements: Record<string, LayerElement> = {
			"frame-1": {
				id: "frame-1",
				type: ElementTypeEnum.Frame,
				x: 0,
				y: 0,
				width: 400,
				height: 300,
				children: frameChildren,
				...options?.frame,
			},
			"image-1": imageElement,
			"video-1": videoElement,
			"audio-1": audioElement,
		}
		manager.canvas = {
			elementManager: {
				getAllElements: () => [elements["frame-1"]],
				getElementData: (elementId: string) => elements[elementId],
				findParentIdForElement: (elementId: string) =>
					elementId === "image-1" || elementId === "video-1" || elementId === "audio-1"
						? "frame-1"
						: undefined,
				isElementVisibleInDataTree: () => true,
			},
			geometryCacheManager: {
				getElementBounds: (elementId: string) =>
					elementId === "frame-1"
						? { x: 0, y: 0, width: 400, height: 300 }
						: elementId === "video-1"
							? { x: 20, y: 20, width: 300, height: 180 }
							: elementId === "audio-1"
								? { x: 40, y: 40, width: 240, height: 120 }
								: { x: 0, y: 0, width: 200, height: 160 },
				queryElementIdsByExpandedRect: (_rect, _padding, options) =>
					Array.from(options?.elementIds ?? []).filter(
						(elementId) => elementId === "frame-1",
					),
			},
		}
		manager.registeredImages =
			options?.registered === false
				? new Map()
				: new Map([["image-1", { elementId: "image-1", path: "./images/a.png" }]])
		manager.registeredVideos =
			options?.registeredVideo === false
				? new Map()
				: new Map([["video-1", { elementId: "video-1", path: "./videos/a.mp4" }]])
		manager.registeredAudios =
			options?.audio && options.registeredAudio !== false
				? new Map([["audio-1", { elementId: "audio-1", path: "./audios/a.mp3" }]])
				: new Map()
		manager.lastRequestedLoadState = new Map()
		manager.lastContainerDisplayVariant = new Map()
		return manager
	}

	function getCollectVisibleContainerImageCandidates(manager: CanvasVisibilityManager) {
		const collectVisibleContainerMediaCandidates = (
			manager as unknown as {
				collectVisibleContainerMediaCandidates: (options: {
					reason: string
					viewportRect: { x: number; y: number; width: number; height: number }
					viewportScale: number
					viewportCenter: { x: number; y: number }
				}) => {
					imageCandidates: ImageCandidate[]
					videoCandidates: VideoCandidate[]
					audioCandidates: AudioCandidate[]
				}
			}
		).collectVisibleContainerMediaCandidates

		return (options: {
			reason: string
			viewportRect: { x: number; y: number; width: number; height: number }
			viewportScale: number
			viewportCenter: { x: number; y: number }
		}) => collectVisibleContainerMediaCandidates.call(manager, options).imageCandidates
	}

	function getCollectVisibleContainerMediaCandidates(manager: CanvasVisibilityManager) {
		return (
			manager as unknown as {
				collectVisibleContainerMediaCandidates: (options: {
					reason: string
					viewportRect: { x: number; y: number; width: number; height: number }
					viewportScale: number
					viewportCenter: { x: number; y: number }
				}) => {
					imageCandidates: ImageCandidate[]
					videoCandidates: VideoCandidate[]
					audioCandidates: AudioCandidate[]
				}
			}
		).collectVisibleContainerMediaCandidates
	}

	it("allows restored viewport visible images to be promoted to critical", () => {
		const manager = createImageCandidateManager()
		const createPrivateCandidate = (
			manager as unknown as {
				createCandidate: (
					elementId: string,
					visibilityState: "visible" | "near",
					viewportScale: number,
					viewportCenter: { x: number; y: number },
					priorityOverride?: ImageResourceLoadPriority,
					viewportRect?: { x: number; y: number; width: number; height: number },
				) => ImageCandidate | null
			}
		).createCandidate

		const candidate = createPrivateCandidate.call(
			manager,
			"image-1",
			"visible",
			1,
			{ x: 0, y: 0 },
			"critical",
		)
		const nearCandidate = createPrivateCandidate.call(manager, "image-1", "near", 1, {
			x: 0,
			y: 0,
		})

		expect(candidate?.priority).toBe("critical")
		expect(nearCandidate?.priority).toBe("near")
	})

	it("uses the visible frame display variant as a lower bound for ordinary child image candidates", () => {
		const manager = createImageCandidateManager({
			image: {
				x: 395,
				y: 295,
				width: 100,
				height: 100,
			},
		})
		const createPrivateCandidate = (
			manager as unknown as {
				createCandidate: (
					elementId: string,
					visibilityState: "visible" | "near",
					viewportScale: number,
					viewportCenter: { x: number; y: number },
					priorityOverride?: ImageResourceLoadPriority,
					viewportRect?: { x: number; y: number; width: number; height: number },
				) => ImageCandidate | null
			}
		).createCandidate

		const candidate = createPrivateCandidate.call(
			manager,
			"image-1",
			"visible",
			1,
			{ x: 250, y: 250 },
			undefined,
			{ x: 0, y: 0, width: 500, height: 500 },
		)

		expect(candidate).toEqual(
			expect.objectContaining({
				elementId: "image-1",
				variant: "preview",
				screenLongEdge: 200,
			}),
		)
	})

	it("does not let the visible frame display variant suppress full ordinary child image candidates", () => {
		const manager = createImageCandidateManager()
		const createPrivateCandidate = (
			manager as unknown as {
				createCandidate: (
					elementId: string,
					visibilityState: "visible" | "near",
					viewportScale: number,
					viewportCenter: { x: number; y: number },
					priorityOverride?: ImageResourceLoadPriority,
					viewportRect?: { x: number; y: number; width: number; height: number },
				) => ImageCandidate | null
			}
		).createCandidate

		const candidate = createPrivateCandidate.call(
			manager,
			"image-1",
			"visible",
			8,
			{ x: 250, y: 250 },
			undefined,
			{ x: 0, y: 0, width: 500, height: 500 },
		)

		expect(candidate).toEqual(
			expect.objectContaining({
				elementId: "image-1",
				variant: "full",
				screenLongEdge: 1600,
			}),
		)
	})

	it("promotes image descendants when their visible frame is in the restored viewport", () => {
		const manager = createImageCandidateManager()
		const collectVisibleContainerImageCandidates =
			getCollectVisibleContainerImageCandidates(manager)

		const candidates = collectVisibleContainerImageCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates).toEqual([
			expect.objectContaining({
				elementId: "image-1",
				path: "./images/a.png",
				priority: "critical",
				visibilityState: "visible",
			}),
		])
	})

	it("still promotes frame descendants that were only found as near images", () => {
		const manager = createImageCandidateManager()
		const collectVisibleContainerImageCandidates =
			getCollectVisibleContainerImageCandidates(manager)

		const candidates = collectVisibleContainerImageCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates[0]?.elementId).toBe("image-1")
		expect(candidates[0]?.priority).toBe("critical")
	})

	it("keeps frame-adjusted candidates even when ordinary visibility also finds the image", () => {
		const manager = createImageCandidateManager()
		const collectVisibleContainerImageCandidates =
			getCollectVisibleContainerImageCandidates(manager)

		const candidates = collectVisibleContainerImageCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates).toEqual([
			expect.objectContaining({
				elementId: "image-1",
				priority: "critical",
			}),
		])
	})

	it("prefetches visible frame descendants before their image element registers", () => {
		const manager = createImageCandidateManager({ registered: false })
		const collectVisibleContainerImageCandidates =
			getCollectVisibleContainerImageCandidates(manager)

		const candidates = collectVisibleContainerImageCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates).toEqual([
			expect.objectContaining({
				elementId: "image-1",
				path: "./images/a.png",
				priority: "critical",
				visibilityState: "visible",
			}),
		])
	})

	it("uses the visible frame display variant as a lower bound for descendants", () => {
		const manager = createImageCandidateManager({
			image: {
				x: 395,
				y: 295,
				width: 100,
				height: 100,
			},
		})
		const collectVisibleContainerImageCandidates =
			getCollectVisibleContainerImageCandidates(manager)

		const candidates = collectVisibleContainerImageCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates).toEqual([
			expect.objectContaining({
				elementId: "image-1",
				variant: "preview",
				screenArea: 25,
				screenLongEdge: 5,
				frameVisibleBounds: { x: 395, y: 295, width: 5, height: 5 },
			}),
		])
	})

	it("does not let the visible frame display variant suppress full descendant image candidates", () => {
		const manager = createImageCandidateManager()
		const collectVisibleContainerImageCandidates =
			getCollectVisibleContainerImageCandidates(manager)

		const candidates = collectVisibleContainerImageCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 8,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates).toEqual([
			expect.objectContaining({
				elementId: "image-1",
				variant: "full",
				screenLongEdge: 1600,
				frameVisibleBounds: { x: 0, y: 0, width: 200, height: 160 },
			}),
		])
	})

	it("promotes visible frame video descendants to poster candidates", () => {
		const manager = createImageCandidateManager({
			video: {},
		})
		const collectVisibleContainerMediaCandidates =
			getCollectVisibleContainerMediaCandidates(manager)

		const candidates = collectVisibleContainerMediaCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates.videoCandidates).toEqual([
			expect.objectContaining({
				elementId: "video-1",
				path: "./videos/a.mp4",
				priority: "critical",
				tier: "poster",
				visibilityState: "visible",
			}),
		])
	})

	it("promotes visible frame audio descendants to critical preload candidates", () => {
		const manager = createImageCandidateManager({ audio: {} })
		const collectVisibleContainerMediaCandidates =
			getCollectVisibleContainerMediaCandidates(manager)

		const candidates = collectVisibleContainerMediaCandidates.call(manager, {
			reason: "viewport:pan",
			viewportRect: { x: 0, y: 0, width: 500, height: 500 },
			viewportScale: 1,
			viewportCenter: { x: 250, y: 250 },
		})

		expect(candidates.audioCandidates).toEqual([
			expect.objectContaining({
				elementId: "audio-1",
				path: "./audios/a.mp3",
				priority: "critical",
				tier: "preload",
				visibilityState: "visible",
			}),
		])
	})

	it("cools down rapid non-critical image variant switches", () => {
		const manager = createImageCandidateManager()
		const shouldRequestImageCandidate = (
			manager as unknown as {
				shouldRequestImageCandidate: (candidate: ImageCandidate) => boolean
			}
		).shouldRequestImageCandidate
		const requestedAt = typeof performance === "undefined" ? Date.now() : performance.now()

		manager.lastRequestedLoadState.set("image-1", {
			priority: "visible",
			variant: "low",
			requestedAt,
		})

		expect(
			shouldRequestImageCandidate.call(manager, {
				elementId: "image-1",
				path: "./images/a.png",
				priority: "visible",
				variant: "preview",
				visibilityState: "visible",
				screenArea: 800 * 800,
				screenLongEdge: 800,
				distanceToViewportCenter: 0,
			}),
		).toBe(false)
		expect(
			shouldRequestImageCandidate.call(manager, {
				elementId: "image-1",
				path: "./images/a.png",
				priority: "critical",
				variant: "preview",
				visibilityState: "visible",
				screenArea: 800 * 800,
				screenLongEdge: 800,
				distanceToViewportCenter: 0,
			}),
		).toBe(true)
	})
})
