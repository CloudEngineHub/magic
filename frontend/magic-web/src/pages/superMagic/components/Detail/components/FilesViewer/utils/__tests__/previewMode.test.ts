import { describe, expect, it } from "vitest"
import { resolvePreviewExitAction, shouldAutoEnterPreviewFullscreen } from "../previewMode"

describe("previewMode", () => {
	it("keeps split previews inline until the user explicitly enters fullscreen", () => {
		expect(shouldAutoEnterPreviewFullscreen("split")).toBe(false)
		expect(resolvePreviewExitAction("split")).toBe("restore")
	})

	it("dismisses fullscreen-only previews when the user exits", () => {
		expect(shouldAutoEnterPreviewFullscreen("fullscreen")).toBe(true)
		expect(resolvePreviewExitAction("fullscreen")).toBe("dismiss")
	})

	it("keeps switchable previews inside the widget conversation layout", () => {
		expect(shouldAutoEnterPreviewFullscreen("switchable")).toBe(false)
		expect(resolvePreviewExitAction("switchable")).toBe("restore")
	})
})
