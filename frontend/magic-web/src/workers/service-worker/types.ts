/** Tuning knobs for idle static-asset warm-up, computed on the main thread. */
export interface WarmUpOptions {
	intervalMs: number
	batchSize: number
}

/** postMessage payload from the main thread to start SW static-asset warm-up. */
export interface StartWarmUpMessage {
	type: "START_WARMUP"
	assets: string[]
	intervalMs: number
	batchSize: number
}
