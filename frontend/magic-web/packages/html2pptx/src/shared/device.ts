/**
 * 设备能力探测：基于 CPU 核心数与设备内存的通用判断，供并发/降采样等场景复用。
 */

/** 设备内存 ≤ 4GB 视为低内存设备 */
export function isLowMemoryDevice(): boolean {
	const mem = (navigator as { deviceMemory?: number }).deviceMemory
	return typeof mem === "number" && mem > 0 && mem <= 4
}

/**
 * 设备内存信息缺失（Safari / Firefox 不支持 navigator.deviceMemory）。
 * 此时无法确认是否为弱机，按保守策略对待，避免把老旧设备误判成中高端机。
 */
export function isMemoryInfoUnavailable(): boolean {
	const mem = (navigator as { deviceMemory?: number }).deviceMemory
	return typeof mem !== "number" || mem <= 0
}

/**
 * 老旧/弱机判定：低内存（≤4GB）、内存信息缺失、或 CPU 核心数 ≤ 2。
 * 命中后并发与质量等旋钮统一降到最低档，避免压垮设备。
 */
export function isLowEndDevice(): boolean {
	const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0
	return isLowMemoryDevice() || isMemoryInfoUnavailable() || cores <= 2
}

/**
 * 受控并发数：老旧/弱机统一为 1，强机器按核心数取 2~4。
 * 让 fetch/snapdom 等 IO 并行进行，同时避免弱机器内存压力过大。
 */
export function getImageConcurrency(): number {
	if (isLowEndDevice()) return 1
	const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 0
	return Math.min(4, Math.max(2, Math.floor(cores / 2)))
}

/**
 * snapdom 预截图并发：老旧/弱机统一为 1，强机器固定 3。
 */
export function getCaptureConcurrency(): number {
	return isLowEndDevice() ? 1 : 3
}

/**
 * JPEG 编码质量：老旧/弱机降到低档（省内存与编码耗时），强机器保持高质量。
 * @param highEnd 强机器质量（默认 0.85）
 * @param lowEnd 弱机器质量（默认 0.72）
 */
export function getJpegQuality(highEnd = 0.85, lowEnd = 0.72): number {
	return isLowEndDevice() ? lowEnd : highEnd
}
