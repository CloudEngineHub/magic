import { describe, expect, it } from "vitest"
import {
	buildSimulatedWaveformBars,
	resetSimulatedWaveformBarsCache,
	WAVE_BUCKET_COUNT,
} from "../simulated-waveform-bars"

describe("buildSimulatedWaveformBars", () => {
	it("returns 100 normalized decorative peaks by default", () => {
		resetSimulatedWaveformBarsCache()
		const bars = buildSimulatedWaveformBars()
		expect(bars).toHaveLength(WAVE_BUCKET_COUNT)
		expect(bars.every((value) => value > 0 && value <= 1)).toBe(true)
	})

	it("is deterministic for the same bucket count", () => {
		resetSimulatedWaveformBarsCache()
		const first = buildSimulatedWaveformBars(24)
		const second = buildSimulatedWaveformBars(24)
		expect(first).toEqual(second)
	})
})
