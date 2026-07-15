/**
 * Workbox-backed runtime caching: matchers, route registration, and install-time precache.
 */

import {
	APP_IMAGE_CACHE_NAME,
	APP_MARKED_RESOURCE_CACHE_NAME,
	APP_STATIC_CACHE_NAME,
	APP_STATIC_EXPIRATION_OPTIONS,
	CACHE_TTL_14_DAYS,
	CACHE_TTL_15_DAYS,
	CACHE_TTL_7_DAYS,
	CACHE_TTL_30_DAYS,
	CACHE_TTL_60_DAYS,
	DEFAULT_VENDOR_CACHEABLE_HOSTS,
	DEFAULT_WORKBOX_RUNTIME_URL,
	EMOJIS_STATIC_CACHE_NAME,
	FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
	PACKAGES_STATIC_CACHE_NAME,
	SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
	VENDOR_CACHEABLE_HOSTS_QUERY_PARAM,
	VENDOR_STATIC_CACHE_NAME,
	WORKBOX_CDN_QUERY_PARAM,
	APP_API_CACHE_NAME,
	API_CACHE_EXPIRATION_OPTIONS,
	WARMUP_MEDIUM_BATCH_SIZE,
	WARMUP_MEDIUM_INTERVAL_MS,
} from "./sw-constants"
import {
	isCacheableEmojiAsset,
	isCacheableFeaturedSlidesTemplateImage,
	isCacheableImageAsset,
	isCacheablePackagesAsset,
	isCacheableSlidesTemplateImage,
	isCacheableStaticAsset,
	isCacheableVendorAsset,
	isExplicitlyMarkedCacheableResource,
	type WorkboxRouteContext,
} from "./cache-route-matchers"
import type { WarmUpOptions } from "./types"
import { normalizeWarmUpOptions } from "./warmup-tuning"

declare const __SW_WARMUP_ASSETS__: string[]

declare const workbox: WorkboxLike

interface WorkboxLike {
	setConfig?: (config: { modulePathPrefix?: string; debug?: boolean }) => void
	routing: {
		registerRoute: (match: (context: WorkboxRouteContext) => boolean, strategy: unknown) => void
	}
	strategies: {
		CacheFirst: new (options: Record<string, unknown>) => unknown
		StaleWhileRevalidate: new (options: Record<string, unknown>) => unknown
	}
	expiration: {
		ExpirationPlugin: new (options: Record<string, unknown>) => unknown
	}
	cacheableResponse: {
		CacheableResponsePlugin: new (options: Record<string, unknown>) => unknown
	}
}

export interface ExpirationPluginLike {
	expireEntries?: (options: { cacheName: string }) => Promise<void>
}

export interface CacheRuntimeRegistration {
	appStaticExpirationPlugin: ExpirationPluginLike
}

export interface WorkboxBootstrapResult {
	configuredWorkboxRuntimeUrl: string | null
	resolvedWorkboxRuntimeUrl: string
	loaded: boolean
	registration: CacheRuntimeRegistration | null
}

const WARMUP_ASSETS: readonly string[] =
	typeof __SW_WARMUP_ASSETS__ !== "undefined" ? __SW_WARMUP_ASSETS__ : []

export { precacheStaticAssetsOnInstall } from "./cache-precache"
export {
	isCacheableFeaturedSlidesTemplateImage,
	isCacheableSlidesTemplateImage,
} from "./cache-route-matchers"
export type { WorkboxRouteContext } from "./cache-route-matchers"

/**
 * Reads workboxCdnUrl from the SW registration script query string.
 */
export function getConfiguredWorkboxRuntimeUrl(sw: ServiceWorkerGlobalScope): string | null {
	const currentScriptUrl = new URL(sw.location.href)
	return currentScriptUrl.searchParams.get(WORKBOX_CDN_QUERY_PARAM)?.trim() || null
}

/**
 * Reads vendorCacheHosts from the SW registration script query string.
 */
export function getConfiguredVendorCacheableHosts(sw: ServiceWorkerGlobalScope): string[] {
	const currentScriptUrl = new URL(sw.location.href)
	const configuredHosts = currentScriptUrl.searchParams
		.get(VENDOR_CACHEABLE_HOSTS_QUERY_PARAM)
		?.split(",")
		.map((host) => host.trim())
		.filter(Boolean)

	if (!configuredHosts?.length) {
		return [...DEFAULT_VENDOR_CACHEABLE_HOSTS]
	}

	return Array.from(new Set(configuredHosts))
}

/**
 * Loads the Workbox IIFE runtime via importScripts.
 */
export function loadWorkboxRuntime(runtimeUrl: string): boolean {
	try {
		importScripts(runtimeUrl)
		return true
	} catch {
		return false
	}
}

export function getWorkboxModulePathPrefix(runtimeUrl: string, baseUrl?: string): string | null {
	const normalizedRuntimeUrl = runtimeUrl.trim()
	if (!normalizedRuntimeUrl) return null

	try {
		const resolvedRuntimeUrl = baseUrl
			? new URL(normalizedRuntimeUrl, baseUrl)
			: new URL(normalizedRuntimeUrl)
		const lastSlashIndex = resolvedRuntimeUrl.pathname.lastIndexOf("/")
		if (lastSlashIndex < 0) return null

		const modulePathname = resolvedRuntimeUrl.pathname.slice(0, lastSlashIndex)
		return `${resolvedRuntimeUrl.origin}${modulePathname}`
	} catch {
		return null
	}
}

/**
 * Resolves Workbox CDN URL, loads runtime, and registers all CacheFirst buckets.
 */
export function bootstrapWorkboxCacheRuntime(sw: ServiceWorkerGlobalScope): WorkboxBootstrapResult {
	const configuredWorkboxRuntimeUrl = getConfiguredWorkboxRuntimeUrl(sw)
	const resolvedWorkboxRuntimeUrl = configuredWorkboxRuntimeUrl || DEFAULT_WORKBOX_RUNTIME_URL

	if (!configuredWorkboxRuntimeUrl) {
		console.warn(
			"[sw] Missing workboxCdnUrl in service worker registration URL, fallback to default runtime URL",
		)
	}

	if (!loadWorkboxRuntime(resolvedWorkboxRuntimeUrl)) {
		console.error("[sw] Failed to load Workbox runtime", {
			attemptedUrl: resolvedWorkboxRuntimeUrl,
			configuredUrl: configuredWorkboxRuntimeUrl,
		})
		return {
			configuredWorkboxRuntimeUrl,
			resolvedWorkboxRuntimeUrl,
			loaded: false,
			registration: null,
		}
	}

	const vendorCacheableHosts = getConfiguredVendorCacheableHosts(sw)
	const registration = registerAppCacheRoutes(sw, vendorCacheableHosts, resolvedWorkboxRuntimeUrl)
	return {
		configuredWorkboxRuntimeUrl,
		resolvedWorkboxRuntimeUrl,
		loaded: true,
		registration,
	}
}

/**
 * Registers Workbox CacheFirst routes for all managed app cache buckets.
 */
function registerAppCacheRoutes(
	sw: ServiceWorkerGlobalScope,
	vendorCacheableHosts: readonly string[],
	workboxRuntimeUrl: string,
): CacheRuntimeRegistration {
	const modulePathPrefix = getWorkboxModulePathPrefix(workboxRuntimeUrl, sw.location.origin)
	workbox.setConfig?.({ modulePathPrefix: modulePathPrefix || undefined, debug: false })

	const { registerRoute } = workbox.routing
	const { CacheFirst, StaleWhileRevalidate } = workbox.strategies
	const { ExpirationPlugin } = workbox.expiration
	const { CacheableResponsePlugin } = workbox.cacheableResponse

	const appStaticExpirationPlugin = new ExpirationPlugin(
		APP_STATIC_EXPIRATION_OPTIONS,
	) as ExpirationPluginLike

	const sameOrigin = sw.location.origin

	registerRoute(
		(context) => isCacheableStaticAsset(context, sameOrigin),
		new CacheFirst({
			cacheName: APP_STATIC_CACHE_NAME,
			plugins: [new CacheableResponsePlugin({ statuses: [200] }), appStaticExpirationPlugin],
		}),
	)

	registerRoute(
		(context) => isCacheableFeaturedSlidesTemplateImage(context),
		new CacheFirst({
			cacheName: FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
			plugins: [
				// Featured templates use an isolated, longer-lived bucket so lower-value images
				// loaded later cannot evict them from the ordinary template cache.
				new CacheableResponsePlugin({ statuses: [0, 200] }),
				new ExpirationPlugin({
					maxEntries: 300,
					maxAgeSeconds: CACHE_TTL_15_DAYS,
				}),
			],
		}),
	)

	registerRoute(
		(context) => isCacheableSlidesTemplateImage(context),
		new CacheFirst({
			cacheName: SLIDES_TEMPLATE_IMAGE_CACHE_NAME,
			plugins: [
				// Cross-origin <img> requests are opaque, but their cache key was granted only by
				// the template catalog's URL marker above.
				new CacheableResponsePlugin({ statuses: [0, 200] }),
				new ExpirationPlugin({
					maxEntries: 500,
					maxAgeSeconds: CACHE_TTL_7_DAYS,
				}),
			],
		}),
	)

	registerRoute(
		(context) => isCacheableImageAsset(context),
		new CacheFirst({
			cacheName: APP_IMAGE_CACHE_NAME,
			plugins: [
				new CacheableResponsePlugin({ statuses: [200] }),
				new ExpirationPlugin({
					maxEntries: 500,
					maxAgeSeconds: CACHE_TTL_14_DAYS,
				}),
			],
		}),
	)

	registerRoute(
		(context) => isExplicitlyMarkedCacheableResource(context, sameOrigin),
		new CacheFirst({
			cacheName: APP_MARKED_RESOURCE_CACHE_NAME,
			plugins: [
				new CacheableResponsePlugin({ statuses: [200] }),
				new ExpirationPlugin({
					maxEntries: 100,
					maxAgeSeconds: CACHE_TTL_60_DAYS,
				}),
			],
		}),
	)

	registerRoute(
		(context) => isCacheablePackagesAsset(context, sameOrigin),
		new CacheFirst({
			cacheName: PACKAGES_STATIC_CACHE_NAME,
			plugins: [
				new CacheableResponsePlugin({ statuses: [200] }),
				new ExpirationPlugin({
					maxEntries: 400,
					maxAgeSeconds: CACHE_TTL_60_DAYS,
				}),
			],
		}),
	)

	registerRoute(
		(context) => isCacheableEmojiAsset(context, sameOrigin),
		new CacheFirst({
			cacheName: EMOJIS_STATIC_CACHE_NAME,
			plugins: [
				new CacheableResponsePlugin({ statuses: [200] }),
				new ExpirationPlugin({
					maxEntries: 400,
					maxAgeSeconds: CACHE_TTL_60_DAYS,
				}),
			],
		}),
	)

	registerRoute(
		(context) => isCacheableVendorAsset(context, vendorCacheableHosts),
		new CacheFirst({
			cacheName: VENDOR_STATIC_CACHE_NAME,
			fetchOptions: {
				credentials: "omit",
			},
			plugins: [
				new CacheableResponsePlugin({ statuses: [200] }),
				new ExpirationPlugin({
					maxEntries: 400,
					maxAgeSeconds: CACHE_TTL_30_DAYS,
				}),
			],
		}),
	)

	const apiBusinessCacheablePlugin = {
		cacheWillUpdate: async ({ response }: { response: Response }) => {
			if (response.status !== 200) return null
			try {
				const clonedResponse = response.clone()
				const json = await clonedResponse.json()
				if (json && (json.code === 1000 || json.code === undefined)) {
					return response
				}
			} catch {
				return null
			}
			return null
		},
		requestWillFetch: async ({ request }: { request: Request }) => {
			try {
				const url = new URL(request.url)
				if (url.searchParams.has("swCache")) {
					url.searchParams.delete("swCache")
					return new Request(url.toString(), request)
				}
			} catch {
				// Fallback
			}
			return request
		},
	}

	registerRoute(
		({ request, url }) => {
			if (request.method !== "GET") return false
			return url.searchParams.get("swCache") === "api-runtime"
		},
		new StaleWhileRevalidate({
			cacheName: APP_API_CACHE_NAME,
			plugins: [
				apiBusinessCacheablePlugin,
				new ExpirationPlugin(API_CACHE_EXPIRATION_OPTIONS),
			],
		}),
	)

	return { appStaticExpirationPlugin }
}

let lastWarmedUpAssetsSerialized = ""
let inFlightWarmUpSerialized = ""
let inFlightWarmUpPromise: Promise<void> | null = null
const activeWarmUpUrls = new Set<string>()

function normalizeWarmUpAssets(assets?: readonly string[]): string[] {
	const sourceAssets = assets?.length ? assets : WARMUP_ASSETS
	const normalizedAssets = sourceAssets
		.map((assetPath) => assetPath.trim())
		.filter((assetPath) => Boolean(assetPath))

	return Array.from(new Set(normalizedAssets)).sort()
}

function toWarmUpCacheKey(assetPath: string): string {
	return new URL(assetPath, self.location.origin).toString()
}

/**
 * Builds a dedupe key that includes tuning so concurrent warm-ups with different options do not collapse.
 */
function toWarmUpInFlightSerializedKey(
	assetsToWarm: readonly string[],
	options: WarmUpOptions,
): string {
	return `${assetsToWarm.join(",")}|${options.batchSize}|${options.intervalMs}`
}

/**
 * Populates static assets list during browser idle phase.
 * Batch size and interval are supplied by the main thread via postMessage.
 */
export async function warmUpStaticAssetsOnIdle(
	assets?: string[],
	options?: WarmUpOptions,
): Promise<void> {
	const assetsToWarm = normalizeWarmUpAssets(assets)
	if (!assetsToWarm.length) return

	const warmUpOptions = options
		? normalizeWarmUpOptions(options.intervalMs, options.batchSize)
		: normalizeWarmUpOptions(WARMUP_MEDIUM_INTERVAL_MS, WARMUP_MEDIUM_BATCH_SIZE)

	const assetsSerialized = assetsToWarm.join(",")
	if (lastWarmedUpAssetsSerialized === assetsSerialized) return

	const inFlightSerialized = toWarmUpInFlightSerializedKey(assetsToWarm, warmUpOptions)
	if (inFlightWarmUpPromise && inFlightWarmUpSerialized === inFlightSerialized) {
		try {
			await inFlightWarmUpPromise
		} catch {
			// The owner invocation logs overall failure details.
		}
		return
	}

	inFlightWarmUpSerialized = inFlightSerialized
	inFlightWarmUpPromise = (async () => {
		const cache = await caches.open(APP_STATIC_CACHE_NAME)
		const { batchSize, intervalMs } = warmUpOptions

		for (let index = 0; index < assetsToWarm.length; index += batchSize) {
			const batch = assetsToWarm.slice(index, index + batchSize)
			let fetchedInBatch = false

			await Promise.allSettled(
				batch.map(async (assetPath) => {
					const cacheKey = toWarmUpCacheKey(assetPath)
					if (activeWarmUpUrls.has(cacheKey)) return
					activeWarmUpUrls.add(cacheKey)

					try {
						const request = new Request(cacheKey, { credentials: "same-origin" })
						// Skip if already in cache (e.g. cached via regular HTTP dynamic request)
						const existing = await cache.match(request)
						if (existing) return

						fetchedInBatch = true
						const response = await fetch(request)
						if (response.ok) {
							await cache.put(request, response)
						}
					} catch {
						// Ignored single request failure.
					} finally {
						activeWarmUpUrls.delete(cacheKey)
					}
				}),
			)

			if (fetchedInBatch) {
				await new Promise((resolve) => setTimeout(resolve, intervalMs))
			}
		}

		// Mark as completed only after all batches are processed.
		lastWarmedUpAssetsSerialized = assetsSerialized
	})()

	try {
		await inFlightWarmUpPromise
	} catch (error) {
		console.warn("[sw] Warm-up overall failure", { error })
	} finally {
		if (inFlightWarmUpSerialized === inFlightSerialized) {
			inFlightWarmUpSerialized = ""
			inFlightWarmUpPromise = null
		}
	}
}

/**
 * After install precache, enforce APP_STATIC maxEntries because native puts skip ExpirationPlugin.
 */
export async function enforceAppStaticExpirationAfterPrecache(
	registration: CacheRuntimeRegistration | null,
): Promise<void> {
	if (!registration?.appStaticExpirationPlugin.expireEntries) return
	await registration.appStaticExpirationPlugin.expireEntries({
		cacheName: APP_STATIC_CACHE_NAME,
	})
}
