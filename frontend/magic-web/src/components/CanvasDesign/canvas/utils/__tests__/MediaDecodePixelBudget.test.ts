import { describe, expect, it } from "vitest"
import {
	DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
	MediaDecodePixelBudgetGate,
	estimateScaledPixelCost,
} from "../MediaDecodePixelBudget"

describe("MediaDecodePixelBudget", () => {
	it("estimates decode pixel cost from target dimensions", () => {
		expect(estimateScaledPixelCost(4000, 2000, 1536)).toBe(1536 * 768)
		expect(estimateScaledPixelCost(4000, 2000, 384)).toBe(384 * 192)
		expect(estimateScaledPixelCost(4000, 2000, 72)).toBe(72 * 36)
		expect(estimateScaledPixelCost(4000, 2000)).toBe(4000 * 2000)
	})

	it("queues decode permits by pixel budget and releases them by priority", async () => {
		const gate = new MediaDecodePixelBudgetGate(DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET)

		const firstRelease = await gate.acquire(
			DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET,
			"visible",
		)
		let backgroundResolved = false
		let visibleResolved = false
		const backgroundPermit = gate
			.acquire(DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET, "background")
			.then((release) => {
				backgroundResolved = true
				return release
			})
		const visiblePermit = gate
			.acquire(DEFAULT_MEDIA_DECODE_CONCURRENT_PIXEL_BUDGET, "visible")
			.then((release) => {
				visibleResolved = true
				return release
			})

		await Promise.resolve()
		expect(backgroundResolved).toBe(false)
		expect(visibleResolved).toBe(false)

		firstRelease()
		const visibleRelease = await visiblePermit
		expect(visibleResolved).toBe(true)
		expect(backgroundResolved).toBe(false)

		visibleRelease()
		const backgroundRelease = await backgroundPermit
		expect(backgroundResolved).toBe(true)
		backgroundRelease()
		expect(gate.activePixelCost).toBe(0)
	})
})
