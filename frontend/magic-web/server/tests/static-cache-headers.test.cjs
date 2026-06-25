const assert = require("node:assert/strict")
const test = require("node:test")
const {
	MAGIC_WIDGET_PUBLIC_PATH,
	setStaticAssetCacheHeaders,
} = require("../middleware/staticAssetCacheHeaders")

function createHeaderRecorder() {
	const headers = new Map()

	return {
		getHeader(name) {
			return headers.get(name.toLowerCase())
		},
		setHeader(name, value) {
			headers.set(name.toLowerCase(), String(value))
		},
	}
}

test("sets negotiated cache headers for sdk magic-widget.js", () => {
	const response = createHeaderRecorder()

	assert.equal(MAGIC_WIDGET_PUBLIC_PATH, "/sdk/magic-widget.js")
	setStaticAssetCacheHeaders(response, `/app/dist${MAGIC_WIDGET_PUBLIC_PATH}`)

	assert.equal(response.getHeader("Cache-Control"), "no-cache")
	assert.equal(response.getHeader("Pragma"), undefined)
	assert.equal(response.getHeader("Expires"), undefined)
})

test("keeps strong cache headers for regular static assets", () => {
	const response = createHeaderRecorder()

	setStaticAssetCacheHeaders(response, "/app/dist/assets/index.123.js")

	assert.equal(response.getHeader("Cache-Control"), "max-age=31536000")
})
