const assert = require("node:assert/strict")
const { afterEach, test } = require("node:test")
const SEO = require("../routes/seo.route")

const originalFetch = global.fetch
const TEST_APP_ID = "900000000000000001"

afterEach(() => {
	global.fetch = originalFetch
})

function createRequest(appId = TEST_APP_ID) {
	return {
		params: { appId },
		__(key) {
			assert.equal(key, "superMagic.microApp")
			return "微应用"
		},
	}
}

test("uses the micro app project name for Node-rendered metadata", async () => {
	const resourceId = "800000000000000001"
	const requestedUrls = []
	global.fetch = async (url) => {
		requestedUrls.push(url)
		if (url.endsWith(`/api/v1/share/micro-apps/${TEST_APP_ID}`)) {
			return {
				async json() {
					return { data: { resource_id: resourceId } }
				},
			}
		}

		assert.equal(url, `http://magic-service:9501/api/internal/${resourceId}/share_title`)
		return {
			async json() {
				return { data: { project_name: "测试微应用" } }
			},
		}
	}

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "测试微应用",
		description: "测试微应用",
		keywords: "测试微应用",
	})
	assert.deepEqual(requestedUrls, [
		`http://magic-service:9501/api/v1/share/micro-apps/${TEST_APP_ID}`,
		`http://magic-service:9501/api/internal/${resourceId}/share_title`,
	])
})

test("falls back to the localized micro app name when the project has no name", async () => {
	global.fetch = async (url) => {
		if (url.includes("/api/v1/share/micro-apps/")) {
			return {
				async json() {
					return { data: { resource_id: "800000000000000002" } }
				},
			}
		}

		return {
			async json() {
				return { data: { project_name: "  " } }
			},
		}
	}

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "微应用",
		description: "微应用",
		keywords: "微应用",
	})
})

test("does not request the project name when the micro app is unpublished", async () => {
	let requestCount = 0
	global.fetch = async (url) => {
		requestCount += 1
		assert.equal(url, `http://magic-service:9501/api/v1/share/micro-apps/${TEST_APP_ID}`)
		return {
			async json() {
				return { code: 3102, message: "published micro app not found" }
			},
		}
	}

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "微应用",
		description: "微应用",
		keywords: "微应用",
	})
	assert.equal(requestCount, 1)
})

test("falls back when the published micro app request fails", async () => {
	global.fetch = async () => {
		throw new Error("service unavailable")
	}

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "微应用",
		description: "微应用",
		keywords: "微应用",
	})
})

test("falls back when the share title request fails", async () => {
	global.fetch = async (url) => {
		if (url.includes("/api/v1/share/micro-apps/")) {
			return {
				async json() {
					return { data: { resource_id: "800000000000000003" } }
				},
			}
		}

		throw new Error("share title service unavailable")
	}

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "微应用",
		description: "微应用",
		keywords: "微应用",
	})
})
