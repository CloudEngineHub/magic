import { describe, expect, it, vi } from "vitest"
import { ImageResourceManager, type ImageResourceVariant } from "../ImageResourceManager"
import { createImageResourceDiagnostics } from "../CanvasResourceDiagnostics"
import {
	DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
	MediaDecodePixelBudgetGate,
} from "../MediaDecodePixelBudget"
import { MediaResourceBodyCache } from "../MediaResourceBodyCache"

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
	const manager = Object.create(ImageResourceManager.prototype) as ImageResourceManager & {
		canvas: { id: string; eventEmitter: typeof eventEmitter }
		managerInstanceId: number
		destroyed: boolean
		entries: Map<string, ReturnType<typeof createEntry>>
		previewLoadQueue: unknown[]
		activePreviewLoadPipelineCount: number
		decodePixelBudgetGate: MediaDecodePixelBudgetGate
		bodyCache: MediaResourceBodyCache<ReturnType<typeof createEntry>>
		diagnostics: ReturnType<typeof createImageResourceDiagnostics>
		urlLifecycle: {
			canonicalResourcePath: (path: string) => string
			clearExpiredOssSrc: () => void
			applyVirtualResourceBypass: () => void
		}
	}
	manager.canvas = { id: "test-canvas", eventEmitter }
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
	manager.urlLifecycle = {
		canonicalResourcePath: (path: string) => path,
		clearExpiredOssSrc: vi.fn(),
		applyVirtualResourceBypass: vi.fn(),
	}
	return { manager, eventEmitter }
}

describe("ImageResourceManager image resources", () => {
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

			loaded?.release()
			loaded?.release()
			expect(revokeObjectURL).toHaveBeenCalledTimes(1)
			expect(revokeObjectURL).toHaveBeenCalledWith("blob:low")
		} finally {
			createObjectURL.mockRestore()
			revokeObjectURL.mockRestore()
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
		const manager = Object.create(ImageResourceManager.prototype) as ImageResourceManager & {
			getBodyFetchPriorityForVariant: GetPriorityForVariant
			getDecodePriorityForVariant: GetPriorityForVariant
		}

		expect(manager.getBodyFetchPriorityForVariant("low", "critical")).toBe("critical")
		expect(manager.getBodyFetchPriorityForVariant("preview", "critical")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("low", "critical")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("preview", "critical")).toBe("critical")
	})

	it("keeps existing variant-based priority defaults when no priority is supplied", () => {
		const manager = Object.create(ImageResourceManager.prototype) as ImageResourceManager & {
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
