import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	bootstrapWorkboxCacheRuntime,
	isCacheableSlidesTemplateImage,
	type WorkboxRouteContext,
} from "../cache-runtime"
import { APP_IMAGE_CACHE_NAME, SLIDES_TEMPLATE_IMAGE_CACHE_NAME } from "../sw-constants"

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
		expect(
			isCacheableSlidesTemplateImage(
				createContext(
					"https://storage.example.com/template.webp?swCache=slides-template-image",
				),
			),
		).toBe(true)
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
				void options
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
			expect.objectContaining({ cacheName: SLIDES_TEMPLATE_IMAGE_CACHE_NAME }),
		)
		expect(
			cacheFirstOptions.findIndex(
				(options) => options.cacheName === SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
			),
		).toBeLessThan(
			cacheFirstOptions.findIndex((options) => options.cacheName === APP_IMAGE_CACHE_NAME),
		)
		expect(cacheableResponseOptions).toContainEqual({ statuses: [0, 200] })
	})
})
