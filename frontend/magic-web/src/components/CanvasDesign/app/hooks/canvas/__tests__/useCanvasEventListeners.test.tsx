import { act, render, waitFor } from "@testing-library/react"
import { useEffect } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CanvasProvider, useCanvas } from "../../../providers/CanvasProvider"
import { useCanvasEventListeners } from "../useCanvasEventListeners"
import { EventEmitter } from "../../../../runtime/core/EventEmitter"
import type { Canvas } from "../../../../runtime/core/Canvas"
import type { CanvasConnection, CanvasDocument } from "../../../../runtime/document/types"
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
		getTemporaryElementMetadata: vi.fn((elementId: string) => {
			void elementId
			return null
		}),
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
	onChange,
}: {
	canvas: Canvas
	onPatch: (patch: CanvasDesignDataPatch) => void
	onChange?: (canvasData: CanvasDocument) => void
}) {
	const { setCanvas } = useCanvas()

	useEffect(() => {
		setCanvas(canvas)
		return () => setCanvas(null)
	}, [canvas, setCanvas])

	useCanvasEventListeners({
		onCanvasDesignDataPatchChange: onPatch,
		onCanvasDesignDataChange: onChange,
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

	it("does not forward runtime-only generation deletions to the host patch", async () => {
		const { canvas, elementManager, eventEmitter } = createCanvasStub()
		elementManager.exportDocumentPatch.mockReturnValue({
			upserts: [],
			deletedElementIds: [],
			changedElementIds: ["persisted-image"],
		})
		const onPatch = vi.fn()

		render(
			<CanvasProvider>
				<TestListener canvas={canvas} onPatch={onPatch} />
			</CanvasProvider>,
		)

		await waitFor(() => {
			expect(eventEmitter.listenerCount("element:deleted")).toBe(1)
		})

		vi.useFakeTimers()
		act(() => {
			eventEmitter.emit({
				type: "element:deleted",
				data: { elementId: "runtime-result", persistence: "runtime-only" },
			})
			eventEmitter.emit({
				type: "element:change",
				data: { elementIds: ["persisted-image"], phase: "commit" },
			})
			vi.advanceTimersByTime(121)
		})

		expect(elementManager.exportDocumentPatch).toHaveBeenCalledWith({
			changedElementIds: ["persisted-image"],
			deletedElementIds: [],
			elementNameChanges: undefined,
			includeTemporary: false,
		})
		expect(onPatch).toHaveBeenCalledWith(
			expect.objectContaining({ deletedElementIds: [] }),
			expect.anything(),
		)
	})

	it("does not schedule a host patch for generation-only element changes", async () => {
		const { canvas, elementManager, eventEmitter } = createCanvasStub()
		elementManager.getTemporaryElementMetadata.mockImplementation((elementId: string) =>
			elementId === "runtime-result"
				? {
						kind: "generation-result",
						historyPolicy: "exclude",
						clipboardPolicy: "exclude",
					}
				: null,
		)
		const onPatch = vi.fn()

		render(
			<CanvasProvider>
				<TestListener canvas={canvas} onPatch={onPatch} />
			</CanvasProvider>,
		)

		await waitFor(() => {
			expect(eventEmitter.listenerCount("element:change")).toBe(1)
		})

		vi.useFakeTimers()
		act(() => {
			eventEmitter.emit({
				type: "element:change",
				data: { elementIds: ["runtime-result"], phase: "commit" },
			})
			vi.advanceTimersByTime(121)
		})

		expect(elementManager.exportDocumentPatch).not.toHaveBeenCalled()
		expect(onPatch).not.toHaveBeenCalled()
	})

	it("exports the full document when a history restore changes connections", async () => {
		const { canvas, eventEmitter } = createCanvasStub()
		const onChange = vi.fn()

		render(
			<CanvasProvider>
				<TestListener canvas={canvas} onPatch={vi.fn()} onChange={onChange} />
			</CanvasProvider>,
		)

		await waitFor(() => {
			expect(eventEmitter.listenerCount("document:restored")).toBe(1)
		})

		vi.useFakeTimers()
		act(() => {
			eventEmitter.emit({ type: "document:restored", data: undefined })
			vi.advanceTimersByTime(121)
		})

		expect(onChange).toHaveBeenCalledWith(
			{ elements: [], connections: [connection] },
			expect.objectContaining({ source: "document:restored" }),
		)
	})
})
