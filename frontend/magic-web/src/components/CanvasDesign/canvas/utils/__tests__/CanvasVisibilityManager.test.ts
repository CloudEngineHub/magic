import { describe, expect, it, vi } from "vitest"
import { CanvasVisibilityManager } from "../CanvasVisibilityManager"
import type { ImageResourceLoadPriority, ImageResourceVariant } from "../ImageResourceManager"
import { ElementTypeEnum, type LayerElement } from "../../types"

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
	return { contentLayer, ensureFreshOssInfo, handlers, manager, requestPreviewLoad }
}

type RequestVideoLoad = (candidate: VideoCandidate, reason: string, force?: boolean) => void
type ShouldRequestImageCandidate = (candidate: ImageCandidate) => boolean

describe("CanvasVisibilityManager video load requests", () => {
	it("dedupes repeated near video url prewarm candidates", () => {
		const { ensureFreshOssInfo, manager, requestPreviewLoad } = createManager()
		const requestVideoLoad = (manager as unknown as { requestVideoLoad: RequestVideoLoad })
			.requestVideoLoad

		requestVideoLoad.call(manager, createCandidate("near"), "test")
		requestVideoLoad.call(manager, createCandidate("near"), "test")

		expect(ensureFreshOssInfo).toHaveBeenCalledTimes(1)
		expect(ensureFreshOssInfo).toHaveBeenCalledWith("./videos/a.mp4", {
			allowCachedFallback: true,
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

describe("CanvasVisibilityManager image load requests", () => {
	it("passes display target metadata to image resource loads", () => {
		const emitImageResourceDisplayTarget = vi.fn()
		const loadResource = vi.fn()
		const manager = Object.create(CanvasVisibilityManager.prototype) as {
			canvas: {
				imageResourceManager: {
					emitImageResourceDisplayTarget: typeof emitImageResourceDisplayTarget
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
			imageResourceManager: { emitImageResourceDisplayTarget, loadResource },
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

		expect(emitImageResourceDisplayTarget).toHaveBeenCalledWith({
			elementId: "image-1",
			path: "./images/a.png",
			variant: "full",
			reason: "viewport:scale",
		})
		expect(loadResource).toHaveBeenCalledWith("./images/a.png", {
			variant: "full",
			priority: "visible",
			displayTargetElementId: "image-1",
			displayTargetReason: "viewport:scale",
		})
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

describe("CanvasVisibilityManager content layer hit graph suppression", () => {
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
					isElementVisibleInDataTree: () => boolean
				}
				geometryCacheManager: {
					getElementBounds: () => { x: number; y: number; width: number; height: number }
					queryElementIdsByExpandedRect: typeof queryElementIdsByExpandedRect
				}
			}
			registeredImages: Map<string, { elementId: string; path: string }>
			registeredVideos: Map<string, { elementId: string; path: string }>
			lastRequestedLoadState: Map<
				string,
				{
					priority: ImageResourceLoadPriority
					variant: ImageResourceVariant
					requestedAt: number
				}
			>
			lastRequestedVideoLoadState: Map<string, unknown>
			lastVisibilityState: Map<string, string>
			lastVideoVisibilityState: Map<string, string>
			lastContainerDisplayVariant: Map<string, ImageResourceVariant>
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
				isElementVisibleInDataTree: () => true,
			},
			geometryCacheManager: {
				getElementBounds: () => ({ x: 0, y: 0, width: 1000, height: 800 }),
				queryElementIdsByExpandedRect,
			},
		}
		manager.registeredImages = new Map([
			["image-1", { elementId: "image-1", path: "./images/a.png" }],
		])
		manager.registeredVideos = new Map()
		manager.lastRequestedLoadState = new Map()
		manager.lastRequestedVideoLoadState = new Map()
		manager.lastVisibilityState = new Map()
		manager.lastVideoVisibilityState = new Map()
		manager.lastContainerDisplayVariant = new Map()
		manager.initialVisibleCriticalUntil = 0
		manager.statsSnapshot = {
			registeredImageCount: 0,
			registeredVideoCount: 0,
			registerDedupedCount: 0,
			videoRegisterDedupedCount: 0,
			lowFallbackPreviewCount: 0,
			visibleImageCount: 0,
			nearImageCount: 0,
			farImageCount: 0,
			visibleVideoCount: 0,
			nearVideoCount: 0,
			farVideoCount: 0,
			lastQueryDurationMs: 0,
			lastRequestedVisibleCount: 0,
			lastRequestedNearCount: 0,
			lastRequestedVisibleVideoCount: 0,
			lastRequestedNearVideoCount: 0,
			lowDetailVisibleVideoCount: 0,
			pendingLowDetailVisibleVideoLoadCandidateCount: 0,
			pendingImageLoadCandidateCount: 0,
			pendingVideoLoadCandidateCount: 0,
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
				visibilityState: "visible",
			}),
			"viewport:pan",
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
})

describe("CanvasVisibilityManager image load priorities", () => {
	function createImageCandidateManager(options?: {
		frame?: Partial<LayerElement>
		image?: Partial<LayerElement>
		registered?: boolean
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
		const frameChildren = options?.video ? [imageElement, videoElement] : [imageElement]
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
		}
		manager.canvas = {
			elementManager: {
				getAllElements: () => [elements["frame-1"]],
				getElementData: (elementId: string) => elements[elementId],
				findParentIdForElement: (elementId: string) =>
					elementId === "image-1" || elementId === "video-1" ? "frame-1" : undefined,
				isElementVisibleInDataTree: () => true,
			},
			geometryCacheManager: {
				getElementBounds: (elementId: string) =>
					elementId === "frame-1"
						? { x: 0, y: 0, width: 400, height: 300 }
						: elementId === "video-1"
							? { x: 20, y: 20, width: 300, height: 180 }
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
