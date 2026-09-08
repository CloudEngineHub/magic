import { describe, expect, it } from "vitest"
import { getMoreStylesPopoverLayout, getMoreStylesViewport } from "../moreStylesPopoverPosition"

const panel = { width: 352, height: 480 }

function getOverlapArea(
	first: { left: number; top: number; width: number; height: number },
	second: { left: number; top: number; width: number; height: number },
) {
	const width = Math.max(
		0,
		Math.min(first.left + first.width, second.left + second.width) -
			Math.max(first.left, second.left),
	)
	const height = Math.max(
		0,
		Math.min(first.top + first.height, second.top + second.height) -
			Math.max(first.top, second.top),
	)
	return width * height
}

describe("getMoreStylesPopoverLayout", () => {
	it("places a small selection's panel to the right when there is room", () => {
		const trigger = { left: 200, top: 80, width: 88, height: 32 }
		const selection = { left: 120, top: 128, width: 160, height: 56 }
		const viewport = { left: 0, top: 0, width: 1000, height: 800 }

		const result = getMoreStylesPopoverLayout(trigger, selection, viewport, panel)

		expect(result.side).toBe("right")
		expect(result.left).toBeGreaterThanOrEqual(selection.left + selection.width)
		expect(getOverlapArea(result, selection)).toBe(0)
	})

	it("parks a lower-half selection's panel in the empty canvas above it", () => {
		const trigger = { left: 360, top: 232, width: 88, height: 32 }
		const selection = { left: 80, top: 280, width: 640, height: 400 }
		const viewport = { left: 0, top: 0, width: 800, height: 720 }

		const result = getMoreStylesPopoverLayout(trigger, selection, viewport, panel)

		expect(result.side).toBe("top")
		expect(result.top + result.height).toBeLessThanOrEqual(selection.top)
		expect(result.left + result.width).toBe(trigger.left + trigger.width)
		expect(getOverlapArea(result, selection)).toBe(0)
	})

	it("keeps a huge near-top selection's panel usable in the canvas", () => {
		const trigger = { left: 520, top: 100, width: 88, height: 32 }
		const selection = { left: 80, top: 140, width: 720, height: 560 }
		const viewport = { left: 0, top: 0, width: 1000, height: 800 }

		const result = getMoreStylesPopoverLayout(trigger, selection, viewport, panel)

		expect(result.side).not.toBe("top")
		expect(result.top).toBeGreaterThanOrEqual(trigger.top)
		expect(result.height).toBeGreaterThanOrEqual(160)
		expect(result.left).toBeGreaterThanOrEqual(viewport.left)
		expect(result.left + result.width).toBeLessThanOrEqual(viewport.left + viewport.width)
		expect(result.top + result.height).toBeLessThanOrEqual(viewport.top + viewport.height)
	})

	it("stays inside the given viewport instead of a random corner", () => {
		const trigger = { left: 400, top: 252, width: 88, height: 32 }
		const selection = { left: 200, top: 300, width: 500, height: 360 }
		const viewport = { left: 80, top: 60, width: 720, height: 640 }

		const result = getMoreStylesPopoverLayout(trigger, selection, viewport, panel)

		expect(result.left).toBeGreaterThanOrEqual(viewport.left)
		expect(result.top).toBeGreaterThanOrEqual(viewport.top)
		expect(result.left + result.width).toBeLessThanOrEqual(viewport.left + viewport.width)
		expect(result.top + result.height).toBeLessThanOrEqual(viewport.top + viewport.height)
	})

	it("uses the window instead of the canvas so the panel can leave the middle area", () => {
		Object.defineProperty(window, "innerWidth", { value: 1667, configurable: true })
		Object.defineProperty(window, "innerHeight", { value: 963, configurable: true })
		const canvas = { left: 480, top: 140, width: 800, height: 800 }

		const viewport = getMoreStylesViewport(canvas)

		expect(viewport).toEqual({ left: 0, top: 0, width: 1667, height: 963 })
	})

	it("keeps a Xiaohongshu card toolbar panel inside the window", () => {
		Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true })
		Object.defineProperty(window, "innerHeight", { value: 900, configurable: true })
		const trigger = { left: 868, top: 236, width: 88, height: 32 }
		const selection = { left: 460, top: 280, width: 400, height: 24 }
		const canvas = { left: 420, top: 120, width: 480, height: 640 }
		const viewport = getMoreStylesViewport(canvas)

		const result = getMoreStylesPopoverLayout(trigger, selection, viewport, panel)

		expect(result.width).toBeGreaterThanOrEqual(240)
		expect(result.height).toBeGreaterThanOrEqual(160)
		expect(result.left).toBeGreaterThanOrEqual(viewport.left)
		expect(result.top).toBeGreaterThanOrEqual(viewport.top)
		expect(result.left + result.width).toBeLessThanOrEqual(viewport.left + viewport.width)
		expect(result.top + result.height).toBeLessThanOrEqual(viewport.top + viewport.height)
	})

	it("opens to the right of a right-edge trigger and may exceed the canvas", () => {
		Object.defineProperty(window, "innerWidth", { value: 1667, configurable: true })
		Object.defineProperty(window, "innerHeight", { value: 963, configurable: true })
		const trigger = { left: 1180, top: 240, width: 88, height: 32 }
		const selection = { left: 980, top: 280, width: 280, height: 180 }
		const canvas = { left: 480, top: 140, width: 800, height: 800 }
		const viewport = getMoreStylesViewport(canvas)

		const result = getMoreStylesPopoverLayout(trigger, selection, viewport, panel)

		expect(result.side).toBe("right")
		expect(result.left).toBeGreaterThanOrEqual(trigger.left + trigger.width)
		expect(result.left + result.width).toBeGreaterThan(canvas.left + canvas.width)
		expect(result.left + result.width).toBeLessThanOrEqual(viewport.left + viewport.width)
	})
})
