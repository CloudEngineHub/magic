/**
 * Device capability detection based on CPU core count and device memory, reused by concurrency/downsampling scenarios.
 */

/** Treat devices with memory <= 4 GB as low-memory devices */
export function isLowMemoryDevice(): boolean {
	const mem = (navigator as { deviceMemory?: number }).deviceMemory
	return typeof mem === "number" && mem > 0 && mem <= 4
}

/**
 * Device memory information is missing because Safari / Firefox do not support navigator.deviceMemory.
 * In this case the device capability is unknown, so use a conservative strategy to avoid misclassifying old devices as mid/high-end.
 */
export function isMemoryInfoUnavailable(): boolean {
	const mem = (navigator as { deviceMemory?: number }).deviceMemory
	return typeof mem !== "number" || mem <= 0
}

/**
 * Old/weak device detection: low memory (<=4 GB), missing memory info, or CPU cores <= 2.
 * When matched, lower concurrency and quality controls to the minimum to avoid overwhelming the device.
 */
export function isLowEndDevice(): boolean {
	const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0
	return isLowMemoryDevice() || isMemoryInfoUnavailable() || cores <= 2
}

/**
 * Controlled concurrency: old/weak devices use 1; stronger machines use 2-4 based on core count.
 * This lets fetch/snapdom and other IO run in parallel while avoiding excessive memory pressure on weak devices.
 */
export function getImageConcurrency(): number {
	if (isLowEndDevice()) return 1
	const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0
	return Math.min(4, Math.max(2, Math.floor(cores / 2)))
}

/**
 * snapdom pre-capture concurrency: old/weak devices use 1; stronger machines use 3.
 */
export function getCaptureConcurrency(): number {
	return isLowEndDevice() ? 1 : 3
}

/**
 * JPEG quality: lower quality on old/weak devices to save memory and encoding time; keep high quality on stronger machines.
 * @param highEnd quality for stronger machines (default 0.85)
 * @param lowEnd quality for weaker machines (default 0.72)
 */
export function getJpegQuality(highEnd = 0.85, lowEnd = 0.72): number {
	return isLowEndDevice() ? lowEnd : highEnd
}
