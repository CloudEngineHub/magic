import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useApis } from "../index"

vi.mock("@admin/provider/AdminProvider", () => {
	const magicClient = {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
	}

	return {
		useAdmin: () => ({
			apiClients: { magicClient },
		}),
	}
})

describe("useApis", () => {
	it("keeps API references stable when the client does not change", () => {
		const { result, rerender } = renderHook(() => useApis())
		const firstApis = result.current

		rerender()

		expect(result.current).toBe(firstApis)
		expect(result.current.SlidesTemplateApi.tag).toBe(firstApis.SlidesTemplateApi.tag)
	})
})
