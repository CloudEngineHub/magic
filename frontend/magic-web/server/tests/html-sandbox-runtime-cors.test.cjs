const assert = require("node:assert/strict")
const test = require("node:test")
const {
	getHtmlSandboxAllowedOrigins,
	setHtmlSandboxRuntimeCorsHeaders,
} = require("../utils/htmlSandboxRuntimeCors.cjs")

function createHeaderRecorder(initialHeaders = {}) {
	const headers = new Map(
		Object.entries(initialHeaders).map(([name, value]) => [name.toLowerCase(), String(value)]),
	)

	return {
		getHeader(name) {
			return headers.get(name.toLowerCase())
		},
		removeHeader(name) {
			headers.delete(name.toLowerCase())
		},
		setHeader(name, value) {
			headers.set(name.toLowerCase(), String(value))
		},
	}
}

test("derives runtime CORS origins from the web and sandbox URLs", () => {
	assert.deepEqual(
		getHtmlSandboxAllowedOrigins({
			MAGIC_WEB_URL: "https://magic.example.com/app",
			MAGIC_HTML_SANDBOX_URL: "https://husky.pages.letsmagic.space/index.html",
		}),
		["https://magic.example.com", "https://husky.pages.letsmagic.space"],
	)
})

test("uses only the web origin when no sandbox URL is configured", () => {
	assert.deepEqual(
		getHtmlSandboxAllowedOrigins({
			MAGIC_WEB_URL: "https://magic.example.com/app",
		}),
		["https://magic.example.com"],
	)
})

test("deduplicates origins and ignores invalid or unsupported URLs", () => {
	assert.deepEqual(
		getHtmlSandboxAllowedOrigins({
			MAGIC_WEB_URL: "https://magic.example.com/app",
			MAGIC_HTML_SANDBOX_URL: "https://magic.example.com/sandbox",
		}),
		["https://magic.example.com"],
	)
	assert.deepEqual(
		getHtmlSandboxAllowedOrigins({
			MAGIC_WEB_URL: "not-a-url",
			MAGIC_HTML_SANDBOX_URL: "javascript:alert(1)",
		}),
		[],
	)
})

test("echoes an allowed request origin and preserves existing Vary values", () => {
	const response = createHeaderRecorder({ Vary: "Accept-Encoding" })

	setHtmlSandboxRuntimeCorsHeaders(response, "https://husky.example.com", [
		"https://magic.example.com",
		"https://husky.example.com",
	])

	assert.equal(response.getHeader("Access-Control-Allow-Origin"), "https://husky.example.com")
	assert.equal(response.getHeader("Vary"), "Accept-Encoding, Origin")
})

test("removes a wildcard header for origins outside the allowlist", () => {
	const response = createHeaderRecorder({ "Access-Control-Allow-Origin": "*" })

	setHtmlSandboxRuntimeCorsHeaders(response, "https://untrusted.example.com", [
		"https://magic.example.com",
	])

	assert.equal(response.getHeader("Access-Control-Allow-Origin"), undefined)
	assert.equal(response.getHeader("Vary"), "Origin")
})
