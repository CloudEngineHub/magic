import { describe, expect, it, vi } from "vitest"
import { Canvas } from "../Canvas"

function createCanvasHarness(options: { connectionGroupZIndex: number }) {
	const contentLayer = {
		add: vi.fn(),
	}
	const connectionGroup = {
		getParent: vi.fn(() => contentLayer),
		zIndex: vi.fn(() => options.connectionGroupZIndex),
		moveToBottom: vi.fn(),
	}
	const canvas = Object.create(Canvas.prototype) as Canvas
	Object.assign(canvas, {
		contentLayer,
		connectionGroup,
	})

	return { canvas, connectionGroup, contentLayer }
}

describe("Canvas.ensureConnectionGroup", () => {
	it("does not reorder a connection group that is already at the bottom", () => {
		const { canvas, connectionGroup, contentLayer } = createCanvasHarness({
			connectionGroupZIndex: 0,
		})

		expect(canvas.ensureConnectionGroup()).toBe(connectionGroup)
		expect(contentLayer.add).not.toHaveBeenCalled()
		expect(connectionGroup.moveToBottom).not.toHaveBeenCalled()
	})

	it("moves a displaced connection group back to the bottom", () => {
		const { canvas, connectionGroup } = createCanvasHarness({ connectionGroupZIndex: 2 })

		expect(canvas.ensureConnectionGroup()).toBe(connectionGroup)
		expect(connectionGroup.moveToBottom).toHaveBeenCalledTimes(1)
	})
})
