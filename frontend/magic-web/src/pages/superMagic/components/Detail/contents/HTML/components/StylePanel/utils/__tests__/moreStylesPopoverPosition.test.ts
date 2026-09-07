import { describe, expect, it } from "vitest"
import { getMoreStylesPopoverPlacement } from "../moreStylesPopoverPosition"

const panel = { width: 352, height: 480 }
const viewport = { left: 0, top: 0, width: 1000, height: 800 }

function getPanelRect(
	trigger: { left: number; top: number; width: number; height: number },
	side: "top" | "bottom" | "left" | "right",
	align: "start" | "end",
	size = panel,
	gap = 8,
) {
	const width = size.width
	const height = size.height
	if (side === "top" || side === "bottom") {
		const left = align === "end" ? trigger.left + trigger.width - width : trigger.left
		const top = side === "top" ? trigger.top - gap - height : trigger.top + trigger.height + gap
		return { left, top, width, height }
	}
	const left = side === "left" ? trigger.left - gap - width : trigger.left + trigger.width + gap
	const top = align === "end" ? trigger.top + trigger.height - height : trigger.top
	return { left, top, width, height }
}

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

describe("getMoreStylesPopoverPlacement", () => {
	it("opens above the trigger when the selection is below it", () => {
		const trigger = { left: 220, top: 360, width: 88, height: 32 }
		const selection = { left: 160, top: 420, width: 420, height: 240 }

		const result = getMoreStylesPopoverPlacement(trigger, selection, viewport, panel)

		expect(result.side).toBe("top")
		expect(getOverlapArea(getPanelRect(trigger, result.side, result.align), selection)).toBe(0)
	})

	it("stays beside the trigger instead of jumping to the canvas corner", () => {
		const trigger = { left: 200, top: 80, width: 88, height: 32 }
		const selection = { left: 120, top: 128, width: 160, height: 56 }

		const result = getMoreStylesPopoverPlacement(trigger, selection, viewport, panel)
		const rect = getPanelRect(trigger, result.side, result.align)

		expect(["left", "right", "top"]).toContain(result.side)
		expect(getOverlapArea(rect, selection)).toBe(0)
		expect(rect.left).toBeLessThan(trigger.left + trigger.width + 8 + panel.width)
		expect(rect.top).toBeLessThan(trigger.top + trigger.height + 8 + panel.height)
	})

	it("prefers a roomy side of the trigger when the top gap is too short", () => {
		const trigger = { left: 200, top: 40, width: 88, height: 32 }
		const selection = { left: 120, top: 88, width: 140, height: 48 }

		const result = getMoreStylesPopoverPlacement(trigger, selection, viewport, panel)

		expect(result.side).toBe("right")
		expect(getOverlapArea(getPanelRect(trigger, result.side, result.align), selection)).toBe(0)
	})
})
