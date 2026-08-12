const assert = require("node:assert/strict")
const http = require("node:http")
const { afterEach, test } = require("node:test")
const MicroAppInstallRoutes = require("../routes/micro-app-install.route")
const getGlobalPlatformInfo = require("../apis/getGlobalPlatformInfo")
const { processHtmlContent } = require("../middleware/seoMiddleware/html-utils")
const buildInstallLinks = require("../middleware/seoMiddleware/micro-app-install-links")

const originalFetch = global.fetch
const TEST_APP_ID = "900000000000000001"
const generatedIconSvg = Buffer.from(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#111" d="M4 4h16v16H4z"/></svg>',
)

afterEach(() => {
	global.fetch = originalFetch
	getGlobalPlatformInfo.resetCache()
})

function createResponse() {
	return {
		body: null,
		headers: {},
		statusCode: 200,
		setHeader(name, value) {
			this.headers[name.toLowerCase()] = value
		},
		status(value) {
			this.statusCode = value
			return this
		},
		json(value) {
			this.body = value
			return this
		},
		send(value) {
			this.body = value
			return this
		},
		sendFile(value) {
			this.body = value
			return this
		},
	}
}

function mockPublishedMicroApp({ appId = TEST_APP_ID, iconUrl = "" } = {}) {
	global.fetch = async (url) => {
		if (url.includes("/api/v1/settings/global")) {
			return new Response(JSON.stringify({ data: { favicon: "" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}
		if (url.includes("/api/v1/share/micro-apps/")) {
			return new Response(
				JSON.stringify({
					data: { app_id: appId, resource_id: "resource-1", icon_url: iconUrl },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			)
		}
		if (url.includes("/title")) {
			return new Response(JSON.stringify({ data: { project_name: "测试微应用" } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}
		throw new Error(`Unexpected request: ${url}`)
	}
}

test("builds a distinct password-free manifest for each published micro app", async () => {
	mockPublishedMicroApp()
	const response = createResponse()
	await new MicroAppInstallRoutes().manifest(
		{ params: { appId: TEST_APP_ID } },
		response,
		(error) => {
			throw error
		},
	)

	assert.equal(response.body.id, `/micro-app/${TEST_APP_ID}`)
	assert.equal(response.body.start_url, `/micro-app/${TEST_APP_ID}?source=pwa`)
	assert.equal(response.body.name, "测试微应用")
	assert.equal(response.headers["content-type"], "application/manifest+json; charset=utf-8")
	assert.match(response.headers["cache-control"], /no-store/)
	assert.doesNotMatch(JSON.stringify(response.body), /password|temporary_token|token=/i)
	assert.deepEqual(response.body.icons, [
		{
			src: `/micro-app/${TEST_APP_ID}/icon?size=192`,
			sizes: "192x192",
			type: "image/svg+xml",
		},
		{
			src: `/micro-app/${TEST_APP_ID}/icon?size=512`,
			sizes: "512x512",
			type: "image/svg+xml",
		},
	])

	mockPublishedMicroApp({ appId: "900000000000000002" })
	const secondResponse = createResponse()
	await new MicroAppInstallRoutes().manifest(
		{ params: { appId: "900000000000000002" } },
		secondResponse,
		(error) => {
			throw error
		},
	)
	assert.equal(secondResponse.body.id, "/micro-app/900000000000000002")
	assert.notEqual(secondResponse.body.start_url, response.body.start_url)
})

test("rejects an unpublished micro app instead of returning a manifest", async () => {
	global.fetch = async () => new Response(JSON.stringify({ data: null }), { status: 200 })
	const response = createResponse()
	await new MicroAppInstallRoutes().manifest(
		{ params: { appId: TEST_APP_ID } },
		response,
		(error) => {
			throw error
		},
	)

	assert.equal(response.statusCode, 404)
	assert.equal(response.body, "")
})

test("serves the generated SVG app icon through the same-origin icon route", async () => {
	const iconUrl = "https://files.example.com/icon.svg?token=secret"
	global.fetch = async (url) => {
		if (url.includes("/api/v1/share/micro-apps/")) {
			return new Response(
				JSON.stringify({
					data: {
						app_id: TEST_APP_ID,
						resource_id: "resource-1",
						cover_url: "https://files.example.com/cover.png",
						icon_url: iconUrl,
					},
				}),
				{ status: 200 },
			)
		}
		assert.equal(url, iconUrl)
		return new Response(generatedIconSvg, {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
		})
	}

	const response = createResponse()
	await new MicroAppInstallRoutes().icon(
		{ params: { appId: TEST_APP_ID }, query: { size: "192" } },
		response,
		(error) => {
			throw error
		},
	)

	assert.equal(response.headers["content-type"], "image/svg+xml")
	assert.deepEqual(response.body, generatedIconSvg)
})

test("proxies an upstream SVG icon without changing its MIME type", async () => {
	const upstream = http.createServer((req, res) => {
		assert.equal(req.url, "/icon.svg")
		res.writeHead(200, { "content-type": "image/svg+xml" })
		res.end(generatedIconSvg)
	})
	await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve))
	const address = upstream.address()
	assert.ok(address && typeof address === "object")

	const originalFetchForTest = global.fetch
	global.fetch = async (url, options) => {
		if (url.includes("/api/v1/share/micro-apps/")) {
			return new Response(
				JSON.stringify({
					data: { resource_id: "resource-1", icon_url: `http://127.0.0.1:${address.port}/icon.svg` },
				}),
				{ status: 200, headers: { "content-type": "application/json" } },
			)
		}
		return originalFetchForTest(url, options)
	}

	try {
		const response = createResponse()
		await new MicroAppInstallRoutes().icon(
			{ params: { appId: TEST_APP_ID }, query: { size: "512" } },
			response,
			(error) => {
				throw error
			},
		)

		assert.equal(response.headers["content-type"], "image/svg+xml")
		assert.deepEqual(response.body, generatedIconSvg)
	} finally {
		global.fetch = originalFetchForTest
		await new Promise((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())))
	}
})

test("uses the management favicon as the fallback icon and returns 404 without one", async () => {
	mockPublishedMicroApp()
	global.fetch = async (url) => {
		if (url.includes("/api/v1/settings/global")) {
			return new Response(
				JSON.stringify({ data: { favicon: "https://files.example.com/favicon.svg" } }),
				{ status: 200 },
			)
		}
		if (url.includes("/api/v1/share/micro-apps/")) {
			return new Response(
				JSON.stringify({ data: { resource_id: "resource-1", icon_url: "" } }),
				{ status: 200 },
			)
		}
		return new Response(generatedIconSvg, {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
		})
	}
	const route = new MicroAppInstallRoutes()
	const response = createResponse()
	await route.icon(
		{ params: { appId: TEST_APP_ID }, query: { size: "192" } },
		response,
		(error) => {
			throw error
		},
	)
	assert.equal(response.headers["content-type"], "image/svg+xml")
	assert.deepEqual(response.body, generatedIconSvg)

	global.fetch = async (url) => {
		if (url.includes("/api/v1/settings/global"))
			return new Response(JSON.stringify({ data: { favicon: "" } }), { status: 200 })
		return new Response(JSON.stringify({ data: { resource_id: "resource-1", icon_url: "" } }), {
			status: 200,
		})
	}
	const missingResponse = createResponse()
	await route.icon(
		{ params: { appId: TEST_APP_ID }, query: { size: "192" } },
		missingResponse,
		(error) => {
			throw error
		},
	)
	assert.equal(missingResponse.statusCode, 404)
})

test("does not use a published cover when the app icon is unavailable", async () => {
	global.fetch = async (url) => {
		assert.match(url, /\/api\/v1\/share\/micro-apps\//)
		return new Response(
			JSON.stringify({
				data: {
					app_id: TEST_APP_ID,
					resource_id: "resource-1",
					cover_url: "https://files.example.com/cover.png",
					icon_url: "",
				},
			}),
			{ status: 200 },
		)
	}

	const response = createResponse()
	await new MicroAppInstallRoutes().icon(
		{ params: { appId: TEST_APP_ID }, query: { size: "192" } },
		response,
		(error) => {
			throw error
		},
	)

	assert.equal(response.statusCode, 404)
})

test("uses the management favicon as the fallback icon", async () => {
	const managementIconUrl = "https://files.example.com/management-favicon.svg"
	global.fetch = async (url) => {
		if (url.includes("/api/v1/settings/global")) {
			return new Response(JSON.stringify({ data: { favicon: managementIconUrl } }), {
				status: 200,
				headers: { "content-type": "application/json" },
			})
		}
		if (url.includes("/api/v1/share/micro-apps/")) {
			return new Response(
				JSON.stringify({
					data: { app_id: TEST_APP_ID, resource_id: "resource-1", icon_url: "" },
				}),
				{ status: 200 },
			)
		}
		assert.equal(url, managementIconUrl)
		return new Response(generatedIconSvg, {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
		})
	}

	const response = createResponse()
	await new MicroAppInstallRoutes().icon(
		{ params: { appId: TEST_APP_ID }, query: {} },
		response,
		(error) => {
			throw error
		},
	)

	assert.deepEqual(response.body, generatedIconSvg)
})

test("does not proxy unsafe SVG active content", async () => {
	const iconUrl = "https://files.example.com/icon.svg"
	global.fetch = async (url) => {
		if (url.includes("/api/v1/share/micro-apps/")) {
			return new Response(
				JSON.stringify({ data: { resource_id: "resource-1", icon_url: iconUrl } }),
				{ status: 200 },
			)
		}
		return new Response("<svg><script>alert(1)</script></svg>", {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
		})
	}
	const response = createResponse()
	await new MicroAppInstallRoutes().icon(
		{ params: { appId: TEST_APP_ID }, query: {} },
		response,
		(error) => {
			throw error
		},
	)
	assert.equal(response.statusCode, 404)
})

test("injects install links only when the public micro app route opts in", () => {
	assert.deepEqual(buildInstallLinks({}, TEST_APP_ID), {})
	assert.deepEqual(buildInstallLinks({ installable: true }, TEST_APP_ID), {
		manifestUrl: `/micro-app/${TEST_APP_ID}/manifest.webmanifest`,
		appleTouchIconUrl: `/micro-app/${TEST_APP_ID}/icon?size=180`,
	})

	const html = processHtmlContent(
		'<html><head><meta name="viewport" content="width=device-width" /></head></html>',
		{
			favicon: "",
			title: "Micro App",
			keywords: "",
			description: "",
			ogUrl: "https://example.com/micro-app/1",
			manifestUrl: "/micro-app/1/manifest.webmanifest",
			appleTouchIconUrl: "/micro-app/1/icon?size=180",
		},
	)
	assert.match(
		html,
		/rel="manifest" href="&#x2F;micro-app&#x2F;1&#x2F;manifest\.webmanifest" data-micro-app-install="manifest"/,
	)
	assert.match(
		html,
		/rel="apple-touch-icon" href="&#x2F;micro-app&#x2F;1&#x2F;icon\?size=180" data-micro-app-install="apple-touch-icon"/,
	)
})
