import { describe, expect, it } from "vitest"
import type { Canvas } from "../../../../runtime/core/Canvas"
import type {
	CanvasDesignStorageData,
	StoredLinkedEditorDraft,
} from "../../../../public/magic-types"
import {
	createEmptyLinkedEditorDraft,
	getLinkedEditorDraftFromStorage,
	normalizeLinkedEditorDraft,
	reconcileLinkedEditorDraft,
	saveLinkedEditorDraftToStorage,
} from "../linkedEditorDraft"

function createStorageCanvas(initialStorage: CanvasDesignStorageData = {}): {
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
	} as unknown as Canvas
	return { canvas, getStorage: () => storage }
}

describe("reconcileLinkedEditorDraft", () => {
	it("restores valid selections, prunes deleted connections, and appends new text connections", () => {
		const draft: StoredLinkedEditorDraft = {
			version: 2,
			selectedTextConnectionIds: ["text-deleted", "text-kept"],
			orderedTextConnectionIds: ["text-deleted", "text-second", "text-kept"],
		}

		expect(
			reconcileLinkedEditorDraft(draft, {
				textConnectionIds: ["text-kept", "text-new", "text-second"],
			}),
		).toEqual({
			version: 2,
			selectedTextConnectionIds: ["text-kept"],
			orderedTextConnectionIds: ["text-second", "text-kept", "text-new"],
		})
	})
})

describe("linked editor draft storage", () => {
	it("migrates a v1 draft to v2 and ignores media selection IDs", () => {
		expect(
			normalizeLinkedEditorDraft({
				version: 1,
				selectedTextConnectionIds: ["text-1"],
				orderedTextConnectionIds: ["text-1"],
				selectedMediaConnectionIds: ["media-1"],
			}),
		).toEqual({
			version: 2,
			selectedTextConnectionIds: ["text-1"],
			orderedTextConnectionIds: ["text-1"],
		})
	})

	it("round-trips a target editor draft and removes an empty draft", () => {
		const { canvas, getStorage } = createStorageCanvas()
		const draft: StoredLinkedEditorDraft = {
			version: 2,
			selectedTextConnectionIds: ["text-1"],
			orderedTextConnectionIds: ["text-1"],
		}

		saveLinkedEditorDraftToStorage(canvas, "target-1", draft)
		expect(getLinkedEditorDraftFromStorage(canvas, "target-1")).toEqual(draft)

		saveLinkedEditorDraftToStorage(canvas, "target-1", createEmptyLinkedEditorDraft())
		expect(getStorage().tempLinkedEditorDrafts?.["target-1"]).toBeUndefined()
	})
})
