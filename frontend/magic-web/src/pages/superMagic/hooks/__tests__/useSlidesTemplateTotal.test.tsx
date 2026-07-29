import { renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	SLIDES_TEMPLATE_STATISTICS_REFRESH_INTERVAL,
	useSlidesTemplateStatistics,
	useSlidesTemplateTotal,
} from "../useSlidesTemplateTotal"

const getSlidesTemplateCountMock = vi.hoisted(() => vi.fn())
const isPrivateDeploymentMock = vi.hoisted(() => vi.fn(() => false))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getSlidesTemplateCount: getSlidesTemplateCountMock,
	},
}))

vi.mock("@/utils/env", () => ({
	isPrivateDeployment: isPrivateDeploymentMock,
}))

describe("useSlidesTemplateTotal", () => {
	beforeEach(() => {
		getSlidesTemplateCountMock.mockReset()
		isPrivateDeploymentMock.mockReturnValue(false)
	})

	it("reads the shared total from the existing slides template count API", async () => {
		getSlidesTemplateCountMock.mockResolvedValue({
			total: 101582,
			total_usage_count: 7293,
			template_count_today_growth: 512,
		})
		const { result } = renderHook(() => useSlidesTemplateTotal(), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
			),
		})

		await waitFor(() => expect(result.current).toBe(101582))
		expect(getSlidesTemplateCountMock).toHaveBeenCalledWith({})
	})

	it("maps today's template growth from the shared statistics response", async () => {
		getSlidesTemplateCountMock.mockResolvedValue({
			total: 101582,
			template_count_today_growth: 512,
		})
		const { result } = renderHook(() => useSlidesTemplateStatistics(), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
			),
		})

		await waitFor(() => expect(result.current?.templateCountTodayGrowth).toBe(512))
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
		expect(result.current?.templateCountTodayGrowth).toBeUndefined()
	})

	it("does not request statistics while the consumer is not visible", async () => {
		const { result } = renderHook(() => useSlidesTemplateStatistics({ enabled: false }), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
			),
		})

		await new Promise((resolve) => setTimeout(resolve, 0))

		expect(result.current).toBeUndefined()
		expect(getSlidesTemplateCountMock).not.toHaveBeenCalled()
	})

	it("uses a five-second default refresh interval", () => {
		expect(SLIDES_TEMPLATE_STATISTICS_REFRESH_INTERVAL).toBe(5000)
	})

	it("requests once without polling in private deployments", async () => {
		isPrivateDeploymentMock.mockReturnValue(true)
		getSlidesTemplateCountMock.mockResolvedValue({ total: 101582 })

		renderHook(() => useSlidesTemplateStatistics({ refreshInterval: 20 }), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
					{children}
				</SWRConfig>
			),
		})

		await waitFor(() => expect(getSlidesTemplateCountMock).toHaveBeenCalledTimes(1))
		await new Promise((resolve) => setTimeout(resolve, 60))

		expect(getSlidesTemplateCountMock).toHaveBeenCalledTimes(1)
		isPrivateDeploymentMock.mockReturnValue(false)
	})

	it("refreshes visible statistics using the configured interval", async () => {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		getSlidesTemplateCountMock
			.mockResolvedValueOnce({ total: 101582, template_count_today_growth: 512 })
			.mockResolvedValue({ total: 101583, template_count_today_growth: 513 })

		const { result } = renderHook(() => useSlidesTemplateStatistics({ refreshInterval: 20 }), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
					{children}
				</SWRConfig>
			),
		})

		await waitFor(() => expect(getSlidesTemplateCountMock.mock.calls.length).toBeGreaterThan(1))
		await waitFor(() => expect(result.current?.templateCountTodayGrowth).toBe(513))
	})

	it("keeps the latest successful value when a refresh fails", async () => {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		getSlidesTemplateCountMock
			.mockResolvedValueOnce({ total: 101582, total_usage_count: 7293 })
			.mockRejectedValue(new Error("temporary unavailable"))

		const { result } = renderHook(() => useSlidesTemplateStatistics({ refreshInterval: 20 }), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
					{children}
				</SWRConfig>
			),
		})

		await waitFor(() => expect(result.current?.templateTotalUsageCount).toBe(7293))
		await waitFor(() => expect(getSlidesTemplateCountMock.mock.calls.length).toBeGreaterThan(1))

		expect(result.current).toEqual({
			templateTotal: 101582,
			templateTotalUsageCount: 7293,
			templateCountTodayGrowth: undefined,
		})
	})

	it("shares one polling timer across visible consumers", async () => {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		getSlidesTemplateCountMock.mockResolvedValue({ total: 101582 })

		renderHook(
			() => {
				const first = useSlidesTemplateStatistics({ refreshInterval: 100 })
				const second = useSlidesTemplateStatistics({ refreshInterval: 100 })
				return [first, second]
			},
			{
				wrapper: ({ children }) => (
					<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
						{children}
					</SWRConfig>
				),
			},
		)

		await waitFor(() => expect(getSlidesTemplateCountMock).toHaveBeenCalledTimes(1))
		await new Promise((resolve) => setTimeout(resolve, 120))

		expect(getSlidesTemplateCountMock).toHaveBeenCalledTimes(2)
	})

	it("pauses polling while the page is hidden", async () => {
		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "hidden",
			writable: true,
		})
		getSlidesTemplateCountMock.mockResolvedValue({ total: 101582 })

		renderHook(() => useSlidesTemplateStatistics({ refreshInterval: 20 }), {
			wrapper: ({ children }) => (
				<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
					{children}
				</SWRConfig>
			),
		})

		await waitFor(() => expect(getSlidesTemplateCountMock).toHaveBeenCalledTimes(1))
		await new Promise((resolve) => setTimeout(resolve, 50))
		expect(getSlidesTemplateCountMock).toHaveBeenCalledTimes(1)

		Object.defineProperty(document, "visibilityState", {
			configurable: true,
			value: "visible",
		})
		await waitFor(() => expect(getSlidesTemplateCountMock.mock.calls.length).toBeGreaterThan(1))
	})
})
