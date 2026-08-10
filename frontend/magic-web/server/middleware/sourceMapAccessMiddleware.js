const SOURCE_MAP_PATH_PATTERN = /\.map$/i

function getRequestPathname(req) {
	const pathname = req.path || req.url?.split("?", 1)[0] || ""

	try {
		return decodeURIComponent(pathname)
	} catch {
		// Malformed URLs cannot resolve to a valid static file; keep the raw path for matching.
		return pathname
	}
}

function sourceMapAccessMiddleware(req, res, next) {
	if (!SOURCE_MAP_PATH_PATTERN.test(getRequestPathname(req))) {
		return next()
	}

	// Return 404 so public callers cannot determine whether the image contains this source map.
	res.setHeader("Cache-Control", "no-store")
	return res.status(404).send("")
}

module.exports = sourceMapAccessMiddleware
