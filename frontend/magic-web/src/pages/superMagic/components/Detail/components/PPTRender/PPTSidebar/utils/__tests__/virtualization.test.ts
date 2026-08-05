import { describe, expect, it } from "vitest"
import { estimateDesktopSlideRowSize, prioritizeVirtualItems } from "../virtualization"

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

describe("prioritizeVirtualItems", () => {
	it("loads viewport rows before the surrounding overscan buffer", () => {
		const items = Array.from({ length: 9 }, (_, index) => ({ index: index + 6 }))

		expect(prioritizeVirtualItems(items, { startIndex: 10, endIndex: 11 })).toEqual([
			{ index: 10 },
			{ index: 11 },
			{ index: 9 },
			{ index: 12 },
			{ index: 8 },
			{ index: 13 },
			{ index: 7 },
			{ index: 14 },
			{ index: 6 },
		])
	})

	it("keeps the virtualizer order when no measured viewport is available", () => {
		const items = [{ index: 2 }, { index: 3 }]
		expect(prioritizeVirtualItems(items, null)).toBe(items)
	})
})
