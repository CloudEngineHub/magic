import {
	CANVAS_MEDIA_SCOPE_PREFIX,
	EMOJIS_SCOPE_PREFIX,
	FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_VALUE,
	HASHED_ASSET_PATTERN,
	HASHED_IMAGE_ASSET_PATTERN,
	MARKED_RUNTIME_RESOURCE_CACHE_VALUE,
	PACKAGES_SCOPE_PREFIX,
	RESOURCE_CACHE_MARK_QUERY_PARAM,
	SLIDES_TEMPLATE_IMAGE_CACHE_VALUE,
} from "./sw-constants"

export interface WorkboxRouteContext {
	url: URL
	request: Request
}

export function isCacheableStaticAsset(
	{ request, url }: WorkboxRouteContext,
	sameOrigin: string,
): boolean {
	if (url.pathname.startsWith(CANVAS_MEDIA_SCOPE_PREFIX)) return false
	if (request.destination === "font") return url.origin === sameOrigin
	if (request.destination !== "script" && request.destination !== "style") return false
	if (url.origin !== sameOrigin) return false
	return HASHED_ASSET_PATTERN.test(url.pathname)
}

export function isCacheableImageAsset({ request, url }: WorkboxRouteContext): boolean {
	if (url.pathname.startsWith(CANVAS_MEDIA_SCOPE_PREFIX)) return false
	if (request.destination !== "image") return false
	return HASHED_IMAGE_ASSET_PATTERN.test(url.pathname)
}

function isCacheableSlidesTemplateImageByMarker(
	{ request, url }: WorkboxRouteContext,
	marker: string,
): boolean {
	if (request.method !== "GET") return false
	if (request.destination !== "image") return false
	return url.searchParams.get(RESOURCE_CACHE_MARK_QUERY_PARAM) === marker
}

export function isCacheableFeaturedSlidesTemplateImage(context: WorkboxRouteContext): boolean {
	return isCacheableSlidesTemplateImageByMarker(
		context,
		FEATURED_SLIDES_TEMPLATE_IMAGE_CACHE_VALUE,
	)
}

export function isCacheableSlidesTemplateImage(context: WorkboxRouteContext): boolean {
	return isCacheableSlidesTemplateImageByMarker(context, SLIDES_TEMPLATE_IMAGE_CACHE_VALUE)
}

export function isExplicitlyMarkedCacheableResource(
	{ request, url }: WorkboxRouteContext,
	sameOrigin: string,
): boolean {
	if (request.method !== "GET") return false
	if (url.pathname.startsWith(CANVAS_MEDIA_SCOPE_PREFIX)) return false
	if (url.origin !== sameOrigin) return false
	return (
		url.searchParams.get(RESOURCE_CACHE_MARK_QUERY_PARAM) ===
		MARKED_RUNTIME_RESOURCE_CACHE_VALUE
	)
}

export function isCacheablePackagesAsset(
	{ request, url }: WorkboxRouteContext,
	sameOrigin: string,
): boolean {
	if (request.method !== "GET") return false
	if (url.pathname.startsWith(CANVAS_MEDIA_SCOPE_PREFIX)) return false
	if (url.origin !== sameOrigin) return false
	return url.pathname.startsWith(PACKAGES_SCOPE_PREFIX)
}

export function isCacheableEmojiAsset(
	{ request, url }: WorkboxRouteContext,
	sameOrigin: string,
): boolean {
	if (request.method !== "GET") return false
	if (url.pathname.startsWith(CANVAS_MEDIA_SCOPE_PREFIX)) return false
	if (url.origin !== sameOrigin) return false
	if (request.destination !== "image") return false
	return url.pathname.startsWith(EMOJIS_SCOPE_PREFIX)
}

export function isCacheableVendorAsset(
	{ request, url }: WorkboxRouteContext,
	vendorCacheableHosts: readonly string[],
): boolean {
	if (url.pathname.startsWith(CANVAS_MEDIA_SCOPE_PREFIX)) return false
	if (
		request.destination !== "script" &&
		request.destination !== "style" &&
		request.destination !== "font"
	) {
		return false
	}
	return vendorCacheableHosts.includes(url.hostname)
}
