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
