/**
 * Infer MIME type from a base64 data URI or file extension.
 */
function inferMimeType(base64: string, fileName: string): string {
	if (base64.includes("data:")) {
		const match = base64.match(/data:([^;]+);/)
		if (match) return match[1]
	}
	const ext = fileName.split(".").pop()?.toLowerCase()
	if (ext) {
		const mimeMap: Record<string, string> = {
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			png: "image/png",
			gif: "image/gif",
			webp: "image/webp",
			pdf: "application/pdf",
			txt: "text/plain",
			json: "application/json",
			mp3: "audio/mpeg",
			mp4: "video/mp4",
			mov: "video/quicktime",
			m4a: "audio/mp4",
		}
		if (mimeMap[ext]) return mimeMap[ext]
	}
	return "application/octet-stream"
}

const BASE64_DECODE_CHUNK_SIZE = 32 * 1024
const BASE64_YIELD_THRESHOLD = 1024 * 1024

function getBase64Payload(base64: string): string {
	const separatorIndex = base64.indexOf(",")
	return separatorIndex >= 0 ? base64.slice(separatorIndex + 1) : base64
}

function decodeBase64Chunk(binaryString: string, offset: number, end: number): Uint8Array {
	const bytes = new Uint8Array(end - offset)
	for (let index = offset; index < end; index += 1) {
		bytes[index - offset] = binaryString.charCodeAt(index)
	}
	return bytes
}

function decodeBase64Chunks(base64: string): Uint8Array[] {
	const binaryString = atob(getBase64Payload(base64))
	const chunks: Uint8Array[] = []

	for (let offset = 0; offset < binaryString.length; offset += BASE64_DECODE_CHUNK_SIZE) {
		const end = Math.min(offset + BASE64_DECODE_CHUNK_SIZE, binaryString.length)
		chunks.push(decodeBase64Chunk(binaryString, offset, end))
	}

	return chunks
}

function yieldToBrowser(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0)
	})
}

/**
 * Convert base64 string to File object (async version).
 * Decodes the payload in chunks so large screenshots do not monopolize the
 * main thread while the browser is processing the upload request.
 * @param base64 - Base64 string (with or without data URI prefix)
 * @param fileName - Name for the created file
 * @returns File object
 */
export async function base64ToFile(base64: string, fileName: string): Promise<File> {
	const mimeType = inferMimeType(base64, fileName)
	const binaryString = atob(getBase64Payload(base64))
	const chunks: Uint8Array[] = []
	let processedBytes = 0

	for (let offset = 0; offset < binaryString.length; offset += BASE64_DECODE_CHUNK_SIZE) {
		const end = Math.min(offset + BASE64_DECODE_CHUNK_SIZE, binaryString.length)
		const bytes = decodeBase64Chunk(binaryString, offset, end)
		chunks.push(bytes)
		processedBytes += bytes.byteLength

		if (processedBytes >= BASE64_YIELD_THRESHOLD && end < binaryString.length) {
			processedBytes = 0
			await yieldToBrowser()
		}
	}

	return new File(chunks, fileName, { type: mimeType })
}

/**
 * @deprecated Use the async version of base64ToFile instead.
 * Synchronous base64 to File conversion — kept for backward compatibility
 * with callers that cannot use async/await.
 */
export function base64ToFileSync(base64: string, fileName: string): File {
	const mimeType = inferMimeType(base64, fileName)
	return new File(decodeBase64Chunks(base64), fileName, { type: mimeType })
}

/**
 * Extract file name from file path
 * @param filePath - File path (e.g., "file://var/mobile/.../document.pdf")
 * @returns File name
 */
export function extractFileNameFromPath(filePath: string): string {
	// Extract the last segment after the last slash
	const segments = filePath.split("/")
	const fileName = segments[segments.length - 1]

	// Decode URI components if needed
	try {
		return decodeURIComponent(fileName)
	} catch (error) {
		return fileName
	}
}
