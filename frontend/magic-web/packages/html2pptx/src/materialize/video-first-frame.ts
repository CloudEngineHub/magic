export interface CaptureVideoFirstFrameOptions {
	seekSeconds?: number
	timeoutMs?: number
	signal?: AbortSignal
}

export async function captureVideoFirstFrameDataUrl(
	_video: HTMLVideoElement,
	_options: CaptureVideoFirstFrameOptions = {},
): Promise<string | null> {
	return null
}
