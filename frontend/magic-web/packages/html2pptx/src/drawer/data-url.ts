/**
 * Inside the packaging worker: convert transferred image bytes to a base64 data URL,
 * encoding only right before writing to pptxgenjs so the main thread no longer keeps inflated base64 in memory.
 *
 * Chunking at 32 KB avoids passing too many arguments to String.fromCharCode and overflowing the stack.
 */
export function bytesToDataUrl(buffer: ArrayBuffer, mime: string): string {
	const u8 = new Uint8Array(buffer)
	const CHUNK = 0x8000
	let binary = ""
	for (let i = 0; i < u8.length; i += CHUNK) {
		binary += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK) as unknown as number[])
	}
	return `data:${mime || "image/png"};base64,${btoa(binary)}`
}
