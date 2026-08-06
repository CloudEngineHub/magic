import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
	normalizeMicroAppProjectError,
	useMicroAppProjectResolver,
} from "../useMicroAppProjectResolver"

const mocks = vi.hoisted(() => ({
	getMicroAppProject: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMicroAppProject: mocks.getMicroAppProject,
	},
}))

describe("useMicroAppProjectResolver", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("does not expose ArrayBuffer stringification as the error message", async () => {
		mocks.getMicroAppProject.mockRejectedValue(new ArrayBuffer(8))

		const { result } = renderHook(() => useMicroAppProjectResolver("app-1"))

		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(result.current.projectId).toBe("")
		expect(result.current.error).toBeInstanceOf(Error)
		expect(result.current.error?.message).toBe("")
	})

	it("returns published state from the micro app detail", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			publish: {
				share_type: 4,
				publish_status: "published",
			},
		})

		const { result } = renderHook(() => useMicroAppProjectResolver("app-1"))

		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(result.current.projectId).toBe("project-1")
		expect(result.current.isPublished).toBe(true)
	})

	it("keeps an unpublished app unpublished when stable resource fields exist", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			publish: {
				share_type: 0,
				publish_status: "unpublished",
				resource_id: "resource-1",
				access_url: "https://example.com/micro-app/app-1",
			},
		})

		const { result } = renderHook(() => useMicroAppProjectResolver("app-1"))

		await waitFor(() => expect(result.current.loading).toBe(false))

		expect(result.current.projectId).toBe("project-1")
		expect(result.current.isPublished).toBe(false)
	})

	it("preserves a readable backend error message", () => {
		expect(normalizeMicroAppProjectError({ message: "Micro app was deleted" }).message).toBe(
			"Micro app was deleted",
		)
	})

	it("filters technical object stringification", () => {
		expect(normalizeMicroAppProjectError(new Error("[object ArrayBuffer]")).message).toBe("")
	})
})
