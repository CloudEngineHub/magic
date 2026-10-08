import { describe, expect, it, vi } from "vitest"
import type { CanvasAssetComplianceState } from "../../../../public/magic-types"
import { getMediaAssetId, resolveMediaComplianceStatus } from "../assetComplianceState"

describe("asset compliance state resolution", () => {
	it("uses polling, cached detail, then legacy content status for asset media", () => {
		const getState = vi.fn<(assetId: string) => CanvasAssetComplianceState | undefined>(() => ({
			assetId: "asset-1",
			status: "PROCESSING",
			failedReason: null,
		}))
		const getCachedResource = vi.fn<
			(assetId: string) => { complianceStatus?: "PASS" } | undefined
		>(() => ({ complianceStatus: "PASS" }))

		expect(
			resolveMediaComplianceStatus(
				{
					assetCompliancePollingManager: { getState },
					assetResourceManager: { getCachedResource },
				},
				{ assetId: "asset-1", complianceStatus: "FAILED" },
			),
		).toBe("PROCESSING")

		getState.mockReturnValue(undefined)
		expect(
			resolveMediaComplianceStatus(
				{
					assetCompliancePollingManager: { getState },
					assetResourceManager: { getCachedResource },
				},
				{ assetId: "asset-1", complianceStatus: "FAILED" },
			),
		).toBe("PASS")

		getCachedResource.mockReturnValue(undefined)
		expect(
			resolveMediaComplianceStatus(
				{
					assetCompliancePollingManager: { getState },
					assetResourceManager: { getCachedResource },
				},
				{ assetId: "asset-1", complianceStatus: "FAILED" },
			),
		).toBe("FAILED")
	})

	it("keeps workspace status independent from asset services", () => {
		expect(resolveMediaComplianceStatus({}, { complianceStatus: "PROCESSING" })).toBe(
			"PROCESSING",
		)
		expect(getMediaAssetId({ assetId: "  asset-1  " })).toBe("asset-1")
		expect(getMediaAssetId({ assetId: "  " })).toBeUndefined()
	})
})
