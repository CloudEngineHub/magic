const MAX_ICON_BYTES = 2 * 1024 * 1024
const ALLOWED_ICON_TYPES = new Set([
	"image/gif",
	"image/jpeg",
	"image/png",
	"image/svg+xml",
	"image/webp",
	"image/x-icon",
	"image/vnd.microsoft.icon",
])

function inferContentType(url) {
	const pathname = new URL(url).pathname.toLowerCase()
	if (pathname.endsWith(".svg")) return "image/svg+xml"
	if (pathname.endsWith(".png")) return "image/png"
	if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg"
	if (pathname.endsWith(".webp")) return "image/webp"
	if (pathname.endsWith(".ico")) return "image/x-icon"
	return ""
}

function assertSafeSvg(body) {
	const svg = body
		.toString("utf8")
		.replace(/^\uFEFF/, "")
		.trim()
	if (!/^<svg(?:\s|>)/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
		throw new Error("Install icon has an invalid SVG document")
	}
	if (/<(?:script|foreignObject)\b/i.test(svg)) {
		throw new Error("Install icon SVG contains active content")
	}
	if (/(?:\bon\w+\s*=|javascript\s*:|data\s*:\s*text\/html)/i.test(svg)) {
		throw new Error("Install icon SVG contains unsafe content")
	}
}

async function readLimitedBody(response) {
	const contentLength = Number(response.headers.get("content-length") || 0)
	if (contentLength > MAX_ICON_BYTES) throw new Error("Install icon is too large")
	if (!response.body) throw new Error("Install icon response has no body")

	const chunks = []
	let totalBytes = 0
	const reader = response.body.getReader()
	while (true) {
		const { done, value } = await reader.read()
		if (done) break
		totalBytes += value.byteLength
		if (totalBytes > MAX_ICON_BYTES) {
			await reader.cancel()
			throw new Error("Install icon is too large")
		}
		chunks.push(Buffer.from(value))
	}
	return Buffer.concat(chunks, totalBytes)
}

/**
 * Downloads the backend-resolved icon URL and returns its bounded body.
 * The public request cannot choose this URL, so the route still validates the
 * protocol, response type, and response size before proxying it.
 */
module.exports = async function downloadInstallIcon(rawUrl) {
	const url = new URL(rawUrl)
	if (!["http:", "https:"].includes(url.protocol)) {
		throw new Error("Unsupported install icon protocol")
	}

	const response = await fetch(url.toString(), {
		redirect: "follow",
		signal: AbortSignal.timeout(5_000),
	})
	if (!response.ok) throw new Error(`Install icon request failed with ${response.status}`)

	const responseContentType =
		response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || ""
	const inferredContentType = inferContentType(url)
	const contentType = ALLOWED_ICON_TYPES.has(responseContentType)
		? responseContentType
		: ["", "application/octet-stream", "binary/octet-stream"].includes(responseContentType)
			? inferredContentType
			: responseContentType
	if (!ALLOWED_ICON_TYPES.has(contentType)) {
		throw new Error("Install icon must be an image")
	}

	const body = await readLimitedBody(response)
	if (contentType === "image/svg+xml") assertSafeSvg(body)
	return { body, contentType }
}

module.exports.MAX_ICON_BYTES = MAX_ICON_BYTES
module.exports.ALLOWED_ICON_TYPES = ALLOWED_ICON_TYPES
