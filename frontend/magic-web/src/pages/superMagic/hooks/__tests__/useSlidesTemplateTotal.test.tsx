import { renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSlidesTemplateStatistics, useSlidesTemplateTotal } from "../useSlidesTemplateTotal"

const getSlidesTemplateCountMock = vi.hoisted(() => vi.fn())

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getSlidesTemplateCount: getSlidesTemplateCountMock,
	},
}))

describe("useSlidesTemplateTotal", () => {
	beforeEach(() => {
		getSlidesTemplateCountMock.mockReset()
	})

	it("reads the shared total from the existing slides template count API", async () => {
		getSlidesTemplateCountMock.mockResolvedValue({
			total: 101582,
			template_total_usage_count: 7293,
		})
		const { result } = renderHook(() => useSlidesTemplateTotal(), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
			),
		})

		await waitFor(() => expect(result.current).toBe(101582))
		expect(getSlidesTemplateCountMock).toHaveBeenCalledWith({})
	})

	it("keeps cumulative usage optional until the backend returns the new field", async () => {
		getSlidesTemplateCountMock.mockResolvedValue({ total: 101582 })
		const { result } = renderHook(() => useSlidesTemplateStatistics(), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
			),
		})

		await waitFor(() => expect(result.current?.templateTotal).toBe(101582))
		expect(result.current?.templateTotalUsageCount).toBeUndefined()
	})
})
