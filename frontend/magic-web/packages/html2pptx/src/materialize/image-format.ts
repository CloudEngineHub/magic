const MIME_ALIASES: Record<string, string> = {
	"image/jpg": "image/jpeg",
}

const GENERIC_MIMES = new Set([
	"",
	"application/octet-stream",
	"binary/octet-stream",
	"image/octet-stream",
])

/** Resolve the real image MIME, preferring the fetched Blob type over URL heuristics. */
export function resolveImageMime(blobMime: string, src: string): string {
	const normalizedBlobMime = normalizeImageMime(blobMime)
	const isSpecificImageMime =
		normalizedBlobMime.startsWith("image/") && !GENERIC_MIMES.has(normalizedBlobMime)
	if (isSpecificImageMime) return normalizedBlobMime
	return inferImageMimeFromSource(src) || normalizedBlobMime || "application/octet-stream"
}

/** PNG and JPEG are the static raster formats converted to WebP during PPT export. */
export function shouldConvertImageToWebp(mime: string, src: string): boolean {
	const resolvedMime = resolveImageMime(mime, src)
	return resolvedMime === "image/png" || resolvedMime === "image/jpeg"
}

export function isGifSource(src: string): boolean {
	return inferImageMimeFromSource(src) === "image/gif"
}

export function isSvgSource(src: string): boolean {
	return inferImageMimeFromSource(src) === "image/svg+xml"
}

function normalizeImageMime(mime: string): string {
	const normalized = mime.split(";", 1)[0].trim().toLowerCase()
	return MIME_ALIASES[normalized] ?? normalized
}

function inferImageMimeFromSource(src: string): string {
	const normalizedSrc = src.trim()
	const dataUrlMime = normalizedSrc.match(/^data:([^;,]+)/i)?.[1]
	if (dataUrlMime) return normalizeImageMime(dataUrlMime)

	try {
		const url = new URL(normalizedSrc, "https://html2pptx.local")
		const responseContentType = url.searchParams.get("response-content-type")
		if (responseContentType) {
			return normalizeImageMime(decodeURIComponent(responseContentType))
		}

		const responseContentDisposition = url.searchParams.get("response-content-disposition")
		if (responseContentDisposition) {
			const filename = decodeURIComponent(responseContentDisposition).match(
				/filename\*?=(?:UTF-8''|"?)([^";]+)/i,
			)?.[1]
			if (filename) {
				const extension = filename.toLowerCase().split(".").pop()
				if (extension === "jpe" || extension === "jpeg" || extension === "jpg")
					return "image/jpeg"
				if (extension === "png") return "image/png"
				if (extension === "gif") return "image/gif"
				if (extension === "svg") return "image/svg+xml"
				if (extension === "webp") return "image/webp"
			}
		}

		const pathname = url.pathname.toLowerCase()
		if (/\.jpe?g$/.test(pathname)) return "image/jpeg"
		if (/\.png$/.test(pathname)) return "image/png"
		if (/\.gif$/.test(pathname)) return "image/gif"
		if (/\.svg$/.test(pathname)) return "image/svg+xml"
		if (/\.webp$/.test(pathname)) return "image/webp"
	} catch {
		return ""
	}

	return ""
}
