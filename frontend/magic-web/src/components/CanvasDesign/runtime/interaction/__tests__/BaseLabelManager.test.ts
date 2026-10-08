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

	protected override reorderAllLabels(skipBatchDraw = false): void {
		this.reorderCount += 1
		super.reorderAllLabels(skipBatchDraw)
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

function createViewportSnapshot(generation: number, labelElementIds: string[]) {
	return {
		generation,
		geometryRevision: 0,
		labelElementIds,
		nearElementIds: new Set<string>(),
		nearRect: { x: -1600, y: -1600, width: 4000, height: 3800 },
		viewportRect: { x: 0, y: 0, width: 800, height: 600 },
		viewportScale: 1,
		visibleElementIds: new Set<string>(),
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

	it("updates existing labels on viewport scale without querying candidates", () => {
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
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "frame-1", type: ElementTypeEnum.Frame }),
					getNode: () => ({}),
				},
			],
			[
				"image-1",
				{
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image }),
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
		const getSnapshot = vi.fn(() => createViewportSnapshot(1, ["frame-1"]))
		const canvas = {
			cropManager: { getCroppingElementId: () => null },
			elementManager: {
				getAllElementIds,
				getElementInstance: (elementId: string) => elements.get(elementId),
			},
			eraserManager: { getErasingElementId: () => null },
			eventEmitter,
			extendManager: { getExtendingElementId: () => null },
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
			viewportQueryCoordinator: { getSnapshot },
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
				elementTypes: new Set([ElementTypeEnum.Frame, ElementTypeEnum.Image]),
				hoverOrSelectTypes: new Set([ElementTypeEnum.Image]),
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
				elementTypes: new Set([ElementTypeEnum.Frame, ElementTypeEnum.Image]),
				hoverOrSelectTypes: new Set([ElementTypeEnum.Image]),
			},
		})

		firstManager.initializeAllLabels()
		secondManager.initializeAllLabels()
		eventEmitter.emit("viewport:scale")

		expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2)
		expect(getAllElementIds).toHaveBeenCalledTimes(1)
		expect(getSnapshot).toHaveBeenCalledTimes(2)
		expect(firstManager.hasLabel("image-1")).toBe(false)
		expect(firstManager.hasLabel("frame-1")).toBe(true)

		firstManager.destroy()
		secondManager.destroy()
	})

	it("refreshes existing label scale even when the shared snapshot misses it", () => {
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
		let snapshotGeneration = 1
		let labelElementIds = ["frame-1"]
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
		const getSnapshot = vi.fn(() => createViewportSnapshot(snapshotGeneration, labelElementIds))
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
			hoverManager: { getHoveredElementId: () => null },
			overlayLayer: { add: vi.fn(), destroy: vi.fn() },
			runtimeScheduler: { requestLayerDraw },
			selectionManager: { isSelected: () => false },
			stage: {
				getAbsoluteTransform: () => ({
					copy: () => ({
						invert: () => ({
							point: (point: { x: number; y: number }) => ({
								x: point.x / stageScale,
								y: point.y / stageScale,
							}),
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
			viewportQueryCoordinator: { getSnapshot },
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
		snapshotGeneration = 2
		labelElementIds = []
		eventEmitter.emit("viewport:scale")
		flushRaf()
		expect(manager.getLabelScaleX("frame-1")).toBe(2)
		expect(getSnapshot).toHaveBeenCalledTimes(1)

		labelElementIds = ["frame-1"]
		requestLayerDraw.mockClear()
		eventEmitter.emit("viewport:pan")
		expect(rafCallbacks).toHaveLength(0)

		stageScale = 0.4
		snapshotGeneration = 3
		eventEmitter.emit("viewport:scale")
		eventEmitter.emit("viewport:changed", { data: { phase: "end" } })
		expect(rafCallbacks).toHaveLength(1)
		flushRaf()

		expect(manager.getLabelScaleX("frame-1")).toBe(2.5)
		expect(getSnapshot).toHaveBeenCalledTimes(2)
		expect(manager.getReorderCount()).toBe(initialReorderCount)
		expect(requestLayerDraw).toHaveBeenCalledWith("overlay", {
			priority: "input",
			reason: "visible-labels:viewport-end",
			source: "TestLabelManager",
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
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "frame-1", type: ElementTypeEnum.Frame }),
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
			viewportQueryCoordinator: {
				getSnapshot: () => createViewportSnapshot(1, ["frame-1"]),
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
			hoverOrSelectTypes: new Set<string>(),
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
		let zIndex = 1
		const selectedIds = new Set<string>()
		const elements = new Map([
			[
				"image-1",
				{
					getBoundingRect: () => ({ x: 0, y: 0, width: 100, height: 100 }),
					getData: () => ({ id: "image-1", type: ElementTypeEnum.Image, zIndex }),
					getNode: () => ({}),
				},
			],
		])
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
			hoverManager: { getHoveredElementId: () => hoveredElementId },
			overlayLayer: { add: vi.fn(), destroy: vi.fn() },
			runtimeScheduler: { requestLayerDraw },
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
			viewportQueryCoordinator: {
				getSnapshot: () => createViewportSnapshot(stageScale === 1 ? 1 : 2, []),
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
		eventEmitter.emit("element:updated", {
			data: { elementId: "image-1", data: elements.get("image-1")?.getData() },
		})
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

		requestLayerDraw.mockClear()
		hoveredElementId = null
		eventEmitter.emit("element:hover", { data: { elementId: null } })
		expect(manager.hasLabel("image-1")).toBe(false)
		expect(requestLayerDraw).toHaveBeenCalledWith("overlay", {
			priority: "input",
			reason: "label-visibility",
			source: "TestLabelManager",
		})

		selectedIds.add("image-1")
		eventEmitter.emit("element:select", { data: { elementIds: ["image-1"] } })
		expect(manager.isLabelVisible("image-1")).toBe(true)
		const reorderCountAfterSelection = manager.getReorderCount()
		expect(reorderCountAfterSelection).toBe(reorderCountAfterLabelCreated + 1)

		requestLayerDraw.mockClear()
		eventEmitter.emit("element:select", { data: { elementIds: ["image-1"] } })
		expect(requestLayerDraw).not.toHaveBeenCalled()

		eventEmitter.emit("element:updated", {
			data: { elementId: "image-1", data: elements.get("image-1")?.getData() },
		})
		expect(manager.getReorderCount()).toBe(reorderCountAfterSelection)

		zIndex = 2
		eventEmitter.emit("element:updated", {
			data: { elementId: "image-1", data: elements.get("image-1")?.getData() },
		})
		expect(manager.getReorderCount()).toBe(reorderCountAfterSelection + 1)

		requestLayerDraw.mockClear()
		selectedIds.delete("image-1")
		eventEmitter.emit("element:deselect")
		expect(manager.hasLabel("image-1")).toBe(false)
		expect(requestLayerDraw).toHaveBeenCalledTimes(1)

		manager.destroy()
	})
})
