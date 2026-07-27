import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../../runtime/core/Canvas"
import type { CanvasDesignStorageData } from "../../../../public/magic-types"

const mocks = vi.hoisted(() => ({
	useCanvas: vi.fn(),
	resolveLinkedEditorInputs: vi.fn(),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: mocks.useCanvas,
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useCanvasEvent: vi.fn(),
}))

vi.mock("../linkedEditorInputs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../linkedEditorInputs")>()
	return {
		...actual,
		resolveLinkedEditorInputs: mocks.resolveLinkedEditorInputs,
	}
})

import { useLinkedEditorInputs } from "../useLinkedEditorInputs"

function createCanvas(initialStorage: CanvasDesignStorageData): {
	canvas: Canvas
	getStorage: () => CanvasDesignStorageData
} {
	let storage = initialStorage
	const canvas = {
		magicConfigManager: {
			config: {
				methods: {
					getStorage: () => storage,
					saveStorage: (nextStorage: CanvasDesignStorageData) => {
						storage = nextStorage
					},
				},
			},
		},
		connectionManager: {
			removeConnection: vi.fn(),
		},
	} as unknown as Canvas
	return { canvas, getStorage: () => storage }
}

describe("useLinkedEditorInputs draft persistence", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("hydrates selections and text order, then persists user changes", async () => {
		const targetElementId = "target-image"
		const { canvas, getStorage } = createCanvas({
			tempLinkedEditorDrafts: {
				[targetElementId]: {
					version: 1,
					selectedTextConnectionIds: ["text-1"],
					orderedTextConnectionIds: ["text-2", "text-1"],
					selectedMediaConnectionIds: ["media-1"],
				},
			},
		})
		mocks.useCanvas.mockReturnValue({ canvas })
		mocks.resolveLinkedEditorInputs.mockReturnValue({
			textConnections: [
				{ connectionId: "text-1", sourceElementId: "source-text-1", text: "first" },
				{ connectionId: "text-2", sourceElementId: "source-text-2", text: "second" },
			],
			textPrompt: "",
			mediaItems: [
				{
					connectionId: "media-1",
					sourceElementId: "source-image-1",
					kind: "image",
					path: "./images/source.png",
					status: "inactive",
				},
			],
			activeMediaReferences: [],
		})

		const { result } = renderHook(() =>
			useLinkedEditorInputs({
				targetElementId,
				targetKind: "image",
				mediaPolicy: { supportedKinds: ["image"] },
			}),
		)

		await waitFor(() => {
			expect(result.current.textConnections.map((item) => item.connectionId)).toEqual([
				"text-2",
				"text-1",
			])
			expect(result.current.isTextConnectionSelected("text-1")).toBe(true)
			expect(result.current.mediaItems[0]?.selected).toBe(true)
		})

		act(() => {
			result.current.setTextConnectionSelected("text-2", true)
			result.current.setMediaConnectionSelected("media-1", false)
		})

		await waitFor(() => {
			expect(getStorage().tempLinkedEditorDrafts?.[targetElementId]).toEqual({
				version: 1,
				selectedTextConnectionIds: ["text-1", "text-2"],
				orderedTextConnectionIds: ["text-2", "text-1"],
				selectedMediaConnectionIds: [],
			})
		})
	})
})
