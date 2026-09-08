import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ROTATE_HANDLE_WRAPPER_TOP } from "../../utils/rotateHandleLayout"
import { SelectionBox } from "../SelectionBox"

const rect = { top: 40, left: 40, width: 160, height: 80 }

function renderSelectionBox() {
	render(
		<SelectionBox
			transformedRect={rect}
			viewportRect={rect}
			isMultiSelect={false}
			isSelectionMode
			transform={undefined}
			containerElement={null}
			isMoving={false}
			rotation={0}
			resizeHandles={[]}
			onMoveHandleMouseDown={vi.fn()}
			onRotateHandleMouseDown={vi.fn()}
			onResizeHandleMouseDown={vi.fn()}
			onDelete={vi.fn()}
			onDuplicate={vi.fn()}
		/>,
	)
}

describe("SelectionBox", () => {
	it("uses a hairline frame with drafting corner marks", () => {
		renderSelectionBox()

		const box = screen.getByTestId("html-editor-selection-box")
		expect(box.className).toContain("outline")
		expect(box.className).toContain("outline-[#808080]")
		expect(box.className).not.toContain("outline-offset-1")
		expect(box.className).not.toContain("border-2")
		expect(box.className).not.toMatch(/(?:^|\s)border(?:\s|$)/)
		expect(box.style.boxShadow).toBe("")
		const marks = screen.getAllByTestId("html-editor-selection-mark")
		expect(marks.map((mark) => mark.getAttribute("data-mark-id"))).toEqual(["tr", "bl", "br"])
		expect(marks[0].className).toContain("border-r-[2px]")
		expect(marks[0].className).toContain("h-3")
	})

	it("keeps the rotate stem above the selection edge", () => {
		renderSelectionBox()

		const handle = screen.getByTestId("on-rotate-handle-mouse-down")
		const wrapper = handle.parentElement
		if (!wrapper) throw new Error("rotate handle wrapper was not rendered")

		expect(wrapper).toHaveStyle({ top: `${ROTATE_HANDLE_WRAPPER_TOP}px` })
	})
})
