import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CanvasProvider, useCanvas } from "../../../providers/CanvasProvider"
import { useCanvasEventListeners } from "../useCanvasEventListeners"
import { EventEmitter } from "../../../../runtime/core/EventEmitter"
import type { Canvas } from "../../../../runtime/core/Canvas"
import type { CanvasConnection } from "../../../../runtime/document/types"
import type { CanvasDesignDataPatch } from "../../../../public/props"

const connection: CanvasConnection = {
	id: "connection-1",
	sourceElementId: "source",
	targetElementId: "target",
}

function createCanvasStub() {
	const eventEmitter = new EventEmitter()
	const connectionManager = {
		exportDocumentPatch: vi.fn(
			(options: {
				changedConnectionIds?: string[]
				deletedConnectionIds?: string[]
			}): Pick<
				CanvasDesignDataPatch,
				"connectionUpserts" | "deletedConnectionIds" | "changedConnectionIds"
			> => ({
				connectionUpserts: [connection],
				deletedConnectionIds: options.deletedConnectionIds ?? [],
				changedConnectionIds: options.changedConnectionIds ?? [],
			}),
		),
	}
	const elementManager = {
		exportDocumentPatch: vi.fn(),
	}
	const canvas = {
		eventEmitter,
		connectionManager,
		elementManager,
		exportDocument: vi.fn(() => ({
			elements: [],
			connections: [connection],
		})),
	} as unknown as Canvas

	return { canvas, connectionManager, elementManager, eventEmitter }
}

function TestListener({
	canvas,
	onPatch,
}: {
	canvas: Canvas
	onPatch: (patch: CanvasDesignDataPatch) => void
}) {
	const { setCanvas } = useCanvas()

	useEffect(() => {
		setCanvas(canvas)
		return () => setCanvas(null)
	}, [canvas, setCanvas])

	useCanvasEventListeners({
		onCanvasDesignDataPatchChange: onPatch,
	})

	return null
}

describe("useCanvasEventListeners connection changes", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("exports a connection patch when connection:change is emitted", async () => {
		const { canvas, connectionManager, eventEmitter } = createCanvasStub()
		const onPatch = vi.fn()

		render(
			<CanvasProvider>
				<TestListener canvas={canvas} onPatch={onPatch} />
			</CanvasProvider>,
		)

		await waitFor(() => {
			expect(eventEmitter.listenerCount("connection:change")).toBe(1)
		})

		vi.useFakeTimers()
		act(() => {
			eventEmitter.emit({
				type: "connection:change",
				data: {
					connections: [connection],
					changedConnectionIds: [connection.id],
				},
			})
			vi.advanceTimersByTime(121)
		})

		expect(connectionManager.exportDocumentPatch).toHaveBeenCalledWith({
			changedConnectionIds: [connection.id],
			deletedConnectionIds: undefined,
		})
		expect(onPatch).toHaveBeenCalledWith(
			{
				upserts: [],
				deletedElementIds: [],
				changedElementIds: [],
				connectionUpserts: [connection],
				deletedConnectionIds: [],
				changedConnectionIds: [connection.id],
			},
			expect.objectContaining({
				source: "connection:change",
				changedConnectionIds: [connection.id],
			}),
		)
	})
})
