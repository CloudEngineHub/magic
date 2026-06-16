import { describe, expect, it, vi } from "vitest"
import type { Rect } from "../../utils/utils"
import { SnapGuideManager } from "../SnapGuideManager"

function createManagerWithBounds(getElementsBounds: ReturnType<typeof vi.fn>) {
	const manager = Object.create(SnapGuideManager.prototype) as SnapGuideManager & {
		activeAnchor: string | null
		currentDragBoundsOverride: Rect | null
		canvas: {
			eventEmitter?: {
				emit: ReturnType<typeof vi.fn>
			}
			geometryCacheManager: {
				getElementsBounds: typeof getElementsBounds
			}
		}
		emitSelectionPositionOverride: (boundingRect: Rect) => void
		getDraggingElementsRect: (elementIds: string[]) => Rect | null
		syncSnappedProxyDragBounds: (boundingRect: Rect) => void
	}

	manager.canvas = {
		geometryCacheManager: {
			getElementsBounds,
		},
	}

	return manager
}

describe("SnapGuideManager transient drag bounds", () => {
	it("uses the drag bounds override for translation snapping", () => {
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = null
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }

		expect(manager.getDraggingElementsRect(["element-1"])).toEqual({
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		})
		expect(getElementsBounds).not.toHaveBeenCalled()
	})

	it("keeps anchor scaling on the normal geometry path", () => {
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = "top-left"
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }

		expect(manager.getDraggingElementsRect(["element-1"])).toEqual({
			x: 0,
			y: 0,
			width: 10,
			height: 10,
		})
		expect(getElementsBounds).toHaveBeenCalledWith(["element-1"])
	})

	it("publishes snapped proxy drag bounds back to selection UI", () => {
		const emit = vi.fn()
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = null
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }
		manager.canvas.eventEmitter = { emit }

		manager.syncSnappedProxyDragBounds({ x: 24, y: 36, width: 100, height: 80 })

		expect(emit).toHaveBeenCalledWith({
			type: "selection:position",
			data: {
				boundingRect: { x: 24, y: 36, width: 100, height: 80 },
			},
		})
		expect(manager.currentDragBoundsOverride).toEqual({
			x: 24,
			y: 36,
			width: 100,
			height: 80,
		})
	})

	it("does not publish drag bounds while anchor scaling", () => {
		const emit = vi.fn()
		const getElementsBounds = vi.fn(() => ({ x: 0, y: 0, width: 10, height: 10 }))
		const manager = createManagerWithBounds(getElementsBounds)
		manager.activeAnchor = "top-left"
		manager.currentDragBoundsOverride = { x: 20, y: 30, width: 100, height: 80 }
		manager.canvas.eventEmitter = { emit }

		manager.syncSnappedProxyDragBounds({ x: 24, y: 36, width: 100, height: 80 })

		expect(emit).not.toHaveBeenCalled()
		expect(manager.currentDragBoundsOverride).toEqual({
			x: 20,
			y: 30,
			width: 100,
			height: 80,
		})
	})
})
