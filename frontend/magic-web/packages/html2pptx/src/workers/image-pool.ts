import type { ImageRoundingParams } from "./image-worker"

export function isImageWorkerSupported(): boolean {
	return false
}

export async function processImageInWorker(
	blob: Blob,
	_maxDimension: number,
	_useJpeg: boolean,
	_jpegQuality: number,
	_rounding?: ImageRoundingParams,
): Promise<{ buffer: ArrayBuffer; mime: string }> {
	return {
		buffer: await blob.arrayBuffer(),
		mime: blob.type || "image/png",
	}
}
