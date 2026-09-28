const path = require("node:path")

function isDesignStylePreviewPath(pathname) {
	// Match the resolved static path, including encoded separators and dot segments.
	return path.posix
		.normalize(pathname.replace(/\\/g, "/"))
		.includes("/html-design-style/previews/")
}

function designStylePreviewMiddleware(req, res, next) {
	let pathname
	try {
		pathname = decodeURIComponent(req.path)
	} catch {
		// Preserve the static server's malformed URL handling.
		return next()
	}
	if (!isDesignStylePreviewPath(pathname)) return next()

	// Fetch Metadata is a browser access restriction, not authentication.
	// Vary and private caching prevent an allowed iframe response being reused elsewhere.
	res.vary("Sec-Fetch-Dest")
	res.vary("Sec-Fetch-Site")
	res.setHeader(
		"Content-Security-Policy",
		"frame-ancestors 'self'; sandbox; script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
	)
	res.setHeader("X-Content-Type-Options", "nosniff")
	if (
		!["GET", "HEAD"].includes(req.method) ||
		req.get("Sec-Fetch-Dest") !== "iframe" ||
		req.get("Sec-Fetch-Site") !== "same-origin"
	) {
		res.setHeader("Cache-Control", "no-store")
		return res.status(403).send("")
	}
	res.setHeader("Cache-Control", "private, no-cache")
	return next()
}

module.exports = { designStylePreviewMiddleware, isDesignStylePreviewPath }
