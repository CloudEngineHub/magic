import { afterEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../types"
import { BaseLabelManager, type BaseLabelManagerConfig } from "../BaseLabelManager"

class TestLabelManager extends BaseLabelManager {
	constructor(options: BaseLabelManagerConfig) {
		super(options)
	}

	protected getLabelText(elementId: string): string {
		return elementId
	}

	protected calculateLabelPosition(): { x: number; y: number } {
		return { x: 0, y: 0 }
	}
}

function createEventEmitter() {
	const handlers = new Map<string, Array<(event: { data?: unknown }) => void>>()
	return {
		emit(type: string, event: { data?: unknown } = {}) {
			handlers.get(type)?.forEach((handler) => handler(event))
		},
		off: vi.fn((type: string) => {
			handlers.delete(type)
		}),
		on: vi.fn((type: string, handler: (event: { data?: unknown }) => void) => {
			const list = handlers.get(type) ?? []
			list.push(handler)
			handlers.set(type, list)
			return () => {
				const nextList = handlers.get(type)?.filter((item) => item !== handler)
				if (!nextList?.length) {
					handlers.delete(type)
					return
				}
				handlers.set(type, nextList)
			}
		}),
	}
}

describe("BaseLabelManager candidate cache", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("shares label candidate ids across managers and reuses them on viewport scale", () => {
		const requestAnimationFrameSpy = vi
			.spyOn(globalThis, "requestAnimationFrame")
			.mockImplementation((callback: FrameRequestCallback) => {
				callback(performance.now())
				return 1
			})
		const eventEmitter = createEventEmitter()
		const elements = new Map([
			[
				"frame-1",
				{
					getData: () => ({ id: "frame-1", type: ElementTypeEnum.Frame }),
				},
			],
			[
				"text-1",
				{
					getData: () => ({ id: "text-1", type: ElementTypeEnum.Text }),
				},
			],
		])
		const getAllElementIds = vi.fn(() => Array.from(elements.keys()))
		const queryElementIdsByExpandedRect = vi.fn(() => [])
		const canvas = {
			cropManager: { getCroppingElementId: () => null },
			elementManager: {
				getAllElementIds,
				getElementInstance: (elementId: string) => elements.get(elementId),
			},
			eraserManager: { getErasingElementId: () => null },
			eventEmitter,
			extendManager: { getExtendingElementId: () => null },
			geometryCacheManager: { queryElementIdsByExpandedRect },
			hoverManager: { getHoveredElementId: () => null },
			overlayLayer: { add: vi.fn(), destroy: vi.fn() },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			selectionManager: { isSelected: () => false },
			stage: {
				getAbsoluteTransform: () => ({
					copy: () => ({
						invert: () => ({
							point: (point: { x: number; y: number }) => point,
						}),
					}),
				}),
				height: () => 600,
				scaleX: () => 1,
				width: () => 800,
			},
			viewportController: {
				getResolvedDefaultViewportPadding: () => ({
					bottom: 0,
					left: 0,
					right: 0,
					top: 0,
				}),
			},
		} as never
		const firstManager = new TestLabelManager({
			canvas,
			labelConfig: {
				fontFamily: "Arial",
				fontSize: 12,
				offsetLeft: 0,
				offsetTop: 0,
				textColor: "#000",
			},
			visibilityConfig: {
				alwaysVisibleTypes: new Set([ElementTypeEnum.Frame]),
				elementTypes: new Set([ElementTypeEnum.Frame]),
				hoverOrSelectTypes: new Set(),
			},
		})
		const secondManager = new TestLabelManager({
			canvas,
			labelConfig: {
				fontFamily: "Arial",
				fontSize: 12,
				offsetLeft: 0,
				offsetTop: 0,
				textColor: "#000",
			},
			visibilityConfig: {
				alwaysVisibleTypes: new Set([ElementTypeEnum.Frame]),
				elementTypes: new Set([ElementTypeEnum.Frame]),
				hoverOrSelectTypes: new Set(),
			},
		})

		firstManager.initializeAllLabels()
		secondManager.initializeAllLabels()
		eventEmitter.emit("viewport:scale")

		expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2)
		expect(getAllElementIds).toHaveBeenCalledTimes(1)
		expect(queryElementIdsByExpandedRect).toHaveBeenLastCalledWith(
			expect.any(Object),
			expect.any(Number),
			{ elementIds: ["frame-1"] },
		)

		firstManager.destroy()
		secondManager.destroy()
	})

	it("keeps sibling manager listeners after one manager is destroyed", () => {
		const requestAnimationFrameSpy = vi
			.spyOn(globalThis, "requestAnimationFrame")
			.mockImplementation((callback: FrameRequestCallback) => {
				callback(performance.now())
				return 1
			})
		const eventEmitter = createEventEmitter()
		const elements = new Map([
			[
				"frame-1",
				{
					getData: () => ({ id: "frame-1", type: ElementTypeEnum.Frame }),
				},
			],
		])
		const canvas = {
			cropManager: { getCroppingElementId: () => null },
			elementManager: {
				getAllElementIds: () => Array.from(elements.keys()),
				getElementData: (elementId: string) => elements.get(elementId)?.getData(),
				getElementInstance: (elementId: string) => elements.get(elementId),
			},
			eraserManager: { getErasingElementId: () => null },
			eventEmitter,
			extendManager: { getExtendingElementId: () => null },
			geometryCacheManager: { queryElementIdsByExpandedRect: vi.fn(() => []) },
			hoverManager: { getHoveredElementId: () => null },
			overlayLayer: { add: vi.fn(), destroy: vi.fn() },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			selectionManager: { isSelected: () => false },
			stage: {
				getAbsoluteTransform: () => ({
					copy: () => ({
						invert: () => ({
							point: (point: { x: number; y: number }) => point,
						}),
					}),
				}),
				height: () => 600,
				scaleX: () => 1,
				width: () => 800,
			},
			viewportController: {
				getResolvedDefaultViewportPadding: () => ({
					bottom: 0,
					left: 0,
					right: 0,
					top: 0,
				}),
			},
		} as never
		const labelConfig = {
			fontFamily: "Arial",
			fontSize: 12,
			offsetLeft: 0,
			offsetTop: 0,
			textColor: "#000",
		}
		const visibilityConfig = {
			alwaysVisibleTypes: new Set([ElementTypeEnum.Frame]),
			elementTypes: new Set([ElementTypeEnum.Frame]),
			hoverOrSelectTypes: new Set(),
		}
		const firstManager = new TestLabelManager({
			canvas,
			labelConfig,
			visibilityConfig,
		})
		const secondManager = new TestLabelManager({
			canvas,
			labelConfig,
			visibilityConfig,
		})

		firstManager.destroy()
		eventEmitter.emit("viewport:scale")

		expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)

		secondManager.destroy()
	})
})
