const { MAGIC_HTML_SANDBOX_RUNTIME_PATH } = require("../middleware/staticAssetCacheHeaders")

function getOrigin(value) {
	if (typeof value !== "string" || !value.trim()) return null

	try {
		const url = new URL(value.trim())
		if (url.protocol !== "http:" && url.protocol !== "https:") return null
		return url.origin
	} catch {
		return null
	}
}

function getHtmlSandboxAllowedOrigins(env = process.env) {
	return [
		...new Set(
			[getOrigin(env.MAGIC_WEB_URL), getOrigin(env.MAGIC_HTML_SANDBOX_URL)].filter(Boolean),
		),
	]
}

function isHtmlSandboxRuntimeRequest(pathname) {
	return pathname === MAGIC_HTML_SANDBOX_RUNTIME_PATH
}

/**
 * Only for the public, credential-free /husky-runtime.js static artifact.
 * The sandbox URL may be supplied by remote config.js, absent from Node's env.
 * Gating this file by that env silently blocks the current runtime and causes
 * shared shells to fall back to an incompatible inline runtime. This grants no
 * API access; source/origin checks on iframe messages remain independent.
 */
function setHtmlSandboxRuntimeCorsHeaders(res) {
	res.setHeader("Access-Control-Allow-Origin", "*")
	if (typeof res.removeHeader === "function") {
		res.removeHeader("Access-Control-Allow-Credentials")
	}
}

module.exports = {
	getOrigin,
	getHtmlSandboxAllowedOrigins,
	isHtmlSandboxRuntimeRequest,
	setHtmlSandboxRuntimeCorsHeaders,
}
