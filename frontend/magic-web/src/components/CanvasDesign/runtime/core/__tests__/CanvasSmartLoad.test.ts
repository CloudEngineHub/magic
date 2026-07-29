import { describe, expect, it, vi } from "vitest"
import { Canvas } from "../Canvas"
import { EventEmitter } from "../EventEmitter"
import type { CanvasConnection, CanvasDocument } from "../../document/types"

function createCanvasStub(options: {
	initialConnections?: CanvasConnection[]
	emitElementRestored?: boolean
}) {
	let currentConnections = options.initialConnections ?? []
	const eventEmitter = new EventEmitter()
	const restoredListener = vi.fn()
	eventEmitter.on("document:restored", restoredListener)

	const canvas = {
		eventEmitter,
		resourceUrlWarmupManager: {
			warmupDocument: vi.fn(),
			warmupCurrentDocument: vi.fn(),
		},
		elementManager: {
			loadDocumentSmart: vi.fn(() => {
				if (options.emitElementRestored) {
					eventEmitter.emit({ type: "document:restored", data: undefined })
				}
			}),
		},
		connectionManager: {
			exportConnections: vi.fn(() =>
				currentConnections.map((connection) => ({ ...connection })),
			),
			loadDocument: vi.fn((doc: CanvasDocument) => {
				currentConnections = (doc.connections ?? []).map((connection) => ({
					...connection,
				}))
			}),
		},
	} as unknown as Canvas

	return { canvas, restoredListener }
}

describe("Canvas.loadDocumentSmart", () => {
	it("emits document:restored when only connections change", () => {
		const { canvas, restoredListener } = createCanvasStub({
			initialConnections: [],
		})

		Canvas.prototype.loadDocumentSmart.call(canvas, {
			connections: [{ id: "edge", sourceElementId: "source", targetElementId: "target" }],
		})

		expect(restoredListener).toHaveBeenCalledTimes(1)
	})

	it("does not duplicate document:restored when elements already emitted it", () => {
		const { canvas, restoredListener } = createCanvasStub({
			initialConnections: [],
			emitElementRestored: true,
		})

		Canvas.prototype.loadDocumentSmart.call(canvas, {
			elements: [],
			connections: [{ id: "edge", sourceElementId: "source", targetElementId: "target" }],
		})

		expect(restoredListener).toHaveBeenCalledTimes(1)
	})

	it("does not emit document:restored when elements and connections are unchanged", () => {
		const connections = [{ id: "edge", sourceElementId: "source", targetElementId: "target" }]
		const { canvas, restoredListener } = createCanvasStub({
			initialConnections: connections,
		})

		Canvas.prototype.loadDocumentSmart.call(canvas, { connections })

		expect(restoredListener).not.toHaveBeenCalled()
	})
})
