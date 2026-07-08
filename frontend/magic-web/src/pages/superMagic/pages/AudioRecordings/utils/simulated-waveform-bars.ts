/** Number of waveform buckets shared by PC and mobile detail players. */
export const WAVE_BUCKET_COUNT = 100

let cachedBars: number[] | null = null

/**
 * Builds deterministic decorative peak norms for the detail player waveform.
 * Intentionally does not decode audio — amplitudes are not tied to real recording data.
 */
export function buildSimulatedWaveformBars(count = WAVE_BUCKET_COUNT): number[] {
	if (count === WAVE_BUCKET_COUNT && cachedBars) return cachedBars

	const bars = Array.from({ length: count }, (_, index) => {
		const waveA = Math.sin(index * 0.58) * 0.5 + 0.5
		const waveB = Math.sin(index * 0.17 + 1.7) * 0.5 + 0.5
		return 0.22 + waveA * 0.45 + waveB * 0.25
	})

	if (count === WAVE_BUCKET_COUNT) cachedBars = bars
	return bars
}

/** Clears the module-level memo so tests can observe deterministic regeneration. */
export function resetSimulatedWaveformBarsCache(): void {
	cachedBars = null
}
