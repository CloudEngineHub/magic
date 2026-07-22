import { describe, expect, it, vi } from "vitest"
import type { CanvasDesignMethods, GenerateVideoRequest } from "../../../public/magic-types"
import { VideoPointsEstimateCache } from "../video-points-estimate.cache"

type EstimateVideoPoints = NonNullable<CanvasDesignMethods["estimateVideoPoints"]>

describe("VideoPointsEstimateCache", () => {
	const request = {
		model_id: "video-model",
		prompt: "prompt",
	} as GenerateVideoRequest

	it("returns cached estimates for repeated signatures", async () => {
		const cache = new VideoPointsEstimateCache()
		const estimateVideoPoints = vi.fn(async () => ({ points: 12 })) as EstimateVideoPoints

		await expect(
			cache.getOrRequest({
				signature: "signature",
				request,
				estimateVideoPoints,
			}),
		).resolves.toEqual({ points: 12 })
		await expect(
			cache.getOrRequest({
				signature: "signature",
				request,
				estimateVideoPoints,
			}),
		).resolves.toEqual({ points: 12 })

		expect(estimateVideoPoints).toHaveBeenCalledTimes(1)
	})

	it("deduplicates in-flight requests by signature", async () => {
		const cache = new VideoPointsEstimateCache()
		let resolveEstimate!: (value: { points: number }) => void
		const pendingEstimate = new Promise<{ points: number }>((resolve) => {
			resolveEstimate = resolve
		})
		const estimateVideoPoints = vi.fn(() => pendingEstimate) as EstimateVideoPoints

		const firstRequest = cache.getOrRequest({
			signature: "signature",
			request,
			estimateVideoPoints,
		})
		const secondRequest = cache.getOrRequest({
			signature: "signature",
			request,
			estimateVideoPoints,
		})

		expect(secondRequest).toBe(firstRequest)
		resolveEstimate({ points: 8 })
		await expect(firstRequest).resolves.toEqual({ points: 8 })
		expect(estimateVideoPoints).toHaveBeenCalledTimes(1)
	})

	it("clears cached estimates and pending request state", async () => {
		const cache = new VideoPointsEstimateCache()
		const estimateVideoPoints = vi.fn(async () => ({ points: 4 })) as EstimateVideoPoints

		await cache.getOrRequest({
			signature: "signature",
			request,
			estimateVideoPoints,
		})
		cache.clear()
		await cache.getOrRequest({
			signature: "signature",
			request,
			estimateVideoPoints,
		})

		expect(estimateVideoPoints).toHaveBeenCalledTimes(2)
	})

	it("does not cache stale in-flight responses after clear", async () => {
		const cache = new VideoPointsEstimateCache()
		let resolveStaleEstimate!: (value: { points: number }) => void
		const staleEstimate = new Promise<{ points: number }>((resolve) => {
			resolveStaleEstimate = resolve
		})
		const estimateVideoPoints = vi.fn(() => staleEstimate) as EstimateVideoPoints

		const staleRequest = cache.getOrRequest({
			signature: "signature",
			request,
			estimateVideoPoints,
		})
		cache.clear()
		resolveStaleEstimate({ points: 1 })
		await expect(staleRequest).resolves.toEqual({ points: 1 })

		const freshEstimateVideoPoints = vi.fn(async () => ({ points: 2 })) as EstimateVideoPoints
		await expect(
			cache.getOrRequest({
				signature: "signature",
				request,
				estimateVideoPoints: freshEstimateVideoPoints,
			}),
		).resolves.toEqual({ points: 2 })

		expect(freshEstimateVideoPoints).toHaveBeenCalledTimes(1)
	})
})
