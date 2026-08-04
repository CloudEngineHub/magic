export type DevicePerformanceTier = "low" | "normal" | "high" | "unknown"

export interface DevicePerformanceSignals {
	hardwareConcurrency?: number
	deviceMemory?: number
	effectiveType?: string
	saveData?: boolean
}

interface NavigatorConnection {
	effectiveType?: string
	saveData?: boolean
}

type AdaptiveNavigator = Navigator & {
	deviceMemory?: number
	connection?: NavigatorConnection
}

export const PPT_PREVIEW_OVERSCAN_BY_DEVICE_TIER: Record<DevicePerformanceTier, number> = {
	low: 5,
	normal: 10,
	high: 15,
	unknown: 10,
}

/**
 * Live iframe cache is intentionally much smaller than the HTML/thumbnail preload window.
 * Hidden iframes still retain a full DOM/JS runtime, so even high-end devices use a steady-state
 * budget of 5 (a cold double-buffer transition may temporarily add one outgoing iframe).
 */
export const PPT_LIVE_RENDER_CACHE_SIZE_BY_DEVICE_TIER: Record<DevicePerformanceTier, number> = {
	low: 3,
	normal: 5,
	high: 5,
	unknown: 5,
}

const LOW_MAX_HARDWARE_CONCURRENCY = 4
const HIGH_MIN_HARDWARE_CONCURRENCY = 8
const LOW_MAX_DEVICE_MEMORY_GB = 4
const HIGH_MIN_DEVICE_MEMORY_GB = 8
const LOW_NETWORK_EFFECTIVE_TYPES = new Set(["slow-2g", "2g"])

function normalizePositiveNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

/**
 * Resolve a stable device tier from the browser signals used by adaptive-loading libraries.
 * A single constrained signal is enough to protect a low-end device, while high tier requires
 * both CPU and memory evidence. Missing or ambiguous signals deliberately fall back to normal.
 */
export function resolveDevicePerformanceTier(
	signals: DevicePerformanceSignals,
): DevicePerformanceTier {
	const hardwareConcurrency = normalizePositiveNumber(signals.hardwareConcurrency)
	const deviceMemory = normalizePositiveNumber(signals.deviceMemory)
	const effectiveType = signals.effectiveType?.toLowerCase()

	if (
		signals.saveData === true ||
		(effectiveType !== undefined && LOW_NETWORK_EFFECTIVE_TYPES.has(effectiveType)) ||
		(hardwareConcurrency !== undefined &&
			hardwareConcurrency <= LOW_MAX_HARDWARE_CONCURRENCY) ||
		(deviceMemory !== undefined && deviceMemory <= LOW_MAX_DEVICE_MEMORY_GB)
	) {
		return "low"
	}

	if (hardwareConcurrency === undefined || deviceMemory === undefined) return "unknown"

	const hasHighEndHardware =
		hardwareConcurrency >= HIGH_MIN_HARDWARE_CONCURRENCY &&
		deviceMemory >= HIGH_MIN_DEVICE_MEMORY_GB
	const hasConstrainedNetwork = effectiveType === "3g"

	if (hasHighEndHardware && !hasConstrainedNetwork) return "high"

	return "normal"
}

export function getDevicePerformanceSignals(): DevicePerformanceSignals {
	if (typeof navigator === "undefined") return {}

	const adaptiveNavigator = navigator as AdaptiveNavigator
	return {
		hardwareConcurrency: adaptiveNavigator.hardwareConcurrency,
		deviceMemory: adaptiveNavigator.deviceMemory,
		effectiveType: adaptiveNavigator.connection?.effectiveType,
		saveData: adaptiveNavigator.connection?.saveData,
	}
}

/** Returns the number of slide rows mounted and preloaded on each side of the viewport. */
export function getPPTPreviewOverscan(): number {
	return resolvePPTPreviewOverscan(getDevicePerformanceSignals())
}

export function resolvePPTPreviewOverscan(signals: DevicePerformanceSignals): number {
	const tier = resolveDevicePerformanceTier(signals)
	return PPT_PREVIEW_OVERSCAN_BY_DEVICE_TIER[tier]
}

/** Returns the maximum number of real PPT iframe renderers kept alive at once. */
export function getPPTLiveRenderCacheSize(): number {
	return resolvePPTLiveRenderCacheSize(getDevicePerformanceSignals())
}

export function resolvePPTLiveRenderCacheSize(signals: DevicePerformanceSignals): number {
	const tier = resolveDevicePerformanceTier(signals)
	return PPT_LIVE_RENDER_CACHE_SIZE_BY_DEVICE_TIER[tier]
}
