import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { editActions } from "../editActions"

function getDeleteAction() {
	const action = editActions.find((item) => item.id === "edit.delete")
	if (!action) {
		throw new Error("Expected edit.delete action")
	}
	return action
}

describe("editActions", () => {
	it("blocks PNG copy while a selected media element is replacing", async () => {
		const action = editActions.find((item) => item.id === "edit.copy-png")
		if (!action) throw new Error("Expected edit.copy-png action")
		const copyElementsAsPNG = vi.fn()
		const canvas = {
			selectionManager: { getSelectedIds: vi.fn(() => ["image-1"]) },
			elementManager: {
				getElementData: vi.fn(() => ({
					id: "image-1",
					type: "image",
					contents: [{ contentId: "image-content", src: "images/image.png" }],
					activeContentId: "image-content",
					mainContentId: "image-content",
				})),
			},
			mediaReplaceController: { isReplacing: vi.fn(() => true) },
			clipboardManager: { copyElementsAsPNG },
		} as unknown as Canvas

		expect(action.canExecute(canvas)).toBe(false)
		await action.execute(canvas)
		expect(copyElementsAsPNG).not.toHaveBeenCalled()
	})

	it("executes delete through the unified canvas selection deletion API", () => {
		const action = getDeleteAction()
		const canvas = {
			readonly: false,
			connectionManager: {
				hasSelectedConnection: vi.fn(() => true),
			},
			selectionManager: {
				getSelectedIds: vi.fn(() => []),
			},
			elementManager: {
				getElementData: vi.fn(),
			},
			permissionManager: {
				canDelete: vi.fn(),
			},
			deleteSelection: vi.fn(),
			deleteSelectedElements: vi.fn(),
		} as unknown as Canvas

		expect(action.canExecute(canvas)).toBe(true)
		action.execute(canvas)

		expect(canvas.deleteSelection).toHaveBeenCalledTimes(1)
		expect(canvas.deleteSelectedElements).not.toHaveBeenCalled()
	})
})
