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
	global.fetch = async (url) => {
		assert.equal(
			url,
			`http://magic-service:9501/api/v1/open-api/super-magic/micro-apps/${TEST_APP_ID}/title`,
		)
		return {
			async json() {
				return { data: { app_name: "测试微应用" } }
			},
		}
	}

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "测试微应用",
		description: "测试微应用",
		keywords: "测试微应用",
	})
})

test("falls back to the localized micro app name when the project has no name", async () => {
	global.fetch = async () => ({
		async json() {
			return { data: { app_name: "  " } }
		},
	})

	const result = await new SEO().microApp(createRequest())

	assert.deepEqual(result, {
		title: "微应用",
		description: "微应用",
		keywords: "微应用",
	})
})

test("falls back to the localized micro app name when the title request fails", async () => {
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
