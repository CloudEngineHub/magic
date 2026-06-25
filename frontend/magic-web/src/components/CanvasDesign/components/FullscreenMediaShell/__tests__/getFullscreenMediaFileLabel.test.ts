import { describe, expect, it } from "vitest"
import { getFullscreenMediaFileLabel } from "../getFullscreenMediaFileLabel"

describe("getFullscreenMediaFileLabel", () => {
	it("keeps file names with multiple dots and strips query/hash", () => {
		expect(getFullscreenMediaFileLabel("/assets/video.final.v2.mp4?token=abc#preview")).toBe(
			"video.final.v2.mp4",
		)
	})

	it("normalizes an explicit file name that is accidentally passed as a path", () => {
		expect(getFullscreenMediaFileLabel("/assets/fallback.mp4", "/uploads/clip.final.mov")).toBe(
			"clip.final.mov",
		)
	})

	it("falls back to path when the explicit file name is blank", () => {
		expect(getFullscreenMediaFileLabel("/assets/fallback.mp4", "   ")).toBe("fallback.mp4")
	})

	it("supports windows separators and encoded file name characters", () => {
		expect(getFullscreenMediaFileLabel(String.raw`C:\media\hello%20world.png`)).toBe(
			"hello world.png",
		)
	})
})
