import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../Canvas"
import { CanvasRuntimeScheduler } from "../CanvasRuntimeScheduler"

function createCanvasStub() {
	const stage = { batchDraw: vi.fn() }
	const contentLayer = { batchDraw: vi.fn() }
	const selectionLayer = { batchDraw: vi.fn() }
	const controlsLayer = { batchDraw: vi.fn() }
	const markersLayer = { batchDraw: vi.fn() }
	const overlayLayer = { batchDraw: vi.fn() }

	return {
		canvas: {
			stage,
			contentLayer,
			selectionLayer,
			controlsLayer,
			markersLayer,
			overlayLayer,
		} as unknown as Canvas,
		stage,
		contentLayer,
		selectionLayer,
		controlsLayer,
		markersLayer,
		overlayLayer,
	}
}

describe("CanvasRuntimeScheduler", () => {
	it("coalesces multiple draw requests for the same layer into one batchDraw", () => {
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

		expect(contentLayer.batchDraw).toHaveBeenCalledTimes(1)
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

		expect(stage.batchDraw).toHaveBeenCalledTimes(1)
		expect(contentLayer.batchDraw).not.toHaveBeenCalled()
		expect(controlsLayer.batchDraw).not.toHaveBeenCalled()
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

		expect(contentLayer.batchDraw).not.toHaveBeenCalled()
		expect(scheduler.getSnapshot()).toEqual(
			expect.objectContaining({
				destroyed: true,
				pendingDrawCount: 0,
				drawnCount: 0,
			}),
		)
	})
})
