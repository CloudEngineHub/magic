const assert = require("node:assert/strict")
const { afterEach, test } = require("node:test")
const downloadInstallIcon = require("../utils/downloadInstallIcon")

const originalFetch = global.fetch
const validSvg = Buffer.from(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#111" d="M4 4h16v16H4z"/></svg>',
)

afterEach(() => {
	global.fetch = originalFetch
})

test("downloads a bounded SVG from a backend-resolved URL", async () => {
	global.fetch = async () =>
		new Response(validSvg, {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
		})

	assert.deepEqual(await downloadInstallIcon("https://files.example.com/icon.svg"), {
		body: validSvg,
		contentType: "image/svg+xml",
	})
})

test("infers SVG content type when the response omits it", async () => {
	global.fetch = async () => new Response(validSvg, { status: 200 })

	const result = await downloadInstallIcon("https://files.example.com/icon.svg")
	assert.equal(result.contentType, "image/svg+xml")
})

test("infers SVG content type when the upstream uses a generic binary type", async () => {
	global.fetch = async () =>
		new Response(validSvg, {
			status: 200,
			headers: { "content-type": "application/octet-stream" },
		})

	const result = await downloadInstallIcon("https://files.example.com/icon.svg")
	assert.equal(result.contentType, "image/svg+xml")
})

test("rejects unsupported responses and protocols", async () => {
	global.fetch = async () =>
		new Response("not-an-image", {
			status: 200,
			headers: { "content-type": "text/plain" },
		})

	await assert.rejects(
		downloadInstallIcon("https://files.example.com/icon.svg"),
		/Install icon must be an image/,
	)
	await assert.rejects(
		downloadInstallIcon("file:///tmp/icon.svg"),
		/Unsupported install icon protocol/,
	)
})

test("rejects unsafe SVG active content", async () => {
	global.fetch = async () =>
		new Response("<svg><script>alert(1)</script></svg>", {
			status: 200,
			headers: { "content-type": "image/svg+xml" },
		})

	await assert.rejects(
		downloadInstallIcon("https://files.example.com/icon.svg"),
		/active content/,
	)
})

test("rejects icon responses above the size limit", async () => {
	global.fetch = async () =>
		new Response("too-large", {
			status: 200,
			headers: {
				"content-type": "image/svg+xml",
				"content-length": String(downloadInstallIcon.MAX_ICON_BYTES + 1),
			},
		})

	await assert.rejects(
		downloadInstallIcon("https://files.example.com/icon.svg"),
		/Install icon is too large/,
	)
})
