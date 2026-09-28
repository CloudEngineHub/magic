const assert = require("node:assert/strict")
const test = require("node:test")
const { designStylePreviewMiddleware } = require("../middleware/designStylePreviewMiddleware")
const { setStaticAssetCacheHeaders } = require("../middleware/staticAssetCacheHeaders")

function invoke({
	path = "/html-design-style/previews/vercel.html",
	method = "GET",
	dest = "iframe",
	site = "same-origin",
} = {}) {
	const headers = new Map()
	let allowed = false
	const res = {
		statusCode: 200,
		setHeader(name, value) {
			headers.set(name.toLowerCase(), value)
		},
		vary(name) {
			headers.set("vary", [...(headers.get("vary") || []), name])
		},
		status(code) {
			this.statusCode = code
			return this
		},
		send(body) {
			this.body = body
			return this
		},
	}
	designStylePreviewMiddleware(
		{
			path,
			method,
			get(name) {
				return { "Sec-Fetch-Dest": dest, "Sec-Fetch-Site": site }[name]
			},
		},
		res,
		() => {
			allowed = true
		},
	)
	return { res, headers, allowed }
}

test("allows same-origin iframe reads and preserves private caching through static handling", () => {
	for (const method of ["GET", "HEAD"]) {
		const { res, headers, allowed } = invoke({ method })
		assert.equal(allowed, true)
		assert.match(
			headers.get("content-security-policy"),
			/frame-ancestors 'self'; sandbox; script-src 'none'/,
		)
		assert.equal(headers.get("x-content-type-options"), "nosniff")
		assert.deepEqual(headers.get("vary"), ["Sec-Fetch-Dest", "Sec-Fetch-Site"])
		setStaticAssetCacheHeaders(res, "/app/dist/html-design-style/previews/vercel.html")
		assert.equal(headers.get("cache-control"), "private, no-cache")
		assert.equal(headers.has("pragma"), false)
	}
})

test("rejects direct navigation, fetch, foreign frames and missing metadata", () => {
	for (const options of [
		{ dest: "document" },
		{ dest: "empty" },
		{ dest: "" },
		{ site: "cross-site" },
		{ site: "same-site" },
		{ site: "none" },
		{ site: "" },
		{ method: "POST" },
		{ method: "OPTIONS" },
	]) {
		const result = invoke(options)
		assert.equal(result.allowed, false, JSON.stringify(options))
		assert.equal(result.res.statusCode, 403)
		assert.equal(result.res.body, "")
		assert.equal(result.headers.get("cache-control"), "no-store")
	}
})

test("protects encoded and normalized preview paths", () => {
	for (const path of [
		"/html-design-style/%70reviews/vercel.html",
		"/html-design-style%2fpreviews%2fvercel.html",
		"/other/../html-design-style/previews/vercel.html",
		"/html-design-style//previews/vercel.html",
		"/prefix/html-design-style/previews/vercel.html",
	])
		assert.equal(invoke({ path, dest: "document" }).res.statusCode, 403, path)
})

test("leaves unrelated routes alone and revalidates the stable catalog URL", () => {
	for (const path of [
		"/index.html",
		"/html-design-style/catalog.json",
		"/assets/app.js",
		"/bad%url",
	]) {
		const result = invoke({ path, dest: "document" })
		assert.equal(result.allowed, true)
		assert.equal(result.headers.size, 0)
	}
	const { res, headers } = invoke({ path: "/index.html" })
	setStaticAssetCacheHeaders(res, "/app/dist/html-design-style/catalog.json")
	assert.equal(headers.get("cache-control"), "public, no-cache")
	setStaticAssetCacheHeaders(res, "/app/dist/index.html")
	assert.equal(headers.get("cache-control"), "no-cache, no-store, must-revalidate")
})
