import { describe, expect, it } from "vitest"
import { estimateDesktopSlideRowSize } from "../virtualization"

describe("estimateDesktopSlideRowSize", () => {
	it("keeps the existing minimum at the default sidebar width", () => {
		expect(estimateDesktopSlideRowSize(200, { width: 1920, height: 1080 })).toBe(128)
	})

	it("scales the estimate with a wider sidebar", () => {
		expect(estimateDesktopSlideRowSize(400, { width: 1920, height: 1080 })).toBe(238)
	})

	it("uses the shared deck aspect ratio for portrait slides", () => {
		expect(estimateDesktopSlideRowSize(300, { width: 1080, height: 1920 })).toBe(512)
	})

	it("falls back safely for invalid measurements", () => {
		expect(estimateDesktopSlideRowSize(0, { width: 1920, height: 1080 })).toBe(128)
		expect(estimateDesktopSlideRowSize(300, { width: 0, height: 1080 })).toBe(128)
	})
})
