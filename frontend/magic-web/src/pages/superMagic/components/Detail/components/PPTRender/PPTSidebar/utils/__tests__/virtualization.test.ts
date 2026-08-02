import { describe, expect, it } from "vitest"
import { estimateDesktopSlideRowSize } from "../virtualization"

describe("estimateDesktopSlideRowSize", () => {
	it("keeps the existing minimum at the default sidebar width", () => {
		expect(estimateDesktopSlideRowSize(200)).toBe(128)
	})

	it("scales the estimate with a wider sidebar", () => {
		expect(estimateDesktopSlideRowSize(400)).toBe(238)
	})

	it("uses the fixed 16:9 desktop thumbnail ratio", () => {
		expect(estimateDesktopSlideRowSize(300)).toBe(181)
	})

	it("falls back safely for an invalid sidebar width", () => {
		expect(estimateDesktopSlideRowSize(0)).toBe(128)
	})
})
