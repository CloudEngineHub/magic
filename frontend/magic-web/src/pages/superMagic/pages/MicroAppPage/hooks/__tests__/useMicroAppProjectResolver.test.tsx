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

	it("preserves a readable backend error message", () => {
		expect(normalizeMicroAppProjectError({ message: "Micro app was deleted" }).message).toBe(
			"Micro app was deleted",
		)
	})

	it("filters technical object stringification", () => {
		expect(normalizeMicroAppProjectError(new Error("[object ArrayBuffer]")).message).toBe("")
	})
})
