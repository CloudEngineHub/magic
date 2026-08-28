import { afterEach, describe, expect, it, vi } from "vitest"
import { base64ToFile } from "../fileConverter"

describe("base64ToFile", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("decodes data URLs without using fetch", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch")

		const file = await base64ToFile("data:image/png;base64,AAE=", "screenshot.png")

		expect(fetchSpy).not.toHaveBeenCalled()
		expect(file.type).toBe("image/png")
		expect(file.name).toBe("screenshot.png")
		expect(file.size).toBe(2)
	})
})
