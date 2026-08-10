const assert = require("node:assert/strict")
const test = require("node:test")
const sourceMapAccessMiddleware = require("../middleware/sourceMapAccessMiddleware")

function invokeMiddleware(request) {
	const headers = new Map()
	let nextCalled = false
	let responseBody

	const response = {
		statusCode: 200,
		setHeader(name, value) {
			headers.set(name.toLowerCase(), String(value))
		},
		status(statusCode) {
			this.statusCode = statusCode
			return this
		},
		send(body) {
			responseBody = body
			return this
		},
	}

	sourceMapAccessMiddleware(request, response, () => {
		nextCalled = true
	})

	return {
		headers,
		nextCalled,
		responseBody,
		statusCode: response.statusCode,
	}
}

test("blocks source map requests without revealing whether the file exists", () => {
	for (const request of [
		{ path: "/assets/index.js.map", url: "/assets/index.js.map" },
		{ path: "/assets/index.js.map", url: "/assets/index.js.map?v=1" },
		{ path: "/assets/index.js.MAP", url: "/assets/index.js.MAP" },
		{ path: "/assets/index.js%2Emap", url: "/assets/index.js%2Emap" },
	]) {
		const result = invokeMiddleware(request)

		assert.equal(result.statusCode, 404)
		assert.equal(result.responseBody, "")
		assert.equal(result.headers.get("cache-control"), "no-store")
		assert.equal(result.nextCalled, false)
	}
})

test("uses the URL pathname when Express path is unavailable", () => {
	const result = invokeMiddleware({ url: "/assets/index.js.map?v=1" })

	assert.equal(result.statusCode, 404)
	assert.equal(result.nextCalled, false)
})

test("allows regular static asset requests to continue", () => {
	for (const path of ["/assets/index.js", "/assets/map-icon.js", "/assets/app.css"]) {
		const result = invokeMiddleware({ path, url: path })

		assert.equal(result.statusCode, 200)
		assert.equal(result.responseBody, undefined)
		assert.equal(result.headers.get("cache-control"), undefined)
		assert.equal(result.nextCalled, true)
	}
})
