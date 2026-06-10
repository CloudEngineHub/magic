import { describe, expect, it, vi } from "vitest"
import { MediaResourceUrlLifecycle, type MediaResourceUrlEntry } from "../MediaResourceUrlLifecycle"

function createEntry(overrides: Partial<MediaResourceUrlEntry> = {}): MediaResourceUrlEntry {
	return {
		ossSrc: null,
		ossSrcFromCachedFallback: false,
		sourceUrl: null,
		expiresAt: null,
		resourceVersion: null,
		sourceUpdatedAt: null,
		contentLength: null,
		exchangePromise: null,
		backgroundRefreshPromise: null,
		lastFailureReason: null,
		...overrides,
	}
}

function createLifecycle(options?: {
	getFileInfo?: ReturnType<typeof vi.fn>
	getCachedResource?: ReturnType<typeof vi.fn>
	resolveResourceUrl?: ReturnType<typeof vi.fn>
}) {
	const getFileInfo =
		options?.getFileInfo ??
		vi.fn().mockResolvedValue({
			src: "https://oss.test/image.png",
			fileName: "image.png",
			expires_at: "2030-01-01 00:00:00",
			resource_version: "v1",
			updated_at: "2030-01-01T00:00:00Z",
			content_length: 123,
		})
	const getCachedResource = options?.getCachedResource ?? vi.fn().mockResolvedValue(null)
	const resolveResourceUrl =
		options?.resolveResourceUrl ?? vi.fn().mockResolvedValue("/virtual/image.png")
	const incrementDiagnostic = vi.fn()
	const canvas = {
		magicConfigManager: {
			config: {
				methods: {
					getFileInfo,
					resolveAbsolutePath: (path: string) => `/workspace/${path}`,
				},
			},
		},
		mediaResourceOfflineCacheManager: {
			shouldBypassVirtualResource: vi.fn(() => false),
			isVirtualResourceUrl: vi.fn((url: string | null) => !!url?.startsWith("/virtual/")),
			getCachedResource,
			resolveResourceUrl,
			removeCachedResource: vi.fn(),
			recordVirtualResourceLoadFailure: vi.fn(),
		},
	}
	const lifecycle = new MediaResourceUrlLifecycle({
		canvas: canvas as never,
		mediaType: "image",
		useImageProcess: true,
		isDestroyed: () => false,
		setFailureReason: (entry, reason) => {
			entry.lastFailureReason = reason
		},
		onResourceDeleted: vi.fn(),
		refreshResource: vi.fn().mockResolvedValue(true),
		incrementDiagnostic,
	})
	return {
		canvas,
		getFileInfo,
		getCachedResource,
		incrementDiagnostic,
		lifecycle,
		resolveResourceUrl,
	}
}

describe("MediaResourceUrlLifecycle", () => {
	it("exchanges an OSS URL and stores link metadata", async () => {
		const { getFileInfo, lifecycle, resolveResourceUrl } = createLifecycle()
		const entry = createEntry()

		await expect(lifecycle.exchangeOssSrc("./images/a.png", entry)).resolves.toBe(
			"/virtual/image.png",
		)

		expect(getFileInfo).toHaveBeenCalledWith("./images/a.png", {
			useImageProcess: true,
			forceRefresh: undefined,
		})
		expect(resolveResourceUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "./images/a.png",
				url: "https://oss.test/image.png",
				mediaType: "image",
				resourceVersion: "v1",
			}),
			{ bypassVirtualResource: undefined, preferVirtualResource: true },
		)
		expect(entry).toEqual(
			expect.objectContaining({
				ossSrc: "/virtual/image.png",
				ossSrcFromCachedFallback: false,
				sourceUrl: "https://oss.test/image.png",
				fileName: "image.png",
				resourceVersion: "v1",
				sourceUpdatedAt: "2030-01-01T00:00:00Z",
				contentLength: 123,
				lastFailureReason: null,
			}),
		)
	})

	it("bypasses virtual resource URLs when requested for fallback exchange", async () => {
		const { lifecycle, resolveResourceUrl } = createLifecycle()
		const entry = createEntry()

		await lifecycle.exchangeOssSrc("./images/a.png", entry, { bypassVirtualResource: true })

		expect(resolveResourceUrl).toHaveBeenCalledWith(
			expect.objectContaining({
				path: "./images/a.png",
				url: "https://oss.test/image.png",
				mediaType: "image",
			}),
			{ bypassVirtualResource: true, preferVirtualResource: false },
		)
	})

	it("falls back to cached resources when exchange misses and fallback is allowed", async () => {
		const getFileInfo = vi.fn().mockResolvedValue(null)
		const getCachedResource = vi.fn().mockResolvedValue({
			url: "/virtual/cached-image.png",
			sourceUrl: "https://oss.test/cached-image.png",
			expiresAt: null,
			resourceVersion: "cached-v1",
			sourceUpdatedAt: "2030-01-02T00:00:00Z",
			contentLength: 456,
		})
		const { lifecycle } = createLifecycle({ getFileInfo, getCachedResource })
		const entry = createEntry()

		await expect(
			lifecycle.ensureFreshOssInfo("./images/a.png", entry, {
				allowCachedFallback: true,
			}),
		).resolves.toEqual({
			ossSrc: "/virtual/cached-image.png",
			expiresAt: null,
		})

		expect(entry).toEqual(
			expect.objectContaining({
				ossSrc: "/virtual/cached-image.png",
				ossSrcFromCachedFallback: true,
				sourceUrl: "https://oss.test/cached-image.png",
				resourceVersion: "cached-v1",
				sourceUpdatedAt: "2030-01-02T00:00:00Z",
				contentLength: 456,
				lastFailureReason: null,
			}),
		)
	})
})
