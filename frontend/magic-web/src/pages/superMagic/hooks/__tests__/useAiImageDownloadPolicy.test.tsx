import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DownloadImageMode } from "@/pages/superMagic/pages/Workspace/types"
import { useAiImageDownloadPolicy } from "../useAiImageDownloadPolicy"

const policyState = vi.hoisted(() => ({
	isInternationalSite: false,
	hasGlobalAgreement: false,
	isFreeTrialVersion: false,
}))

vi.mock("@/utils/env", () => ({
	isInternationalEnv: () => policyState.isInternationalSite,
}))

vi.mock("@/hooks/useAiWatermarkPreference", () => ({
	useAiWatermarkPreference: () => ({
		hasGlobalAgreement: policyState.hasGlobalAgreement,
		isFreeTrialVersion: policyState.isFreeTrialVersion,
	}),
}))

describe("useAiImageDownloadPolicy", () => {
	beforeEach(() => {
		policyState.isInternationalSite = false
		policyState.hasGlobalAgreement = false
		policyState.isFreeTrialVersion = false
	})

	it("defers high-quality download to the shared agreement modal", () => {
		const onDownload = vi.fn()
		const { result } = renderHook(() =>
			useAiImageDownloadPolicy<{ id: string }>({ onDownload }),
		)

		act(() => result.current.handleDownloadNoWaterMark({ id: "image-1" }))

		expect(onDownload).not.toHaveBeenCalled()
		expect(result.current.agreementModal).toBeTruthy()
	})

	it("downloads directly after global agreement and collapses the menu entry", () => {
		policyState.hasGlobalAgreement = true
		const onDownload = vi.fn()
		const { result } = renderHook(() =>
			useAiImageDownloadPolicy<{ id: string }>({ onDownload }),
		)

		act(() => result.current.handleDownloadNoWaterMark({ id: "image-1" }))

		expect(onDownload).toHaveBeenCalledWith(DownloadImageMode.HighQuality, {
			id: "image-1",
		})
		expect(result.current.shouldUseSingleDownloadEntry).toBe(true)
	})
})
