import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import type { Rect } from "../../../shared/ids"
import { ConnectionHitTestService } from "../ConnectionHitTestService"

function createCanvasStub(boundsById: Map<string, Rect>, scale = 1) {
	const getElementBounds = vi.fn((elementId: string) => boundsById.get(elementId) ?? null)
	const canvas = {
		geometryCacheManager: {
			getElementBounds,
		},
		stage: {
			scaleX: () => scale,
		},
	} as unknown as Canvas

	return { canvas, getElementBounds }
}

describe("ConnectionHitTestService", () => {
	it("finds intersecting connections and reuses cached geometry", () => {
		const boundsById = new Map<string, Rect>([
			["source", { x: 0, y: 0, width: 100, height: 40 }],
			["target", { x: 220, y: 0, width: 100, height: 40 }],
			["other", { x: 0, y: 300, width: 100, height: 40 }],
		])
		const { canvas, getElementBounds } = createCanvasStub(boundsById)
		const service = new ConnectionHitTestService({ canvas })
		const connections = [
			{ id: "inside", sourceElementId: "source", targetElementId: "target" },
			{ id: "outside", sourceElementId: "target", targetElementId: "other" },
		]

		expect(
			service.findConnectionsInBox(connections, { x: 145, y: 10, width: 40, height: 20 }),
		).toEqual(["inside"])
		expect(getElementBounds).toHaveBeenCalledTimes(4)

		getElementBounds.mockClear()
		expect(
			service.findConnectionsInBox(connections, { x: 145, y: 10, width: 40, height: 20 }),
		).toEqual(["inside"])
		expect(getElementBounds).not.toHaveBeenCalled()
	})

	it("invalidates cached geometry by endpoint element", () => {
		const boundsById = new Map<string, Rect>([
			["source", { x: 0, y: 0, width: 100, height: 40 }],
			["target", { x: 220, y: 80, width: 100, height: 40 }],
		])
		const { canvas } = createCanvasStub(boundsById)
		const service = new ConnectionHitTestService({ canvas })
		const connections = [{ id: "edge", sourceElementId: "source", targetElementId: "target" }]
		const box = { x: 145, y: 50, width: 40, height: 20 }

		expect(service.findConnectionsInBox(connections, box)).toEqual(["edge"])

		boundsById.set("target", { x: 220, y: 300, width: 100, height: 40 })
		service.invalidateElements(["target"])

		expect(service.findConnectionsInBox(connections, box)).toEqual([])
	})

	it("invalidates cached geometry by connection id when endpoints change", () => {
		const boundsById = new Map<string, Rect>([
			["source", { x: 0, y: 0, width: 100, height: 40 }],
			["target", { x: 220, y: 0, width: 100, height: 40 }],
			["other", { x: 0, y: 300, width: 100, height: 40 }],
		])
		const { canvas } = createCanvasStub(boundsById)
		const service = new ConnectionHitTestService({ canvas })
		const box = { x: 145, y: 10, width: 40, height: 20 }

		expect(
			service.findConnectionsInBox(
				[{ id: "edge", sourceElementId: "source", targetElementId: "target" }],
				box,
			),
		).toEqual(["edge"])

		service.invalidateConnections(["edge"])

		expect(
			service.findConnectionsInBox(
				[{ id: "edge", sourceElementId: "source", targetElementId: "other" }],
				box,
			),
		).toEqual([])
	})
})
