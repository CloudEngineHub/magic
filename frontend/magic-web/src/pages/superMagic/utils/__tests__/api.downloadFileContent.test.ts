import { afterEach, describe, expect, it, vi } from "vitest"
import { downloadFileContent } from "../api"

describe("downloadFileContent", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("should forward the abort signal to fetch", async () => {
		const controller = new AbortController()
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: vi.fn().mockResolvedValue("<html></html>"),
		})
		vi.stubGlobal("fetch", fetchMock)

		const result = await downloadFileContent("https://example.com/slide.html", {
			signal: controller.signal,
		})

		expect(result).toBe("<html></html>")
		expect(fetchMock).toHaveBeenCalledWith("https://example.com/slide.html", {
			method: "GET",
			signal: controller.signal,
		})
	})
})
