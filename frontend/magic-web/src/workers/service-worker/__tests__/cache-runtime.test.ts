import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	bootstrapWorkboxCacheRuntime,
	isCacheableFeaturedSlidesTemplateImage,
	isCacheableSlidesTemplateImage,
	type WorkboxRouteContext,
} from "../cache-runtime"
import {
	APP_IMAGE_CACHE_NAME,
	CACHE_TTL_15_DAYS,
	CACHE_TTL_7_DAYS,
	FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
	SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
} from "../sw-constants"

function createContext(
	url: string,
	{
		method = "GET",
		destination = "image",
	}: { method?: string; destination?: RequestDestination } = {},
): WorkboxRouteContext {
	return {
		request: { destination, method } as Request,
		url: new URL(url),
	}
}

describe("slides template image cache route", () => {
	beforeEach(() => {
		vi.unstubAllGlobals()
	})

	it("accepts only explicitly marked image requests", () => {
		const ordinaryContext = createContext(
			"https://storage.example.com/template.webp?swCache=slides-template-image",
		)
		const featuredContext = createContext(
			"https://storage.example.com/template.webp?swCache=featured-slides-template-image",
		)

		expect(isCacheableSlidesTemplateImage(ordinaryContext)).toBe(true)
		expect(isCacheableFeaturedSlidesTemplateImage(ordinaryContext)).toBe(false)
		expect(isCacheableFeaturedSlidesTemplateImage(featuredContext)).toBe(true)
		expect(isCacheableSlidesTemplateImage(featuredContext)).toBe(false)
	})

	it("rejects unmarked images and non-image requests", () => {
		expect(
			isCacheableSlidesTemplateImage(
				createContext("https://storage.example.com/template.webp"),
			),
		).toBe(false)
		expect(
			isCacheableSlidesTemplateImage(
				createContext(
					"https://storage.example.com/template.webp?swCache=slides-template-image",
					{
						destination: "script",
					},
				),
			),
		).toBe(false)
		expect(
			isCacheableSlidesTemplateImage(
				createContext(
					"https://storage.example.com/template.webp?swCache=slides-template-image",
					{
						method: "POST",
					},
				),
			),
		).toBe(false)
	})

	it("allows opaque image responses in the dedicated cache", () => {
		const cacheFirstOptions: Record<string, unknown>[] = []
		const cacheableResponseOptions: Record<string, unknown>[] = []
		const expirationOptions: Record<string, unknown>[] = []

		class CacheFirst {
			constructor(options: Record<string, unknown>) {
				cacheFirstOptions.push(options)
			}
		}
		class StaleWhileRevalidate {
			constructor(options: Record<string, unknown>) {
				void options
			}
		}
		class ExpirationPlugin {
			constructor(options: Record<string, unknown>) {
				expirationOptions.push(options)
			}
		}
		class CacheableResponsePlugin {
			constructor(options: Record<string, unknown>) {
				cacheableResponseOptions.push(options)
			}
		}

		vi.stubGlobal("importScripts", vi.fn())
		vi.stubGlobal("workbox", {
			setConfig: vi.fn(),
			routing: { registerRoute: vi.fn() },
			strategies: { CacheFirst, StaleWhileRevalidate },
			expiration: { ExpirationPlugin },
			cacheableResponse: { CacheableResponsePlugin },
		})

		bootstrapWorkboxCacheRuntime({
			location: {
				href: "https://app.example.com/sw.js?workboxCdnUrl=https%3A%2F%2Fcdn.example.com%2Fworkbox-sw.js",
			},
		} as ServiceWorkerGlobalScope)

		expect(cacheFirstOptions).toContainEqual(
			expect.objectContaining({ cacheName: FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_NAME }),
		)
		expect(cacheFirstOptions).toContainEqual(
			expect.objectContaining({ cacheName: SLIDES_TEMPLATE_IMAGE_CACHE_NAME }),
		)
		expect(
			cacheFirstOptions.findIndex(
				(options) => options.cacheName === FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
			),
		).toBeLessThan(
			cacheFirstOptions.findIndex(
				(options) => options.cacheName === SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
			),
		)
		expect(
			cacheFirstOptions.findIndex(
				(options) => options.cacheName === SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
			),
		).toBeLessThan(
			cacheFirstOptions.findIndex((options) => options.cacheName === APP_IMAGE_CACHE_NAME),
		)
		expect(cacheableResponseOptions).toContainEqual({ statuses: [0, 200] })
		expect(expirationOptions).toContainEqual({
			maxEntries: 300,
			maxAgeSeconds: CACHE_TTL_15_DAYS,
		})
		expect(expirationOptions).toContainEqual({
			maxEntries: 500,
			maxAgeSeconds: CACHE_TTL_7_DAYS,
		})
	})
})
