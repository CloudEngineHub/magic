import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../Canvas"
import { CanvasRuntimeScheduler } from "../CanvasRuntimeScheduler"
import { EventEmitter } from "../EventEmitter"

function createCanvasStub() {
	const createDrawTarget = () => ({ draw: vi.fn(), batchDraw: vi.fn() })
	const stage = createDrawTarget()
	const contentLayer = createDrawTarget()
	const selectionLayer = createDrawTarget()
	const controlsLayer = createDrawTarget()
	const markersLayer = createDrawTarget()
	const overlayLayer = createDrawTarget()
	const eventEmitter = new EventEmitter()

	return {
		canvas: {
			eventEmitter,
			stage,
			contentLayer,
			selectionLayer,
			controlsLayer,
			markersLayer,
			overlayLayer,
		} as unknown as Canvas,
		eventEmitter,
		stage,
		contentLayer,
		selectionLayer,
		controlsLayer,
		markersLayer,
		overlayLayer,
	}
}

describe("CanvasRuntimeScheduler", () => {
	it("coalesces multiple draw requests for the same layer into one draw", () => {
		const { canvas, contentLayer } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })

		scheduler.requestLayerDraw("content", {
			source: "test",
			reason: "first",
		})
		scheduler.requestLayerDraw("content", {
			source: "test",
			reason: "second",
		})
		scheduler.flushDraws()

		expect(contentLayer.draw).toHaveBeenCalledTimes(1)
		expect(contentLayer.batchDraw).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				drawRequestCount: 2,
				drawnCount: 1,
				coalescedDrawRequestCount: 1,
			}),
		)
		expect(scheduler.getSnapshot().layers.content.lastReasons).toEqual([
			"test:first",
			"test:second",
		])
	})

	it("uses a stage draw to cover pending layer draws in the same frame", () => {
		const { canvas, stage, contentLayer, controlsLayer } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })

		scheduler.requestLayerDraw("content", {
			source: "test",
			reason: "content",
		})
		scheduler.requestLayerDraw("controls", {
			source: "test",
			reason: "controls",
		})
		scheduler.requestLayerDraw("stage", {
			source: "test",
			reason: "stage",
		})
		scheduler.flushDraws()

		expect(stage.draw).toHaveBeenCalledTimes(1)
		expect(stage.batchDraw).not.toHaveBeenCalled()
		expect(contentLayer.draw).not.toHaveBeenCalled()
		expect(controlsLayer.draw).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				drawRequestCount: 3,
				drawnCount: 1,
				skippedByStageDrawCount: 2,
			}),
		)
		expect(scheduler.getSnapshot().lastFlushSkippedLayers).toEqual(["content", "controls"])
	})

	it("drops pending draw requests when destroyed", () => {
		const { canvas, contentLayer } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })

		scheduler.requestLayerDraw("content", {
			source: "test",
			reason: "pending",
		})
		scheduler.destroy()
		scheduler.flushDraws()

		expect(contentLayer.draw).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				destroyed: true,
				pendingDrawCount: 0,
				drawnCount: 0,
			}),
		)
	})

	it("dispatches viewport layouts only for active elements at the 10k element target", () => {
		const { canvas, eventEmitter } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })
		const callback = vi.fn()

		for (let index = 0; index < 10_000; index += 1) {
			scheduler.registerViewportScaleLayout(`element-${index}`, callback)
		}
		scheduler.replaceActiveViewportScaleLayoutElementIds(new Set(["element-7", "element-9999"]))

		eventEmitter.emit({ type: "viewport:scale", data: { scale: 2 } })

		expect(eventEmitter.listenerCount("viewport:scale")).toBe(1)
		expect(callback).toHaveBeenCalledTimes(2)
		expect(scheduler.getSnapshot().viewportScaleLayouts).toMatchObject({
			registeredElementCount: 10_000,
			registeredCallbackCount: 10_000,
			activeElementCount: 2,
			dispatchCount: 1,
			lastVisitedElementCount: 2,
			lastCallbackCount: 2,
		})
	})

	it("synchronizes a layout once when its element enters the active viewport set", () => {
		const { canvas } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })
		const first = vi.fn()
		const second = vi.fn()
		scheduler.registerViewportScaleLayout("first", first)
		scheduler.registerViewportScaleLayout("second", second)
		scheduler.replaceActiveViewportScaleLayoutElementIds(new Set(["first"]))

		scheduler.replaceActiveViewportScaleLayoutElementIds(new Set(["second"]))

		expect(first).not.toHaveBeenCalled()
		expect(second).toHaveBeenCalledTimes(1)
		expect(scheduler.getSnapshot().viewportScaleLayouts.activationCallbackCount).toBe(1)
		expect(scheduler.getSnapshot().drawReasonCounts).toEqual({
			"CanvasRuntimeScheduler:viewport-layout-activate": 1,
		})
	})

	it("removes the last callback from the active set when an element unregisters", () => {
		const { canvas, eventEmitter } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })
		const callback = vi.fn()
		const unregister = scheduler.registerViewportScaleLayout("element-1", callback)
		scheduler.replaceActiveViewportScaleLayoutElementIds(new Set(["element-1"]))

		unregister()
		eventEmitter.emit({ type: "viewport:scale", data: { scale: 2 } })

		expect(callback).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot().viewportScaleLayouts).toMatchObject({
			registeredElementCount: 0,
			registeredCallbackCount: 0,
			activeElementCount: 0,
			lastVisitedElementCount: 0,
			lastCallbackCount: 0,
		})
	})

	it("keeps a newly registered layout active until visibility publishes its next set", () => {
		const { canvas, eventEmitter } = createCanvasStub()
		const scheduler = new CanvasRuntimeScheduler({ canvas })
		const existing = vi.fn()
		const addedLater = vi.fn()
		scheduler.registerViewportScaleLayout("existing", existing)
		scheduler.replaceActiveViewportScaleLayoutElementIds(new Set(["existing"]))

		scheduler.registerViewportScaleLayout("added-later", addedLater)
		eventEmitter.emit({ type: "viewport:scale", data: { scale: 2 } })

		expect(existing).toHaveBeenCalledTimes(1)
		expect(addedLater).toHaveBeenCalledTimes(1)
		expect(scheduler.getSnapshot().viewportScaleLayouts.activeElementCount).toBe(2)
	})
})
