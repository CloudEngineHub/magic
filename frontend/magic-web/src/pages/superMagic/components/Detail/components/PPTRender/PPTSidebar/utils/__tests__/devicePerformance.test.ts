import { describe, expect, it } from "vitest"
import {
	resolveDevicePerformanceTier,
	resolvePPTLiveRenderCacheSize,
	resolvePPTPreviewOverscan,
} from "../devicePerformance"

describe("PPT sidebar device performance", () => {
	it("uses a five-page overscan for constrained devices", () => {
		expect(resolveDevicePerformanceTier({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(
			"low",
		)
		expect(resolveDevicePerformanceTier({ hardwareConcurrency: 12, deviceMemory: 4 })).toBe(
			"low",
		)
		expect(
			resolveDevicePerformanceTier({
				hardwareConcurrency: 12,
				deviceMemory: 8,
				effectiveType: "2g",
			}),
		).toBe("low")
		expect(
			resolveDevicePerformanceTier({
				hardwareConcurrency: 12,
				deviceMemory: 8,
				saveData: true,
			}),
		).toBe("low")
		expect(resolvePPTPreviewOverscan({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(5)
	})

	it("uses a fifteen-page overscan only when both CPU and memory are high-end", () => {
		expect(
			resolveDevicePerformanceTier({
				hardwareConcurrency: 8,
				deviceMemory: 8,
				effectiveType: "4g",
			}),
		).toBe("high")
		expect(resolveDevicePerformanceTier({ hardwareConcurrency: 16, deviceMemory: 16 })).toBe(
			"high",
		)
		expect(resolvePPTPreviewOverscan({ hardwareConcurrency: 16, deviceMemory: 16 })).toBe(15)
	})

	it("uses a ten-page overscan for normal or partially constrained devices", () => {
		expect(resolveDevicePerformanceTier({ hardwareConcurrency: 6, deviceMemory: 8 })).toBe(
			"normal",
		)
		expect(
			resolveDevicePerformanceTier({
				hardwareConcurrency: 12,
				deviceMemory: 8,
				effectiveType: "3g",
			}),
		).toBe("normal")
		expect(resolvePPTPreviewOverscan({ hardwareConcurrency: 6, deviceMemory: 8 })).toBe(10)
	})

	it("falls back to a ten-page overscan when capability signals cannot identify the device", () => {
		expect(resolveDevicePerformanceTier({})).toBe("unknown")
		expect(resolveDevicePerformanceTier({ hardwareConcurrency: 12 })).toBe("unknown")
		expect(resolveDevicePerformanceTier({ deviceMemory: 8 })).toBe("unknown")
		expect(
			resolveDevicePerformanceTier({
				hardwareConcurrency: Number.NaN,
				deviceMemory: 0,
			}),
		).toBe("unknown")
		expect(resolvePPTPreviewOverscan({})).toBe(10)
	})

	it("keeps the live iframe cache much smaller than the HTML preload window", () => {
		expect(resolvePPTLiveRenderCacheSize({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(3)
		expect(resolvePPTLiveRenderCacheSize({ hardwareConcurrency: 6, deviceMemory: 8 })).toBe(5)
		expect(resolvePPTLiveRenderCacheSize({ hardwareConcurrency: 16, deviceMemory: 16 })).toBe(5)
		expect(resolvePPTLiveRenderCacheSize({})).toBe(5)
	})
})
