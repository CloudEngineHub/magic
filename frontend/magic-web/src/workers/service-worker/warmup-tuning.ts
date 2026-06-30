import {
	WARMUP_HIGH_BATCH_SIZE,
	WARMUP_HIGH_INTERVAL_MS,
	WARMUP_LOW_BATCH_SIZE,
	WARMUP_LOW_INTERVAL_MS,
	WARMUP_LOW_TIER_MAX_CORES,
	WARMUP_MAX_BATCH_SIZE,
	WARMUP_MAX_INTERVAL_MS,
	WARMUP_MEDIUM_BATCH_SIZE,
	WARMUP_MEDIUM_INTERVAL_MS,
	WARMUP_MEDIUM_TIER_MAX_CORES,
	WARMUP_MIN_BATCH_SIZE,
	WARMUP_MIN_INTERVAL_MS,
} from "./sw-constants"
import type { WarmUpOptions } from "./types"

type WarmUpTier = "low" | "medium" | "high"

const WARMUP_TIER_OPTIONS: Record<WarmUpTier, WarmUpOptions> = {
	low: { batchSize: WARMUP_LOW_BATCH_SIZE, intervalMs: WARMUP_LOW_INTERVAL_MS },
	medium: { batchSize: WARMUP_MEDIUM_BATCH_SIZE, intervalMs: WARMUP_MEDIUM_INTERVAL_MS },
	high: { batchSize: WARMUP_HIGH_BATCH_SIZE, intervalMs: WARMUP_HIGH_INTERVAL_MS },
}

/**
 * Clamps warm-up tuning to safe bounds so malformed postMessage values cannot overload the SW.
 */
export function clampWarmUpOptions(options: WarmUpOptions): WarmUpOptions {
	const batchSize = Math.min(
		WARMUP_MAX_BATCH_SIZE,
		Math.max(WARMUP_MIN_BATCH_SIZE, Math.floor(options.batchSize)),
	)
	const intervalMs = Math.min(
		WARMUP_MAX_INTERVAL_MS,
		Math.max(WARMUP_MIN_INTERVAL_MS, Math.floor(options.intervalMs)),
	)

	return { batchSize, intervalMs }
}

/**
 * Maps hardwareConcurrency to low / medium / high warm-up tiers.
 */
export function resolveWarmUpTier(hardwareConcurrency: number): WarmUpTier {
	if (hardwareConcurrency <= WARMUP_LOW_TIER_MAX_CORES) return "low"
	if (hardwareConcurrency <= WARMUP_MEDIUM_TIER_MAX_CORES) return "medium"
	return "high"
}

/**
 * Resolves idle warm-up options from CPU core count (low / medium / high tiers).
 */
export function resolveWarmUpTuning(hardwareConcurrency: number): WarmUpOptions {
	return clampWarmUpOptions(WARMUP_TIER_OPTIONS[resolveWarmUpTier(hardwareConcurrency)])
}

/** Minimal Network Information API shape used for save-data detection. */
interface NavigatorConnection {
	saveData?: boolean
}

/**
 * Reads hardwareConcurrency from the main-thread navigator with a safe fallback.
 */
export function getHardwareConcurrency(): number {
	if (typeof navigator === "undefined") return 8
	const cores = navigator.hardwareConcurrency
	if (!Number.isFinite(cores) || cores <= 0) return 8
	return cores
}

/**
 * Returns whether the browser reports data-saver / save-data mode on the main thread.
 */
export function isSaveDataEnabled(): boolean {
	if (typeof navigator === "undefined") return false
	const connection = (navigator as Navigator & { connection?: NavigatorConnection }).connection
	return connection?.saveData === true
}

/**
 * Normalizes warm-up options from a postMessage payload, falling back to medium-tier defaults when invalid.
 */
export function normalizeWarmUpOptions(intervalMs: unknown, batchSize: unknown): WarmUpOptions {
	const hasValidInterval =
		typeof intervalMs === "number" && Number.isFinite(intervalMs) && intervalMs > 0
	const hasValidBatchSize =
		typeof batchSize === "number" && Number.isFinite(batchSize) && batchSize > 0

	return clampWarmUpOptions({
		intervalMs: hasValidInterval ? intervalMs : WARMUP_MEDIUM_INTERVAL_MS,
		batchSize: hasValidBatchSize ? batchSize : WARMUP_MEDIUM_BATCH_SIZE,
	})
}
