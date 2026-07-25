import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../document/types"
import { BaseLabelManager, type BaseLabelManagerConfig } from "../labels/BaseLabelManager"

class TestLabelManager extends BaseLabelManager {
	private reorderCount = 0

	constructor(options: BaseLabelManagerConfig) {
		super(options)
	}

	protected getLabelText(elementId: string): string {
		return elementId
	}

	protected calculateLabelPosition(): { x: number; y: number } {
		return { x: 0, y: 0 }
	}

	public getLabelScaleX(elementId: string): number | undefined {
		return this.labelMap.get(elementId)?.scaleX()
	}

	public hasLabel(elementId: string): boolean {
		return this.labelMap.has(elementId)
	}

	public isLabelVisible(elementId: string): boolean | undefined {
		return this.labelMap.get(elementId)?.visible()
	}

	public getReorderCount(): number {
		return this.reorderCount
	}

	protected override reorderAllLabels(): void {
		this.reorderCount += 1
		super.reorderAllLabels()
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
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
	})

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

	it("refreshes existing label scale even when viewport query misses it", () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const rafCallbacks: FrameRequestCallback[] = []
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
			(callback: FrameRequestCallback) => {
				rafCallbacks.push(callback)
				return rafCallbacks.length
			},
		)
		const flushRaf = () => {
			const callbacks = rafCallbacks.splice(0)
			callbacks.forEach((callback) => callback(performance.now()))
		}
		const eventEmitter = createEventEmitter()
		let stageScale = 1
		let visibleElementIds = ["frame-1"]
		const elements = new Map([
			[
				"frame-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "frame-1", type: ElementTypeEnum.Frame }),
					getNode: () => ({}),
				},
			],
		])
		const queryElementIdsByExpandedRect = vi.fn(() => visibleElementIds)
		const requestLayerDraw = vi.fn()
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
			geometryCacheManager: { queryElementIdsByExpandedRect },
			hoverManager: { getHoveredElementId: () => null },
			overlayLayer: { add: vi.fn(), destroy: vi.fn() },
			runtimeScheduler: { requestLayerDraw },
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
				scaleX: () => stageScale,
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
		const manager = new TestLabelManager({
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

		manager.initializeAllLabels()
		expect(manager.getLabelScaleX("frame-1")).toBe(1)
		const initialReorderCount = manager.getReorderCount()

		stageScale = 0.5
		visibleElementIds = []
		eventEmitter.emit("viewport:scale")
		flushRaf()
		expect(manager.getLabelScaleX("frame-1")).toBe(2)

		visibleElementIds = ["frame-1"]
		requestLayerDraw.mockClear()
		eventEmitter.emit("viewport:pan")
		flushRaf()

		expect(manager.getLabelScaleX("frame-1")).toBe(2)
		expect(manager.getReorderCount()).toBe(initialReorderCount)
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)
		expect(requestLayerDraw).toHaveBeenCalledWith("overlay", {
			source: "TestLabelManager",
			reason: "visible-labels:viewport-pan",
			priority: "input",
		})

		manager.destroy()
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

	it("creates a missing hover/select label after visible initialization skipped it", () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const rafCallbacks: FrameRequestCallback[] = []
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation(
			(callback: FrameRequestCallback) => {
				rafCallbacks.push(callback)
				return rafCallbacks.length
			},
		)
		const flushRaf = () => {
			const callbacks = rafCallbacks.splice(0)
			callbacks.forEach((callback) => callback(performance.now()))
		}
		const eventEmitter = createEventEmitter()
		let hoveredElementId: string | null = null
		let stageScale = 1
		const selectedIds = new Set<string>()
		const elements = new Map([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
					getNode: () => ({}),
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
			hoverManager: { getHoveredElementId: () => hoveredElementId },
			overlayLayer: { add: vi.fn(), destroy: vi.fn() },
			runtimeScheduler: { requestLayerDraw: vi.fn() },
			selectionManager: { isSelected: (elementId: string) => selectedIds.has(elementId) },
			stage: {
				getAbsoluteTransform: () => ({
					copy: () => ({
						invert: () => ({
							point: (point: { x: number; y: number }) => point,
						}),
					}),
				}),
				height: () => 600,
				scaleX: () => stageScale,
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
		const manager = new TestLabelManager({
			canvas,
			labelConfig: {
				fontFamily: "Arial",
				fontSize: 12,
				offsetLeft: 0,
				offsetTop: 0,
				textColor: "#000",
			},
			visibilityConfig: {
				alwaysVisibleTypes: new Set(),
				elementTypes: new Set([ElementTypeEnum.Image]),
				hoverOrSelectTypes: new Set([ElementTypeEnum.Image]),
			},
		})

		manager.initializeAllLabels()
		expect(manager.hasLabel("image-1")).toBe(false)

		hoveredElementId = "image-1"
		eventEmitter.emit("element:hover", { data: { elementId: "image-1" } })
		expect(manager.hasLabel("image-1")).toBe(true)
		expect(manager.isLabelVisible("image-1")).toBe(true)
		expect(manager.getLabelScaleX("image-1")).toBe(1)
		const reorderCountAfterLabelCreated = manager.getReorderCount()
		expect(reorderCountAfterLabelCreated).toBeGreaterThan(0)

		stageScale = 0.5
		eventEmitter.emit("viewport:scale")
		flushRaf()
		expect(manager.getLabelScaleX("image-1")).toBe(2)

		hoveredElementId = null
		eventEmitter.emit("element:hover", { data: { elementId: null } })
		expect(manager.isLabelVisible("image-1")).toBe(false)

		selectedIds.add("image-1")
		eventEmitter.emit("element:select", { data: { elementIds: ["image-1"] } })
		expect(manager.isLabelVisible("image-1")).toBe(true)
		expect(manager.getReorderCount()).toBe(reorderCountAfterLabelCreated)

		manager.destroy()
	})
})
