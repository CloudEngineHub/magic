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
	thumbnailData: { small: string }
	variant: ImageResourceVariant
	sourceWidth: number
	sourceHeight: number
	isFullSize: boolean
	displayRetainCount?: number
	closed?: boolean
}

function createImageResource(
	variant: ImageResourceVariant,
	options?: { width?: number; height?: number; close?: () => void },
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
		thumbnailData: { small: "" },
		variant,
		sourceWidth: width,
		sourceHeight: height,
		isFullSize: true,
		displayRetainCount: 0,
		closed: false,
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
			small: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
			overview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
			preview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
		},
		fullResource: null,
		fullRetainCount: 0,
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
		urlLifecycle: { canonicalResourcePath: (path: string) => string }
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
	manager.urlLifecycle = { canonicalResourcePath: (path: string) => path }
	return { manager, eventEmitter }
}

const RELEASE_OPTIONS = {
	reason: "test",
	remainingDecodedBytes: 0,
	decodedBudgetBytes: 0,
}

type ReleaseResource = (
	path: string,
	entry: ReturnType<typeof createEntry>,
	options: typeof RELEASE_OPTIONS,
) => number

describe("ImageResourceManager display resource release", () => {
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

	it("closes small and overview decoded resources and reports release stats", () => {
		const { manager, eventEmitter } = createManager()
		const smallClose = vi.fn()
		const overviewClose = vi.fn()
		const previewClose = vi.fn()
		const smallResource = createImageResource("small", {
			width: 10,
			height: 10,
			close: smallClose,
		})
		const overviewResource = createImageResource("overview", {
			width: 20,
			height: 10,
			close: overviewClose,
		})
		const previewResource = createImageResource("preview", {
			width: 5,
			height: 5,
			close: previewClose,
		})
		const entry = createEntry({
			displaySlots: {
				small: {
					resource: smallResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				overview: {
					resource: overviewResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				preview: {
					resource: previewResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
			},
		})
		manager.entries.set("image/path.png", entry)
		const releaseSmallResource = (
			manager as unknown as { releaseSmallResource: ReleaseResource }
		).releaseSmallResource.bind(manager)
		const releaseOverviewResource = (
			manager as unknown as { releaseOverviewResource: ReleaseResource }
		).releaseOverviewResource.bind(manager)

		releaseSmallResource("image/path.png", entry, RELEASE_OPTIONS)
		releaseOverviewResource("image/path.png", entry, RELEASE_OPTIONS)

		expect(smallClose).toHaveBeenCalledTimes(1)
		expect(overviewClose).toHaveBeenCalledTimes(1)
		expect(previewClose).not.toHaveBeenCalled()
		expect(
			(entry as unknown as { displaySlots: Record<string, { resource: unknown }> })
				.displaySlots.small.resource,
		).toBeNull()
		expect(
			(entry as unknown as { displaySlots: Record<string, { resource: unknown }> })
				.displaySlots.overview.resource,
		).toBeNull()
		expect(
			(entry as unknown as { displaySlots: Record<string, { resource: unknown }> })
				.displaySlots.preview.resource,
		).toBe(previewResource)
		expect(eventEmitter.emit).toHaveBeenCalledWith({
			type: "resource:image:released",
			data: {
				path: "image/path.png",
				variant: "small",
				reason: "test",
				releasedBytes: 400,
			},
		})
		expect(eventEmitter.emit).toHaveBeenCalledWith({
			type: "resource:image:released",
			data: {
				path: "image/path.png",
				variant: "overview",
				reason: "test",
				releasedBytes: 800,
			},
		})
		expect(manager.getSnapshot()).toEqual(
			expect.objectContaining({
				smallLoaded: 0,
				overviewLoaded: 0,
				previewLoaded: 1,
				previewDecodedBytes: 100,
				displayReleaseCount: 2,
				displayReleaseBytes: 1200,
				stats: expect.objectContaining({
					displayReleaseCount: 2,
					displayReleaseBytes: 1200,
				}),
			}),
		)
	})

	it("does not close a decoded resource still referenced by another active slot", () => {
		const { manager } = createManager()
		const close = vi.fn()
		const sharedResource = createImageResource("overview", {
			width: 10,
			height: 10,
			close,
		})
		const entry = createEntry({
			displaySlots: {
				small: {
					resource: sharedResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				overview: {
					resource: sharedResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				preview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
			},
		})
		manager.entries.set("image/path.png", entry)
		const releaseSmallResource = (
			manager as unknown as { releaseSmallResource: ReleaseResource }
		).releaseSmallResource.bind(manager)
		const releaseOverviewResource = (
			manager as unknown as { releaseOverviewResource: ReleaseResource }
		).releaseOverviewResource.bind(manager)

		releaseSmallResource("image/path.png", entry, RELEASE_OPTIONS)
		expect(close).not.toHaveBeenCalled()

		releaseOverviewResource("image/path.png", entry, RELEASE_OPTIONS)
		expect(close).toHaveBeenCalledTimes(1)
		expect(manager.getSnapshot()).toEqual(
			expect.objectContaining({
				smallLoaded: 0,
				overviewLoaded: 0,
			}),
		)
	})

	it("keeps a retained display resource open after its cache slot is released", () => {
		const { manager } = createManager()
		const close = vi.fn()
		const previewResource = createImageResource("preview", {
			width: 10,
			height: 10,
			close,
		})
		const entry = createEntry({
			displaySlots: {
				small: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				overview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				preview: {
					resource: previewResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
			},
		})
		manager.entries.set("image/path.png", entry)
		const releasePreviewResource = (
			manager as unknown as { releasePreviewResource: ReleaseResource }
		).releasePreviewResource.bind(manager)

		const releaseDisplayedResource = manager.retainDisplayedResource("image/path.png", {
			image: previewResource.image,
			variant: "preview",
		})
		releasePreviewResource("image/path.png", entry, RELEASE_OPTIONS)

		expect(entry.displaySlots.preview.resource).toBeNull()
		expect(close).not.toHaveBeenCalled()

		releaseDisplayedResource()

		expect(close).toHaveBeenCalledTimes(1)
		expect(previewResource.closed).toBe(true)
	})

	it("does not close a retained display resource during entry cleanup", () => {
		const { manager, eventEmitter } = createManager()
		const close = vi.fn()
		const previewResource = createImageResource("preview", {
			width: 10,
			height: 10,
			close,
		})
		const entry = createEntry({
			displaySlots: {
				small: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				overview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				preview: {
					resource: previewResource,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
			},
		})
		manager.entries.set("image/path.png", entry)
		const closeEntryResources = (
			manager as unknown as {
				closeEntryResources: (targetEntry: typeof entry) => void
			}
		).closeEntryResources.bind(manager)

		const releaseDisplayedResource = manager.retainDisplayedResource("image/path.png", {
			image: previewResource.image,
			variant: "preview",
		})
		closeEntryResources(entry)

		expect(close).not.toHaveBeenCalled()
		expect(previewResource.closed).toBe(false)
		expect(eventEmitter.emit).not.toHaveBeenCalledWith(
			expect.objectContaining({ type: "resource:image:will-close" }),
		)

		releaseDisplayedResource()

		expect(close).toHaveBeenCalledTimes(1)
		expect(previewResource.closed).toBe(true)
	})

	it("releases unprotected display resources without waiting for a decoded budget", () => {
		const { manager, eventEmitter } = createManager()
		const protectedSmall = createImageResource("small")
		const unprotectedPreviewClose = vi.fn()
		const unprotectedPreview = createImageResource("preview", {
			width: 8,
			height: 8,
			close: unprotectedPreviewClose,
		})
		const protectedEntry = createEntry({
			displaySlots: {
				small: {
					resource: protectedSmall,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
				overview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				preview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
			},
		})
		const unprotectedEntry = createEntry({
			displaySlots: {
				small: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				overview: { resource: null, loadingPromise: null, version: null, lastAccessAt: 1 },
				preview: {
					resource: unprotectedPreview,
					loadingPromise: null,
					version: null,
					lastAccessAt: 1,
				},
			},
		})
		manager.entries.set("protected.png", protectedEntry)
		manager.entries.set("far.png", unprotectedEntry)

		manager.enforceDisplayDecodedBudget({
			protectedSmallPaths: new Set(["protected.png"]),
			reason: "visibility:test",
			force: true,
		})

		expect(protectedEntry.displaySlots.small.resource).toBe(protectedSmall)
		expect(unprotectedEntry.displaySlots.preview.resource).toBeNull()
		expect(unprotectedPreviewClose).toHaveBeenCalledTimes(1)
		expect(eventEmitter.emit).toHaveBeenCalledWith({
			type: "resource:image:released",
			data: {
				path: "far.png",
				variant: "preview",
				reason: "visibility:test",
				releasedBytes: 256,
			},
		})
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

		expect(manager.getBodyFetchPriorityForVariant("overview", "critical")).toBe("critical")
		expect(manager.getBodyFetchPriorityForVariant("preview", "critical")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("overview", "critical")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("preview", "critical")).toBe("critical")
	})

	it("keeps existing variant-based priority defaults when no priority is supplied", () => {
		const manager = Object.create(ImageResourceManager.prototype) as ImageResourceManager & {
			getBodyFetchPriorityForVariant: GetPriorityForVariant
			getDecodePriorityForVariant: GetPriorityForVariant
		}

		expect(manager.getBodyFetchPriorityForVariant("full")).toBe("critical")
		expect(manager.getBodyFetchPriorityForVariant("preview")).toBe("visible")
		expect(manager.getBodyFetchPriorityForVariant("overview")).toBe("near")
		expect(manager.getDecodePriorityForVariant("full")).toBe("critical")
		expect(manager.getDecodePriorityForVariant("preview")).toBe("visible")
		expect(manager.getDecodePriorityForVariant("overview")).toBe("background")
	})
})
