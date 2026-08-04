import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { EventEmitter } from "../../../core/EventEmitter"
import type { LayerElement } from "../../../document/types"
import { HistoryManager } from "../HistoryManager"

function createHistoryManager() {
	const eventEmitter = new EventEmitter()
	const exportDocument = vi.fn(() => ({ elements: [] }))
	const getTemporaryElementMetadata = vi.fn((elementId: string) =>
		elementId === "runtime-result"
			? {
					kind: "generation-result" as const,
					historyPolicy: "exclude" as const,
					clipboardPolicy: "exclude" as const,
				}
			: null,
	)
	const canvas = {
		eventEmitter,
		exportDocument,
		elementManager: { getTemporaryElementMetadata },
		canvasFileUploadManager: {
			getPendingUndoCount: () => 0,
			cancelLatestPendingUpload: () => false,
		},
		userActionRegistry: { execute: vi.fn() },
	} as unknown as Canvas

	return {
		manager: new HistoryManager({ canvas }),
		eventEmitter,
		exportDocument,
	}
}

function createUpdatedEventData(elementId: string) {
	const data = {
		id: elementId,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
	} as LayerElement
	return { elementId, data, previousData: data }
}

describe("HistoryManager runtime-only generation elements", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("does not record runtime-only deletions", () => {
		const { eventEmitter, exportDocument } = createHistoryManager()

		eventEmitter.emit({
			type: "element:deleted",
			data: { elementId: "runtime-result", persistence: "runtime-only" },
		})

		expect(exportDocument).not.toHaveBeenCalled()
	})

	it("does not debounce history for updates to excluded generation placeholders", () => {
		vi.useFakeTimers()
		const { manager, eventEmitter, exportDocument } = createHistoryManager()

		eventEmitter.emit({
			type: "element:updated",
			data: createUpdatedEventData("runtime-result"),
		})
		vi.advanceTimersByTime(301)

		expect(manager.getSnapshot().pendingDebounce).toBe(false)
		expect(exportDocument).not.toHaveBeenCalled()
	})
})
