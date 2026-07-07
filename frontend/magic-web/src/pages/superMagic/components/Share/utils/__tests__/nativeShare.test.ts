import { afterEach, describe, expect, it, vi } from "vitest"
import { canUseNativeShare, shareToNativeTarget } from "../nativeShare"

describe("nativeShare", () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("reports unavailable when the browser has no native share API", () => {
		vi.stubGlobal("navigator", {})

		expect(canUseNativeShare()).toBe(false)
	})

	it("reports available when navigator.share is a function", () => {
		vi.stubGlobal("navigator", { share: vi.fn() })

		expect(canUseNativeShare()).toBe(true)
	})

	it("shares the provided payload through the native API", async () => {
		const share = vi.fn().mockResolvedValue(undefined)
		vi.stubGlobal("navigator", { share })

		const result = await shareToNativeTarget({
			title: "Fictional Share",
			text: "Fictional share text",
			url: "https://example.invalid/fake-share",
		})

		expect(result).toBe("shared")
		expect(share).toHaveBeenCalledWith({
			title: "Fictional Share",
			text: "Fictional share text",
			url: "https://example.invalid/fake-share",
		})
	})

	it("returns cancelled when the user closes the native share sheet", async () => {
		const abortError = new DOMException("Share dismissed", "AbortError")
		vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(abortError) })

		await expect(
			shareToNativeTarget({
				title: "Fictional Share",
				text: "Fictional share text",
				url: "https://example.invalid/fake-share",
			}),
		).resolves.toBe("cancelled")
	})

	it("returns failed for non-cancel share errors", async () => {
		vi.stubGlobal("navigator", {
			share: vi.fn().mockRejectedValue(new Error("fictional denied")),
		})

		await expect(
			shareToNativeTarget({
				title: "Fictional Share",
				text: "Fictional share text",
				url: "https://example.invalid/fake-share",
			}),
		).resolves.toBe("failed")
	})
})
