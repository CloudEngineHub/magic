import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useTokenRefreshPolling } from "../useTokenRefreshPolling"

const mocks = vi.hoisted(() => ({
	getShareResource: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getShareResource: mocks.getShareResource,
	},
}))

describe("useTokenRefreshPolling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		window.temporary_token = "current-token"
	})

	it("ignores a token response from an inactive share scope", async () => {
		let resolveOldRequest: (value: { temporary_token: string }) => void = () => undefined
		const oldRequest = new Promise<{ temporary_token: string }>((resolve) => {
			resolveOldRequest = resolve
		})
		mocks.getShareResource.mockReturnValueOnce(oldRequest)

		const { rerender } = renderHook(
			({ resourceId, scopeKey }) =>
				useTokenRefreshPolling({
					resourceId,
					scopeKey,
					data: { temporary_token: "loaded-token" },
				}),
			{
				initialProps: {
					resourceId: "resource-app-1",
					scopeKey: "app-1",
				},
			},
		)

		act(() => window.dispatchEvent(new Event("focus")))
		await waitFor(() => {
			expect(mocks.getShareResource).toHaveBeenCalledWith({
				resource_id: "resource-app-1",
				password: undefined,
			})
		})

		rerender({ resourceId: "resource-app-2", scopeKey: "app-2" })
		await act(async () => {
			resolveOldRequest({ temporary_token: "stale-token" })
			await Promise.resolve()
		})

		expect(window.temporary_token).toBe("current-token")
	})

	it("writes a token returned for the active share scope", async () => {
		mocks.getShareResource.mockResolvedValue({ temporary_token: "refreshed-token" })

		renderHook(() =>
			useTokenRefreshPolling({
				resourceId: "resource-app-1",
				scopeKey: "app-1",
				data: { temporary_token: "loaded-token" },
			}),
		)

		act(() => window.dispatchEvent(new Event("focus")))

		await waitFor(() => {
			expect(window.temporary_token).toBe("refreshed-token")
		})
	})
})
