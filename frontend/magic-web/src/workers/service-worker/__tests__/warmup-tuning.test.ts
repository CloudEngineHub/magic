import { describe, expect, it } from "vitest"
import {
	clampWarmUpOptions,
	normalizeWarmUpOptions,
	resolveWarmUpTier,
	resolveWarmUpTuning,
} from "../warmup-tuning"

describe("resolveWarmUpTier", () => {
	it("classifies core counts into low, medium, and high tiers", () => {
		expect(resolveWarmUpTier(6)).toBe("low")
		expect(resolveWarmUpTier(7)).toBe("medium")
		expect(resolveWarmUpTier(11)).toBe("medium")
		expect(resolveWarmUpTier(12)).toBe("high")
	})
})

describe("resolveWarmUpTuning", () => {
	it("returns low-tier batch and interval", () => {
		expect(resolveWarmUpTuning(4)).toEqual({ batchSize: 6, intervalMs: 5000 })
	})

	it("returns medium-tier batch and interval", () => {
		expect(resolveWarmUpTuning(8)).toEqual({ batchSize: 8, intervalMs: 3000 })
	})

	it("returns high-tier batch and interval", () => {
		expect(resolveWarmUpTuning(16)).toEqual({ batchSize: 10, intervalMs: 500 })
	})
})

describe("clampWarmUpOptions", () => {
	it("clamps batch size and interval to configured bounds", () => {
		expect(
			clampWarmUpOptions({
				batchSize: 99,
				intervalMs: 99999,
			}),
		).toEqual({
			batchSize: 10,
			intervalMs: 10000,
		})
	})
})

describe("normalizeWarmUpOptions", () => {
	it("falls back to medium-tier defaults when postMessage values are invalid", () => {
		expect(normalizeWarmUpOptions("bad", null)).toEqual({
			batchSize: 8,
			intervalMs: 3000,
		})
	})

	it("clamps valid postMessage values", () => {
		expect(normalizeWarmUpOptions(150, 2)).toEqual({
			batchSize: 6,
			intervalMs: 200,
		})
	})
})
