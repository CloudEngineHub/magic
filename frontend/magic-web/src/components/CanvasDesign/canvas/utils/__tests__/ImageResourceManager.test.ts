import { describe, expect, it, vi } from "vitest"
import { ImageResourceManager, type ImageResourceVariant } from "../ImageResourceManager"
import { createImageResourceDiagnostics } from "../CanvasResourceDiagnostics"
import {
	DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
	MediaDecodePixelBudgetGate,
} from "../MediaDecodePixelBudget"
import { MediaResourceBodyCache } from "../MediaResourceBodyCache"
import type { DecodedImageRetentionHint } from "../CanvasVisibilityManager"

interface TestImageResource {
	ossSrc: string
	image: ImageBitmap
	imageInfo: {
		naturalWidth: number
		naturalHeight: number
		fileSize: number
		mimeType: string
		filename: string
	}
	variant: ImageResourceVariant
	sourceWidth: number
	sourceHeight: number
	isFullSize: boolean
	closed?: boolean
	displayBlob?: Blob
}

function createImageResource(
	variant: ImageResourceVariant,
	options?: { width?: number; height?: number; close?: () => void; displayBlob?: Blob },
): TestImageResource {
	const width = options?.width ?? 10
	const height = options?.height ?? 10
	return {
		ossSrc: `https://example.test/${variant}.png`,
		image: {
			width,
			height,
			close: options?.close ?? vi.fn(),
		} as unknown as ImageBitmap,
		imageInfo: {
			naturalWidth: width,
			naturalHeight: height,
			fileSize: width * height,
			mimeType: "image/png",
			filename: `${variant}.png`,
		},
		variant,
		sourceWidth: width,
		sourceHeight: height,
		isFullSize: true,
		closed: false,
		displayBlob: options?.displayBlob,
	}
}

function createEntry(overrides: Record<string, unknown> = {}) {
	return {
		ossSrc: null,
		ossSrcFromCachedFallback: false,
		sourceUrl: null,
		expiresAt: null,
		resourceVersion: null,
		sourceUpdatedAt: null,
		contentLength: null,
		exchangePromise: null,
		fullLoadingPromise: null,
		bodyPromise: null,
		bodyPromiseCacheKey: null,
		backgroundRefreshPromise: null,
		displaySlots: {
			low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
			preview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
		},
		fullResource: null,
		fullLastAccessAt: 0,
		lowDisplayLeaseCount: 0,
		lastDecodedBudgetEnforcedAt: 0,
		bodyBlob: null,
		bodyOssSrc: null,
		bodyCacheKey: null,
		bodyByteSize: 0,
		bodyLastAccessAt: 0,
		lastFailureReason: null,
		...overrides,
	}
}

function createManager() {
	const eventEmitter = { emit: vi.fn() }
	const canvasFileUploadManager = { shouldDeferRemoteResourceLoad: vi.fn(() => false) }
	const visibilityManager = {
		getDecodedImageRetentionSnapshot: vi.fn<() => DecodedImageRetentionHint[]>(() => []),
		invalidateImageLoadRequest: vi.fn(),
		isViewportResourceEpochCurrent: vi.fn((epoch: number) => epoch === 1),
	}
	const manager = Object.create(ImageResourceManager.prototype) as {
		canvas: {
			id: string
			eventEmitter: typeof eventEmitter
			canvasFileUploadManager: typeof canvasFileUploadManager
			visibilityManager: typeof visibilityManager
		}
		managerInstanceId: number
		destroyed: boolean
		entries: Map<string, ReturnType<typeof createEntry>>
		previewLoadQueue: unknown[]
		activePreviewLoadPipelineCount: number
		decodePixelBudgetGate: MediaDecodePixelBudgetGate
		bodyCache: MediaResourceBodyCache<ReturnType<typeof createEntry>>
		diagnostics: ReturnType<typeof createImageResourceDiagnostics>
		imageResourceLoadedHandlersByPath: Map<string, Set<unknown>>
		imageResourceLoadFailedHandlersByPath: Map<string, Set<unknown>>
		imageResourceWillCloseHandlersByPath: Map<string, Set<unknown>>
		imageResourceDisplayTargetHandlersByElementId: Map<string, Set<unknown>>
		imageResourceDisplayLoadedHandlersByElementId: Map<string, Set<unknown>>
		urlLifecycle: {
			canonicalResourcePath: (path: string) => string
			clearExpiredOssSrc: () => void
			applyVirtualResourceBypass: () => void
		}
		loadResource: (path: string, options?: Record<string, unknown>) => void
		getSnapshot: () => ReturnType<ImageResourceManager["getSnapshot"]>
		getLowImageUrl: (path: string) => Promise<{
			url: string
			imageInfo: TestImageResource["imageInfo"]
			release: () => void
		} | null>
	}
	manager.canvas = { id: "test-canvas", eventEmitter, canvasFileUploadManager, visibilityManager }
	manager.managerInstanceId = 1
	manager.destroyed = false
	manager.entries = new Map()
	manager.previewLoadQueue = []
	manager.activePreviewLoadPipelineCount = 0
	manager.decodePixelBudgetGate = new MediaDecodePixelBudgetGate(
		DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
	)
	manager.bodyCache = new MediaResourceBodyCache({ ttlMs: 120_000, maxBytes: 256 * 1024 * 1024 })
	manager.diagnostics = createImageResourceDiagnostics()
	manager.imageResourceLoadedHandlersByPath = new Map()
	manager.imageResourceLoadFailedHandlersByPath = new Map()
	manager.imageResourceWillCloseHandlersByPath = new Map()
	manager.imageResourceDisplayTargetHandlersByElementId = new Map()
	manager.imageResourceDisplayLoadedHandlersByElementId = new Map()
	manager.urlLifecycle = {
		canonicalResourcePath: (path: string) => path,
		clearExpiredOssSrc: vi.fn(),
		applyVirtualResourceBypass: vi.fn(),
	}
	return { manager, eventEmitter, visibilityManager }
}

type EnforceDecodedBitmapBudget = (options: {
	reason: string
	exemptResource?: TestImageResource
	softBudgetBytes?: number
	hardBudgetBytes?: number
	fullBudgetBytes?: number
}) => void

function enforceDecodedBitmapBudget(
	manager: ReturnType<typeof createManager>["manager"],
	options: Parameters<EnforceDecodedBitmapBudget>[0],
) {
	;(
		manager as unknown as { enforceDecodedBitmapBudget: EnforceDecodedBitmapBudget }
	).enforceDecodedBitmapBudget(options)
}

function setDisplayResource(
	manager: ReturnType<typeof createManager>["manager"],
	entry: ReturnType<typeof createEntry>,
	variant: "low" | "preview",
	resource: TestImageResource | null,
) {
	;(
		manager as unknown as {
			setDisplayResource: (
				entry: ReturnType<typeof createEntry>,
				variant: "low" | "preview",
				resource: TestImageResource | null,
				options: { closePrevious: boolean },
			) => void
		}
	).setDisplayResource(entry, variant, resource, { closePrevious: false })
}

function installImmediateAnimationFrame() {
	const originalRequestAnimationFrame = globalThis.requestAnimationFrame
	vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
		callback(Date.now())
		return 1
	})
	return () => {
		if (originalRequestAnimationFrame) {
			vi.stubGlobal("requestAnimationFrame", originalRequestAnimationFrame)
			return
		}
		Reflect.deleteProperty(globalThis, "requestAnimationFrame")
	}
}

describe("ImageResourceManager image resources", () => {
	it("drops stale viewport loads before starting resource work", async () => {
		const { manager, eventEmitter } = createManager()
		const loadImageInternal = (
			manager as unknown as {
				loadImageInternal: (
					path: string,
					options: {
						variant: ImageResourceVariant
						viewportEpoch: number
						dropIfViewportStale: boolean
					},
				) => Promise<unknown>
			}
		).loadImageInternal

		const result = await loadImageInternal.call(manager, "./images/stale.png", {
			variant: "preview",
			viewportEpoch: 0,
			dropIfViewportStale: true,
		})

		expect(result).toBeNull()
		expect(manager.getSnapshot().staleRequestDropCount).toBe(1)
		expect(eventEmitter.emit).not.toHaveBeenCalled()
	})

	it("drops stale viewport loads after body fetch before decode", async () => {
		const { manager, visibilityManager } = createManager()
		const loadImageResource = (
			manager as unknown as {
				loadImageResource: (
					path: string,
					ossSrc: string,
					entry: ReturnType<typeof createEntry>,
					variant: ImageResourceVariant,
					priority: "visible",
					retryCount: number,
					options: {
						viewportEpoch: number
						dropIfViewportStale: boolean
					},
				) => Promise<unknown>
				loadImageBody: ReturnType<typeof vi.fn>
				estimateImageDecodePixelCost: ReturnType<typeof vi.fn>
			}
		).loadImageResource
		const entry = createEntry()
		manager.entries.set("images/body-stale.png", entry)
		;(manager as unknown as { loadImageBody: ReturnType<typeof vi.fn> }).loadImageBody = vi.fn(
			async () => ({
				blob: new Blob(["body"]),
				ossSrc: "https://example.test/body-stale.png",
				cacheKey: "body-stale",
				byteSize: 4,
			}),
		)
		;(
			manager as unknown as { estimateImageDecodePixelCost: ReturnType<typeof vi.fn> }
		).estimateImageDecodePixelCost = vi.fn()
		visibilityManager.isViewportResourceEpochCurrent.mockReturnValue(false)

		const result = await loadImageResource.call(
			manager,
			"images/body-stale.png",
			"https://example.test/body-stale.png",
			entry,
			"preview",
			"visible",
			0,
			{ viewportEpoch: 1, dropIfViewportStale: true },
		)

		expect(result).toBeNull()
		expect(
			(manager as unknown as { estimateImageDecodePixelCost: ReturnType<typeof vi.fn> })
				.estimateImageDecodePixelCost,
		).not.toHaveBeenCalled()
		expect(manager.getSnapshot().staleRequestDropCount).toBe(1)
	})

	it("closes decoded image results when the viewport epoch goes stale before commit", async () => {
		const { manager, visibilityManager } = createManager()
		const close = vi.fn()
		const release = vi.fn()
		let isCurrent = true
		visibilityManager.isViewportResourceEpochCurrent.mockImplementation(() => isCurrent)
		;(
			manager.canvas as unknown as {
				resourceScheduler: {
					run: ReturnType<typeof vi.fn>
				}
			}
		).resourceScheduler = {
			run: vi.fn(async (_kind: string, task: () => Promise<unknown>) => {
				const result = await task()
				isCurrent = false
				return result
			}),
		}
		const entry = createEntry()
		manager.entries.set("images/decode-stale.png", entry)
		;(manager as unknown as { loadImageBody: ReturnType<typeof vi.fn> }).loadImageBody = vi.fn(
			async () => ({
				blob: new Blob(["body"]),
				ossSrc: "https://example.test/decode-stale.png",
				cacheKey: "decode-stale",
				byteSize: 4,
			}),
		)
		;(
			manager as unknown as { estimateImageDecodePixelCost: ReturnType<typeof vi.fn> }
		).estimateImageDecodePixelCost = vi.fn(async () => 1)
		;(
			manager as unknown as { acquireImageDecodePermit: ReturnType<typeof vi.fn> }
		).acquireImageDecodePermit = vi.fn(async () => release)
		;(manager as unknown as { sendToWorker: ReturnType<typeof vi.fn> }).sendToWorker = vi.fn(
			async () => ({
				imageSource: { width: 10, height: 10, close } as unknown as ImageBitmap,
				imageInfo: {
					naturalWidth: 10,
					naturalHeight: 10,
					fileSize: 100,
					mimeType: "image/png",
					filename: "decode-stale.png",
				},
				variant: "preview",
			}),
		)

		const result = await (
			manager as unknown as {
				loadImageResource: (
					path: string,
					ossSrc: string,
					entry: ReturnType<typeof createEntry>,
					variant: ImageResourceVariant,
					priority: "visible",
					retryCount: number,
					options: {
						viewportEpoch: number
						dropIfViewportStale: boolean
					},
				) => Promise<unknown>
			}
		).loadImageResource.call(
			manager,
			"images/decode-stale.png",
			"https://example.test/decode-stale.png",
			entry,
			"preview",
			"visible",
			0,
			{ viewportEpoch: 1, dropIfViewportStale: true },
		)

		expect(result).toBeNull()
		expect(close).toHaveBeenCalledTimes(1)
		expect(release).toHaveBeenCalledTimes(1)
		expect(entry.displaySlots.preview.resource).toBeNull()
		expect(manager.getSnapshot().staleRequestDropCount).toBe(1)
	})

	it("keeps non-viewport loads active even when the viewport epoch would be stale", async () => {
		const { manager, visibilityManager } = createManager()
		const previewResource = createImageResource("preview")
		const entry = createEntry({
			displaySlots: {
				low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				preview: {
					resource: previewResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
			},
		})
		manager.entries.set("images/non-viewport.png", entry)
		visibilityManager.isViewportResourceEpochCurrent.mockReturnValue(false)

		const result = await (
			manager as unknown as {
				loadImageInternal: (
					path: string,
					options: { variant: ImageResourceVariant },
				) => Promise<unknown>
			}
		).loadImageInternal.call(manager, "images/non-viewport.png", { variant: "preview" })

		expect(result).toEqual(
			expect.objectContaining({
				image: previewResource.image,
				variant: "preview",
			}),
		)
		expect(manager.getSnapshot().staleRequestDropCount).toBe(0)
	})

	it("emits targeted display-loaded only for display-driven full loads", async () => {
		const { manager, eventEmitter } = createManager()
		const fullResource = createImageResource("full")
		const loadImageInternal = vi.fn(async () => fullResource)
		;(manager as unknown as { loadImageInternal: typeof loadImageInternal }).loadImageInternal =
			loadImageInternal

		manager.loadResource("./images/full.png", {
			variant: "full",
			displayTargetElementId: "image-1",
			displayTargetReason: "viewport:scale",
		})

		await vi.waitFor(() => {
			expect(eventEmitter.emit).toHaveBeenCalledWith({
				type: "resource:image:display-loaded",
				data: {
					elementId: "image-1",
					path: "./images/full.png",
					resource: fullResource,
					reason: "viewport:scale",
				},
			})
		})
		expect(eventEmitter.emit).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "resource:image:loaded" }),
		)
	})

	it("does not emit display-loaded for non-display full loads", async () => {
		const { manager, eventEmitter } = createManager()
		const fullResource = createImageResource("full")
		const loadImageInternal = vi.fn(async () => fullResource)
		;(manager as unknown as { loadImageInternal: typeof loadImageInternal }).loadImageInternal =
			loadImageInternal

		manager.loadResource("./images/full.png", { variant: "full" })

		await vi.waitFor(() => {
			expect(loadImageInternal).toHaveBeenCalled()
		})
		expect(eventEmitter.emit).not.toHaveBeenCalled()
	})

	it("migrates cached body keys after missing metadata is hydrated", () => {
		const { manager } = createManager()
		const entry = createEntry({
			bodyBlob: new Blob([new Uint8Array(10)]),
			bodyOssSrc: "/virtual/image.png",
			bodyCacheKey: "images/a.png::123",
			bodyByteSize: 10,
			bodyLastAccessAt: Date.now(),
			resourceVersion: "v1",
			sourceUpdatedAt: "2030-01-01T00:00:00Z",
			contentLength: 123,
		})
		const migrateBodyCacheKeyAfterMetadataHydration = (
			manager as unknown as {
				migrateBodyCacheKeyAfterMetadataHydration: (
					normalizedSrc: string,
					targetEntry: typeof entry,
				) => void
			}
		).migrateBodyCacheKeyAfterMetadataHydration.bind(manager)

		migrateBodyCacheKeyAfterMetadataHydration("images/a.png", entry)

		expect(entry.bodyCacheKey).toBe("images/a.png::v1")
		expect(
			manager.bodyCache.getReusableBody(entry, "/virtual/image.png", "images/a.png::v1"),
		).toEqual(
			expect.objectContaining({
				blob: entry.bodyBlob,
				cacheKey: "images/a.png::v1",
				byteSize: 10,
			}),
		)
	})

	it("migrates cached body keys when hydrated content length differs from the fallback key", () => {
		const { manager } = createManager()
		const entry = createEntry({
			bodyBlob: new Blob([new Uint8Array(10)]),
			bodyOssSrc: "/virtual/image.png",
			bodyCacheKey: "images/a.png::121964",
			bodyByteSize: 10,
			bodyLastAccessAt: Date.now(),
			resourceVersion: "file-version:1551516",
			sourceUpdatedAt: "2030-01-01T00:00:00Z",
			contentLength: 1551516,
		})
		const migrateBodyCacheKeyAfterMetadataHydration = (
			manager as unknown as {
				migrateBodyCacheKeyAfterMetadataHydration: (
					normalizedSrc: string,
					targetEntry: typeof entry,
				) => void
			}
		).migrateBodyCacheKeyAfterMetadataHydration.bind(manager)

		migrateBodyCacheKeyAfterMetadataHydration("images/a.png", entry)

		expect(entry.bodyCacheKey).toBe("images/a.png::file-version:1551516")
		expect(
			manager.bodyCache.getReusableBody(
				entry,
				"/virtual/image.png",
				"images/a.png::file-version:1551516",
			),
		).toEqual(
			expect.objectContaining({
				blob: entry.bodyBlob,
				cacheKey: "images/a.png::file-version:1551516",
				byteSize: 10,
			}),
		)
	})

	it("returns a releasable URL for the low display variant", async () => {
		const { manager } = createManager()
		const displayBlob = new Blob(["low"], { type: "image/webp" })
		const lowResource = createImageResource("low", { displayBlob })
		const entry = createEntry({
			displaySlots: {
				low: {
					resource: lowResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				preview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
			},
		})
		manager.entries.set("image/path.png", entry)

		const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:low")
		const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)

		try {
			const loaded = await manager.getLowImageUrl("image/path.png")

			expect(loaded).toEqual({
				url: "blob:low",
				imageInfo: lowResource.imageInfo,
				release: expect.any(Function),
			})
			expect(createObjectURL).toHaveBeenCalledWith(displayBlob)
			expect(entry.lowDisplayLeaseCount).toBe(1)

			loaded?.release()
			loaded?.release()
			expect(entry.lowDisplayLeaseCount).toBe(0)
			expect(revokeObjectURL).toHaveBeenCalledTimes(1)
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:low")
		} finally {
			createObjectURL.mockRestore()
			revokeObjectURL.mockRestore()
		}
	})

	it("skips decoded budget candidate scans while tracked bytes are below budget", () => {
		const { manager } = createManager()
		const entry = createEntry()
		const previewResource = createImageResource("preview", {
			width: 10,
			height: 10,
		})
		manager.entries.set("tracked-preview.png", entry)
		setDisplayResource(manager, entry, "preview", previewResource)
		const collectCandidates = vi.spyOn(
			manager as unknown as {
				collectDecodedBitmapBudgetCandidates: () => unknown
			},
			"collectDecodedBitmapBudgetCandidates",
		)

		enforceDecodedBitmapBudget(manager, {
			reason: "below-budget",
			softBudgetBytes: 1000,
			hardBudgetBytes: 1000,
			fullBudgetBytes: Number.MAX_SAFE_INTEGER,
		})

		expect(collectCandidates).not.toHaveBeenCalled()
	})

	it("evicts full decoded resources before old preview resources under budget pressure", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager, eventEmitter } = createManager()
			const fullClose = vi.fn()
			const oldPreviewClose = vi.fn()
			const newPreviewClose = vi.fn()
			const fullResource = createImageResource("full", {
				width: 10,
				height: 10,
				close: fullClose,
			})
			const oldPreviewResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: oldPreviewClose,
			})
			const newPreviewResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: newPreviewClose,
			})
			const fullEntry = createEntry({
				fullResource,
				fullLastAccessAt: 30,
			})
			const oldPreviewEntry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: oldPreviewResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 10,
					},
				},
			})
			const newPreviewEntry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: newPreviewResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 20,
					},
				},
			})
			manager.entries.set("full.png", fullEntry)
			manager.entries.set("old-preview.png", oldPreviewEntry)
			manager.entries.set("new-preview.png", newPreviewEntry)

			enforceDecodedBitmapBudget(manager, {
				reason: "unit-test",
				softBudgetBytes: 400,
				hardBudgetBytes: 400,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(fullEntry.fullResource).toBeNull()
			expect(oldPreviewEntry.displaySlots.preview.resource).toBeNull()
			expect(newPreviewEntry.displaySlots.preview.resource).toBe(newPreviewResource)
			expect(fullClose).toHaveBeenCalledTimes(1)
			expect(oldPreviewClose).toHaveBeenCalledTimes(1)
			expect(newPreviewClose).not.toHaveBeenCalled()
			expect(eventEmitter.emit).toHaveBeenCalledWith(
				expect.objectContaining({
					type: "resource:image:will-close",
					data: expect.objectContaining({
						path: "full.png",
						variant: "full",
						reason: "decoded-budget:unit-test",
					}),
				}),
			)

			const snapshot = manager.getSnapshot()
			expect(snapshot.decodedBytesTotal).toBe(400)
			expect(snapshot.decodedEvictedCount).toBe(2)
			expect(snapshot.decodedEvictedFull).toBe(1)
			expect(snapshot.decodedEvictedPreview).toBe(1)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("invalidates visibility image load request state after decoded eviction", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager, visibilityManager } = createManager()
			const previewResource = createImageResource("preview", {
				width: 10,
				height: 10,
			})
			const entry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: previewResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 1,
					},
				},
			})
			manager.entries.set("image/path.png", entry)

			enforceDecodedBitmapBudget(manager, {
				reason: "request-invalidation",
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(entry.displaySlots.preview.resource).toBeNull()
			expect(visibilityManager.invalidateImageLoadRequest).toHaveBeenCalledWith(
				"image/path.png",
				"preview",
				"decoded-budget",
				{ scheduleRefresh: true },
			)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("clears full decoded eviction dedupe state without scheduling an immediate reload", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager, visibilityManager } = createManager()
			const fullResource = createImageResource("full", {
				width: 10,
				height: 10,
			})
			const entry = createEntry({
				fullResource,
				fullLastAccessAt: 1,
			})
			manager.entries.set("image/full.png", entry)

			enforceDecodedBitmapBudget(manager, {
				reason: "full-request-invalidation",
				softBudgetBytes: 1000,
				hardBudgetBytes: 1000,
				fullBudgetBytes: 0,
			})

			expect(entry.fullResource).toBeNull()
			expect(visibilityManager.invalidateImageLoadRequest).toHaveBeenCalledWith(
				"image/full.png",
				"full",
				"decoded-budget",
				{ scheduleRefresh: false },
			)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("protects recently used full resources from soft full-budget eviction", () => {
		const { manager, visibilityManager } = createManager()
		const fullResource = createImageResource("full", {
			width: 10,
			height: 10,
		})
		const entry = createEntry({
			fullResource,
			fullLastAccessAt: Date.now(),
		})
		manager.entries.set("image/recent-full.png", entry)

		enforceDecodedBitmapBudget(manager, {
			reason: "recent-full",
			softBudgetBytes: 1000,
			hardBudgetBytes: 1000,
			fullBudgetBytes: 0,
		})

		expect(entry.fullResource).toBe(fullResource)
		expect(visibilityManager.invalidateImageLoadRequest).not.toHaveBeenCalled()
	})

	it("protects active low display leases and allows low eviction after release", async () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:leased-low")
		const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
		try {
			const { manager } = createManager()
			const lowClose = vi.fn()
			const displayBlob = new Blob(["low"], { type: "image/webp" })
			const lowResource = createImageResource("low", {
				width: 10,
				height: 10,
				close: lowClose,
				displayBlob,
			})
			const entry = createEntry({
				displaySlots: {
					low: {
						resource: lowResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 1,
					},
					preview: {
						resource: null,
						loadingPromise: null,
						version: null,
						lastAccessAt: 0,
					},
				},
			})
			manager.entries.set("image/path.png", entry)

			const loaded = await manager.getLowImageUrl("image/path.png")

			expect(loaded?.url).toBe("blob:leased-low")
			expect(entry.lowDisplayLeaseCount).toBe(1)

			enforceDecodedBitmapBudget(manager, {
				reason: "active-low-lease",
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(entry.displaySlots.low.resource).toBe(lowResource)
			expect(lowClose).not.toHaveBeenCalled()

			loaded?.release()
			loaded?.release()
			expect(entry.lowDisplayLeaseCount).toBe(0)
			expect(revokeObjectURL).toHaveBeenCalledTimes(1)

			enforceDecodedBitmapBudget(manager, {
				reason: "released-low-lease",
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(entry.displaySlots.low.resource).toBeNull()
			expect(lowClose).toHaveBeenCalledTimes(1)
			expect(manager.getSnapshot().decodedEvictedLow).toBe(1)
		} finally {
			createObjectURL.mockRestore()
			revokeObjectURL.mockRestore()
			restoreAnimationFrame()
		}
	})

	it("does not evict the exempt resource during the same budget pass", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager } = createManager()
			const exemptClose = vi.fn()
			const oldClose = vi.fn()
			const exemptResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: exemptClose,
			})
			const oldResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: oldClose,
			})
			const exemptEntry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: exemptResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 20,
					},
				},
			})
			const oldEntry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: oldResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 10,
					},
				},
			})
			manager.entries.set("exempt.png", exemptEntry)
			manager.entries.set("old.png", oldEntry)

			enforceDecodedBitmapBudget(manager, {
				reason: "exempt",
				exemptResource,
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(exemptEntry.displaySlots.preview.resource).toBe(exemptResource)
			expect(oldEntry.displaySlots.preview.resource).toBeNull()
			expect(exemptClose).not.toHaveBeenCalled()
			expect(oldClose).toHaveBeenCalledTimes(1)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("keeps visible displayed full decoded resources even when full budget is exceeded", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager, visibilityManager } = createManager()
			const fullClose = vi.fn()
			const fullResource = createImageResource("full", {
				width: 20,
				height: 20,
				close: fullClose,
			})
			const entry = createEntry({
				fullResource,
				fullLastAccessAt: 1,
			})
			manager.entries.set("image/path.png", entry)
			visibilityManager.getDecodedImageRetentionSnapshot.mockReturnValue([
				{
					elementId: "image-1",
					path: "image/path.png",
					visibilityState: "visible",
					displayedVariant: "full",
					requestedVariant: "full",
					screenLongEdge: 2400,
					lastSeenAt: 1,
				},
			])

			enforceDecodedBitmapBudget(manager, {
				reason: "visible-full",
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: 0,
			})

			expect(entry.fullResource).toBe(fullResource)
			expect(fullClose).not.toHaveBeenCalled()
			const snapshot = manager.getSnapshot()
			expect(snapshot.decodedPinnedBytes).toBe(1600)
			expect(snapshot.decodedPinnedCount).toBe(1)
			expect(snapshot.decodedVisiblePinnedCount).toBe(1)
			expect(snapshot.decodedEvictedFull).toBe(0)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("keeps visible requested full resources before they are applied to the element", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager, visibilityManager } = createManager()
			const fullClose = vi.fn()
			const previewClose = vi.fn()
			const fullResource = createImageResource("full", {
				width: 10,
				height: 10,
				close: fullClose,
			})
			const previewResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: previewClose,
			})
			const entry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: previewResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 1,
					},
				},
				fullResource,
				fullLastAccessAt: 1,
			})
			manager.entries.set("image/path.png", entry)
			visibilityManager.getDecodedImageRetentionSnapshot.mockReturnValue([
				{
					elementId: "image-1",
					path: "image/path.png",
					visibilityState: "visible",
					displayedVariant: "preview",
					requestedVariant: "full",
					screenLongEdge: 1800,
					lastSeenAt: 1,
				},
			])

			enforceDecodedBitmapBudget(manager, {
				reason: "visible-requested-full",
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: 0,
			})

			expect(entry.fullResource).toBe(fullResource)
			expect(entry.displaySlots.preview.resource).toBe(previewResource)
			expect(fullClose).not.toHaveBeenCalled()
			expect(previewClose).not.toHaveBeenCalled()
			expect(manager.getSnapshot().decodedVisiblePinnedCount).toBe(2)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("keeps near protected resources during soft pressure and evicts them last under hard pressure", () => {
		const restoreAnimationFrame = installImmediateAnimationFrame()
		try {
			const { manager, visibilityManager } = createManager()
			const nearClose = vi.fn()
			const unprotectedClose = vi.fn()
			const nearPreviewResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: nearClose,
			})
			const unprotectedPreviewResource = createImageResource("preview", {
				width: 10,
				height: 10,
				close: unprotectedClose,
			})
			const nearEntry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: nearPreviewResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 1,
					},
				},
			})
			const unprotectedEntry = createEntry({
				displaySlots: {
					low: { resource: null, loadingPromise: null, version: null, lastAccessAt: 0 },
					preview: {
						resource: unprotectedPreviewResource,
						loadingPromise: null,
						version: null,
						lastAccessAt: 1,
					},
				},
			})
			manager.entries.set("near.png", nearEntry)
			manager.entries.set("unprotected.png", unprotectedEntry)
			visibilityManager.getDecodedImageRetentionSnapshot.mockReturnValue([
				{
					elementId: "near-image",
					path: "near.png",
					visibilityState: "near",
					displayedVariant: "preview",
					requestedVariant: "preview",
					screenLongEdge: 500,
					lastSeenAt: 1,
				},
			])

			enforceDecodedBitmapBudget(manager, {
				reason: "near-soft",
				softBudgetBytes: 400,
				hardBudgetBytes: 800,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(nearEntry.displaySlots.preview.resource).toBe(nearPreviewResource)
			expect(unprotectedEntry.displaySlots.preview.resource).toBeNull()
			expect(nearClose).not.toHaveBeenCalled()
			expect(unprotectedClose).toHaveBeenCalledTimes(1)
			expect(manager.getSnapshot().decodedNearProtectedCount).toBe(1)

			enforceDecodedBitmapBudget(manager, {
				reason: "near-hard",
				softBudgetBytes: 0,
				hardBudgetBytes: 0,
				fullBudgetBytes: Number.MAX_SAFE_INTEGER,
			})

			expect(nearEntry.displaySlots.preview.resource).toBeNull()
			expect(nearClose).toHaveBeenCalledTimes(1)
			expect(manager.getSnapshot().decodedEvictedPreview).toBe(2)
		} finally {
			restoreAnimationFrame()
		}
	})

	it("refreshes the full variant when full was already loaded", () => {
		const { manager } = createManager()
		const entry = createEntry({
			displaySlots: {
				low: {
					resource: createImageResource("low"),
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				preview: {
					resource: createImageResource("preview"),
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
			},
			fullResource: createImageResource("full"),
		})
		const getVariantsToRefresh = (
			manager as unknown as {
				getVariantsToRefresh: (targetEntry: typeof entry) => ImageResourceVariant[]
			}
		).getVariantsToRefresh.bind(manager)

		expect(getVariantsToRefresh(entry)).toEqual(["low", "preview", "full"])
	})

	it("falls back to preview refresh when no variant is loaded yet", () => {
		const { manager } = createManager()
		const entry = createEntry()
		const getVariantsToRefresh = (
			manager as unknown as {
				getVariantsToRefresh: (targetEntry: typeof entry) => ImageResourceVariant[]
			}
		).getVariantsToRefresh.bind(manager)

		expect(getVariantsToRefresh(entry)).toEqual(["preview"])
	})
})

describe("ImageResourceManager load priority defaults", () => {
	type GetPriorityForVariant = (
		variant: ImageResourceVariant,
		priority?: "critical" | "visible" | "near" | "background",
	) => "critical" | "visible" | "near" | "background"

	it("preserves explicit priority for body fetch and decode scheduling", () => {
		const manager = Object.create(ImageResourceManager.prototype) as {
			getBodyFetchPriorityForVariant: GetPriorityForVariant
			getDecodePriorityForVariant: GetPriorityForVariant
		}

		expect(manager.getBodyFetchPriorityForVariant("low", "critical")).toBe("critical")
		expect(manager.getBodyFetchPriorityForVariant("preview", "critical")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("low", "critical")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("preview", "critical")).toBe("critical")
	})

	it("keeps existing variant-based priority defaults when no priority is supplied", () => {
		const manager = Object.create(ImageResourceManager.prototype) as {
			getBodyFetchPriorityForVariant: GetPriorityForVariant
			getDecodePriorityForVariant: GetPriorityForVariant
		}

		expect(manager.getBodyFetchPriorityForVariant("full")).toBe("critical")
		expect(manager.getBodyFetchPriorityForVariant("preview")).toBe("visible")
		expect(manager.getBodyFetchPriorityForVariant("low")).toBe("near")
		expect(manager.getDecodePriorityForVariant("full")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("preview")).toBe("visible")
		expect(manager.getDecodePriorityForVariant("low")).toBe("background")
	})
})
