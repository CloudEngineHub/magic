const MAGIC_WIDGET_PUBLIC_PATH = "/sdk/magic-widget.js"
const NEGOTIATED_CACHE_CONTROL = "no-cache"
const STRONG_STATIC_CACHE_CONTROL = "max-age=31536000"
const NO_STORE_CACHE_CONTROL = "no-cache, no-store, must-revalidate"

const noStoreStaticResourcePatterns = [
	/sw\.js$/,
	/\.html$/,
	/registerSW\.js$/,
	/favicon\.svg$/,
	/manifest\.webmanifest$/,
]

function normalizePathname(pathname) {
	return pathname.replace(/\\/g, "/")
}

function isMagicWidgetAsset(pathname) {
	return normalizePathname(pathname).endsWith(MAGIC_WIDGET_PUBLIC_PATH)
}

function setStaticAssetCacheHeaders(res, pathname) {
	if (isMagicWidgetAsset(pathname)) {
		// The widget has a stable external URL, so browsers may store it but must revalidate each load.
		res.setHeader("Cache-Control", NEGOTIATED_CACHE_CONTROL)
		return
	}

	if (noStoreStaticResourcePatterns.some((pattern) => pattern.test(pathname))) {
		res.setHeader("Cache-Control", NO_STORE_CACHE_CONTROL)
		res.setHeader("Pragma", "no-cache")
		res.setHeader("Expires", "0")
		return
	}

	res.setHeader("Cache-Control", STRONG_STATIC_CACHE_CONTROL)
}

module.exports = {
	MAGIC_WIDGET_PUBLIC_PATH,
	setStaticAssetCacheHeaders,
}
